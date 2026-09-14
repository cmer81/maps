import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Inhibition convective (CIN, J/kg) — magnitude du « couvercle » : 0 = aucune
// inhibition (transparent), plus la valeur monte, plus le couvercle est marqué.
//
// La convention de signe diffère d'un producteur à l'autre :
//   - `arome_france_convection` publie le CIN **négatif** (mesuré : −267…+10) ;
//   - les domaines upstream (`dwd_icon_d2`, `dwd_icon_eu`, `meteoswiss_icon_ch*`,
//     `ncep_gfs025`) le publient **positif** (mesuré sur dwd_icon_d2 : 0…295).
// Cette échelle était auparavant définie sur −1000…0, taillée pour AROME : comme
// elle est enregistrée par clé exacte (donc globale à tous les domaines), toute
// valeur positive tombait sur le dernier breakpoint — transparent — et le CIN
// était purement **invisible** sur les cinq domaines upstream.
//
// `postReadCallback` (`stores/om-protocol-settings.ts`) normalise désormais la
// variable en magnitude positive (`Math.abs`), quelle que soit la convention du
// producteur ; l'échelle est donc positive et croissante.
export const convectiveInhibitionScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'J/kg',
	breakpoints: [0, 25, 50, 100, 200, 500, 1000],
	colors: [
		[200, 200, 200, 0], // 0 transparent (pas d'inhibition)
		[190, 170, 175, 0.3], // 25
		[170, 120, 140, 0.5], // 50
		[150, 70, 120, 0.7], // 100
		[120, 30, 110, 0.82], // 200
		[80, 0, 90, 0.9], // 500
		[40, 0, 60, 0.95] // 1000 couvercle le plus fort
	]
};
