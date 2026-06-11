// MapLibre wiring for the French departments contours overlay.
//
// Source GeoJSON dérivée d'OpenStreetMap (`admin_level=6`, même famille de
// données que le fond OpenFreeMap), simplifiée et bundlée (`static/departements.geojson`).
// Bundlée plutôt que lue dans la couche `boundary` du fond car celui-ci ne porte
// `admin_level=6` qu'à partir du zoom 9 — invisible à l'échelle France (z5-8).
// Le fichier est fetché paresseusement à la première activation puis caché en
// portée module ; le toggle bascule ensuite la `visibility` (pattern de
// `labels-layer.ts`), sans re-fetch.
import { get } from 'svelte/store';

import { basemapTheme } from '$lib/stores/basemap-theme';
import { showDepartments } from '$lib/stores/departments';
import { map as mStore } from '$lib/stores/map';

import { BEFORE_LAYER_VECTOR, DEPARTMENTS_GEOJSON_URL } from './constants';

import type maplibregl from 'maplibre-gl';

export const DEPARTMENTS_SOURCE_ID = 'omDepartmentsSource';
export const DEPARTMENTS_LAYER_ID = 'omDepartmentsLayer';

type DepartmentsFeatureCollection = GeoJSON.FeatureCollection<
	GeoJSON.MultiPolygon | GeoJSON.Polygon
>;

const emptyFc = (): DepartmentsFeatureCollection => ({ type: 'FeatureCollection', features: [] });

let cachedData: DepartmentsFeatureCollection | undefined;
let inflight: Promise<DepartmentsFeatureCollection> | undefined;

const fetchDepartments = async (): Promise<DepartmentsFeatureCollection> => {
	if (cachedData) return cachedData;
	if (inflight) return inflight;
	inflight = (async () => {
		const res = await fetch(DEPARTMENTS_GEOJSON_URL);
		if (!res.ok) throw new Error(`departments GeoJSON HTTP ${res.status}`);
		cachedData = (await res.json()) as DepartmentsFeatureCollection;
		return cachedData;
	})();
	try {
		return await inflight;
	} finally {
		inflight = undefined;
	}
};

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
	source: DEPARTMENTS_SOURCE_ID,
	// Masqué dès z>=9 : à partir de ce zoom, le fond OpenFreeMap porte lui-même
	// `admin_level=6` (cf. en-tête). On bascule alors sur le tracé natif (géométrie
	// fine) au lieu de superposer notre GeoJSON simplifié — évite le double trait.
	maxzoom: 9,
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
 * Idempotent : enregistre la source (vide) + le layer une fois. Sûr à rappeler
 * après un re-style (`setStyle` purge les sources/layers custom ; ce hook les
 * recrée avec la couleur du thème de fond courant). Les données déjà fetchées
 * sont réinjectées par `refreshDepartments`.
 */
export const ensureDepartmentsLayer = (): void => {
	const map = get(mStore);
	if (!map) return;

	if (!map.getSource(DEPARTMENTS_SOURCE_ID)) {
		map.addSource(DEPARTMENTS_SOURCE_ID, { type: 'geojson', data: cachedData ?? emptyFc() });
	}
	if (!map.getLayer(DEPARTMENTS_LAYER_ID)) {
		const isDark = get(basemapTheme) === 'dark';
		const layer = buildDepartmentsLineLayer(isDark, get(showDepartments));
		map.addLayer(layer, map.getLayer(BEFORE_LAYER_VECTOR) ? BEFORE_LAYER_VECTOR : undefined);
	}
};

/**
 * Applique la visibilité selon `showDepartments` (par défaut le store courant).
 * Au premier affichage, fetch paresseux du GeoJSON puis `setData` ; ensuite la
 * donnée est cachée et seul la `visibility` bascule (pas de re-fetch). Défensif
 * si la carte/source n'est pas prête.
 */
export const refreshDepartments = async (
	visible: boolean = get(showDepartments)
): Promise<void> => {
	const map = get(mStore);
	if (!map) return;

	ensureDepartmentsLayer();
	if (!map.getLayer(DEPARTMENTS_LAYER_ID)) return;

	map.setLayoutProperty(DEPARTMENTS_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
	if (!visible) return;

	try {
		const data = await fetchDepartments();
		// Le toggle a pu être recoupé pendant le fetch.
		if (!get(showDepartments)) return;
		const src = map.getSource(DEPARTMENTS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
		src?.setData(data);
	} catch (err) {
		console.warn('[departments] fetch failed', err);
	}
};
