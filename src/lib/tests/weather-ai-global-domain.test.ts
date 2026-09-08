import { domainGroups, domainOptions } from '@openmeteo/weather-map-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Grille régulière d'un domaine, avec ses bornes garanties définies. */
function regularGrid(domain: (typeof domainOptions)[number] | undefined) {
	if (!domain) throw new Error('domain not registered');
	const grid = domain.grid;
	if (grid.type !== 'regular') throw new Error(`${domain.value} grid must be of type "regular"`);
	const { nx, ny, dx, dy, lonMin, latMin } = grid;
	if (dx === undefined || dy === undefined || lonMin === undefined || latMin === undefined) {
		throw new Error(`${domain.value} grid is missing its bounds`);
	}
	return { nx, ny, dx, dy, lonMin, latMin };
}

describe('registerWeatherAiGlobalDomain', () => {
	beforeEach(() => {
		const idx = domainOptions.findIndex((d) => d.value === 'weather_ai_global');
		if (idx >= 0) domainOptions.splice(idx, 1);
		const gidx = domainGroups.findIndex((g) => g.value === 'weather_ai');
		if (gidx >= 0) domainGroups.splice(gidx, 1);
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('pousse weather_ai_global avec la grille GLOBALE 1° (360×181)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerWeatherAiGlobalDomain } = await import('$lib/weather-ai-global-domain');
		registerWeatherAiGlobalDomain();
		const d = domainOptions.find((x) => x.value === 'weather_ai_global');
		expect(d).toBeDefined();
		expect(d?.grid.nx).toBe(360);
		expect(d?.grid.ny).toBe(181);
		const { dx, dy, lonMin, latMin } = regularGrid(d);
		expect(dx).toBeCloseTo(1, 6);
		expect(dy).toBeCloseTo(1, 6);
		// Couverture globale : −180→180 en longitude, −90→90 en latitude
		// (ligne 0 = pôle Sud). `nx` ne duplique pas la colonne de couture.
		expect(lonMin).toBeCloseTo(-180, 6);
		expect(latMin).toBeCloseTo(-90, 6);
		expect(lonMin + 360 * dx).toBeCloseTo(180, 6);
		expect(latMin + 180 * dy).toBeCloseTo(90, 6);
		expect(d?.time_interval).toBe('6_hourly');
		expect(d?.model_interval).toBe('6_hourly');
	});

	it('a la même forme de grille que les domaines globaux upstream du package', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerWeatherAiGlobalDomain } = await import('$lib/weather-ai-global-domain');
		registerWeatherAiGlobalDomain();
		const ai = regularGrid(domainOptions.find((x) => x.value === 'weather_ai_global'));
		const gfs = regularGrid(domainOptions.find((x) => x.value === 'ncep_gfs025'));
		expect(ai.lonMin).toBe(gfs.lonMin);
		expect(ai.latMin).toBe(gfs.latMin);
		// Même invariant global : nx = 360/dx (pas de colonne dupliquée à la couture),
		// ny = 180/dy + 1 (les deux pôles inclus).
		expect(ai.nx).toBe(360 / ai.dx);
		expect(ai.ny).toBe(180 / ai.dy + 1);
		expect(gfs.nx).toBe(360 / gfs.dx);
		expect(gfs.ny).toBe(180 / gfs.dy + 1);
	});

	it('enregistre le groupe « Modèles IA (expérimental) »', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerWeatherAiGlobalDomain } = await import('$lib/weather-ai-global-domain');
		registerWeatherAiGlobalDomain();
		expect(domainGroups.filter((g) => g.value === 'weather_ai').length).toBe(1);
		expect(domainGroups.find((g) => g.value === 'weather_ai')?.label).toBe(
			'Modèles IA (expérimental)'
		);
	});

	it('est idempotent (pas de double push)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerWeatherAiGlobalDomain } = await import('$lib/weather-ai-global-domain');
		registerWeatherAiGlobalDomain();
		registerWeatherAiGlobalDomain();
		expect(domainOptions.filter((x) => x.value === 'weather_ai_global').length).toBe(1);
		expect(domainGroups.filter((g) => g.value === 'weather_ai').length).toBe(1);
	});

	it('reste disponible sans bucket OM : les données viennent de l’API', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', '');
		const { registerWeatherAiGlobalDomain } = await import('$lib/weather-ai-global-domain');
		registerWeatherAiGlobalDomain();
		expect(domainOptions.find((x) => x.value === 'weather_ai_global')).toBeDefined();
	});
});

describe('weather_ai_global — câblage', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('est routé vers le bucket maison', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { getBaseUri } = await import('$lib/helpers');
		const { WEATHER_AI_GLOBAL_DOMAIN } = await import('$lib/constants');
		expect(getBaseUri(WEATHER_AI_GLOBAL_DOMAIN)).toBe('https://bucket.test');
	});

	it('est marqué expérimental', async () => {
		const { WEATHER_AI_GLOBAL_DOMAIN, isExperimentalDomain } = await import('$lib/constants');
		expect(isExperimentalDomain(WEATHER_AI_GLOBAL_DOMAIN)).toBe(true);
		expect(isExperimentalDomain('arome_france_hd')).toBe(false);
	});

	it('ouvre sur pressure_msl (cyclone_existence est quasi partout nul)', async () => {
		const { DOMAIN_DEFAULT_VARIABLES, WEATHER_AI_GLOBAL_DOMAIN } = await import('$lib/constants');
		expect(DOMAIN_DEFAULT_VARIABLES[WEATHER_AI_GLOBAL_DOMAIN]).toBe('pressure_msl');
	});

	it('cadre le planisphère à la bascule de domaine', async () => {
		const { DOMAIN_DEFAULT_VIEWS, WEATHER_AI_GLOBAL_DOMAIN } = await import('$lib/constants');
		const view = DOMAIN_DEFAULT_VIEWS[WEATHER_AI_GLOBAL_DOMAIN];
		expect(view).toBeDefined();
		expect(view.zoom).toBeLessThanOrEqual(2);
	});

	it("n'a pas de meteogram (absent de l'API publique)", async () => {
		const { DOMAIN_TO_API_MODEL, WEATHER_AI_GLOBAL_DOMAIN } = await import('$lib/constants');
		expect(DOMAIN_TO_API_MODEL[WEATHER_AI_GLOBAL_DOMAIN]).toBeUndefined();
	});

	it("n'a pas de sondage vertical (aucun niveau iso-pression publié)", async () => {
		const { isSoundingDomain, WEATHER_AI_GLOBAL_DOMAIN } = await import('$lib/constants');
		expect(isSoundingDomain(WEATHER_AI_GLOBAL_DOMAIN)).toBe(false);
	});
});
