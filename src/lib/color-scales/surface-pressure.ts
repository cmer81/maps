import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Pression de surface (`surface_pressure`, hPa, domaine ecmwf_ifs_0p1). Sans clé
// exacte, aucune famille du package ne correspondait et elle retombait sur l'échelle
// `temperature` (°C). Contrairement à la pression réduite au niveau de la mer, elle
// suit le relief : mesuré 465…1060 hPa (run 2026-10-20 12Z, +24 h, global), d'où
// une échelle large, des hauts plateaux (Tibet, Andes) aux plaines.
export const surfacePressureScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'hPa',
	breakpoints: [500, 600, 700, 800, 850, 900, 950, 980, 1000, 1015, 1030, 1050],
	colors: [
		[90, 50, 30, 1], // 500 — hauts plateaux
		[130, 80, 45, 1], // 600
		[170, 120, 70, 1], // 700
		[200, 165, 105, 1], // 800
		[220, 200, 140, 1], // 850
		[200, 220, 170, 1], // 900
		[150, 205, 190, 1], // 950
		[110, 180, 210, 1], // 980
		[80, 150, 210, 1], // 1000
		[60, 110, 190, 1], // 1015
		[50, 70, 160, 1], // 1030
		[40, 40, 120, 1] // 1050
	]
};
