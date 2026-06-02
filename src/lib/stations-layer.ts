// MapLibre wiring du calque de stations Infoclimat.
// Owns: une geojson source + un layer `circle` placé AU-DESSUS du raster/vecteur
// (cliquable). Fetch paresseux du snapshot au premier affichage, caché en
// module-scope. Popup métadonnées au clic. Pattern : departments-layer.ts.
import { get } from 'svelte/store';

import maplibregl from 'maplibre-gl';

import { map as mStore } from '$lib/stores/map';
import { showStations } from '$lib/stores/stations';

import {
	STATIONS_FADE_MAX_ZOOM,
	STATIONS_FADE_MIN_ZOOM,
	STATIONS_GEOJSON_URL,
	STATIONS_LAYER_ID,
	STATIONS_SOURCE_ID
} from './constants';
import { type StationProps, buildStationPopupHtml } from './stations';

type StationsFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point>;

const emptyFc = (): StationsFeatureCollection => ({ type: 'FeatureCollection', features: [] });

let cachedData: StationsFeatureCollection | undefined;
let inflight: Promise<StationsFeatureCollection> | undefined;
let handlersWired = false;
let popup: maplibregl.Popup | undefined;

const fetchStations = async (): Promise<StationsFeatureCollection> => {
	if (cachedData) return cachedData;
	if (inflight) return inflight;
	inflight = (async () => {
		const res = await fetch(STATIONS_GEOJSON_URL);
		if (!res.ok) throw new Error(`stations GeoJSON HTTP ${res.status}`);
		const data = (await res.json()) as StationsFeatureCollection;
		cachedData = data;
		return data;
	})();
	try {
		return await inflight;
	} finally {
		inflight = undefined;
	}
};

const wireHandlers = (map: maplibregl.Map): void => {
	if (handlersWired) return;
	handlersWired = true;

	map.on('mouseenter', STATIONS_LAYER_ID, () => {
		map.getCanvas().style.cursor = 'pointer';
	});
	map.on('mouseleave', STATIONS_LAYER_ID, () => {
		map.getCanvas().style.cursor = '';
	});
	map.on('click', STATIONS_LAYER_ID, (e) => {
		const feature = e.features?.[0];
		if (!feature) return;
		const props = feature.properties as StationProps;
		const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
		popup ??= new maplibregl.Popup({ closeButton: true, offset: 8, maxWidth: '240px' });
		popup.setLngLat([lng, lat]).setHTML(buildStationPopupHtml(props)).addTo(map);
	});
};

/** Idempotent : enregistre source + layer une seule fois. */
export const ensureStationsLayer = (): void => {
	const map = get(mStore);
	if (!map) return;

	if (!map.getSource(STATIONS_SOURCE_ID)) {
		map.addSource(STATIONS_SOURCE_ID, { type: 'geojson', data: emptyFc() });
	}
	if (!map.getLayer(STATIONS_LAYER_ID)) {
		// Pas de beforeId → au sommet (visible et cliquable au-dessus du raster).
		map.addLayer({
			id: STATIONS_LAYER_ID,
			type: 'circle',
			source: STATIONS_SOURCE_ID,
			paint: {
				'circle-color': '#1e293b',
				'circle-stroke-color': '#ffffff',
				'circle-stroke-width': 1.5,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3, 10, 5],
				'circle-opacity': [
					'interpolate',
					['linear'],
					['zoom'],
					STATIONS_FADE_MIN_ZOOM,
					0,
					STATIONS_FADE_MAX_ZOOM,
					1
				],
				'circle-stroke-opacity': [
					'interpolate',
					['linear'],
					['zoom'],
					STATIONS_FADE_MIN_ZOOM,
					0,
					STATIONS_FADE_MAX_ZOOM,
					1
				]
			}
		});
	}
	wireHandlers(map);
};

const setData = (data: StationsFeatureCollection): void => {
	const map = get(mStore);
	const src = map?.getSource(STATIONS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
	src?.setData(data);
};

export const refreshStations = async (_deps?: unknown): Promise<void> => {
	const map = get(mStore);
	if (!map) return;

	ensureStationsLayer();

	if (!get(showStations)) {
		setData(emptyFc());
		popup?.remove();
		return;
	}

	try {
		const data = await fetchStations();
		if (!get(showStations)) return;
		setData(data);
	} catch (err) {
		console.warn('[stations] fetch failed', err);
	}
};
