import { render } from 'svelte/server';
import { get } from 'svelte/store';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	weatherAiCones,
	weatherAiDisplayed,
	weatherAiLayers,
	weatherAiRun
} from '$lib/stores/weather-ai';

import WeatherAiMapCard from '$lib/components/weather-ai/weather-ai-map-card.svelte';
import WeatherAiPanel from '$lib/components/weather-ai/weather-ai-panel.svelte';

import { getWeatherAiApiUrl } from '$lib/runtime-env';
import { dataUrl } from '$lib/weather-ai/api';
import {
	CONES_MENTION,
	CONES_PRODUCT_ID,
	type PreviousCones,
	keepPreviousCones,
	previousConesNotice,
	shortRunLabel
} from '$lib/weather-ai/cones';
import {
	conesOffered,
	forgetSessionCones,
	refresh,
	useWeatherAi
} from '$lib/weather-ai/controller';
import { pruneCache } from '$lib/weather-ai/loader';
import { type PlanInput, planSignature, preparePlan } from '$lib/weather-ai/map-layers';

import {
	ATTRIBUTION,
	INIT_TIME,
	LICENSE,
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

// Run suivant (06Z) et run lointain (+18 h), dérivés des fixtures du run 18/10 00Z.
const NEXT = { runId: 'wn2-oper-20261018T060000Z-next', snapshotId: 'wn2-snap-next' };
const NEXT_INIT = '2026-10-18T06:00:00Z';

const kept = (over: Partial<PreviousCones> = {}): PreviousCones => ({
	runId: RUN_ID,
	snapshotId: SNAPSHOT_ID,
	sha256: 'c'.repeat(64),
	calibrationStatus: conesDoc().calibration_status,
	attribution: ATTRIBUTION,
	licenseNotice: LICENSE,
	doc: conesDoc(),
	...over
});

const nextRun = (initTime: string | undefined = NEXT_INIT, available = [] as never[]) => ({
	runId: NEXT.runId,
	initTime,
	available
});

describe('keepPreviousCones : garde-fous', () => {
	it('run immédiatement précédent, 6 h plus tôt, sans cônes pour le nouveau : gardés', () => {
		expect(keepPreviousCones(kept(), RUN_ID, nextRun())).toEqual(kept());
	});

	it('pas le run affiché juste avant : refusés', () => {
		expect(keepPreviousCones(kept(), 'wn2-oper-autre', nextRun())).toBeNull();
		expect(keepPreviousCones(kept(), undefined, nextRun())).toBeNull();
		expect(keepPreviousCones(null, RUN_ID, nextRun())).toBeNull();
	});

	it('au-delà de 12 h, amorce non postérieure ou inconnue : refusés', () => {
		expect(keepPreviousCones(kept(), RUN_ID, nextRun('2026-10-18T12:00:00Z'))).not.toBeNull();
		expect(keepPreviousCones(kept(), RUN_ID, nextRun('2026-10-18T18:00:00Z'))).toBeNull();
		expect(keepPreviousCones(kept(), RUN_ID, nextRun(INIT_TIME))).toBeNull();
		expect(keepPreviousCones(kept(), RUN_ID, nextRun('2026-10-17T18:00:00Z'))).toBeNull();
		expect(keepPreviousCones(kept(), RUN_ID, { ...nextRun(), initTime: undefined })).toBeNull();
	});

	it('le nouveau run annonce déjà ses cônes : pas de repli', () => {
		const available = [{ productId: CONES_PRODUCT_ID }] as never[];
		expect(keepPreviousCones(kept(), RUN_ID, nextRun(NEXT_INIT, available))).toBeNull();
	});

	it('document qui ne passe plus validateCones contre son run : refusé', () => {
		expect(
			keepPreviousCones(kept({ doc: conesDoc({ mention: 'autre' }) }), RUN_ID, nextRun())
		).toBeNull();
		expect(keepPreviousCones(kept({ snapshotId: 'autre' }), RUN_ID, nextRun())).toBeNull();
		expect(keepPreviousCones(kept({ calibrationStatus: 'autre' }), RUN_ID, nextRun())).toBeNull();
	});

	it('mention : run des cônes nommé, jamais présentés comme ceux du run affiché', () => {
		expect(shortRunLabel('2026-10-26T00:00:00Z')).toBe('26/10 00Z');
		expect(previousConesNotice(kept())).toBe(
			'Cônes du run 18/10 00Z : ceux du run affiché sont en cours de calcul.'
		);
	});
});

describe('rendu : cônes du run précédent distincts', () => {
	const run = {
		runId: NEXT.runId,
		snapshotId: NEXT.snapshotId,
		publishedAt: '',
		initTime: NEXT_INIT,
		available: [],
		ignored: [],
		loaded: {}
	};
	const input = (previous: PreviousCones | null): PlanInput => ({
		run,
		vt: NEXT_INIT,
		layers: { tracks: false, cones: true },
		cones: null,
		previous,
		dark: false
	});

	it('plan marqué `previousCones`, signature distincte des cônes du run', async () => {
		const plan = await preparePlan(input(kept()));
		expect(plan?.previousCones).toBe(true);
		expect(plan?.cones?.features.length).toBeGreaterThan(0);
		expect(planSignature(input(kept()))).not.toBe(planSignature(input(null)));
		expect(await preparePlan(input(null))).toBeNull();
	});

	it('couche cônes désactivée : rien', async () => {
		expect(
			await preparePlan({ ...input(kept()), layers: { tracks: false, cones: false } })
		).toBeNull();
	});
});

describe('mentions : carte flottante et onglet', () => {
	afterEach(() => {
		weatherAiRun.set(undefined);
		weatherAiDisplayed.set(null);
		weatherAiCones.set(null);
		weatherAiLayers.set({ tracks: false, cones: false });
	});

	const setup = () => {
		weatherAiLayers.set({ tracks: true, cones: true });
		weatherAiRun.set({
			runId: NEXT.runId,
			snapshotId: NEXT.snapshotId,
			publishedAt: '',
			initTime: NEXT_INIT,
			available: [],
			ignored: [],
			loaded: {}
		});
		weatherAiCones.set({ runId: NEXT.runId, doc: null, previous: kept() });
		weatherAiDisplayed.set({
			runId: NEXT.runId,
			validTime: VALID_TIMES[1],
			initTime: NEXT_INIT,
			demo: false
		});
	};

	it('carte flottante : mention du run des cônes, mention et statut de calibration', () => {
		setup();
		const body = render(WeatherAiMapCard).body;
		expect(body).toContain(previousConesNotice(kept()));
		expect(body).toContain(CONES_MENTION);
		expect(body).toContain(conesDoc().calibration_status);
	});

	it('onglet : cônes proposés et mention visible', () => {
		setup();
		expect(conesOffered(get(weatherAiRun))).toBe(true);
		const body = render(WeatherAiPanel).body;
		expect(body).toContain(previousConesNotice(kept()));
		expect(body).toContain(CONES_MENTION);
	});
});

// Passe les documents des fixtures (run 18/10 00Z) sur le run suivant.
const rerun = <T>(v: T): T =>
	JSON.parse(
		JSON.stringify(v)
			.replaceAll(RUN_ID, NEXT.runId)
			.replaceAll(SNAPSHOT_ID, NEXT.snapshotId)
			.replaceAll(`"init_time":"${INIT_TIME}"`, `"init_time":"${NEXT_INIT}"`)
	);

function portal() {
	const runRoutes = (): Record<string, unknown> => ({
		[`${BASE}/runs`]: runs(),
		[`${BASE}/products/${TRACKS_ID}/timeline`]: timeline(TRACKS_ID),
		...Object.fromEntries(
			VALID_TIMES.map((vt) => [
				dataUrl(BASE, TRACKS_ID, vt),
				data(tracksDoc(vt, [trackPoint({ valid_time: vt })]))
			])
		)
	});
	const routes: Record<string, unknown> = {
		...runRoutes(),
		[`${BASE}/products`]: catalog([TRACKS_ID], { cones: conesEntry() }),
		[dataUrl(BASE, CONES_PRODUCT_ID, INIT_TIME)]: data(conesDoc())
	};
	vi.stubGlobal('fetch', async (url: string) =>
		url in routes
			? new Response(JSON.stringify(routes[url]), { status: 200 })
			: new Response('{"title":"Not Found"}', { status: 404 })
	);
	return {
		/** Le catalogue bascule sur le run suivant, sans cônes (job cone-members en cours). */
		switchToNext() {
			for (const k of Object.keys(routes)) delete routes[k];
			Object.assign(routes, rerun(runRoutes()), {
				[`${BASE}/products`]: rerun(catalog([TRACKS_ID], { cones: null }))
			});
		},
		/** Les cônes du run suivant sont publiés. */
		publishNextCones(doc = rerun(conesDoc())) {
			routes[`${BASE}/products`] = rerun(
				catalog([TRACKS_ID], {
					cones: conesEntry({ valid_time: NEXT_INIT, sha256: 'd'.repeat(64) })
				})
			);
			routes[dataUrl(BASE, CONES_PRODUCT_ID, NEXT_INIT)] = data(doc);
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

describe('contrôleur : bascule de run pendant le calcul des cônes', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		weatherAiRun.set(undefined);
		weatherAiCones.set(null);
		weatherAiLayers.set({ tracks: false, cones: false });
		forgetSessionCones();
		pruneCache([]);
	});

	it('cônes du run précédent gardés, puis remplacés par ceux du run courant', async () => {
		const p = portal();
		weatherAiLayers.set({ tracks: true, cones: true });
		const release = useWeatherAi();
		try {
			await until(() => get(weatherAiCones)?.doc?.run_id === RUN_ID);
			p.switchToNext();
			await refresh();
			await until(() => get(weatherAiRun)?.runId === NEXT.runId);
			const during = get(weatherAiCones);
			expect(during?.runId).toBe(NEXT.runId);
			expect(during?.doc).toBeNull();
			expect(during?.previous?.runId).toBe(RUN_ID);
			expect(conesOffered(get(weatherAiRun))).toBe(true);
			// Les trajectoires sont bien celles du run courant.
			expect(get(weatherAiRun)?.loaded[TRACKS_ID]).toBeDefined();

			// Relevé sans changement : toujours gardés.
			await refresh();
			expect(get(weatherAiCones)?.previous?.runId).toBe(RUN_ID);

			p.publishNextCones();
			await refresh();
			await until(() => !!get(weatherAiCones)?.doc);
			expect(get(weatherAiCones)?.doc?.run_id).toBe(NEXT.runId);
			expect(get(weatherAiCones)?.previous).toBeUndefined();
		} finally {
			release();
		}
	});

	it('cônes du run courant refusés : ceux du run précédent restent, raison affichée', async () => {
		const p = portal();
		weatherAiLayers.set({ tracks: true, cones: true });
		const release = useWeatherAi();
		try {
			await until(() => get(weatherAiCones)?.doc?.run_id === RUN_ID);
			p.switchToNext();
			await refresh();
			await until(() => get(weatherAiRun)?.runId === NEXT.runId);
			p.publishNextCones(rerun(conesDoc({ mention: 'autre' })));
			await refresh();
			await until(() => !!get(weatherAiCones)?.message);
			expect(get(weatherAiCones)?.doc).toBeNull();
			expect(get(weatherAiCones)?.previous?.runId).toBe(RUN_ID);
		} finally {
			release();
		}
	});

	it('couche cônes jamais chargée pendant le run précédent : rien à garder', async () => {
		const p = portal();
		weatherAiLayers.set({ tracks: true, cones: false });
		const release = useWeatherAi();
		try {
			await until(() => get(weatherAiRun)?.runId === RUN_ID);
			p.switchToNext();
			await refresh();
			await until(() => get(weatherAiRun)?.runId === NEXT.runId);
			expect(get(weatherAiCones)).toBeNull();
			expect(conesOffered(get(weatherAiRun))).toBe(false);
		} finally {
			release();
		}
	});
});
