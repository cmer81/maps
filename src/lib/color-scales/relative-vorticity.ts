import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Tourbillon relatif à 500 hPa (`relative_vorticity_500hPa`, domaine ecmwf_ifs_0p1).
// Champ dimensionnel en s⁻¹ (tourbillon absolu moins tourbillon planétaire f), PAS
// un rapport : sans clé exacte, la résolution par préfixe du package le rangeait sous
// `relative_humidity` (0-95 %) et la carte paraissait vide.
//
// Valeurs brutes ~1e-5 s⁻¹ multipliées par 1e5 dans `postReadCallback`
// (om-protocol-settings.ts) : l'échelle et la légende raisonnent en **×10⁻⁵ s⁻¹**.
// Mesuré (run 2026-10-20 12Z, +24 h, global) : p01/p99 = −17,6 / +18,8.
//
// Divergente et symétrique : rouge = cyclonique dans l'hémisphère Nord (positif),
// bleu = anticyclonique (négatif) ; transparent dans ±2 pour ne garder que les
// structures (talwegs, dorsales, gouttes froides). Saturée au-delà de ±25.
export const relativeVorticityScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: '×10⁻⁵ s⁻¹',
	breakpoints: [-25, -18, -12, -8, -5, -2, 2, 5, 8, 12, 18, 25],
	colors: [
		[40, 30, 120, 1], // ≤ −25
		[40, 70, 170, 0.97], // −18
		[60, 120, 200, 0.93], // −12
		[110, 165, 225, 0.85], // −8
		[170, 205, 240, 0.7], // −5
		[0, 0, 0, 0], // −2 … +2 transparent
		[255, 235, 160, 0.7], // +2
		[255, 200, 100, 0.85], // +5
		[250, 140, 60, 0.93], // +8
		[230, 70, 50, 0.97], // +12
		[180, 30, 90, 1], // +18
		[120, 20, 110, 1] // ≥ +25
	]
};
