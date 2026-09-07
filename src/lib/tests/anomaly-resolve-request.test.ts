import { get } from 'svelte/store';

import { domainOptions } from '@openmeteo/weather-map-layer';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { omProtocolSettings } from '$lib/stores/om-protocol-settings';

import { registerAnomalyDomain } from '$lib/anomaly-domain';
import { ANOMALY_DOMAIN, ANOMALY_VARIABLE } from '$lib/constants';

// Le pseudo-domaine anomalie porte la phase (`observed`/`forecast`/`provisional`)
// dans son chemin bucket. Le resolver maison doit l'absorber dans le baseUrl
// synthétique qu'il passe au resolver du package : depuis la 0.2.0, celui-ci lit
// le domaine dans le DERNIER segment avant le fichier `.om`, donc une phase
// laissée en place se faisait interpréter comme domaine (`Invalid domain:
// forecast`) → sources raster/vecteur en erreur, carte vide.
const parse = (url: string) => {
	const u = new URL(url);
	return {
		baseUrl: `${u.origin}${u.pathname}`,
		params: u.searchParams,
		fileAndVariableKey: `${u.pathname}?${u.searchParams.get('variable')}`,
		tileIndex: null
	};
};

describe('resolveRequest on anomaly URLs', () => {
	beforeAll(() => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		registerAnomalyDomain();
	});

	it.each(['observed', 'forecast', 'provisional'])('resolves the %s phase', (phase) => {
		const { resolveRequest } = get(omProtocolSettings);
		const resolved = resolveRequest(
			parse(
				`https://bucket.test/anomaly/temperature_2m/${phase}/2026-09-08.om?variable=${ANOMALY_VARIABLE}`
			),
			get(omProtocolSettings)
		);
		expect(resolved.dataOptions.domain.value).toBe(ANOMALY_DOMAIN);
		expect(resolved.dataOptions.variable).toBe(ANOMALY_VARIABLE);
		expect(resolved.renderOptions.colorScale).toBeDefined();
	});

	it('still routes standard data_spatial URLs through the package resolver', () => {
		const settings = get(omProtocolSettings);
		const domain = domainOptions[0].value;
		const resolved = settings.resolveRequest(
			parse(
				`https://openmeteo.s3.amazonaws.com/data_spatial/${domain}/2026/09/07/0000Z/2026-09-08T0000.om?variable=temperature_2m`
			),
			settings
		);
		expect(resolved.dataOptions.domain.value).toBe(domain);
		expect(resolved.dataOptions.variable).toBe('temperature_2m');
	});
});
