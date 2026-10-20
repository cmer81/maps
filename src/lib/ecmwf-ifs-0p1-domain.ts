import { type Domain, domainOptions } from '@openmeteo/weather-map-layer';

import { ECMWF_IFS_0P1_DOMAIN } from '$lib/constants';
import { getModelsBucketUrl } from '$lib/runtime-env';

/** Domaine ECMWF IFS 9 km (open data 0,1°, mondial), servi depuis le bucket maison
 *  par le pipeline `ecmwf-ifs-forecast` (infoclimat-pipelines). Grille régulière
 *  3600×1801 (lon −180→179,9, lat −90→90). Runs 00/06/12/18Z : 0→144 h par pas de
 *  3 h, puis jusqu'à 360 h par pas de 6 h pour 00/12Z. Contrairement à `ecmwf_ifs`
 *  (Open-Meteo, grille O1280), publie les niveaux de pression (200→1000 hPa).
 *  Les cumuls sont stockés sur l'intervalle (3 h ou 6 h) : `delta_time_hours`
 *  (`url.ts`) les convertit en taux horaire. Données © ECMWF (CC BY 4.0). */
const ecmwfIfs0p1Domain: Domain = {
	value: ECMWF_IFS_0P1_DOMAIN,
	label: 'ECMWF IFS 9 km',
	grid: {
		type: 'regular',
		nx: 3600,
		ny: 1801,
		latMin: -90,
		lonMin: -180,
		dx: 0.1,
		dy: 0.1,
		zoom: 3.2
	},
	time_interval: '3_hourly',
	model_interval: '6_hourly'
};

/**
 * Pousse le pseudo-domaine `ecmwf_ifs_0p1` dans `domainOptions` (mutable).
 * Idempotent. Ne fait rien si `VITE_MODELS_BUCKET_URL` n'est pas configuré — le
 * domaine reste alors absent du sélecteur (gating analogue aux domaines AROME maison).
 */
export function registerEcmwfIfs0p1Domain(): void {
	if (!getModelsBucketUrl()) return;
	if (domainOptions.some((d) => d.value === ECMWF_IFS_0P1_DOMAIN)) return;
	domainOptions.push(ecmwfIfs0p1Domain);
}
