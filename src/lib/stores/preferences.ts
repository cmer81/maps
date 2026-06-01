import { MediaQuery } from 'svelte/reactivity';
import { type Writable, writable } from 'svelte/store';

import { clearBlockCache } from '@openmeteo/weather-map-layer';
import { setMode } from 'mode-watcher';
import { type Persisted, persisted } from 'svelte-persisted-store';

import {
	COMPLETE_DEFAULT_VALUES,
	DEFAULT_CACHE_BLOCK_SIZE_KB,
	DEFAULT_CACHE_MAX_BYTES_MB,
	DEFAULT_DOMAIN,
	DEFAULT_OPACITY,
	DEFAULT_PREFERENCES,
	DEFAULT_TILE_SIZE,
	DEFAULT_VARIABLE
} from '$lib/constants';
import { getInitialMetaData, getMetaData } from '$lib/metadata';

import { DEFAULT_SHOW_DEPARTMENTS, showDepartments } from './departments';
import { cacheBlockSizeKb, cacheMaxBytesMb, customColorScales } from './om-protocol-settings';
import { inProgress, latest, metaJson, modelRun, modelRunLocked, now, time } from './time';
import {
	DEFAULT_PRECIPITATION_UNIT,
	DEFAULT_TEMPERATURE_UNIT,
	DEFAULT_WIND_SPEED_UNIT,
	precipitationUnit,
	temperatureUnit,
	windSpeedUnit
} from './units';
import {
	domain,
	domainSelectionOpen,
	variable,
	variableSelectionExtended,
	variableSelectionOpen
} from './variables';
import { defaultVectorOptions, vectorOptions } from './vector';

export const defaultPreferences = DEFAULT_PREFERENCES;

export interface Preferences {
	globe: boolean;
	terrain: boolean;
	hillshade: boolean;
	clipWater: boolean;
	showScale: boolean;
}

export const preferences = persisted('preferences', defaultPreferences);

// URL object containing current url states setings and flags
export const url: Writable<URL> = writable();

export const advancedOpen = writable(false);
export const loading = writable(true);

export const tileSize: Persisted<64 | 128 | 256 | 512 | 1024 | 2048> = persisted(
	'tile_size',
	DEFAULT_TILE_SIZE
);

// check for retina / hd on first load, afterwards the tile-size won't be set
export const tileSizeSet = persisted('tile-size-set', false);

export const opacity = persisted('opacity', DEFAULT_OPACITY);
export const opacity2 = persisted('opacity2', 70);
export const exportFrameVisible = persisted('export-frame-visible', false);

// Légende couleur repliée (bande fine) — repliée par défaut, dépliable par l'utilisateur, mémorisé.
export const scaleCollapsed = persisted('scale-collapsed', true);

// Hauteur (en px) du chrome bas (la barre de temps) mesurée à l'exécution.
// Sert au cadre d'export PNG/Série pour ne pas étendre le voile sombre par-dessus
// la barre du temps. Valeur initiale prudente (~120px) ; le composant la met à jour.
export const bottomChromeHeight = writable(120);

export { cacheBlockSizeKb, cacheMaxBytesMb } from './om-protocol-settings';

export const localStorageVersion: Persisted<string | undefined> = persisted(
	'local-storage-version',
	undefined
);

export const helpOpen = writable(false);

export const typing = writable(false);

export const resetStates = async () => {
	modelRunLocked.set(false);

	latest.set(undefined);
	inProgress.set(undefined);
	modelRun.set(undefined);
	await getInitialMetaData();
	metaJson.set(await getMetaData());

	preferences.set(defaultPreferences);
	vectorOptions.set(defaultVectorOptions);
	showDepartments.set(DEFAULT_SHOW_DEPARTMENTS);

	loading.set(false);

	const currentTimeStep = new Date();
	currentTimeStep.setUTCHours(currentTimeStep.getUTCHours() + 1, 0, 0, 0);
	now.set(new Date());
	time.set(new Date(currentTimeStep));

	domain.set(DEFAULT_DOMAIN);
	variable.set(DEFAULT_VARIABLE);

	domainSelectionOpen.set(false);
	variableSelectionOpen.set(false);
	variableSelectionExtended.set(undefined);

	tileSize.set(DEFAULT_TILE_SIZE);
	tileSizeSet.set(false);

	opacity.set(DEFAULT_OPACITY);

	cacheBlockSizeKb.set(DEFAULT_CACHE_BLOCK_SIZE_KB);
	cacheMaxBytesMb.set(DEFAULT_CACHE_MAX_BYTES_MB);

	customColorScales.set({});

	temperatureUnit.set(DEFAULT_TEMPERATURE_UNIT);
	precipitationUnit.set(DEFAULT_PRECIPITATION_UNIT);
	windSpeedUnit.set(DEFAULT_WIND_SPEED_UNIT);

	helpOpen.set(false);
	scaleCollapsed.set(true);

	setMode('dark');

	await clearBlockCache();
};

// used to check against url search parameters
export const completeDefaultValues = COMPLETE_DEFAULT_VALUES;

export const desktop = new MediaQuery('min-width: 768px');
