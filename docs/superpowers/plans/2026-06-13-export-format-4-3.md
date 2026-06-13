# Export PNG format 4:3 adaptatif — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'export PNG carré 1080×1080 par un format 4:3 adaptatif au viewport (paysage 1440×1080 / portrait 1080×1440).

**Architecture:** Un helper pur `computeCaptureRect(vw, vh)` devient la source de vérité unique de la géométrie du cadre. Il pilote l'overlay de cadrage et la détection de clic dans `+page.svelte`. Le recadrage du canvas dans `png-export.ts` applique la même règle (plus grand rectangle de ratio centré), donc le PNG correspond pixel-près à la zone cadrée par construction.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Vitest, Tailwind v4, MapLibre GL.

**Spec de référence :** `docs/superpowers/specs/2026-06-13-export-format-4-3-design.md`

---

## File Structure

- **Create** `src/lib/capture-geometry.ts` — helper pur `computeCaptureRect` + types. Une seule responsabilité : la géométrie du rectangle de capture.
- **Create** `src/lib/tests/capture-geometry.test.ts` — tests unitaires du helper.
- **Modify** `src/lib/png-export.ts` — format `'square'` → `'social'` (crop 4:3/3:4 adaptatif).
- **Modify** `src/routes/+page.svelte` — overlay + détection clic pilotés par le helper.
- **Modify** `src/lib/components/capture/capture-flow.svelte` — passe `'social'`, suffixe de fichier `paysage`/`portrait`.

---

## Task 1: Helper de géométrie `computeCaptureRect`

**Files:**

- Create: `src/lib/capture-geometry.ts`
- Test: `src/lib/tests/capture-geometry.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/tests/capture-geometry.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { computeCaptureRect } from '$lib/capture-geometry';

describe('computeCaptureRect', () => {
	it('écran large → paysage 4:3 borné par la hauteur, centré horizontalement', () => {
		const r = computeCaptureRect(1600, 900);
		expect(r.orientation).toBe('landscape');
		expect(r.w).toBeCloseTo(1200, 5); // 900 * 4/3
		expect(r.h).toBeCloseTo(900, 5);
		expect(r.x).toBeCloseTo(200, 5); // (1600 - 1200) / 2
		expect(r.y).toBeCloseTo(0, 5);
	});

	it('paysage peu large → 4:3 borné par la largeur, centré verticalement', () => {
		const r = computeCaptureRect(1000, 900);
		expect(r.orientation).toBe('landscape');
		expect(r.w).toBeCloseTo(1000, 5);
		expect(r.h).toBeCloseTo(750, 5); // 1000 / (4/3)
		expect(r.x).toBeCloseTo(0, 5);
		expect(r.y).toBeCloseTo(75, 5); // (900 - 750) / 2
	});

	it('écran haut → portrait 3:4 borné par la largeur, centré verticalement', () => {
		const r = computeCaptureRect(400, 800);
		expect(r.orientation).toBe('portrait');
		expect(r.w).toBeCloseTo(400, 5);
		expect(r.h).toBeCloseTo(533.333, 2); // 400 / (3/4)
		expect(r.x).toBeCloseTo(0, 5);
		expect(r.y).toBeCloseTo(133.333, 2); // (800 - 533.33) / 2
	});

	it('viewport carré → paysage borné par la largeur', () => {
		const r = computeCaptureRect(500, 500);
		expect(r.orientation).toBe('landscape');
		expect(r.w).toBeCloseTo(500, 5);
		expect(r.h).toBeCloseTo(375, 5); // 500 / (4/3)
		expect(r.y).toBeCloseTo(62.5, 5);
	});

	it('rectangle toujours centré dans le viewport', () => {
		const r = computeCaptureRect(1280, 720);
		expect(r.x + r.w / 2).toBeCloseTo(640, 5);
		expect(r.y + r.h / 2).toBeCloseTo(360, 5);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tests/capture-geometry.test.ts`
Expected: FAIL — `Failed to resolve import "$lib/capture-geometry"` / `computeCaptureRect is not a function`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/capture-geometry.ts` :

```ts
export type CaptureOrientation = 'landscape' | 'portrait';

export interface CaptureRect {
	/** px depuis le bord gauche du viewport */
	x: number;
	/** px depuis le haut du viewport */
	y: number;
	w: number;
	h: number;
	orientation: CaptureOrientation;
}

const LANDSCAPE_RATIO = 4 / 3; // largeur / hauteur
const PORTRAIT_RATIO = 3 / 4;

/**
 * Plus grand rectangle de ratio 4:3 (viewport paysage) ou 3:4 (viewport
 * portrait) centré dans `vw × vh`. Source de vérité unique de la zone de
 * capture, partagée par l'overlay de cadrage et la détection de clic.
 */
export function computeCaptureRect(vw: number, vh: number): CaptureRect {
	const orientation: CaptureOrientation = vw >= vh ? 'landscape' : 'portrait';
	const targetRatio = orientation === 'landscape' ? LANDSCAPE_RATIO : PORTRAIT_RATIO;

	let w: number;
	let h: number;
	if (vw / vh > targetRatio) {
		// viewport plus large que le ratio cible → borné par la hauteur
		h = vh;
		w = vh * targetRatio;
	} else {
		// borné par la largeur
		w = vw;
		h = vw / targetRatio;
	}

	return { x: (vw - w) / 2, y: (vh - h) / 2, w, h, orientation };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tests/capture-geometry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/capture-geometry.ts src/lib/tests/capture-geometry.test.ts
git commit -m "feat(capture): helper pur computeCaptureRect (zone 4:3/3:4)"
```

---

## Task 2: Crop 4:3/3:4 dans `png-export.ts`

Pas de test unitaire automatisé (recadrage canvas → nécessite un canvas réel). Vérification : cohérence par construction avec `computeCaptureRect` + check manuel en Task 5.

**Files:**

- Modify: `src/lib/png-export.ts:25` (type) et `:220-254` (fonction `captureWatermarkedPng`)

- [ ] **Step 1: Remplacer le type de format**

Dans `src/lib/png-export.ts`, remplacer :

```ts
export type PngExportFormat = 'current-view' | 'square';
```

par :

```ts
export type PngExportFormat = 'current-view' | 'social';
```

- [ ] **Step 2: Réécrire le corps de `captureWatermarkedPng`**

Remplacer toute la fonction `captureWatermarkedPng` (de `export const captureWatermarkedPng` jusqu'à son `}` final, lignes ~220-254) par :

```ts
export const captureWatermarkedPng = async (
	map: MaplibreMap,
	details: PngWatermarkDetails,
	format: PngExportFormat = 'current-view'
): Promise<Blob> => {
	const source = map.getCanvas();
	const sourceWidth = source.width;
	const sourceHeight = source.height;

	const canvas = document.createElement('canvas');

	if (format === 'social') {
		// Plus grand rectangle 4:3 (paysage) / 3:4 (portrait) centré dans le
		// canvas source — même règle que computeCaptureRect côté overlay, donc
		// le PNG correspond à la zone cadrée.
		const landscape = sourceWidth >= sourceHeight;
		const targetRatio = landscape ? 4 / 3 : 3 / 4;

		let cropW: number;
		let cropH: number;
		if (sourceWidth / sourceHeight > targetRatio) {
			cropH = sourceHeight;
			cropW = Math.round(cropH * targetRatio);
		} else {
			cropW = sourceWidth;
			cropH = Math.round(cropW / targetRatio);
		}
		const sx = Math.round((sourceWidth - cropW) / 2);
		const sy = Math.round((sourceHeight - cropH) / 2);

		canvas.width = landscape ? 1440 : 1080;
		canvas.height = landscape ? 1080 : 1440;

		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2D canvas context unavailable');
		ctx.drawImage(source, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
		drawWatermark(ctx, canvas.width, canvas.height, {
			...details,
			logo: await loadInfoclimatLogo()
		});
		return blobFromCanvas(canvas, 'image/png');
	}

	canvas.width = sourceWidth;
	canvas.height = sourceHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D canvas context unavailable');
	ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
	drawWatermark(ctx, canvas.width, canvas.height, {
		...details,
		logo: await loadInfoclimatLogo()
	});
	return blobFromCanvas(canvas, 'image/png');
};
```

- [ ] **Step 3: Vérifier qu'aucune autre référence à `'square'` ne subsiste**

Run: `grep -rn "'square'" src` (hors fichiers de test)
Expected: aucun résultat (sinon, mettre à jour l'appelant — voir Task 4).

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: 0 erreur (le seul appelant `capture-flow.svelte` sera corrigé en Task 4 ; s'il signale `'square'` n'est plus assignable, c'est attendu et corrigé là).

> Note : `npm run check` peut signaler l'erreur de type dans `capture-flow.svelte` tant que Task 4 n'est pas faite. C'est attendu. On committe quand même cette tâche (le module `png-export` est cohérent isolément), Task 4 suit immédiatement.

- [ ] **Step 5: Commit**

```bash
git add src/lib/png-export.ts
git commit -m "feat(capture): format export 'social' 4:3/3:4 adaptatif"
```

---

## Task 3: Overlay + détection de clic dans `+page.svelte`

**Files:**

- Modify: `src/routes/+page.svelte` — imports, état viewport, `$effect` de clic (`:252-272`), bloc overlay (`:295-352`)

- [ ] **Step 1: Importer le helper**

Ajouter dans la zone d'imports `$lib` de `src/routes/+page.svelte` (l'ordre exact sera corrigé par `npm run format`) :

```ts
import { computeCaptureRect } from '$lib/capture-geometry';
```

- [ ] **Step 2: Binder les dimensions du viewport et dériver le rectangle**

Dans le bloc `<script>`, après les déclarations d'état existantes, ajouter :

```ts
let viewportW = $state(0);
let viewportH = $state(0);
const captureRect = $derived(computeCaptureRect(viewportW, viewportH));
```

Et juste après la balise ouvrante du markup (avant `<svelte:head>`), ajouter le binding fenêtre :

```svelte
<svelte:window bind:innerWidth={viewportW} bind:innerHeight={viewportH} />
```

- [ ] **Step 3: Réécrire la détection de clic hors-cadre**

Remplacer le corps du `handleClick` dans le `$effect` (`+page.svelte:255-267`) par :

```ts
const handleClick = (e: maplibregl.MapMouseEvent) => {
	if (!get(exportFrameVisible)) return;
	const r = computeCaptureRect(window.innerWidth, window.innerHeight);
	const { x, y } = e.point;
	const inside = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
	if (!inside) exportFrameVisible.set(false);
};
```

- [ ] **Step 4: Réécrire le bloc overlay**

Remplacer entièrement le contenu interne du `{#if $exportFrameVisible}` (le wrapper `<div class="pointer-events-none ...">` et ses enfants, `+page.svelte:307-351`) par :

```svelte
<div
	class="pointer-events-none fixed inset-x-0 top-0 z-50 overflow-hidden"
	style="bottom: {$bottomChromeHeight}px"
	aria-hidden="true"
>
	<!-- Bande au-dessus du cadre -->
	<div class="absolute inset-x-0 top-0 bg-black/24" style="height: {captureRect.y}px"></div>
	<!-- Bande sous le cadre -->
	<div
		class="absolute inset-x-0 bottom-0 bg-black/24"
		style="top: {captureRect.y + captureRect.h}px"
	></div>
	<!-- Bande à gauche -->
	<div
		class="absolute left-0 bg-black/24"
		style="top: {captureRect.y}px; height: {captureRect.h}px; width: {captureRect.x}px"
	></div>
	<!-- Bande à droite -->
	<div
		class="absolute right-0 bg-black/24"
		style="top: {captureRect.y}px; height: {captureRect.h}px; width: {captureRect.x}px"
	></div>

	<!-- Le cadre : visuel uniquement -->
	<div
		class="absolute border-2 border-white/95 shadow-[0_0_18px_rgba(0,0,0,0.45)]"
		style="left: {captureRect.x}px; top: {captureRect.y}px; width: {captureRect.w}px; height: {captureRect.h}px"
	>
		<div class="absolute inset-0 border border-black/60"></div>
		<div
			class="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-xs font-bold text-white shadow"
		>
			PNG 4:3
		</div>
		<!-- Bande recouverte par le filigrane Infoclimat dans le PNG final
		     (~13 % en paysage 1440×1080, ~8 % en portrait 1080×1440). -->
		<div
			class="absolute inset-x-0 bottom-0 flex items-center justify-center border-t border-white/60 bg-black/45 text-[10px] font-semibold uppercase tracking-wide text-white/80"
			style="height: {captureRect.orientation === 'landscape' ? 13 : 8}%"
		>
			filigrane
		</div>
	</div>
</div>
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run check && npm run format`
Expected: `check` 0 erreur (hors `capture-flow.svelte` si Task 4 pas encore faite), `format` réécrit l'ordre des imports.

- [ ] **Step 6: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(capture): cadre d'export 4:3/3:4 piloté par computeCaptureRect"
```

---

## Task 4: Brancher `capture-flow.svelte`

**Files:**

- Modify: `src/lib/components/capture/capture-flow.svelte:65` (appel), `:68-77` (nom de fichier), imports

- [ ] **Step 1: Importer le helper**

Ajouter dans les imports `$lib` de `capture-flow.svelte` :

```ts
import { computeCaptureRect } from '$lib/capture-geometry';
```

- [ ] **Step 2: Calculer l'orientation et passer le format `'social'`**

Dans la fonction `capture`, remplacer le bloc qui construit `details`, `blob` et `filename` (`capture-flow.svelte:64-77`) par :

```ts
const details = buildWatermarkDetails(run, currentTime, 0, 1, domainLabel, variableLabel);
const blob = await captureWatermarkedPng(map, details, 'social');
playShutter();

const orientation = computeCaptureRect(window.innerWidth, window.innerHeight).orientation;
const filename =
	[
		'infoclimat',
		sanitizeFilenamePart(domainValue),
		sanitizeFilenamePart(variableValue),
		formatUtcStamp(run),
		formatLeadTimeForFilename(run, currentTime),
		formatISOWithoutTimezone(currentTime),
		orientation === 'landscape' ? 'paysage' : 'portrait'
	].join('_') + '.png';
```

- [ ] **Step 3: Typecheck + lint + tests complets**

Run: `npm run check && npm run lint && npm run test -- --run`
Expected: tout passe, plus aucune erreur de type sur `'square'`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/capture/capture-flow.svelte
git commit -m "feat(capture): capture-flow exporte en 4:3 (suffixe paysage/portrait)"
```

---

## Task 5: Vérification manuelle (WYSIWYG)

Pas de commit. Validation visuelle que la zone cadrée = le PNG produit.

- [ ] **Step 1: Lancer le dev server**

Run: `npm run dev`

- [ ] **Step 2: Desktop large (paysage)**

- Cliquer sur le bouton capture → le cadre apparaît en rectangle **4:3 paysage** centré.
- Cliquer à nouveau → le PNG téléchargé fait **1440×1080**, son contenu correspond à la zone cadrée (filigrane Infoclimat en bas), nom de fichier `…_paysage.png`.
- Cliquer hors du cadre (zone sombre) → le cadre se ferme.

- [ ] **Step 3: Mobile portrait (devtools responsive, ex. 390×844)**

- Ouvrir le cadre → rectangle **3:4 portrait** centré qui remplit la largeur.
- Capturer → PNG **1080×1440**, nom `…_portrait.png`.

- [ ] **Step 4: Vérifier l'absence de régression du carré**

- Confirmer qu'aucune option « carré » ne subsiste dans l'UI et qu'aucun export 1080×1080 n'est produit.

---

## Self-Review

- **Spec coverage :** ratio 4:3 (Task 1/2), adaptatif paysage/portrait (Task 1/2/3), résolutions 1440×1080 & 1080×1440 (Task 2), carré supprimé (Task 2 type + Task 4 + Task 5 step 4), helper partagé pilotant overlay + clic (Task 1/3), crop cohérent par construction (Task 2), suffixe fichier (Task 4), `'current-view'` conservé (Task 2). ✅
- **Placeholders :** aucun — chaque step montre le code complet. ✅
- **Cohérence des types :** `CaptureRect`/`CaptureOrientation`/`computeCaptureRect` définis en Task 1 et réutilisés tels quels en Task 3/4 ; `PngExportFormat = 'current-view' | 'social'` (Task 2) et l'appel `'social'` (Task 4) concordent. ✅
- **Hors périmètre** (spinner, dé-persistance `exportFrameVisible`, Échap, son) volontairement non traités, conformément à la spec. ✅
