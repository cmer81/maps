// MapLibre wiring for the French departments contours overlay.
//
// Owns: a single geojson source + a line layer placed above the raster.
// Drives: refresh when the toggle changes. Source GeoJSON is fetched lazily
// on first activation, then cached in module scope — subsequent toggles are
// instantaneous.
import { get } from 'svelte/store';

import maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';

import { showDepartments } from '$lib/stores/departments';
import { map as mStore } from '$lib/stores/map';

import { BEFORE_LAYER_VECTOR, DEPARTMENTS_GEOJSON_URL } from './constants';

const SOURCE_ID = 'omDepartmentsSource';
const LAYER_ID = 'omDepartmentsLayer';

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
		const data = (await res.json()) as DepartmentsFeatureCollection;
		cachedData = data;
		return data;
	})();
	try {
		return await inflight;
	} finally {
		inflight = undefined;
	}
};

/**
 * Idempotent: registers the source/layer once. Safe to call multiple times
 * (e.g. after a map style reload).
 */
export const ensureDepartmentsLayer = (): void => {
	const map = get(mStore);
	if (!map) return;

	if (!map.getSource(SOURCE_ID)) {
		map.addSource(SOURCE_ID, {
			type: 'geojson',
			data: emptyFc()
		});
	}
	if (!map.getLayer(LAYER_ID)) {
		const isDark = mode.current === 'dark';
		map.addLayer(
			{
				id: LAYER_ID,
				type: 'line',
				source: SOURCE_ID,
				paint: {
					'line-color': isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)',
					'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 8, 0.9, 12, 1.4],
					'line-opacity': 0.85
				}
			},
			map.getLayer(BEFORE_LAYER_VECTOR) ? BEFORE_LAYER_VECTOR : undefined
		);
	}
};

const setData = (data: DepartmentsFeatureCollection): void => {
	const map = get(mStore);
	if (!map) return;
	const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
	src?.setData(data);
};

export const refreshDepartments = async (_deps?: unknown): Promise<void> => {
	const map = get(mStore);
	if (!map) return;

	ensureDepartmentsLayer();

	if (!get(showDepartments)) {
		setData(emptyFc());
		return;
	}

	try {
		const data = await fetchDepartments();
		if (!get(showDepartments)) return;
		setData(data);
	} catch (err) {
		console.warn('[departments] fetch failed', err);
	}
};
