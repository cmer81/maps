import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Signal cyclonique brut, sans unité (0–1). Ce champ d'un membre unique
// n'est pas présenté comme une probabilité de risque ou de passage.
// Les faibles valeurs sont atténuées pour préserver la lisibilité du fond.
export const cycloneExistenceScale = {
	type: 'breakpoint',
	unit: '',
	breakpoints: [0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 0.9],
	colors: [
		[70, 110, 190, 0], // 0 — transparent
		[90, 160, 220, 0.3], // 0,01 — bleu très pâle, à peine posé
		[110, 200, 220, 0.45], // 0,02 — cyan
		[130, 220, 180, 0.6], // 0,05 — turquoise
		[200, 230, 120, 0.7], // 0,1 — vert-jaune
		[250, 215, 90, 0.8], // 0,2 — jaune
		[250, 170, 60, 0.87], // 0,35 — ambre
		[240, 110, 50, 0.92], // 0,5 — orange
		[220, 50, 60, 0.96], // 0,7 — rouge
		[160, 20, 110, 1] // 0,9+ — magenta foncé
	]
} satisfies BreakpointColorScale;
