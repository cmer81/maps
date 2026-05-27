import { tick } from 'svelte';
import { get } from 'svelte/store';

import {
	type Domain,
	type DomainMetaDataJson,
	closestModelRun,
	defaultOmProtocolSettings,
	domainStep
} from '@openmeteo/weather-map-layer';
import { mode } from 'mode-watcher';

import { replaceState } from '$app/navigation';

import { showDepartments } from '$lib/stores/departments';
import { showLabels } from '$lib/stores/labels';
import { map as m } from '$lib/stores/map';
import {
	type Preferences,
	completeDefaultValues,
	opacity2,
	preferences as p,
	tileSize as tS,
	url as u
} from '$lib/stores/preferences';
import { metaJson as mJ, modelRun as mR, modelRunLocked as mRL, time } from '$lib/stores/time';
import { domain as d, layer2Enabled, variable as v, variable2 } from '$lib/stores/variables';
import { vectorOptions as vO, windOverlayEnabled, windOverlayLevel } from '$lib/stores/vector';

import { ANOMALY_DOMAIN, ANOMALY_VARIABLE } from '$lib/constants';

import {
	CLIP_COUNTRIES_PARAM,
	parseClipCountriesParam,
	serializeClipCountriesParam
} from './clipping';
import { fmtModelRun, fmtSelectedTime, getBaseUri, hashValue, pad } from './helpers';
import { getModelsBucketUrl, getOmWorkerUrl, isCumulFlagEnabled } from './runtime-env';
import { clippingCountryCodes } from './stores/clipping';
import { omProtocolSettings } from './stores/om-protocol-settings';
import { formatISOUTCWithZ, parseISOWithoutTimezone } from './time-format';

export const updateUrl = async (
	urlParam?: string,
	newValue?: string,
	defaultValue?: string
): Promise<void> => {
	const url = get(u);
	if (!url) return;

	if (!defaultValue && urlParam && completeDefaultValues[urlParam]) {
		defaultValue = String(completeDefaultValues[urlParam]);
	}

	if (urlParam) {
		if (newValue && newValue !== defaultValue) {
			url.searchParams.set(urlParam, newValue);
		} else {
			url.searchParams.delete(urlParam);
		}
	}

	await tick();
	let fullUrl: string;
	try {
		const map = get(m);
		if (map) {
			fullUrl = String(url) + map._hash.getHashString();
		} else {
			fullUrl = String(url);
		}
	} catch {
		fullUrl = String(url);
	}

	replaceState(fullUrl, {});
};

export const urlParamsToPreferences = () => {
	const url = get(u);
	const preferences = get(p);
	const vectorOptions = get(vO);

	const params = new URLSearchParams(url.search);

	const urlModelTime = params.get('model_run');
	if (urlModelTime?.length === 15) {
		mR.set(parseISOWithoutTimezone(urlModelTime));
		mRL.set(true);
	}

	const urlTime = params.get('time');
	if (urlTime?.length === 15) {
		time.set(parseISOWithoutTimezone(urlTime));
	}

	const syncBoolParam = (paramKey: string, prefKey: keyof Preferences, writeIfDefault: boolean) => {
		const raw = params.get(paramKey);
		if (raw !== null) {
			preferences[prefKey] = raw === 'true';
		} else if (writeIfDefault ? true : preferences[prefKey]) {
			url.searchParams.set(paramKey, String(preferences[prefKey]));
		}
	};

	syncBoolParam('globe', 'globe', false);
	syncBoolParam('terrain', 'terrain', false);
	syncBoolParam('hillshade', 'hillshade', false);
	syncBoolParam('clip_water', 'clipWater', false);

	const domain = params.get('domain');
	if (domain) {
		d.set(domain);
	} else if (get(d) !== 'dwd_icon') {
		url.searchParams.set('domain', get(d));
	}

	const variable = params.get('variable');
	if (variable) {
		v.set(variable);
	} else if (get(v) !== 'temperature_2m') {
		url.searchParams.set('variable', get(v));
	}

	// If cumul is disabled but the active variable (from URL or localStorage)
	// is a cumul, downgrade to its base variable so the rest of the app sees a
	// renderable value.
	if (!isCumulEnabled()) {
		const current = get(v);
		const m = current.match(CUMUL_VARIABLE_REGEX);
		if (m?.groups) {
			v.set(m.groups.base);
			url.searchParams.delete('variable');
			if (m.groups.base !== 'temperature_2m') {
				url.searchParams.set('variable', m.groups.base);
			}
		}
	}

	const variable2Param = params.get('variable2');
	if (variable2Param) {
		variable2.set(variable2Param);
	} else if (get(variable2) !== 'precipitation') {
		url.searchParams.set('variable2', get(variable2));
	}

	const layer2Param = params.get('layer2');
	if (layer2Param !== null) {
		layer2Enabled.set(layer2Param === 'true');
	} else if (get(layer2Enabled)) {
		url.searchParams.set('layer2', 'true');
	}

	const opacity2Param = params.get('opacity2');
	if (opacity2Param !== null) {
		const n = Number(opacity2Param);
		if (Number.isFinite(n)) opacity2.set(n);
	} else if (get(opacity2) !== 70) {
		url.searchParams.set('opacity2', String(get(opacity2)));
	}

	const arrowsRaw = params.get('arrows');
	if (arrowsRaw !== null) {
		vectorOptions.arrows = arrowsRaw === 'true';
	} else if (!vectorOptions.arrows) {
		url.searchParams.set('arrows', String(vectorOptions.arrows));
	}

	const contoursRaw = params.get('contours');
	if (contoursRaw !== null) {
		vectorOptions.contours = contoursRaw === 'true';
	} else if (vectorOptions.contours) {
		url.searchParams.set('contours', String(vectorOptions.contours));
	}

	const intervalRaw = params.get('interval');
	if (intervalRaw !== null) {
		vectorOptions.contourInterval = Number(intervalRaw);
	} else if (vectorOptions.contourInterval !== 2) {
		url.searchParams.set('interval', String(vectorOptions.contourInterval));
	}

	const windOverlayRaw = params.get('wind_overlay');
	if (windOverlayRaw !== null) {
		windOverlayEnabled.set(windOverlayRaw === 'true');
	} else if (get(windOverlayEnabled)) {
		url.searchParams.set('wind_overlay', 'true');
	}

	const windOverlayLevelRaw = params.get('wind_overlay_level');
	if (windOverlayLevelRaw !== null) {
		windOverlayLevel.set(windOverlayLevelRaw);
	} else if (get(windOverlayLevel) !== '10m') {
		url.searchParams.set('wind_overlay_level', get(windOverlayLevel));
	}

	const labelsRaw = params.get('labels');
	if (labelsRaw !== null) {
		showLabels.set(labelsRaw === 'true');
	} else if (get(showLabels)) {
		url.searchParams.set('labels', 'true');
	}

	const departmentsRaw = params.get('departments');
	if (departmentsRaw !== null) {
		showDepartments.set(departmentsRaw === 'true');
	} else if (get(showDepartments)) {
		url.searchParams.set('departments', 'true');
	}

	const clipCountries = parseClipCountriesParam(params.get(CLIP_COUNTRIES_PARAM));
	if (clipCountries.length > 0) {
		clippingCountryCodes.set(clipCountries);
	} else {
		const currentCodes = get(clippingCountryCodes);
		const serialized = serializeClipCountriesParam(currentCodes);
		if (serialized) {
			url.searchParams.set(CLIP_COUNTRIES_PARAM, serialized);
		}
	}

	vO.set(vectorOptions);
	p.set(preferences);
};

/** Cumul variables (`*_sum_Nh`) are an opt-in feature on top of the worker.
 * Disabled when the cumul flag is off *or* when the worker URL isn't
 * configured. Labels are gated separately on the worker URL alone. */
export const isCumulEnabled = (): boolean => Boolean(getOmWorkerUrl()) && isCumulFlagEnabled();

/**
 * Builds the path prefix expected by infoclimat-om-worker so omProtocol can
 * fetch and aggregate without query-string params (which are stripped before
 * the actual HTTP fetch). The structure mirrors Open-Meteo S3 with three extra
 * path segments (base variable + window) prepended after `/v1/sum/`.
 *
 * Returns undefined when cumul is disabled — callers fall back to the upstream
 * Open-Meteo path with the base variable.
 */
const buildWorkerBase = (
	domain: string,
	baseVariable: string,
	hours: number
): string | undefined => {
	if (!isCumulEnabled()) return undefined;
	return `${getOmWorkerUrl().replace(/\/$/, '')}/v1/sum/${domain}/${baseVariable}/${hours}h`;
};

let cachedClippingJson = '';
let cachedClippingHash = '';
let cachedColorJson = '';
let cachedColorHash = '';

const memorisedHash = (json: string, cachedJson: string, cachedHash: string) => {
	if (json === cachedJson) return { json, hash: cachedHash };
	return { json, hash: hashValue(json) };
};

/** Matches cumul-style variable names like `precipitation_sum_24h`. */
export const CUMUL_VARIABLE_REGEX = /^(?<base>.+)_sum_(?<hours>\d+)h$/;

/**
 * For an N-hour cumul ending at `selectedTime`, the worker needs source hourly
 * OMfiles covering `[selectedTime - (hours-1)h, selectedTime]`. Open-Meteo's
 * spatial bucket only contains a run's *forecast* hours (H+0 onwards), so when
 * the user-selected `modelRun` is later than the start of that window, every
 * pre-run hour 404s and the worker returns 400 (post-fix) or 502 (pre-fix).
 *
 * Snap the run to 00Z of the window-start day in that case — it's the same
 * anchor `/v1/sum_since_0h` already enforces, guarantees `windowStart >= run`,
 * and maximizes cache reuse across users hitting the same cumul.
 *
 * When the user's run is already compatible (e.g. they picked an earlier run
 * than 00Z, or the window falls fully after the run), we leave it untouched.
 */
export const resolveCumulModelRun = (modelRun: Date, selectedTime: Date, hours: number): Date => {
	const windowStartMs = selectedTime.getTime() - (hours - 1) * 3600_000;
	if (windowStartMs >= modelRun.getTime()) return modelRun;
	const ws = new Date(windowStartMs);
	return new Date(Date.UTC(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate(), 0, 0, 0, 0));
};

/** Formate une date en `YYYY-MM-DD` (UTC). */
export const fmtDateYMD = (d: Date): string =>
	`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Début du jour UTC courant. */
const startOfUTCDay = (d: Date): Date =>
	new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));

/** Phase (= préfixe bucket) d'une date d'anomalie :
 *  - futur/aujourd'hui → `forecast`
 *  - passé présent dans `provisionalDates` → `provisional` (estimation ARPEGE)
 *  - passé sinon → `observed` (réanalyse ERA5 définitive).
 *  `provisionalDates` = set de dates `YYYY-MM-DD`. */
export const anomalyPhase = (
	selected: Date,
	now: Date,
	provisionalDates: Set<string> = new Set()
): 'observed' | 'forecast' | 'provisional' => {
	if (selected.getTime() >= startOfUTCDay(now).getTime()) return 'forecast';
	return provisionalDates.has(fmtDateYMD(selected)) ? 'provisional' : 'observed';
};

/** Extrait du metaJson le set des dates provisoires (`YYYY-MM-DD`). */
export const provisionalDateSet = (metaJson: unknown): Set<string> =>
	new Set(
		((metaJson as { provisional_times?: string[] } | undefined)?.provisional_times ?? []).map((t) =>
			t.slice(0, 10)
		)
	);

/** Suffixe `&color_hash=…` quand l'échelle de couleurs diffère du défaut du
 *  package (couleurs custom de l'utilisateur, ou nos palettes infoclimat/anomalie).
 *  Force un re-render des tuiles quand les couleurs changent. */
const colorHashSuffix = (): string => {
	const s = get(omProtocolSettings);
	const colorJson = JSON.stringify(s.colorScales);
	if (
		s.colorScales !== undefined &&
		colorJson !== JSON.stringify(defaultOmProtocolSettings.colorScales)
	) {
		const cached = memorisedHash(colorJson, cachedColorJson, cachedColorHash);
		cachedColorJson = cached.json;
		cachedColorHash = cached.hash;
		return `&color_hash=${cached.hash}`;
	}
	return '';
};

export const getOMUrlFor = (variable: string): string | undefined => {
	const domain = get(d);
	const modelRun = get(mR);
	if (!modelRun) return undefined;
	const selectedTime = get(time);

	if (domain === ANOMALY_DOMAIN) {
		const phase = anomalyPhase(selectedTime, new Date(), provisionalDateSet(get(mJ)));
		const base = getModelsBucketUrl().replace(/\/$/, '');
		return (
			`${base}/anomaly/temperature_2m/${phase}/${fmtDateYMD(selectedTime)}.om` +
			`?variable=${ANOMALY_VARIABLE}` +
			colorHashSuffix()
		);
	}

	const cumulMatch = variable.match(CUMUL_VARIABLE_REGEX);
	const workerBase = cumulMatch
		? buildWorkerBase(domain, cumulMatch.groups!.base, Number(cumulMatch.groups!.hours))
		: undefined;

	// When the worker is disabled but the user (or a stale URL) still asks for
	// a cumul variable, degrade to the base variable on upstream Open-Meteo so
	// the page renders *something* instead of a crash.
	const effectiveVariable = cumulMatch && !workerBase ? cumulMatch.groups!.base : variable;

	const base = workerBase ?? `${getBaseUri(domain)}/data_spatial/${domain}`;

	const effectiveModelRun =
		cumulMatch && workerBase
			? resolveCumulModelRun(modelRun, selectedTime, Number(cumulMatch.groups!.hours))
			: modelRun;

	let result = `${base}/${fmtModelRun(effectiveModelRun)}/${fmtSelectedTime(selectedTime)}.om`;
	result += `?variable=${effectiveVariable}`;

	if (mode.current === 'dark') result += '&dark=true';
	const vectorOptions = get(vO);
	if (vectorOptions.grid) result += '&grid=true';
	if (vectorOptions.arrows) result += '&arrows=true';
	if (vectorOptions.contours) result += '&contours=true';
	if (vectorOptions.contours && !vectorOptions.breakpoints)
		result += `&intervals=${vectorOptions.contourInterval}`;

	const tileSize = get(tS);
	if (tileSize !== 256) result += `&tile_size=${tileSize}`;

	const omProtocolSettingsState = get(omProtocolSettings);
	if (
		omProtocolSettingsState.clippingOptions !== undefined &&
		omProtocolSettingsState.clippingOptions !== defaultOmProtocolSettings.clippingOptions
	) {
		const clippingJson = JSON.stringify(omProtocolSettingsState.clippingOptions);
		const cached = memorisedHash(clippingJson, cachedClippingJson, cachedClippingHash);
		cachedClippingJson = cached.json;
		cachedClippingHash = cached.hash;
		result += `&clipping_options_hash=${cached.hash}`;
	}

	result += colorHashSuffix();

	return result;
};

export const getOMUrl = (): string | undefined => getOMUrlFor(get(v));

/**
 * Builds the om:// URL for the wind-overlay vector layer at the configured level.
 * Returns undefined when wind overlay is disabled or model run is unknown.
 */
export const getWindOverlayUrl = (): string | undefined => {
	if (!get(windOverlayEnabled)) return undefined;
	const level = get(windOverlayLevel);
	// weather-map-layer reads U/V components and renders arrows when arrows=true.
	return getOMUrlFor(`wind_u_component_${level}`);
};

export const getNextOmUrls = (
	_omUrl: string,
	domain: Domain,
	metaJson: DomainMetaDataJson | undefined
): [string | undefined, string | undefined] => {
	const date = get(time);
	const dateString = formatISOUTCWithZ(date);

	// Pseudo-domaine anomalie : le préchargement suit le layout bucket
	// (`anomaly/temperature_2m/{phase}/{date}.om`), pas le schéma data_spatial.
	if (domain.value === ANOMALY_DOMAIN) {
		if (!metaJson) return [undefined, undefined];
		const idx = metaJson.valid_times.findIndex((s) => s === dateString);
		const bucket = getModelsBucketUrl().replace(/\/$/, '');
		const now = new Date();
		const provisional = provisionalDateSet(metaJson);
		const buildAnomalyUrl = (i: number): string | undefined => {
			const t = metaJson.valid_times[i];
			if (!t) return undefined;
			const d2 = new Date(t);
			if (isNaN(d2.getTime())) return undefined;
			return (
				`${bucket}/anomaly/temperature_2m/${anomalyPhase(d2, now, provisional)}/${fmtDateYMD(d2)}.om` +
				`?variable=${ANOMALY_VARIABLE}`
			);
		};
		return [buildAnomalyUrl(idx + 1), buildAnomalyUrl(idx - 1)];
	}

	const base = `https://map-tiles.open-meteo.com/data_spatial/${domain.value}`;

	let prevDate: Date;
	let nextDate: Date;

	if (metaJson) {
		const idx = metaJson.valid_times.findIndex((s) => s === dateString);
		prevDate = new Date(metaJson.valid_times[idx + 1]);
		nextDate = new Date(metaJson.valid_times[idx - 1]);
	} else {
		prevDate = domainStep(date, domain.time_interval, 'backward');
		nextDate = domainStep(date, domain.time_interval, 'forward');
	}

	const currentModelRun = metaJson ? new Date(metaJson.reference_time) : undefined;

	const clampRun = (run: Date): Date =>
		currentModelRun && run > currentModelRun ? currentModelRun : run;

	const prevModelRun = clampRun(closestModelRun(prevDate, domain.model_interval));
	const nextModelRun = clampRun(closestModelRun(nextDate, domain.model_interval));

	const prevUrl = !isNaN(prevDate.getTime())
		? `${base}/${fmtModelRun(prevModelRun)}/${fmtSelectedTime(prevDate)}.om`
		: undefined;
	const nextUrl = !isNaN(nextDate.getTime())
		? `${base}/${fmtModelRun(nextModelRun)}/${fmtSelectedTime(nextDate)}.om`
		: undefined;

	return [prevUrl, nextUrl];
};
