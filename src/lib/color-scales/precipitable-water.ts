import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Eau précipitable (colonne intégrée de vapeur d'eau). Diffusée en kg/m²,
// numériquement égale au mm de lame d'eau → unité `mm` (partage le sélecteur
// mm/inch avec les précipitations). Rampe « humidité » : masses d'air sèches en
// beige/kaki, puis vert → cyan → bleu → violet à mesure que la colonne se charge.
// Bornes calibrées pour la métropole (~10-55 mm ; convection profonde > 45 mm).
export const precipitableWaterScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'mm',
	breakpoints: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
	colors: [
		[245, 240, 215, 0], // 0 transparent
		[214, 200, 150, 0.55], // 5 beige/sec
		[200, 205, 130, 0.6], // 10 kaki
		[160, 200, 110, 0.65], // 15 vert-jaune
		[100, 190, 100, 0.7], // 20 vert
		[40, 175, 110, 0.75], // 25 vert profond
		[0, 165, 150, 0.8], // 30 sarcelle
		[0, 150, 190, 0.83], // 35 cyan
		[0, 115, 205, 0.86], // 40 bleu
		[25, 65, 205, 0.9], // 45 bleu profond
		[95, 35, 195, 0.93], // 50 bleu-violet
		[145, 20, 175, 0.96], // 55 violet
		[185, 20, 140, 1] // 60+ magenta
	]
};
