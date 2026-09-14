import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Potentiel orageux (Lightning Potential Index, LPI — J/kg), diffusé par les
// domaines ICON. Sans clé exacte, la résolution du package retombait sur le
// fallback `temperature` : la légende affichait des °C.
// Mesuré sur dwd_icon_d2 (run 2026-09-14 09Z, 14:00) : 0…22,6 J/kg. L'échelle
// monte à 30 pour couvrir les cellules les plus actives.
// 0 transparent (pas de potentiel), puis jaune → orange → rouge → violet.
export const lightningPotentialScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'J/kg',
	breakpoints: [0, 1, 2, 5, 10, 15, 20, 30],
	colors: [
		[0, 0, 0, 0], // 0 transparent
		[255, 255, 150, 0.65], // 1 jaune pâle
		[255, 230, 0, 0.78], // 2 jaune
		[255, 170, 0, 0.86], // 5 ambre
		[255, 90, 0, 0.92], // 10 orange
		[230, 0, 0, 0.95], // 15 rouge
		[200, 0, 80, 0.98], // 20 rouge-magenta
		[150, 0, 160, 1] // 30+ violet
	]
};
