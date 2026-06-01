import type { CategoricalColorScale } from './types';

// Type de précipitation (codes producteur catégoriels). Une seule définition,
// partagée par `precipitation_type` (le plus fréquent) et `precipitation_type_severe`
// (le plus dangereux).
//
// Encodage : `breakpoints` = codes triés croissants. Le moteur colore via
// `index = max(0, findLastIndexLE(breakpoints, px))`, donc chaque code exact tombe
// sur sa propre couleur ; les entiers intermédiaires inexistants (ex. 13..192)
// héritent du code inférieur le plus proche (inoffensif, ils n'apparaissent pas).
// Code 0 (aucune) → alpha 0 (transparent).
//
// Variantes « intermittent / fondante » (≥193) : même teinte que leur type de base,
// opacité réduite, pour limiter le nombre de couleurs distinctes.
export const precipitationTypeScale: CategoricalColorScale = {
	type: 'breakpoint',
	unit: '',
	breakpoints: [0, 1, 3, 5, 6, 7, 8, 10, 11, 12, 193, 201, 205, 206, 207],
	colors: [
		[0, 0, 0, 0], // 0 aucune
		[0, 200, 0, 0.9], // 1 pluie
		[230, 0, 80, 0.95], // 3 pluie verglaçante
		[120, 180, 255, 0.9], // 5 neige sèche
		[80, 140, 230, 0.9], // 6 neige humide
		[0, 180, 200, 0.9], // 7 pluie + neige
		[200, 100, 255, 0.95], // 8 granules de glace
		[255, 0, 0, 1], // 10 grêle
		[120, 230, 120, 0.85], // 11 bruine
		[255, 120, 180, 0.9], // 12 bruine verglaçante
		[80, 140, 230, 0.55], // 193 neige fondante (base : neige humide)
		[0, 200, 0, 0.55], // 201 pluie intermittente
		[120, 180, 255, 0.55], // 205 neige sèche intermittente
		[80, 140, 230, 0.5], // 206 neige humide intermittente
		[0, 180, 200, 0.55] // 207 pluie+neige intermittente
	],
	categories: [
		{ code: 0, label: 'Aucune' },
		{ code: 1, label: 'Pluie' },
		{ code: 3, label: 'Pluie verglaçante' },
		{ code: 5, label: 'Neige sèche' },
		{ code: 6, label: 'Neige humide' },
		{ code: 7, label: 'Pluie + neige' },
		{ code: 8, label: 'Granules de glace' },
		{ code: 10, label: 'Grêle' },
		{ code: 11, label: 'Bruine' },
		{ code: 12, label: 'Bruine verglaçante' },
		{ code: 193, label: 'Neige fondante' },
		{ code: 201, label: 'Pluie interm.' },
		{ code: 205, label: 'Neige sèche interm.' },
		{ code: 206, label: 'Neige humide interm.' },
		{ code: 207, label: 'Pluie+neige interm.' }
	]
};
