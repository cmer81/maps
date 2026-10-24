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
 *  du package, isobares comme les autres modèles),
 *  `cyclone_existence_probability` (fraction 0..1, affichée en % — voir
 *  `postReadCallback` dans `stores/om-protocol-settings.ts`), `temperature_2m`
 *  en °C (échelle `temperature` du package) et, depuis weather-ai#318,
 *  `precipitation` (cumul 6 h en mm, rendu en taux moyen mm/h par l'échelle
 *  `precipitation` du package) et `wind_u_component_10m` / `wind_v_component_10m`
 *  (m/s, vitesse et flèches dérivées par le package). Liste lue dans `latest.json` : une
 *  variable ajoutée par le producteur apparaît sans modification ici. */
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

/** Champs continus de ce modèle, tels que l'onglet Cyclones IA les annonce, avec
 *  les variables `.om` qui les portent. Le vent et la précipitation (weather-ai#318)
 *  n'existent que dans les runs publiés avec trois couches maps : les anciens runs
 *  (reçu `om-maps-receipt/1`) n'ont que la température à 2 m. Le sélecteur de
 *  variables, lui, suit `latest.json` / `meta.json` sans liste codée en dur. */
export const WEATHER_AI_FIELDS: readonly { label: string; variables: readonly string[] }[] = [
	{ label: 'pression au niveau de la mer', variables: ['pressure_msl'] },
	{ label: "probabilité d'existence cyclonique", variables: ['cyclone_existence_probability'] },
	{ label: 'température à 2 m', variables: ['temperature_2m'] },
	{ label: 'vent à 10 m', variables: ['wind_u_component_10m', 'wind_v_component_10m'] },
	{ label: 'précipitations (taux moyen sur 6 h)', variables: ['precipitation'] }
];

/** Champs présents dans tous les runs publiés : ceux qu'on annonce tant que la
 *  liste des variables du dernier run n'est pas connue. */
const BASE_FIELD_VARIABLES: ReadonlySet<string> = new Set([
	'pressure_msl',
	'cyclone_existence_probability',
	'temperature_2m'
]);

/** Libellés des champs publiés : ceux dont toutes les variables figurent dans
 *  `published` (`variables` de `latest.json`), ou les champs de base sans liste. */
export function weatherAiFieldLabels(published?: readonly string[]): string[] {
	const has = published
		? (name: string) => published.includes(name)
		: (name: string) => BASE_FIELD_VARIABLES.has(name);
	return WEATHER_AI_FIELDS.filter((f) => f.variables.every(has)).map((f) => f.label);
}

/** Variables du dernier run publié (`variables` de `latest.json` du bucket), ou
 *  `undefined` si le bucket n'est pas configuré ou ne répond pas : l'appelant
 *  retombe alors sur les champs de base, sans erreur. */
export async function fetchWeatherAiVariables(): Promise<string[] | undefined> {
	const bucket = getWeatherAiOmBucketUrl().replace(/\/$/, '');
	if (!bucket) return undefined;
	try {
		const res = await fetch(`${bucket}/data_spatial/${WEATHER_AI_DOMAIN}/latest.json`);
		if (!res.ok) return undefined;
		const json: { variables?: unknown } = await res.json();
		return Array.isArray(json.variables)
			? json.variables.filter((x): x is string => typeof x === 'string')
			: undefined;
	} catch {
		return undefined;
	}
}

/** Précision affichée à côté du libellé d'une variable Weather AI. `precipitation`
 *  est publiée en cumul sur les 6 h précédant l'échéance ; la bibliothèque la
 *  divise par le pas (`delta_time_hours`) : la carte montre un taux moyen en
 *  mm/h, pas une intensité instantanée. */
export function weatherAiVariableNote(domainValue: string, variable: string): string | undefined {
	if (domainValue !== WEATHER_AI_DOMAIN) return undefined;
	if (variable === 'precipitation') return 'taux moyen sur les 6 h précédentes';
	return undefined;
}

/** Énumération française, initiale en capitale : « A, b et c ». */
export function frenchList(items: readonly string[]): string {
	const text =
		items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`;
	return text.charAt(0).toUpperCase() + text.slice(1);
}

// Attribution et licence des produits Weather AI, telles que le portail les sert
// (`attribution` / `license_notice` du catalogue, identiques pour la pression et
// la probabilité d'existence) et que le producteur les inscrit dans le scalaire
// `metadata` de chaque `.om`. Recopiées à l'identique : ne pas reformuler.
export const WEATHER_AI_ATTRIBUTION =
	'WeatherNext Cyclones Mini (2023), Google DeepMind; ECMWF open data (CC BY 4.0), modified; OSTIA SST, Met Office; Generated using E.U. Copernicus Marine Service Information; https://doi.org/10.48670/moi-00165';

export const WEATHER_AI_LICENSE_NOTICE =
	'Experimental internal POC; WeatherNext Cyclones Mini model weights are CC BY 4.0 and WeatherNext code is Apache-2.0.';

/** Cible du lien « Sources et licence » de la notice d'attribution de la carte :
 *  un clic dessus ouvre les mentions complètes (`weather-ai-sources-dialog.svelte`),
 *  sans toucher au hash de l'URL, qui porte la vue de la carte. Repéré par son
 *  `href` : MapLibre ne garde que lui sur les liens d'attribution. */
export const WEATHER_AI_SOURCES_HREF = '#weather-ai-sources';

const escapeHtml = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Attribution des couches Weather AI dans la notice compacte MapLibre (« i »),
 *  injectée en HTML par MapLibre : texte du producteur à l'identique, puis le
 *  lien vers les mentions complètes (licence, non-responsabilité ECMWF…). */
export const WEATHER_AI_MAP_ATTRIBUTION = `${escapeHtml(WEATHER_AI_ATTRIBUTION)} · <a href="${WEATHER_AI_SOURCES_HREF}">Sources et licence</a>`;

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
