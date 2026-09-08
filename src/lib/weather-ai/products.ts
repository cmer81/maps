import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

export interface Frame {
	product_id: string;
	run_id: string;
	valid_time: string;
	snapshot_id: string;
	attribution?: string;
	license_notice?: string;
}
export interface Catalog {
	run_id: string;
	published_at: string;
	produits: Frame[];
}
export interface Run {
	run_id: string;
	init_time: string;
	published_at: string;
}
export interface Step {
	validTime: string;
	leadHours: number;
}
export interface TrackPoint {
	member: number;
	model_track_id: string;
	valid_time: string;
	latitude: number;
	longitude: number;
	mslp_hpa: number;
	vmax_ms: number;
	forecast_track_duration_hours: number;
	forecast_track_point_count: number;
}
export interface TracksProduct extends Frame {
	schema_version: string;
	init_time: string;
	tracks: TrackPoint[];
	sources: { member: number }[];
}
export interface GridProduct extends Frame {
	schema_version: string;
	grid: {
		latitude_start: number;
		latitude_step: number;
		latitude_count: number;
		longitude_start: number;
		longitude_step: number;
		longitude_count: number;
		order: string;
	};
	variable: { name: string; unit: string; values: number[] };
}
export interface ProductResponse {
	product: TracksProduct | GridProduct;
	attribution?: string;
	license_notice?: string;
}
export const TRACKS_PRODUCT = 'global-cyclone-tracks-1deg';
export const PRODUCT_LABELS: Record<string, string> = {
	[TRACKS_PRODUCT]: 'Trajectoires candidates',
	'global-mslp-1deg': 'Pression',
	'global-cyclone-existence-1deg': 'Cyclones'
};
export const productLabel = (id: string) => PRODUCT_LABELS[id] ?? id;
export const isTracks = (p: TracksProduct | GridProduct): p is TracksProduct => 'tracks' in p;
const object = (x: unknown): Record<string, unknown> => {
	if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('Réponse API invalide.');
	return x as Record<string, unknown>;
};
const string = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const date = (x: unknown): x is string => string(x) && Number.isFinite(Date.parse(x));
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const validFrame = (x: unknown): x is Frame => {
	const p = object(x);
	return string(p.product_id) && string(p.run_id) && string(p.snapshot_id) && date(p.valid_time);
};
export function parseCatalog(raw: unknown): Catalog {
	const c = object(raw);
	if (
		!string(c.run_id) ||
		!date(c.published_at) ||
		!Array.isArray(c.produits) ||
		!c.produits.every((p) => validFrame(p) && p.run_id === c.run_id)
	)
		throw new Error('Catalogue Weather AI invalide.');
	return c as unknown as Catalog;
}
export function parseRuns(raw: unknown): Run[] {
	const r = object(raw);
	if (
		!Array.isArray(r.runs) ||
		!r.runs.every((x) => {
			const p = object(x);
			return string(p.run_id) && date(p.init_time) && date(p.published_at);
		})
	)
		throw new Error('Historique Weather AI invalide.');
	return [...(r.runs as Run[])].sort(
		(a, b) =>
			Date.parse(b.init_time) - Date.parse(a.init_time) ||
			Date.parse(b.published_at) - Date.parse(a.published_at)
	);
}
export function parseProduct(raw: unknown): ProductResponse {
	const response = object(raw),
		p = object(response.product);
	if (!validFrame(p) || !string(p.schema_version)) throw new Error('Produit Weather AI invalide.');
	if (p.schema_version.startsWith('cyclone-tracks-product/')) {
		if (
			!date(p.init_time) ||
			!Array.isArray(p.sources) ||
			!p.sources.every((x) => Number.isInteger(object(x).member)) ||
			!Array.isArray(p.tracks) ||
			!p.tracks.every((x) => {
				const t = object(x);
				return (
					Number.isInteger(t.member) &&
					string(t.model_track_id) &&
					date(t.valid_time) &&
					finite(t.latitude) &&
					Math.abs(t.latitude) <= 90 &&
					finite(t.longitude) &&
					Math.abs(t.longitude) <= 180 &&
					finite(t.mslp_hpa) &&
					finite(t.vmax_ms) &&
					t.vmax_ms >= 0
				);
			})
		)
			throw new Error('Trajectoires candidates invalides.');
	} else if (p.schema_version.startsWith('carto-grid-product/')) {
		const g = object(p.grid),
			v = object(p.variable);
		if (
			g.order !== 'latitude-major' ||
			!finite(g.latitude_count) ||
			!finite(g.longitude_count) ||
			!Number.isInteger(g.latitude_count) ||
			!Number.isInteger(g.longitude_count) ||
			g.latitude_count < 2 ||
			g.longitude_count < 2 ||
			!finite(g.latitude_start) ||
			!finite(g.longitude_start) ||
			!finite(g.latitude_step) ||
			g.latitude_step <= 0 ||
			!finite(g.longitude_step) ||
			g.longitude_step <= 0 ||
			!Array.isArray(v.values) ||
			v.values.length !== g.latitude_count * g.longitude_count ||
			!v.values.every(finite) ||
			!['mean_sea_level_pressure', 'cyclone_exists_gaussian_unit_mode'].includes(String(v.name)) ||
			(v.name === 'mean_sea_level_pressure' ? v.unit !== 'Pa' : v.unit !== '1')
		)
			throw new Error('Grille Weather AI invalide ou non prise en charge.');
	} else throw new Error('Format de produit non pris en charge.');
	return response as unknown as ProductResponse;
}
export function availableSteps(catalog: Catalog, initTime: string, productId?: string): Step[] {
	const times = [
		...new Set(
			catalog.produits
				.filter((p) => !productId || p.product_id === productId)
				.map((p) => p.valid_time)
		)
	];
	return times
		.map((validTime) => ({
			validTime,
			leadHours: (Date.parse(validTime) - Date.parse(initTime)) / 3600000
		}))
		.filter((s) => s.leadHours >= 6 && s.leadHours <= 48 && s.leadHours % 6 === 0)
		.sort((a, b) => a.leadHours - b.leadHours);
}
export function chooseLead(preferred: number | undefined, steps: Step[]): number | undefined {
	if (!steps.length) return undefined;
	return steps.reduce((a, b) =>
		Math.abs(b.leadHours - (preferred ?? steps[0].leadHours)) <
		Math.abs(a.leadHours - (preferred ?? steps[0].leadHours))
			? b
			: a
	).leadHours;
}
export const trackKey = (p: Pick<TrackPoint, 'member' | 'model_track_id'>) =>
	`${p.member}:${p.model_track_id}`;
export function trackColor(key: string): string {
	let hash = 0;
	for (const c of key) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) | 0;
	return `hsl(${((hash >>> 0) * 137.508) % 360}, 78%, 64%)`;
}
/** Actual sampled positions only. Unwrap longitude so a dateline crossing stays local. */
export function trackFeatures(
	points: TrackPoint[],
	validTime: string,
	member?: number
): FeatureCollection<LineString | Point> {
	const groups = new Map<string, TrackPoint[]>();
	for (const p of points) {
		if (member !== undefined && p.member !== member) continue;
		const key = trackKey(p);
		const group = groups.get(key) ?? [];
		if (!group.some((t) => t.valid_time === p.valid_time)) group.push(p);
		groups.set(key, group);
	}
	const features: Feature<LineString | Point>[] = [];
	for (const [key, group] of groups) {
		group.sort((a, b) => Date.parse(a.valid_time) - Date.parse(b.valid_time));
		let previous: number | undefined;
		const coords = group.map((p) => {
			let lon = p.longitude;
			if (previous !== undefined) {
				while (lon - previous > 180) lon -= 360;
				while (lon - previous < -180) lon += 360;
			}
			previous = lon;
			return [lon, p.latitude];
		});
		const props = {
			key,
			member: group[0].member,
			label: group[0].model_track_id,
			color: trackColor(key)
		};
		// Segments retain valid times: the future is dashed, the elapsed portion solid.
		for (let i = 1; i < coords.length; i++)
			features.push({
				type: 'Feature',
				properties: { ...props, future: Date.parse(group[i].valid_time) > Date.parse(validTime) },
				geometry: { type: 'LineString', coordinates: [coords[i - 1], coords[i]] }
			});
		group.forEach((p, i) =>
			features.push({
				type: 'Feature',
				properties: { ...p, ...props, active: Date.parse(p.valid_time) === Date.parse(validTime) },
				geometry: { type: 'Point', coordinates: coords[i] }
			})
		);
	}
	return { type: 'FeatureCollection', features };
}
export function formatForecastDate(value?: string): string {
	return value
		? new Intl.DateTimeFormat('fr-FR', {
				dateStyle: 'short',
				timeStyle: 'short',
				timeZone: 'UTC'
			}).format(new Date(value)) + ' UTC'
		: 'Indisponible';
}
