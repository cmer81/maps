import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { modelRun as mR, time } from '$lib/stores/time';
import { domain as d, variable as v } from '$lib/stores/variables';

import { getOMUrl, getOMUrlFor } from '$lib/url';

describe('getOMUrlFor', () => {
	beforeEach(() => {
		vi.stubEnv('VITE_OM_WORKER_URL', 'http://localhost:8080');
		d.set('meteofrance_arome_france_hd');
		mR.set(new Date('2026-05-23T00:00:00Z'));
		time.set(new Date('2026-05-23T15:00:00Z'));
		v.set('temperature_2m');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('builds URL with the variable passed as argument, not the store value', () => {
		const url = getOMUrlFor('precipitation');
		expect(url).toContain('variable=precipitation');
		expect(url).not.toContain('variable=temperature_2m');
	});

	it('keeps the store-driven getOMUrl() in sync with the store', () => {
		expect(getOMUrl()).toContain('variable=temperature_2m');
	});

	it('builds the URL for an overridden time, not the store time', () => {
		// store time = 15:00 ; on précharge le voisin +3h = 18:00
		const url = getOMUrlFor('temperature_2m', new Date('2026-05-23T18:00:00Z'));
		expect(url).toContain('2026-05-23T1800.om');
		expect(url).not.toContain('2026-05-23T1500');
	});

	it('without a time override, falls back to the store time', () => {
		const url = getOMUrlFor('temperature_2m');
		expect(url).toContain('2026-05-23T1500.om');
	});

	it('routes arome_france_convection to the R2 bucket data_spatial path', () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		d.set('arome_france_convection');
		const url = getOMUrlFor('radar_reflectivity');
		expect(url).toContain('https://bucket.test/data_spatial/arome_france_convection/');
		expect(url).toContain('variable=radar_reflectivity');
		expect(url).not.toContain('map-tiles.open-meteo.com');
	});

	it('routes precipitation_sum to the upstream data_spatial path, NOT the worker', () => {
		// `precipitation_sum` (cumul depuis le début du run) est une variable
		// first-class du domaine arome_om_reunion : elle doit être lue comme un
		// array normal depuis le bucket, jamais via le worker — même quand
		// VITE_OM_WORKER_URL est configuré (stubbé dans beforeEach).
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		d.set('arome_om_reunion');
		const url = getOMUrlFor('precipitation_sum');
		expect(url).toContain('https://bucket.test/data_spatial/arome_om_reunion/');
		expect(url).toContain('variable=precipitation_sum');
		expect(url).not.toContain('/v1/sum/');
		expect(url).not.toContain('localhost:8080');
	});
});
