import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Probabilité de présence d'un cyclone (`cyclone_existence`, WeatherNext Cyclones
// Mini). La donnée source est une probabilité dans [0, 1] ; elle est convertie en
// **pourcentage** dans `postReadCallback` (om-protocol-settings.ts) pour que la
// légende, le survol et l'export lisent tous « 45 % » plutôt que « 0.45 ».
//
// Champ extrêmement creux : sur un run typique ~1,5 % des points sont non nuls, et
// la médiane de ces non-nuls est de l'ordre de 0,04 % — l'essentiel du signal est du
// bruit numérique. Une échelle linéaire sur [0, 100] noierait donc les vrais
// systèmes. D'où :
//   - un **seuil bas** : 0 totalement transparent, l'alpha ne décolle qu'à partir
//     de 1 %, ce qui efface le bruit sans masquer un système naissant ;
//   - des paliers **resserrés en bas** (1/2/5/10) puis élargis (20/35/50/70/90),
//     façon heatmap : la dynamique utile est dans les premiers pourcents ;
//   - une montée **progressive de l'opacité** (0 → 1), pour que la tache se fonde
//     dans le fond de carte au lieu d'apparaître comme un aplat à bord franc.
export const cycloneExistenceScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: '%',
	breakpoints: [0, 1, 2, 5, 10, 20, 35, 50, 70, 90],
	colors: [
		[70, 110, 190, 0], // 0 — transparent
		[90, 160, 220, 0.3], // 1 % — bleu très pâle, à peine posé
		[110, 200, 220, 0.45], // 2 % — cyan
		[130, 220, 180, 0.6], // 5 % — turquoise
		[200, 230, 120, 0.7], // 10 % — vert-jaune
		[250, 215, 90, 0.8], // 20 % — jaune
		[250, 170, 60, 0.87], // 35 % — ambre
		[240, 110, 50, 0.92], // 50 % — orange
		[220, 50, 60, 0.96], // 70 % — rouge
		[160, 20, 110, 1] // 90 %+ — magenta foncé
	]
};
