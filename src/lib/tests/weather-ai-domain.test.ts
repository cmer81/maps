import { get } from 'svelte/store';

import {
	type Domain,
	GridFactory,
	domainOptions,
	getColorScale,
	getProtocolInstance,
	getRanges
} from '@openmeteo/weather-map-layer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { omProtocolSettings, standardColorScales } from '$lib/stores/om-protocol-settings';
import { inProgress, latest, metaJson, modelRun, time } from '$lib/stores/time';
import { domain, variable } from '$lib/stores/variables';

import {
	DOMAIN_DEFAULT_VARIABLES,
	DOMAIN_TO_API_MODEL,
	MODEL_BADGES,
	MODEL_DESCRIPTIONS,
	MODEL_SELECTOR_GROUPS,
	WEATHER_AI_DOMAIN
} from '$lib/constants';
import { getBaseUri } from '$lib/helpers';
import { getInitialMetaData, getMetaData, matchVariableOrFirst } from '$lib/metadata';
import { applyModelSelectorLabels } from '$lib/model-selector-labels';
import { getOMUrlFor } from '$lib/url';
import { registerWeatherAiDomain, weatherAiDomain } from '$lib/weather-ai-domain';

import type { Data, OmUrlState } from '@openmeteo/weather-map-layer';

// Fixture générée par `fixtures/weather-ai-om/generate_fixture.py` avec les
// réglages du producteur weather-ai (#266) : run 00Z achevé (`latest.json`) et run
// 06Z en publication progressive (`in-progress.json`, `completed: false`, deux
// échéances déposées sur douze, pas encore de `meta.json`).
const FIXTURE = join(__dirname, 'fixtures', 'weather-ai-om');
const BUCKET = 'https://weather-ai-om.test';
const RUN_06Z = new Date('2026-10-19T06:00:00Z');

/** Réponse portant son URL, comme un vrai `fetch` (`getInitialMetaData` la lit). */
const respond = (url: string, body: BodyInit | null, init?: ResponseInit) =>
	Object.defineProperty(new Response(body, init), 'url', { value: url });

/** Faux bucket servant la fixture comme S3 : JSON, HEAD et lectures `Range`. */
function stubBucket() {
	const requests: string[] = [];
	vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		// Module WASM du lecteur .om, chargé par `fetch(file://…)` à la 1re lecture.
		if (url.startsWith('file:'))
			return respond(url, new Uint8Array(readFileSync(fileURLToPath(url))));
		requests.push(url);
		if (!url.startsWith(BUCKET + '/')) return respond(url, '', { status: 404 });
		let bytes: Buffer;
		try {
			bytes = readFileSync(join(FIXTURE, url.slice(BUCKET.length + 1).split('?')[0]));
		} catch {
			return respond(url, '<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
		}
		if (init?.method === 'HEAD') {
			return respond(url, null, { headers: { 'content-length': String(bytes.length) } });
		}
		const range = (init?.headers as Record<string, string> | undefined)?.Range;
		const match = range?.match(/^bytes=(\d+)-(\d+)$/);
		if (match) {
			const [start, end] = [Number(match[1]), Math.min(Number(match[2]), bytes.length - 1)];
			return respond(url, new Uint8Array(bytes.subarray(start, end + 1)), {
				status: 206,
				headers: { 'content-range': `bytes ${start}-${end}/${bytes.length}` }
			});
		}
		return respond(url, new Uint8Array(bytes));
	});
	return requests;
}

const removeDomain = () => {
	const idx = domainOptions.findIndex((d) => d.value === WEATHER_AI_DOMAIN);
	if (idx >= 0) domainOptions.splice(idx, 1);
};

beforeEach(() => {
	removeDomain();
	vi.stubEnv('VITE_WEATHER_AI_OM_BUCKET_URL', BUCKET + '/');
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	removeDomain();
});

describe('registerWeatherAiDomain', () => {
	it('enregistre la grille globale 1° du producteur, échéances et runs 6-horaires', () => {
		registerWeatherAiDomain();
		const d = domainOptions.find((x) => x.value === WEATHER_AI_DOMAIN);
		expect(d?.grid).toEqual({
			type: 'regular',
			nx: 360,
			ny: 181,
			latMin: -90,
			lonMin: -180,
			dx: 1,
			dy: 1,
			zoom: 1
		});
		expect(d?.time_interval).toBe('6_hourly');
		expect(d?.model_interval).toBe('6_hourly');
	});

	it('est idempotent', () => {
		registerWeatherAiDomain();
		registerWeatherAiDomain();
		expect(domainOptions.filter((x) => x.value === WEATHER_AI_DOMAIN)).toHaveLength(1);
	});

	it('reste absent sans bucket Weather AI, même si le bucket maison est configuré', () => {
		vi.stubEnv('VITE_WEATHER_AI_OM_BUCKET_URL', '');
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket-maison.test');
		registerWeatherAiDomain();
		expect(domainOptions.find((x) => x.value === WEATHER_AI_DOMAIN)).toBeUndefined();
	});
});

describe('bucket dédié', () => {
	it('lit le bucket Weather AI, pas le bucket maison', () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket-maison.test');
		expect(getBaseUri(WEATHER_AI_DOMAIN)).toBe(BUCKET);
		expect(getBaseUri('arome_france')).toBe('https://bucket-maison.test');
	});
});

describe('sélecteur de modèles', () => {
	it('présente le modèle IA dans le style d’AIFS', () => {
		const entries: readonly { value: string; label: string }[] = MODEL_SELECTOR_GROUPS.flatMap(
			(g): readonly { value: string; label: string }[] => g.domains
		);
		const entry = entries.find((x) => x.value === WEATHER_AI_DOMAIN);
		expect(entry?.label).toBe('Weather AI (WeatherNext)');
		expect(MODEL_BADGES[WEATHER_AI_DOMAIN]).toBe('1° · Monde · IA · 3 j');
		expect(MODEL_DESCRIPTIONS[WEATHER_AI_DOMAIN]).toBe(
			'Google DeepMind WeatherNext via Weather AI · modèle IA · global 1° · ~72 h · expérimental'
		);
		registerWeatherAiDomain();
		applyModelSelectorLabels();
		expect(domainOptions.find((x) => x.value === WEATHER_AI_DOMAIN)?.label).toBe(
			'Weather AI (WeatherNext)'
		);
		// Ni API forecast ni météogramme pour ce modèle.
		expect(DOMAIN_TO_API_MODEL[WEATHER_AI_DOMAIN]).toBeUndefined();
	});

	it('affiche la pression par défaut', () => {
		expect(DOMAIN_DEFAULT_VARIABLES[WEATHER_AI_DOMAIN]).toBe('pressure_msl');
	});
});

describe('échelles de couleur', () => {
	it('pression en hPa (échelle du package), probabilité en % par clé exacte', () => {
		expect(getColorScale('pressure_msl', false, standardColorScales).unit).toBe('hPa');
		const p = getColorScale('cyclone_existence_probability', false, standardColorScales);
		expect(p.unit).toBe('%');
		// Pas le fallback silencieux `temperature` (°C).
		expect(p).not.toBe(standardColorScales.temperature);
	});

	it('ramène la probabilité de 0..1 à 0..100 %, pour ce seul domaine', () => {
		const callback = get(omProtocolSettings).postReadCallback!;
		const read = (domainValue: string, variableName: string) => {
			const data: Data = { values: new Float32Array([0, 0.25, 0.9]), directions: undefined };
			callback(undefined as never, data, {
				dataOptions: { domain: { value: domainValue }, variable: variableName }
			} as unknown as OmUrlState);
			return Array.from(data.values!, (v) => Math.round(v * 1000) / 1000);
		};
		expect(read(WEATHER_AI_DOMAIN, 'cyclone_existence_probability')).toEqual([0, 25, 90]);
		expect(read(WEATHER_AI_DOMAIN, 'pressure_msl')).toEqual([0, 0.25, 0.9]);
	});
});

describe('métadonnées du bucket', () => {
	beforeEach(() => {
		registerWeatherAiDomain();
		domain.set(WEATHER_AI_DOMAIN);
		modelRun.set(undefined);
		latest.set(undefined);
		inProgress.set(undefined);
	});

	afterEach(() => {
		domain.set('arome_france');
		modelRun.set(undefined);
		metaJson.set(undefined);
	});

	it('lit latest.json et in-progress.json du domaine sur le bucket dédié', async () => {
		const requests = stubBucket();
		await getInitialMetaData();
		expect(requests).toEqual([
			`${BUCKET}/data_spatial/${WEATHER_AI_DOMAIN}/latest.json`,
			`${BUCKET}/data_spatial/${WEATHER_AI_DOMAIN}/in-progress.json`
		]);
		expect(get(latest)?.reference_time).toBe('2026-10-19T00:00:00Z');
		expect(get(inProgress)?.completed).toBe(false);
	});

	it('montre par défaut le dernier run achevé, ses douze échéances +6 h → +72 h', async () => {
		stubBucket();
		await getInitialMetaData();
		const meta = await getMetaData();
		expect(get(modelRun)?.toISOString()).toBe('2026-10-19T00:00:00.000Z');
		expect(meta.valid_times).toHaveLength(12);
		expect(meta.valid_times[0]).toBe('2026-10-19T06:00:00Z');
		expect(meta.valid_times[11]).toBe('2026-10-22T00:00:00Z');
	});

	it('run en cours : seulement les échéances déjà déposées, sans meta.json', async () => {
		const requests = stubBucket();
		await getInitialMetaData();
		modelRun.set(RUN_06Z);
		const meta = await getMetaData();
		expect(meta.completed).toBe(false);
		expect(meta.valid_times).toEqual(['2026-10-19T12:00:00Z', '2026-10-19T18:00:00Z']);
		// Le run en cours vient de in-progress.json : aucune lecture de son meta.json,
		// pas encore publié (le producteur le dépose après le dernier .om).
		expect(requests.some((u) => u.endsWith('/0600Z/meta.json'))).toBe(false);
	});

	it('bascule sur la pression quand la variable courante n’est pas publiée', async () => {
		stubBucket();
		await getInitialMetaData();
		metaJson.set(await getMetaData());
		variable.set('temperature_2m');
		matchVariableOrFirst();
		expect(get(variable)).toBe('pressure_msl');
	});
});

describe('lecture des .om', () => {
	const grid = weatherAiDomain.grid;

	beforeEach(() => {
		registerWeatherAiDomain();
		domain.set(WEATHER_AI_DOMAIN);
		modelRun.set(RUN_06Z);
	});

	afterEach(() => {
		domain.set('arome_france');
		modelRun.set(undefined);
	});

	/** URL bâtie comme celle de la couche MapLibre, lue par le reader du protocole. */
	async function read(variableName: string, validTime: string) {
		time.set(new Date(validTime));
		const url = getOMUrlFor(variableName)!;
		const reader = getProtocolInstance(get(omProtocolSettings)).omFileReader;
		const data = await reader.readVariable(
			url.split('?')[0],
			variableName,
			getRanges(grid, undefined)
		);
		return { url, values: data.values as Float32Array };
	}

	// Plan incliné de la fixture : 1000 + 0,2·lat + 0,1·lon (+ 1 hPa à 18Z).
	const expected = (lat: number, lon: number, offset = 0) => 1000 + 0.2 * lat + 0.1 * lon + offset;

	it('URL du layout data_spatial, sans secondes ni Z dans le nom du fichier', async () => {
		stubBucket();
		const { url } = await read('pressure_msl', '2026-10-19T12:00:00Z');
		expect(url.split('?')[0]).toBe(
			`${BUCKET}/data_spatial/${WEATHER_AI_DOMAIN}/2026/10/19/0600Z/2026-10-19T1200.om`
		);
	});

	it('grille [181, 360] du sud au nord, de −180 à 179°, pression en hPa', async () => {
		stubBucket();
		const { values } = await read('pressure_msl', '2026-10-19T12:00:00Z');
		expect(values).toHaveLength(181 * 360);
		const at = (j: number, i: number) => values[j * 360 + i];
		expect(at(0, 0)).toBeCloseTo(expected(-90, -180), 1); // pôle sud, −180°
		expect(at(180, 359)).toBeCloseTo(expected(90, 179), 1); // pôle nord, 179°
		expect(at(90, 180)).toBeCloseTo(expected(0, 0), 1); // Greenwich, équateur
		expect(at(70, 55 + 180)).toBeCloseTo(expected(-20, 55), 1);
	});

	it('interpolation de la carte, y compris à travers l’antiméridien', async () => {
		stubBucket();
		const { values } = await read('pressure_msl', '2026-10-19T18:00:00Z');
		const g = GridFactory.create(grid as Domain['grid']);
		expect(g.getLinearInterpolatedValue(values, 45.5, 10.5)).toBeCloseTo(
			expected(45.5, 10.5, 1),
			1
		);
		// Entre 179° et −180° : moyenne des deux colonnes voisines, pas de trou.
		const wrapped = g.getLinearInterpolatedValue(values, 10, 179.5);
		expect(wrapped).toBeCloseTo((expected(10, 179, 1) + expected(10, -180, 1)) / 2, 1);
	});

	it('probabilité publiée en fraction 0..1 autour du cyclone synthétique (20° S, 55° E)', async () => {
		stubBucket();
		const { values } = await read('cyclone_existence_probability', '2026-10-19T12:00:00Z');
		const g = GridFactory.create(grid as Domain['grid']);
		expect(g.getLinearInterpolatedValue(values, -20, 55)).toBeCloseTo(0.9, 3);
		expect(g.getLinearInterpolatedValue(values, 40, -100)).toBeCloseTo(0, 3);
	});

	it('valeurs affichées (lecture + postReadCallback du protocole) : hPa et %', async () => {
		stubBucket();
		// Le protocole enchaîne lecture et `postReadCallback` (`ensureData`) avant
		// tuiles, légende et infobulle : même enchaînement ici, sans worker de rendu.
		const shown = async (variableName: string) => {
			const { values } = await read(variableName, '2026-10-19T12:00:00Z');
			const data: Data = { values, directions: undefined };
			get(omProtocolSettings).postReadCallback!(undefined as never, data, {
				dataOptions: { domain: weatherAiDomain, variable: variableName }
			} as unknown as OmUrlState);
			return GridFactory.create(grid as Domain['grid']).getLinearInterpolatedValue(
				data.values!,
				-20,
				55
			);
		};
		expect(await shown('pressure_msl')).toBeCloseTo(expected(-20, 55), 1);
		expect(await shown('cyclone_existence_probability')).toBeCloseTo(90, 0);
	});

	it('échéance listée par le run achevé mais pas encore déposée : lecture refusée', async () => {
		stubBucket();
		await expect(read('pressure_msl', '2026-10-20T00:00:00Z')).rejects.toThrow();
	});
});
