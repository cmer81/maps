// Domain and variable defaults
export const DEFAULT_DOMAIN = 'arome_france';
export const DEFAULT_VARIABLE = 'temperature_2m';

/** Pseudo-domaine des anomalies de température (servi depuis le bucket R2). */
export const ANOMALY_DOMAIN = 'anomaly_europe';
/** Variable unique exposée par le pseudo-domaine anomalie. */
export const ANOMALY_VARIABLE = 'temperature_2m_anomaly';

/** Pseudo-domaines AROME-OM (servis depuis le bucket R2, produits par le pipeline
 *  `arome-om-forecast`). Cinq territoires d'outre-mer, même modèle Météo-France
 *  0,025° (~2,5 km), mêmes 12 variables de surface — ils ne diffèrent que par leur
 *  emprise géographique (cf. `arome-om-domain.ts` pour les grilles). */
export const AROME_OM_REUNION_DOMAIN = 'arome_om_reunion';
export const AROME_OM_ANTILLES_DOMAIN = 'arome_om_antilles';
export const AROME_OM_GUYANE_DOMAIN = 'arome_om_guyane';
export const AROME_OM_NCALEDONIE_DOMAIN = 'arome_om_ncaledonie';
export const AROME_OM_POLYNESIE_DOMAIN = 'arome_om_polynesie';

/** Pseudo-domaine AROME France métropole orienté convection/orage (servi depuis
 *  le bucket R2, produit par le pipeline `arome-france-forecast`). Distinct du
 *  `arome_france` général d'Open-Meteo (le suffixe `_convection` lève la collision). */
export const AROME_FRANCE_CONVECTION_DOMAIN = 'arome_france_convection';

/** Pseudo-domaine AROME France métropole **surface** (12 variables standard
 *  Open-Meteo), servi depuis le bucket maison par le pipeline `arome-france-forecast`.
 *  Distinct de `arome_france_convection` (orienté convection/orage) et des AROME
 *  d'Open-Meteo (`meteofrance_arome_france*`). */
export const AROME_FRANCE_DOMAIN = 'arome_france';

/** Pseudo-domaine AROME France HD métropole **haute résolution** (0,01° ≈ 1,3 km),
 *  servi depuis le bucket maison Infoclimat. Même grille que l'AROME France HD
 *  d'Open-Meteo (`meteofrance_arome_france_hd`, 2801×1791) mais produit/hébergé en
 *  propre — le suffixe sans préfixe `meteofrance_` lève la collision. */
export const AROME_FRANCE_HD_DOMAIN = 'arome_france_hd';

/** Pseudo-domaine **global** `weather_ai_global` (bucket maison Infoclimat), produit
 *  par le pipeline `weather-ai-forecast` à partir des sorties du modèle IA
 *  **WeatherNext Cyclones Mini** (Google DeepMind). Deux variables : `pressure_msl`
 *  (hPa) et `cyclone_existence` (probabilité). Grille globale 1° (360×181), runs
 *  6-horaires. Produit **expérimental** : aucune valeur d'alerte (cf.
 *  `EXPERIMENTAL_DOMAINS`), poids du modèle sous licence CC BY-NC-SA 4.0 — la notice
 *  et l'attribution exactes sont lues dans la métadonnée de l'OMfile
 *  (`weather-ai-metadata.ts`), jamais réécrites ici. */
export const WEATHER_AI_GLOBAL_DOMAIN = 'weather_ai_global';

/** Domaines dont les produits sont **expérimentaux** : ils n'ont aucune autorité
 *  d'alerte et doivent porter un badge explicite partout où le modèle est nommé
 *  (sélecteur de modèles, bandeau de contexte). Le contrat amont porte
 *  `extra.experimental: true` dans la métadonnée de l'OMfile ; cette liste est le
 *  miroir côté client, consultée avant même que la métadonnée soit chargée (le badge
 *  ne doit jamais dépendre d'un fetch réussi). */
export const EXPERIMENTAL_DOMAINS: readonly string[] = [WEATHER_AI_GLOBAL_DOMAIN];

export const isExperimentalDomain = (domain: string): boolean =>
	EXPERIMENTAL_DOMAINS.includes(domain);

/** Vue de carte recommandée par domaine — appliquée via `flyTo` quand l'utilisateur
 *  bascule manuellement sur le domaine. Utile pour les pseudo-domaines régionaux
 *  dont le centre de grille tombe sur une zone océan/peu lisible.
 *  Format MapLibre : `{ center: [lon, lat], zoom }`. */
export const DOMAIN_DEFAULT_VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
	[AROME_OM_REUNION_DOMAIN]: { center: [50.2, -15.97], zoom: 4.47 },
	[AROME_OM_ANTILLES_DOMAIN]: { center: [-63.5, 16.3], zoom: 5 },
	[AROME_OM_GUYANE_DOMAIN]: { center: [-51.5, 5.0], zoom: 5.9 },
	[AROME_OM_NCALEDONIE_DOMAIN]: { center: [165.0, -19.9], zoom: 5.3 },
	[AROME_OM_POLYNESIE_DOMAIN]: { center: [-151.0, -18.9], zoom: 5.3 },
	[AROME_FRANCE_CONVECTION_DOMAIN]: { center: [2.3, 46.6], zoom: 5 },
	[AROME_FRANCE_DOMAIN]: { center: [2.3, 46.6], zoom: 5 },
	[AROME_FRANCE_HD_DOMAIN]: { center: [2.3, 46.6], zoom: 5 },
	// Seul domaine global du client servi depuis le bucket maison : on cadre le
	// planisphère centré sur la bande tropicale, où vivent les cyclones que le
	// modèle cible (zoom 1 = grille entière, comme les globaux upstream).
	[WEATHER_AI_GLOBAL_DOMAIN]: { center: [0, 10], zoom: 1.2 }
};

/** Variable affichée par défaut quand l'utilisateur bascule sur un domaine et que
 *  la variable courante n'existe pas dans son meta.json. Consulté par
 *  `matchVariableOrFirst()` avant le fallback `variables[0]`. */
export const DOMAIN_DEFAULT_VARIABLES: Record<string, string> = {
	[AROME_FRANCE_CONVECTION_DOMAIN]: 'radar_reflectivity',
	[AROME_FRANCE_DOMAIN]: 'temperature_2m',
	[AROME_FRANCE_HD_DOMAIN]: 'temperature_2m',
	meteofrance_arome_france_hd_15min: 'precipitation',
	meteofrance_arome_france0025_15min: 'wind_gusts_10m',
	knmi_harmonie_arome_europe: 'temperature_2m',
	// `pressure_msl` plutôt que `cyclone_existence` : la probabilité cyclonique est
	// nulle sur ~98 % du globe, une bascule de domaine y ouvrirait une carte vide
	// qu'on prendrait pour une panne. La pression donne un champ global lisible ;
	// la variable cyclone reste à un clic.
	[WEATHER_AI_GLOBAL_DOMAIN]: 'pressure_msl'
};

/** Variables masquées du sélecteur (display-only), même si publiées dans le
 *  meta.json du domaine. Filtré par `buildVariableList()` (`src/lib/layer-list.ts`). Une URL partagée
 *  ciblant l'une d'elles résout toujours (comme `DOMAIN_ALLOWLIST` pour les modèles).
 *
 *  `precipitation_type` / `precipitation_type_severe` : variables catégorielles
 *  rendues incorrectement par `@openmeteo/weather-map-layer` (échantillonnage
 *  bilinéaire des données → halos de catégorie parasite en lisière, valeurs non
 *  entières au survol ; aucun mode nearest-neighbor exposé). Masquées en attendant
 *  une refacto / un correctif amont du package. Suivi : issue #35. */
export const HIDDEN_VARIABLES: readonly string[] = [
	'precipitation_type',
	'precipitation_type_severe'
];

/** Variables autonomes que le `LEVEL_PREFIX` du package replie **à tort** sur un
 *  groupe de niveaux. `wind_chill_2m` (refroidissement éolien, un indice de
 *  température ressentie en °C) est capturé par le préfixe « wind » du package
 *  (`wind(?!_gusts|_direction)` — le `_chill` n'est pas exclu) : replié, il
 *  apparaissait sous « Vent » avec un niveau « 2 m » (AROME France / HD), laissant
 *  croire à un bug puisqu'il affiche des températures.
 *
 *  Listées ici, ces variables ne sont **jamais** repliées par `buildVariableList()`
 *  (`src/lib/layer-list.ts`) :
 *  elles restent des variables autonomes, classées par `categorize()`
 *  (`wind_chill` → `temperature`) et libellées via `i18n/variables-fr.ts`. */
export const NON_LEVEL_GROUP_VARIABLES: readonly string[] = ['wind_chill_2m'];

// Vector options defaults
export const DEFAULT_VECTOR_OPTIONS = {
	grid: false,
	arrows: false,
	contours: false,
	breakpoints: true,
	contourInterval: 2
};

// Preferences defaults
export const DEFAULT_PREFERENCES = {
	globe: false,
	terrain: false,
	hillshade: true,
	clipWater: false,
	showScale: true
};

// Vue 3D (bouton preset) — angle caméra + exagération du relief, ajustables.
export const VIEW_3D_PITCH = 60;
export const VIEW_3D_EXAGGERATION = 1.4;

// Layer names for map rendering
export const HILLSHADE_LAYER = 'hillshadeLayer';
export const BEFORE_LAYER_RASTER = 'waterway-tunnel';
export const BEFORE_LAYER_VECTOR = 'place_label_other';
export const BEFORE_LAYER_VECTOR_WATER_CLIP = 'water-clip';
// 2nd raster scalar layer — placed above the 1st raster (BEFORE_LAYER_RASTER) but
// below the vector layer (BEFORE_LAYER_VECTOR), so wind arrows stay on top.
export const BEFORE_LAYER_RASTER_SECONDARY = BEFORE_LAYER_VECTOR;

// Default tile size and opacity
export const DEFAULT_TILE_SIZE = 512;
export const DEFAULT_OPACITY = 75;

// Cache defaults (in KB and MB for UI display)
export const DEFAULT_CACHE_BLOCK_SIZE_KB = 64;
// 1 GiO : large pour la fenêtre glissante de scrubbing (neighbor-prefetch) sans
// saturer un petit disque. Le quota navigateur est typiquement bien supérieur
// (plusieurs Go) ; cf. requestPersistentStorage() qui empêche l'éviction d'origine.
// Override manuel via le store persisté `cacheMaxBytesMb` (réglages → Cache).
export const DEFAULT_CACHE_MAX_BYTES_MB = 1024;

// Measured HTTP/2 overhead per range request (~1342 bytes: HPACK headers + framing).
// Rounded up to 1408 for safety margin (Range/Content-Range header lengths vary with file offset).
// Subtracted from block size so total transfer fits within the nominal KiB boundary.
export const HTTP_OVERHEAD_BYTES = 1408;

// Préchargement automatique des échéances voisines (issue #46).
// Fenêtre asymétrique dans le sens de navigation : FORWARD pas devant, BACKWARD derrière.
export const NEIGHBOR_PREFETCH_FORWARD = 3;
export const NEIGHBOR_PREFETCH_BACKWARD = 1;
// Pause après le dernier changement d'échéance avant de lancer le préchargement.
export const NEIGHBOR_PREFETCH_DEBOUNCE_MS = 400;

// Complete default values for URL parameter checking
export const COMPLETE_DEFAULT_VALUES: { [key: string]: boolean | string | number } = {
	domain: DEFAULT_DOMAIN,
	variable: DEFAULT_VARIABLE,
	...DEFAULT_PREFERENCES,
	...DEFAULT_VECTOR_OPTIONS,
	variable2: 'precipitation',
	opacity2: 70,
	layer2: 'false',
	wind_overlay: 'false',
	wind_overlay_level: '10m',
	labels: 'false',
	departments: 'true',
	grid_values: 'false'
};

// Contours départements FR — GeoJSON dérivé d'OpenStreetMap (admin_level=6,
// même source que le fond OpenFreeMap → bon raccord), simplifié (mapshaper
// Visvalingam 0,4 %) et arrondi à 5 décimales : ~200 KB / ~70 KB gzip, 100
// features (métropole + Corse + DOM 971/974/976). Bundlé pour éviter le CORS et
// rester visible à tous les zooms (le fond ne porte admin_level=6 qu'à z9+).
// Licence ODbL.
export const DEPARTMENTS_GEOJSON_URL = '/departements.geojson';

// Niveaux iso-pression exposés dans le sélecteur (hPa). Les niveaux non listés
// restent fonctionnels via URL partagée — c'est purement un filtre d'affichage.
// Les unités non-hPa (2m, 10m, 80m, 120m, 180m…) ne sont pas filtrées.
export const VISIBLE_PRESSURE_LEVELS_HPA: readonly number[] = [
	1000, 925, 850, 700, 500, 300, 250, 200
];

// Niveaux de pression (hPa) lus pour reconstruire une colonne de sondage, du sol
// vers le sommet. Distinct de VISIBLE_PRESSURE_LEVELS_HPA (filtre d'affichage du
// sélecteur). Source-agnostique : voir SOUNDING_LEVELS_BY_DOMAIN pour les domaines
// qui n'exposent qu'un sous-ensemble (ex. futur arome_om_reunion).
export const SOUNDING_PRESSURE_LEVELS_HPA: readonly number[] = [
	1000, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 275, 250, 225,
	200, 175, 150, 125, 100
];

// Niveaux disponibles par domaine. Défaut = liste complète métropole. La Réunion
// (arome_om_reunion) fournira sa propre liste quand les données seront produites.
export const SOUNDING_LEVELS_BY_DOMAIN: Readonly<Record<string, readonly number[]>> = {
	meteofrance_arome_france0025: SOUNDING_PRESSURE_LEVELS_HPA
};

// Certains domaines affichés ne diffusent pas (assez de) niveaux de pression
// pour le sondage : la carte montre ses champs, mais la colonne verticale est
// lue depuis un AUTRE domaine sur la MÊME grille. C'est le cas d'`arome_france`
// (bucket maison Infoclimat) → le sondage lit l'AROME 0,025° d'Open-Meteo, qui
// partage exactement la grille (1121×717 @ 0,025°) et publie les 24 niveaux
// iso-pression. `arome_france` publie bien quelques niveaux (300/500/700/850/
// 925/1000 hPa), mais ces 6 niveaux ne suffisent pas à reconstruire la colonne.
// Non listé = le domaine est sa propre source (lecture sur place).
export const SOUNDING_SOURCE_BY_DOMAIN: Readonly<Record<string, string>> = {
	arome_france: 'meteofrance_arome_france0025'
};

// Domaine effectif où lire la colonne de sondage pour un domaine affiché.
export const soundingSourceDomain = (domain: string): string =>
	SOUNDING_SOURCE_BY_DOMAIN[domain] ?? domain;

export const soundingLevelsForDomain = (domain: string): readonly number[] =>
	SOUNDING_LEVELS_BY_DOMAIN[soundingSourceDomain(domain)] ?? SOUNDING_PRESSURE_LEVELS_HPA;

// Un domaine supporte le sondage vertical si sa SOURCE diffuse des niveaux de
// pression — c.-à-d. si le domaine source est listé dans SOUNDING_LEVELS_BY_DOMAIN
// (AROME 0,025° directement, ou `arome_france` via sa redirection vers l'OM 0025).
// Sert à n'afficher le bouton « Sondage vertical » que sur ces modèles.
export const isSoundingDomain = (domain: string): boolean =>
	Object.prototype.hasOwnProperty.call(SOUNDING_LEVELS_BY_DOMAIN, soundingSourceDomain(domain));

/** Source unique du sélecteur de modèles : ordre des groupes, ordre des modèles,
 *  groupe d'appartenance et libellé affiché. Privilégie les modèles français en tête
 *  (issue #48). Remplace l'ancien mécanisme de regroupement par préfixe
 *  (`domain.value.startsWith(group.value)`) du package, incapable de fusionner sous
 *  un même groupe des domaines aux préfixes hétérogènes (AROME HD / France / OM).
 *
 *  Les pseudo-domaines servis depuis le bucket R2 (`anomaly_europe`, `arome_*`) ne
 *  sont enregistrés dans `domainOptions` que si le bucket est configuré ; le sélecteur
 *  saute ceux absents (cf. `model-selector.svelte`). */
export const MODEL_SELECTOR_GROUPS = [
	{
		label: 'Météo-France Arome',
		domains: [
			{ value: AROME_FRANCE_HD_DOMAIN, label: 'Arome France HD' },
			{ value: 'meteofrance_arome_france_hd_15min', label: 'Arome France HD 15min' },
			{ value: AROME_FRANCE_DOMAIN, label: 'Arome France 2.5' },
			{ value: 'meteofrance_arome_france0025_15min', label: 'Arome France 2.5 15min' },
			{ value: AROME_FRANCE_CONVECTION_DOMAIN, label: 'Arome France Convection' },
			{ value: AROME_OM_REUNION_DOMAIN, label: 'Arome OM Réunion-Mayotte' },
			{ value: AROME_OM_ANTILLES_DOMAIN, label: 'Arome OM Antilles' },
			{ value: AROME_OM_GUYANE_DOMAIN, label: 'Arome OM Guyane' },
			{ value: AROME_OM_POLYNESIE_DOMAIN, label: 'Arome OM Polynésie' },
			{ value: AROME_OM_NCALEDONIE_DOMAIN, label: 'Arome OM Nouvelle-Calédonie' }
		]
	},
	{
		label: 'Météo-France Arpège',
		domains: [
			{ value: 'meteofrance_arpege_europe', label: 'Arpège Europe' },
			{ value: 'meteofrance_arpege_world025', label: 'Arpège Monde' }
		]
	},
	{
		label: 'DWD Germany',
		domains: [
			{ value: 'dwd_icon', label: 'DWD ICON Global' },
			{ value: 'dwd_icon_eu', label: 'DWD ICON EU' },
			{ value: 'dwd_icon_d2', label: 'DWD ICON D2' }
		]
	},
	{
		label: 'MeteoSwiss',
		domains: [
			{ value: 'meteoswiss_icon_ch1', label: 'ICON CH1' },
			{ value: 'meteoswiss_icon_ch2', label: 'ICON CH2' }
		]
	},
	{
		label: 'KNMI Netherlands',
		domains: [{ value: 'knmi_harmonie_arome_europe', label: 'Harmonie AROME Europe' }]
	},
	{
		label: 'ECMWF',
		domains: [
			{ value: 'ecmwf_ifs025', label: 'ECMWF IFS 0.25' },
			{ value: 'ecmwf_ifs', label: 'ECMWF IFS HRES' },
			{ value: 'ecmwf_aifs025_single', label: 'ECMWF AIFS 0.25' }
		]
	},
	{
		label: 'NOAA US',
		domains: [{ value: 'ncep_gfs025', label: 'GFS Global 0.25' }]
	},
	{
		label: 'Modèles IA (expérimental)',
		domains: [{ value: WEATHER_AI_GLOBAL_DOMAIN, label: 'WeatherNext Cyclones Mini' }]
	},
	{
		label: 'Anomalie',
		domains: [{ value: ANOMALY_DOMAIN, label: 'Anomalie T°C (Europe ERA/Arpège)' }]
	}
] as const satisfies readonly {
	label: string;
	domains: readonly { value: string; label: string }[];
}[];

/** Domaines visibles dans le sélecteur, dérivés de `MODEL_SELECTOR_GROUPS` (aplatissement
 *  dans l'ordre d'affichage). Display-only : filtre le sélecteur sans bloquer le routing
 *  — une URL partagée ciblant un domaine non listé résout toujours (le reste de l'app lit
 *  `domainOptions` non filtré). */
export const DOMAIN_ALLOWLIST: readonly string[] = MODEL_SELECTOR_GROUPS.flatMap((g) =>
	g.domains.map((d) => d.value)
);

/**
 * Domaine affiché (app) → identifiant `models=` de l'API JSON Open-Meteo.
 * Un domaine absent = pas de meteogram (bouton masqué). `arome_france`/
 * `arome_france_convection` (bucket maison) et `anomaly_europe` sont volontairement
 * hors table : absents de l'API publique.
 *
 * `dwd_icon` (label « DWD ICON Global ») → `icon_global`, pas `dwd_icon_seamless`
 * (n'existe pas dans l'enum `models=` — vérifié dans `../open-meteo/openapi/forecast.yml`,
 * qui ne porte aucun préfixe `dwd_`) ni `icon_seamless` (blend auto multi-résolution,
 * sémantique différente du modèle Global figé affiché ici).
 */
export const DOMAIN_TO_API_MODEL: Readonly<Record<string, string>> = {
	meteofrance_arpege_europe: 'meteofrance_arpege_europe',
	meteofrance_arpege_world025: 'meteofrance_arpege_world',
	// Pseudo-domaines maison (bucket R2) : absents de l'API publique Open-Meteo,
	// mais servis par l'API forecast maison (getForecastApiUrl) sur la grille
	// AROME France (~2,5 km @ 0,025°). Le meteogram lit les variables de surface.
	arome_france: 'meteofrance_arome_france',
	arome_france_convection: 'meteofrance_arome_france',
	arome_france_hd: 'meteofrance_arome_france_hd',
	dwd_icon: 'icon_global',
	dwd_icon_eu: 'icon_eu',
	dwd_icon_d2: 'icon_d2',
	meteoswiss_icon_ch1: 'meteoswiss_icon_ch1',
	meteoswiss_icon_ch2: 'meteoswiss_icon_ch2',
	ecmwf_ifs025: 'ecmwf_ifs025',
	ecmwf_ifs: 'ecmwf_ifs',
	ecmwf_aifs025_single: 'ecmwf_aifs025_single',
	ncep_gfs025: 'gfs_global'
};

// Badges courts affichés dans le trigger et la liste du sélecteur de modèle.
// Format : resolution / zone / pas de temps. Doit rester concis (< 30 caracteres).
export const MODEL_BADGES: Record<string, string> = {
	arome_france_hd: '0,01° · France · 1 h',
	meteofrance_arome_france_hd_15min: '0,01° · France · 15 min',
	arome_france: '0,025° · France · 1 h',
	meteofrance_arome_france0025_15min: '0,025° · France · 15 min',
	arome_france_convection: '0,025° · France · orage',
	arome_om_reunion: '0,025° · Réunion · 1 h',
	arome_om_antilles: '0,025° · Antilles · 1 h',
	arome_om_guyane: '0,025° · Guyane · 1 h',
	arome_om_ncaledonie: '0,025° · Nouvelle-Calédonie · 1 h',
	arome_om_polynesie: '0,025° · Polynésie · 1 h',
	meteofrance_arome_france0025: '0,025° · France · niveaux',
	meteofrance_arpege_europe: '11 km · Europe · 4 j',
	meteofrance_arpege_world025: '0,25° · Monde · 4 j',
	ncep_gfs025: '0,25° · Monde · 16 j',
	ecmwf_ifs: 'Global · reference · 15 j',
	ecmwf_ifs025: '0,25° · Monde · 15 j',
	ecmwf_aifs025_single: '0,25° · Monde · IA · 15 j',
	dwd_icon: '13 km · Monde · 7,5 j',
	dwd_icon_d2: '2 km · Europe centrale · 2 j',
	dwd_icon_eu: '7 km · Europe · 5 j',
	meteoswiss_icon_ch1: '1 km · Alpes · 33 h',
	meteoswiss_icon_ch2: '2 km · Alpes · 5 j',
	knmi_harmonie_arome_europe: '5,5 km · Europe · 2,5 j',
	anomaly_europe: 'Anomalie T°C · Europe',
	weather_ai_global: '1° · Monde · 6 h · IA'
};

// Descriptions courtes par modèle, affichées sous le nom dans le sélecteur de modèle
// pour aider à choisir (fournisseur · résolution/zone · échéance). Optionnel par domaine.
export const MODEL_DESCRIPTIONS: Record<string, string> = {
	anomaly_europe: 'Écart à la température normale 1991–2020 · Europe',
	arome_om_reunion: 'Météo-France · Outre-mer, La Réunion · haute résolution',
	arome_om_antilles: 'Météo-France · Outre-mer, Antilles · haute résolution',
	arome_om_guyane: 'Météo-France · Outre-mer, Guyane · haute résolution',
	arome_om_ncaledonie: 'Météo-France · Outre-mer, Nouvelle-Calédonie · haute résolution',
	arome_om_polynesie: 'Météo-France · Outre-mer, Polynésie française · haute résolution',
	arome_france_convection:
		'Infoclimat · 0,025° (~2,5 km), France métropole · convection / orage · ~51 h',
	arome_france:
		'Infoclimat · 0,025° (~2,5 km), France métropole · surface · ~51 h · émagramme (sondage)',
	arome_france_hd:
		'Infoclimat · 0,01° (~1,3 km), France métropole · surface haute résolution · ~2 j',
	meteofrance_arome_france_hd_15min:
		'Météo-France · 0,01° (~1,3 km), France · pas 15 min · court terme (~6 h)',
	meteofrance_arome_france0025_15min:
		'Météo-France · 0,025° (~2,5 km), France · vent multi-niveaux · pas 15 min · court terme (~6 h)',
	meteofrance_arome_france0025:
		'Météo-France · 0,025° (~2,5 km), France · niveaux de pression (sondage) · ~2 j',
	meteofrance_arpege_europe: 'Météo-France · ~11 km, Europe · échéance ~4 j',
	meteofrance_arpege_world025: 'Météo-France · global 0,25° · échéance ~4 j',
	ncep_gfs025: 'NOAA (USA) · global 0,25° · échéance ~16 j',
	ecmwf_ifs: 'ECMWF (Europe) · global · référence moyenne échéance · ~15 j',
	ecmwf_ifs025: 'ECMWF (Europe) · global 0,25° · référence fiable · ~15 j',
	ecmwf_aifs025_single: 'ECMWF · modèle IA (AIFS) · global 0,25° · ~15 j',
	dwd_icon: 'DWD (Allemagne) · global ~13 km · échéance ~7,5 j',
	dwd_icon_d2: 'DWD (Allemagne) · ~2 km, Europe centrale · échéance ~2 j',
	dwd_icon_eu: 'DWD (Allemagne) · ~7 km, Europe · échéance ~5 j',
	meteoswiss_icon_ch1: 'MeteoSwiss (Suisse) · ~1 km, Alpes/Suisse · échéance ~33 h',
	meteoswiss_icon_ch2: 'MeteoSwiss (Suisse) · ~2 km, Alpes/Suisse · échéance ~5 j',
	knmi_harmonie_arome_europe: 'KNMI (Pays-Bas) · 5,5 km, Europe · échéance ~2,5 j',
	weather_ai_global:
		"Google DeepMind · WeatherNext Cyclones Mini (IA) · global 1° · pas 6 h · expérimental, sans valeur d'alerte"
};

// Time constants
export const MILLISECONDS_PER_SECOND = 1000; // 1 second in milliseconds
export const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND; // 1 minute in milliseconds
export const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE; // 1 hour in milliseconds
export const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR; // 1 day in milliseconds
export const MILLISECONDS_PER_WEEK = 7 * MILLISECONDS_PER_DAY; // 7 days in milliseconds

// Metadata refresh interval
export const METADATA_REFRESH_INTERVAL = 5 * MILLISECONDS_PER_MINUTE; // 5 minutes in milliseconds

// Délai max d'attente de mise au repos de la carte avant capture du canvas (capture-flow).
export const PRERENDER_FRAME_TIMEOUT_MS = 10_000;

// Calendar display constants
export const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
