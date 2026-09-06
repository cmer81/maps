import { type Domain, domainGroups, domainOptions } from '@openmeteo/weather-map-layer';

import { WEATHER_AI_GLOBAL_DOMAIN } from '$lib/constants';
import { getModelsBucketUrl } from '$lib/runtime-env';

/** Groupe (fournisseur) sous lequel `domainGroups` range le domaine IA. Le
 *  regroupement d'affichage réel vient de `MODEL_SELECTOR_GROUPS` (`constants.ts`) ;
 *  on pousse ce groupe pour rester cohérent avec les autres pseudo-domaines, dont
 *  le sélecteur historique du package se sert encore par préfixe
 *  (`'weather_ai_global'.startsWith('weather_ai')`). */
const WEATHER_AI_GROUP = 'weather_ai';

/** Domaine `weather_ai_global` — sorties du modèle IA **WeatherNext Cyclones Mini**
 *  (Google DeepMind), transposées en OMfiles `data_spatial` par le pipeline
 *  `weather-ai-forecast` (infoclimat-pipelines) et servies depuis le bucket maison.
 *
 *  Grille **globale** 1° : 360×181, `lonMin` −180, `latMin` −90, `dx = dy = 1`,
 *  ligne 0 au pôle Sud — exactement la forme des domaines globaux upstream du
 *  package (GFS 0,25° : 1440×721, `lonMin` −180, `latMin` −90, `zoom` 1), donc rien
 *  de nouveau côté rendu : `nx` ne compte pas de colonne dupliquée à la couture
 *  (360 = 360/1, pas 361) et le rasterizer interpole en bilinéaire, ce qui lisse la
 *  maille 1° au lieu de la rendre en escalier.
 *
 *  `time_interval: '6_hourly'` : les échéances sont espacées de 6 h. `model_interval:
 *  '6_hourly'` : runs 00/06/12/18 UTC. Le **nombre** d'échéances n'est jamais figé
 *  ici — il se lit dans `valid_times` du `meta.json` (3 aujourd'hui, 8 visées). */
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

/**
 * Pousse le pseudo-domaine `weather_ai_global` dans `domainOptions` (mutable).
 * Idempotent. Ne fait rien si `VITE_MODELS_BUCKET_URL` n'est pas configuré — le
 * domaine reste alors absent du sélecteur (gating analogue à anomaly / arome-om /
 * arome_france).
 */
export function registerWeatherAiGlobalDomain(): void {
	if (!getModelsBucketUrl()) return;
	if (!domainGroups.some((g) => g.value === WEATHER_AI_GROUP)) {
		domainGroups.push({ value: WEATHER_AI_GROUP, label: 'Modèles IA (expérimental)' });
	}
	if (domainOptions.some((d) => d.value === WEATHER_AI_GLOBAL_DOMAIN)) return;
	domainOptions.push(weatherAiGlobalDomain);
}
