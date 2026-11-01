// Documents Weather AI synthétiques, construits d'après les contrats
// (carto-grid-product, cyclone-tracks-product, cyclone-cones-public-product) et
// les réponses réelles du portail.
import { CONES_MENTION, CONES_PRODUCT_ID, type ConesProduct } from '$lib/weather-ai/cones';
import conesFixture from '$lib/weather-ai/fixtures/cones-public.fixture.json';

import type { Catalog, ConesCatalogEntry, DataResponse, Runs, Timeline } from '$lib/weather-ai/api';
import type { GridProduct } from '$lib/weather-ai/grid';
import type { TrackPoint, TracksProduct } from '$lib/weather-ai/tracks';

export const RUN_ID = 'wn2-oper-20261018T000000Z-adac4e2e6d9b';
export const SNAPSHOT_ID = 'wn2-input-set-sha256-adac4e2e6d9b';
export const INIT_TIME = '2026-10-18T00:00:00Z';
export const VALID_TIMES = ['2026-10-18T06:00:00Z', '2026-10-18T12:00:00Z', '2026-10-18T18:00:00Z'];

export const MSLP_ID = 'global-mslp-1deg';
export const EXISTENCE_ID = 'global-cyclone-existence-1deg';
export const TRACKS_ID = 'global-cyclone-tracks-1deg';

/** Grille globale 1° (sud → nord, longitudes 0..359) remplie par `f(lat, lon)`. */
export function gridDoc(
	productId: string,
	validTime: string,
	f: (lat: number, lon: number) => number,
	over: Partial<GridProduct> = {}
): GridProduct {
	const values: number[] = [];
	for (let i = 0; i < 181; i++) for (let j = 0; j < 360; j++) values.push(f(-90 + i, j));
	const mslp = productId === MSLP_ID;
	return {
		schema_version: mslp ? 'carto-grid-product/1.0.0' : 'carto-grid-product/1.5.0',
		product_id: productId,
		run_id: RUN_ID,
		snapshot_id: SNAPSHOT_ID,
		valid_time: validTime,
		experimental: true,
		grid: {
			latitude_start: -90,
			latitude_step: 1,
			latitude_count: 181,
			longitude_start: 0,
			longitude_step: 1,
			longitude_count: 360,
			order: 'latitude-major'
		},
		variable: mslp
			? { name: 'mean_sea_level_pressure', unit: 'Pa', values }
			: { name: 'cyclone_exists_gaussian_unit_mode', unit: '1', values },
		...over
	};
}

export function trackPoint(over: Partial<TrackPoint>): TrackPoint {
	return {
		member: 0,
		model_track_id: 'ecmwf-tf:2026:36W',
		valid_time: VALID_TIMES[0],
		latitude: 13.5,
		longitude: 141.3,
		mslp_hpa: 926.7,
		vmax_ms: 68.2,
		forecast_track_point_count: 3,
		forecast_track_duration_hours: 12,
		...over
	};
}

export function tracksDoc(
	validTime: string,
	tracks: TrackPoint[],
	over: Partial<TracksProduct> = {}
): TracksProduct {
	return {
		schema_version: 'cyclone-tracks-product/1.1.0',
		product_id: TRACKS_ID,
		run_id: RUN_ID,
		snapshot_id: SNAPSHOT_ID,
		init_time: INIT_TIME,
		valid_time: validTime,
		experimental: true,
		qualification: {
			kind: 'seeded_declared_storms_and_cyclogenesis_candidates',
			alert_authority: false
		},
		tracks,
		...over
	};
}

export const ATTRIBUTION =
	'WeatherNext Cyclones Mini (2023), Google DeepMind; ECMWF open data (CC BY 4.0), modified';
export const LICENSE = 'WeatherNext Cyclones Mini model weights are CC BY 4.0';

export function catalog(productIds: string[], over: Partial<Catalog> = {}): Catalog {
	return {
		run_id: RUN_ID,
		run_date: '2026-10-18',
		published_at: '2026-10-18T12:02:35Z',
		experimental: true,
		produits: productIds.flatMap((product_id) =>
			VALID_TIMES.map((valid_time) => ({
				product_id,
				run_id: RUN_ID,
				valid_time,
				sha256: '0'.repeat(64),
				snapshot_id: SNAPSHOT_ID,
				license_notice: LICENSE,
				attribution: ATTRIBUTION,
				experimental: true
			}))
		),
		...over
	};
}

export const runs = (): Runs => ({
	runs: [
		{
			run_id: RUN_ID,
			init_time: INIT_TIME,
			published_at: '2026-10-18T12:02:35Z',
			snapshot_id: SNAPSHOT_ID,
			valid_times: VALID_TIMES
		}
	]
});

export const timeline = (productId: string, runId = RUN_ID): Timeline => ({
	product_id: productId,
	run_id: runId,
	snapshot_id: SNAPSHOT_ID,
	// Volontairement désordonnée : le client trie.
	frames: [...VALID_TIMES].reverse().map((valid_time) => ({
		product_id: productId,
		run_id: runId,
		valid_time,
		snapshot_id: SNAPSHOT_ID
	}))
});

export const data = <P>(product: P): DataResponse<P> => ({
	attribution: ATTRIBUTION,
	license_notice: LICENSE,
	experimental: true,
	product
});

/** Entrée `cones` du catalogue, telle que le portail la projette (chom-poc-data#260). */
export const conesEntry = (over: Partial<ConesCatalogEntry> = {}): ConesCatalogEntry => ({
	product_id: CONES_PRODUCT_ID,
	run_id: RUN_ID,
	valid_time: INIT_TIME,
	sha256: 'c'.repeat(64),
	snapshot_id: SNAPSHOT_ID,
	license_notice: LICENSE,
	attribution: ATTRIBUTION,
	experimental: true,
	calibration_status: 'best_track_only_operational_coverage_pending',
	mention: CONES_MENTION,
	...over
});

/** Document des cônes du run des fixtures (la fixture de démo, rattachée à ce run). */
export const conesDoc = (over: Partial<ConesProduct> = {}): ConesProduct => ({
	...(conesFixture as unknown as ConesProduct),
	run_id: RUN_ID,
	snapshot_id: SNAPSHOT_ID,
	...over
});
