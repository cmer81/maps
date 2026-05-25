import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Palette température inspirée d'infoclimat.fr
// Source : site-infoclimat/data/cartes/couleurs/temperature.php
// LUT originale par degré entier de -28 °C à +43 °C ; échantillonnée ici
// au pas de 2 °C pour garder la légende sur une hauteur raisonnable.
// L'interpolation linéaire entre breakpoints reconstitue le rendu d'origine.
export const infoclimatTemperatureScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: '°C',
	breakpoints: [
		-28, -26, -24, -22, -20, -18, -16, -14, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14,
		16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42
	],
	colors: [
		[227, 174, 227, 1],
		[174, 125, 174, 1],
		[125, 73, 125, 1],
		[87, 36, 87, 1],
		[60, 12, 60, 1],
		[60, 0, 60, 1],
		[87, 0, 87, 1],
		[125, 0, 125, 1],
		[174, 0, 174, 1],
		[227, 0, 227, 1],
		[206, 0, 255, 1],
		[99, 0, 255, 1],
		[0, 48, 255, 1],
		[0, 150, 255, 1],
		[0, 203, 255, 1],
		[51, 255, 192, 1],
		[25, 255, 113, 1],
		[0, 252, 0, 1],
		[134, 233, 73, 1],
		[184, 245, 103, 1],
		[219, 255, 93, 1],
		[239, 255, 51, 1],
		[255, 255, 0, 1],
		[255, 203, 0, 1],
		[255, 150, 0, 1],
		[241, 112, 0, 1],
		[215, 87, 0, 1],
		[188, 60, 0, 1],
		[162, 36, 0, 1],
		[132, 12, 0, 1],
		[150, 0, 48, 1],
		[203, 0, 124, 1],
		[255, 0, 174, 1],
		[255, 0, 255, 1],
		[255, 97, 255, 1],
		[255, 150, 255, 1]
	]
};
