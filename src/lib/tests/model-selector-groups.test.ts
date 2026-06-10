import { domainOptions } from '@openmeteo/weather-map-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DOMAIN_ALLOWLIST, MODEL_SELECTOR_GROUPS } from '$lib/constants';

const EXPECTED_ORDER = [
	'meteofrance_arome_france_hd',
	'arome_france',
	'arome_france_convection',
	'arome_om_reunion',
	'arome_om_antilles',
	'arome_om_guyane',
	'arome_om_polynesie',
	'arome_om_ncaledonie',
	'meteofrance_arpege_europe',
	'meteofrance_arpege_world025',
	'dwd_icon_eu',
	'dwd_icon_d2',
	'meteoswiss_icon_ch1',
	'meteoswiss_icon_ch2',
	'ecmwf_ifs025',
	'ecmwf_ifs',
	'ecmwf_aifs025_single',
	'ncep_gfs025',
	'anomaly_europe'
];

describe('MODEL_SELECTOR_GROUPS', () => {
	it("met les groupes français en tête, dans l'ordre attendu", () => {
		expect(MODEL_SELECTOR_GROUPS.map((g) => g.label)).toEqual([
			'Météo-France Arome',
			'Météo-France Arpège',
			'DWD Germany',
			'MeteoSwiss',
			'ECMWF',
			'NOAA US',
			'Anomalie'
		]);
	});

	it("aplatit dans l'ordre cible exact", () => {
		const flat = MODEL_SELECTOR_GROUPS.flatMap((g) => g.domains.map((d) => d.value));
		expect(flat).toEqual(EXPECTED_ORDER);
	});

	it('DOMAIN_ALLOWLIST est dérivé de la table, sans doublon', () => {
		const flat = MODEL_SELECTOR_GROUPS.flatMap((g) => g.domains.map((d) => d.value));
		expect([...DOMAIN_ALLOWLIST]).toEqual(flat);
		expect(new Set(DOMAIN_ALLOWLIST).size).toBe(DOMAIN_ALLOWLIST.length);
	});
});

describe('applyModelSelectorLabels', () => {
	const PSEUDO_DOMAINS = [
		'arome_france',
		'arome_france_convection',
		'anomaly_europe',
		'arome_om_reunion',
		'arome_om_antilles',
		'arome_om_guyane',
		'arome_om_polynesie',
		'arome_om_ncaledonie'
	];

	beforeEach(() => {
		for (const value of PSEUDO_DOMAINS) {
			const idx = domainOptions.findIndex((d) => d.value === value);
			if (idx >= 0) domainOptions.splice(idx, 1);
		}
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('aligne le libellé de domainOptions sur la table (package + pseudo-domaines)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAnomalyDomain } = await import('$lib/anomaly-domain');
		const { registerAromeOmDomain } = await import('$lib/arome-om-domain');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		const { registerAromeFranceDomain } = await import('$lib/arome-france-domain');
		const { applyModelSelectorLabels } = await import('$lib/model-selector-labels');

		registerAnomalyDomain();
		registerAromeOmDomain();
		registerAromeFranceConvectionDomain();
		registerAromeFranceDomain();
		applyModelSelectorLabels();

		const labelOf = (v: string) => domainOptions.find((d) => d.value === v)?.label;
		expect(labelOf('meteofrance_arpege_europe')).toBe('Arpège Europe');
		expect(labelOf('meteofrance_arome_france_hd')).toBe('Arome France HD');
		expect(labelOf('arome_france')).toBe('Arome France 2.5');
		expect(labelOf('anomaly_europe')).toBe('Anomalie T°C (Europe ERA/Arpège)');
	});
});
