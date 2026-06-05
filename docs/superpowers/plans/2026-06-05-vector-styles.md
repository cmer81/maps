# Vector Styles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Récupérer les parties saines du PR upstream #280 — extraction data-driven des styles vecteur, fade-in synchronisé des couches, et personnalisation utilisateur (contours/flèches) persistée dans le drawer réglages — sans importer l'architecture multi-source.

**Architecture:** Un module pur `vector-styles.ts` (types + defaults + builders d'expressions MapLibre) remplace les expressions hardcodées de `layers.ts`. Le `SlotManager` gagne un commit différé opt-in (`deferCommit`/`commitNow`/`isReady`), et `layers.ts` coordonne les managers actifs pour qu'ils committent ensemble. Deux stores persistés (`contourStyle`, `arrowStyle`) alimentent les builders ; le drawer (`contour-settings.svelte`, `arrows-settings.svelte`) les édite.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, MapLibre GL, `svelte-persisted-store`, Vitest, Tailwind v4 + shadcn-svelte.

**Spec:** `docs/superpowers/specs/2026-06-05-vector-styles-design.md`

**Branche:** `feat/vector-styles` (déjà créée).

---

## File Structure

- **Create** `src/lib/vector-styles.ts` — types `ContourStyle`/`ArrowStyle`, defaults, builders d'expressions. Module pur (aucune dépendance store/runtime).
- **Create** `src/lib/tests/vector-styles.test.ts` — évalue les expressions générées par valeur (mini-évaluateur).
- **Create** `src/lib/stores/vector-styles.ts` — stores persistés `contourStyle` / `arrowStyle`.
- **Modify** `src/lib/layers.ts` — supprime `make*`, branche les builders + stores, ajoute coordinateur de commit + `reloadVectorStyle()`.
- **Modify** `src/lib/slot-manager.ts` — `deferCommit`/`onReady`/`commitNow()`/`isReady()`.
- **Modify** `src/lib/components/settings/contour-settings.svelte` — éditeur de style contours.
- **Modify** `src/lib/components/settings/arrows-settings.svelte` — éditeur de style flèches.

---

## Task 1: Module `vector-styles.ts` + tests

**Files:**

- Create: `src/lib/vector-styles.ts`
- Test: `src/lib/tests/vector-styles.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/tests/vector-styles.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import {
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildContourColorExpr,
	buildContourWidthExpr,
	defaultArrowStyle,
	defaultContourStyle,
	hexToRgbaString,
	parseRgbaOpacity,
	rgbaStringToHex,
	setRgbaOpacity
} from '$lib/vector-styles';

/**
 * Minimal evaluator for the subset of MapLibre expressions our builders emit.
 * `value` is the feature property read by `['get', 'value']`.
 */
function evalExpr(expr: unknown, value: number): unknown {
	if (!Array.isArray(expr)) return expr;
	const [op, ...args] = expr as [string, ...unknown[]];
	switch (op) {
		case 'get':
			return value;
		case 'to-number':
			return Number(evalExpr(args[0], value));
		case 'literal':
			return args[0];
		case '%':
			return (evalExpr(args[0], value) as number) % (evalExpr(args[1], value) as number);
		case '==':
			return evalExpr(args[0], value) === evalExpr(args[1], value);
		case '>':
			return (evalExpr(args[0], value) as number) > (evalExpr(args[1], value) as number);
		case 'boolean':
			return Boolean(evalExpr(args[0], value));
		case 'case': {
			for (let i = 0; i + 1 < args.length; i += 2) {
				if (evalExpr(args[i], value)) return evalExpr(args[i + 1], value);
			}
			return evalExpr(args[args.length - 1], value);
		}
		default:
			throw new Error(`Unsupported op: ${op}`);
	}
}

describe('buildContourColorExpr (default, light)', () => {
	const expr = buildContourColorExpr(defaultContourStyle, false);
	it('×100 → 0.6', () => expect(evalExpr(expr, 100)).toBe('rgba(0,0,0, 0.6)'));
	it('×50 → 0.5', () => expect(evalExpr(expr, 50)).toBe('rgba(0,0,0, 0.5)'));
	it('×10 → 0.4', () => expect(evalExpr(expr, 20)).toBe('rgba(0,0,0, 0.4)'));
	it('other → fallback 0.3', () => expect(evalExpr(expr, 7)).toBe('rgba(0,0,0, 0.3)'));
});

describe('buildContourColorExpr (default, dark)', () => {
	const expr = buildContourColorExpr(defaultContourStyle, true);
	it('×100 → 0.8 white', () => expect(evalExpr(expr, 100)).toBe('rgba(255,255,255, 0.8)'));
	it('other → fallback 0.5 white', () => expect(evalExpr(expr, 7)).toBe('rgba(255,255,255, 0.5)'));
});

describe('buildContourWidthExpr (default)', () => {
	const expr = buildContourWidthExpr(defaultContourStyle);
	it('×100 → 3', () => expect(evalExpr(expr, 100)).toBe(3));
	it('×50 → 2.5', () => expect(evalExpr(expr, 50)).toBe(2.5));
	it('×10 → 2', () => expect(evalExpr(expr, 20)).toBe(2));
	it('other → 1', () => expect(evalExpr(expr, 7)).toBe(1));
});

describe('buildArrowColorExpr (default, light)', () => {
	const expr = buildArrowColorExpr(defaultArrowStyle, false);
	it('≤2 → base 0.2', () => expect(evalExpr(expr, 1)).toBe('rgba(0,0,0, 0.2)'));
	it('>2 → 0.3', () => expect(evalExpr(expr, 2.5)).toBe('rgba(0,0,0, 0.3)'));
	it('>3 → 0.4', () => expect(evalExpr(expr, 3.5)).toBe('rgba(0,0,0, 0.4)'));
	it('>4 → 0.5', () => expect(evalExpr(expr, 4.5)).toBe('rgba(0,0,0, 0.5)'));
	it('>5 → 0.6', () => expect(evalExpr(expr, 7)).toBe('rgba(0,0,0, 0.6)'));
	it('>10 → 0.7', () => expect(evalExpr(expr, 15)).toBe('rgba(0,0,0, 0.7)'));
	it('>20 → still 0.7', () => expect(evalExpr(expr, 25)).toBe('rgba(0,0,0, 0.7)'));
});

describe('buildArrowWidthExpr (default)', () => {
	const expr = buildArrowWidthExpr(defaultArrowStyle);
	it('≤2 → 1.5', () => expect(evalExpr(expr, 1)).toBe(1.5));
	it('>2 → 1.6', () => expect(evalExpr(expr, 2.5)).toBe(1.6));
	it('>3 → 1.8', () => expect(evalExpr(expr, 3.5)).toBe(1.8));
	it('>4 → 1.8 (unchanged)', () => expect(evalExpr(expr, 4.5)).toBe(1.8));
	it('>5 → 2', () => expect(evalExpr(expr, 7)).toBe(2));
	it('>10 → 2.2', () => expect(evalExpr(expr, 15)).toBe(2.2));
	it('>20 → 2.8', () => expect(evalExpr(expr, 25)).toBe(2.8));
});

describe('rgba helpers', () => {
	it('parses opacity', () => expect(parseRgbaOpacity('rgba(0,0,0, 0.4)')).toBe(0.4));
	it('defaults to 1 when no alpha', () => expect(parseRgbaOpacity('rgb(0,0,0)')).toBe(1));
	it('sets opacity', () =>
		expect(setRgbaOpacity('rgba(10, 20, 30, 0.4)', 0.7)).toBe('rgba(10, 20, 30, 0.7)'));
	it('rgba string → hex', () => expect(rgbaStringToHex('rgba(10, 20, 30, 0.4)')).toBe('#0a141e'));
	it('rgba string → hex (no alpha)', () =>
		expect(rgbaStringToHex('rgb(255, 0, 128)')).toBe('#ff0080'));
	it('hex + alpha → rgba string', () =>
		expect(hexToRgbaString('#0a141e', 0.4)).toBe('rgba(10, 20, 30, 0.4)'));
	it('round-trips', () => {
		const hex = rgbaStringToHex('rgba(0,0,0, 0.3)');
		const a = parseRgbaOpacity('rgba(0,0,0, 0.3)');
		expect(hexToRgbaString(hex, a)).toBe('rgba(0, 0, 0, 0.3)');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tests/vector-styles.test.ts`
Expected: FAIL — `Failed to resolve import "$lib/vector-styles"`.

- [ ] **Step 3: Write the module**

`src/lib/vector-styles.ts` :

```ts
/**
 * Styles vecteur data-driven : contours et flèches de vent.
 *
 * Les expressions MapLibre étaient hardcodées dans `layers.ts`. On les exprime
 * ici en données (niveaux) + builders purs, pour pouvoir les personnaliser
 * (cf. stores/vector-styles.ts) sans toucher au moteur de rendu.
 */
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

export function setRgbaOpacity(rgba: string, newOpacity: number): string {
	const parts = rgba.match(/[\d.]+/g);
	if (!parts || parts.length < 3) return rgba;
	return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${newOpacity})`;
}

/** 'rgba(10, 20, 30, 0.4)' → '#0a141e' (hex sans alpha, pour le ColorPicker). */
export function rgbaStringToHex(rgba: string): string {
	const parts = rgba.match(/[\d.]+/g);
	if (!parts || parts.length < 3) return '#000000';
	const [r, g, b] = parts.map(Number);
	return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
}

/** ('#0a141e', 0.4) → 'rgba(10, 20, 30, 0.4)' (pour réécrire dans le style). */
export function hexToRgbaString(hex: string, alpha: number): string {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!m) return `rgba(0, 0, 0, ${alpha})`;
	const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```

> **Note (helpers couleur du fork) :** `$lib/color` expose `rgbaToHex`/`getAlpha`/`hexToRgba` mais ils opèrent sur des **tuples `number[]`**, pas sur des strings CSS. Nos styles stockent des strings `rgba(...)`, d'où ces deux convertisseurs dédiés (l'UI des Tasks 6/7 les utilise, **pas** ceux de `$lib/color`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tests/vector-styles.test.ts`
Expected: PASS (toutes les assertions vertes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vector-styles.ts src/lib/tests/vector-styles.test.ts
git commit -m "feat(vector-styles): module data-driven contours/flèches + tests"
```

---

## Task 2: Brancher les builders dans `layers.ts` (refactor pur)

**Files:**

- Modify: `src/lib/layers.ts:49-121` (supprimer les `make*`), `:188-189`, `:239-240` (usages)

But : remplacer les expressions hardcodées par les builders, **rendu visuellement identique**.

- [ ] **Step 1: Ajouter l'import du module**

Dans `src/lib/layers.ts`, juste après l'import de `slot-manager` (`import { type SlotLayer, SlotManager } from '$lib/slot-manager';`), ajouter :

```ts
import {
	type ArrowStyle,
	type ContourStyle,
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildContourColorExpr,
	buildContourWidthExpr,
	defaultArrowStyle,
	defaultContourStyle
} from '$lib/vector-styles';
```

(L'ordre exact des imports sera normalisé par `npm run format` à la fin.)

- [ ] **Step 2: Supprimer les 4 fonctions `make*` et les remplacer par des accesseurs de style**

Remplacer le bloc `src/lib/layers.ts:49-121` (les définitions `makeArrowColor`, `makeArrowWidth`, `makeContourColor`, `makeContourWidth`) par :

```ts
// Accesseurs de style (Task 5 les fera lire depuis les stores persistés).
const getArrowStyle = (): ArrowStyle => defaultArrowStyle;
const getContourStyle = (): ContourStyle => defaultContourStyle;
```

- [ ] **Step 3: Remplacer les usages dans les factories vecteur**

`src/lib/layers.ts:188-189` (dans `vectorArrowLayer`) :

```ts
						'line-color': buildArrowColorExpr(getArrowStyle(), isDark()),
						'line-width': buildArrowWidthExpr(getArrowStyle())
```

`src/lib/layers.ts:239-240` (dans `vectorContourLayer`) :

```ts
						'line-color': buildContourColorExpr(getContourStyle(), isDark()),
						'line-width': buildContourWidthExpr(getContourStyle())
```

- [ ] **Step 4: Typecheck + tests + lint**

Run: `npm run check && npx vitest run && npm run lint`
Expected: aucun usage résiduel de `makeArrowColor`/`makeContourColor`/etc. ; pas d'erreur de type ; tests verts.
Si `npm run lint` signale un ordre d'imports, lancer `npm run format`.

- [ ] **Step 5: Vérification visuelle**

Run: `npm run dev`
Activer isocontours + flèches de vent, en clair ET en sombre. Le rendu (couleurs, épaisseurs, paliers) doit être **identique** à avant. Tester une variable avec valeurs négatives (températures) — les modulos jouent sur la valeur signée comme avant.

- [ ] **Step 6: Commit**

```bash
git add src/lib/layers.ts
git commit -m "refactor(layers): utilise les builders vector-styles (rendu identique)"
```

---

## Task 3: `deferCommit` sur le SlotManager

**Files:**

- Modify: `src/lib/slot-manager.ts` (options, champ, méthodes, scission `commit`)

- [ ] **Step 1: Étendre `SlotManagerOptions`**

Dans `src/lib/slot-manager.ts`, ajouter ces deux champs à l'interface `SlotManagerOptions` (après `onSlowLoad?`) :

```ts
	/**
	 * Si `true`, le manager ne committe PAS automatiquement quand les tuiles sont
	 * chargées : il appelle `onReady()` et attend un `commitNow()` explicite. Sert
	 * à synchroniser le fade-in de plusieurs managers (cf. layers.ts).
	 */
	deferCommit?: boolean;
	/** Appelé quand les tuiles sont chargées et prêtes à committer (mode `deferCommit`). */
	onReady?: () => void;
```

- [ ] **Step 2: Ajouter le champ d'état**

Après `private slotLayers: Record<Slot, SlotLayer[]> = { A: [], B: [] };` :

```ts
	/** En mode deferCommit, mémorise l'état prêt-à-committer. */
	private deferredCommit: { nextSlot: Slot; previousSlot: Slot | null } | null = null;
```

- [ ] **Step 3: Réinitialiser l'état différé dans `update()`**

Dans `update()`, juste après `this.cleanupListener = null;` (avant le commentaire « Abandon stale pending slot ») :

```ts
this.deferredCommit = null;
```

- [ ] **Step 4: Ajouter les méthodes publiques `commitNow()` / `isReady()`**

Juste après `setBeforeLayer(...)` (avant `update(...)`) :

```ts
	/** Force un commit différé en attente (fade-in synchronisé avec d'autres managers). */
	commitNow(): void {
		if (!this.deferredCommit) return;
		const { nextSlot, previousSlot } = this.deferredCommit;
		this.deferredCommit = null;
		this.executeCommit(nextSlot, previousSlot);
	}

	/** `true` quand les tuiles sont chargées mais le commit est en attente (mode différé). */
	isReady(): boolean {
		return this.deferredCommit !== null;
	}
```

- [ ] **Step 5: Scinder `commit()` en `commit()` + `executeCommit()`**

Remplacer la signature `private commit(nextSlot: Slot, previousSlot: Slot | null): void {` (ligne ~200) et insérer la bascule différée. Concrètement, remplacer :

```ts
	private commit(nextSlot: Slot, previousSlot: Slot | null): void {
		this.activeSlot = nextSlot;
```

par :

```ts
	private commit(nextSlot: Slot, previousSlot: Slot | null): void {
		if (this.opts.deferCommit) {
			this.deferredCommit = { nextSlot, previousSlot };
			this.opts.onReady?.();
			return;
		}
		this.executeCommit(nextSlot, previousSlot);
	}

	private executeCommit(nextSlot: Slot, previousSlot: Slot | null): void {
		this.activeSlot = nextSlot;
```

(Le reste du corps de l'ancien `commit` devient le corps d'`executeCommit`, inchangé.)

- [ ] **Step 6: Typecheck + tests**

Run: `npm run check && npx vitest run`
Expected: aucune erreur. Aucun manager n'utilise encore `deferCommit` → comportement inchangé.

- [ ] **Step 7: Vérification visuelle (non-régression)**

Run: `npm run dev`
Changer de pas de temps : le fade-in mono-couche doit être identique à avant (le mode différé n'est pas encore activé).

- [ ] **Step 8: Commit**

```bash
git add src/lib/slot-manager.ts
git commit -m "feat(slot-manager): commit différé opt-in (deferCommit/commitNow/isReady)"
```

---

## Task 4: Coordinateur de fade-in synchronisé dans `layers.ts`

**Files:**

- Modify: `src/lib/layers.ts` (coordinateur module-level, `createManagers`, `buildRasterManager2`, `addOmFileLayers`, `changeOMfileURL`)

- [ ] **Step 1: Ajouter le coordinateur (haut de la section « Manager instances »)**

Dans `src/lib/layers.ts`, juste avant `export let rasterManager: SlotManager | undefined;` :

```ts
// =============================================================================
// Coordinateur de commit : fade-in synchronisé des couches actives
// =============================================================================

/** Managers dont on attend le commit groupé pour le tick courant. */
let commitGroup: Set<SlotManager> | null = null;

/** Démarre un nouveau groupe : appeler AVANT les `update()` correspondants. */
const beginCommitGroup = (managers: SlotManager[]): void => {
	commitGroup = managers.length > 0 ? new Set(managers) : null;
	if (!commitGroup) loading.set(false);
};

/** Appelé par chaque manager (onReady) : committe tout le groupe quand tous sont prêts. */
const tryFlushGroup = (): void => {
	if (!commitGroup) return;
	const members = [...commitGroup];
	if (members.every((mgr) => mgr.isReady())) {
		for (const mgr of members) mgr.commitNow();
		commitGroup = null;
		loading.set(false);
		refreshPopup();
	}
};

/** Appelé par un manager en erreur : on le retire du groupe pour ne pas bloquer les autres. */
const dropFromGroup = (mgr: SlotManager): void => {
	if (!commitGroup) {
		loading.set(false);
		return;
	}
	commitGroup.delete(mgr);
	if (commitGroup.size === 0) {
		commitGroup = null;
		loading.set(false);
		return;
	}
	tryFlushGroup();
};
```

- [ ] **Step 2: Activer `deferCommit` sur `rasterManager` et `vectorManager` dans `createManagers()`**

Dans `createManagers()`, pour la construction de `rasterManager` : ajouter `deferCommit: true, onReady: tryFlushGroup,` et remplacer le corps de `onCommit`/`onError` pour déléguer au coordinateur. Remplacer le bloc d'options `onCommit`/`onError` de `rasterManager` par :

```ts
		deferCommit: true,
		onReady: tryFlushGroup,
		onCommit: () => slotEvents.dispatchEvent(new Event(SLOT_EVENT_COMMIT)),
		onError: () => {
			dropFromGroup(rasterManager!);
			slotEvents.dispatchEvent(new Event(SLOT_EVENT_ERROR));
		},
```

Pour `vectorManager`, remplacer son `onCommit`/`onError` par :

```ts
		deferCommit: true,
		onReady: tryFlushGroup,
		onCommit: () => slotEvents.dispatchEvent(new Event(SLOT_EVENT_COMMIT)),
		onError: () => {
			dropFromGroup(vectorManager!);
			slotEvents.dispatchEvent(new Event(SLOT_EVENT_ERROR));
		},
```

(Le coordinateur prend désormais en charge `loading.set(false)` + `refreshPopup()` — d'où leur retrait de `onCommit`.)

- [ ] **Step 3: Activer `deferCommit` sur `rasterManager2` dans `buildRasterManager2()`**

Dans `buildRasterManager2()`, remplacer `onCommit: () => refreshPopup(), onError: () => {},` par :

```ts
		deferCommit: true,
		onReady: tryFlushGroup,
		onCommit: () => {},
		onError: () => dropFromGroup(rasterManager2!),
```

- [ ] **Step 4: Réécrire `addOmFileLayers()` pour grouper les couches**

Remplacer entièrement `addOmFileLayers` par :

```ts
export const addOmFileLayers = (): void => {
	const map = get(m);
	if (!map) return;
	const omUrl = getOMUrl();
	createManagers();
	if (!omUrl) return;

	const group: SlotManager[] = [];
	if (rasterManager) group.push(rasterManager);
	if (vectorManager) group.push(vectorManager);

	const windUrl = getWindOverlayUrl();
	let raster2Url: string | undefined;
	if (get(layer2Enabled)) {
		const omUrl2 = getOMUrlFor(get(variable2));
		if (omUrl2) {
			currentOmUrl2.set(omUrl2);
			raster2Url = omUrl2;
			if (rasterManager2) group.push(rasterManager2);
		}
	}

	loading.set(true);
	beginCommitGroup(group);
	rasterManager?.update('om://' + omUrl);
	vectorManager?.update('om://' + (windUrl ?? omUrl));
	if (raster2Url) rasterManager2?.update('om://' + raster2Url);
};
```

- [ ] **Step 5: Réécrire `changeOMfileURL()` pour grouper les couches**

Remplacer entièrement `changeOMfileURL` par :

```ts
export const changeOMfileURL = (vectorOnly = false, rasterOnly = false): void => {
	const map = get(m);
	if (!map) return;

	const omUrl = getOMUrl();
	if (get(currentOmUrl) == omUrl || !omUrl) return;
	currentOmUrl.set(omUrl);

	loading.set(true);

	const preferences = get(p);
	vectorManager?.setBeforeLayer(resolveVectorBeforeLayer(map, preferences.clipWater));
	rasterManager?.setBeforeLayer(preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER);

	const group: SlotManager[] = [];
	let rasterUrl: string | undefined;
	let vectorUrl: string | undefined;
	let raster2Url: string | undefined;

	if (!vectorOnly && rasterManager) {
		rasterUrl = omUrl;
		group.push(rasterManager);
	}
	if (!rasterOnly && vectorManager) {
		const windUrl = getWindOverlayUrl();
		vectorUrl = windUrl ?? omUrl;
		group.push(vectorManager);
	}
	if (!vectorOnly) {
		if (get(layer2Enabled)) {
			if (!rasterManager2) rasterManager2 = buildRasterManager2(map);
			const omUrl2 = getOMUrlFor(get(variable2));
			if (omUrl2 && get(currentOmUrl2) !== omUrl2) {
				currentOmUrl2.set(omUrl2);
				raster2Url = omUrl2;
				if (rasterManager2) group.push(rasterManager2);
			}
		} else {
			rasterManager2?.destroy();
			rasterManager2 = undefined;
			currentOmUrl2.set('');
		}
	}

	beginCommitGroup(group);
	if (rasterUrl) rasterManager?.update('om://' + rasterUrl);
	if (vectorUrl) vectorManager?.update('om://' + vectorUrl);
	if (raster2Url) rasterManager2?.update('om://' + raster2Url);
};
```

- [ ] **Step 6: Typecheck + tests**

Run: `npm run check && npx vitest run`
Expected: aucune erreur.

- [ ] **Step 7: Vérification visuelle (le cœur de la feature)**

Run: `npm run dev`

1. Activer la 2e couche raster (`layer2Enabled`) + les flèches de vent.
2. Changer de pas de temps plusieurs fois.
3. **Attendu :** raster principal, 2e raster et flèches apparaissent **ensemble**, sans clignotement décalé.
4. Tester un domaine où la variable de la 2e couche ou le vent 404 (ex. `arome_france_convection`) : la couche fautive est effacée (`clearOnError`) et les autres committent quand même (pas de blocage en chargement).

- [ ] **Step 8: Commit**

```bash
git add src/lib/layers.ts
git commit -m "feat(layers): fade-in synchronisé des couches actives via deferCommit"
```

---

## Task 5: Stores persistés + `reloadVectorStyle()`

**Files:**

- Create: `src/lib/stores/vector-styles.ts`
- Modify: `src/lib/layers.ts` (`getArrowStyle`/`getContourStyle` lisent les stores ; ajouter `reloadVectorStyle`)

- [ ] **Step 1: Créer les stores persistés**

`src/lib/stores/vector-styles.ts` :

```ts
import { persisted } from 'svelte-persisted-store';

import {
	type ArrowStyle,
	type ContourStyle,
	defaultArrowStyle,
	defaultContourStyle
} from '$lib/vector-styles';

/** Style des isolignes, persisté. */
export const contourStyle = persisted<ContourStyle>('contour-style', defaultContourStyle);

/** Style des flèches de vent, persisté. */
export const arrowStyle = persisted<ArrowStyle>('arrow-style', defaultArrowStyle);
```

- [ ] **Step 2: Faire lire les stores aux accesseurs de `layers.ts`**

Ajouter l'import en tête de `src/lib/layers.ts` (groupe `$lib/stores`) :

```ts
import { arrowStyle, contourStyle } from '$lib/stores/vector-styles';
```

Remplacer les accesseurs introduits en Task 2 par :

```ts
const getArrowStyle = (): ArrowStyle => get(arrowStyle);
const getContourStyle = (): ContourStyle => get(contourStyle);
```

(Les imports `defaultArrowStyle`/`defaultContourStyle` dans `layers.ts` ne sont plus utilisés directement par les accesseurs — les retirer de l'import de `$lib/vector-styles` s'ils ne servent nulle part ailleurs dans le fichier ; `npm run lint` le signalera.)

- [ ] **Step 3: Ajouter `reloadVectorStyle()`**

À la fin de la section « Public layer API » de `src/lib/layers.ts` (après `changeOMfileURL`) :

```ts
/**
 * Réapplique le style vecteur courant en reconstruisant les couches vecteur en
 * place (le layerFactory relit `getContourStyle()`/`getArrowStyle()`). Utilisé
 * par le drawer réglages quand l'utilisateur édite un style. Tuiles en cache →
 * coût réseau quasi nul ; fade-in via le commit différé.
 */
export const reloadVectorStyle = (): void => {
	const url = vectorManager?.getActiveSourceUrl();
	if (!url || !vectorManager) return;
	loading.set(true);
	beginCommitGroup([vectorManager]);
	vectorManager.update(url);
};
```

- [ ] **Step 4: Typecheck + tests + lint**

Run: `npm run check && npx vitest run && npm run lint`
Expected: aucune erreur. (`npm run format` si l'ordre d'imports est signalé.)

- [ ] **Step 5: Vérification manuelle via la console**

Run: `npm run dev`
Activer les isocontours. Dans la console du navigateur, modifier le store et vérifier le re-rendu :

```js
localStorage.setItem(
	'contour-style',
	JSON.stringify({
		levels: [
			{
				modulo: 0,
				label: 'x',
				lightColor: 'rgba(255,0,0,1)',
				darkColor: 'rgba(255,0,0,1)',
				width: 1
			}
		]
	})
);
```

puis recharger → les isolignes « autres » doivent être rouges. Remettre `localStorage.removeItem('contour-style')` ensuite.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/vector-styles.ts src/lib/layers.ts
git commit -m "feat(vector-styles): stores persistés + reloadVectorStyle"
```

---

## Task 6: UI — éditeur de style dans `contour-settings.svelte`

**Files:**

- Modify: `src/lib/components/settings/contour-settings.svelte`

- [ ] **Step 1: Ajouter les imports et l'état d'édition**

Dans le `<script lang="ts">` de `contour-settings.svelte`, ajouter aux imports existants :

```ts
import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';

import { contourStyle } from '$lib/stores/vector-styles';

import ColorPicker from '$lib/components/scale/color-picker.svelte';

import { reloadVectorStyle } from '$lib/layers';
import {
	defaultContourStyle,
	hexToRgbaString,
	parseRgbaOpacity,
	rgbaStringToHex
} from '$lib/vector-styles';
```

Puis l'état et les handlers (après `handleContourIntervalChange`) :

```ts
let editing: { index: number; field: 'lightColor' | 'darkColor' } | null = $state(null);

function setColor(index: number, field: 'lightColor' | 'darkColor', hex: string, alpha: number) {
	contourStyle.update((s) => ({
		...s,
		levels: s.levels.map((l, i) =>
			i === index ? { ...l, [field]: hexToRgbaString(hex, alpha) } : l
		)
	}));
	reloadVectorStyle();
}

function setWidth(index: number, width: number) {
	contourStyle.update((s) => ({
		...s,
		levels: s.levels.map((l, i) => (i === index ? { ...l, width } : l))
	}));
	reloadVectorStyle();
}

function resetContourStyle() {
	contourStyle.set(structuredClone(defaultContourStyle));
	reloadVectorStyle();
}
```

- [ ] **Step 2: Ajouter le bloc d'édition dans le template**

Dans `{#if contours}`, à l'intérieur du `<div class="mt-1 flex flex-col gap-2 pl-1">`, **après** le bloc `{#if !breakpoints} … {/if}`, insérer :

```svelte
<div class="mt-2 flex flex-col gap-1.5 border-t border-white/10 pt-2">
	<div class="flex items-center justify-between">
		<span class="text-xs text-white/70">Style des isolignes</span>
		<button
			type="button"
			class="flex cursor-pointer items-center gap-1 text-xs text-white/50 hover:text-white/80"
			onclick={resetContourStyle}
		>
			<RotateCcwIcon class="size-3" /> Réinitialiser
		</button>
	</div>
	{#each $contourStyle.levels as level, i (level.label)}
		<div class="flex items-center gap-2">
			<span class="w-10 shrink-0 text-xs text-white/60">{level.label}</span>
			<div class="relative">
				<button
					type="button"
					aria-label={`Couleur (clair) ${level.label}`}
					class="size-5 cursor-pointer rounded border border-white/20"
					style="background: {level.lightColor};"
					onclick={() => (editing = { index: i, field: 'lightColor' })}
				></button>
				{#if editing?.index === i && editing.field === 'lightColor'}
					<ColorPicker
						color={rgbaStringToHex(level.lightColor)}
						alpha={parseRgbaOpacity(level.lightColor)}
						onchange={(hex, alpha) => setColor(i, 'lightColor', hex, alpha)}
						onclose={() => (editing = null)}
					/>
				{/if}
			</div>
			<div class="relative">
				<button
					type="button"
					aria-label={`Couleur (sombre) ${level.label}`}
					class="size-5 cursor-pointer rounded border border-white/20"
					style="background: {level.darkColor};"
					onclick={() => (editing = { index: i, field: 'darkColor' })}
				></button>
				{#if editing?.index === i && editing.field === 'darkColor'}
					<ColorPicker
						color={rgbaStringToHex(level.darkColor)}
						alpha={parseRgbaOpacity(level.darkColor)}
						onchange={(hex, alpha) => setColor(i, 'darkColor', hex, alpha)}
						onclose={() => (editing = null)}
					/>
				{/if}
			</div>
			<Input
				class="h-7 w-16 shrink-0 bg-background/60"
				type="number"
				step="0.5"
				min="0"
				value={level.width}
				onchange={(e) => setWidth(i, Number(e.currentTarget.value))}
				aria-label={`Largeur ${level.label}`}
			/>
		</div>
	{/each}
</div>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run check && npm run lint`
Expected: aucune erreur. (`getAlpha`/`hexToRgba`/`rgbaToHex` existent dans `$lib/color` — déjà utilisés par `scale.svelte`.)

- [ ] **Step 4: Vérification visuelle**

Run: `npm run dev`
Ouvrir le drawer → Isocontours actifs. Pour chaque palier : changer la couleur (clair) → les isolignes se mettent à jour immédiatement ; changer la largeur → idem. Recharger la page : les styles persistent. « Réinitialiser » revient aux valeurs d'origine.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/settings/contour-settings.svelte
git commit -m "feat(settings): éditeur de style des isocontours dans le drawer"
```

---

## Task 7: UI — éditeur de style dans `arrows-settings.svelte`

**Files:**

- Modify: `src/lib/components/settings/arrows-settings.svelte`

- [ ] **Step 1: Ajouter imports + état d'édition**

Dans le `<script lang="ts">` de `arrows-settings.svelte`, ajouter aux imports :

```ts
import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';

import { arrowStyle } from '$lib/stores/vector-styles';

import ColorPicker from '$lib/components/scale/color-picker.svelte';
import { Input } from '$lib/components/ui/input';

import { reloadVectorStyle } from '$lib/layers';
import {
	defaultArrowStyle,
	hexToRgbaString,
	parseRgbaOpacity,
	rgbaStringToHex
} from '$lib/vector-styles';
```

Puis (après `onLevel`) :

```ts
let editing: { index: number; field: 'lightColor' | 'darkColor' } | null = $state(null);

function setColor(index: number, field: 'lightColor' | 'darkColor', hex: string, alpha: number) {
	arrowStyle.update((s) => ({
		...s,
		levels: s.levels.map((l, i) =>
			i === index ? { ...l, [field]: hexToRgbaString(hex, alpha) } : l
		)
	}));
	reloadVectorStyle();
}

function setWidth(index: number, width: number) {
	arrowStyle.update((s) => ({
		...s,
		levels: s.levels.map((l, i) => (i === index ? { ...l, width } : l))
	}));
	reloadVectorStyle();
}

function resetArrowStyle() {
	arrowStyle.set(structuredClone(defaultArrowStyle));
	reloadVectorStyle();
}
```

- [ ] **Step 2: Ajouter le bloc d'édition dans le template**

Dans le `{:else if arrows}`, **après** le `<div class="mt-1 flex items-center gap-3 pl-1"> … </div>` (sélecteur de niveau), insérer :

```svelte
<div class="mt-2 flex flex-col gap-1.5 border-t border-white/10 pt-2 pl-1">
	<div class="flex items-center justify-between">
		<span class="text-xs text-white/70">Style des flèches</span>
		<button
			type="button"
			class="flex cursor-pointer items-center gap-1 text-xs text-white/50 hover:text-white/80"
			onclick={resetArrowStyle}
		>
			<RotateCcwIcon class="size-3" /> Réinitialiser
		</button>
	</div>
	{#each $arrowStyle.levels as level, i (level.label)}
		<div class="flex items-center gap-2">
			<span class="w-10 shrink-0 text-xs text-white/60">{level.label}</span>
			<div class="relative">
				<button
					type="button"
					aria-label={`Couleur (clair) ${level.label}`}
					class="size-5 cursor-pointer rounded border border-white/20"
					style="background: {level.lightColor};"
					onclick={() => (editing = { index: i, field: 'lightColor' })}
				></button>
				{#if editing?.index === i && editing.field === 'lightColor'}
					<ColorPicker
						color={rgbaToHex(level.lightColor)}
						alpha={getAlpha(level.lightColor)}
						onchange={(hex, alpha) => setColor(i, 'lightColor', hex, alpha)}
						onclose={() => (editing = null)}
					/>
				{/if}
			</div>
			<div class="relative">
				<button
					type="button"
					aria-label={`Couleur (sombre) ${level.label}`}
					class="size-5 cursor-pointer rounded border border-white/20"
					style="background: {level.darkColor};"
					onclick={() => (editing = { index: i, field: 'darkColor' })}
				></button>
				{#if editing?.index === i && editing.field === 'darkColor'}
					<ColorPicker
						color={rgbaToHex(level.darkColor)}
						alpha={getAlpha(level.darkColor)}
						onchange={(hex, alpha) => setColor(i, 'darkColor', hex, alpha)}
						onclose={() => (editing = null)}
					/>
				{/if}
			</div>
			<Input
				class="h-7 w-16 shrink-0 bg-background/60"
				type="number"
				step="0.1"
				min="0"
				value={level.width}
				onchange={(e) => setWidth(i, Number(e.currentTarget.value))}
				aria-label={`Largeur ${level.label}`}
			/>
		</div>
	{/each}
</div>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run check && npm run lint`
Expected: aucune erreur.

- [ ] **Step 4: Vérification visuelle**

Run: `npm run dev`
Drawer → Flèches de vent actives. Éditer couleur/largeur d'un palier → mise à jour immédiate des flèches. Recharger → persistance OK. « Réinitialiser » → valeurs d'origine.

- [ ] **Step 5: Vérification finale globale**

Run: `npm run check && npx vitest run && npm run lint && npm run build`
Expected: tout vert. Tester en clair + sombre, et avec layer2 + vent actifs simultanément (fade-in synchronisé + styles persistés).

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/settings/arrows-settings.svelte
git commit -m "feat(settings): éditeur de style des flèches de vent dans le drawer"
```

---

## Self-review (rempli par l'auteur du plan)

- **Couverture spec :** Composant 1 (extraction) → Tasks 1-2 ; Composant 2 (deferCommit + coordinateur) → Tasks 3-4 ; Composant 3 (stores + UI) → Tasks 5-7. Tests → Task 1. Ordre de migration spec → ordre des tasks. ✓
- **Cohérence des noms :** `getArrowStyle`/`getContourStyle` (Tasks 2,5), `reloadVectorStyle` (Tasks 5,6,7), `beginCommitGroup`/`tryFlushGroup`/`dropFromGroup`/`commitGroup` (Task 4), `contourStyle`/`arrowStyle` (Tasks 5,6,7), `commitNow`/`isReady`/`deferCommit`/`onReady` (Tasks 3,4). Cohérents. ✓
- **Pas de placeholder :** chaque step de code montre le code complet. ✓
- **Risque connu :** si un manager du groupe n'émet ni `onReady` ni `onError` (échec d'`addSource` → early-return de `update()`, cas rare), le groupe peut rester non flushé et `loading` bloqué — comportement déjà présent aujourd'hui sur ce chemin, non régressé. Si observé en pratique, ajouter un timeout de sécurité dans `beginCommitGroup`.

```

```
