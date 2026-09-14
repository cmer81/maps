import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Flux turbulents de surface (chaleur sensible et latente, W/m²), partagés par
// `sensible_heat_flux` et `latent_heat_flux` — même grandeur physique, mêmes
// ordres de grandeur.
//
// Le package fournit bien les clés `sensible_heat_flux` / `latent_heat_flux`,
// mais leurs `breakpoints` sont **littéralement le tableau de `temperature`**
// (−80…50) sous une unité W/m² : mesuré sur dwd_icon_d2 (run 2026-09-14 09Z,
// 14:00), le sensible va de −416,7 à +118,1 et le latent de −409,7 à +20,8 —
// plus de 90 % du champ saturait aux deux extrémités, donnant un aplat bicolore.
//
// Convention de signe DWD/ICON (identique à celle de l'API Open-Meteo) :
// **négatif = flux dirigé vers le haut**, de la surface vers l'atmosphère (cas
// diurne dominant). Les valeurs brutes sont conservées telles quelles ; la
// palette est divergente autour de 0 : chaud (orange → rouge) vers le haut,
// froid (bleu) vers le bas, transparent au voisinage de zéro.
export const heatFluxScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'W/m²',
	breakpoints: [-600, -400, -300, -200, -120, -60, -20, 0, 20, 60, 120, 200],
	colors: [
		[120, 0, 0, 0.95], // -600 flux ascendant très fort
		[190, 20, 0, 0.9], // -400
		[235, 80, 0, 0.85], // -300
		[255, 140, 0, 0.8], // -200
		[255, 190, 60, 0.7], // -120
		[255, 230, 150, 0.5], // -60
		[255, 250, 220, 0.2], // -20
		[255, 255, 255, 0], // 0 transparent (flux nul)
		[210, 235, 255, 0.3], // 20
		[150, 200, 245, 0.55], // 60
		[80, 150, 230, 0.75], // 120
		[20, 90, 190, 0.9] // 200+ flux descendant fort
	]
};
