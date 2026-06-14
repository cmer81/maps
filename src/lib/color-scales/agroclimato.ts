import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Palettes du domaine `agroclimato_france` (indices agroclimatologiques
// journaliers, grille AROME France 0,025°). Les indices ont des palettes
// dédiées (gel, ET0, VPD, THI) ; la température et les heures de chaleur
// s'alignent en revanche sur la palette température infoclimat (cohérence
// visuelle avec le reste de l'app, cf. ci-dessous).
//
// Quirks de rendu :
//  - océan / hors-domaine = NaN → transparent (comportement moteur par défaut) ;
//  - `frost_hours` / `heat_hours` valent 0 (pas NaN) sur l'océan : le premier
//    breakpoint est posé à 1 h, donc toute valeur < 1 h (océan ET terre sans
//    gel/chaleur) est rendue transparente — l'océan est masqué « gratuitement ».
//
// `temperature_2m_min` / `temperature_2m_max` n'ont PAS de palette ici : elles
// réutilisent directement `infoclimatTemperatureScale` (cf. om-protocol-settings.ts).
// `heat_hours` reprend les teintes chaudes de cette même palette, recalées en heures.

/** Heures de gel par jour (0–24 h). Comptage discret, palette froide bleu →
 *  violet. < 1 h transparent (masque l'océan à 0 h et la terre sans gel). */
export const agroFrostHoursScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'h',
	breakpoints: [1, 2, 4, 6, 8, 10, 12, 16, 20, 24],
	colors: [
		[200, 225, 255, 0.55], // 1 h
		[150, 195, 250, 0.7], // 2
		[100, 160, 240, 0.8], // 4
		[60, 120, 230, 0.85], // 6
		[40, 80, 210, 0.9], // 8
		[60, 50, 190, 0.92], // 10
		[90, 30, 170, 0.94], // 12
		[120, 20, 150, 0.96], // 16
		[150, 0, 140, 0.98], // 20
		[110, 0, 110, 1] // 24 h violet foncé (gel permanent)
	]
};

/** Heures de chaleur par jour (0–24 h). Reprend les **teintes chaudes de la
 *  palette température infoclimat** (jaune 14 °C → orange → rouge → magenta →
 *  rose 38 °C, cf. `infoclimatTemperatureScale`) mais graduées en heures et
 *  calées sur 0–24 h — cohérence visuelle avec la température, fort impact sur
 *  la végétation. **Alpha croissant** : les faibles nombres d'heures restent
 *  semi-transparents (le fond de carte transparaît), l'opacité monte avec
 *  l'intensité. Unité `h`, < 1 h transparent (masque l'océan à 0 h et la terre
 *  sans chaleur). */
export const agroHeatHoursScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'h',
	breakpoints: [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
	colors: [
		[255, 255, 0, 0.5], // 1 h  jaune        (= 14 °C infoclimat)
		[255, 203, 0, 0.6], // 2                 (16 °C)
		[255, 150, 0, 0.68], // 4   orange clair  (18 °C)
		[241, 112, 0, 0.74], // 6                 (20 °C)
		[215, 87, 0, 0.79], // 8    orange        (22 °C)
		[188, 60, 0, 0.84], // 10                 (24 °C)
		[162, 36, 0, 0.88], // 12                 (26 °C)
		[132, 12, 0, 0.91], // 14   rouge sombre  (28 °C)
		[150, 0, 48, 0.93], // 16   magenta foncé (30 °C)
		[203, 0, 124, 0.95], // 18                (32 °C)
		[255, 0, 174, 0.97], // 20  magenta       (34 °C)
		[255, 0, 255, 0.99], // 22  rose vif       (36 °C)
		[255, 97, 255, 1] // 24 h rose            (38 °C — chaleur permanente)
	]
};

/** Évapotranspiration de référence FAO-56 (mm/jour). Continu jaune → rouge,
 *  typiquement 0–8 mm/j (jusqu'à ~9 en été). Unité `mm/j` (pas `mm`) pour ne pas
 *  déclencher la conversion mm→inch du sélecteur d'unités. */
export const agroEt0FaoScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'mm/j',
	breakpoints: [0.5, 1, 2, 3, 4, 5, 6, 7, 8],
	colors: [
		[255, 255, 220, 0.6], // 0,5 mm/j
		[255, 245, 170, 0.7], // 1
		[255, 225, 120, 0.78], // 2
		[255, 200, 70, 0.84], // 3
		[255, 170, 40, 0.88], // 4
		[255, 130, 0, 0.92], // 5
		[255, 90, 0, 0.95], // 6
		[220, 40, 0, 0.97], // 7
		[170, 0, 0, 1] // 8 mm/j
	]
};

/** Déficit de pression de vapeur (kPa). Continu jaune → rouge ; bas = air humide,
 *  haut = stress hydrique. Bornes ~0–4 kPa. */
export const agroVpdScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: 'kPa',
	breakpoints: [0.2, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
	colors: [
		[255, 255, 210, 0.55], // 0,2 kPa
		[255, 240, 160, 0.7], // 0,5
		[255, 215, 110, 0.78], // 1
		[255, 185, 60, 0.84], // 1,5
		[255, 150, 20, 0.88], // 2
		[255, 110, 0, 0.92], // 2,5
		[235, 60, 0, 0.95], // 3
		[200, 20, 0, 0.97], // 3,5
		[150, 0, 0, 1] // 4 kPa
	]
};

/** Indice température-humidité pour le bétail (THI, sans unité). Bleu/vert frais
 *  (pas de stress) → bascule franche en jaune au seuil de stress ~72 → orange
 *  (stress modéré) → rouge/magenta (stress sévère). */
export const agroThiLivestockScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: '',
	breakpoints: [40, 50, 60, 68, 72, 75, 79, 84, 89, 94],
	colors: [
		[120, 180, 220, 0.85], // 40 frais
		[150, 200, 210, 0.85], // 50
		[180, 215, 170, 0.88], // 60 vert
		[210, 225, 130, 0.9], // 68 (approche du seuil)
		[255, 235, 80, 0.95], // 72 — SEUIL de stress (bascule jaune franche)
		[255, 190, 40, 0.95], // 75
		[255, 140, 0, 0.96], // 79 stress modéré
		[255, 90, 0, 0.97], // 84
		[230, 30, 0, 0.98], // 89 stress sévère
		[150, 0, 40, 1] // 94 danger
	]
};
