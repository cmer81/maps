import { describe, expect, it, vi } from 'vitest';

import { GenerationalBlockCache } from '$lib/generational-block-cache';

/** Cache API en mémoire. `keysCalls` vérifie qu'on ne scanne jamais un cache. */
class FakeCache {
	entries = new Map<string, Response>();
	keysCalls = 0;
	putError: unknown = null;
	async match(url: string) {
		return this.entries.get(url)?.clone();
	}
	async put(url: string, res: Response) {
		if (this.putError) throw this.putError;
		this.entries.set(url, res);
	}
	async keys() {
		this.keysCalls++;
		return [...this.entries.keys()];
	}
}

class FakeCacheStorage {
	caches = new Map<string, FakeCache>();
	async open(name: string) {
		let c = this.caches.get(name);
		if (!c) {
			c = new FakeCache();
			this.caches.set(name, c);
		}
		return c;
	}
	async delete(name: string) {
		return this.caches.delete(name);
	}
	async keys() {
		return [...this.caches.keys()];
	}
	async match(url: string) {
		for (const c of this.caches.values()) {
			const r = await c.match(url);
			if (r) return r;
		}
		return undefined;
	}
}

class FakeStorage {
	data = new Map<string, string>();
	getItem(k: string) {
		return this.data.get(k) ?? null;
	}
	setItem(k: string, v: string) {
		this.data.set(k, v);
	}
	removeItem(k: string) {
		this.data.delete(k);
	}
}

const block = (n: number) => new Uint8Array(n).fill(7);

function setup(opts: { maxBytes?: number; maxEntries?: number; generations?: number } = {}) {
	const cacheStorage = new FakeCacheStorage();
	const storage = new FakeStorage();
	const make = () =>
		new GenerationalBlockCache({
			cacheStorage: cacheStorage as unknown as CacheStorage,
			storage,
			locks: undefined,
			maxBytes: opts.maxBytes ?? 400,
			generations: opts.generations ?? 4,
			maxEntriesPerGeneration: opts.maxEntries ?? 1000,
			memCacheTtlMs: 0
		});
	return { cacheStorage, storage, cache: make(), make };
}

/** Laisse les écritures en tâche de fond se terminer. */
const flush = () => new Promise((r) => setTimeout(r, 0));

async function fill(cache: GenerationalBlockCache, keys: string[], size: number) {
	for (const k of keys) {
		await cache.get(k, async () => block(size));
		await flush();
	}
}

describe('GenerationalBlockCache', () => {
	it('sert un bloc depuis le cache persistant sans refaire le fetch', async () => {
		const { make } = setup();
		const first = make();
		const fetchFn = vi.fn(async () => block(10));
		await first.get('a', fetchFn, 1234);
		await flush();
		// Nouvelle instance (rechargement de page) : le bloc vient du Cache API.
		const second = make();
		const again = vi.fn(async () => block(10));
		expect(await second.get('a', again)).toEqual(block(10));
		expect(again).not.toHaveBeenCalled();
		expect(await second.size('a')).toBe(1234);
	});

	it('ouvre une nouvelle génération au-delà du budget en octets', async () => {
		const { cache, cacheStorage } = setup({ maxBytes: 400, generations: 4 });
		// Budget par génération : 100 octets → 2 blocs de 50 par génération.
		await fill(cache, ['a', 'b', 'c', 'd'], 50);
		expect([...cacheStorage.caches.keys()]).toEqual(['om-blocks-0', 'om-blocks-1']);
	});

	it('plafonne aussi le nombre d’entrées par génération', async () => {
		const { cache, cacheStorage } = setup({ maxBytes: 1e9, maxEntries: 3 });
		await fill(cache, ['a', 'b', 'c', 'd'], 1);
		expect(cacheStorage.caches.get('om-blocks-0')?.entries.size).toBe(3);
		expect(cacheStorage.caches.get('om-blocks-1')?.entries.size).toBe(1);
	});

	it('supprime la génération la plus ancienne et ne scanne jamais un cache', async () => {
		const { cache, cacheStorage } = setup({ maxBytes: 400, generations: 4 });
		await fill(
			cache,
			Array.from({ length: 12 }, (_, i) => `k${i}`),
			50
		);
		// 12 blocs, 2 par génération → générations 0..5 remplies, courante = 6 (pas
		// encore ouverte) ; fenêtre de 4 → 3..6.
		expect([...cacheStorage.caches.keys()].sort()).toEqual([
			'om-blocks-3',
			'om-blocks-4',
			'om-blocks-5'
		]);
		for (const c of cacheStorage.caches.values()) expect(c.keysCalls).toBe(0);
	});

	it('supprime l’ancien cache open-meteo-maps-cache-v1 à l’initialisation', async () => {
		const { cache, cacheStorage } = setup();
		const legacy = await cacheStorage.open('open-meteo-maps-cache-v1');
		await legacy.put('https://omfiles.local/cache/a', new Response(block(5)));
		const fetchFn = vi.fn(async () => block(5));
		await cache.get('a', fetchFn);
		expect(fetchFn).toHaveBeenCalledOnce();
		expect(cacheStorage.caches.has('open-meteo-maps-cache-v1')).toBe(false);
	});

	it('repart sur une génération neuve si l’état est perdu', async () => {
		const { cache, cacheStorage, storage, make } = setup({ maxBytes: 400 });
		await fill(cache, ['a', 'b', 'c'], 50);
		storage.data.clear();
		const fresh = make();
		await fill(fresh, ['z'], 1);
		expect(cacheStorage.caches.get('om-blocks-2')?.entries.size).toBe(1);
		// Les anciennes générations restent lisibles.
		const fetchFn = vi.fn(async () => block(50));
		await fresh.get('a', fetchFn);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('libère la plus ancienne génération quand le disque est plein', async () => {
		const { cache, cacheStorage } = setup({ maxBytes: 400, generations: 4 });
		await fill(cache, ['a', 'b', 'c', 'd', 'e', 'f'], 50); // 0, 1, 2 pleines ; courante = 3
		const current = await cacheStorage.open('om-blocks-3');
		current.putError = new DOMException('full', 'QuotaExceededError');
		const data = await cache.get('g', async () => block(50));
		await flush();
		await flush();
		// La lecture aboutit malgré tout ; on passe en génération 4 et la plus
		// ancienne conservée (1) est libérée en plus de celle sortie de la fenêtre (0).
		expect(data).toEqual(block(50));
		expect([...cacheStorage.caches.keys()].sort()).toEqual(['om-blocks-2', 'om-blocks-3']);
	});

	it('clear() supprime toutes les générations', async () => {
		const { cache, cacheStorage } = setup({ maxBytes: 400 });
		await fill(cache, ['a', 'b', 'c'], 50);
		await cache.clear();
		expect(cacheStorage.caches.size).toBe(0);
	});

	it('partage un fetch entre appelants et ne l’annule qu’au départ du dernier', async () => {
		const { cache } = setup();
		let fetchSignal: AbortSignal | undefined;
		let resolve!: (b: Uint8Array) => void;
		const fetchFn = vi.fn(
			(signal: AbortSignal) =>
				new Promise<Uint8Array>((r) => {
					fetchSignal = signal;
					resolve = r;
				})
		);
		const c1 = new AbortController();
		const c2 = new AbortController();
		const p1 = cache.get('a', fetchFn, undefined, c1.signal);
		const p2 = cache.get('a', fetchFn, undefined, c2.signal);
		await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
		c1.abort();
		await expect(p1).rejects.toThrow();
		expect(fetchSignal?.aborted).toBe(false);
		resolve(block(4));
		expect(await p2).toEqual(block(4));
		expect(fetchFn).toHaveBeenCalledOnce();
	});
});
