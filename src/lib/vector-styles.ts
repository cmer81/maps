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
