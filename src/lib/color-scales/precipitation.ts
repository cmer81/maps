import type { RGBA, RenderableColorScale } from '@openmeteo/weather-map-layer';

// Échelle de précipitations commune à la pluie par pas de temps (`precipitation`,
// `rain`, `showers`) et au cumul depuis le début du run (`precipitation_sum`) :
// 22 paliers de 0,5 à 800 mm pour différencier les cumuls jusqu'aux épisodes
// méditerranéens extrêmes (spec specs/001-lisibilite-cumuls-pluie, révision 4).
//
// Avant : l'échelle `precipitation` du package plafonnait de fait à 20 mm (ses
// trois dernières classes 20/25/30 mm sont le même rouge) et l'échelle
// `precipitation_sum` maison s'arrêtait à 300 mm.
//
// Code couleur de référence retenu par l'équipe (couleurs relevées au pixel) :
// bleus → verts → jaunes-verts → orange → saumon → rouges → bordeaux → magenta.
// Couleurs opaques ; seule la classe 0 (< 0,5 mm) est transparente.
//
// ⚠ Sous le premier breakpoint, le moteur applique `colors[0]` (PAS de
// transparence implicite) : l'échelle commence donc par une classe 0
// explicitement transparente — sans quoi un cumul nul (H0) était teinté.

type Step = [bound: number, color: RGBA];

const STEPS: readonly Step[] = [
	[0, [255, 255, 255, 0]], // < 0,5 mm : transparent
	[0.5, [151, 230, 255, 1]],
	[1, [51, 204, 255, 1]],
	[2, [0, 153, 255, 1]],
	[5, [0, 255, 153, 1]],
	[10, [51, 204, 102, 1]],
	[20, [102, 204, 51, 1]],
	[30, [102, 255, 0, 1]],
	[40, [164, 242, 47, 1]],
	[50, [183, 207, 14, 1]],
	[60, [214, 240, 23, 1]],
	[70, [204, 153, 0, 1]],
	[80, [255, 153, 0, 1]],
	[90, [255, 153, 102, 1]],
	[100, [204, 153, 153, 1]],
	[150, [204, 102, 51, 1]],
	[200, [204, 51, 51, 1]],
	[300, [255, 13, 13, 1]],
	[400, [198, 0, 0, 1]],
	[500, [128, 0, 0, 1]],
	[600, [128, 0, 80, 1]],
	[700, [160, 0, 119, 1]],
	[800, [204, 0, 204, 1]] // saturé au-delà
];

/** Variables qui utilisent cette échelle. */
export const PRECIPITATION_VARIABLES: readonly string[] = [
	'precipitation',
	'rain',
	'showers',
	'precipitation_sum'
];

export const isPrecipitationVariable = (variable: string): boolean =>
	PRECIPITATION_VARIABLES.includes(variable);

export const precipitationScale: Extract<RenderableColorScale, { type: 'breakpoint' }> = {
	type: 'breakpoint',
	unit: 'mm',
	breakpoints: STEPS.map(([bound]) => bound),
	colors: STEPS.map(([, color]) => color)
};
