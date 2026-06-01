import { domainGroups, domainOptions } from '@openmeteo/weather-map-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerAromeFranceConvectionDomain', () => {
	beforeEach(() => {
		const idx = domainOptions.findIndex((d) => d.value === 'arome_france_convection');
		if (idx >= 0) domainOptions.splice(idx, 1);
		const gidx = domainGroups.findIndex((g) => g.value === 'arome_france_convection');
		if (gidx >= 0) domainGroups.splice(gidx, 1);
		vi.resetModules();
	});

	it('registers a dedicated selector group so the domain is shown', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		registerAromeFranceConvectionDomain();
		expect(domainGroups.filter((g) => g.value === 'arome_france_convection').length).toBe(1);
		expect('arome_france_convection'.startsWith('arome_france_convection')).toBe(true);
	});

	it('pushes arome_france_convection with the producer grid dimensions', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		registerAromeFranceConvectionDomain();
		const d = domainOptions.find((x) => x.value === 'arome_france_convection');
		expect(d).toBeDefined();
		expect(d?.grid.nx).toBe(1121);
		expect(d?.grid.ny).toBe(717);
		if (d?.grid.type === 'regular') {
			expect(d.grid.dx).toBeCloseTo(0.025, 6);
			expect(d.grid.dy).toBeCloseTo(0.025, 6);
			expect(d.grid.lonMin).toBeCloseTo(-12, 6);
			expect(d.grid.latMin).toBeCloseTo(37.5, 6);
		} else {
			throw new Error('arome_france_convection grid must be of type "regular"');
		}
		expect(d?.time_interval).toBe('hourly');
		expect(d?.model_interval).toBe('3_hourly');
	});

	it('is idempotent (no duplicate push)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		registerAromeFranceConvectionDomain();
		registerAromeFranceConvectionDomain();
		expect(domainOptions.filter((x) => x.value === 'arome_france_convection').length).toBe(1);
		expect(domainGroups.filter((g) => g.value === 'arome_france_convection').length).toBe(1);
	});

	it('does not push when bucket URL is empty', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', '');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		registerAromeFranceConvectionDomain();
		expect(domainOptions.find((x) => x.value === 'arome_france_convection')).toBeUndefined();
	});
});
