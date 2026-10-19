import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Probabilité d'existence cyclonique Weather AI (WeatherNext Cyclones Mini),
// diffusée en fraction 0..1 et ramenée en % dans `postReadCallback`
// (`stores/om-protocol-settings.ts`). Palette séquentielle jaune → rouge →
// violet, reprise des superpositions Cyclones IA. Classe 0 (< 5 %) transparente
// pour ne pas voiler la carte : presque tout le globe est à ~0.
export const cycloneExistenceProbabilityScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: '%',
	breakpoints: [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90],
	colors: [
		[255, 255, 255, 0], // < 5 %
		[255, 245, 160, 0.45], // 5
		[255, 230, 120, 0.6], // 10
		[254, 204, 92, 0.7], // 20
		[253, 170, 75, 0.75], // 30
		[253, 141, 60, 0.8], // 40
		[245, 100, 45, 0.85], // 50
		[240, 59, 32, 0.88], // 60
		[210, 25, 35, 0.9], // 70
		[189, 0, 38, 0.92], // 80
		[122, 1, 119, 0.95] // 90+
	]
};
