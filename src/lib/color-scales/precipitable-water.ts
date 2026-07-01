import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Eau précipitable (colonne intégrée de vapeur d'eau). Diffusée en kg/m²,
// numériquement égale au mm de lame d'eau → unité `mm` (partage le sélecteur
// mm/inch avec les précipitations).
//
// Palette reprise de Météociel (pas de 2 mm, 0→54) : blanc (sec) → cyan → bleu
// → vert → jaune → orange → rouge → violet → magenta → rose (très humide).
// Couleurs échantillonnées pixel par pixel sur la légende Météociel. Opacité
// pleine (1) pour un contraste net entre niveaux ; la transparence d'ensemble
// reste pilotée par le curseur d'opacité de la couche.
export const precipitableWaterScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'mm',
	breakpoints: [
		0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48,
		50, 52
	],
	colors: [
		[255, 255, 255, 1], // 0
		[151, 230, 255, 1], // 2
		[51, 204, 255, 1], // 4
		[0, 153, 255, 1], // 6
		[0, 255, 153, 1], // 8
		[51, 204, 102, 1], // 10
		[102, 204, 51, 1], // 12
		[102, 255, 0, 1], // 14
		[163, 242, 46, 1], // 16
		[183, 207, 14, 1], // 18
		[214, 240, 23, 1], // 20
		[204, 153, 0, 1], // 22
		[255, 153, 0, 1], // 24
		[255, 153, 102, 1], // 26
		[204, 153, 153, 1], // 28
		[204, 102, 51, 1], // 30
		[204, 51, 51, 1], // 32
		[255, 13, 13, 1], // 34
		[198, 0, 0, 1], // 36
		[128, 0, 0, 1], // 38
		[128, 0, 80, 1], // 40
		[160, 0, 119, 1], // 42
		[204, 0, 204, 1], // 44
		[255, 0, 255, 1], // 46
		[255, 64, 255, 1], // 48
		[255, 128, 255, 1], // 50
		[255, 160, 255, 1] // 52+
	]
};
