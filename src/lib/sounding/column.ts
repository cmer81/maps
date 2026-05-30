// src/lib/sounding/column.ts
import { get } from 'svelte/store';

import {
	GridFactory,
	WeatherMapLayerFileReader,
	getRanges,
	normalizeLon
} from '@openmeteo/weather-map-layer';

import { omProtocolSettings } from '$lib/stores/om-protocol-settings';

import { soundingLevelsForDomain } from '$lib/constants';
import { getOMUrlFor } from '$lib/url';

import { time as timeStore } from '../stores/time';
import { domain as domainStore, selectedDomain } from '../stores/variables';
import { dewpointFromRH } from './thermo';
import { type ColumnProfile, type LevelDatum } from './types';

/** Lecture brute d'une variable au point ; renvoie NaN si indisponible. */
export type VariableReader = (variable: string) => Promise<number>;

interface SurfaceInput {
	temperature: number;
	rh: number;
	pressure: number;
	height: number;
	u: number;
	v: number;
}

interface AssembleInput {
	lat: number;
	lng: number;
	validTime: string;
	levels: readonly number[];
	surface: SurfaceInput;
	read: VariableReader;
}

/** Logique pure d'assemblage (testable) : lit chaque variable via `read`. */
export async function assembleColumn(input: AssembleInput): Promise<ColumnProfile> {
	const { levels, read } = input;
	const raw = await Promise.all(
		levels.map(async (L) => {
			const [t, rh, h, u, v] = await Promise.all([
				read(`temperature_${L}hPa`),
				read(`relative_humidity_${L}hPa`),
				read(`geopotential_height_${L}hPa`),
				read(`wind_u_component_${L}hPa`),
				read(`wind_v_component_${L}hPa`)
			]);
			return { pressure: L, temperature: t, rh, height: h, u, v };
		})
	);

	const valid: LevelDatum[] = raw
		.filter((r) => [r.temperature, r.rh, r.height, r.u, r.v].every(Number.isFinite))
		.map((r) => ({
			pressure: r.pressure,
			temperature: r.temperature,
			dewpoint: dewpointFromRH(r.temperature, r.rh),
			height: r.height,
			u: r.u,
			v: r.v
		}))
		.sort((a, b) => b.pressure - a.pressure);

	const s = input.surface;
	const surface: LevelDatum = {
		pressure: s.pressure,
		temperature: s.temperature,
		dewpoint: dewpointFromRH(s.temperature, s.rh),
		height: s.height,
		u: s.u,
		v: s.v
	};

	return { lat: input.lat, lng: input.lng, validTime: input.validTime, surface, levels: valid };
}

// --- Câblage réel : lecture multi-niveaux via WeatherMapLayerFileReader -----

/** Demi-côté (degrés) de la petite bounding box lue autour du point cliqué. */
const BBOX_HALF_DEG = 0.5;

/** Concurrence des lectures de variables (≈ comme prefetch.ts). */
const READ_CONCURRENCY = 8;

/**
 * `WeatherMapLayerFileReader` expose `readVariable`, mais celui-ci applique des
 * règles de dérivation : pour `wind_u_component_*` / `wind_v_component_*` il
 * renvoie vitesse + direction (cf. DEFAULT_DERIVATION_RULES dans le dist), pas
 * la composante brute. Pour reconstruire une colonne on a besoin des scalaires
 * bruts (u, v séparés). `readSimpleVariable` lit la variable telle quelle (sans
 * dérivation) ; elle est `private` dans les types du package mais reste un point
 * d'entrée stable du dist. On la cible via cette interface minimale plutôt que
 * de réinverser vitesse/direction (qui interpolerait mal à la discontinuité).
 */
interface SimpleReader {
	readSimpleVariable(
		variable: string,
		ranges: ReturnType<typeof getRanges>,
		signal?: AbortSignal
	): Promise<{ values?: ArrayLike<number> }>;
}

/** Reader unique réutilisé pour le sondage + chaîne de sérialisation des appels. */
let soundingReader: WeatherMapLayerFileReader | undefined;
let soundingChain: Promise<unknown> = Promise.resolve();

/**
 * Reconstruit la colonne verticale au point (lat,lng) pour le run/temps courant.
 *
 * Les appels sont SÉRIALISÉS sur un reader unique réutilisé : le cache de blocs et
 * le WASM reader ne tolèrent pas des lectures concurrentes entre charges (course →
 * NaN intermittents si une charge fait `dispose()`/abort pendant qu'une autre lit).
 * Le jeton `generation` côté panneau écarte les résultats périmés. Source-agnostique :
 * ne nomme aucune source (URL via getOMUrlFor, qui route Open-Meteo ou le bucket R2).
 */
export function fetchColumn(
	lat: number,
	lng: number,
	terrainElevation: number,
	signal?: AbortSignal
): Promise<ColumnProfile> {
	const run = soundingChain.then(() => doFetchColumn(lat, lng, terrainElevation, signal));
	// La chaîne ne doit jamais rester en rejet, sinon les appels suivants planteraient.
	soundingChain = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

async function doFetchColumn(
	lat: number,
	lng: number,
	terrainElevation: number,
	signal?: AbortSignal
): Promise<ColumnProfile> {
	const settings = get(omProtocolSettings);
	const domainName = get(domainStore);
	const grid = get(selectedDomain).grid;
	const validTime = get(timeStore).toISOString();
	const levels = soundingLevelsForDomain(domainName);

	// URL `.om` de base : on dérive de getOMUrlFor (qui sait construire le chemin
	// run/temps courant) en retirant la query `?variable=...`. C'est ce que
	// setToOmFile attend (le baseUrl sans paramètre de variable — cf. prefetch.ts
	// qui passe juste `<...>.om`).
	const sampleUrl = getOMUrlFor('temperature_1000hPa');
	if (!sampleUrl) {
		throw new Error('fetchColumn: URL .om indisponible (run inconnu ?)');
	}
	const omUrl = sampleUrl.split('?')[0];

	// Reader unique réutilisé (partage le cache de blocs ; pas de `dispose` entre
	// appels pour ne pas casser une lecture concurrente sérialisée juste après).
	if (!soundingReader) {
		soundingReader = new WeatherMapLayerFileReader(settings.fileReaderConfig);
	}
	const reader = soundingReader;
	const simpleReader = reader as unknown as SimpleReader;

	await reader.setToOmFile(omUrl);

	// Petite bounding box autour du point : on ne lit JAMAIS toute la grille.
	const bounds: [number, number, number, number] = [
		lng - BBOX_HALF_DEG,
		lat - BBOX_HALF_DEG,
		lng + BBOX_HALF_DEG,
		lat + BBOX_HALF_DEG
	];
	const ranges = getRanges(grid, bounds);
	// La grille est créée avec les `ranges` réduits : l'index calculé pour
	// (lat, lon) tient compte de l'offset de la sous-fenêtre (cf. minX/minY).
	const gridGetter = GridFactory.create(grid, ranges);
	const lonNormalized = normalizeLon(lng);

	// Lecture brute d'une variable + interpolation au point ; NaN si échec.
	const read: VariableReader = async (variable) => {
		if (signal?.aborted) return NaN;
		try {
			const data = await simpleReader.readSimpleVariable(variable, ranges, signal);
			if (!data?.values) return NaN;
			const value = gridGetter.getLinearInterpolatedValue(
				data.values as unknown as Float32Array,
				lat,
				lonNormalized
			);
			return Number.isFinite(value) ? value : NaN;
		} catch {
			return NaN;
		}
	};

	// Concurrence bornée (~8) pour les ~125 lectures (5 vars × 24 niveaux + surface).
	const limited = createLimiter(READ_CONCURRENCY);
	const boundedRead: VariableReader = (variable) => limited(() => read(variable));

	// Variables de surface lues en parallèle.
	const [t2m, rh2m, sp, u10, v10] = await Promise.all([
		boundedRead('temperature_2m'),
		boundedRead('relative_humidity_2m'),
		boundedRead('surface_pressure'),
		boundedRead('wind_u_component_10m'),
		boundedRead('wind_v_component_10m')
	]);

	const surface: SurfaceInput = {
		temperature: t2m,
		rh: rh2m,
		pressure: Number.isFinite(sp) ? sp : 1013,
		height: terrainElevation,
		u: u10,
		v: v10
	};

	return assembleColumn({
		lat,
		lng,
		validTime,
		levels,
		surface,
		read: boundedRead
	});
}

/** Limiteur de concurrence minimal (file d'attente FIFO). */
function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
	let active = 0;
	const queue: Array<() => void> = [];

	const next = () => {
		if (active >= max) return;
		const run = queue.shift();
		if (run) {
			active++;
			run();
		}
	};

	return <T>(task: () => Promise<T>): Promise<T> =>
		new Promise<T>((resolve, reject) => {
			queue.push(() => {
				task()
					.then(resolve, reject)
					.finally(() => {
						active--;
						next();
					});
			});
			next();
		});
}
