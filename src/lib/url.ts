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
import { modelRun as mR, modelRunLocked as mRL, time } from '$lib/stores/time';
import { domain as d, layer2Enabled, variable as v, variable2 } from '$lib/stores/variables';
import { vectorOptions as vO, windOverlayEnabled, windOverlayLevel } from '$lib/stores/vector';

import {
	CLIP_COUNTRIES_PARAM,
	parseClipCountriesParam,
	serializeClipCountriesParam
} from './clipping';
import { fmtModelRun, fmtSelectedTime, getBaseUri, hashValue } from './helpers';
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

/**
 * Builds the path prefix expected by infoclimat-om-worker so omProtocol can
 * fetch and aggregate without query-string params (which are stripped before
 * the actual HTTP fetch). The structure mirrors Open-Meteo S3 with three extra
 * path segments (base variable + window) prepended after `/v1/sum/`.
 */
const buildWorkerBase = (domain: string, baseVariable: string, hours: number): string => {
	const workerUrl = import.meta.env.VITE_OM_WORKER_URL;
	if (!workerUrl) {
		throw new Error(
			'Cumul variable requested but VITE_OM_WORKER_URL is not set. ' +
				'Configure it in .env to enable the precipitation_sum_*h variables.'
		);
	}
	return `${String(workerUrl).replace(/\/$/, '')}/v1/sum/${domain}/${baseVariable}/${hours}h`;
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
const CUMUL_VARIABLE_REGEX = /^(?<base>.+)_sum_(?<hours>\d+)h$/;

export const getOMUrlFor = (variable: string): string | undefined => {
	const domain = get(d);
	const modelRun = get(mR);
	if (!modelRun) return undefined;
	const selectedTime = get(time);

	const cumulMatch = variable.match(CUMUL_VARIABLE_REGEX);
	const base = cumulMatch
		? buildWorkerBase(domain, cumulMatch.groups!.base, Number(cumulMatch.groups!.hours))
		: `${getBaseUri(domain)}/data_spatial/${domain}`;

	let result = `${base}/${fmtModelRun(modelRun)}/${fmtSelectedTime(selectedTime)}.om`;
	result += `?variable=${variable}`;

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

	const colorJson = JSON.stringify(omProtocolSettingsState.colorScales);
	if (
		omProtocolSettingsState.colorScales !== undefined &&
		colorJson !== JSON.stringify(defaultOmProtocolSettings.colorScales)
	) {
		const cached = memorisedHash(colorJson, cachedColorJson, cachedColorHash);
		cachedColorJson = cached.json;
		cachedColorHash = cached.hash;
		result += `&color_hash=${cached.hash}`;
	}

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
	const base = `https://map-tiles.open-meteo.com/data_spatial/${domain.value}`;
	const date = get(time);
	const dateString = formatISOUTCWithZ(date);

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
