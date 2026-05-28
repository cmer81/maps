import { type Domain, domainGroups, domainOptions } from '@openmeteo/weather-map-layer';

import { AROME_OM_REUNION_DOMAIN } from '$lib/constants';
import { getModelsBucketUrl } from '$lib/runtime-env';

/** Groupe (fournisseur) sous lequel le sélecteur range les domaines AROME-OM.
 *  Le sélecteur affiche un domaine sous un groupe si `domain.value` commence
 *  par `group.value` — `arome_om_reunion`.startsWith('arome_om') === true.
 *  Le préfixe `arome_om` permet d'ajouter Antilles/Guyane/NCal/Polynésie
 *  comme variants futurs sans toucher au groupe. */
const AROME_OM_GROUP = 'arome_om';

/** Domaine AROME-OM Réunion / Océan Indien (modèle Météo-France OM-INDIEN).
 *  Couvre Réunion, Mayotte, Madagascar, côte est-africaine, sud de l'Inde.
 *  Dimensions extraites du header GRIB2 réel (cf. infoclimat-pipelines
 *  spec `2026-05-28-arome-om-forecast-design.md`). */
const aromeOmReunionDomain: Domain = {
	value: AROME_OM_REUNION_DOMAIN,
	label: 'AROME-OM Réunion-Mayotte',
	grid: {
		type: 'regular',
		nx: 1395,
		ny: 899,
		latMin: -25.9,
		lonMin: 32.75,
		dx: 0.025,
		dy: 0.025,
		// Même résolution native que AROME France 0.025° → même zoom de référence.
		zoom: 5.2
	},
	// L'API MF publie un fichier par leadtime horaire (000H..048H).
	time_interval: 'hourly',
	// 4 runs/jour à 00/06/12/18 UTC.
	model_interval: '6_hourly'
};

/**
 * Pousse le pseudo-domaine `arome_om_reunion` dans `domainOptions` (mutable).
 * Idempotent. Ne fait rien si `VITE_MODELS_BUCKET_URL` n'est pas configuré —
 * le domaine reste alors absent du sélecteur (gating analogue à anomaly).
 */
export function registerAromeOmDomain(): void {
	if (!getModelsBucketUrl()) return;
	if (!domainGroups.some((g) => g.value === AROME_OM_GROUP)) {
		domainGroups.push({ value: AROME_OM_GROUP, label: 'AROME Outre-Mer' });
	}
	if (domainOptions.some((d) => d.value === AROME_OM_REUNION_DOMAIN)) return;
	domainOptions.push(aromeOmReunionDomain);
}
