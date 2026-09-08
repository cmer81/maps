import { type Domain, domainGroups, domainOptions } from '@openmeteo/weather-map-layer';

import { WEATHER_AI_GLOBAL_DOMAIN } from '$lib/constants';

/** Groupe (fournisseur) sous lequel `domainGroups` range le domaine IA. Le
 *  regroupement d'affichage réel vient de `MODEL_SELECTOR_GROUPS` (`constants.ts`) ;
 *  on pousse ce groupe pour rester cohérent avec les autres pseudo-domaines, dont
 *  le sélecteur historique du package se sert encore par préfixe
 *  (`'weather_ai_global'.startsWith('weather_ai')`). */
const WEATHER_AI_GROUP = 'weather_ai';

/** Domaine global du modèle WeatherNext Cyclones Mini. La grille historique
 * reste enregistrée pour le sélecteur existant ; le rendu lit la géométrie des
 * produits JSON. Initialisations et échéances viennent exclusivement de l'API. */
const weatherAiGlobalDomain: Domain = {
	value: WEATHER_AI_GLOBAL_DOMAIN,
	label: 'WeatherNext Cyclones Mini',
	grid: {
		type: 'regular',
		nx: 360,
		ny: 181,
		latMin: -90,
		lonMin: -180,
		dx: 1,
		dy: 1,
		zoom: 1
	},
	time_interval: '6_hourly',
	model_interval: '6_hourly'
};

/** Enregistrement idempotent. L'API JSON ne dépend pas du bucket OM. */
export function registerWeatherAiGlobalDomain(): void {
	if (!domainGroups.some((g) => g.value === WEATHER_AI_GROUP)) {
		domainGroups.push({ value: WEATHER_AI_GROUP, label: 'Modèles IA (expérimental)' });
	}
	if (domainOptions.some((d) => d.value === WEATHER_AI_GLOBAL_DOMAIN)) return;
	domainOptions.push(weatherAiGlobalDomain);
}
