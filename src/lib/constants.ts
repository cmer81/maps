// Domain and variable defaults
export const DEFAULT_DOMAIN = 'arome_france';
export const DEFAULT_VARIABLE = 'temperature_2m';

/** Pseudo-domaine des anomalies de température (servi depuis le bucket R2). */
export const ANOMALY_DOMAIN = 'anomaly_europe';
/** Variable unique exposée par le pseudo-domaine anomalie. */
export const ANOMALY_VARIABLE = 'temperature_2m_anomaly';

/** Pseudo-domaine AROME-OM Réunion / Océan Indien (servi depuis le bucket R2,
 *  produit par le pipeline `arome-om-forecast`). */
export const AROME_OM_REUNION_DOMAIN = 'arome_om_reunion';

/** Pseudo-domaine AROME France métropole orienté convection/orage (servi depuis
 *  le bucket R2, produit par le pipeline `arome-france-forecast`). Distinct du
 *  `arome_france` général d'Open-Meteo (le suffixe `_convection` lève la collision). */
export const AROME_FRANCE_CONVECTION_DOMAIN = 'arome_france_convection';

/** Pseudo-domaine AROME France métropole **surface** (12 variables standard
 *  Open-Meteo), servi depuis le bucket maison par le pipeline `arome-france-forecast`.
 *  Distinct de `arome_france_convection` (orienté convection/orage) et des AROME
 *  d'Open-Meteo (`meteofrance_arome_france*`). */
export const AROME_FRANCE_DOMAIN = 'arome_france';

/** Vue de carte recommandée par domaine — appliquée via `flyTo` quand l'utilisateur
 *  bascule manuellement sur le domaine. Utile pour les pseudo-domaines régionaux
 *  dont le centre de grille tombe sur une zone océan/peu lisible.
 *  Format MapLibre : `{ center: [lon, lat], zoom }`. */
export const DOMAIN_DEFAULT_VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
	[AROME_OM_REUNION_DOMAIN]: { center: [50.2, -15.97], zoom: 4.47 },
	[AROME_FRANCE_CONVECTION_DOMAIN]: { center: [2.3, 46.6], zoom: 5 },
	[AROME_FRANCE_DOMAIN]: { center: [2.3, 46.6], zoom: 5 }
};

/** Variable affichée par défaut quand l'utilisateur bascule sur un domaine et que
 *  la variable courante n'existe pas dans son meta.json. Consulté par
 *  `matchVariableOrFirst()` avant le fallback `variables[0]`. */
export const DOMAIN_DEFAULT_VARIABLES: Record<string, string> = {
	[AROME_FRANCE_CONVECTION_DOMAIN]: 'radar_reflectivity',
	[AROME_FRANCE_DOMAIN]: 'temperature_2m'
};

/** Variables masquées du sélecteur (display-only), même si publiées dans le
 *  meta.json du domaine. Filtré par `variable-tabs.svelte`. Une URL partagée
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

// Vector options defaults
export const DEFAULT_VECTOR_OPTIONS = {
	grid: false,
	arrows: true,
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
export const DEFAULT_CACHE_MAX_BYTES_MB = 400;

// Measured HTTP/2 overhead per range request (~1342 bytes: HPACK headers + framing).
// Rounded up to 1408 for safety margin (Range/Content-Range header lengths vary with file offset).
// Subtracted from block size so total transfer fits within the nominal KiB boundary.
export const HTTP_OVERHEAD_BYTES = 1408;

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
	departments: 'true'
};

// Contours administratifs FR — GeoJSON simplifié (~550 KB / ~80 KB gzip),
// licence ODbL, bundlé depuis `gregoiredavid/france-geojson`.
export const DEPARTMENTS_GEOJSON_URL = '/departements.geojson';

// Niveaux iso-pression exposés dans le sélecteur (hPa). Les niveaux non listés
// restent fonctionnels via URL partagée — c'est purement un filtre d'affichage.
// Les unités non-hPa (2m, 10m, 80m, 120m, 180m…) ne sont pas filtrées.
export const VISIBLE_PRESSURE_LEVELS_HPA: readonly number[] = [925, 850, 700, 500, 300, 250, 200];

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

export const soundingLevelsForDomain = (domain: string): readonly number[] =>
	SOUNDING_LEVELS_BY_DOMAIN[domain] ?? SOUNDING_PRESSURE_LEVELS_HPA;

// Un domaine ne supporte le sondage vertical que s'il diffuse des niveaux de
// pression — c.-à-d. s'il est explicitement listé dans SOUNDING_LEVELS_BY_DOMAIN
// (actuellement AROME 0,025° ; la Réunion s'ajoutera ici). Sert à n'afficher le
// bouton « Sondage vertical » que sur ces modèles.
export const isSoundingDomain = (domain: string): boolean =>
	Object.prototype.hasOwnProperty.call(SOUNDING_LEVELS_BY_DOMAIN, domain);

// Préset Infoclimat : sous-ensemble de modèles exposés dans le sélecteur de
// domaine. Le reste de l'app (résolution d'URLs partagées, métadonnées) reste
// indépendant — c'est purement un filtre d'affichage.
//
// Pour réactiver tous les modèles : passer la liste à `null` ou retirer le
// filtre dans model-selector.svelte.
export const DOMAIN_ALLOWLIST: readonly string[] = [
	// Anomalies (pseudo-domaine, visible seulement si le bucket est configuré)
	'anomaly_europe',

	// AROME-OM Outre-Mer (pseudo-domaine, visible seulement si le bucket est configuré)
	'arome_om_reunion',

	// AROME Convection France (pseudo-domaine, visible seulement si le bucket est configuré)
	'arome_france_convection',

	// AROME France surface (pseudo-domaine, visible seulement si le bucket est configuré)
	'arome_france',

	// Cœur français — AROME France servi par le modèle infoclimat maison
	// (`arome_france` + `arome_france_convection`), donc l'AROME d'Open-Meteo
	// (HD 1,5 km + 0025 2,5 km) est débranché du sélecteur. Les URLs partagées
	// ciblant ces domaines OM résolvent toujours (l'allowlist ne filtre que
	// l'affichage du sélecteur, pas le routing).
	'meteofrance_arpege_europe',

	// Référence globale + Europe
	'meteofrance_arpege_world025',
	'ncep_gfs025',
	'ecmwf_ifs',
	'ecmwf_ifs025',
	'ecmwf_aifs025_single',
	'dwd_icon_d2',
	'dwd_icon_eu'

	// Ensembles — commentés pour le moment
	// 'ecmwf_ifs025_ensemble',
	// 'ecmwf_aifs025_ensemble',
	// 'meteoswiss_icon_ch1_ensemble',
	// 'meteoswiss_icon_ch2_ensemble',

	// Mer / littoral — commentés
	// 'meteofrance_wave',
	// 'ecmwf_wam025',
	// 'meteofrance_currents',
	// 'meteofrance_sea_surface_temperature',

	// Qualité de l'air — commenté
	// 'cams_global',

	// Long terme — commentés
	// 'ecmwf_seas5_monthly',
	// 'ecmwf_ec46_weekly'
];

// Descriptions courtes par modèle, affichées sous le nom dans le sélecteur de modèle
// pour aider à choisir (fournisseur · résolution/zone · échéance). Optionnel par domaine.
export const MODEL_DESCRIPTIONS: Record<string, string> = {
	anomaly_europe: 'Écart à la température normale 1991–2020 · Europe',
	arome_om_reunion: 'Météo-France · Outre-mer, La Réunion · haute résolution',
	arome_france_convection:
		'Infoclimat · 0,025° (~2,5 km), France métropole · convection / orage · ~51 h',
	arome_france: 'Infoclimat · 0,025° (~2,5 km), France métropole · surface · ~51 h',
	meteofrance_arome_france_hd:
		'Météo-France · ~1,5 km, France · détaille les phénomènes locaux · échéance ~2 j',
	meteofrance_arome_france0025:
		'Météo-France · 0,025° (~2,5 km), France · niveaux de pression (sondage) · ~2 j',
	meteofrance_arpege_europe: 'Météo-France · ~11 km, Europe · échéance ~4 j',
	meteofrance_arpege_world025: 'Météo-France · global 0,25° · échéance ~4 j',
	ncep_gfs025: 'NOAA (USA) · global 0,25° · échéance ~16 j',
	ecmwf_ifs: 'ECMWF (Europe) · global · référence moyenne échéance · ~15 j',
	ecmwf_ifs025: 'ECMWF (Europe) · global 0,25° · référence fiable · ~15 j',
	ecmwf_aifs025_single: 'ECMWF · modèle IA (AIFS) · global 0,25° · ~15 j',
	dwd_icon_d2: 'DWD (Allemagne) · ~2 km, Europe centrale · échéance ~2 j',
	dwd_icon_eu: 'DWD (Allemagne) · ~7 km, Europe · échéance ~5 j'
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
