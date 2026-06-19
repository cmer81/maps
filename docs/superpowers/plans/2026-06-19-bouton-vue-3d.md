# Bouton « Vue 3D » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un bouton « 3D » unique qui, en un clic, oriente la caméra en perspective **et** relève le relief terrain (et rétablit la vue à plat au re-clic), accessible desktop et mobile.

**Architecture:** Un nouveau module `src/lib/view-3d.ts` expose un handler pur testable `applyView3D(on)` (oriente `pitch` + bascule `setTerrain` + synchronise `preferences.terrain`/URL) et un init-on-load `restoreView3DFromPrefs()`. Un `IControl` MapLibre custom (`View3DControl`) câblé dans `map-controls.ts` déclenche le handler et reflète l'état partagé. Le câblage hillshade/terrain existant n'est pas touché (option A du spec).

**Tech Stack:** SvelteKit, MapLibre GL JS, svelte stores (`svelte-persisted-store`), Vitest (env node, sans DOM).

## Global Constraints

- **Préset additif (option A)** : ne pas démonter le `TerrainControl` natif ni le toggle « Relief ombré ». Réutiliser l'état partagé `preferences.terrain` + `updateUrl('terrain', …)`.
- **Angle/exagération en constantes ajustables** : `VIEW_3D_PITCH = 60`, `VIEW_3D_EXAGGERATION = 1.4`.
- **Le bearing n'est jamais modifié** — seuls `pitch` et le relief sont orchestrés.
- **Source terrain** : réutiliser `'terrainSource2'` (déjà ajoutée au `load` dans `+page.svelte`).
- **Conventions** : Svelte 5 runes ; imports auto-triés (`npm run format`, ne pas ordonner à la main) ; tests uniquement dans `src/lib/tests/**`, env node → pas de DOM dans les tests (mock map façon `labels-layer.test.ts`). Les éditions de fichiers `.svelte` passent par l'agent `svelte-file-editor` (cf. CLAUDE.md), validées par `svelte-autofixer`.
- **Titre de PR sémantique** : `feat:`.

---

### Task 1: Handler `applyView3D` + constantes

**Files:**
- Modify: `src/lib/constants.ts` (après le bloc `DEFAULT_PREFERENCES`, ~ligne 83)
- Create: `src/lib/view-3d.ts`
- Test: `src/lib/tests/view-3d.test.ts`

**Interfaces:**
- Consumes: store `map` (`$lib/stores/map`), `preferences` + `defaultPreferences` + `url` (`$lib/stores/preferences`), `updateUrl(urlParam?, newValue?, defaultValue?)` (`$lib/url`).
- Produces: `VIEW_3D_PITCH: number`, `VIEW_3D_EXAGGERATION: number` (constants) ; `applyView3D(on: boolean): void` (`$lib/view-3d`).

- [ ] **Step 1: Ajouter les constantes**

Dans `src/lib/constants.ts`, juste après la fermeture de `DEFAULT_PREFERENCES` (ligne ~83) :

```ts
// Vue 3D (bouton preset) — angle caméra + exagération du relief, ajustables.
export const VIEW_3D_PITCH = 60;
export const VIEW_3D_EXAGGERATION = 1.4;
```

- [ ] **Step 2: Écrire le test qui échoue**

Créer `src/lib/tests/view-3d.test.ts` :

```ts
import { get } from 'svelte/store';

import { beforeEach, describe, expect, it } from 'vitest';

import { map } from '$lib/stores/map';
import { defaultPreferences, preferences, url as urlStore } from '$lib/stores/preferences';

import { VIEW_3D_EXAGGERATION, VIEW_3D_PITCH } from '$lib/constants';
import { applyView3D } from '$lib/view-3d';

// Fausse carte MapLibre minimale : enregistre les appels caméra/terrain.
function fakeMap() {
	const calls: { ease: unknown[]; terrain: unknown[] } = { ease: [], terrain: [] };
	return {
		calls,
		easeTo: (opts: unknown) => calls.ease.push(opts),
		setTerrain: (opts: unknown) => calls.terrain.push(opts)
	};
}

describe('applyView3D', () => {
	beforeEach(() => {
		preferences.set({ ...defaultPreferences });
		urlStore.set(new URL('http://localhost/'));
		// @ts-expect-error — fausse carte de test
		map.set(undefined);
	});

	it('no-op quand la carte n’est pas prête', () => {
		expect(() => applyView3D(true)).not.toThrow();
	});

	it('active la vue 3D : incline + relève le relief + flippe la préférence', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		applyView3D(true);
		expect(m.calls.ease).toEqual([{ pitch: VIEW_3D_PITCH }]);
		expect(m.calls.terrain).toEqual([
			{ source: 'terrainSource2', exaggeration: VIEW_3D_EXAGGERATION }
		]);
		expect(get(preferences).terrain).toBe(true);
		// searchParams.set s'exécute avant le `await tick()` interne → lisible aussitôt.
		expect(get(urlStore).searchParams.get('terrain')).toBe('true');
	});

	it('désactive la vue 3D : remet à plat + retire le relief', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		preferences.set({ ...defaultPreferences, terrain: true });
		applyView3D(false);
		expect(m.calls.ease).toEqual([{ pitch: 0 }]);
		expect(m.calls.terrain).toEqual([null]);
		expect(get(preferences).terrain).toBe(false);
		// 'false' == défaut → le param est retiré de l'URL.
		expect(get(urlStore).searchParams.get('terrain')).toBeNull();
	});
});
```

- [ ] **Step 3: Lancer le test, vérifier l'échec**

Run: `npx vitest run src/lib/tests/view-3d.test.ts`
Expected: FAIL (`Failed to resolve import "$lib/view-3d"` / `applyView3D is not a function`)

- [ ] **Step 4: Implémenter `applyView3D`**

Créer `src/lib/view-3d.ts` :

```ts
import { get } from 'svelte/store';

import { map as mapStore } from '$lib/stores/map';
import { defaultPreferences, preferences } from '$lib/stores/preferences';

import { VIEW_3D_EXAGGERATION, VIEW_3D_PITCH } from '$lib/constants';

import { updateUrl } from './url';

const TERRAIN_SOURCE = 'terrainSource2';

/**
 * Préset de vue 3D : oriente la caméra en perspective + relève le relief, ou
 * rétablit la vue à plat. Réutilise l'état partagé `preferences.terrain` + l'URL
 * (mêmes clés que `terrainHandler`), donc pas de désynchro avec le TerrainControl
 * natif. Le bearing n'est jamais modifié.
 */
export function applyView3D(on: boolean): void {
	const m = get(mapStore);
	if (!m) return;
	if (on) {
		m.easeTo({ pitch: VIEW_3D_PITCH });
		m.setTerrain({ source: TERRAIN_SOURCE, exaggeration: VIEW_3D_EXAGGERATION });
	} else {
		m.easeTo({ pitch: 0 });
		m.setTerrain(null);
	}
	preferences.update((p) => ({ ...p, terrain: on }));
	updateUrl('terrain', String(on), String(defaultPreferences.terrain));
}
```

- [ ] **Step 5: Lancer le test, vérifier le succès**

Run: `npx vitest run src/lib/tests/view-3d.test.ts`
Expected: PASS (4 assertions)

- [ ] **Step 6: Lint/format + commit**

```bash
npm run format
git add src/lib/constants.ts src/lib/view-3d.ts src/lib/tests/view-3d.test.ts
git commit -m "feat: handler applyView3D (preset pitch + relief) + constantes"
```

---

### Task 2: Restauration du relief au chargement (lien partagé)

**Files:**
- Modify: `src/lib/view-3d.ts` (ajout d'une fonction)
- Modify: `src/routes/+page.svelte` (handler `$map.on('load')`, après `addTerrainSource($map, 'terrainSource2')`, ~ligne 163)
- Test: `src/lib/tests/view-3d.test.ts` (ajout d'un `describe`)

**Interfaces:**
- Consumes: store `map`, `preferences`, constantes `VIEW_3D_EXAGGERATION`.
- Produces: `restoreView3DFromPrefs(): void` (`$lib/view-3d`).

**Contexte :** le `pitch` est restauré par le hash MapLibre (`hash: true`), mais le mesh terrain ne l'est pas — charger `?terrain=true` hydrate la préférence sans rappeler `setTerrain()`. Un lien 3D arriverait donc « incliné mais plat ». Cette tâche réapplique le relief au `load`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `src/lib/tests/view-3d.test.ts` :

```ts
import { restoreView3DFromPrefs } from '$lib/view-3d';

describe('restoreView3DFromPrefs', () => {
	beforeEach(() => {
		preferences.set({ ...defaultPreferences });
		// @ts-expect-error — fausse carte de test
		map.set(undefined);
	});

	it('ne touche pas au relief si la préférence est false', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		restoreView3DFromPrefs();
		expect(m.calls.terrain).toEqual([]);
	});

	it('réapplique le relief si la préférence est true (lien partagé)', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		preferences.set({ ...defaultPreferences, terrain: true });
		restoreView3DFromPrefs();
		expect(m.calls.terrain).toEqual([
			{ source: 'terrainSource2', exaggeration: VIEW_3D_EXAGGERATION }
		]);
	});
});
```

Déplacer l'import `restoreView3DFromPrefs` dans l'import existant `from '$lib/view-3d'` en haut du fichier (ne pas dupliquer la ligne d'import — `npm run format` la regroupera de toute façon).

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npx vitest run src/lib/tests/view-3d.test.ts`
Expected: FAIL (`restoreView3DFromPrefs is not a function`)

- [ ] **Step 3: Implémenter `restoreView3DFromPrefs`**

Ajouter dans `src/lib/view-3d.ts`, sous `applyView3D` :

```ts
/**
 * Init-on-load : le hash MapLibre restaure le pitch mais pas le mesh terrain.
 * Si la préférence terrain est active (lien partagé `?terrain=true`), réapplique
 * le relief. Idempotent vis-à-vis du TerrainControl natif.
 */
export function restoreView3DFromPrefs(): void {
	const m = get(mapStore);
	if (!m || !get(preferences).terrain) return;
	m.setTerrain({ source: TERRAIN_SOURCE, exaggeration: VIEW_3D_EXAGGERATION });
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `npx vitest run src/lib/tests/view-3d.test.ts`
Expected: PASS (6 assertions au total)

- [ ] **Step 5: Câbler dans `+page.svelte` (via svelte-file-editor)**

Dans `src/routes/+page.svelte`, handler `$map.on('load', …)`, juste après `addTerrainSource($map, 'terrainSource2');` (ligne ~163) et avant `initHillshadeFromPrefs();` :

```ts
restoreView3DFromPrefs();
```

Ajouter l'import en tête de `<script>` (l'auto-tri le placera dans le groupe `$lib` ; ne pas ordonner à la main) :

```ts
import { restoreView3DFromPrefs } from '$lib/view-3d';
```

- [ ] **Step 6: Typecheck + lint/format + commit**

```bash
npm run check
npm run format
git add src/lib/view-3d.ts src/lib/tests/view-3d.test.ts src/routes/+page.svelte
git commit -m "feat: restaure le relief 3D au load pour les liens partagés"
```

---

### Task 3: `View3DControl` (IControl) + style + câblage

**Files:**
- Modify: `src/lib/view-3d.ts` (ajout de la classe `View3DControl`)
- Modify: `src/lib/map-controls.ts` (`setMapControlSettings`, après l'ajout du `GlobeControl`, ~ligne 56)
- Modify: `src/styles.css` (règles du bouton)

**Interfaces:**
- Consumes: `applyView3D`, store `preferences`, `maplibregl.IControl`.
- Produces: `class View3DControl implements maplibregl.IControl` (`$lib/view-3d`).

**Note testabilité :** la classe manipule le DOM (`document.createElement`) — non couverte par les tests node (env sans DOM, cf. `tests.md`). La logique testée est dans `applyView3D` (Task 1) ; cette tâche se vérifie manuellement dans le navigateur.

- [ ] **Step 1: Implémenter `View3DControl`**

Ajouter en tête de `src/lib/view-3d.ts` l'import du type, et la classe en fin de fichier :

```ts
import type { IControl, Map as MaplibreMap } from 'maplibre-gl';
```

```ts
/**
 * Bouton IControl « 3D » : un clic bascule le préset (applyView3D). La classe
 * active reflète `preferences.terrain` — y compris quand l'état change via le
 * TerrainControl natif (abonnement au store).
 */
export class View3DControl implements IControl {
	private container: HTMLElement | undefined;
	private unsubscribe: (() => void) | undefined;

	onAdd(_map: MaplibreMap): HTMLElement {
		const container = document.createElement('div');
		container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

		const button = document.createElement('button');
		button.type = 'button';
		button.title = 'Vue 3D (relief incliné)';
		button.setAttribute('aria-label', 'Vue 3D (relief incliné)');
		button.className = 'maplibregl-ctrl-view3d';
		button.innerHTML = '<span aria-hidden="true">3D</span>';
		button.addEventListener('click', () => applyView3D(!get(preferences).terrain));
		container.appendChild(button);

		this.unsubscribe = preferences.subscribe((p) =>
			button.classList.toggle('maplibregl-ctrl-view3d--active', p.terrain)
		);

		this.container = container;
		return container;
	}

	onRemove(): void {
		this.unsubscribe?.();
		this.container?.parentNode?.removeChild(this.container);
		this.container = undefined;
		this.unsubscribe = undefined;
	}
}
```

- [ ] **Step 2: Câbler dans `map-controls.ts`**

Importer la classe (en tête, l'auto-tri la placera dans le groupe relatif `./view-3d`) :

```ts
import { View3DControl } from './view-3d';
```

Dans `setMapControlSettings`, juste après le bloc `GlobeControl` (après la ligne `globeControl._globeButton.addEventListener(...)`, ~ligne 56) :

```ts
	map.addControl(new View3DControl());
```

- [ ] **Step 3: Style du bouton**

Ajouter à la fin de `src/styles.css` :

```css
/* Bouton « 3D » (IControl custom) — texte centré dans le carré 29px MapLibre. */
.maplibregl-ctrl-view3d {
	font-weight: 700;
	font-size: 12px;
	line-height: 1;
}
.maplibregl-ctrl-view3d--active {
	color: #1d4ed8;
}
```

- [ ] **Step 4: Vérifier la build/typecheck**

Run: `npm run check`
Expected: PASS (aucune erreur de type)

- [ ] **Step 5: Vérification manuelle (navigateur)**

```bash
npm run dev
```
Ouvrir `http://localhost:5173/`. Attendu :
1. Un bouton « 3D » apparaît dans la pile de contrôles haut-droite, sous le globe.
2. Clic → la carte s'incline (perspective ~60°) **et** le relief se lève ; le bouton passe en état actif (bleu).
3. Re-clic → retour à plat, relief retiré, bouton inactif.
4. Recharger avec `?terrain=true` dans l'URL → la carte arrive avec le relief levé (pitch restauré par le hash s'il est présent).
5. Activer le relief via le bouton 3D puis ouvrir le toggle « Relief ombré » : les états restent cohérents (pas de double application visible).

- [ ] **Step 6: Lint/format + commit**

```bash
npm run lint
npm run format
git add src/lib/view-3d.ts src/lib/map-controls.ts src/styles.css
git commit -m "feat: bouton IControl Vue 3D + style"
```

---

## Self-Review

**Spec coverage :**
- Comportement clic on/off (pitch + setTerrain + préférence/URL) → Task 1 (`applyView3D`) + Task 3 (bouton).
- Bearing non touché → Task 1 (handler n'écrit pas le bearing).
- État actif piloté par `preferences.terrain` → Task 3 (abonnement store).
- Constantes ajustables `VIEW_3D_PITCH`/`VIEW_3D_EXAGGERATION` → Task 1.
- Cohabitation option A (TerrainControl/hillshade inchangés) → aucune modif de `hillshade.ts` ; réutilisation de `terrainSource2` + `preferences.terrain`/`updateUrl`.
- Placement IControl sous le globe → Task 3 (ordre dans `setMapControlSettings`).
- Fix restauration `?terrain=true` au load → Task 2 (`restoreView3DFromPrefs`).
- Mobile (bouton visible, pas de geste réactivé) → Task 3 (IControl standard, aucune modif de `touchZoomRotate`).
- Tests Vitest de `applyView3D` (on/off) → Task 1 ; de `restoreView3DFromPrefs` → Task 2.

**Placeholder scan :** aucun TBD/TODO ; tout le code des steps est complet.

**Type consistency :** `applyView3D(on: boolean)`, `restoreView3DFromPrefs()`, `View3DControl` (constante `TERRAIN_SOURCE = 'terrainSource2'`, `VIEW_3D_PITCH`/`VIEW_3D_EXAGGERATION`) sont nommés de façon identique entre tâches et tests.
