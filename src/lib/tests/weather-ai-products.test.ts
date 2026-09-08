import { describe, expect, it } from 'vitest';

import {
	availableSteps,
	chooseLead,
	parseCatalog,
	parseProduct,
	parseRuns,
	trackFeatures
} from '$lib/weather-ai/products';

const init = '2026-09-07T18:00:00Z';
const published = '2026-09-08T06:36:19Z';
const frame = (hour: number, product_id = 'global-mslp-1deg') => ({
	product_id,
	run_id: 'opaque',
	snapshot_id: 'snapshot',
	valid_time: new Date(Date.parse(init) + hour * 3600000).toISOString()
});
const catalog = (hours = [6, 12, 48]) =>
	parseCatalog({ run_id: 'opaque', published_at: published, produits: hours.map((h) => frame(h)) });

describe('Weather AI catalogue et initialisations', () => {
	it('calcule les échéances depuis init_time, indépendamment de la publication', () => {
		expect(availableSteps(catalog(), init).map((s) => s.leadHours)).toEqual([6, 12, 48]);
	});
	it('ne fabrique ni échéances intermédiaires ni horizon au-delà de 48 h', () => {
		expect(availableSteps(catalog([12, 48, 120]), init).map((s) => s.leadHours)).toEqual([12, 48]);
	});
	it('conserve une échéance disponible et choisit la plus proche sinon', () => {
		expect(chooseLead(48, availableSteps(catalog(), init))).toBe(48);
		expect(chooseLead(48, availableSteps(catalog([6, 12, 18]), init))).toBe(18);
		expect(chooseLead(6, [])).toBeUndefined();
	});
	it('conserve deux publications de la même initialisation par run_id opaque', () => {
		const runs = parseRuns({
			runs: [
				{ run_id: 'a', init_time: init, published_at: published },
				{ run_id: 'b', init_time: init, published_at: '2026-09-08T07:00:00Z' }
			]
		});
		expect(runs.map((r) => r.run_id)).toEqual(['b', 'a']);
	});
	it('distingue un catalogue vide et une réponse invalide', () => {
		expect(
			parseCatalog({ run_id: 'empty', published_at: published, produits: [] }).produits
		).toEqual([]);
		expect(() => parseCatalog({ error: 'unavailable' })).toThrow();
		expect(() => parseRuns({ runs: [{ run_id: 'a', published_at: published }] })).toThrow();
	});
});

const point = (member: number, hour: number, longitude: number) => ({
	member,
	model_track_id: 'candidate',
	valid_time: frame(hour).valid_time,
	longitude,
	latitude: 15,
	mslp_hpa: 990,
	vmax_ms: 20,
	forecast_track_duration_hours: 12,
	forecast_track_point_count: 3
});
const product = (tracks: unknown[]) => ({
	product: {
		...frame(6, 'global-cyclone-tracks-1deg'),
		init_time: init,
		schema_version: 'cyclone-tracks-product/1.0.0',
		sources: [{ member: 0 }],
		tracks
	}
});

describe('Trajectoires candidates', () => {
	it('accepte un tableau de trajectoires explicitement vide', () => {
		expect(parseProduct(product([])).product).toHaveProperty('tracks', []);
	});
	it('rejette un corps invalide et des coordonnées impossibles', () => {
		expect(() => parseProduct({ product: {} })).toThrow();
		expect(() => parseProduct(product([{ ...point(0, 6, 10), latitude: 100 }]))).toThrow();
	});
	it('sépare les membres, relie les positions et ne projette pas de faux point actif', () => {
		const geo = trackFeatures(
			[point(0, 6, 179), point(0, 12, -179), point(1, 6, 20)],
			frame(12).valid_time
		);
		const lines = geo.features.filter((f) => f.geometry.type === 'LineString');
		expect(lines).toHaveLength(1);
		expect(lines[0].geometry).toMatchObject({
			coordinates: [
				[179, 15],
				[181, 15]
			]
		});
		const active = geo.features.filter((f) => f.properties?.active);
		expect(active).toHaveLength(1);
		expect(active[0].properties?.member).toBe(0);
	});
	it('garde la couleur et l’identité à travers les échéances', () => {
		const p = point(0, 6, 10);
		const first = trackFeatures([p], frame(6).valid_time).features[0];
		const next = trackFeatures([p, point(0, 12, 12)], frame(12).valid_time).features.find(
			(f) => f.geometry.type === 'Point'
		);
		expect(first.properties?.color).toBe(next?.properties?.color);
		expect(first.properties?.key).toBe(next?.properties?.key);
	});
});
