import { describe, expect, it } from 'vitest';

import { parseWeatherAiMetadata } from '$lib/weather-ai-metadata';

// Scalaire `metadata` réellement lu dans
// data_spatial/weather_ai_global/2026/08/30/1800Z/2026-08-31T0000.om
// (enfant de `pressure_msl`, OmDataType.String). Reproduit verbatim : les chaînes
// d'attribution et de licence sont contractuelles, jamais réécrites côté client.
const REAL_SCALAR = JSON.stringify({
	source: 'Weather AI (WeatherNext Cyclones Mini, Google DeepMind) via portail.chom.engineering',
	generated_at: '2026-09-06T11:47:52.659385352Z',
	extra: {
		attribution:
			'WeatherNext Cyclones Mini (2023), Google DeepMind; official 1-degree HRES forecast example, ECMWF.',
		experimental: true,
		license_notice:
			'Experimental internal POC; WeatherNext Cyclones Mini model weights are CC BY-NC-SA 4.0 and WeatherNext code is Apache-2.0.',
		run_id: 'wn2-oper-20260830T180000Z-05144dd11b27',
		snapshot_id:
			'wn2-input-set-sha256-05144dd11b27441935ed4907080521f250950be8280fcb7ada4cb4220e896d72'
	}
});

describe('parseWeatherAiMetadata', () => {
	it("extrait la métadonnée réelle d'un OMfile weather_ai_global", () => {
		const meta = parseWeatherAiMetadata(REAL_SCALAR);
		expect(meta).toBeDefined();
		expect(meta?.experimental).toBe(true);
		expect(meta?.runId).toBe('wn2-oper-20260830T180000Z-05144dd11b27');
		expect(meta?.snapshotId).toMatch(/^wn2-input-set-sha256-/);
		expect(meta?.generatedAt).toBe('2026-09-06T11:47:52.659385352Z');
		expect(meta?.source).toContain('WeatherNext Cyclones Mini');
	});

	it('restitue les chaînes de licence et d’attribution VERBATIM', () => {
		const meta = parseWeatherAiMetadata(REAL_SCALAR);
		expect(meta?.attribution).toBe(
			'WeatherNext Cyclones Mini (2023), Google DeepMind; official 1-degree HRES forecast example, ECMWF.'
		);
		expect(meta?.licenseNotice).toBe(
			'Experimental internal POC; WeatherNext Cyclones Mini model weights are CC BY-NC-SA 4.0 and WeatherNext code is Apache-2.0.'
		);
		// La licence des poids (CC BY-NC-SA 4.0) doit rester lisible dans la notice
		// affichée : c'est elle qui impose attribution / non-lucratif / partage à
		// l'identique.
		expect(meta?.licenseNotice).toContain('CC BY-NC-SA 4.0');
	});

	it('renvoie undefined sur un JSON invalide', () => {
		expect(parseWeatherAiMetadata('pas du json')).toBeUndefined();
		expect(parseWeatherAiMetadata('')).toBeUndefined();
		expect(parseWeatherAiMetadata('null')).toBeUndefined();
		expect(parseWeatherAiMetadata('"une chaîne"')).toBeUndefined();
	});

	it('tolère les champs absents ou mal typés sans lever', () => {
		const meta = parseWeatherAiMetadata('{}');
		expect(meta).toEqual({
			source: undefined,
			generatedAt: undefined,
			experimental: false,
			licenseNotice: undefined,
			attribution: undefined,
			runId: undefined,
			snapshotId: undefined
		});

		const weird = parseWeatherAiMetadata(
			JSON.stringify({ source: 42, extra: { experimental: 'true', attribution: null } })
		);
		expect(weird?.source).toBeUndefined();
		// `experimental` n'est vrai que sur le booléen strict : une chaîne "true"
		// venue d'un producteur bâclé ne doit pas passer pour un contrat respecté.
		expect(weird?.experimental).toBe(false);
		expect(weird?.attribution).toBeUndefined();

		expect(parseWeatherAiMetadata(JSON.stringify({ extra: 'pas un objet' }))?.experimental).toBe(
			false
		);
	});
});
