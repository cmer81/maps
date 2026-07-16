import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Réflectivité radar affichée en taux de pluie équivalent (mm/h), à la Météociel.
// La donnée source est en dBZ ; elle est convertie en mm/h via la relation Z-R de
// Marshall-Palmer dans le postReadCallback (`om-protocol-settings.ts`) — voir
// `dbzToRainRate()`. Cette échelle définit donc ses seuils EN mm/h et reprend la
// palette Météociel band-par-band (couleurs échantillonnées de leur légende).
//
// Bande de tête transparente (breakpoint 0, alpha 0) : tout px < 0,5 mm/h
// (≈ < 18 dBZ) est rendu transparent, comme Météociel — le moteur retombe sur
// colors[0] pour px < breakpoints[1]. La conversion Z-R plancherise déjà ces
// valeurs à NaN, cette bande transparente est une sécurité.
export const radarReflectivityScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'mm/h',
	breakpoints: [
		0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 25, 30, 35, 40, 45, 50, 100, 150,
		200, 250, 300
	],
	colors: [
		[0, 0, 0, 0], // <0,5 mm/h transparent (≈ <18 dBZ)
		[0, 13, 37, 0.85], // 0.5 mm/h
		[0, 23, 66, 0.86], // 1 mm/h
		[0, 54, 102, 0.86], // 2 mm/h
		[0, 54, 152, 0.87], // 3 mm/h
		[0, 0, 203, 0.87], // 4 mm/h
		[0, 0, 255, 0.88], // 5 mm/h
		[0, 102, 255, 0.88], // 6 mm/h
		[0, 152, 255, 0.89], // 7 mm/h
		[54, 203, 255, 0.9], // 8 mm/h
		[102, 255, 255, 0.9], // 9 mm/h
		[102, 255, 152, 0.91], // 10 mm/h
		[102, 255, 102, 0.91], // 12 mm/h
		[102, 255, 0, 0.92], // 14 mm/h
		[190, 250, 22, 0.92], // 16 mm/h
		[255, 255, 17, 0.93], // 18 mm/h
		[255, 255, 133, 0.94], // 20 mm/h
		[253, 231, 82, 0.94], // 25 mm/h
		[255, 203, 0, 0.95], // 30 mm/h
		[255, 152, 0, 0.95], // 35 mm/h
		[255, 102, 0, 0.96], // 40 mm/h
		[255, 54, 54, 0.97], // 45 mm/h
		[255, 54, 0, 0.97], // 50 mm/h
		[255, 0, 0, 0.98], // 100 mm/h
		[203, 0, 0, 0.98], // 150 mm/h
		[152, 0, 0, 0.99], // 200 mm/h
		[108, 0, 0, 0.99], // 250 mm/h
		[80, 0, 0, 1.0] // 300 mm/h
	]
};
