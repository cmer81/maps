import { domainGroups, domainOptions } from '@openmeteo/weather-map-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerAromeOmDomain', () => {
	beforeEach(() => {
		const idx = domainOptions.findIndex((d) => d.value === 'arome_om_reunion');
		if (idx >= 0) domainOptions.splice(idx, 1);
		const gidx = domainGroups.findIndex((g) => g.value === 'arome_om');
		if (gidx >= 0) domainGroups.splice(gidx, 1);
		vi.resetModules();
	});

	it('registers the "arome_om" domain group so the selector can show it', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeOmDomain } = await import('$lib/arome-om-domain');
		registerAromeOmDomain();
		expect(domainGroups.filter((g) => g.value === 'arome_om').length).toBe(1);
		// `arome_om_reunion`.startsWith('arome_om') doit être vrai (lien groupe↔domaine).
		expect('arome_om_reunion'.startsWith('arome_om')).toBe(true);
	});

	it('pushes arome_om_reunion with real GRIB header dimensions when bucket URL is set', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeOmDomain } = await import('$lib/arome-om-domain');
		registerAromeOmDomain();
		const d = domainOptions.find((x) => x.value === 'arome_om_reunion');
		expect(d).toBeDefined();
		expect(d?.grid.nx).toBe(1395);
		expect(d?.grid.ny).toBe(899);
		// dx/dy ne sont définis que sur la variante `regular` de GridData ;
		// type-narrowing explicite pour rendre l'accès safe au compilo.
		if (d?.grid.type === 'regular') {
			expect(d.grid.dx).toBeCloseTo(0.025, 6);
			expect(d.grid.dy).toBeCloseTo(0.025, 6);
		} else {
			throw new Error('arome_om_reunion grid must be of type "regular"');
		}
		expect(d?.time_interval).toBe('hourly');
		expect(d?.model_interval).toBe('6_hourly');
	});

	it('is idempotent (no duplicate push)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeOmDomain } = await import('$lib/arome-om-domain');
		registerAromeOmDomain();
		registerAromeOmDomain();
		const count = domainOptions.filter((x) => x.value === 'arome_om_reunion').length;
		expect(count).toBe(1);
	});

	it('does not push when bucket URL is empty', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', '');
		const { registerAromeOmDomain } = await import('$lib/arome-om-domain');
		registerAromeOmDomain();
		expect(domainOptions.find((x) => x.value === 'arome_om_reunion')).toBeUndefined();
	});
});
