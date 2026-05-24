// MapLibre wiring for the labels overlay.
//
// Owns: a single geojson source + a symbol layer placed above the raster.
// Drives: refresh on any of (toggle, viewport, variable, time, modelRun,
// domain) — debounced through an AbortController so pan churn doesn't fan
// out into stale fetches.
import { get } from 'svelte/store';

import maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';

import { showLabels } from '$lib/stores/labels';
import { map as mStore } from '$lib/stores/map';
import { modelRun } from '$lib/stores/time';
import { time as timeStore } from '$lib/stores/time';
import { domain as domainStore, variable as variableStore } from '$lib/stores/variables';

import { BEFORE_LAYER_VECTOR } from './constants';
import { type LabelsFeatureCollection, fetchLabelsForBounds } from './labels';
import { CUMUL_VARIABLE_REGEX, resolveCumulModelRun } from './url';

const SOURCE_ID = 'omLabelsSource';
const LAYER_ID = 'omLabelsLayer';

let installed = false;
let inflight: AbortController | undefined;

const emptyFc = (): LabelsFeatureCollection => ({ type: 'FeatureCollection', features: [] });

/**
 * Idempotent: registers the source/layer once. Safe to call multiple times
 * (e.g. after a map style reload).
 */
export const ensureLabelsLayer = (): void => {
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
				type: 'symbol',
				source: SOURCE_ID,
				layout: {
					'text-field': ['to-string', ['round', ['get', 'v']]],
					'text-font': ['Noto Sans Regular'],
					'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 12, 12, 14],
					'text-allow-overlap': false,
					'text-ignore-placement': false,
					'text-padding': 2
				},
				paint: {
					'text-color': isDark ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.9)',
					'text-halo-color': isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)',
					'text-halo-width': 1.2
				}
			},
			map.getLayer(BEFORE_LAYER_VECTOR) ? BEFORE_LAYER_VECTOR : undefined
		);
	}
	installed = true;
};

const setData = (data: LabelsFeatureCollection): void => {
	const map = get(mStore);
	if (!map) return;
	const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
	src?.setData(data);
};

// The `_deps` arg is unused at runtime — it exists so callers (e.g. a Svelte
// `$effect`) can pass reactive values and have the compiler treat them as
// genuine reads, avoiding lint/type-check warnings about "unused expressions".
export const refreshLabels = async (_deps?: unknown): Promise<void> => {
	const map = get(mStore);
	if (!map) return;

	// Abort any earlier in-flight refresh.
	inflight?.abort();

	if (!get(showLabels)) {
		ensureLabelsLayer();
		setData(emptyFc());
		return;
	}

	const workerBase = import.meta.env.VITE_OM_WORKER_URL;
	if (!workerBase) {
		console.warn('[labels] VITE_OM_WORKER_URL not set — labels disabled');
		return;
	}

	const run = get(modelRun);
	if (!run) return;

	ensureLabelsLayer();

	const ctrl = new AbortController();
	inflight = ctrl;

	try {
		const variable = get(variableStore);
		const t = get(timeStore);
		// Mirror getOMUrlFor's run-snapping so the labels endpoint and the raster
		// endpoint hit the *same* aggregate cache key — and so a 15Z run on a 24h
		// cumul doesn't try to fetch hours that don't exist in its bucket.
		const cumulMatch = variable.match(CUMUL_VARIABLE_REGEX);
		const effectiveRun = cumulMatch
			? resolveCumulModelRun(run, t, Number(cumulMatch.groups!.hours))
			: run;

		const result = await fetchLabelsForBounds({
			workerBase: String(workerBase),
			domain: get(domainStore),
			variable,
			modelRun: effectiveRun,
			time: t,
			bounds: map.getBounds(),
			mapZoom: map.getZoom(),
			signal: ctrl.signal
		});
		if (ctrl.signal.aborted) return;
		setData(result.data);
	} catch (err) {
		if ((err as Error)?.name === 'AbortError') return;
		console.warn('[labels] refresh failed', err);
	}
};

export const isLabelsInstalled = (): boolean => installed;
