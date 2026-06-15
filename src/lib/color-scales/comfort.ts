import type { RGBA } from '@openmeteo/weather-map-layer';

/** Forme minimale commune aux barèmes (résolus `RGBA[]` ou à variantes light/dark). */
type ColorScaleLike = { colors: RGBA[] | { light: RGBA[]; dark: RGBA[] } };

/**
 * « Mode Confort™ » — easter egg déclenché par `?giec=non`.
 *
 * Renverse l'ordre des couleurs d'un barème : les valeurs chaudes héritent des
 * teintes froides et inversement. Les `breakpoints` (donc les seuils numériques
 * **et** la légende) restent strictement inchangés — seule la correspondance
 * valeur→couleur est miroitée. Aucune donnée n'est touchée : c'est une blague
 * assumée, signalée en permanence par le bandeau écran + le watermark d'export,
 * pour qu'aucun screenshot ne puisse circuler sans son propre aveu.
 */
const reverseColors = (colors: RGBA[] | { light: RGBA[]; dark: RGBA[] }) =>
	Array.isArray(colors)
		? [...colors].reverse()
		: { light: [...colors.light].reverse(), dark: [...colors.dark].reverse() };

export const toComfortScale = <T extends ColorScaleLike>(scale: T): T =>
	({ ...scale, colors: reverseColors(scale.colors) }) as T;

/** Variables dont le barème est miroité en mode confort (température + anomalie).
 *  La clé `temperature` couvre la famille `temperature_2m`, `temperature_120m`, … via
 *  la résolution par préfixe du package ; l'anomalie a sa propre clé exacte. */
export const COMFORT_VARIABLE_KEYS = ['temperature', 'temperature_2m_anomaly'] as const;

/** Produit les surcharges `colorScales` du mode confort à partir des barèmes
 *  standard, en ne miroitant que les clés de température réellement présentes. */
export const comfortColorScaleOverrides = <T extends ColorScaleLike>(
	base: Record<string, T>
): Record<string, T> => {
	const overrides: Record<string, T> = {};
	for (const key of COMFORT_VARIABLE_KEYS) {
		if (base[key]) overrides[key] = toComfortScale(base[key]);
	}
	return overrides;
};
