/**
 * Traduction FR des libellés de variables et de groupes de variables exposés par
 * `@openmeteo/weather-map-layer`. Le package fournit ~290 libellés EN ; on les
 * traduit ici via :
 *   1. Une table d'exceptions (EXPLICIT) pour les libellés singuliers.
 *   2. Un transformer par composition qui décompose les patterns répétitifs
 *      (`Temperature (500hPa) Spread` → `Dispersion de la température (500 hPa)`).
 *
 * Si une variable n'est couverte ni par la table ni par les règles, on renvoie
 * le libellé EN d'origine (fallback transparent — aucune régression).
 */

/** Exceptions et libellés singuliers (priorité maximale). */
const EXPLICIT: Record<string, string> = {
	'Aerosol Optical Depth': 'Profondeur optique des aérosols',
	Albedo: 'Albédo',
	brightness_temperature: 'Température de brillance (IR fenêtre)',
	brightness_temperature_wv: "Température de brillance (vapeur d'eau)",
	'Alder Pollen': "Pollen d'aulne",
	Ammonia: 'Ammoniac',
	'Birch Pollen': 'Pollen de bouleau',
	'Boundary Layer Height': 'Hauteur de la couche limite',
	CAPE: 'CAPE',
	'Carbon Dioxide': 'Dioxyde de carbone',
	'Carbon Monoxide': 'Monoxyde de carbone',
	'Categorical Freezing Rain': 'Pluie verglaçante (catégorielle)',
	'Cloud Base': 'Base des nuages',
	'Cloud Cover': 'Nébulosité totale',
	'Cloud Cover High': 'Nébulosité haute',
	'Cloud Cover Low': 'Nébulosité basse',
	'Cloud Cover Mid': 'Nébulosité moyenne',
	'Cloud Top': 'Sommet des nuages',
	'Convective Cloud Base': 'Base nuageuse convective',
	'Convective Cloud Top': 'Sommet nuageux convectif',
	'Convective Inhibition': 'Inhibition convective (CIN)',
	'Dew Point': 'Point de rosée',
	'Diffuse Radiation': 'Rayonnement diffus',
	'Direct Radiation': 'Rayonnement direct',
	Dust: 'Poussière',
	Formaldehyde: 'Formaldéhyde',
	'Freezing Level Height': "Altitude de l'isotherme 0 °C",
	'Freezing Rain Probability': 'Probabilité de pluie verglaçante',
	'Geopotential Height': 'Hauteur géopotentielle',
	Glyoxal: 'Glyoxal',
	'Grass Pollen': 'Pollen de graminées',
	Hail: 'Grêle',
	'Ice Pellets Probability': 'Probabilité de grésil',
	'Invert Barometer Height': 'Hauteur du baromètre inverse',
	'k Index': 'Indice K',
	'Latent Heat Flux': 'Flux de chaleur latente',
	'Lifted Index': 'Indice de soulèvement (LI)',
	'Lightning Density': 'Densité de foudre (moy. 3 h)',
	'Lightning Potential': 'Potentiel orageux',
	'Mass Density': 'Densité massique',
	Methane: 'Méthane',
	'Mugwort Pollen': "Pollen d'armoise",
	'Nitrogen Dioxide': "Dioxyde d'azote",
	'Nitrogen Monoxide': "Monoxyde d'azote",
	'Ocean Current': 'Courant océanique',
	'Olive Pollen': "Pollen d'olivier",
	Ozone: 'Ozone',
	'Peroxyacyl Nitrates': 'Nitrates de peroxyacyle',
	'PM10 Wildfires': 'PM10 (feux de forêt)',
	'PM2.5': 'PM2.5',
	'PM2.5 Total Organic Matter': 'PM2.5 (matière organique totale)',
	PM10: 'PM10',
	'Potential Evapotranspiration': 'Évapotranspiration potentielle',
	Precipitation: 'Précipitations',
	// Variable `precipitation_sum` (cumul depuis le début du run, domaine
	// arome_om_reunion). Absente des variableOptions du package, donc le libellé
	// affiché est la valeur brute : on la traduit via sa clé snake_case.
	precipitation_sum: 'Précipitations cumulées',
	'Precipitation EFI': 'Précipitations (EFI)',
	'Precipitation Probability': 'Probabilité de précipitations',
	'Precipitation SOT90': 'Précipitations (SOT90)',
	'Precipitation Type': 'Type de précipitations',
	precipitation_type_severe: 'Type de précip. (le plus sévère)',
	// `precipitable_water` (colonne de vapeur d'eau, domaine arome_france_convection).
	// Le package n'expose que `total_column_integrated_water_vapour` (autre clé), donc
	// le sélecteur afficherait la valeur brute → on la mappe par sa clé snake_case.
	precipitable_water: 'Eau précipitable',
	'Pressure Mean Sea Level': 'Pression au niveau de la mer',
	radar_reflectivity: 'Réflectivité radar',
	'Ragweed Pollen': "Pollen d'ambroisie",
	Rain: 'Pluie',
	'Rain Probability': 'Probabilité de pluie',
	'Roughness Length': 'Longueur de rugosité',
	'Residential Elementary Carbon': 'Carbone élémentaire résidentiel',
	Runoff: 'Ruissellement',
	'Sea Ice Thickness': 'Épaisseur de la glace de mer',
	'Sea Level Height Mean Sea Level': 'Hauteur du niveau de la mer (NMM)',
	'Sea Salt Aerosol': 'Aérosol de sel marin',
	'Sea Surface Temperature': 'Température de surface de la mer',
	'Secondary Inorganic Aerosol': 'Aérosol inorganique secondaire',
	'Sensible Heat Flux': 'Flux de chaleur sensible',
	Showers: 'Averses',
	'Shortwave Solar Radiation': 'Rayonnement solaire (ondes courtes)',
	'Snow Depth': 'Hauteur de neige',
	'Snow Depth Water Equivalent': 'Équivalent en eau de la neige au sol',
	'Snow Density': 'Densité de la neige',
	Snowfall: 'Cumul de neige',
	'Snowfall Probability': 'Probabilité de neige',
	'Snowfall Height': 'Hauteur de neige tombée',
	'Snowfall Water Equivalent': 'Équivalent en eau de la neige tombée',
	'Sunshine Duration': "Durée d'ensoleillement",
	'Sulphur Dioxide': 'Dioxyde de soufre',
	'Surface Temperature': 'Température de surface',
	'Swell Wave Period': 'Période de la houle',
	'Swell Wave Peak Period': 'Période de pic de la houle',
	'Swell Wave Height & Direction': 'Houle (hauteur & direction)',
	'Secondary Swell Wave Period': 'Période de la houle secondaire',
	'Secondary Swell Wave Direction': 'Direction de la houle secondaire',
	'Secondary Swell Wave Height & Direction': 'Houle secondaire (hauteur & direction)',
	'Tertiary Swell Wave Period': 'Période de la houle tertiaire',
	'Tertiary Swell Wave Direction': 'Direction de la houle tertiaire',
	'Tertiary Swell Wave Height & Direction': 'Houle tertiaire (hauteur & direction)',
	Temperature: 'Température',
	'Total Elementary Carbon': 'Carbone élémentaire total',
	'Total Column Integrated Water Vapour': "Vapeur d'eau intégrée (colonne)",
	'UV Index': 'Indice UV',
	'UV Index Clear Sky': 'Indice UV (ciel clair)',
	Visibility: 'Visibilité',
	'Wave Period': 'Période des vagues',
	'Wave Peak Period': 'Période de pic des vagues',
	'Wave Direction': 'Direction des vagues',
	'Wave Height & Direction': 'Vague (hauteur & direction)',
	'Weather Codes': 'Codes météo',
	Wind: 'Vent',
	'Wind Direction': 'Direction du vent',
	'Wind Gusts': 'Rafales',
	'Wind Speed': 'Vitesse du vent',
	'Wind U Component': 'Composante U du vent',
	'Wind V Component': 'Composante V du vent',
	'Wind Wave Period': 'Période des vagues de vent',
	'Wind Wave Peak Period': 'Période de pic des vagues de vent',
	'Wind Wave Height & Direction': 'Vagues de vent (hauteur & direction)',
	Updraft: 'Courant ascendant',
	'Soil Moisture': 'Humidité du sol',
	'Soil Temperature': 'Température du sol',
	'Relative Humidity': 'Humidité relative',
	'Vertical Velocity': 'Vitesse verticale',

	// Variables du domaine `arome_france_hd` (Infoclimat) absentes des
	// variableOptions du package : sans entrée ici, le sélecteur affiche la valeur
	// brute snake_case. On les mappe donc par leur clé.
	graupel_sum: 'Cumul de grésil (graupel)',
	snow_graupel_sum: 'Cumul de neige + grésil (graupel)',
	snowfall_water_equivalent_sum: 'Équivalent en eau de la neige (cumul)',
	humidex: 'Indice Humidex',
	reflectivity_max: 'Réflectivité radar max.',
	relative_humidity_2m: 'Humidité relative (2 m)',
	wind_chill_2m: 'Refroidissement éolien (2 m)',
	wind_gusts_10m_max: 'Rafales max. (10 m)',
	wind_u_component_10m: 'Vent (10 m)',

	// Variables du domaine `arome_france` (Infoclimat) ajoutées au-delà des 12
	// surfaces historiques : champs dérivés / d'altitude sans entrée package.
	theta_e_850hPa: 'Theta-E (850 hPa)',
	theta_w_850hPa: 'Theta-W (850 hPa)',
	thickness_500_1000hPa: 'Épaisseur 500-1000 hPa',
	absolute_vorticity_500hPa: 'Tourbillon absolu (500 hPa)',
	freezing_level_height: "Altitude de l'isotherme 0 °C",
	snowfall_sum: 'Cumul de neige',
	temperature_2m_max: 'Température max. (2 m)',
	temperature_2m_min: 'Température min. (2 m)',
	geopotential_height_pv1500: 'Géopotentiel (tropopause dynamique)'
};

/** Forme contractée à utiliser après "Anomalie/Moyenne/Dispersion/Min/Max de". */
type Article = 'de la' | "de l'" | 'du' | 'des' | 'de';

/**
 * Traduction des bases composables, avec leur article élidé pour les modificateurs
 * (« Anomalie » + article + base). Ex: « Anomalie » + « du » + « point de rosée ».
 */
const BASE_TERMS: Array<{ en: string; fr: string; article: Article }> = [
	{ en: 'Pressure Mean Sea Level', fr: 'pression NMM', article: 'de la' },
	{ en: 'Sea Surface Temperature', fr: 'température de la mer', article: 'de la' },
	{
		en: 'Snow Depth Water Equivalent',
		fr: 'équivalent en eau de la neige',
		article: "de l'"
	},
	{
		en: 'Snowfall Water Equivalent',
		fr: 'équivalent en eau de la neige tombée',
		article: "de l'"
	},
	{
		en: 'Shortwave Solar Radiation',
		fr: 'rayonnement solaire ondes courtes',
		article: 'du'
	},
	{ en: 'Sunshine Duration', fr: 'ensoleillement', article: "de l'" },
	{ en: 'Direct Radiation', fr: 'rayonnement direct', article: 'du' },
	{ en: 'Cloud Cover', fr: 'nébulosité', article: 'de la' },
	{ en: 'Snow Density', fr: 'densité de la neige', article: 'de la' },
	{ en: 'Soil Temperature', fr: 'température du sol', article: 'de la' },
	{ en: 'Soil Moisture', fr: 'humidité du sol', article: "de l'" },
	{ en: 'Temperature Max 6h', fr: 'T max 6 h', article: 'de la' },
	{ en: 'Temperature Min 6h', fr: 'T min 6 h', article: 'de la' },
	{ en: 'Temperature', fr: 'température', article: 'de la' },
	{ en: 'Dew Point', fr: 'point de rosée', article: 'du' },
	{ en: 'Geopotential Height', fr: 'hauteur géopotentielle', article: 'de la' },
	{ en: 'Precipitation', fr: 'précipitations', article: 'des' },
	{ en: 'Showers', fr: 'averses', article: 'des' },
	{ en: 'Wind Gusts', fr: 'rafales', article: 'des' },
	{ en: 'Wind U Component', fr: 'composante U du vent', article: 'de la' },
	{ en: 'Wind V Component', fr: 'composante V du vent', article: 'de la' },
	{ en: 'Wind Speed', fr: 'vitesse du vent', article: 'de la' },
	{ en: 'Wind', fr: 'vent', article: 'du' },
	{ en: 'Surface Temperature', fr: 'température de surface', article: 'de la' }
];

/** Modificateurs appliqués en préfixe (avant l'article de la base). */
const MODIFIER_PREFIX: Record<string, string> = {
	Anomaly: 'Anomalie',
	Mean: 'Moyenne',
	Spread: 'Dispersion',
	Max: 'Max',
	Min: 'Min',
	EFI: 'EFI'
};

/** Modificateurs gardés en suffixe technique tel quel (codes statistiques). */
const TECH_SUFFIX_REGEX = /\b(GT0|GT1|GT2|GT10|GT20|LTM1|LTM2|SOT10|SOT90|EFI)\b/;

/** Normalise les unités entre parenthèses : "(2m)" → "(2 m)", "(0-7 cm)" → tel quel. */
function normalizeLevelUnits(s: string): string {
	return s
		.replace(/\((\d+)m\)/g, '($1 m)')
		.replace(/\((\d+)hPa\)/g, '($1 hPa)')
		.replace(/\((\d+)cm\)/g, '($1 cm)');
}

/** Met la première lettre en majuscule sans toucher au reste. */
function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Décompose un libellé en (base, niveau, suffixes).
 * "Temperature (500hPa) Spread" → { base: "Temperature", level: "(500hPa)", suffix: "Spread" }
 */
function parseLabel(label: string): {
	baseEntry: (typeof BASE_TERMS)[number] | null;
	level?: string;
	suffix: string;
} {
	const levelMatch = label.match(/\s*(\([^)]+\))\s*/);
	const level = levelMatch?.[1];
	const withoutLevel = level ? label.replace(levelMatch![0], ' ').trim() : label;

	// Trouver la base la plus longue qui matche le début (la table est triée par spécificité).
	for (const entry of BASE_TERMS) {
		if (withoutLevel === entry.en) return { baseEntry: entry, level, suffix: '' };
		if (withoutLevel.startsWith(entry.en + ' ')) {
			return {
				baseEntry: entry,
				level,
				suffix: withoutLevel.slice(entry.en.length + 1).trim()
			};
		}
	}
	return { baseEntry: null, level, suffix: '' };
}

/** Traduit par composition. Renvoie null si l'algo n'est pas confiant. */
function translateByComposition(label: string): string | null {
	const { baseEntry, level, suffix } = parseLabel(label);
	if (!baseEntry) return null;

	const frLevel = level ? ' ' + normalizeLevelUnits(level) : '';

	if (!suffix) {
		return capitalize(baseEntry.fr) + frLevel;
	}

	const tokens = suffix.split(/\s+/);

	// Suffixe purement technique (codes stat type GT10, SOT90)
	if (tokens.length === 1 && TECH_SUFFIX_REGEX.test(suffix)) {
		return `${capitalize(baseEntry.fr)}${frLevel} (${suffix})`;
	}

	// Modificateur connu (Anomaly/Mean/Spread/…) + reste éventuel
	const head = tokens[0];
	const rest = tokens.slice(1).join(' ');

	if (head in MODIFIER_PREFIX) {
		const restPart = rest ? ' (' + rest + ')' : '';
		// Pas d'espace après l'apostrophe ("de l'" colle au mot suivant).
		const sep = baseEntry.article.endsWith("'") ? '' : ' ';
		return `${MODIFIER_PREFIX[head]} ${baseEntry.article}${sep}${baseEntry.fr}${frLevel}${restPart}`;
	}

	// Cas inconnu : on concatène le suffixe entre parenthèses
	return `${capitalize(baseEntry.fr)}${frLevel} (${suffix})`;
}

/** API publique : renvoie le libellé FR ou le libellé EN si non traduit. */
export function translateVariableLabel(label: string): string {
	if (label in EXPLICIT) return EXPLICIT[label];
	const composed = translateByComposition(label);
	return composed ?? label;
}

/** Wrapper pour une option { value, label } : renvoie une nouvelle option avec label FR. */
export function localizeVariableOption<T extends { value: string; label: string }>(
	option: T | undefined
): T | undefined {
	if (!option) return option;
	return { ...option, label: translateVariableLabel(option.label) };
}
