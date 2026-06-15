import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Anomalie de température : palette divergente *asymétrique* (-8 °C → +24 °C).
// Bleu foncé (froid) → blanc (0) → rouge foncé (+10) → magenta/violet (extrême chaud).
// L'asymétrie est volontaire : en régime de canicule la distribution des anomalies
// est fortement biaisée vers le chaud (>> +10 °C) alors que le froid dépasse rarement
// -8 °C. Les paliers au-delà de +10 (magenta → violet, codes « canicule
// exceptionnelle » type Météo-France) distinguent les valeurs qui saturaient toutes
// auparavant sur le même rouge foncé. Au-delà de +24/-8 la couleur sature sur l'extrême.
export const temperatureAnomalyScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: '°C',
	breakpoints: [-8, -6, -4, -2, -1, 0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24],
	colors: [
		[33, 102, 172, 1], // -8 bleu foncé
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
		[103, 0, 31, 1], // +10 rouge très foncé
		[130, 5, 60, 1], // +12 rouge → magenta
		[155, 10, 95, 1], // +14 magenta foncé
		[150, 25, 135, 1], // +16 magenta-violet
		[120, 40, 165, 1], // +20 violet
		[85, 20, 130, 1] // +24 violet très foncé (canicule exceptionnelle)
	]
};
