import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Cumul de neige depuis le début du run (variable `snowfall_sum` du domaine
// arome_france, Infoclimat). H0 = 0 partout, croissant à chaque échéance.
//
// Sans cette clé exacte, la résolution par famille du package mappe `*_sum`
// (non strippé) sur le fallback `temperature` (°C) — absurde pour un cumul de
// neige. On fixe ici une échelle en cm, palette « neige » Météociel-like
// (blanc bleuté → bleu → violet → magenta), bornes tunables.
//
// Sous le premier breakpoint (< 1 cm) le pixel est rendu transparent ; idem
// pour les NaN (pixel manquant).
export const snowfallSumScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'cm',
	breakpoints: [1, 2, 5, 10, 15, 20, 30, 50, 75, 100],
	colors: [
		[225, 235, 248, 0.6], // 1 cm
		[185, 210, 240, 0.75], // 2
		[140, 180, 235, 0.85], // 5
		[90, 150, 225, 0.9], // 10
		[60, 110, 205, 0.92], // 15
		[80, 80, 190, 0.94], // 20
		[120, 60, 175, 0.96], // 30
		[160, 45, 160, 0.98], // 50
		[195, 30, 130, 1], // 75
		[150, 0, 95, 1] // 100 — magenta foncé, saturé au-delà
	]
};
