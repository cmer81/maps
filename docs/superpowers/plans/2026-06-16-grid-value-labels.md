# Calque « Valeurs aux points de grille » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher la valeur numérique du modèle à chaque point de grille, superposée à la carte façon Météociel, via un toggle indépendant et une décimation par zoom.

**Architecture:** Un nouveau `symbol` layer s'accroche à la source-layer `'grid'` **déjà émise** par `@openmeteo/weather-map-layer` (chaque point porte `properties.value`). Il rejoint la liste de couches du `vectorManager` existant. La densité est gérée par un filtre MapLibre `['step', ['zoom'], …]` sur l'`id` du point (`id = j·nx + i`), avec un stride calculé par domaine pour viser un espacement écran ~constant ; la collision MapLibre élague le résidu. Aucune requête réseau ni dépendance nouvelle.

**Tech Stack:** SvelteKit (Svelte 5 runes), MapLibre GL JS, `@openmeteo/weather-map-layer`, `svelte-persisted-store`, Vitest. Préférences : tabs, single quotes, pas de trailing comma, 100 col ; imports auto-triés (`npm run format`).

---

## Spec de référence

`docs/superpowers/specs/2026-06-16-grid-value-labels-design.md`

## Structure des fichiers

| Fichier                                            | Responsabilité                                                    | Action                |
| -------------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| `src/lib/stores/vector.ts`                         | Store persisté `gridValues`                                       | Modifier              |
| `src/lib/constants.ts`                             | Défaut URL `grid_values`                                          | Modifier              |
| `src/lib/url.ts`                                   | Hydratation param + `grid` OR dans `getOMUrlFor`                  | Modifier              |
| `src/lib/vector-styles.ts`                         | Builders purs : stride, filtre décimation, label entier           | Modifier              |
| `src/lib/layers.ts`                                | `SlotLayer` valeurs + helper géométrie + ajout au `vectorManager` | Modifier              |
| `src/lib/components/settings/grid-settings.svelte` | 2ᵉ switch « Valeurs aux points »                                  | Modifier              |
| `src/lib/tests/vector-styles.test.ts`              | Tests des builders purs                                           | Modifier              |
| `src/lib/tests/url-builder.test.ts`                | Test `grid` OR dans l'URL                                         | Modifier (si présent) |

---

## Task 1 : Store `gridValues` + défaut URL

**Files:**

- Modify: `src/lib/stores/vector.ts`
- Modify: `src/lib/constants.ts:119-131` (`COMPLETE_DEFAULT_VALUES`)

- [ ] **Step 1 : Ajouter le store persisté**

Dans `src/lib/stores/vector.ts`, après la ligne `export const windOverlayLevel = persisted('windOverlayLevel', '10m');` :

```ts
/** Calque « valeurs aux points de grille » (façon Météociel). Indépendant du
 *  toggle `vectorOptions.grid` (points orange) : les deux sont orthogonaux. */
export const gridValues = persisted('gridValues', false);
```

- [ ] **Step 2 : Déclarer le défaut URL**

Dans `src/lib/constants.ts`, ajouter une entrée dans l'objet `COMPLETE_DEFAULT_VALUES` (à côté de `wind_overlay: 'false'`) :

```ts
	grid_values: 'false',
```

- [ ] **Step 3 : Vérifier le typecheck**

Run: `npm run check`
Expected: PASS (aucune erreur de type ; le store est juste déclaré).

- [ ] **Step 4 : Commit**

```bash
git add src/lib/stores/vector.ts src/lib/constants.ts
git commit -m "feat(grid-values): store persisté gridValues + défaut URL"
```

---

## Task 2 : Builders purs (stride, filtre décimation, label entier)

**Files:**

- Modify: `src/lib/vector-styles.ts`
- Test: `src/lib/tests/vector-styles.test.ts`

Ces fonctions sont **pures** (aucune dépendance MapLibre runtime) → testables en env node.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `src/lib/tests/vector-styles.test.ts`, ajouter aux imports existants :

```ts
import {
	GRID_VALUE_TARGET_PX,
	buildGridDecimationFilter,
	buildGridValueLabelExpr,
	computeStride,
	pxPerDegLon
} from '$lib/vector-styles';
```

Puis, à la fin du fichier, ajouter un évaluateur de filtre dédié + les suites :

```ts
/** Évaluateur minimal du sous-ensemble d'expressions émis par le filtre de
 *  décimation. `ctx` fournit `id` (id du point) et `zoom` (niveau MapLibre). */
function evalFilter(expr: unknown, ctx: { id: number; zoom: number }): unknown {
	if (!Array.isArray(expr)) return expr;
	const [op, ...args] = expr as [string, ...unknown[]];
	switch (op) {
		case 'id':
			return ctx.id;
		case 'zoom':
			return ctx.zoom;
		case '%':
			return (evalFilter(args[0], ctx) as number) % (evalFilter(args[1], ctx) as number);
		case '/':
			return (evalFilter(args[0], ctx) as number) / (evalFilter(args[1], ctx) as number);
		case 'floor':
			return Math.floor(evalFilter(args[0], ctx) as number);
		case '==':
			return evalFilter(args[0], ctx) === evalFilter(args[1], ctx);
		case 'all':
			return args.every((a) => Boolean(evalFilter(a, ctx)));
		case 'step': {
			const input = evalFilter(args[0], ctx) as number;
			let result = args[1];
			for (let i = 2; i + 1 < args.length; i += 2) {
				if (input >= (args[i] as number)) result = args[i + 1];
				else break;
			}
			return evalFilter(result, ctx);
		}
		default:
			throw new Error(`Unsupported filter op: ${op}`);
	}
}

describe('computeStride', () => {
	it('grille fine (0,025°) très dézoomée → stride élevé', () => {
		// z=2 : pxPerDegLon ≈ 5,69 ; pas écran ≈ 0,142 px ; cible 48 px → ~338.
		const stride = computeStride(0.025, pxPerDegLon(2), 48);
		expect(stride).toBeGreaterThan(100);
	});
	it('grille fine (0,025°) fortement zoomée → stride 1', () => {
		// z=12 : pas écran ≈ 145 px > cible → on garde tous les nœuds.
		expect(computeStride(0.025, pxPerDegLon(12), 48)).toBe(1);
	});
	it('grille 0,25° au zoom 5 → ~4', () => {
		// pxPerDegLon(5) ≈ 45,5 ; pas écran ≈ 11,4 px ; 48/11,4 ≈ 4,2 → 4.
		expect(computeStride(0.25, pxPerDegLon(5), 48)).toBe(4);
	});
	it('jamais inférieur à 1', () => {
		expect(computeStride(10, pxPerDegLon(12), 48)).toBe(1);
	});
});

describe('buildGridValueLabelExpr', () => {
	const units = {
		temperature: '°C',
		precipitation: 'mm',
		windSpeed: 'km/h',
		distance: 'm',
		geopotential: 'gpm'
	} as const;

	it('°C → °C (identité) → arrondi entier via to-string/round', () => {
		const expr = buildGridValueLabelExpr('temperature_2m', '°C', units);
		// ['to-string', ['round', ['to-number', ['get','value']]]]
		expect(Array.isArray(expr)).toBe(true);
		expect((expr as unknown[])[0]).toBe('to-string');
	});

	it('°C → °F → number-format max-fraction-digits 0', () => {
		const expr = buildGridValueLabelExpr('temperature_2m', '°C', {
			...units,
			temperature: '°F'
		});
		expect((expr as unknown[])[0]).toBe('number-format');
		const opts = (expr as unknown[])[2] as Record<string, number>;
		expect(opts['max-fraction-digits']).toBe(0);
	});
});

describe('buildGridDecimationFilter (grille régulière)', () => {
	const geom = { nx: 1121, ny: 717, dxDeg: 0.025, dyDeg: 0.025, refLat: 46, gaussian: false };
	const filter = buildGridDecimationFilter(geom, [2, 12], 48);

	it('a la forme step(zoom)', () => {
		expect((filter as unknown[])[0]).toBe('step');
		expect((filter as unknown[])[1]).toEqual(['zoom']);
	});

	it('au zoom 12, garde le nœud id=1 (stride 1)', () => {
		expect(evalFilter(filter, { id: 1, zoom: 12 })).toBe(true);
	});

	it('au zoom 2, élague la grande majorité des nœuds', () => {
		let kept = 0;
		for (let id = 0; id < 5000; id++) {
			if (evalFilter(filter, { id, zoom: 2 })) kept++;
		}
		expect(kept).toBeLessThan(200); // décimation lattice agressive
	});
});

describe('buildGridDecimationFilter (grille gaussienne → repli 1D)', () => {
	const geom = { nx: 1440, ny: 721, dxDeg: 0.25, dyDeg: 0.25, refLat: 0, gaussian: true };
	const filter = buildGridDecimationFilter(geom, [2, 12], 48);

	it('décime sur l’id seul (pas de garde lattice 2D)', () => {
		// La branche gaussienne est ['==', ['%', ['id'], s], 0] → id=0 toujours gardé.
		expect(evalFilter(filter, { id: 0, zoom: 5 })).toBe(true);
	});
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/lib/tests/vector-styles.test.ts`
Expected: FAIL — `computeStride`, `pxPerDegLon`, `buildGridValueLabelExpr`, `buildGridDecimationFilter`, `GRID_VALUE_TARGET_PX` non exportés.

- [ ] **Step 3 : Implémenter les builders**

Dans `src/lib/vector-styles.ts`, après le `buildContourLabelExpr` (avant `buildArrowColorExpr`), ajouter :

```ts
// ── Calque « valeurs aux points de grille » (façon Météociel) ───────────────

/** Espacement écran cible entre deux étiquettes de valeur (px). Le stride vise
 *  cet écart ; la collision MapLibre élague le résidu. */
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

/** Géométrie de grille nécessaire à la décimation, dérivée du domaine. */
export interface GridGeometry {
	nx: number;
	ny: number;
	/** Pas longitude (degrés), dérivé des bornes / nx. */
	dxDeg: number;
	/** Pas latitude (degrés), dérivé des bornes / ny. */
	dyDeg: number;
	/** Latitude de référence (centre) pour la correction mercator du stride Y. */
	refLat: number;
	/** Grille gaussienne (largeur de ligne variable) → repli décimation 1D. */
	gaussian: boolean;
}

/**
 * Champ texte des étiquettes de valeur — **entier**, dans l'unité d'affichage.
 * Même conversion affine que `buildContourLabelExpr`, mais arrondi à l'entier
 * (`max-fraction-digits: 0`). Sans conversion (unité d'affichage = unité de
 * base), on arrondit la valeur brute via `['round', …]`.
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
	return ['number-format', scaled, { 'max-fraction-digits': 0 }];
}

/**
 * Filtre de décimation par zoom sur l'`id` du point de grille (`id = j·nx + i`).
 * Structuré en `['step', ['zoom'], …]` : c'est la seule forme où `['zoom']` est
 * accepté dans un filtre MapLibre (premier argument d'un `step` de tête). Chaque
 * branche garde un sous-réseau régulier dont le pas vise `targetPx` à l'écran.
 * Les grilles gaussiennes (largeur de ligne variable) n'ont pas d'`id = j·nx+i`
 * exploitable → repli sur une décimation 1D `id % stride`.
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
		// Mercator : px/deg en latitude = px/deg en longitude / cos(latRef).
		const pxLat = pxLon / Math.cos((geom.refLat * Math.PI) / 180);
		const sy = computeStride(geom.dyDeg, pxLat, targetPx);
		const i: maplibregl.ExpressionSpecification = ['%', ['id'], geom.nx];
		const j: maplibregl.ExpressionSpecification = ['floor', ['/', ['id'], geom.nx]];
		return ['all', ['==', ['%', i, sx], 0], ['==', ['%', j, sy], 0]];
	};
	const [zMin, zMax] = zoomRange;
	const stops: unknown[] = ['step', ['zoom'], branch(zMin)];
	for (let z = zMin + 1; z <= zMax; z++) {
		stops.push(z, branch(z));
	}
	return stops as unknown as maplibregl.FilterSpecification;
}
```

Note : `VALUE` (= `['to-number', ['get', 'value']]`), `convertValue` et `UnitPreferences` sont déjà présents en haut de `vector-styles.ts`. `maplibregl` est déjà importé en type.

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/lib/tests/vector-styles.test.ts`
Expected: PASS (toutes les suites, anciennes + nouvelles).

- [ ] **Step 5 : Format + commit**

```bash
npm run format
git add src/lib/vector-styles.ts src/lib/tests/vector-styles.test.ts
git commit -m "feat(grid-values): builders purs stride + filtre décimation + label entier"
```

---

## Task 3 : Intégration dans le moteur de rendu (`layers.ts`)

**Files:**

- Modify: `src/lib/layers.ts` (imports, helper, `SlotLayer`, `vectorManager` factory)

- [ ] **Step 1 : Étendre les imports**

Dans `src/lib/layers.ts`, ajouter `GridFactory` à l'import du package (ligne 3) :

```ts
import { GridFactory, getColorScale } from '@openmeteo/weather-map-layer';
```

Ajouter `selectedDomain` à l'import des variables (bloc lignes 13-18) :

```ts
import {
	domain as d,
	variable as displayedVariable,
	layer2Enabled,
	selectedDomain,
	variable2
} from '$lib/stores/variables';
```

Ajouter `gridValues` à l'import du store vector (ligne 19) :

```ts
import { gridValues, vectorOptions as vO } from '$lib/stores/vector';
```

Étendre l'import de `vector-styles` (bloc lignes 32-40) avec les nouveaux builders et le type :

```ts
import {
	type ArrowStyle,
	type ContourStyle,
	type GridGeometry,
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildContourColorExpr,
	buildContourLabelExpr,
	buildContourWidthExpr,
	buildGridDecimationFilter,
	buildGridValueLabelExpr
} from '$lib/vector-styles';
```

- [ ] **Step 2 : Ajouter le helper de géométrie + le `SlotLayer`**

Dans `src/lib/layers.ts`, juste **après** `vectorContourLabelsLayer` (après sa fermeture, vers la ligne 259) :

```ts
/** Géométrie de grille du domaine, dérivée des bornes (agnostique du type de
 *  grille : régulière, projetée ou gaussienne). Le pas en degrés vient des
 *  bornes / (n-1), donc valable même pour une grille projetée (dx/dy en mètres). */
const gridGeometryOf = (grid: Parameters<typeof GridFactory.create>[0]): GridGeometry => {
	const [minLon, minLat, maxLon, maxLat] = GridFactory.create(grid).getBounds();
	const nx = grid.nx;
	const ny = grid.ny;
	return {
		nx,
		ny,
		dxDeg: Math.abs(maxLon - minLon) / Math.max(1, nx - 1),
		dyDeg: Math.abs(maxLat - minLat) / Math.max(1, ny - 1),
		refLat: (minLat + maxLat) / 2,
		gaussian: grid.type === 'gaussian'
	};
};

const vectorGridValuesLayer = (): SlotLayer => ({
	id: 'omVectorGridValuesLayer',
	opacityProp: 'text-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		if (!get(gridValues)) return;
		const geom = gridGeometryOf(get(selectedDomain).grid);
		map.addLayer(
			{
				id: layerId,
				type: 'symbol',
				source: sourceId,
				'source-layer': 'grid',
				filter: buildGridDecimationFilter(geom),
				layout: {
					'symbol-placement': 'point',
					'text-field': buildGridValueLabelExpr(
						get(displayedVariable),
						getColorScale(get(displayedVariable), isDark(), get(omProtocolSettings).colorScales)
							.unit,
						get(unitPreferences)
					),
					'text-font': ['Noto Sans Regular'],
					'text-size': 11,
					// Décimation analytique + collision : on laisse MapLibre élaguer le résidu.
					'text-allow-overlap': false,
					'text-ignore-placement': false,
					'text-padding': 2
				},
				paint: {
					'text-opacity': 0,
					'text-opacity-transition': { duration: 200, delay: 0 },
					'text-color': lightOrDark('rgba(0,0,0, 0.85)', 'rgba(255,255,255, 0.9)'),
					'text-halo-color': lightOrDark('rgba(255,255,255, 0.85)', 'rgba(0,0,0, 0.7)'),
					'text-halo-width': 1.5
				}
			},
			beforeLayer
		);
	}
});
```

- [ ] **Step 3 : Enregistrer le layer dans le `vectorManager`**

Dans `createManagers()` (vers ligne 384), ajouter `vectorGridValuesLayer()` en dernier dans le `layerFactory` du `vectorManager` :

```ts
		layerFactory: () => [
			vectorArrowLayer(false),
			vectorGridLayer(),
			vectorContourLayer(),
			vectorContourLabelsLayer(),
			vectorGridValuesLayer()
		],
```

- [ ] **Step 4 : Brancher le `grid` OR dans l'URL**

Dans `src/lib/url.ts`, importer `gridValues` (ligne 22) :

```ts
import {
	gridValues,
	vectorOptions as vO,
	windOverlayEnabled,
	windOverlayLevel
} from '$lib/stores/vector';
```

Puis modifier la résolution du flag `grid` dans `getOMUrlFor` (ligne 297) :

```ts
const grid = vectorOverride?.grid ?? (vectorOptions.grid || get(gridValues));
```

(`get` est déjà importé dans `url.ts`.)

- [ ] **Step 5 : Hydrater le param URL au montage**

Dans `urlParamsToPreferences()` (`src/lib/url.ts`), après le bloc `wind_overlay_level` (vers ligne 177), ajouter :

```ts
const gridValuesRaw = params.get('grid_values');
if (gridValuesRaw !== null) {
	gridValues.set(gridValuesRaw === 'true');
} else if (get(gridValues)) {
	url.searchParams.set('grid_values', 'true');
}
```

- [ ] **Step 6 : Typecheck**

Run: `npm run check`
Expected: PASS. (Si `GridFactory.create` n'accepte pas le type inféré, voir Note ci-dessous.)

Note : le type du paramètre de `GridFactory.create` est `GridData`. Si l'inférence `Parameters<typeof GridFactory.create>[0]` pose souci, remplacer la signature du helper par `(grid: ReturnType<typeof get<typeof selectedDomain>>['grid'])` n'est PAS souhaitable ; préférer importer le type : `import type { GridData } from '@openmeteo/weather-map-layer'` puis `gridGeometryOf = (grid: GridData): GridGeometry`. Vérifier que `GridData` est bien exporté (`node_modules/@openmeteo/weather-map-layer/dist/types.d.ts:147`) ; sinon garder `Parameters<...>`.

- [ ] **Step 7 : Commit**

```bash
git add src/lib/layers.ts src/lib/url.ts
git commit -m "feat(grid-values): symbol layer valeurs sur la source-layer grid + grid OR dans l'URL"
```

---

## Task 4 : Toggle UI dans la section « Grille »

**Files:**

- Modify: `src/lib/components/settings/grid-settings.svelte`

- [ ] **Step 1 : Ajouter le 2ᵉ switch**

Remplacer intégralement `src/lib/components/settings/grid-settings.svelte` par :

```svelte
<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { gridValues, vectorOptions } from '$lib/stores/vector';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL, reloadVectorStyle } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	let grid = $derived($vectorOptions.grid);
	let values = $derived($gridValues);
</script>

<div>
	<h2 class="text-lg font-bold">Grille</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="grid"
			class="cursor-pointer"
			bind:checked={$vectorOptions.grid}
			onCheckedChange={() => {
				updateUrl('grid', String(grid));

				changeOMfileURL();
				toast.info('Points de grille ' + (grid ? 'activés' : 'désactivés'));
			}}
		/>
		<Label for="grid" class="cursor-pointer"
			>Points de grille {grid ? 'activés' : 'désactivés'}</Label
		>
	</div>
	<div class="mt-3 flex gap-3">
		<Switch
			id="grid-values"
			class="cursor-pointer"
			bind:checked={$gridValues}
			onCheckedChange={() => {
				updateUrl('grid_values', String(values));

				// Activer les valeurs force `&grid=true` dans l'URL : si les points
				// orange étaient off, l'URL change → changeOMfileURL refait la source.
				// Si les points étaient déjà on, l'URL est inchangée → on reconstruit
				// la couche vecteur en place pour ajouter/retirer le symbol layer.
				changeOMfileURL();
				reloadVectorStyle();
				toast.info('Valeurs aux points ' + (values ? 'activées' : 'désactivées'));
			}}
		/>
		<Label for="grid-values" class="cursor-pointer"
			>Valeurs aux points {values ? 'activées' : 'désactivées'}</Label
		>
	</div>
</div>
```

- [ ] **Step 2 : Valider le composant Svelte**

Run: `npm run check`
Expected: PASS (pas d'erreur Svelte/TS).

- [ ] **Step 3 : Lint**

Run: `npm run lint`
Expected: PASS (prettier + eslint).

- [ ] **Step 4 : Commit**

```bash
git add src/lib/components/settings/grid-settings.svelte
git commit -m "feat(grid-values): toggle « Valeurs aux points » dans la section Grille"
```

---

## Task 5 : Vérification de bout en bout

**Files:** aucun (vérification).

- [ ] **Step 1 : Suite complète de tests**

Run: `npm run test -- --run`
Expected: PASS (toute la suite Vitest).

- [ ] **Step 2 : Typecheck + lint + build**

Run: `npm run check && npm run lint && npm run build`
Expected: les trois PASS ; build statique généré dans `./build`.

- [ ] **Step 3 : Smoke test manuel (le point runtime critique)**

Run: `npm run dev`, ouvrir
`http://localhost:5173/?domain=arome_france&variable=temperature_2m&grid_values=true`

Vérifier :

1. Des **valeurs entières** apparaissent aux nœuds de grille, semées (pas toutes), façon Météociel.
2. **Dézoomer** → les valeurs se raréfient (stride plus grand) ; **zoomer** → elles se densifient. Aucune saccade prolongée à l'échelle France.
3. Les **points orange** (toggle « Points de grille ») sont indépendants : activer l'un n'active pas l'autre.
4. Changer l'unité (°C → °F dans les réglages) met les valeurs à jour.
5. Changer de domaine (ex. `gfs_global` puis `meteofrance_arome_france0025`) garde un espacement écran cohérent.
6. Le param `grid_values=true` est présent dans l'URL quand le toggle est actif, absent quand il est off.

**Point de vigilance** : confirmer que MapLibre accepte le filtre `['step', ['zoom'], …]` et l'accesseur `['id']` (aucune erreur console « zoom expressions … » ni « id … »). C'est la seule hypothèse non couverte par les tests unitaires. Si MapLibre rejette `['id']` parce que les features de la source-layer `'grid'` n'exposent pas leur id au moteur d'expressions, fixer `promoteId` n'est pas possible (id déjà posé dans la tuile) → repli : retirer le filtre `step(zoom)` du layer et le réappliquer via `map.setFilter('omVectorGridValuesLayer_<slot>', branch(currentZoom))` sur l'événement `zoomend` (debounce). À n'implémenter QUE si le smoke test révèle le rejet ; sinon le filtre statique suffit.

- [ ] **Step 4 : Vérifier l'absence de régression au re-style**

Toujours en dev : basculer « Fond de carte sombre ». Les valeurs doivent réapparaître après le re-style (le `vectorManager` est recréé par `reloadStyles()` → `addOmFileLayers` re-exécute le `layerFactory`). Si elles ne réapparaissent pas, vérifier que `reloadStyles()` (`map-controls.ts`) déclenche bien `addOmFileLayers`/`changeOMfileURL` (déjà le cas pour contours/flèches) — aucune modif attendue, juste une vérification.

- [ ] **Step 5 : Mettre à jour la doc d'architecture**

Dans `.claude/rules/architecture.md`, section SlotManager (vers ligne 19), ajouter une phrase : le `vectorManager` porte désormais aussi `vectorGridValuesLayer` (symbol sur la source-layer `'grid'`, gaté par le store `gridValues`, décimé par zoom via filtre sur l'`id`). Mentionner que l'URL force `&grid=true` dès que `gridValues` OU `vectorOptions.grid` est actif.

```bash
git add .claude/rules/architecture.md
git commit -m "docs(architecture): calque valeurs aux points de grille"
```

---

## Self-review (effectuée)

**Couverture spec :**

- Source de données (source-layer `'grid'`, pas de réseau) → Task 3.
- Activation (store `gridValues`, param `grid_values`, `grid` OR) → Tasks 1 & 3.
- Décimation par zoom (`step(zoom)` sur `id`, stride par domaine, lattice + repli gaussien) → Task 2 (builders) & 3 (géométrie).
- Format entier + conversion d'unité → Task 2 (`buildGridValueLabelExpr`).
- Style (halo, couleurs thème, fade opacity) → Task 3.
- Toggle UI indépendant sous « Grille » → Task 4.
- Tests Vitest (label, stride, filtre) → Task 2.
- Garde-fous lisibilité (collision, halo, stride) → Task 3 (`text-allow-overlap: false`) + smoke test Task 5.

**Placeholders :** aucun — chaque step porte le code ou la commande exacts. Le repli runtime (Task 5 Step 3) est conditionnel et entièrement décrit, pas un TODO.

**Cohérence des types :** `GridGeometry` défini en Task 2, importé et construit en Task 3 (`gridGeometryOf`). `gridValues` créé en Task 1, consommé en Tasks 3 & 4. `vectorGridValuesLayer` / `reloadVectorStyle` / `changeOMfileURL` : noms cohérents entre Tasks 3 et 4.
