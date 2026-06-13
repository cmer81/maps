# Cadrage d'export confiné à la zone visible — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confiner le cadre d'export 4:3/3:4 à la zone carte au-dessus de la barre du temps, pour que tout l'extérieur soit grisé et que le PNG corresponde exactement au cadre.

**Architecture:** `computeCaptureRect` est appelé avec la hauteur disponible (`viewportH - bottomChromeHeight`) au lieu de la pleine hauteur. Un nouveau helper pur `computeSourceCrop` met à l'échelle le rectangle CSS vers les px du canvas ; `png-export` recadre ce rectangle au lieu de recalculer le ratio (suppression de la duplication). Le paramètre `format` de `captureWatermarkedPng` est remplacé par une région.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Vitest, Tailwind v4, MapLibre GL.

**Spec de référence :** `docs/superpowers/specs/2026-06-13-export-cadrage-zone-visible-design.md`

---

## File Structure

- **Modify** `src/lib/capture-geometry.ts` — ajoute `computeSourceCrop` + type `SourceCrop`. `computeCaptureRect` inchangé.
- **Modify** `src/lib/tests/capture-geometry.test.ts` — tests de `computeSourceCrop`.
- **Modify** `src/lib/png-export.ts` — `captureWatermarkedPng` prend une `PngCaptureRegion` ; suppression de `PngExportFormat`.
- **Modify** `src/lib/components/capture/capture-flow.svelte` — construit et passe la région.
- **Modify** `src/routes/+page.svelte` — cadre + détection clic calés sur la hauteur disponible.

**Ordre d'exécution** (pour revenir au vert au plus tôt) : geometry → png-export (casse temporairement le type dans capture-flow) → capture-flow (re-vert) → +page.

---

## Task 1: Helper `computeSourceCrop` (pur)

**Files:**

- Modify: `src/lib/capture-geometry.ts`
- Test: `src/lib/tests/capture-geometry.test.ts`

- [ ] **Step 1: Ajouter le test qui échoue**

Ajouter ce bloc à la fin de `src/lib/tests/capture-geometry.test.ts` (et compléter l'import existant pour qu'il devienne `import { computeCaptureRect, computeSourceCrop } from '$lib/capture-geometry';`) :

```ts
describe('computeSourceCrop', () => {
	it('dpr=1 → identité (canvas = viewport)', () => {
		const c = computeSourceCrop({ x: 100, y: 50, w: 400, h: 300 }, 1000, 800, 1000, 800);
		expect(c).toEqual({ sx: 100, sy: 50, sw: 400, sh: 300 });
	});

	it('dpr=2 → doublement des coordonnées', () => {
		const c = computeSourceCrop({ x: 100, y: 50, w: 400, h: 300 }, 1000, 800, 2000, 1600);
		expect(c).toEqual({ sx: 200, sy: 100, sw: 800, sh: 600 });
	});

	it('rectangle décalé, échelles X/Y distinctes', () => {
		const c = computeSourceCrop({ x: 10, y: 20, w: 100, h: 200 }, 500, 1000, 1000, 3000);
		// scaleX = 2, scaleY = 3
		expect(c).toEqual({ sx: 20, sy: 60, sw: 200, sh: 600 });
	});

	it('arrondit au pixel entier', () => {
		const c = computeSourceCrop({ x: 10.4, y: 10.6, w: 100.5, h: 100.4 }, 1000, 1000, 1000, 1000);
		expect(c).toEqual({ sx: 10, sy: 11, sw: 101, sh: 100 });
	});
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npx vitest run src/lib/tests/capture-geometry.test.ts`
Expected: FAIL — `computeSourceCrop` n'est pas exporté.

- [ ] **Step 3: Implémenter**

Ajouter à la fin de `src/lib/capture-geometry.ts` :

```ts
export interface SourceCrop {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
}

/**
 * Met à l'échelle un rectangle exprimé en px CSS du viewport vers les px du
 * canvas source (qui couvre tout le viewport). Coordonnées arrondies pour un
 * découpage pixel entier via `drawImage`.
 */
export function computeSourceCrop(
	rect: { x: number; y: number; w: number; h: number },
	viewportW: number,
	viewportH: number,
	sourceW: number,
	sourceH: number
): SourceCrop {
	const scaleX = sourceW / viewportW;
	const scaleY = sourceH / viewportH;
	return {
		sx: Math.round(rect.x * scaleX),
		sy: Math.round(rect.y * scaleY),
		sw: Math.round(rect.w * scaleX),
		sh: Math.round(rect.h * scaleY)
	};
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `npx vitest run src/lib/tests/capture-geometry.test.ts`
Expected: PASS (5 anciens + 4 nouveaux = 9 tests).

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/lib/capture-geometry.ts src/lib/tests/capture-geometry.test.ts
git commit -m "feat(capture): helper pur computeSourceCrop (rect CSS → px canvas)"
```

---

## Task 2: `png-export.ts` prend une région

**Files:**

- Modify: `src/lib/png-export.ts`

Pas de test unitaire (canvas réel). Cohérence par construction + vérif manuelle.

- [ ] **Step 1: Importer le helper**

En tête de `src/lib/png-export.ts`, après l'import de type MapLibre, ajouter :

```ts
import { computeSourceCrop } from '$lib/capture-geometry';
```

- [ ] **Step 2: Supprimer le type `PngExportFormat`**

Supprimer entièrement la ligne :

```ts
export type PngExportFormat = 'current-view' | 'social';
```

- [ ] **Step 3: Ajouter le type de région et réécrire `captureWatermarkedPng`**

Remplacer TOUTE la fonction `captureWatermarkedPng` (de `export const captureWatermarkedPng` jusqu'à son `}` final) par :

```ts
export interface PngCaptureRegion {
	/** px CSS dans le repère viewport (origine en haut à gauche) */
	x: number;
	y: number;
	w: number;
	h: number;
	orientation: 'landscape' | 'portrait';
	/** dimensions CSS du viewport — le canvas MapLibre les couvre entièrement */
	viewportW: number;
	viewportH: number;
}

export const captureWatermarkedPng = async (
	map: MaplibreMap,
	details: PngWatermarkDetails,
	region: PngCaptureRegion
): Promise<Blob> => {
	const source = map.getCanvas();
	const { sx, sy, sw, sh } = computeSourceCrop(
		region,
		region.viewportW,
		region.viewportH,
		source.width,
		source.height
	);

	const landscape = region.orientation === 'landscape';
	const canvas = document.createElement('canvas');
	canvas.width = landscape ? 1440 : 1080;
	canvas.height = landscape ? 1080 : 1440;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D canvas context unavailable');
	ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
	drawWatermark(ctx, canvas.width, canvas.height, {
		...details,
		logo: await loadInfoclimatLogo()
	});
	return blobFromCanvas(canvas, 'image/png');
};
```

- [ ] **Step 4: Vérifier qu'il ne reste aucune référence à `PngExportFormat`/`'social'`/`'current-view'` dans png-export.ts**

Run: `grep -nE "PngExportFormat|'social'|'current-view'" src/lib/png-export.ts`
Expected: aucun résultat.

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected : 1 erreur ATTENDUE dans `capture-flow.svelte` (il passe encore `'social'`, incompatible avec `PngCaptureRegion`) — corrigée en Task 3. Aucune autre erreur, et aucune dans `png-export.ts`.

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/lib/png-export.ts
git commit -m "refactor(capture): captureWatermarkedPng recadre une région (plus de format)"
```

---

## Task 3: `capture-flow.svelte` construit la région

**Files:**

- Modify: `src/lib/components/capture/capture-flow.svelte`

État actuel : ligne 2 `import { get } from 'svelte/store';`, ligne 8 `import { exportFrameVisible } from '$lib/stores/preferences';`, `computeCaptureRect` déjà importé depuis `$lib/capture-geometry`. Le bloc de capture appelle `captureWatermarkedPng(map, details, 'social')` puis calcule `orientation` via `computeCaptureRect(window.innerWidth, window.innerHeight).orientation`.

- [ ] **Step 1: Importer `bottomChromeHeight`**

Remplacer l'import des préférences :

```ts
import { exportFrameVisible } from '$lib/stores/preferences';
```

par :

```ts
import { bottomChromeHeight, exportFrameVisible } from '$lib/stores/preferences';
```

- [ ] **Step 2: Construire la région et le nom de fichier à partir d'un seul `rect`**

Remplacer le bloc :

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

par :

```ts
const details = buildWatermarkDetails(run, currentTime, 0, 1, domainLabel, variableLabel);
const rect = computeCaptureRect(window.innerWidth, window.innerHeight - get(bottomChromeHeight));
const blob = await captureWatermarkedPng(map, details, {
	...rect,
	viewportW: window.innerWidth,
	viewportH: window.innerHeight
});
playShutter();

const filename =
	[
		'infoclimat',
		sanitizeFilenamePart(domainValue),
		sanitizeFilenamePart(variableValue),
		formatUtcStamp(run),
		formatLeadTimeForFilename(run, currentTime),
		formatISOWithoutTimezone(currentTime),
		rect.orientation === 'landscape' ? 'paysage' : 'portrait'
	].join('_') + '.png';
```

- [ ] **Step 3: Typecheck + lint + tests**

Run: `npm run check && npm run lint && npm run test -- --run`
Expected : `check` 0 erreur (l'erreur `'social'` a disparu), `lint` propre, tous les tests verts.

- [ ] **Step 4: Commit**

```bash
npm run format
git add src/lib/components/capture/capture-flow.svelte
git commit -m "feat(capture): capture-flow passe la région calée sur la zone visible"
```

---

## Task 4: `+page.svelte` cale le cadre sur la hauteur disponible

**Files:**

- Modify: `src/routes/+page.svelte`

État actuel : `bottomChromeHeight` et `get` sont déjà importés. La ligne `const captureRect = $derived(computeCaptureRect(viewportW, viewportH));` existe, et le `handleClick` calcule `computeCaptureRect(window.innerWidth, window.innerHeight)`.

- [ ] **Step 1: Caler le `$derived` sur la hauteur disponible**

Remplacer :

```ts
const captureRect = $derived(computeCaptureRect(viewportW, viewportH));
```

par :

```ts
const captureRect = $derived(computeCaptureRect(viewportW, viewportH - $bottomChromeHeight));
```

- [ ] **Step 2: Caler la détection de clic sur la même hauteur**

Dans `handleClick`, remplacer :

```ts
const r = computeCaptureRect(window.innerWidth, window.innerHeight);
```

par :

```ts
const r = computeCaptureRect(window.innerWidth, window.innerHeight - get(bottomChromeHeight));
```

(Le markup de l'overlay reste inchangé : les bandes sont déjà dérivées de `captureRect`.)

- [ ] **Step 3: Typecheck + lint + tests**

Run: `npm run check && npm run lint && npm run test -- --run`
Expected : tout vert, 0 erreur, 0 warning.

- [ ] **Step 4: Commit**

```bash
npm run format
git add src/routes/+page.svelte
git commit -m "fix(capture): cadre d'export calé sur la zone carte visible (bas grisé)"
```

---

## Task 5: Vérification manuelle

Pas de commit. Validation visuelle.

- [ ] **Step 1: Lancer le dev server** — `npm run dev`

- [ ] **Step 2: Desktop large (paysage)**
- Ouvrir le cadre → le rectangle 4:3 est centré dans la zone **au-dessus** de la barre du temps.
- **Plus aucune bande claire en bas** : tout l'extérieur du cadre est grisé uniformément ; la barre du temps n'est pas assombrie.
- Capturer → le PNG (1440×1080) correspond exactement au rectangle cadré (il n'inclut plus la bande derrière la barre du temps), filigrane en bas.
- Cliquer hors du cadre → fermeture.

- [ ] **Step 3: Mobile portrait (devtools responsive, ex. 390×844)**
- Cadre 3:4 centré dans la zone visible, bandes haut/bas/côtés cohérentes.
- PNG 1080×1440 = cadre.

---

## Self-Review

- **Spec coverage :** hauteur de cadrage = `vh - bottomChromeHeight` (Task 4 + Task 3) ✅ ; `computeSourceCrop` pur + testé (Task 1) ✅ ; `png-export` prend une région, `PngExportFormat`/`'social'`/`'current-view'` retirés (Task 2) ✅ ; crop = rectangle cadré, sorties 1440×1080 / 1080×1440 (Task 2) ✅ ; markup overlay inchangé (Task 4) ✅ ; suffixe fichier conservé (Task 3) ✅ ; top bar hors périmètre (non touchée) ✅.
- **Placeholders :** aucun — code complet à chaque step.
- **Cohérence des types :** `computeSourceCrop(rect, viewportW, viewportH, sourceW, sourceH)` (Task 1) appelé avec ces arguments en Task 2 ; `PngCaptureRegion` (Task 2) construit en Task 3 via `{ ...rect, viewportW, viewportH }` où `rect` provient de `computeCaptureRect` (`{ x, y, w, h, orientation }`) → satisfait `PngCaptureRegion`. ✅
