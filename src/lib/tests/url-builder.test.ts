import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metaJson as mJ, modelRun as mR, time } from '$lib/stores/time';
import { domain as d, variable as v } from '$lib/stores/variables';
import {
	defaultVectorOptions,
	vectorOptions,
	windOverlayEnabled,
	windOverlayLevel
} from '$lib/stores/vector';

import { ANOMALY_DOMAIN } from '$lib/constants';
import { getOMUrl, getOMUrlFor, getOverlayOmUrl, getWindOverlayUrl } from '$lib/url';

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

	describe('delta_time_hours (pluie en taux horaire)', () => {
		afterEach(() => mJ.set(undefined));

		const setValidTimes = (validTimes: string[]) =>
			mJ.set({
				completed: true,
				last_modified_time: '',
				reference_time: '2026-05-23T00:00:00Z',
				valid_times: validTimes,
				variables: ['precipitation', 'temperature_2m']
			});

		it('porte la durée du pas pour la pluie par pas de temps', () => {
			setValidTimes(['2026-05-23T09:00Z', '2026-05-23T12:00Z', '2026-05-23T15:00Z']);
			expect(getOMUrlFor('precipitation')).toContain('&delta_time_hours=3');
			// pas de 15 min (AROME France HD 15 min)
			setValidTimes(['2026-05-23T14:45Z', '2026-05-23T15:00Z']);
			expect(getOMUrlFor('precipitation')).toContain('&delta_time_hours=0.25');
		});

		it('métadonnées d’un autre run (meta.json en cours de lecture) : aucune URL', () => {
			// Run ancien choisi : `modelRun` change avant l'arrivée de son meta.json,
			// `metaJson` décrit encore le run récent et ses variables.
			mJ.set({
				completed: true,
				last_modified_time: '',
				reference_time: '2026-05-23T06:00:00Z',
				valid_times: ['2026-05-23T12:00Z', '2026-05-23T15:00Z'],
				variables: ['precipitation', 'temperature_2m']
			});
			expect(getOMUrlFor('precipitation')).toBeUndefined();
			expect(getOMUrl()).toBeUndefined();
			// meta.json reçu : le run et ses métadonnées concordent.
			setValidTimes(['2026-05-23T12:00Z', '2026-05-23T15:00Z']);
			expect(getOMUrlFor('precipitation')).toContain('/2026/05/23/0000Z/');
		});

		it('suit l’échéance demandée, pas celle du store', () => {
			setValidTimes(['2026-05-23T14:00Z', '2026-05-23T15:00Z', '2026-05-23T18:00Z']);
			expect(getOMUrlFor('rain')).toContain('&delta_time_hours=1');
			expect(getOMUrlFor('rain', new Date('2026-05-23T18:00:00Z'))).toContain(
				'&delta_time_hours=3'
			);
		});

		it('absent pour les cumuls depuis le run et les autres variables', () => {
			setValidTimes(['2026-05-23T12:00Z', '2026-05-23T15:00Z']);
			expect(getOMUrlFor('precipitation_sum')).not.toContain('delta_time_hours');
			expect(getOMUrlFor('temperature_2m')).not.toContain('delta_time_hours');
		});
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
		expect(url).not.toContain('openmeteo.s3.amazonaws.com');
	});

	it('lets a vectorOverride force-disable contour/grid flags', () => {
		vectorOptions.update((o) => ({ ...o, contours: true, grid: true, arrows: true }));
		const full = getOMUrlFor('temperature_2m');
		expect(full).toContain('contours=true');
		expect(full).toContain('grid=true');

		const arrowsOnly = getOMUrlFor('temperature_2m', undefined, { contours: false, grid: false });
		expect(arrowsOnly).not.toContain('contours=true');
		expect(arrowsOnly).not.toContain('grid=true');
		expect(arrowsOnly).toContain('arrows=true');
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

describe('getWindOverlayUrl', () => {
	beforeEach(() => {
		d.set('meteofrance_arome_france_hd');
		mR.set(new Date('2026-05-23T00:00:00Z'));
		time.set(new Date('2026-05-23T15:00:00Z'));
		v.set('temperature_2m');
		vectorOptions.update((o) => ({ ...o, contours: true, grid: true, arrows: true }));
		windOverlayEnabled.set(true);
		windOverlayLevel.set('10m');
	});

	afterEach(() => {
		windOverlayEnabled.set(false);
		windOverlayLevel.set('10m');
	});

	it('returns undefined when the overlay is disabled', () => {
		windOverlayEnabled.set(false);
		expect(getWindOverlayUrl()).toBeUndefined();
	});

	it('points at the wind_u_component for the selected level', () => {
		windOverlayLevel.set('850hPa');
		expect(getWindOverlayUrl()).toContain('variable=wind_u_component_850hPa');
	});

	it('is arrows-only: never carries contour/grid flags even when both toggles are on', () => {
		// Régression : les contours/étiquettes doivent suivre la variable affichée
		// (vectorManager → getOMUrl), jamais wind_u_component. Sinon des isocontours
		// parasites du vent s'affichent par-dessus la carte.
		const url = getWindOverlayUrl();
		expect(url).toContain('arrows=true');
		expect(url).not.toContain('contours=true');
		expect(url).not.toContain('grid=true');
		expect(url).not.toContain('intervals=');
	});

	it('leaves the displayed-variable URL (getOMUrl) with its contour flags intact', () => {
		expect(getOMUrl()).toContain('variable=temperature_2m');
		expect(getOMUrl()).toContain('contours=true');
	});
});

const meta = (variables: string[]) => ({
	completed: true,
	last_modified_time: '',
	reference_time: '2026-05-23T00:00:00Z',
	valid_times: ['2026-05-23T15:00'],
	variables
});

describe('getWindOverlayUrl — fallback « selon la variable affichée »', () => {
	beforeEach(() => {
		vi.stubEnv('VITE_OM_WORKER_URL', 'http://localhost:8080');
		d.set('meteofrance_arome_france_hd');
		mR.set(new Date('2026-05-23T00:00:00Z'));
		time.set(new Date('2026-05-23T15:00:00Z'));
		windOverlayEnabled.set(false); // mode « selon la variable affichée »
		vectorOptions.update((o) => ({ ...o, arrows: true }));
		mJ.set(meta(['temperature_2m', 'wind_u_component_10m', 'wind_u_component_850hPa']));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		windOverlayEnabled.set(false);
		windOverlayLevel.set('10m');
		vectorOptions.set(defaultVectorOptions);
		mJ.set(undefined);
	});

	it('dérive le vent 10 m pour une variable de surface non-vent', () => {
		v.set('temperature_2m');
		const url = getWindOverlayUrl();
		expect(url).toContain('variable=wind_u_component_10m');
		expect(url).not.toContain('contours=true');
		expect(url).not.toContain('grid=true');
	});

	it('dérive le vent au niveau de pression de la variable affichée', () => {
		v.set('temperature_850hPa');
		expect(getWindOverlayUrl()).toContain('variable=wind_u_component_850hPa');
	});

	it('ne dessine rien quand la variable affichée est déjà du vent', () => {
		v.set('wind_u_component_10m');
		expect(getWindOverlayUrl()).toBeUndefined();
	});

	it('ne dessine rien quand les flèches sont désactivées', () => {
		vectorOptions.update((o) => ({ ...o, arrows: false }));
		v.set('temperature_2m');
		expect(getWindOverlayUrl()).toBeUndefined();
	});
});

describe('getOverlayOmUrl', () => {
	beforeEach(() => {
		d.set('meteofrance_arome_france_hd');
		mR.set(new Date('2026-05-23T00:00:00Z'));
		time.set(new Date('2026-05-23T15:00:00Z'));
		v.set('temperature_2m');
		vectorOptions.set({ ...defaultVectorOptions, grid: true });
	});

	afterEach(() => {
		vectorOptions.set(defaultVectorOptions);
		d.set('meteofrance_arome_france_hd');
	});

	it('getOverlayOmUrl : isolignes à intervalle fixe, sans grille', () => {
		const url = getOverlayOmUrl(
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 },
			{ contours: true, arrows: false }
		);
		expect(url).toContain('variable=pressure_msl');
		expect(url).toContain('&contours=true');
		expect(url).toContain('&intervals=2');
		expect(url).not.toContain('grid=true');
	});

	it('getOverlayOmUrl : isolignes sur les paliers de l’échelle → pas d’intervals', () => {
		vectorOptions.set({ ...defaultVectorOptions, breakpoints: false, contourInterval: 5 });
		expect(
			getOverlayOmUrl(
				{ variable: 'pressure_msl', contours: true },
				{ contours: true, arrows: false }
			)
		).not.toContain('intervals=');
	});

	it('getOverlayOmUrl : rien sur le domaine anomalie', () => {
		d.set(ANOMALY_DOMAIN);
		expect(
			getOverlayOmUrl(
				{ variable: 'pressure_msl', contours: true },
				{ contours: true, arrows: false }
			)
		).toBeUndefined();
	});
});
