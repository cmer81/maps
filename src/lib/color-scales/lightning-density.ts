import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Densité de flashs totale (« Total Lightning Flash Density », GRIB 0-17-4),
// moyennée sur 3 h. Unité : km⁻² day⁻¹. ~0 en ciel calme, jusqu'à plusieurs
// dizaines de km⁻²·jour⁻¹ sur une cellule orageuse → l'échelle monte à 50.
// 0 transparent, puis échelle « foudre » jaune→orange→rouge→violet.
// Variable présente seulement H+3→H+51.
export const lightningDensityScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'km⁻² day⁻¹',
	breakpoints: [0, 0.5, 1, 2, 5, 10, 20, 50],
	colors: [
		[0, 0, 0, 0], // 0 transparent
		[255, 255, 150, 0.7], // 0.5 jaune pâle
		[255, 230, 0, 0.8], // 1 jaune
		[255, 170, 0, 0.88], // 2 ambre
		[255, 90, 0, 0.93], // 5 orange
		[230, 0, 0, 0.96], // 10 rouge
		[200, 0, 80, 0.98], // 20 rouge-magenta
		[150, 0, 160, 1] // 50+ violet
	]
};
