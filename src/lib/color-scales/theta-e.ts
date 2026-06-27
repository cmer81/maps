import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Température potentielle équivalente à 850 hPa (`theta_e_850hPa`, domaine
// arome_france). Produit en **kelvins** par le pipeline Infoclimat (~288-342 K).
// Marqueur d'instabilité / advection d'air chaud et humide.
//
// Sans clé exacte, le package retombe sur le fallback `temperature` (°C, bornes
// -80..50) — bornes et unité fausses. Palette rainbow Météociel-like
// (bleu froid → vert → jaune → orange → rouge → magenta chaud).
export const thetaEScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'K',
	breakpoints: [288, 294, 300, 306, 312, 318, 324, 330, 336, 342],
	colors: [
		[60, 60, 170, 0.92], // 288 K
		[40, 110, 200, 0.93], // 294
		[40, 170, 200, 0.94], // 300
		[70, 200, 130, 0.95], // 306
		[150, 215, 70, 0.95], // 312
		[235, 225, 60, 0.96], // 318
		[245, 165, 40, 0.97], // 324
		[235, 95, 35, 0.98], // 330
		[205, 35, 55, 1], // 336
		[165, 25, 95, 1] // 342 — magenta chaud, saturé au-delà
	]
};
