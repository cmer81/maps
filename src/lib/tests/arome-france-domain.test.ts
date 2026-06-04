import { domainGroups, domainOptions } from '@openmeteo/weather-map-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerAromeFranceDomain', () => {
	beforeEach(() => {
		const idx = domainOptions.findIndex((d) => d.value === 'arome_france');
		if (idx >= 0) domainOptions.splice(idx, 1);
		const gidx = domainGroups.findIndex((g) => g.value === 'arome_france');
		if (gidx >= 0) domainGroups.splice(gidx, 1);
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('enregistre le groupe partagé « arome_france »', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceDomain } = await import('$lib/arome-france-domain');
		registerAromeFranceDomain();
		expect(domainGroups.filter((g) => g.value === 'arome_france').length).toBe(1);
		expect(domainGroups.find((g) => g.value === 'arome_france')?.label).toBe(
			'AROME France (Infoclimat)'
		);
	});

	it('pousse arome_france avec la grille producteur', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceDomain } = await import('$lib/arome-france-domain');
		registerAromeFranceDomain();
		const d = domainOptions.find((x) => x.value === 'arome_france');
		expect(d).toBeDefined();
		expect(d?.grid.nx).toBe(1121);
		expect(d?.grid.ny).toBe(717);
		if (d?.grid.type === 'regular') {
			expect(d.grid.dx).toBeCloseTo(0.025, 6);
			expect(d.grid.dy).toBeCloseTo(0.025, 6);
			expect(d.grid.lonMin).toBeCloseTo(-12, 6);
			expect(d.grid.latMin).toBeCloseTo(37.5, 6);
		} else {
			throw new Error('arome_france grid must be of type "regular"');
		}
		expect(d?.time_interval).toBe('hourly');
		expect(d?.model_interval).toBe('3_hourly');
	});

	it('est idempotent (pas de double push)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceDomain } = await import('$lib/arome-france-domain');
		registerAromeFranceDomain();
		registerAromeFranceDomain();
		expect(domainOptions.filter((x) => x.value === 'arome_france').length).toBe(1);
		expect(domainGroups.filter((g) => g.value === 'arome_france').length).toBe(1);
	});

	it('ne pousse rien quand le bucket est vide', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', '');
		const { registerAromeFranceDomain } = await import('$lib/arome-france-domain');
		registerAromeFranceDomain();
		expect(domainOptions.find((x) => x.value === 'arome_france')).toBeUndefined();
	});
});
