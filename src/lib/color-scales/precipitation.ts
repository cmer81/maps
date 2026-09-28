import type { RGBA, RenderableColorScale } from '@openmeteo/weather-map-layer';

// Échelle de précipitations commune à la pluie par pas de temps (`precipitation`,
// `rain`, `showers`) et au cumul depuis le début du run (`precipitation_sum`) :
// paliers de 0,2 à 600 mm pour différencier les cumuls jusqu'aux épisodes
// méditerranéens extrêmes (spec specs/001-lisibilite-cumuls-pluie, révision 3).
//
// Avant : l'échelle `precipitation` du package plafonnait de fait à 20 mm (ses
// trois dernières classes 20/25/30 mm sont le même rouge) et l'échelle
// `precipitation_sum` maison s'arrêtait à 300 mm.
//
// Rampe : celle de l'ancienne échelle maps (bleus clairs → bleus → cyan → vert →
// jaune → orange → rouge), prolongée par magenta → violets, puis lilas et blanc
// rosé pour les deux paliers extrêmes (500, 600 mm) — des violets toujours plus
// sombres y devenaient indiscernables (ΔE00 6-8) et quasi noirs sur fond sombre.
// Transparence progressive sur les faibles classes, comme l'ancienne rampe.
//
// ⚠ Sous le premier breakpoint, le moteur applique `colors[0]` (PAS de
// transparence implicite) : l'échelle commence donc par une classe 0
// explicitement transparente — sans quoi un cumul nul (H0) était teinté.

type Step = [bound: number, color: RGBA];

const STEPS: readonly Step[] = [
	[0, [225, 243, 254, 0]], // < 0,2 mm : transparent
	[0.2, [225, 243, 254, 0.35]],
	[0.5, [190, 222, 252, 0.5]],
	[1, [134, 205, 250, 0.65]],
	[2, [64, 161, 251, 0.75]],
	[5, [0, 96, 233, 0.82]],
	[10, [0, 177, 236, 0.86]],
	[20, [0, 241, 141, 0.9]],
	[30, [66, 248, 0, 0.92]],
	[50, [255, 221, 0, 0.94]],
	[75, [255, 150, 0, 0.96]],
	[100, [255, 0, 0, 0.98]],
	[150, [205, 0, 70, 1]],
	[200, [235, 0, 180, 1]],
	[250, [180, 0, 190, 1]],
	[300, [130, 0, 170, 1]],
	[400, [95, 0, 125, 1]],
	[500, [190, 140, 235, 1]],
	[600, [240, 215, 255, 1]] // saturé au-delà
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
