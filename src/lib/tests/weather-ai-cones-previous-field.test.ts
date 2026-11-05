// `cones_previous` du catalogue (chom-poc-data#270, weather-ai#337) : au premier
// chargement, pendant le calcul des cônes du run servi (`cones: null`), le slot
// « précédent » de maps#153 est amorcé avec les cônes du run servi juste avant.
import { get } from 'svelte/store';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { weatherAiCones, weatherAiLayers, weatherAiRun } from '$lib/stores/weather-ai';

import { getWeatherAiApiUrl } from '$lib/runtime-env';
import { type Catalog, type ConesPreviousCatalogEntry, dataUrl } from '$lib/weather-ai/api';
import {
	CONES_PRODUCT_ID,
	PREVIOUS_CONES_MAX_AGE_MS,
	previousConesEntry,
	previousConesNotice,
	seedPreviousCones
} from '$lib/weather-ai/cones';
import {
	conesOffered,
	forgetSessionCones,
	refresh,
	useWeatherAi
} from '$lib/weather-ai/controller';
import { displayedCones } from '$lib/weather-ai/displayed';
import { pruneCache, withCatalogCones } from '$lib/weather-ai/loader';
import { preparePlan } from '$lib/weather-ai/map-layers';

import {
	INIT_TIME,
	RUN_ID,
	SNAPSHOT_ID,
	TRACKS_ID,
	VALID_TIMES,
	catalog,
	conesDoc,
	conesEntry,
	data,
	runs,
	timeline,
	trackPoint,
	tracksDoc
} from './weather-ai-fixtures';

const BASE = getWeatherAiApiUrl();

// Run servi (06Z), dérivé des fixtures du run 18/10 00Z ; les cônes précédents sont ceux de 00Z.
const NEXT = { runId: 'wn2-oper-20261018T060000Z-next', snapshotId: 'wn2-snap-next' };
const NEXT_INIT = '2026-10-18T06:00:00Z';

const rerun = <T>(v: T): T =>
	JSON.parse(
		JSON.stringify(v)
			.replaceAll(RUN_ID, NEXT.runId)
			.replaceAll(SNAPSHOT_ID, NEXT.snapshotId)
			.replaceAll(`"init_time":"${INIT_TIME}"`, `"init_time":"${NEXT_INIT}"`)
	);

const previousField = (
	over: Partial<ConesPreviousCatalogEntry> = {}
): ConesPreviousCatalogEntry => ({ ...conesEntry(), init_time: INIT_TIME, ...over });

/** Catalogue du run 06Z, cônes en calcul, avec ou sans `cones_previous`. */
const nextCatalog = (over: Partial<Catalog> = {}): Catalog => ({
	...rerun(catalog([TRACKS_ID], { cones: null })),
	...over
});

describe('previousConesEntry : champ additif et optionnel', () => {
	it('champ absent ou null : rien à amorcer, catalogue toujours valide', () => {
		expect(previousConesEntry(nextCatalog())).toBeUndefined();
		expect(previousConesEntry(nextCatalog({ cones_previous: null }))).toBeUndefined();
	});

	it('champ présent : entrée du run des cônes, datée de leur amorce', () => {
		expect(previousConesEntry(nextCatalog({ cones_previous: previousField() }))).toEqual({
			runId: RUN_ID,
			snapshotId: SNAPSHOT_ID,
			validTime: INIT_TIME,
			initTime: INIT_TIME,
			sha256: 'c'.repeat(64),
			calibrationStatus: conesEntry().calibration_status,
			attribution: conesEntry().attribution,
			licenseNotice: conesEntry().license_notice
		});
	});

	it('ignoré si `cones` est présent, du même run, ou hors contrat', () => {
		const withCones = rerun(catalog([TRACKS_ID], { cones: conesEntry() }));
		expect(previousConesEntry({ ...withCones, cones_previous: previousField() })).toBeUndefined();
		const field = (over: Partial<ConesPreviousCatalogEntry>) =>
			previousConesEntry(nextCatalog({ cones_previous: previousField(over) }));
		expect(field({ run_id: NEXT.runId })).toBeUndefined();
		expect(field({ mention: 'autre' })).toBeUndefined();
		expect(field({ experimental: false as never })).toBeUndefined();
		expect(field({ init_time: undefined as never })).toBeUndefined();
		expect(field({ product_id: TRACKS_ID })).toBeUndefined();
	});

	it('relevé du même run : l’apparition du champ est détectée', () => {
		const run = {
			runId: NEXT.runId,
			snapshotId: NEXT.snapshotId,
			publishedAt: '',
			initTime: NEXT_INIT,
			available: [],
			ignored: [],
			loaded: {},
			conesAwaited: true
		};
		expect(withCatalogCones(run, nextCatalog())).toBe(run);
		const next = withCatalogCones(run, nextCatalog({ cones_previous: previousField() }));
		expect(next).not.toBe(run);
		expect(next.conesPrevious?.runId).toBe(RUN_ID);
	});
});

describe('seedPreviousCones : garde-fous', () => {
	const entry = previousConesEntry(nextCatalog({ cones_previous: previousField() }))!;
	const shown = { runId: NEXT.runId, initTime: NEXT_INIT };

	it('document conforme, amorce antérieure : slot précédent, jamais comme cônes du run', () => {
		const prev = seedPreviousCones(entry, conesDoc(), shown);
		expect(prev?.runId).toBe(RUN_ID);
		expect(prev?.seeded).toBe(true);
		expect(prev && previousConesNotice(prev)).toBe(
			'Cônes du run 18/10 00Z : ceux du run affiché sont en cours de calcul.'
		);
	});

	it('amorce non strictement antérieure, trop ancienne ou inconnue : rien', () => {
		expect(seedPreviousCones(entry, conesDoc(), { ...shown, initTime: INIT_TIME })).toBeNull();
		expect(
			seedPreviousCones(entry, conesDoc(), { ...shown, initTime: '2026-10-17T18:00:00Z' })
		).toBeNull();
		const tooLate = new Date(Date.parse(INIT_TIME) + PREVIOUS_CONES_MAX_AGE_MS + 1).toISOString();
		expect(seedPreviousCones(entry, conesDoc(), { ...shown, initTime: tooLate })).toBeNull();
		expect(seedPreviousCones(entry, conesDoc(), { ...shown, initTime: undefined })).toBeNull();
	});

	it('document d’un autre run, hors contrat ou absent : rien', () => {
		expect(seedPreviousCones(entry, rerun(conesDoc()), shown)).toBeNull();
		expect(seedPreviousCones(entry, conesDoc({ mention: 'autre' }), shown)).toBeNull();
		expect(seedPreviousCones(entry, conesDoc({ init_time: NEXT_INIT }), shown)).toBeNull();
		expect(seedPreviousCones(entry, null, shown)).toBeNull();
		expect(
			seedPreviousCones({ ...entry, calibrationStatus: 'autre' }, conesDoc(), shown)
		).toBeNull();
	});
});

function portal(conesPrevious: ConesPreviousCatalogEntry | null | undefined, serveDoc = true) {
	const routes: Record<string, unknown> = rerun({
		[`${BASE}/runs`]: runs(),
		[`${BASE}/products/${TRACKS_ID}/timeline`]: timeline(TRACKS_ID),
		...Object.fromEntries(
			VALID_TIMES.map((vt) => [
				dataUrl(BASE, TRACKS_ID, vt),
				data(tracksDoc(vt, [trackPoint({ valid_time: vt })]))
			])
		)
	});
	routes[`${BASE}/products`] =
		conesPrevious === undefined ? nextCatalog() : nextCatalog({ cones_previous: conesPrevious });
	if (serveDoc) routes[dataUrl(BASE, CONES_PRODUCT_ID, INIT_TIME)] = data(conesDoc());
	const fetchMock = vi.fn(async (url: string) =>
		url in routes
			? new Response(JSON.stringify(routes[url]), { status: 200 })
			: new Response('{"title":"Not Found"}', { status: 404 })
	);
	vi.stubGlobal('fetch', fetchMock);
	return {
		fetchMock,
		/** Les cônes du run servi sont publiés : `cones_previous` repasse à null. */
		publishNextCones() {
			delete routes[dataUrl(BASE, CONES_PRODUCT_ID, INIT_TIME)];
			routes[`${BASE}/products`] = {
				...rerun(
					catalog([TRACKS_ID], {
						cones: conesEntry({ valid_time: NEXT_INIT, sha256: 'd'.repeat(64) })
					})
				),
				cones_previous: null
			};
			routes[dataUrl(BASE, CONES_PRODUCT_ID, NEXT_INIT)] = data(rerun(conesDoc()));
		}
	};
}

const until = async (cond: () => boolean, ms = 2000) => {
	const t0 = Date.now();
	while (!cond()) {
		if (Date.now() - t0 > ms) throw new Error('délai dépassé');
		await new Promise((r) => setTimeout(r, 5));
	}
};

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('contrôleur : premier chargement pendant le calcul des cônes', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		weatherAiRun.set(undefined);
		weatherAiCones.set(null);
		weatherAiLayers.set({ tracks: false, cones: false });
		forgetSessionCones();
		pruneCache([]);
	});

	const start = async () => {
		weatherAiLayers.set({ tracks: true, cones: true });
		const release = useWeatherAi();
		await until(() => get(weatherAiRun)?.runId === NEXT.runId);
		await settle();
		return release;
	};

	it('champ absent : aucun cône, rien de proposé, aucune lecture des cônes', async () => {
		const p = portal(undefined);
		const release = await start();
		try {
			expect(get(weatherAiCones)).toBeNull();
			expect(conesOffered(get(weatherAiRun))).toBe(false);
			expect(p.fetchMock.mock.calls.some(([u]) => u.includes(CONES_PRODUCT_ID))).toBe(false);
		} finally {
			release();
		}
	});

	it('champ null : aucun cône, rien de proposé', async () => {
		portal(null);
		const release = await start();
		try {
			expect(get(weatherAiCones)).toBeNull();
			expect(conesOffered(get(weatherAiRun))).toBe(false);
		} finally {
			release();
		}
	});

	it('champ présent : slot précédent amorcé, puis remplacé par les cônes du run', async () => {
		const p = portal(previousField());
		const release = await start();
		try {
			await until(() => !!get(weatherAiCones)?.previous);
			const during = get(weatherAiCones)!;
			expect(during.runId).toBe(NEXT.runId);
			expect(during.doc).toBeNull();
			expect(during.previous?.runId).toBe(RUN_ID);
			expect(during.previous?.doc.init_time).toBe(INIT_TIME);
			expect(conesOffered(get(weatherAiRun))).toBe(true);

			// Même rendu que maps#153 : slot « précédent », pointillés, crédits des cônes affichés.
			const run = get(weatherAiRun)!;
			const plan = await preparePlan({
				run,
				vt: NEXT_INIT,
				layers: { tracks: false, cones: true },
				cones: null,
				previous: during.previous,
				dark: false
			});
			expect(plan?.previousCones).toBe(true);
			const shown = displayedCones({
				run,
				layers: { cones: true },
				cones: null,
				previous: during.previous
			});
			expect(shown?.previous?.runId).toBe(RUN_ID);
			expect(shown?.credits?.attribution).toBe(conesEntry().attribution);

			// Relevé sans changement : gardés, pas relus.
			const reads = () =>
				p.fetchMock.mock.calls.filter(([u]) => u === dataUrl(BASE, CONES_PRODUCT_ID, INIT_TIME))
					.length;
			const before = reads();
			await refresh();
			await settle();
			expect(get(weatherAiCones)?.previous?.runId).toBe(RUN_ID);
			expect(reads()).toBe(before);

			p.publishNextCones();
			await refresh();
			await until(() => !!get(weatherAiCones)?.doc);
			expect(get(weatherAiCones)?.doc?.run_id).toBe(NEXT.runId);
			expect(get(weatherAiCones)?.previous).toBeUndefined();
		} finally {
			release();
		}
	});

	it('champ présent mais document non servi (404) : rien affiché, plus rien de proposé', async () => {
		portal(previousField(), false);
		const release = await start();
		try {
			await until(() => !!get(weatherAiCones)?.seededFrom);
			expect(get(weatherAiCones)?.previous).toBeUndefined();
			expect(get(weatherAiCones)?.message).toBeUndefined();
			expect(conesOffered(get(weatherAiRun))).toBe(false);
		} finally {
			release();
		}
	});

	it('champ présent mais amorce non antérieure au run affiché : rien affiché', async () => {
		portal(previousField({ init_time: NEXT_INIT }));
		const release = await start();
		try {
			await until(() => !!get(weatherAiCones)?.seededFrom);
			expect(get(weatherAiCones)?.previous).toBeUndefined();
		} finally {
			release();
		}
	});
});
