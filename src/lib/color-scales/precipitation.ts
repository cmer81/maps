import type { RGBA, RenderableColorScale } from '@openmeteo/weather-map-layer';

// Échelle du cumul depuis le début du run (`precipitation_sum`, et par famille
// les cumuls `precipitation_sum_Nh`) : calquée sur la légende ECMWF « Accumulated
// total precipitation », 26 paliers de 0,1 à 500 mm (spec
// specs/001-lisibilite-cumuls-pluie, révision 4). Couleurs relevées à l'œil sur
// la légende ECMWF (pas de valeurs officielles), sauf 90 → 150 mm, fournies
// par Infoclimat. 175-200 mm (`#aa00c8`) choisi pour marquer le passage à
// 200 mm (ΔE00 15,5), en douceur depuis 150 mm (11,4) : un écart net à chaque
// centaine, léger entre les deux (retour Infoclimat).
//
// La pluie par pas de temps (`precipitation`, `rain`, `showers`) garde
// volontairement l'échelle `precipitation` du package.
//
// Rampe : lavande → bleus → bleu nuit → verts → jaunes → oranges → roses-rouges
// → rouges → violets → lilas → quasi blanc, puis gris au-delà de 500 mm.
// Écart assumé à l'ECMWF (palette opaque) : transparence progressive sur les
// quatre premières classes pour laisser voir le fond de carte.
//
// ⚠ Sous le premier breakpoint, le moteur applique `colors[0]` (PAS de
// transparence implicite) : l'échelle commence donc par une classe 0
// explicitement transparente — sans quoi un cumul nul (H0) était teinté.

type Step = [bound: number, color: RGBA];

const STEPS: readonly Step[] = [
	[0, [220, 220, 240, 0]], // < 0,1 mm : transparent
	[0.1, [220, 222, 242, 0.6]],
	[1, [175, 215, 250, 0.75]],
	[2, [120, 185, 250, 0.85]],
	[3, [85, 160, 245, 0.9]],
	[5, [60, 140, 240, 1]],
	[7, [30, 100, 210, 1]],
	[10, [10, 55, 140, 1]],
	[15, [30, 140, 40, 1]],
	[20, [40, 180, 40, 1]],
	[25, [110, 225, 60, 1]],
	[30, [255, 250, 60, 1]],
	[40, [230, 215, 0, 1]],
	[50, [240, 100, 0, 1]],
	[60, [255, 140, 40, 1]],
	[70, [255, 170, 100, 1]],
	[80, [255, 80, 100, 1]],
	[90, [240, 40, 80, 1]],
	[100, [200, 0, 0, 1]],
	[125, [223, 4, 4, 1]],
	[150, [207, 13, 160, 1]],
	[175, [170, 0, 200, 1]],
	[200, [210, 80, 240, 1]],
	[250, [230, 150, 240, 1]],
	[300, [240, 200, 245, 1]],
	[400, [250, 240, 250, 1]],
	[500, [200, 200, 200, 1]] // saturé au-delà
];

/** Variables dont les vignettes « Valeurs » s'affichent au dixième
 *  (`vector-styles.ts`) — indépendant de l'échelle de couleurs. */
export const PRECIPITATION_VARIABLES: readonly string[] = [
	'precipitation',
	'rain',
	'showers',
	'precipitation_sum'
];

export const isPrecipitationVariable = (variable: string): boolean =>
	PRECIPITATION_VARIABLES.includes(variable);

export const precipitationSumScale: Extract<RenderableColorScale, { type: 'breakpoint' }> = {
	type: 'breakpoint',
	unit: 'mm',
	breakpoints: STEPS.map(([bound]) => bound),
	colors: STEPS.map(([, color]) => color)
};
