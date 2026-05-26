import { type Domain, domainOptions } from '@openmeteo/weather-map-layer';

import { ANOMALY_DOMAIN } from '$lib/constants';
import { getModelsBucketUrl } from '$lib/runtime-env';

/** Domaine synthétique calqué sur la grille ARPEGE Europe (741×521, 0.1°). */
const anomalyDomain: Domain = {
	value: ANOMALY_DOMAIN,
	label: 'Anomalie T° (Europe)',
	grid: {
		type: 'regular',
		nx: 741,
		ny: 521,
		latMin: 20,
		lonMin: -32,
		dx: 0.1,
		dy: 0.1,
		zoom: 1
	},
	time_interval: 'daily',
	model_interval: 'daily'
};

/**
 * Pousse le pseudo-domaine anomalie dans `domainOptions` (mutable). Idempotent.
 * Ne fait rien si `VITE_MODELS_BUCKET_URL` n'est pas configuré — le domaine
 * reste alors absent du sélecteur (gating analogue au feature cumul).
 */
export function registerAnomalyDomain(): void {
	if (!getModelsBucketUrl()) return;
	if (domainOptions.some((d) => d.value === ANOMALY_DOMAIN)) return;
	domainOptions.push(anomalyDomain);
}
