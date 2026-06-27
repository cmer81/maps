import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Température potentielle du thermomètre mouillé à 850 hPa (`theta_w_850hPa`,
// domaine arome_france). Produit en **°C** par le pipeline Infoclimat
// (~ -8 → 28 °C). Très utilisé en prévision (masses d'air, fronts).
//
// Sans clé exacte, le fallback `temperature` (bornes -80..50) écrase tout le
// signal dans quelques nuances. Même rainbow Météociel-like que theta_e, mais
// bornes resserrées en °C.
export const thetaWScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: '°C',
	breakpoints: [-8, -4, 0, 4, 8, 12, 16, 20, 24, 28],
	colors: [
		[60, 60, 170, 0.92], // -8 °C
		[40, 110, 200, 0.93], // -4
		[40, 170, 200, 0.94], // 0
		[70, 200, 130, 0.95], // 4
		[150, 215, 70, 0.95], // 8
		[235, 225, 60, 0.96], // 12
		[245, 165, 40, 0.97], // 16
		[235, 95, 35, 0.98], // 20
		[205, 35, 55, 1], // 24
		[165, 25, 95, 1] // 28 — saturé au-delà
	]
};
