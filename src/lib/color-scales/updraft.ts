import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Courant ascendant maximal (m/s), diffusé par les domaines ICON. Sans clé
// exacte, le package retombait sur le fallback `temperature` (°C).
// Mesuré sur dwd_icon_d2 (run 2026-09-14 09Z, 14:00) : 0…11,08 m/s. L'échelle
// monte à 25 m/s pour couvrir les ascendances supercellulaires.
// Sous 0,5 m/s (convection peu organisée) : transparent.
export const updraftScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'm/s',
	breakpoints: [0, 0.5, 1, 2, 4, 6, 10, 15, 25],
	colors: [
		[0, 0, 0, 0], // 0 transparent
		[200, 240, 255, 0.35], // 0,5
		[140, 210, 255, 0.55], // 1
		[80, 170, 255, 0.7], // 2
		[255, 230, 0, 0.8], // 4
		[255, 160, 0, 0.88], // 6
		[255, 70, 0, 0.93], // 10
		[210, 0, 30, 0.97], // 15
		[150, 0, 160, 1] // 25+
	]
};
