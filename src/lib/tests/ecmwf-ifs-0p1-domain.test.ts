import { domainOptions } from '@openmeteo/weather-map-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerEcmwfIfs0p1Domain', () => {
	beforeEach(() => {
		const idx = domainOptions.findIndex((d) => d.value === 'ecmwf_ifs_0p1');
		if (idx >= 0) domainOptions.splice(idx, 1);
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('pousse ecmwf_ifs_0p1 avec la grille producteur (mondiale 0,1°)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerEcmwfIfs0p1Domain } = await import('$lib/ecmwf-ifs-0p1-domain');
		registerEcmwfIfs0p1Domain();
		const d = domainOptions.find((x) => x.value === 'ecmwf_ifs_0p1');
		expect(d).toBeDefined();
		if (d?.grid.type !== 'regular') throw new Error('ecmwf_ifs_0p1 grid must be "regular"');
		expect(d.grid.nx).toBe(3600);
		expect(d.grid.ny).toBe(1801);
		expect(d.grid.dx).toBeCloseTo(0.1, 6);
		expect(d.grid.dy).toBeCloseTo(0.1, 6);
		expect(d.grid.lonMin).toBeCloseTo(-180, 6);
		expect(d.grid.latMin).toBeCloseTo(-90, 6);
		expect(d.time_interval).toBe('3_hourly');
		expect(d.model_interval).toBe('6_hourly');
	});

	it('est idempotent (pas de double push)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerEcmwfIfs0p1Domain } = await import('$lib/ecmwf-ifs-0p1-domain');
		registerEcmwfIfs0p1Domain();
		registerEcmwfIfs0p1Domain();
		expect(domainOptions.filter((x) => x.value === 'ecmwf_ifs_0p1').length).toBe(1);
	});

	it('ne pousse rien quand le bucket est vide', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', '');
		const { registerEcmwfIfs0p1Domain } = await import('$lib/ecmwf-ifs-0p1-domain');
		registerEcmwfIfs0p1Domain();
		expect(domainOptions.find((x) => x.value === 'ecmwf_ifs_0p1')).toBeUndefined();
	});
});
