// Client-side glue for the worker's /v1/labels endpoint.
//
// Per-tile GeoJSON is fetched from infoclimat-om-worker, merged into a single
// FeatureCollection, and pushed to a MapLibre geojson source. MapLibre's
// symbol-layer collision detection handles label thinning visually — the
// server's MAX_LABELS_PER_SIDE just bounds the request size, it doesn't aim
// for screen-perfect density.
import { fmtModelRun, fmtSelectedTime, pad } from './helpers';

import type maplibregl from 'maplibre-gl';

const WORKER_Z_MAX = 8;
const WORKER_Z_MIN = 0;

export interface LabelFeatureProps {
	v: number;
}

export type LabelsFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, LabelFeatureProps>;

interface LabelsTileResponse {
	unit?: string;
	features: LabelsFeatureCollection;
}

export interface LabelsResult {
	unit?: string;
	data: LabelsFeatureCollection;
}

interface TileCoord {
	z: number;
	x: number;
	y: number;
}

const lngToTileX = (lng: number, z: number): number => {
	const n = 1 << z;
	return Math.floor(((lng + 180) / 360) * n);
};

const latToTileY = (lat: number, z: number): number => {
	const n = 1 << z;
	const rad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
	return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
};

const clampWorkerZ = (z: number): number =>
	Math.max(WORKER_Z_MIN, Math.min(WORKER_Z_MAX, Math.floor(z)));

export const chooseWorkerZ = (mapZoom: number): number => clampWorkerZ(mapZoom);

export const tilesForBounds = (bounds: maplibregl.LngLatBounds, workerZ: number): TileCoord[] => {
	const z = clampWorkerZ(workerZ);
	const sw = bounds.getSouthWest();
	const ne = bounds.getNorthEast();
	const n = 1 << z;

	// Clamp lng to a single world copy; MapLibre may report lng outside
	// [-180, 180] when the user wraps around the globe. We don't fetch
	// duplicate tiles for wrapped views — labels show only once.
	const west = Math.max(-180, sw.lng);
	const east = Math.min(180, ne.lng);
	if (east < west) return [];

	const xMin = Math.max(0, lngToTileX(west, z));
	const xMax = Math.min(n - 1, lngToTileX(east, z));
	const yMin = Math.max(0, latToTileY(ne.lat, z));
	const yMax = Math.min(n - 1, latToTileY(sw.lat, z));

	const tiles: TileCoord[] = [];
	for (let y = yMin; y <= yMax; y++) {
		for (let x = xMin; x <= xMax; x++) {
			tiles.push({ z, x, y });
		}
	}
	return tiles;
};

export const buildLabelsTileUrl = (
	workerBase: string,
	domain: string,
	variable: string,
	modelRun: Date,
	time: Date,
	tile: TileCoord
): string => {
	const base = workerBase.replace(/\/$/, '');
	const runYear = modelRun.getUTCFullYear();
	const runMonth = pad(modelRun.getUTCMonth() + 1);
	const runDay = pad(modelRun.getUTCDate());
	const runHHMM = `${pad(modelRun.getUTCHours())}${pad(modelRun.getUTCMinutes())}Z`;
	const timeStr = fmtSelectedTime(time);
	// fmtModelRun gives "Y/M/D/HHMMZ" already, but we re-derive to keep this
	// fn pure & independent of the store time format.
	void fmtModelRun;
	return `${base}/v1/labels/${domain}/${variable}/${runYear}/${runMonth}/${runDay}/${runHHMM}/${timeStr}/${tile.z}/${tile.x}/${tile.y}.json`;
};

/**
 * Fetch labels for every tile covering `bounds`, abort any earlier in-flight
 * call associated with `signal.abort`, and return a merged FeatureCollection.
 */
export const fetchLabelsForBounds = async (params: {
	workerBase: string;
	domain: string;
	variable: string;
	modelRun: Date;
	time: Date;
	bounds: maplibregl.LngLatBounds;
	mapZoom: number;
	signal?: AbortSignal;
}): Promise<LabelsResult> => {
	const workerZ = chooseWorkerZ(params.mapZoom);
	const tiles = tilesForBounds(params.bounds, workerZ);

	const responses = await Promise.all(
		tiles.map(async (tile) => {
			const url = buildLabelsTileUrl(
				params.workerBase,
				params.domain,
				params.variable,
				params.modelRun,
				params.time,
				tile
			);
			const res = await fetch(url, { signal: params.signal });
			if (!res.ok) throw new Error(`labels tile ${tile.z}/${tile.x}/${tile.y}: HTTP ${res.status}`);
			return (await res.json()) as LabelsTileResponse;
		})
	);

	const merged: LabelsFeatureCollection = {
		type: 'FeatureCollection',
		features: []
	};
	let unit: string | undefined;
	for (const r of responses) {
		if (r.unit && !unit) unit = r.unit;
		merged.features.push(...r.features.features);
	}
	return { unit, data: merged };
};
