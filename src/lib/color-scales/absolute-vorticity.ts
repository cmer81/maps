import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Tourbillon absolu à 500 hPa (`absolute_vorticity_500hPa`, domaine
// arome_france). Maxima de tourbillon = zones de forçage dynamique (talwegs,
// gouttes froides).
//
// Les valeurs brutes sont en s⁻¹ (~1e-4) — illisibles en légende. Elles sont
// donc multipliées par 1e5 dans `postReadCallback` (om-protocol-settings.ts),
// si bien que cette échelle et la légende raisonnent en **×10⁻⁵ s⁻¹**. Sans
// clé exacte, le fallback `temperature` (°C) serait faux de toute façon.
//
// On ne colore que le tourbillon cyclonique (positif, hémisphère Nord) ; sous
// le premier breakpoint le pixel est transparent. Palette séquentielle chaude
// Météociel-like (jaune pâle → orange → rouge → violet).
export const absoluteVorticityScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: '×10⁻⁵ s⁻¹',
	breakpoints: [4, 8, 12, 16, 20, 25, 30, 40],
	colors: [
		[255, 250, 180, 0.6], // 4
		[255, 225, 120, 0.8], // 8
		[255, 190, 80, 0.88], // 12
		[255, 150, 50, 0.92], // 16
		[250, 100, 40, 0.95], // 20
		[230, 50, 50, 0.97], // 25
		[190, 30, 90, 0.99], // 30
		[130, 20, 110, 1] // 40 — violet, saturé au-delà
	]
};
