import { type Domain, domainOptions } from '@openmeteo/weather-map-layer';

import { AGROCLIMATO_FRANCE_DOMAIN } from '$lib/constants';
import { getModelsBucketUrl } from '$lib/runtime-env';

/** Pseudo-domaine agroclimatologique France métropole, servi depuis le bucket
 *  maison (Infoclimat). 7 indices **journaliers** (`temperature_2m_min/max`,
 *  `frost_hours`, `heat_hours`, `et0_fao`, `vpd`, `thi_livestock`), un OMfile par
 *  jour nommé `YYYY-MM-DD.om` (= minuit UTC). Même grille que `arome_france` /
 *  `arome_france_convection` (1121×717 à 0,025°, lon −12→16, lat 37.5→55.4 ;
 *  cf. `AromeFranceGrid` dans `infoclimat-pipelines`).
 *
 *  `time_interval: 'daily'` → la timeline affiche les jours (cf. `isDailyDomain`
 *  dans `time-selector.svelte`) et `getOMUrlFor()` nomme le fichier par date
 *  (cf. `DAILY_FILE_DOMAINS`). Le layout reste `data_spatial/{domain}/…` standard
 *  → resolver par défaut, aucune modif du protocole `om://`. */
const agroclimatoFranceDomain: Domain = {
	value: AGROCLIMATO_FRANCE_DOMAIN,
	label: 'Agroclimato France',
	grid: {
		type: 'regular',
		nx: 1121,
		ny: 717,
		latMin: 37.5,
		lonMin: -12,
		dx: 0.025,
		dy: 0.025,
		zoom: 5.2
	},
	time_interval: 'daily',
	model_interval: 'daily'
};

/**
 * Pousse le pseudo-domaine `agroclimato_france` dans `domainOptions` (mutable).
 * Idempotent. No-op si `VITE_MODELS_BUCKET_URL` n'est pas configuré — le domaine
 * reste alors absent du sélecteur (même gating que les autres domaines maison).
 */
export function registerAgroclimatoFranceDomain(): void {
	if (!getModelsBucketUrl()) return;
	if (domainOptions.some((d) => d.value === AGROCLIMATO_FRANCE_DOMAIN)) return;
	domainOptions.push(agroclimatoFranceDomain);
}
