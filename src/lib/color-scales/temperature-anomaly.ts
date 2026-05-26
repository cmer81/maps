import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Anomalie de température : palette divergente centrée sur 0.
// Bleu foncé (froid, -10 °C) → blanc (0) → rouge foncé (chaud, +10 °C).
// Bornes fixes ±10 °C ; au-delà la couleur sature sur l'extrême.
export const temperatureAnomalyScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: '°C',
	breakpoints: [-10, -8, -6, -4, -2, -1, 0, 1, 2, 4, 6, 8, 10],
	colors: [
		[5, 48, 97, 1], // -10 bleu très foncé
		[33, 102, 172, 1], // -8
		[67, 147, 195, 1], // -6
		[146, 197, 222, 1], // -4
		[209, 229, 240, 1], // -2
		[240, 248, 255, 1], // -1 quasi blanc froid
		[255, 255, 255, 1], // 0 blanc
		[253, 219, 199, 1], // +1 quasi blanc chaud
		[244, 165, 130, 1], // +2
		[214, 96, 77, 1], // +4
		[178, 24, 43, 1], // +6
		[140, 10, 30, 1], // +8
		[103, 0, 31, 1] // +10 rouge très foncé
	]
};
