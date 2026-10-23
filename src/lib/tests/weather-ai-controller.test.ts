import { get } from 'svelte/store';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	weatherAiCones,
	weatherAiLayers,
	weatherAiRun,
	weatherAiStatus
} from '$lib/stores/weather-ai';

import { getWeatherAiApiUrl } from '$lib/runtime-env';
import { type Catalog, dataUrl } from '$lib/weather-ai/api';
import { CONES_PRODUCT_ID } from '$lib/weather-ai/cones';
import { conesOffered, refresh, useWeatherAi } from '$lib/weather-ai/controller';
import { pruneCache } from '$lib/weather-ai/loader';

import {
	EXISTENCE_ID,
	INIT_TIME,
	MSLP_ID,
	RUN_ID,
	TRACKS_ID,
	VALID_TIMES,
	catalog,
	conesDoc,
	conesEntry,
	data,
	gridDoc,
	runs,
	timeline,
	trackPoint,
	tracksDoc
} from './weather-ai-fixtures';

const BASE = getWeatherAiApiUrl();

/**
 * Faux portail : `gate` retient la réponse de /runs pour figer prepareRun.
 * `routes` est renvoyé et modifiable (catalogue relu, cônes apparus en cours de run).
 */
function stubPortal(
	gate: Promise<void>,
	productIds = [MSLP_ID, EXISTENCE_ID, TRACKS_ID],
	over: { cones?: Catalog['cones']; routes?: Record<string, unknown> } = {}
) {
	const routes: Record<string, unknown> = {
		[`${BASE}/products`]: catalog(productIds, { cones: over.cones ?? null }),
		[`${BASE}/runs`]: runs(),
		[`${BASE}/products/${MSLP_ID}/timeline`]: timeline(MSLP_ID),
		[`${BASE}/products/${TRACKS_ID}/timeline`]: timeline(TRACKS_ID),
		...Object.fromEntries(
			VALID_TIMES.flatMap((vt) => [
				[dataUrl(BASE, MSLP_ID, vt), data(gridDoc(MSLP_ID, vt, () => 101_300))],
				[dataUrl(BASE, TRACKS_ID, vt), data(tracksDoc(vt, [trackPoint({ valid_time: vt })]))]
			])
		),
		...over.routes
	};
	const calls: string[] = [];
	vi.stubGlobal('fetch', async (url: string) => {
		calls.push(url);
		if (url === `${BASE}/runs`) await gate;
		if (!(url in routes)) return new Response('{"title":"Not Found"}', { status: 404 });
		return new Response(JSON.stringify(routes[url]), { status: 200 });
	});
	return Object.assign(calls, { routes });
}

const CONES_DATA = dataUrl(BASE, CONES_PRODUCT_ID, INIT_TIME);

const until = async (cond: () => boolean, ms = 2000) => {
	const t0 = Date.now();
	while (!cond()) {
		if (Date.now() - t0 > ms) throw new Error('délai dépassé');
		await new Promise((r) => setTimeout(r, 5));
	}
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	weatherAiRun.set(undefined);
	weatherAiCones.set(null);
	weatherAiLayers.set({ tracks: false, cones: false });
	pruneCache([]);
});

describe('controller', () => {
	it('ne charge jamais les champs continus (pression, probabilité) : seules les superpositions', async () => {
		const calls = stubPortal(Promise.resolve());
		weatherAiLayers.set({ tracks: true, cones: false });
		const release = useWeatherAi();
		try {
			await until(() => !!get(weatherAiRun)?.loaded[TRACKS_ID]);
			const run = get(weatherAiRun)!;
			expect(Object.keys(run.loaded)).toEqual([TRACKS_ID]);
			expect(calls.some((u) => u.includes(MSLP_ID) || u.includes(EXISTENCE_ID))).toBe(false);
			// Les produits restent connus (futur modèle du sélecteur), sans être chargés.
			expect(run.available.map((p) => p.productId)).toContain(MSLP_ID);
		} finally {
			release();
		}
	});

	it('réconcilie une superposition activée pendant la préparation du run (cônes)', async () => {
		let open!: () => void;
		const gate = new Promise<void>((r) => (open = r));
		const calls = stubPortal(gate, [TRACKS_ID], {
			cones: conesEntry(),
			routes: { [CONES_DATA]: data(conesDoc()) }
		});
		weatherAiLayers.set({ tracks: true, cones: false });
		const release = useWeatherAi();
		try {
			await until(() => calls.includes(`${BASE}/runs`)); // prepareRun en vol
			weatherAiLayers.update((l) => ({ ...l, cones: true })); // activée pendant la préparation
			open();
			// Sans la réconciliation, rien ne se passerait avant le prochain relevé (5 min).
			await until(() => !!get(weatherAiCones)?.doc);
			expect(get(weatherAiCones)?.runId).toBe(RUN_ID);
			expect(calls).toContain(CONES_DATA); // document unique, daté de l'amorce
		} finally {
			release();
		}
	});

	describe('cônes servis par le portail (champ `cones` du catalogue)', () => {
		it('flag par défaut : cônes proposés, chargés et validés pour le run affiché', async () => {
			const calls = stubPortal(Promise.resolve(), [TRACKS_ID], {
				cones: conesEntry(),
				routes: { [CONES_DATA]: data(conesDoc()) }
			});
			weatherAiLayers.set({ tracks: true, cones: true });
			const release = useWeatherAi();
			try {
				await until(() => !!get(weatherAiCones)?.doc);
				expect(conesOffered(get(weatherAiRun))).toBe(true);
				expect(get(weatherAiCones)?.doc?.run_id).toBe(RUN_ID);
				expect(get(weatherAiCones)?.message).toBeUndefined();
				// Aucune lecture des cônes par la boucle des grilles (pas de /timeline).
				expect(calls.some((u) => u.includes(`${CONES_PRODUCT_ID}/timeline`))).toBe(false);
			} finally {
				release();
			}
		});

		it('`cones: null` (run sans cônes, ou pas encore) : non proposés, aucune requête, aucune erreur', async () => {
			const calls = stubPortal(Promise.resolve(), [TRACKS_ID]);
			weatherAiLayers.set({ tracks: true, cones: true });
			const release = useWeatherAi();
			try {
				await until(() => !!get(weatherAiRun)?.loaded[TRACKS_ID]);
				await new Promise((r) => setTimeout(r, 20));
				expect(conesOffered(get(weatherAiRun))).toBe(false);
				expect(calls.some((u) => u.includes(CONES_PRODUCT_ID))).toBe(false);
				expect(get(weatherAiCones)).toBeNull();
				expect(get(weatherAiStatus).state).toBe('ready');
			} finally {
				release();
			}
		});

		it('entrée `cones` d’un autre run ou d’un autre snapshot : ignorée, jamais chargée', async () => {
			for (const cones of [
				conesEntry({ run_id: 'wn2-oper-20261017T180000Z-autre' }),
				conesEntry({ snapshot_id: 'wn2-input-set-sha256-autre' })
			]) {
				const calls = stubPortal(Promise.resolve(), [TRACKS_ID], { cones });
				weatherAiLayers.set({ tracks: true, cones: true });
				const release = useWeatherAi();
				try {
					await until(() => !!get(weatherAiRun)?.loaded[TRACKS_ID]);
					expect(conesOffered(get(weatherAiRun))).toBe(false);
					expect(calls.some((u) => u.includes(CONES_PRODUCT_ID))).toBe(false);
				} finally {
					release();
					weatherAiRun.set(undefined);
				}
			}
		});

		it('document d’un autre snapshot que le run affiché : refusé, aucun cône', async () => {
			stubPortal(Promise.resolve(), [TRACKS_ID], {
				cones: conesEntry(),
				routes: { [CONES_DATA]: data(conesDoc({ snapshot_id: 'wn2-input-set-sha256-autre' })) }
			});
			weatherAiLayers.set({ tracks: true, cones: true });
			const release = useWeatherAi();
			try {
				await until(() => get(weatherAiCones)?.runId === RUN_ID);
				expect(get(weatherAiCones)?.doc).toBeNull();
				expect(get(weatherAiCones)?.message).toMatch(/run différent/);
			} finally {
				release();
			}
		});

		it('cônes retirés entre catalogue et lecture (404) : aucun cône, pas d’erreur du run', async () => {
			stubPortal(Promise.resolve(), [TRACKS_ID], { cones: conesEntry() });
			weatherAiLayers.set({ tracks: true, cones: true });
			const release = useWeatherAi();
			try {
				await until(() => get(weatherAiCones)?.runId === RUN_ID);
				expect(get(weatherAiCones)?.doc).toBeNull();
				expect(get(weatherAiStatus).state).toBe('ready');
			} finally {
				release();
			}
		});

		it('cônes apparus en fin de cycle, même run : proposés et chargés au relevé suivant', async () => {
			const calls = stubPortal(Promise.resolve(), [TRACKS_ID]);
			weatherAiLayers.set({ tracks: true, cones: true });
			const release = useWeatherAi();
			try {
				await until(() => !!get(weatherAiRun)?.loaded[TRACKS_ID]);
				expect(conesOffered(get(weatherAiRun))).toBe(false);
				const before = get(weatherAiRun);
				// Le job cone-members a fini : le catalogue du même run annonce les cônes.
				calls.routes[`${BASE}/products`] = catalog([TRACKS_ID], { cones: conesEntry() });
				calls.routes[CONES_DATA] = data(conesDoc());
				await refresh();
				await until(() => !!get(weatherAiCones)?.doc);
				// Même run : les trajectoires chargées sont conservées, sans rechargement.
				expect(get(weatherAiRun)?.loaded).toBe(before?.loaded);
				expect(conesOffered(get(weatherAiRun))).toBe(true);
			} finally {
				release();
			}
		});

		it('cônes retirés du catalogue dans le même run : effacés', async () => {
			const calls = stubPortal(Promise.resolve(), [TRACKS_ID], {
				cones: conesEntry(),
				routes: { [CONES_DATA]: data(conesDoc()) }
			});
			weatherAiLayers.set({ tracks: true, cones: true });
			const release = useWeatherAi();
			try {
				await until(() => !!get(weatherAiCones)?.doc);
				calls.routes[`${BASE}/products`] = catalog([TRACKS_ID], { cones: null });
				await refresh();
				expect(conesOffered(get(weatherAiRun))).toBe(false);
				expect(get(weatherAiCones)).toBeNull();
			} finally {
				release();
			}
		});
	});

	it('garde un échec réseau propre : statut d’erreur explicite, aucun run inventé', async () => {
		vi.stubGlobal('fetch', async () => {
			throw new TypeError('Failed to fetch'); // ce que lève un navigateur bloqué (réseau, CORS)
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		weatherAiLayers.set({ tracks: true, cones: false });
		const release = useWeatherAi();
		try {
			await until(() => get(weatherAiStatus).state === 'error');
			expect(get(weatherAiStatus).message).toMatch(/injoignable/);
			expect(get(weatherAiRun)).toBeUndefined();
		} finally {
			release();
			warn.mockRestore();
		}
	});
});
