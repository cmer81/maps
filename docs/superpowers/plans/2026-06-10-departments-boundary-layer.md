# Contours de départements via la couche `boundary` du fond — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'overlay `departements.geojson` (556 KB, source IGN, non-raccord) par un layer `line` lisant la couche `boundary` (`admin_level == 6`) des tuiles OpenFreeMap déjà chargées par le fond.

**Architecture:** `departments-layer.ts` garde son contrat public (`ensureDepartmentsLayer`, `refreshDepartments`) mais lit désormais la source basemap `openmaptiles` / source-layer `boundary` au lieu d'un geojson bundlé. La visibilité est togglée via `setLayoutProperty` (pattern de `labels-layer.ts`). La couleur (thème de fond) est figée à la création et reconstruite par le chemin de re-style existant (`reloadStyles → setStyle` purge puis `ensureDepartmentsLayer()` recrée). Aucun site d'appel ne change.

**Tech Stack:** SvelteKit, MapLibre GL JS, TypeScript, Vitest.

---

## Référence — valeurs réutilisées depuis l'implémentation actuelle

- Couleur sombre : `rgba(255,255,255,0.55)` · claire : `rgba(0,0,0,0.55)`
- `line-width` : `['interpolate', ['linear'], ['zoom'], 4, 0.4, 8, 0.9, 12, 1.4]`
- `line-opacity` : `0.85`
- Source basemap : `'openmaptiles'` · source-layer : `'boundary'` (cf. `minimal-dark.json:617-618`)
- Layer inséré **avant** `BEFORE_LAYER_VECTOR` (constante existante dans `constants.ts`)

---

## Task 1 : Builder pur du layer + tests

**Files:**

- Modify: `src/lib/departments-layer.ts` (réécriture complète)
- Modify: `src/lib/constants.ts` (suppression de `DEPARTMENTS_GEOJSON_URL`)
- Test: `src/lib/tests/departments-layer.test.ts` (créer)

- [ ] **Step 1 : Écrire le test du builder (échoue)**

Créer `src/lib/tests/departments-layer.test.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { showDepartments } from '$lib/stores/departments';
import { map } from '$lib/stores/map';

import {
	DEPARTMENTS_LAYER_ID,
	buildDepartmentsLineLayer,
	ensureDepartmentsLayer,
	refreshDepartments
} from '$lib/departments-layer';

import type maplibregl from 'maplibre-gl';

describe('buildDepartmentsLineLayer', () => {
	it('cible la couche boundary admin_level 6 du fond', () => {
		const layer = buildDepartmentsLineLayer(true, true);
		expect(layer.id).toBe(DEPARTMENTS_LAYER_ID);
		expect(layer.type).toBe('line');
		expect(layer.source).toBe('openmaptiles');
		expect(layer['source-layer']).toBe('boundary');
		expect(layer.filter).toEqual(['==', ['get', 'admin_level'], 6]);
	});

	it('ligne blanche sur fond sombre, noire sur fond clair', () => {
		expect(buildDepartmentsLineLayer(true, true).paint!['line-color']).toBe(
			'rgba(255,255,255,0.55)'
		);
		expect(buildDepartmentsLineLayer(false, true).paint!['line-color']).toBe('rgba(0,0,0,0.55)');
	});

	it('encode la visibilité initiale', () => {
		expect(buildDepartmentsLineLayer(true, true).layout!.visibility).toBe('visible');
		expect(buildDepartmentsLineLayer(true, false).layout!.visibility).toBe('none');
	});
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npx vitest run src/lib/tests/departments-layer.test.ts`
Expected: FAIL — `buildDepartmentsLineLayer`/`DEPARTMENTS_LAYER_ID` non exportés.

- [ ] **Step 3 : Réécrire `src/lib/departments-layer.ts`**

Remplacer **tout** le contenu du fichier par :

```ts
// MapLibre wiring for the French departments contours overlay.
//
// Lit la couche vectorielle `boundary` des tuiles OpenFreeMap déjà chargées par
// le fond (source `openmaptiles`), filtrée sur `admin_level == 6` (départements
// FR). Aucun asset bundlé : les lignes viennent des MÊMES données OSM que le
// fond → raccord topologique parfait. La visibilité suit le store
// `showDepartments` (pattern de `labels-layer.ts`).
import { get } from 'svelte/store';

import { basemapTheme } from '$lib/stores/basemap-theme';
import { showDepartments } from '$lib/stores/departments';
import { map as mStore } from '$lib/stores/map';

import { BEFORE_LAYER_VECTOR } from './constants';

import type maplibregl from 'maplibre-gl';

export const DEPARTMENTS_LAYER_ID = 'omDepartmentsLayer';

const BASEMAP_SOURCE_ID = 'openmaptiles';
const BOUNDARY_SOURCE_LAYER = 'boundary';

/**
 * Spec du layer `line` des départements. Pur (testable) : couleur dépendante du
 * FOND DE CARTE (pas du chrome, toujours sombre), visibilité figée à la création.
 */
export const buildDepartmentsLineLayer = (
	isDark: boolean,
	visible: boolean
): maplibregl.LineLayerSpecification => ({
	id: DEPARTMENTS_LAYER_ID,
	type: 'line',
	source: BASEMAP_SOURCE_ID,
	'source-layer': BOUNDARY_SOURCE_LAYER,
	filter: ['==', ['get', 'admin_level'], 6],
	layout: {
		visibility: visible ? 'visible' : 'none'
	},
	paint: {
		'line-color': isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)',
		'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 8, 0.9, 12, 1.4],
		'line-opacity': 0.85
	}
});

/**
 * Idempotent : enregistre le layer une fois. Sûr à rappeler après un re-style
 * (`setStyle` purge les layers custom ; ce hook les recrée avec la couleur du
 * thème de fond courant).
 */
export const ensureDepartmentsLayer = (): void => {
	const map = get(mStore);
	if (!map) return;
	if (map.getLayer(DEPARTMENTS_LAYER_ID)) return;

	const isDark = get(basemapTheme) === 'dark';
	const layer = buildDepartmentsLineLayer(isDark, get(showDepartments));
	map.addLayer(layer, map.getLayer(BEFORE_LAYER_VECTOR) ? BEFORE_LAYER_VECTOR : undefined);
};

/**
 * Applique la visibilité selon `showDepartments`. Ne fetch plus rien :
 * simple bascule `setLayoutProperty` (défensif si layer absent). Le paramètre
 * optionnel n'existe que pour rendre le `$effect` appelant réactif au store.
 */
export const refreshDepartments = (_deps?: unknown): void => {
	const map = get(mStore);
	if (!map) return;

	ensureDepartmentsLayer();
	if (!map.getLayer(DEPARTMENTS_LAYER_ID)) return;

	map.setLayoutProperty(
		DEPARTMENTS_LAYER_ID,
		'visibility',
		get(showDepartments) ? 'visible' : 'none'
	);
};
```

- [ ] **Step 4 : Supprimer la constante du geojson**

Dans `src/lib/constants.ts`, supprimer les 3 lignes (commentaire + export) :

```ts
// Contours administratifs FR — GeoJSON simplifié (~550 KB / ~80 KB gzip),
// licence ODbL, bundlé depuis `gregoiredavid/france-geojson`.
export const DEPARTMENTS_GEOJSON_URL = '/departements.geojson';
```

- [ ] **Step 5 : Lancer le test, vérifier le succès**

Run: `npx vitest run src/lib/tests/departments-layer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6 : Commit**

```bash
git add src/lib/departments-layer.ts src/lib/constants.ts src/lib/tests/departments-layer.test.ts
git commit -m "refactor(departments): read basemap boundary layer instead of bundled geojson"
```

---

## Task 2 : Tests de câblage (ensure + toggle) sur fausse carte

**Files:**

- Test: `src/lib/tests/departments-layer.test.ts:1` (ajouter des describe)

- [ ] **Step 1 : Ajouter les tests de câblage (échouent si la logique régresse)**

Ajouter à la fin de `src/lib/tests/departments-layer.test.ts` :

```ts
// Fausse carte MapLibre minimale.
function fakeMap(opts: { hasBefore?: boolean } = {}) {
	const added: Array<{ layer: maplibregl.LineLayerSpecification; before?: string }> = [];
	const visibility: Array<string> = [];
	let hasLayer = false;
	return {
		added,
		visibility,
		get hasLayer() {
			return hasLayer;
		},
		getLayer: (id: string) => {
			if (id === 'vector') return opts.hasBefore ? {} : undefined;
			return id === DEPARTMENTS_LAYER_ID && hasLayer ? {} : undefined;
		},
		addLayer: (layer: maplibregl.LineLayerSpecification, before?: string) => {
			added.push({ layer, before });
			hasLayer = true;
		},
		setLayoutProperty: (_id: string, _prop: string, value: string) => {
			visibility.push(value);
		}
	};
}

describe('ensureDepartmentsLayer', () => {
	beforeEach(() => {
		showDepartments.set(true);
		// @ts-expect-error — fausse carte de test
		map.set(undefined);
	});

	it('no-op quand la carte n’est pas prête', () => {
		expect(() => ensureDepartmentsLayer()).not.toThrow();
	});

	it('ajoute le layer une seule fois (idempotent)', () => {
		const m = fakeMap({ hasBefore: true });
		// @ts-expect-error — fausse carte de test
		map.set(m);
		ensureDepartmentsLayer();
		ensureDepartmentsLayer();
		expect(m.added).toHaveLength(1);
		expect(m.added[0].layer.id).toBe(DEPARTMENTS_LAYER_ID);
	});
});

describe('refreshDepartments', () => {
	beforeEach(() => {
		showDepartments.set(true);
		// @ts-expect-error — fausse carte de test
		map.set(undefined);
	});

	it('rend visible quand showDepartments est true', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		refreshDepartments();
		expect(m.visibility.at(-1)).toBe('visible');
	});

	it('masque quand showDepartments est false', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		showDepartments.set(false);
		refreshDepartments();
		expect(m.visibility.at(-1)).toBe('none');
	});
});
```

- [ ] **Step 2 : Lancer les tests, vérifier le succès**

Run: `npx vitest run src/lib/tests/departments-layer.test.ts`
Expected: PASS (tous les describe).

- [ ] **Step 3 : Commit**

```bash
git add src/lib/tests/departments-layer.test.ts
git commit -m "test(departments): cover layer registration and visibility toggle"
```

---

## Task 3 : Supprimer l'asset bundlé

**Files:**

- Delete: `static/departements.geojson`

- [ ] **Step 1 : Vérifier l'absence de toute autre référence**

Run: `grep -rn "departements.geojson\|DEPARTMENTS_GEOJSON" src/ static/ 2>/dev/null`
Expected: aucune sortie.

- [ ] **Step 2 : Supprimer le fichier**

```bash
git rm static/departements.geojson
```

- [ ] **Step 3 : Commit**

```bash
git commit -m "chore(departments): drop bundled 556KB geojson asset"
```

---

## Task 4 : Mettre à jour la doc d'architecture

**Files:**

- Modify: `.claude/rules/architecture.md` (§ _GeoJSON overlays_)

- [ ] **Step 1 : Réécrire le paragraphe § GeoJSON overlays**

Remplacer le bloc actuel :

```markdown
## GeoJSON overlays

`src/lib/departments-layer.ts` (contours des départements français) suit ce pattern : un seul `geojson` source + un layer MapLibre placé sous `BEFORE_LAYER_VECTOR`, togglé par un store persisté (`showDepartments`). Il expose `ensureDepartmentsLayer()` (enregistrement idempotent) et `refreshDepartments()` (mise à jour des données). Réutiliser ce pattern pour tout nouvel overlay (régions, communes, etc.) plutôt que de câbler sources/layers depuis `+page.svelte` directement.

The departments contour file is bundled (`static/departements.geojson`) to avoid CORS issues with third-party CDNs.
```

par :

```markdown
## Overlay départements (couche `boundary` du fond)

`src/lib/departments-layer.ts` (contours des départements français) ne lit plus un geojson bundlé : il style la couche vectorielle `boundary` des tuiles OpenFreeMap déjà chargées par le fond (source `openmaptiles`, source-layer `boundary`), filtrée sur `admin_level == 6`. Les lignes viennent donc des **mêmes données OSM** que le fond → raccord topologique parfait, zéro octet bundlé. Il expose `ensureDepartmentsLayer()` (ajoute le `line` layer une fois, sous `BEFORE_LAYER_VECTOR`, couleur figée selon `basemapTheme`) et `refreshDepartments()` (bascule la `visibility` via `setLayoutProperty` selon le store persisté `showDepartments` — pattern de `labels-layer.ts`). **Piège re-style** : `setStyle` (donc `reloadStyles()`) purge les layers custom → `ensureDepartmentsLayer()` doit être rappelé après chaque re-style (fait dans `reloadStyles()` de `map-controls.ts`) pour recréer le layer avec la couleur du thème courant. `admin_level == 6` n'est pas filtrable par pays (`adm0_l`/`adm0_r` ne sont renseignés que sur l'`admin_level 2`) → les subdivisions niveau-6 des pays voisins s'affichent en lisière, comme le fait déjà le layer `admin_sub` du basemap. Pour un overlay autonome (données hors fond), revenir à un `geojson` source dédié.
```

- [ ] **Step 2 : Commit**

```bash
git add .claude/rules/architecture.md
git commit -m "docs(architecture): departments overlay reads basemap boundary layer"
```

---

## Task 5 : Vérification finale

**Files:** aucun (vérification).

- [ ] **Step 1 : Format + lint + typecheck + tests + build**

```bash
npm run format && npm run lint && npm run check && npm run test -- --run && npm run build
```

Expected: tout passe, aucune erreur, aucune référence résiduelle à `departements.geojson` dans `./build`.

- [ ] **Step 2 : Vérifier l'absence du geojson dans le build**

Run: `find build -name "departements.geojson" 2>/dev/null`
Expected: aucune sortie.

- [ ] **Step 3 : Vérification manuelle (navigateur)**

`npm run dev`, puis dans la carte : activer le toggle « Départements ».
Attendu : contours nets au-dessus du raster météo, alignés avec les frontières du fond, dans les deux thèmes (basculer « Fond de carte sombre »). Le toggle masque/réaffiche sans rechargement réseau.

---

## Self-review (rédacteur du plan)

- **Couverture spec** : suppression geojson+constante+fetch (Task 1, 3) ✓ ; réécriture en layer boundary (Task 1) ✓ ; toggle visibilité façon labels (Task 1) ✓ ; piège re-style préservé (inchangé, vérifié Task 5 step 3 + doc Task 4) ✓ ; doc archi (Task 4) ✓ ; critères de réussite (Task 5) ✓.
- **Sites d'appel** : `ensureDepartmentsLayer()`/`refreshDepartments()` gardent leur signature → `map-controls.ts:146-147` et `+page.svelte:161-162,232` inchangés. `refreshDepartments` passe de `Promise<void>` à `void` ; les appelants ne l'`await` pas (`+page.svelte:232` est dans un `$effect`, `map-controls.ts:147` fire-and-forget) → compatible.
- **Cohérence des noms** : `DEPARTMENTS_LAYER_ID`, `buildDepartmentsLineLayer`, source `openmaptiles`, source-layer `boundary` employés à l'identique entre tasks.
- **Placeholders** : aucun.
