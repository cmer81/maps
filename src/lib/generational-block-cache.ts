import type { BlockCache, BlockFetch } from '@openmeteo/file-reader';

/**
 * Cache de blocs OMfile persistant (Cache API), à éviction par **générations**.
 *
 * Remplace `BrowserBlockCache` (`@openmeteo/file-reader` 0.0.20), dont l'éviction
 * relance après CHAQUE `put` un scan complet (`cache.keys()` + un `match()` par
 * entrée). Coût O(n) par écriture, et Chrome refuse `keys()` au-delà de ~10–20 k
 * entrées (« Operation too large ») : vers 1 Go de blocs de 64 Ko, l'éviction
 * échoue indéfiniment, chaque écriture relance le scan et sature le backend du
 * Cache API — les lectures attendent derrière, la carte ne charge plus.
 *
 * Ici aucune opération ne dépend du nombre d'entrées :
 *   - les blocs vont dans `<prefix>-<n>` (génération courante) ; un compteur
 *     (octets + entrées) en `localStorage` décide de la rotation ;
 *   - une génération est plafonnée en octets (`maxBytes / generations`) ET en
 *     entrées (`maxEntriesPerGeneration`, large marge sous la limite de Chrome) ;
 *   - l'éviction supprime la génération la plus ancienne d'un `caches.delete()`.
 *
 * FIFO grossier plutôt que LRU : adapté à des prévisions qui se périment d'elles-
 * mêmes. Rotation sérialisée entre onglets via Web Locks quand disponible ; un
 * compteur faux (onglets concurrents, `localStorage` vidé) ne peut que décaler
 * la rotation, jamais bloquer le cache.
 */

export const LEGACY_CACHE_NAMES = ['open-meteo-maps-cache-v1'];

/** Chrome échoue entre 10 000 et 20 000 entrées sur `Cache.keys()` ; on n'en
 *  appelle plus, mais on garde chaque génération très en dessous par prudence. */
export const MAX_ENTRIES_PER_GENERATION = 4000;

const URL_PREFIX = 'https://omfiles.local/cache/';

interface GenerationState {
	current: number;
	bytes: number;
	entries: number;
}

interface LockManagerLike {
	request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface GenerationalBlockCacheOptions {
	blockSize?: number;
	/** Préfixe des noms de caches (`<prefix>-<n>`) et de la clé d'état. */
	prefix?: string;
	/** Budget total, réparti à parts égales entre les générations conservées. */
	maxBytes?: number;
	/** Nombre de générations conservées (courante incluse). */
	generations?: number;
	maxEntriesPerGeneration?: number;
	memCacheTtlMs?: number;
	maxConcurrentFetches?: number;
	/** Anciens caches supprimés à l'initialisation. */
	legacyCacheNames?: string[];
	// Injection pour les tests.
	cacheStorage?: CacheStorage;
	storage?: StorageLike;
	locks?: LockManagerLike;
}

const abortError = () => new DOMException('The operation was aborted', 'AbortError');

function throwIfAborted(signal?: AbortSignal) {
	if (signal?.aborted) throw signal.reason ?? abortError();
}

function isQuotaError(err: unknown): boolean {
	return err instanceof DOMException && err.name === 'QuotaExceededError';
}

interface InflightEntry {
	controller: AbortController;
	waiting: number;
	promise: Promise<Uint8Array>;
}

export class GenerationalBlockCache implements BlockCache<string> {
	readonly keyKind = 'string';

	private readonly _blockSize: number;
	private readonly prefix: string;
	private readonly maxBytes: number;
	private readonly generations: number;
	private readonly maxEntriesPerGeneration: number;
	private readonly memCacheTtlMs: number;
	private readonly maxConcurrentFetches: number;
	private readonly legacyCacheNames: string[];
	private readonly cacheStorage: CacheStorage;
	private readonly storage: StorageLike | undefined;
	private readonly locks: LockManagerLike | undefined;

	private readonly memCache = new Map<string, Uint8Array>();
	private readonly evictionTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly inflight = new Map<string, InflightEntry>();
	private activeFetches = 0;
	private readonly fetchQueue: (() => void)[] = [];
	private ready: Promise<void> | null = null;
	/** Repli si `localStorage` est indisponible (navigation privée stricte…). */
	private memoryState: GenerationState | null = null;

	constructor(options: GenerationalBlockCacheOptions = {}) {
		const cacheStorage = options.cacheStorage ?? globalThis.caches;
		if (!cacheStorage) {
			throw new Error('GenerationalBlockCache requiert le Cache API (navigateur uniquement).');
		}
		this.cacheStorage = cacheStorage;
		this._blockSize = options.blockSize ?? 64 * 1024;
		this.prefix = options.prefix ?? 'om-blocks';
		this.maxBytes = options.maxBytes ?? 1024 * 1024 * 1024;
		this.generations = Math.max(2, options.generations ?? 4);
		this.maxEntriesPerGeneration = options.maxEntriesPerGeneration ?? MAX_ENTRIES_PER_GENERATION;
		this.memCacheTtlMs = options.memCacheTtlMs ?? 1000;
		this.maxConcurrentFetches = options.maxConcurrentFetches ?? 10;
		this.legacyCacheNames = options.legacyCacheNames ?? LEGACY_CACHE_NAMES;
		this.storage = options.storage ?? safeLocalStorage();
		this.locks = options.locks ?? (globalThis.navigator?.locks as LockManagerLike | undefined);
	}

	blockSize(): number {
		return this._blockSize;
	}

	async size(key: string): Promise<number | undefined> {
		const cached = await this.match(this.resolveUrl(key));
		const fileSize = cached?.headers.get('X-Om-File-Size');
		return fileSize ? parseInt(fileSize, 10) : undefined;
	}

	async get(
		key: string,
		fetchFn: BlockFetch,
		fileSize?: number,
		signal?: AbortSignal
	): Promise<Uint8Array> {
		throwIfAborted(signal);
		const url = this.resolveUrl(key);
		const memCached = this.memCache.get(url);
		if (memCached) {
			this.refreshEvictionTimer(url);
			return memCached;
		}
		return this.joinInflight(
			url,
			async (fetchSignal) => {
				const cached = await this.match(url);
				if (cached) {
					const data = new Uint8Array(await cached.arrayBuffer());
					this.setMemCache(url, data);
					return data;
				}
				throwIfAborted(fetchSignal);
				const data = await this.limitedFetch(fetchFn, fetchSignal);
				this.setMemCache(url, data);
				// Écriture persistante en tâche de fond : ne retarde jamais la lecture.
				void this.store(key, url, data, fileSize);
				return data;
			},
			signal
		);
	}

	async prefetch(
		key: string,
		fetchFn: BlockFetch,
		fileSize?: number,
		signal?: AbortSignal
	): Promise<void> {
		await this.get(key, fetchFn, fileSize, signal).catch(() => {
			// erreurs de préchargement ignorées
		});
	}

	async clear(): Promise<void> {
		for (const timer of this.evictionTimers.values()) clearTimeout(timer);
		this.evictionTimers.clear();
		this.memCache.clear();
		this.inflight.clear();
		const names = await this.cacheStorage.keys();
		await Promise.all(
			names.filter((n) => this.generationOf(n) !== null).map((n) => this.cacheStorage.delete(n))
		);
		this.writeState({ current: this.readState()?.current ?? 0, bytes: 0, entries: 0 });
	}

	// --- générations ------------------------------------------------------

	private cacheName(generation: number): string {
		return `${this.prefix}-${generation}`;
	}

	private generationOf(name: string): number | null {
		const match = name.match(/^(.*)-(\d+)$/);
		return match && match[1] === this.prefix ? Number(match[2]) : null;
	}

	/** Une fois par instance : supprime les caches hérités et les générations
	 *  périmées. `CacheStorage.keys()` liste des NOMS de caches, pas des entrées. */
	private init(): Promise<void> {
		this.ready ??= (async () => {
			try {
				const names = await this.cacheStorage.keys();
				await Promise.all(
					names
						.filter((n) => this.legacyCacheNames.includes(n))
						.map((n) => this.cacheStorage.delete(n))
				);
				const existing = names
					.map((n) => this.generationOf(n))
					.filter((g): g is number => g !== null);
				let state = this.readState();
				if (!state) {
					// État perdu : on repart sur une génération neuve, les anciennes
					// restent lisibles et finiront évincées.
					const max = existing.length ? Math.max(...existing) : -1;
					state = { current: max + 1, bytes: 0, entries: 0 };
					this.writeState(state);
				}
				await this.prune(state.current, existing);
			} catch (err) {
				console.warn('[block-cache] initialisation incomplète', err);
			}
		})();
		return this.ready;
	}

	private async prune(current: number, existing?: number[]): Promise<void> {
		const generations =
			existing ??
			(await this.cacheStorage.keys())
				.map((n) => this.generationOf(n))
				.filter((g): g is number => g !== null);
		const oldestKept = current - this.generations + 1;
		await Promise.all(
			generations
				.filter((g) => g < oldestKept || g > current)
				.map((g) => this.cacheStorage.delete(this.cacheName(g)))
		);
	}

	private async match(url: string): Promise<Response | undefined> {
		await this.init();
		// Recherche dans tous les caches de l'origine : uniquement nos générations
		// (les caches hérités ont été supprimés par init()).
		return this.cacheStorage.match(url);
	}

	private async store(key: string, url: string, data: Uint8Array, fileSize?: number) {
		try {
			await this.init();
			const generation = this.readState()?.current ?? 0;
			const cache = await this.cacheStorage.open(this.cacheName(generation));
			const headers: Record<string, string> = {
				'Content-Type': 'application/octet-stream',
				'Content-Length': data.length.toString(),
				'X-Om-Block-Key': key,
				'X-Om-Created-At': Date.now().toString()
			};
			if (fileSize !== undefined) headers['X-Om-File-Size'] = fileSize.toString();
			const body = data.buffer.slice(
				data.byteOffset,
				data.byteOffset + data.byteLength
			) as ArrayBuffer;
			await cache.put(url, new Response(body, { status: 200, headers }));
			await this.account(data.length);
		} catch (err) {
			if (isQuotaError(err)) {
				// Disque plein : on libère la plus vieille génération ; le bloc sera
				// simplement re-téléchargé au besoin.
				await this.rotate(true).catch(() => {});
			} else {
				console.warn('[block-cache] écriture impossible', err);
			}
		}
	}

	private async account(bytes: number): Promise<void> {
		await this.withLock(async () => {
			const state = this.readState() ?? { current: 0, bytes: 0, entries: 0 };
			state.bytes += bytes;
			state.entries += 1;
			this.writeState(state);
		});
		const state = this.readState();
		if (
			state &&
			(state.bytes >= this.maxBytes / this.generations ||
				state.entries >= this.maxEntriesPerGeneration)
		) {
			await this.rotate(false);
		}
	}

	/** Ouvre une nouvelle génération et supprime celles qui sortent de la fenêtre.
	 *  `dropOldest` : en plus, libère la plus ancienne génération encore conservée. */
	private async rotate(dropOldest: boolean): Promise<void> {
		await this.withLock(async () => {
			const state = this.readState() ?? { current: 0, bytes: 0, entries: 0 };
			// Re-vérifié sous verrou : un autre onglet a pu tourner entre-temps.
			const full =
				state.bytes >= this.maxBytes / this.generations ||
				state.entries >= this.maxEntriesPerGeneration;
			if (!full && !dropOldest) return;
			const next = { current: state.current + 1, bytes: 0, entries: 0 };
			this.writeState(next);
			await this.prune(next.current);
			if (dropOldest) {
				await this.cacheStorage.delete(this.cacheName(next.current - this.generations + 1));
			}
		});
	}

	private async withLock<T>(fn: () => Promise<T>): Promise<T> {
		if (!this.locks) return fn();
		return this.locks.request(`${this.prefix}:state`, fn);
	}

	private stateKey(): string {
		return `${this.prefix}:state`;
	}

	private readState(): GenerationState | null {
		if (!this.storage) return this.memoryState;
		try {
			const raw = this.storage.getItem(this.stateKey());
			if (!raw) return null;
			const parsed = JSON.parse(raw) as Partial<GenerationState>;
			if (
				!Number.isInteger(parsed.current) ||
				typeof parsed.bytes !== 'number' ||
				typeof parsed.entries !== 'number'
			) {
				return null;
			}
			return parsed as GenerationState;
		} catch {
			return null;
		}
	}

	private writeState(state: GenerationState): void {
		if (!this.storage) {
			this.memoryState = state;
			return;
		}
		try {
			this.storage.setItem(this.stateKey(), JSON.stringify(state));
		} catch {
			this.memoryState = state;
		}
	}

	// --- mémoire, déduplication, concurrence -------------------------------

	private resolveUrl(key: string): string {
		return `${URL_PREFIX}${encodeURIComponent(key)}`;
	}

	private refreshEvictionTimer(url: string) {
		const existing = this.evictionTimers.get(url);
		if (existing) clearTimeout(existing);
		this.evictionTimers.set(
			url,
			setTimeout(() => {
				this.memCache.delete(url);
				this.evictionTimers.delete(url);
			}, this.memCacheTtlMs)
		);
	}

	private setMemCache(url: string, data: Uint8Array) {
		this.memCache.set(url, data);
		this.refreshEvictionTimer(url);
	}

	private async limitedFetch(fetchFn: BlockFetch, signal: AbortSignal): Promise<Uint8Array> {
		if (this.activeFetches < this.maxConcurrentFetches) {
			this.activeFetches++;
		} else {
			// Le créneau est transmis tel quel par releaseFetchSlot().
			await new Promise<void>((resolve) => this.fetchQueue.push(resolve));
		}
		try {
			throwIfAborted(signal);
			return await fetchFn(signal);
		} finally {
			const next = this.fetchQueue.shift();
			if (next) next();
			else this.activeFetches--;
		}
	}

	/**
	 * Partage une lecture entre appelants ; ne l'annule que lorsque plus aucun
	 * appelant ne l'attend (même contrat que le cache de `file-reader`).
	 */
	private async joinInflight(
		url: string,
		fetchFn: (signal: AbortSignal) => Promise<Uint8Array>,
		signal?: AbortSignal
	): Promise<Uint8Array> {
		let entry = this.inflight.get(url);
		if (!entry) {
			const controller = new AbortController();
			const fresh: InflightEntry = { controller, waiting: 0, promise: fetchFn(controller.signal) };
			const forget = () => {
				if (this.inflight.get(url) === fresh) this.inflight.delete(url);
			};
			void fresh.promise.then(forget, forget);
			this.inflight.set(url, fresh);
			entry = fresh;
		}
		const joined = entry;
		joined.waiting += 1;
		const release = () => {
			joined.waiting -= 1;
			if (joined.waiting > 0 || this.inflight.get(url) !== joined) return;
			this.inflight.delete(url);
			joined.controller.abort();
		};
		if (!signal) {
			try {
				return await joined.promise;
			} finally {
				release();
			}
		}
		let onAbort: () => void = () => {};
		const abortedByCaller = new Promise<void>((resolve) => {
			onAbort = () => resolve();
			signal.addEventListener('abort', onAbort, { once: true });
		});
		try {
			await Promise.race([joined.promise, abortedByCaller]);
			throwIfAborted(signal);
			return await joined.promise;
		} finally {
			signal.removeEventListener('abort', onAbort);
			release();
		}
	}
}

function safeLocalStorage(): StorageLike | undefined {
	try {
		return globalThis.localStorage ?? undefined;
	} catch {
		return undefined;
	}
}
