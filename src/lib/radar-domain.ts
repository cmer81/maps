import { type Domain, domainGroups, domainOptions } from '@openmeteo/weather-map-layer';

import { RADAR_METROPOLE_DOMAIN } from '$lib/constants';
import { getModelsBucketUrl } from '$lib/runtime-env';

/** Groupe (fournisseur) sous lequel le sélecteur range le domaine radar.
 *  Le sélecteur affiche un domaine sous un groupe si `domain.value` commence
 *  par `group.value` — `radar_metropole`.startsWith('radar') === true. */
const RADAR_GROUP = 'radar';

/** Domaine observation radar France métropole (lame d'eau, pas 5 min).
 *  Grille 1650×1100 à 0,01° (lon −6→10,5, lat 41→52), produites par le pipeline
 *  `radar-forecast`. Variables : `rain_rate` (mm/5 min), `precip_1h` (cumul 1h, mm).
 *
 *  `time_interval: '15_minute'` — la valeur la plus proche de 5 min supportée par le
 *  type `ModelDt` du package (`@openmeteo/weather-map-layer`). Le type ne permet pas
 *  `'5_minutely'` (valeurs acceptées : '15_minute' | 'hourly' | '3_hourly' | …).
 *  L'impact est limité au pas de scrubbing de la timeline ; les URLs sont construites
 *  directement depuis les `valid_times` du `latest.json`.
 *
 *  `model_interval: 'hourly'` — valeur minimale supportée par `ModelUpdateInterval`
 *  (pas de valeur sub-horaire dans le type). Le pipeline publie toutes les 5 min ;
 *  ce champ contrôle uniquement la fréquence de poll du meta.json. */
const radarMetropoleDomain: Domain = {
	value: RADAR_METROPOLE_DOMAIN,
	label: "Radar France (lame d'eau)",
	grid: {
		type: 'regular',
		nx: 1650,
		ny: 1100,
		latMin: 41.0,
		lonMin: -6.0,
		dx: 0.01,
		dy: 0.01,
		zoom: 5.2
	},
	time_interval: '15_minute',
	model_interval: 'hourly'
};

/**
 * Pousse le pseudo-domaine `radar_metropole` dans `domainOptions` (mutable).
 * Idempotent. Ne fait rien si `VITE_MODELS_BUCKET_URL` n'est pas configuré —
 * le domaine reste alors absent du sélecteur (gating analogue aux autres domaines
 * maison : anomaly, arome-om, arome-france).
 */
export function registerRadarDomain(): void {
	if (!getModelsBucketUrl()) return;
	if (!domainGroups.some((g) => g.value === RADAR_GROUP)) {
		domainGroups.push({ value: RADAR_GROUP, label: 'Radar' });
	}
	if (domainOptions.some((d) => d.value === RADAR_METROPOLE_DOMAIN)) return;
	domainOptions.push(radarMetropoleDomain);
}
