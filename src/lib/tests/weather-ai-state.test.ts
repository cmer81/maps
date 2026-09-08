import { get } from 'svelte/store';

import { describe, expect, it, vi } from 'vitest';

import { createWeatherAiStore } from '$lib/weather-ai/state';

const init = '2026-09-07T18:00:00Z';
const valid = (h: number) => new Date(Date.parse(init) + h * 3600000).toISOString();
const frame = (id: string, h: number, run = 'r1') => ({
	product_id: id,
	run_id: run,
	snapshot_id: 's',
	valid_time: valid(h)
});
const p = 'global-mslp-1deg',
	t = 'global-cyclone-tracks-1deg';
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const grid = (id: string, h: number, run = 'r1') => ({
	product: {
		...frame(id, h, run),
		schema_version: 'carto-grid-product/1.0.0',
		grid: {
			latitude_start: -90,
			latitude_step: 180,
			latitude_count: 2,
			longitude_start: 0,
			longitude_step: 180,
			longitude_count: 2,
			order: 'latitude-major'
		},
		variable: {
			name: 'mean_sea_level_pressure',
			unit: 'Pa',
			values: [100000, 100000, 100000, 100000]
		}
	}
});
function api() {
	return vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(String(input), 'https://front.test');
		const run = url.searchParams.get('run_id') ?? 'r1';
		if (url.pathname.endsWith('/runs'))
			return response({
				runs: [
					{ run_id: 'r1', init_time: init, published_at: valid(12) },
					{ run_id: 'r2', init_time: init, published_at: valid(6) }
				]
			});
		if (url.pathname.endsWith('/products'))
			return response({
				run_id: run,
				published_at: valid(12),
				produits: (run === 'r1' ? [6, 12, 48] : [6, 12]).flatMap((h) => [
					frame(p, h, run),
					frame(t, h, run)
				])
			});
		const hour = (Date.parse(url.searchParams.get('valid_time')!) - Date.parse(init)) / 3600000;
		if (url.pathname.includes(t))
			return response({
				product: {
					...frame(t, hour, run),
					schema_version: 'cyclone-tracks-product/1.0.0',
					init_time: init,
					sources: [{ member: 0 }],
					tracks: []
				}
			});
		return response(grid(p, hour, run));
	});
}
describe('Weather AI navigation et erreurs', () => {
	it('conserve +48 h entre couches et recale explicitement une archive plus courte', async () => {
		const store = createWeatherAiStore(api());
		await store.start();
		await store.selectLead(48);
		await store.selectProduct(p);
		expect(get(store).leadHours).toBe(48);
		expect(get(store).data).toHaveLength(1);
		await store.selectRun('r2');
		expect(get(store).leadHours).toBe(12);
		expect(get(store).notice).toContain('+12 h');
		store.destroy();
	});
	it('distingue une absence de trajectoires et une erreur HTTP avec reprise', async () => {
		const fetcher = api(),
			store = createWeatherAiStore(fetcher);
		await store.start();
		expect(get(store).status).toBe('ready');
		expect(
			get(store).data.every((d) => 'tracks' in d.product && d.product.tracks.length === 0)
		).toBe(true);
		fetcher.mockImplementationOnce(async () => response({}, 503));
		await store.selectProduct(p);
		expect(get(store).status).toBe('error');
		expect(get(store).data).toEqual([]);
		await store.retry();
		expect(get(store).status).toBe('ready');
		store.destroy();
	});
	it('ne remplace pas une sélection récente par une réponse obsolète', async () => {
		const fetcher = api(),
			store = createWeatherAiStore(fetcher);
		await store.start();
		await store.selectProduct(p);
		let resolve!: (r: Response) => void;
		fetcher.mockImplementationOnce(
			() =>
				new Promise((r) => {
					resolve = r;
				})
		);
		const slow = store.selectLead(12);
		await store.selectLead(48);
		resolve(response(grid(p, 12)));
		await slow;
		expect(get(store).leadHours).toBe(48);
		expect(get(store).data[0].product.valid_time).toBe(valid(48));
		store.destroy();
	});
	it('refuse une frame portant un autre run ou snapshot', async () => {
		const fetcher = api(),
			store = createWeatherAiStore(fetcher);
		await store.start();
		fetcher.mockImplementationOnce(async () => response(grid(p, 6, 'wrong-run')));
		await store.selectProduct(p);
		expect(get(store).status).toBe('error');
		expect(get(store).data).toEqual([]);
		store.destroy();
	});
});
