import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Épaisseur 500-1000 hPa (`thickness_500_1000hPa`, domaine arome_france), en
// **mètres géopotentiels (gpm)**. Proxy de la température moyenne de la couche :
// l'isohypse 5400 gpm est la limite pluie/neige classique.
//
// Sans clé exacte, le fallback `temperature` (°C) est faux. Palette divergente
// Météociel-like centrée sur 5400 (bleu = couche froide → blanc neutre → rouge =
// couche chaude). Bornes tunables.
export const thicknessScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'gpm',
	breakpoints: [5100, 5160, 5220, 5280, 5340, 5400, 5460, 5520, 5580, 5640, 5700],
	colors: [
		[40, 40, 140, 0.92], // 5100 — couche très froide
		[40, 90, 190, 0.93], // 5160
		[60, 140, 215, 0.94], // 5220
		[110, 185, 230, 0.94], // 5280
		[175, 215, 240, 0.94], // 5340
		[235, 235, 235, 0.9], // 5400 — neutre (limite pluie/neige)
		[245, 210, 150, 0.94], // 5460
		[245, 165, 90, 0.96], // 5520
		[235, 110, 60, 0.97], // 5580
		[210, 55, 50, 0.98], // 5640
		[160, 25, 40, 1] // 5700 — couche très chaude, saturé au-delà
	]
};
