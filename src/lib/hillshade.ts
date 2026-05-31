import { get } from 'svelte/store';

import maplibregl from 'maplibre-gl';

import { map } from '$lib/stores/map';
import { preferences } from '$lib/stores/preferences';

import { addHillshadeLayer, terrainHandler } from '$lib/map-controls';

let terrainControl: maplibregl.TerrainControl | undefined;

function addTerrainControl() {
	const m = get(map);
	if (!m || terrainControl) return;
	terrainControl = new maplibregl.TerrainControl({ source: 'terrainSource2', exaggeration: 1 });
	m.addControl(terrainControl);
	terrainControl._terrainButton.addEventListener('click', () => terrainHandler());
	if (get(preferences).terrain) {
		m.setTerrain({ source: 'terrainSource2' });
	}
}

function removeTerrainControl() {
	const m = get(map);
	if (!m || !terrainControl) return;
	if (m.hasControl(terrainControl)) m.removeControl(terrainControl);
	terrainControl = undefined;
	m.setTerrain(null);
}

/** Runtime toggle (style already loaded) — mirrors the IControl click handler. */
export function setHillshadeEnabled(enabled: boolean) {
	const m = get(map);
	if (!m) return;
	if (enabled) {
		addHillshadeLayer();
		m.once('styledata', () => setTimeout(() => addTerrainControl(), 50));
	} else {
		if (m.getLayer('hillshadeLayer')) m.removeLayer('hillshadeLayer');
		m.once('styledata', () => setTimeout(() => removeTerrainControl(), 50));
	}
}

/** Init-on-load — mirrors the IControl onAdd path. Call once after map load if preferences.hillshade. */
export function initHillshadeFromPrefs() {
	const m = get(map);
	if (!m || !get(preferences).hillshade) return;
	addHillshadeLayer();
	setTimeout(() => addTerrainControl(), 0);
}
