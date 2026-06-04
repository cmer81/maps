import { type Domain, domainGroups, domainOptions } from '@openmeteo/weather-map-layer';

import { AROME_FRANCE_DOMAIN } from '$lib/constants';
import { getModelsBucketUrl } from '$lib/runtime-env';

/** Groupe commun aux pseudo-domaines AROME France maison (Infoclimat). Le
 *  sélecteur range un domaine sous un groupe si `domain.value.startsWith(group.value)`
 *  — ce groupe capture donc `arome_france` ET `arome_france_convection`, mais aucun
 *  domaine d'Open-Meteo (préfixés `meteofrance`). */
export const AROME_FRANCE_GROUP: { value: string; label: string } = {
	value: 'arome_france',
	label: 'AROME France (Infoclimat)'
};

/** Garantit (idempotent) la présence du groupe partagé dans `domainGroups`.
 *  Appelé par les modules `arome_france` et `arome_france_convection`. */
export function ensureAromeFranceGroup(): void {
	if (!domainGroups.some((g) => g.value === AROME_FRANCE_GROUP.value)) {
		domainGroups.push(AROME_FRANCE_GROUP);
	}
}

/** Domaine AROME France métropole surface (12 variables), servi depuis le bucket
 *  maison. Grille 1121×717 à 0.025° (métropole, lon −12→16, lat 37.5→55.4),
 *  horizon 51 h horaire, runs toutes les 3 h (8/j). Même grille que
 *  `arome_france_convection` et l'OM `meteofrance_arome_france0025`. */
const aromeFranceDomain: Domain = {
	value: AROME_FRANCE_DOMAIN,
	label: 'AROME France',
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
	time_interval: 'hourly',
	model_interval: '3_hourly'
};

/**
 * Pousse le pseudo-domaine `arome_france` dans `domainOptions` (mutable).
 * Idempotent. No-op si `VITE_MODELS_BUCKET_URL` n'est pas configuré — le domaine
 * reste alors absent du sélecteur (gating analogue à anomaly / arome-om / convection).
 */
export function registerAromeFranceDomain(): void {
	if (!getModelsBucketUrl()) return;
	ensureAromeFranceGroup();
	if (domainOptions.some((d) => d.value === AROME_FRANCE_DOMAIN)) return;
	domainOptions.push(aromeFranceDomain);
}
