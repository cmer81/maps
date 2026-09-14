import { WMO_CODES, wmoLabel } from '$lib/meteogram/weather-symbols';

import type { CategoricalColorScale } from './types';
import type { RGBA } from '@openmeteo/weather-map-layer';

// Temps sensible (codes WMO 4677), diffusé par les domaines ICON
// (`dwd_icon`, `dwd_icon_eu`, `dwd_icon_d2`).
//
// C'est une variable **catégorielle** : sans clé exacte, la résolution du
// package retombait sur le fallback `temperature` et la carte coloriait les
// codes comme des degrés Celsius (un orage, code 95, tombait dans le rouge
// « 50 °C » ; un ciel clair, code 0, dans le bleu « 0 °C ») — le popup affichant
// « 95,0 °C ». Mesuré sur dwd_icon_d2 (run 2026-09-14 09Z, 14:00) : codes
// discrets 0, 1, 2, 3, 45, 51, 53, 55, 61, 63, 80, 81, 95, 96, 99.
//
// Encodage identique à `precipitation-type.ts` : `breakpoints` = les codes triés
// croissants, `colors` et `categories` alignés index par index. Le moteur colore
// via `index = max(0, findLastIndexLE(breakpoints, px))`, donc chaque code exact
// tombe sur sa propre couleur. L'échantillonnage doit être en plus proche voisin
// (`&interpolation=nearest`, cf. `CATEGORICAL_VARIABLES` dans `constants.ts`) :
// en bilinéaire, une valeur interpolée entre deux codes éloignés atterrit sur un
// code intermédiaire arbitraire (halos de catégorie parasite en lisière).
//
// Les libellés viennent de la table WMO 4677 du meteogram
// (`meteogram/weather-symbols.ts`), source unique pour éviter la divergence.
//
// Couleurs : ciel clair transparent (le fond de carte reste lisible), puis
// nuages en gris, brouillard en gris chaud, bruine/pluie en vert→bleu,
// verglaçant en magenta, neige en bleu pâle, averses en turquoise, orages en
// jaune→orange→rouge.
const COLOR_BY_CODE: Record<number, RGBA> = {
	0: [255, 255, 255, 0], // Ciel clair — transparent
	1: [220, 235, 250, 0.25], // Peu nuageux
	2: [200, 215, 230, 0.4], // Partiellement nuageux
	3: [160, 175, 190, 0.6], // Couvert
	45: [190, 190, 190, 0.75], // Brouillard
	48: [210, 200, 230, 0.8], // Brouillard givrant
	51: [170, 230, 170, 0.6], // Bruine faible
	53: [120, 215, 120, 0.7], // Bruine
	55: [70, 195, 70, 0.8], // Bruine forte
	56: [255, 170, 200, 0.8], // Bruine verglaçante faible
	57: [235, 120, 175, 0.85], // Bruine verglaçante
	61: [130, 190, 255, 0.7], // Pluie faible
	63: [60, 140, 240, 0.8], // Pluie modérée
	65: [20, 80, 200, 0.9], // Pluie forte
	66: [230, 90, 150, 0.9], // Pluie verglaçante faible
	67: [200, 0, 110, 0.95], // Pluie verglaçante
	71: [215, 230, 255, 0.75], // Neige faible
	73: [170, 200, 250, 0.85], // Neige modérée
	75: [120, 160, 235, 0.95], // Neige forte
	77: [190, 215, 245, 0.8], // Grains de neige
	80: [120, 225, 215, 0.7], // Averses faibles
	81: [40, 195, 185, 0.82], // Averses
	82: [0, 150, 150, 0.92], // Fortes averses
	85: [180, 220, 235, 0.8], // Averses de neige faibles
	86: [110, 175, 215, 0.9], // Fortes averses de neige
	95: [255, 200, 0, 0.9], // Orage
	96: [255, 120, 0, 0.95], // Orage avec grêle
	99: [200, 0, 0, 1] // Orage avec forte grêle
};

export const weatherCodeScale: CategoricalColorScale = {
	type: 'breakpoint',
	unit: '',
	breakpoints: [...WMO_CODES],
	colors: WMO_CODES.map((code) => COLOR_BY_CODE[code]),
	categories: WMO_CODES.map((code) => ({ code, label: wmoLabel(code) }))
};
