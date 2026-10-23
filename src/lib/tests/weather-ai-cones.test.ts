import { render } from 'svelte/server';

import { bbox } from '@turf/turf';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { weatherAiCones, weatherAiLayers, weatherAiRun } from '$lib/stores/weather-ai';

import WeatherAiPanel from '$lib/components/weather-ai/weather-ai-panel.svelte';

import { getWeatherAiConesMode } from '$lib/runtime-env';
import { WeatherAiHttpError, dataUrl } from '$lib/weather-ai/api';
import {
	CONES_MENTION,
	CONES_PRODUCT_ID,
	type Cone,
	type ConesProduct,
	availableRuns,
	conesToGeoJson,
	envelope,
	isConeReason,
	loadConesDocument,
	validateCones
} from '$lib/weather-ai/cones';
import fixture from '$lib/weather-ai/fixtures/cones-public.fixture.json';
import { type PlanInput, planSignature, preparePlan } from '$lib/weather-ai/map-layers';
import { discoverProducts } from '$lib/weather-ai/products';

import {
	INIT_TIME,
	RUN_ID,
	SNAPSHOT_ID,
	TRACKS_ID,
	catalog,
	conesDoc,
	conesEntry,
	data
} from './weather-ai-fixtures';

const doc = fixture as unknown as ConesProduct;
const expected = { runId: doc.run_id, snapshotId: doc.snapshot_id };

const cone = (lead: number, lat: number, lon: number, r = 100): Cone => ({
	lead_hours: lead,
	valid_time: `2026-10-18T${String(lead % 24).padStart(2, '0')}:00:00Z`,
	available: true,
	available_members: 3,
	centre: { latitude: lat, longitude: lon },
	radius_km: { '0.68': r, '0.90': r * 1.6 }
});

describe('validateCones', () => {
	it('accepte la fixture construite d’après le schéma, pour son run', () => {
		expect(validateCones(doc, expected)).toBeNull();
	});

	it('refuse une mention absente ou différente', () => {
		expect(validateCones({ ...doc, mention: '' }, expected)).toMatch(/mention/);
		expect(validateCones({ ...doc, mention: CONES_MENTION + ' ' }, expected)).toMatch(/mention/);
	});

	it('refuse un document d’un autre run que celui affiché', () => {
		expect(validateCones(doc, { ...expected, runId: 'wn2-oper-autre' })).toMatch(/run/);
	});

	it('refuse sans autorisation de diffusion publique ou avec autorité d’alerte', () => {
		expect(validateCones({ ...doc, public_delivery_allowed: false }, expected)).not.toBeNull();
		expect(validateCones({ ...doc, alert_authority: true }, expected)).not.toBeNull();
	});
});

describe('availableRuns', () => {
	it('coupe l’enveloppe à chaque indisponibilité, sans interpoler', () => {
		const w36 = doc.storms.find((s) => s.storm_id.endsWith('36W'))!;
		const runs = availableRuns(w36.cones);
		expect(runs.map((r) => r.map((c) => c.lead_hours))).toEqual([
			[6, 12, 18, 24, 30, 36, 42],
			[54, 60, 66, 72]
		]);
	});

	it('hémisphère sud : aucun cône au-delà de maximum_lead_hours', () => {
		const p01 = doc.storms.find((s) => s.hemisphere === 'south')!;
		expect(p01.maximum_lead_hours).toBe(24);
		const leads = availableRuns(p01.cones)
			.flat()
			.map((c) => c.lead_hours);
		expect(Math.max(...leads)).toBeLessThanOrEqual(24);
	});
});

describe('envelope', () => {
	it('relie les cercles successifs et contient chaque cercle', () => {
		const run = [cone(6, 15, 140), cone(12, 16, 138)];
		const env = envelope(run as Extract<Cone, { available: true }>[], '0.68')!;
		const [minX, minY, maxX, maxY] = bbox(env);
		// ~100 km ≈ 0,9° autour des centres
		expect(minX).toBeLessThan(138 - 0.8);
		expect(maxX).toBeGreaterThan(140 + 0.8);
		expect(minY).toBeLessThan(15 - 0.8);
		expect(maxY).toBeGreaterThan(16 + 0.8);
		expect(env.geometry.type).toBe('Polygon');
	});

	it('reste d’un seul tenant à travers l’antiméridien', () => {
		const run = [cone(6, 15, 179), cone(12, 15, -179)];
		const env = envelope(run as Extract<Cone, { available: true }>[], '0.90')!;
		const [minX, , maxX] = bbox(env);
		expect(maxX - minX).toBeLessThan(10); // et non ~360°
		expect(maxX).toBeGreaterThan(180);
	});

	it('produit les deux niveaux, 90 % avant 68 % (68 % dessiné par-dessus)', () => {
		const { envelopes, centres } = conesToGeoJson(doc);
		const levels = envelopes.features.map((f) => f.properties!.level);
		expect(levels.indexOf('0.90')).toBeLessThan(levels.indexOf('0.68'));
		expect(centres.features.every((f) => f.properties!.members >= doc.member_quorum)).toBe(true);
	});
});

describe('limite de l’hémisphère sud (southern_maximum_lead_hours)', () => {
	// Document synthétique : cyclone sud limité à +24 h, mais avec un cône
	// « disponible » à +48 h (contrat violé).
	const southDoc = (): ConesProduct => ({
		...doc,
		storms: [
			{
				storm_id: 'ecmwf-tf:2026:02S',
				hemisphere: 'south',
				maximum_lead_hours: 24,
				cones: [cone(6, -15, 60), cone(24, -16, 58), cone(48, -18, 55)]
			}
		]
	});

	it('refuse un cône disponible au-delà de la limite sud', () => {
		expect(validateCones(southDoc(), expected)).toMatch(/au-delà de \+24 h/);
	});

	it('refuse un cyclone sud annonçant une échéance maximale au-delà de la limite', () => {
		const d = southDoc();
		d.storms[0].maximum_lead_hours = 72;
		d.storms[0].cones = d.storms[0].cones.slice(0, 2);
		expect(validateCones(d, expected)).toMatch(/limite/);
	});

	it('n’affiche jamais un cône sud au-delà de la limite, même sans validation', () => {
		const { centres } = conesToGeoJson(southDoc());
		expect(centres.features.map((f) => f.properties!.lead)).toEqual([6, 24]);
	});

	it('accepte un cyclone sud limité à +24 h avec des indisponibilités au-delà', () => {
		const d = southDoc();
		d.storms[0].cones[2] = {
			lead_hours: 48,
			valid_time: '2026-10-20T00:00:00Z',
			available: false,
			available_members: 3,
			reason: 'southern_hemisphere_availability_below_threshold'
		};
		expect(validateCones(d, expected)).toBeNull();
	});
});

describe('chargement des cônes servis par le portail', () => {
	const BASE = 'https://portail.test/api/weather-ai';
	const known = (cones: ReturnType<typeof conesEntry> | null) =>
		discoverProducts(catalog([TRACKS_ID], { cones })).known;
	const fakeFetch = (body: unknown, status = 200) => {
		const calls: string[] = [];
		const fetchJson = async <T>(url: string): Promise<T> => {
			calls.push(url);
			if (status !== 200) throw new WeatherAiHttpError(status, url, '');
			return body as T;
		};
		return { calls, fetchJson };
	};

	afterEach(() => vi.unstubAllEnvs());

	it('flag : `on` par défaut, `off` seulement sur demande explicite', () => {
		expect(getWeatherAiConesMode()).toBe('on');
		vi.stubEnv('VITE_WEATHER_AI_CONES', 'off');
		expect(getWeatherAiConesMode()).toBe('off');
		vi.stubEnv('VITE_WEATHER_AI_CONES', 'fixture');
		expect(getWeatherAiConesMode()).toBe('fixture');
	});

	it('découverte : cônes pris du champ `cones`, datés de l’amorce, jamais de `produits`', () => {
		const cones = known(conesEntry()).find((p) => p.productId === CONES_PRODUCT_ID);
		expect(cones?.validTime).toBe(INIT_TIME);
		expect(cones?.attribution).toBe(conesEntry().attribution);
		expect(known(null).some((p) => p.productId === CONES_PRODUCT_ID)).toBe(false);
		const inProduits = discoverProducts(catalog([TRACKS_ID, CONES_PRODUCT_ID])).known;
		expect(inProduits.some((p) => p.productId === CONES_PRODUCT_ID)).toBe(false);
	});

	it('`on` : lit /data à la date d’amorce et renvoie le document', async () => {
		const { calls, fetchJson } = fakeFetch(data(conesDoc()));
		const doc = await loadConesDocument(
			{ runId: RUN_ID, available: known(conesEntry()) },
			BASE,
			undefined,
			fetchJson
		);
		expect(calls).toEqual([dataUrl(BASE, CONES_PRODUCT_ID, INIT_TIME)]);
		expect(doc?.run_id).toBe(RUN_ID);
	});

	it('`on` sans cônes au catalogue : aucune requête', async () => {
		const { calls, fetchJson } = fakeFetch(data(conesDoc()));
		const doc = await loadConesDocument(
			{ runId: RUN_ID, available: known(null) },
			BASE,
			undefined,
			fetchJson
		);
		expect(doc).toBeNull();
		expect(calls).toEqual([]);
	});

	it('`on`, cônes retirés entre-temps (404) : null ; autre erreur : levée', async () => {
		const run = { runId: RUN_ID, available: known(conesEntry()) };
		expect(
			await loadConesDocument(run, BASE, undefined, fakeFetch(null, 404).fetchJson)
		).toBeNull();
		await expect(
			loadConesDocument(run, BASE, undefined, fakeFetch(null, 503).fetchJson)
		).rejects.toThrow(/503/);
	});

	it('`off` : rien n’est lu', async () => {
		vi.stubEnv('VITE_WEATHER_AI_CONES', 'off');
		const { calls, fetchJson } = fakeFetch(data(conesDoc()));
		const run = { runId: RUN_ID, available: known(conesEntry()) };
		expect(await loadConesDocument(run, BASE, undefined, fetchJson)).toBeNull();
		expect(calls).toEqual([]);
	});

	it('le document servi pour le run des fixtures passe la validation de ce run', () => {
		expect(validateCones(conesDoc(), { runId: RUN_ID, snapshotId: SNAPSHOT_ID })).toBeNull();
	});
});

describe('validateCones : types du document lu sur le réseau', () => {
	const storm0 = doc.storms[0];
	const withCone = (c: unknown) => ({
		...doc,
		storms: [{ ...storm0, cones: [c as Cone] }]
	});

	it('refuse un nombre remplacé par du texte (infobulle HTML)', () => {
		const c = storm0.cones.find((x) => x.available)!;
		expect(
			validateCones(withCone({ ...c, available_members: '<img src=x onerror=alert(1)>' }), expected)
		).toMatch(/cône invalide/);
		expect(validateCones({ ...doc, member_count: '<b>' as unknown as number }, expected)).toMatch(
			/bornes/
		);
		expect(
			validateCones(
				{ ...doc, storms: [{ ...storm0, maximum_lead_hours: '24<b>' as unknown as number }] },
				expected
			)
		).toMatch(/échéance maximale invalide/);
	});

	it('refuse un rayon non fini ou nul, et une raison d’indisponibilité inconnue', () => {
		const c = storm0.cones.find((x) => x.available)!;
		expect(
			validateCones(withCone({ ...c, radius_km: { '0.68': Infinity, '0.90': 200 } }), expected)
		).toMatch(/rayon/);
		expect(
			validateCones(
				withCone({
					lead_hours: 6,
					valid_time: c.valid_time,
					available: false,
					available_members: 1,
					reason: '<b>x</b>'
				}),
				expected
			)
		).toMatch(/indisponibilité invalide/);
	});
});

describe('revue Codex #150', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	describe('géométrie des cônes remplacés dans le même run (P1)', () => {
		const run = {
			runId: RUN_ID,
			snapshotId: SNAPSHOT_ID,
			publishedAt: '',
			initTime: INIT_TIME,
			available: [],
			ignored: [],
			loaded: {}
		};
		const input = (cones: ConesProduct | null, conesId?: string): PlanInput => ({
			run,
			vt: INIT_TIME,
			layers: { tracks: false, cones: true },
			cones,
			conesId,
			dark: false
		});
		const A = conesDoc();
		// B : même run, centres déplacés de 20° (document remplacé, nouveau sha256).
		const B = conesDoc({
			storms: A.storms.map((s) => ({
				...s,
				cones: s.cones.map((c) =>
					c.available ? { ...c, centre: { ...c.centre, latitude: c.centre.latitude + 20 } } : c
				)
			}))
		});
		const lats = async (i: PlanInput) =>
			(await preparePlan(i))!.coneCentres!.features.map(
				(f) => (f.geometry as GeoJSON.Point).coordinates[1]
			);

		it('A → B : signature et géométrie suivent le nouveau document', async () => {
			const a = await lats(input(A, 'sha-A'));
			const b = await lats(input(B, 'sha-B'));
			expect(planSignature(input(A, 'sha-A'))).not.toBe(planSignature(input(B, 'sha-B')));
			expect(b).toEqual(a.map((lat) => lat + 20));
		});

		it('retrait puis ajout de B : jamais la géométrie de A', async () => {
			const a = await lats(input(A, 'sha-A'));
			expect(await preparePlan(input(null))).toBeNull();
			expect(await lats(input(B, 'sha-B'))).toEqual(a.map((lat) => lat + 20));
		});
	});

	describe('raisons d’indisponibilité du contrat seulement (P2)', () => {
		it.each(['toString', '__proto__', 'constructor', 'hasOwnProperty'])('refuse %s', (reason) => {
			const storm0 = doc.storms[0];
			const c = storm0.cones[0];
			const bad = {
				...doc,
				storms: [
					{
						...storm0,
						cones: [
							{
								lead_hours: c.lead_hours,
								valid_time: c.valid_time,
								available: false,
								available_members: 0,
								reason
							} as unknown as Cone
						]
					}
				]
			};
			expect(validateCones(bad, expected)).toMatch(/indisponibilité invalide/);
			expect(isConeReason(reason)).toBe(false);
		});

		it('accepte les trois raisons du contrat', () => {
			for (const r of [
				'insufficient_members',
				'undefined_centre',
				'southern_hemisphere_availability_below_threshold'
			])
				expect(isConeReason(r)).toBe(true);
		});
	});

	describe('statut de calibration (P2)', () => {
		const exp = { runId: RUN_ID, snapshotId: SNAPSHOT_ID };
		it('exigé, et identique à celui du catalogue', () => {
			const d = conesDoc();
			expect(validateCones(d, { ...exp, calibrationStatus: d.calibration_status })).toBeNull();
			expect(validateCones({ ...d, calibration_status: '' }, exp)).toMatch(/statut/);
			expect(validateCones({ ...d, calibration_status: 3 as unknown as string }, exp)).toMatch(
				/statut/
			);
			expect(validateCones(d, { ...exp, calibrationStatus: 'autre_statut' })).toMatch(
				/différent du catalogue/
			);
		});

		it('découverte : entrée sans la mention exacte ou sans statut, non proposée', () => {
			const has = (e: ReturnType<typeof conesEntry>) =>
				discoverProducts(catalog([TRACKS_ID], { cones: e })).known.some(
					(p) => p.productId === CONES_PRODUCT_ID
				);
			expect(has(conesEntry())).toBe(true);
			expect(has(conesEntry({ mention: 'autre' }))).toBe(false);
			expect(has(conesEntry({ calibration_status: undefined as unknown as string }))).toBe(false);
		});
	});

	describe('`off` gagne partout, y compris contre l’URL de démonstration', () => {
		const withUrl = (search: string, config?: Record<string, string>) =>
			vi.stubGlobal('window', { location: { search }, __OM_CONFIG: config });

		it('build `off` + ?weather_ai_cones=fixture : off', () => {
			vi.stubEnv('VITE_WEATHER_AI_CONES', 'off');
			withUrl('?weather_ai_cones=fixture');
			expect(getWeatherAiConesMode()).toBe('off');
		});

		it('runtime `off` + ?weather_ai_cones=fixture : off', () => {
			withUrl('?weather_ai_cones=fixture', { WEATHER_AI_CONES: 'off' });
			expect(getWeatherAiConesMode()).toBe('off');
		});

		it('sans `off`, l’URL peut encore demander la démo', () => {
			withUrl('?weather_ai_cones=fixture');
			expect(getWeatherAiConesMode()).toBe('fixture');
		});
	});
});

describe('onglet Cyclones IA : statut de calibration affiché tel quel', () => {
	afterEach(() => {
		weatherAiRun.set(undefined);
		weatherAiCones.set(null);
		weatherAiLayers.set({ tracks: false, cones: false });
	});

	it('à côté de la mention, quand les cônes du run sont affichés', () => {
		const { known } = discoverProducts(catalog([TRACKS_ID], { cones: conesEntry() }));
		weatherAiRun.set({
			runId: RUN_ID,
			snapshotId: SNAPSHOT_ID,
			publishedAt: '',
			initTime: INIT_TIME,
			available: known,
			ignored: [],
			loaded: {}
		});
		weatherAiLayers.set({ tracks: true, cones: true });
		weatherAiCones.set({ runId: RUN_ID, sha256: 'c'.repeat(64), doc: conesDoc() });
		const body = render(WeatherAiPanel).body;
		expect(body).toContain(CONES_MENTION);
		expect(body).toContain(conesDoc().calibration_status);
	});
});
