// MapLibre wiring for the French departments contours overlay.
//
// Lit la couche vectorielle `boundary` des tuiles OpenFreeMap déjà chargées par
// le fond (source `openmaptiles`), filtrée sur `admin_level == 6` (départements
// FR). Aucun asset bundlé : les lignes viennent des MÊMES données OSM que le
// fond → raccord topologique parfait. La visibilité suit le store
// `showDepartments` (pattern de `labels-layer.ts`).
import { get } from 'svelte/store';

import { basemapTheme } from '$lib/stores/basemap-theme';
import { showDepartments } from '$lib/stores/departments';
import { map as mStore } from '$lib/stores/map';

import { BEFORE_LAYER_VECTOR } from './constants';

import type maplibregl from 'maplibre-gl';

export const DEPARTMENTS_LAYER_ID = 'omDepartmentsLayer';

const BASEMAP_SOURCE_ID = 'openmaptiles';
const BOUNDARY_SOURCE_LAYER = 'boundary';

/**
 * Spec du layer `line` des départements. Pur (testable) : couleur dépendante du
 * FOND DE CARTE (pas du chrome, toujours sombre), visibilité figée à la création.
 */
export const buildDepartmentsLineLayer = (
	isDark: boolean,
	visible: boolean
): maplibregl.LineLayerSpecification => ({
	id: DEPARTMENTS_LAYER_ID,
	type: 'line',
	source: BASEMAP_SOURCE_ID,
	'source-layer': BOUNDARY_SOURCE_LAYER,
	filter: ['==', ['get', 'admin_level'], 6],
	layout: {
		visibility: visible ? 'visible' : 'none'
	},
	paint: {
		'line-color': isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)',
		'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 8, 0.9, 12, 1.4],
		'line-opacity': 0.85
	}
});

/**
 * Idempotent : enregistre le layer une fois. Sûr à rappeler après un re-style
 * (`setStyle` purge les layers custom ; ce hook les recrée avec la couleur du
 * thème de fond courant).
 */
export const ensureDepartmentsLayer = (): void => {
	const map = get(mStore);
	if (!map) return;
	if (map.getLayer(DEPARTMENTS_LAYER_ID)) return;

	const isDark = get(basemapTheme) === 'dark';
	const layer = buildDepartmentsLineLayer(isDark, get(showDepartments));
	map.addLayer(layer, map.getLayer(BEFORE_LAYER_VECTOR) ? BEFORE_LAYER_VECTOR : undefined);
};

/**
 * Applique la visibilité selon `showDepartments` (par défaut le store courant).
 * Ne fetch plus rien : `ensureDepartmentsLayer()` puis bascule `setLayoutProperty`
 * (défensif si layer absent). Pattern de `applyLabelsVisibility()`.
 */
export const refreshDepartments = (visible: boolean = get(showDepartments)): void => {
	const map = get(mStore);
	if (!map) return;

	ensureDepartmentsLayer();
	if (!map.getLayer(DEPARTMENTS_LAYER_ID)) return;

	map.setLayoutProperty(DEPARTMENTS_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
};
