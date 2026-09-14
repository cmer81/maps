import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Humidité du sol (fraction volumique). Le défaut du package annonce l'unité
// « vol. % » sur une donnée qui est en m³/m³ : la légende et le popup affichaient
// « 0,3 vol. % » là où il faut lire 30 vol. % — faux d'un facteur 100. C'est le
// vrai défaut ; le dépassement de borne est marginal (mesuré sur dwd_icon_d2,
// run 2026-09-14 09Z, 14:00 : 0…0,761 m³/m³, soit 0,5 % des pixels au-dessus de
// 0,5). Valeurs brutes conservées, unité corrigée, mêmes paliers de 0,05 dans la
// bande utile que le défaut, sommet prolongé à 0,8 pour les sols saturés.
// Brun (sol sec) → vert → bleu (sol saturé).
export const soilMoistureScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'm³/m³',
	breakpoints: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.8],
	colors: [
		[120, 70, 30, 0.9], // 0 très sec
		[160, 110, 55, 0.88], // 0,05
		[195, 155, 95, 0.85], // 0,10
		[220, 195, 140, 0.82], // 0,15
		[235, 225, 175, 0.8], // 0,20
		[210, 230, 165, 0.8], // 0,25
		[165, 215, 140, 0.82], // 0,30
		[110, 195, 135, 0.85], // 0,35
		[60, 175, 155, 0.87], // 0,40
		[30, 140, 185, 0.9], // 0,50
		[20, 95, 175, 0.93], // 0,60
		[15, 50, 140, 0.95] // 0,80 saturé
	]
};
