/**
 * Styles vecteur data-driven : contours et flèches de vent.
 *
 * Les expressions MapLibre étaient hardcodées dans `layers.ts`. On les exprime
 * ici en données (niveaux) + builders purs, pour pouvoir les personnaliser
 * (cf. stores/vector-styles.ts) sans toucher au moteur de rendu.
 */
import { type UnitPreferences, convertValue } from '$lib/stores/units';

import type * as maplibregl from 'maplibre-gl';

// ── Types ────────────────────────────────────────────────────────────────

export interface ContourLevel {
	/** Valeurs où `value % modulo === 0` reçoivent ce style. `0` = fallback. */
	modulo: number;
	label: string;
	lightColor: string;
	darkColor: string;
	width: number;
}
export interface ContourStyle {
	levels: ContourLevel[];
}

export interface ArrowLevel {
	/** Valeurs strictement supérieures à ce seuil reçoivent ce style. `0` = base. */
	minSpeed: number;
	label: string;
	lightColor: string;
	darkColor: string;
	width: number;
}
export interface ArrowStyle {
	levels: ArrowLevel[];
}

// ── Defaults (reproduisent EXACTEMENT l'ancien layers.ts) ──────────────────

export const defaultContourStyle: ContourStyle = {
	levels: [
		{
			modulo: 0,
			label: 'Autres',
			lightColor: 'rgba(0,0,0, 0.3)',
			darkColor: 'rgba(255,255,255, 0.5)',
			width: 1
		},
		{
			modulo: 10,
			label: '×10',
			lightColor: 'rgba(0,0,0, 0.4)',
			darkColor: 'rgba(255,255,255, 0.6)',
			width: 2
		},
		{
			modulo: 50,
			label: '×50',
			lightColor: 'rgba(0,0,0, 0.5)',
			darkColor: 'rgba(255,255,255, 0.7)',
			width: 2.5
		},
		{
			modulo: 100,
			label: '×100',
			lightColor: 'rgba(0,0,0, 0.6)',
			darkColor: 'rgba(255,255,255, 0.8)',
			width: 3
		}
	]
};

export const defaultArrowStyle: ArrowStyle = {
	levels: [
		{
			minSpeed: 0,
			label: '≤2',
			lightColor: 'rgba(0,0,0, 0.2)',
			darkColor: 'rgba(255,255,255, 0.2)',
			width: 1.5
		},
		{
			minSpeed: 2,
			label: '>2',
			lightColor: 'rgba(0,0,0, 0.3)',
			darkColor: 'rgba(255,255,255, 0.3)',
			width: 1.6
		},
		{
			minSpeed: 3,
			label: '>3',
			lightColor: 'rgba(0,0,0, 0.4)',
			darkColor: 'rgba(255,255,255, 0.4)',
			width: 1.8
		},
		{
			minSpeed: 4,
			label: '>4',
			lightColor: 'rgba(0,0,0, 0.5)',
			darkColor: 'rgba(255,255,255, 0.5)',
			width: 1.8
		},
		{
			minSpeed: 5,
			label: '>5',
			lightColor: 'rgba(0,0,0, 0.6)',
			darkColor: 'rgba(255,255,255, 0.6)',
			width: 2
		},
		{
			minSpeed: 10,
			label: '>10',
			lightColor: 'rgba(0,0,0, 0.7)',
			darkColor: 'rgba(255,255,255, 0.7)',
			width: 2.2
		},
		{
			minSpeed: 20,
			label: '>20',
			lightColor: 'rgba(0,0,0, 0.7)',
			darkColor: 'rgba(255,255,255, 0.7)',
			width: 2.8
		}
	]
};

// ── Builders ───────────────────────────────────────────────────────────────

const VALUE: maplibregl.ExpressionSpecification = ['to-number', ['get', 'value']];

type ColorOrExpr = maplibregl.ExpressionSpecification | string;
type NumOrExpr = maplibregl.ExpressionSpecification | number;

/** Couleur des isolignes : plus grand modulo testé en premier, fallback en dernier. */
export function buildContourColorExpr(style: ContourStyle, dark: boolean): ColorOrExpr {
	const fallback = style.levels.find((l) => l.modulo === 0);
	const conditions = style.levels.filter((l) => l.modulo > 0).sort((a, b) => a.modulo - b.modulo);
	let expr: ColorOrExpr = (dark ? fallback?.darkColor : fallback?.lightColor) ?? 'transparent';
	for (const lvl of conditions) {
		expr = [
			'case',
			['boolean', ['==', ['%', VALUE, lvl.modulo], 0], false],
			dark ? lvl.darkColor : lvl.lightColor,
			expr
		];
	}
	return expr;
}

/** Largeur des isolignes (indépendante du thème). */
export function buildContourWidthExpr(style: ContourStyle): NumOrExpr {
	const fallback = style.levels.find((l) => l.modulo === 0);
	const conditions = style.levels.filter((l) => l.modulo > 0).sort((a, b) => a.modulo - b.modulo);
	let expr: NumOrExpr = fallback?.width ?? 1;
	for (const lvl of conditions) {
		expr = ['case', ['boolean', ['==', ['%', VALUE, lvl.modulo], 0], false], lvl.width, expr];
	}
	return expr;
}

/**
 * Champ texte des étiquettes d'isolignes. Les tuiles portent la valeur dans
 * l'unité de base de la variable (`baseUnit` = unité de l'échelle de couleurs,
 * p. ex. `m/s` pour le vent, `gpm` pour le géopotentiel). On la convertit dans
 * l'unité d'affichage choisie via une transformation **affine** (offset +
 * facteur) dérivée de `convertValue`, exprimée en MapLibre — ce qui couvre
 * toutes les catégories (vent m/s→km/h, °C→°F, géopotentiel gpm→gpdam…). La
 * couleur/largeur restent pilotées par la valeur brute (modulo), donc les lignes
 * ne bougent pas — seul le libellé change.
 */
export function buildContourLabelExpr(
	variable: string,
	baseUnit: string,
	units: UnitPreferences
): maplibregl.ExpressionSpecification {
	// Arrondi pour éviter le bruit flottant (ex. 33,8 − 32 = 1,79999…) dans
	// l'expression ; 6 décimales suffisent largement (affichage à 1 décimale).
	const round = (n: number): number => Math.round(n * 1e6) / 1e6;
	const offset = round(convertValue(0, baseUnit, units, variable));
	const factor = round(
		convertValue(1, baseUnit, units, variable) - convertValue(0, baseUnit, units, variable)
	);
	// Unité d'affichage = unité de base → valeur brute (formatage historique).
	if (factor === 1 && offset === 0) return ['to-string', ['get', 'value']];
	const scaled: maplibregl.ExpressionSpecification =
		offset === 0 ? ['*', VALUE, factor] : ['+', ['*', VALUE, factor], offset];
	return ['number-format', scaled, { 'max-fraction-digits': 1 }];
}

// ── Calque « valeurs aux points de grille » (façon Météociel) ───────────────

/**
 * Champ texte des étiquettes de valeur — **entier**, dans l'unité d'affichage.
 * Même conversion affine que `buildContourLabelExpr`, mais arrondi à l'entier.
 *
 * On arrondit **explicitement** via `['round', …]` (et non `number-format` avec
 * `max-fraction-digits: 0`) : dans MapLibre, `max-fraction-digits: 0` est traité
 * comme « non défini » (le `0` est falsy) et retombe sur 3 décimales par défaut —
 * d'où des étiquettes type « 22,428 km/h » sur les variables converties (vent…).
 * `['round', …]` renvoie un entier, `['to-string', …]` le rend sans séparateur.
 */
export function buildGridValueLabelExpr(
	variable: string,
	baseUnit: string,
	units: UnitPreferences
): maplibregl.ExpressionSpecification {
	const round = (n: number): number => Math.round(n * 1e6) / 1e6;
	const offset = round(convertValue(0, baseUnit, units, variable));
	const factor = round(
		convertValue(1, baseUnit, units, variable) - convertValue(0, baseUnit, units, variable)
	);
	if (factor === 1 && offset === 0) return ['to-string', ['round', VALUE]];
	const scaled: maplibregl.ExpressionSpecification =
		offset === 0 ? ['*', VALUE, factor] : ['+', ['*', VALUE, factor], offset];
	return ['to-string', ['round', scaled]];
}

/** Espacement écran cible (px) entre étiquettes de valeur. Le stride 2D vise cet
 *  écart dans chaque axe → grille régulière à densité ~constante à l'écran.
 *  Plus petit = plus d'étiquettes. Plancher pratique ~40 px : en dessous, comme
 *  `text-allow-overlap: true`, les libellés à 2-3 chiffres commencent à se toucher. */
export const GRID_VALUE_TARGET_PX = 48;

/** Pixels par degré de longitude en web-mercator (tuiles 512 px) au zoom donné.
 *  `x` mercator est linéaire en longitude → indépendant de la latitude. */
export const pxPerDegLon = (zoom: number): number => (512 * Math.pow(2, zoom)) / 360;

/** Stride d'échantillonnage (entier ≥ 1) pour viser `targetPx` à l'écran.
 *  `stepDeg` = pas de la grille sur l'axe considéré ; `pxPerDeg` = densité écran. */
export const computeStride = (stepDeg: number, pxPerDeg: number, targetPx: number): number => {
	const screenStep = pxPerDeg * stepDeg;
	if (!(screenStep > 0)) return 1;
	return Math.max(1, Math.round(targetPx / screenStep));
};

/** Géométrie de grille nécessaire à la décimation 2D, dérivée du domaine. */
export interface GridGeometry {
	/** Largeur **globale** de la grille (`grid.nx`), pour décoder `id → (i, j)`. */
	nx: number;
	ny: number;
	/** Pas longitude (degrés), bornes / (nx − 1). */
	dxDeg: number;
	/** Pas latitude (degrés), bornes / (ny − 1). */
	dyDeg: number;
	/** Latitude de référence (centre) pour la correction mercator du stride Y. */
	refLat: number;
	/** Grille gaussienne → pas d'`id = j·nx+i` exploitable → repli décimation 1D. */
	gaussian: boolean;
}

/**
 * Filtre de **décimation 2D** sur l'`id` GLOBAL du point de grille
 * (`id = j·nx + i`, émis de façon stable par le fork du package — cf.
 * `GridPoint.globalIndex`). Garde un **sous-réseau régulier fixe**
 * `i % strideX == 0 && j % strideY == 0`, indépendant du viewport → grille figée.
 * Combiné à `text-allow-overlap: true` (aucune collision), les étiquettes sont
 * épinglées aux nœuds : un pan ne fait que les translater, zéro recalcul.
 *
 * Structuré en `['step', ['zoom'], …]` (seule forme acceptant `['zoom']` en filtre
 * MapLibre), à **paliers entiers** : le stride ne change qu'aux zooms entiers, qui
 * coïncident avec les rechargements de tuiles → pas de recalcul en cours de zoom.
 * Les grilles gaussiennes (largeur de ligne variable, pas d'`id = j·nx+i`) →
 * repli décimation 1D `id % strideX`.
 *
 * **Prérequis** : `id` global stable. Sans le fork (id ré-indexé par sous-grille
 * rognée, `nxClip` variable), `floor(id/nx)` produirait des bandes horizontales.
 */
export function buildGridDecimationFilter(
	geom: GridGeometry,
	zoomRange: [number, number] = [2, 12],
	targetPx: number = GRID_VALUE_TARGET_PX
): maplibregl.FilterSpecification {
	const branch = (zoom: number): maplibregl.ExpressionSpecification => {
		const pxLon = pxPerDegLon(zoom);
		const sx = computeStride(geom.dxDeg, pxLon, targetPx);
		if (geom.gaussian) {
			return ['==', ['%', ['id'], sx], 0];
		}
		const pxLat = pxLon / Math.cos((geom.refLat * Math.PI) / 180);
		const sy = computeStride(geom.dyDeg, pxLat, targetPx);
		const i: maplibregl.ExpressionSpecification = ['%', ['id'], geom.nx];
		const j: maplibregl.ExpressionSpecification = ['floor', ['/', ['id'], geom.nx]];
		return ['all', ['==', ['%', i, sx], 0], ['==', ['%', j, sy], 0]];
	};
	const [zMin, zMax] = zoomRange;
	const ZOOM_STEP = 1;
	const steps = Math.round((zMax - zMin) / ZOOM_STEP);
	const stops: unknown[] = ['step', ['zoom'], branch(zMin)];
	for (let k = 1; k <= steps; k++) {
		const z = zMin + k * ZOOM_STEP;
		stops.push(z, branch(z));
	}
	return stops as unknown as maplibregl.FilterSpecification;
}

/** Couleur des flèches : plus grand seuil testé en premier, base en dernier. */
export function buildArrowColorExpr(style: ArrowStyle, dark: boolean): ColorOrExpr {
	const base = style.levels.find((l) => l.minSpeed === 0);
	const conditions = style.levels
		.filter((l) => l.minSpeed > 0)
		.sort((a, b) => a.minSpeed - b.minSpeed);
	let expr: ColorOrExpr = (dark ? base?.darkColor : base?.lightColor) ?? 'transparent';
	for (const lvl of conditions) {
		expr = [
			'case',
			['boolean', ['>', VALUE, lvl.minSpeed], false],
			dark ? lvl.darkColor : lvl.lightColor,
			expr
		];
	}
	return expr;
}

/** Largeur des flèches (indépendante du thème). */
export function buildArrowWidthExpr(style: ArrowStyle): NumOrExpr {
	const base = style.levels.find((l) => l.minSpeed === 0);
	const conditions = style.levels
		.filter((l) => l.minSpeed > 0)
		.sort((a, b) => a.minSpeed - b.minSpeed);
	let expr: NumOrExpr = base?.width ?? 1.5;
	for (const lvl of conditions) {
		expr = ['case', ['boolean', ['>', VALUE, lvl.minSpeed], false], lvl.width, expr];
	}
	return expr;
}

// ── Helpers rgba (utilisés par l'UI d'édition) ──────────────────────────────

export function parseRgbaOpacity(rgba: string): number {
	const parts = rgba.match(/[\d.]+/g);
	if (!parts || parts.length < 4) return 1;
	return parseFloat(parts[3]);
}

/** 'rgba(10, 20, 30, 0.4)' → '#0a141e' (hex sans alpha, pour le ColorPicker). */
export function rgbaStringToHex(rgba: string): string {
	const parts = rgba.match(/[\d.]+/g);
	if (!parts || parts.length < 3) return '#000000';
	const [r, g, b] = parts.map(Number);
	return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
}

/** ('#0a141e', 0.4) → 'rgba(10, 20, 30, 0.4)'. `hex` doit être en 6 chiffres (pas de short-hand `#fff`). */
export function hexToRgbaString(hex: string, alpha: number): string {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!m) return `rgba(0, 0, 0, ${alpha})`;
	const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Résolution du niveau de vent (mode « selon la variable affichée ») ──────

/**
 * Variables que le `vectorManager` rend déjà en flèches (la lib dérive u/v →
 * vitesse/direction) : `wind_u_component_*`, `wind_v_component_*`, `wind_speed_*`,
 * `wind_direction_*`. `wind_gusts` est exclu : pas de composante directionnelle,
 * donc traité comme une variable non-vent → éligible au fallback.
 */
export function isWindVariable(variable: string): boolean {
	return variable.startsWith('wind_') && !variable.startsWith('wind_gusts');
}

/**
 * Niveau de vent à afficher en repli quand la variable affichée n'est pas du vent :
 * le niveau de la variable (`…_<N>hPa`) si le vent y est publié, sinon `10m`.
 * Renvoie `null` si le modèle ne publie aucun vent exploitable.
 */
export function deriveDisplayedWindLevel(
	displayedVariable: string,
	modelVariables: Iterable<string>
): string | null {
	const vars = new Set(modelVariables);
	const level = displayedVariable.match(/_(\d+m|\d+hPa)$/)?.[1];
	if (level && vars.has(`wind_u_component_${level}`)) return level;
	if (vars.has('wind_u_component_10m')) return '10m';
	return null;
}
