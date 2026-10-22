import { type Domain, domainOptions } from '@openmeteo/weather-map-layer';

import { WEATHER_AI_DOMAIN } from '$lib/constants';
import { getWeatherAiOmBucketUrl } from '$lib/runtime-env';

/** Pseudo-domaine Weather AI (WeatherNext Cyclones Mini, Google DeepMind) : grille
 *  globale 1° du produit Gold, telle qu'exportée par le producteur weather-ai
 *  (`scripts/wn2/om_publish.py`, #266) — 181 lignes du sud (−90°) au nord, 360
 *  colonnes de −180° à 179° (colonnes source 0..359 réordonnées, pas de colonne
 *  +180 dupliquée : le package détecte le bouclage à l'antiméridien via
 *  `|dx|·nx == 360`).
 *  `time_interval: '6_hourly'` (échéances +6 h à +72 h toutes les 6 h, pas
 *  d'échéance 0), `model_interval: '6_hourly'` (runs 00/06/12/18 UTC).
 *  Variables : `pressure_msl` en hPa (Pa ÷ 100 côté producteur, échelle `pressure`
 *  du package, isobares comme les autres modèles) et
 *  `cyclone_existence_probability` (fraction 0..1, affichée en % — voir
 *  `postReadCallback` dans `stores/om-protocol-settings.ts`). */
export const weatherAiDomain: Domain = {
	value: WEATHER_AI_DOMAIN,
	label: 'Weather AI (WeatherNext)',
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
 * Pousse le pseudo-domaine Weather AI dans `domainOptions` (mutable). Idempotent.
 * Ne fait rien si `VITE_WEATHER_AI_OM_BUCKET_URL` n'est pas configuré — le
 * domaine reste alors absent du sélecteur (même gating que les domaines du
 * bucket maison, sur une variable propre puisque le bucket est distinct).
 */
export function registerWeatherAiDomain(): void {
	if (!getWeatherAiOmBucketUrl()) return;
	if (domainOptions.some((d) => d.value === WEATHER_AI_DOMAIN)) return;
	domainOptions.push(weatherAiDomain);
}

// Attribution et licence des produits Weather AI, telles que le portail les sert
// (`attribution` / `license_notice` du catalogue, identiques pour la pression et
// la probabilité d'existence) et que le producteur les inscrit dans le scalaire
// `metadata` de chaque `.om`. Recopiées à l'identique : ne pas reformuler.
export const WEATHER_AI_ATTRIBUTION =
	'WeatherNext Cyclones Mini (2023), Google DeepMind; ECMWF open data (CC BY 4.0), modified; OSTIA SST, Met Office; Generated using E.U. Copernicus Marine Service Information; https://doi.org/10.48670/moi-00165';

export const WEATHER_AI_LICENSE_NOTICE =
	'Experimental internal POC; WeatherNext Cyclones Mini model weights are CC BY 4.0 and WeatherNext code is Apache-2.0.';

/** Attribut du lien « Sources et licence » de la notice d'attribution de la
 *  carte : un clic dessus ouvre les mentions complètes
 *  (`weather-ai-sources-dialog.svelte`). Lien intercepté plutôt qu'une ancre,
 *  le hash de l'URL portant la vue de la carte. */
export const WEATHER_AI_SOURCES_LINK_ATTR = 'data-weather-ai-sources';

const escapeHtml = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Attribution des couches Weather AI dans la notice compacte MapLibre (« i »),
 *  injectée en HTML par MapLibre : texte du producteur à l'identique, puis le
 *  lien vers les mentions complètes (licence, non-responsabilité ECMWF…). */
export const WEATHER_AI_MAP_ATTRIBUTION = `${escapeHtml(WEATHER_AI_ATTRIBUTION)} · <a href="#" ${WEATHER_AI_SOURCES_LINK_ATTR}>Sources et licence</a>`;

/**
 * Attribution à déclarer sur une source `om://` : celle de Weather AI quand la
 * source lit le bucket du domaine, rien sinon. Portée par la source, elle suit
 * la couche — MapLibre la retire de la notice quand la source disparaît (autre
 * modèle sélectionné).
 */
export function omSourceAttribution(sourceUrl: string): { attribution?: string } {
	return sourceUrl.includes(`/data_spatial/${WEATHER_AI_DOMAIN}/`)
		? { attribution: WEATHER_AI_MAP_ATTRIBUTION }
		: {};
}
