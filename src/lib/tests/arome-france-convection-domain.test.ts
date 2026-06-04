import { domainGroups, domainOptions } from '@openmeteo/weather-map-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AROME_FRANCE_GROUP } from '$lib/arome-france-domain';
import { AROME_FRANCE_CONVECTION_DOMAIN } from '$lib/constants';

describe('registerAromeFranceConvectionDomain', () => {
	beforeEach(() => {
		const idx = domainOptions.findIndex((d) => d.value === 'arome_france_convection');
		if (idx >= 0) domainOptions.splice(idx, 1);
		for (const value of ['arome_france', 'arome_france_convection']) {
			const gidx = domainGroups.findIndex((g) => g.value === value);
			if (gidx >= 0) domainGroups.splice(gidx, 1);
		}
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('range la convection sous le groupe partagé « arome_france »', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		registerAromeFranceConvectionDomain();
		expect(domainGroups.filter((g) => g.value === 'arome_france').length).toBe(1);
		// Plus de groupe propre `arome_france_convection` (évite le doublon dans le menu).
		expect(domainGroups.find((g) => g.value === 'arome_france_convection')).toBeUndefined();
		// Invariant de groupement du sélecteur : la convection doit commencer par la
		// valeur du groupe partagé (sinon elle n'apparaîtrait pas sous ce groupe).
		expect(AROME_FRANCE_CONVECTION_DOMAIN.startsWith(AROME_FRANCE_GROUP.value)).toBe(true);
	});

	it('pousse arome_france_convection avec la grille producteur', async () => {
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

	it('est idempotent (pas de double push)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		registerAromeFranceConvectionDomain();
		registerAromeFranceConvectionDomain();
		expect(domainOptions.filter((x) => x.value === 'arome_france_convection').length).toBe(1);
		expect(domainGroups.filter((g) => g.value === 'arome_france').length).toBe(1);
	});

	it('ne pousse rien quand le bucket est vide', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', '');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		registerAromeFranceConvectionDomain();
		expect(domainOptions.find((x) => x.value === 'arome_france_convection')).toBeUndefined();
	});
});
