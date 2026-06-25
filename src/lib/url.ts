import { tick } from 'svelte';
import { get } from 'svelte/store';

import { defaultOmProtocolSettings } from '@openmeteo/weather-map-layer';
import { mode } from 'mode-watcher';

import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';

import { DEFAULT_SHOW_DEPARTMENTS, showDepartments } from '$lib/stores/departments';
import { DEFAULT_SHOW_LABELS, showLabels } from '$lib/stores/labels';
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
import {
	gridValues,
	vectorOptions as vO,
	windOverlayEnabled,
	windOverlayLevel
} from '$lib/stores/vector';

import {
	ANOMALY_DOMAIN,
	ANOMALY_VARIABLE,
	DAILY_FILE_DOMAINS,
	DEFAULT_PREFERENCES
} from '$lib/constants';

import {
	CLIP_COUNTRIES_PARAM,
	parseClipCountriesParam,
	serializeClipCountriesParam
} from './clipping';
import { fmtDateYMD, fmtModelRun, fmtSelectedTime, getBaseUri, hashValue } from './helpers';
import { getModelsBucketUrl } from './runtime-env';
import { clippingCountryCodes } from './stores/clipping';
import { omProtocolSettings } from './stores/om-protocol-settings';
import { parseISOWithoutTimezone } from './time-format';
import { deriveDisplayedWindLevel, isWindVariable } from './vector-styles';

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

	// `replaceState` (SvelteKit) lève hors navigateur — no-op en prerender / tests
	// node. La mise à jour du store URL ci-dessus reste effective dans tous les cas.
	if (browser) replaceState(fullUrl, {});
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

	// N'écrit le paramètre dans l'URL que si la valeur diffère du défaut, pour ne
	// pas polluer chaque URL avec les défauts (ex. hillshade=true par défaut).
	const syncBoolParam = (paramKey: string, prefKey: keyof Preferences) => {
		const raw = params.get(paramKey);
		if (raw !== null) {
			preferences[prefKey] = raw === 'true';
		} else if (preferences[prefKey] !== DEFAULT_PREFERENCES[prefKey]) {
			url.searchParams.set(paramKey, String(preferences[prefKey]));
		}
	};

	syncBoolParam('globe', 'globe');
	syncBoolParam('terrain', 'terrain');
	syncBoolParam('hillshade', 'hillshade');
	syncBoolParam('clip_water', 'clipWater');

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

	const gridValuesRaw = params.get('grid_values');
	if (gridValuesRaw !== null) {
		gridValues.set(gridValuesRaw === 'true');
	} else if (get(gridValues)) {
		url.searchParams.set('grid_values', 'true');
	}

	const departmentsRaw = params.get('departments');
	if (departmentsRaw !== null) {
		showDepartments.set(departmentsRaw === 'true');
	} else if (get(showDepartments) !== DEFAULT_SHOW_DEPARTMENTS) {
		url.searchParams.set('departments', String(get(showDepartments)));
	}

	const labelsRaw = params.get('labels');
	if (labelsRaw !== null) {
		showLabels.set(labelsRaw === 'true');
	} else if (get(showLabels) !== DEFAULT_SHOW_LABELS) {
		url.searchParams.set('labels', String(get(showLabels)));
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

let cachedClippingJson = '';
let cachedClippingHash = '';
let cachedColorJson = '';
let cachedColorHash = '';

const memorisedHash = (json: string, cachedJson: string, cachedHash: string) => {
	if (json === cachedJson) return { json, hash: cachedHash };
	return { json, hash: hashValue(json) };
};

// `fmtDateYMD` vit dans helpers.ts (à côté de fmtSelectedTime) ; ré-exporté ici
// pour les consommateurs historiques (tests, modules) qui l'importent de `$lib/url`.
export { fmtDateYMD };

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

/** Surcharge ponctuelle des flags vecteur d'une URL (par défaut : lus depuis le
 *  store `vectorOptions`). Sert à bâtir une source ciblée — p. ex. l'overlay vent
 *  qui ne veut QUE les flèches, sans les contours/grille de la variable. */
type VectorFlagOverride = { grid?: boolean; arrows?: boolean; contours?: boolean };

export const getOMUrlFor = (
	variable: string,
	timeOverride?: Date,
	vectorOverride?: VectorFlagOverride
): string | undefined => {
	const domain = get(d);
	const modelRun = get(mR);
	if (!modelRun) return undefined;
	const selectedTime = timeOverride ?? get(time);

	if (domain === ANOMALY_DOMAIN) {
		const phase = anomalyPhase(selectedTime, new Date(), provisionalDateSet(get(mJ)));
		const base = getModelsBucketUrl().replace(/\/$/, '');
		return (
			`${base}/anomaly/temperature_2m/${phase}/${fmtDateYMD(selectedTime)}.om` +
			`?variable=${ANOMALY_VARIABLE}` +
			colorHashSuffix()
		);
	}

	const base = `${getBaseUri(domain)}/data_spatial/${domain}`;
	// Domaines journaliers : 1 OMfile par jour nommé `YYYY-MM-DD.om` (= minuit
	// UTC), pas `…THHMM.om`. Le run (`fmtModelRun`) reste identique.
	const fileName = DAILY_FILE_DOMAINS.has(domain)
		? fmtDateYMD(selectedTime)
		: fmtSelectedTime(selectedTime);
	let result = `${base}/${fmtModelRun(modelRun)}/${fileName}.om`;
	result += `?variable=${variable}`;

	if (mode.current === 'dark') result += '&dark=true';
	const vectorOptions = get(vO);
	const grid = vectorOverride?.grid ?? (vectorOptions.grid || get(gridValues));
	const arrows = vectorOverride?.arrows ?? vectorOptions.arrows;
	const contours = vectorOverride?.contours ?? vectorOptions.contours;
	if (grid) result += '&grid=true';
	if (arrows) result += '&arrows=true';
	if (contours) result += '&contours=true';
	if (contours && !vectorOptions.breakpoints)
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
 * Niveau de vent que l'`arrowManager` doit rendre, ou `null` s'il ne dessine pas
 * les flèches :
 *  - flèches désactivées → null ;
 *  - overlay vent explicite → le niveau choisi (inchangé) ;
 *  - mode « selon la variable affichée » + variable déjà de vent → null
 *    (le vectorManager rend les flèches, comportement historique) ;
 *  - mode « selon la variable affichée » + variable non-vent → niveau dérivé
 *    (`deriveDisplayedWindLevel`), ou null si aucun vent publié.
 */
export const resolveWindArrowLevel = (): string | null => {
	if (!get(vO).arrows) return null;
	if (get(windOverlayEnabled)) return get(windOverlayLevel);
	const displayed = get(v);
	if (isWindVariable(displayed)) return null;
	return deriveDisplayedWindLevel(displayed, get(mJ)?.variables ?? []);
};

/**
 * URL om:// flèches-seules pour l'arrowManager, ou `undefined` si aucune flèche
 * d'overlay/fallback à dessiner. On force `contours`/`grid` à false : contours et
 * étiquettes suivent la variable affichée (rendus par le vectorManager).
 */
export const getWindOverlayUrl = (): string | undefined => {
	const level = resolveWindArrowLevel();
	if (!level) return undefined;
	return getOMUrlFor(`wind_u_component_${level}`, undefined, { contours: false, grid: false });
};
