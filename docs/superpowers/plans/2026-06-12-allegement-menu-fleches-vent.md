# Allègement du menu « Flèches de vent » + fallback « selon la variable affichée » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replier le réglage « Style des flèches » dans un sous-menu, et faire que le mode « selon la variable affichée » affiche le vent à un niveau dérivé (sinon 10 m) quand la variable affichée n'est pas du vent.

**Architecture:** Deux fonctions pures (`isWindVariable`, `deriveDisplayedWindLevel`) dans `vector-styles.ts` ; une décision centralisée `resolveWindArrowLevel()` dans `url.ts` réutilisée par l'URL d'overlay, le garde de couche (`layers.ts`) et le popup (`popup.ts`) ; un disclosure UI maison dans `arrows-settings.svelte`.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest, Tailwind v4, MapLibre GL, `@openmeteo/weather-map-layer`, lucide-svelte.

**Spec:** `docs/superpowers/specs/2026-06-12-allegement-menu-fleches-vent-design.md`

**Branche:** `feat/allegement-menu-fleches-vent` (déjà créée, spec commité).

---

## Structure des fichiers

| Fichier                                              | Responsabilité                                                | Action                           |
| ---------------------------------------------------- | ------------------------------------------------------------- | -------------------------------- |
| `src/lib/vector-styles.ts`                           | Fonctions pures `isWindVariable` + `deriveDisplayedWindLevel` | Modifier (ajout)                 |
| `src/lib/tests/vector-styles.test.ts`                | Tests unitaires des fonctions pures                           | Modifier (ajout)                 |
| `src/lib/url.ts`                                     | `resolveWindArrowLevel()` + réécriture `getWindOverlayUrl()`  | Modifier                         |
| `src/lib/tests/url-builder.test.ts`                  | Tests du fallback d'URL                                       | Modifier (ajout)                 |
| `src/lib/layers.ts`                                  | Garde de couche basé sur `resolveWindArrowLevel()`            | Modifier (1 ligne + commentaire) |
| `src/lib/popup.ts`                                   | Lecture du vent depuis l'arrowManager en mode fallback        | Modifier (1 ligne + imports)     |
| `src/lib/components/settings/arrows-settings.svelte` | Disclosure « Style des flèches »                              | Modifier (UI)                    |
| `.claude/rules/architecture.md`                      | Documenter le 3ᵉ cas du découplage                            | Modifier (doc)                   |

---

## Task 1 : Fonctions pures `isWindVariable` + `deriveDisplayedWindLevel`

**Files:**

- Modify: `src/lib/vector-styles.ts` (ajout en fin de fichier)
- Test: `src/lib/tests/vector-styles.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `src/lib/tests/vector-styles.test.ts`, et compléter l'import en tête (ajouter `deriveDisplayedWindLevel` et `isWindVariable` à la liste importée depuis `$lib/vector-styles`) :

```ts
describe('isWindVariable', () => {
	it('reconnaît les composantes u/v et speed/direction comme vent', () => {
		expect(isWindVariable('wind_u_component_10m')).toBe(true);
		expect(isWindVariable('wind_v_component_850hPa')).toBe(true);
		expect(isWindVariable('wind_speed_10m')).toBe(true);
		expect(isWindVariable('wind_direction_100m')).toBe(true);
	});

	it('exclut les rafales (pas de direction) et les non-vent', () => {
		expect(isWindVariable('wind_gusts_10m')).toBe(false);
		expect(isWindVariable('temperature_2m')).toBe(false);
		expect(isWindVariable('precipitation')).toBe(false);
	});
});

describe('deriveDisplayedWindLevel', () => {
	const WIND = ['wind_u_component_10m', 'wind_u_component_100m', 'wind_u_component_850hPa'];

	it('retombe sur 10 m pour une variable de surface 2 m', () => {
		expect(deriveDisplayedWindLevel('temperature_2m', WIND)).toBe('10m');
	});

	it('retombe sur 10 m pour une variable de surface sans niveau', () => {
		expect(deriveDisplayedWindLevel('precipitation', WIND)).toBe('10m');
	});

	it('utilise le niveau de pression de la variable quand le vent y est publié', () => {
		expect(deriveDisplayedWindLevel('temperature_850hPa', WIND)).toBe('850hPa');
	});

	it("retombe sur 10 m quand le vent du niveau de pression n'est pas publié", () => {
		expect(deriveDisplayedWindLevel('temperature_500hPa', WIND)).toBe('10m');
	});

	it('renvoie null quand le modèle ne publie aucun vent', () => {
		expect(deriveDisplayedWindLevel('temperature_2m', ['cape', 'precipitation'])).toBe(null);
	});
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/lib/tests/vector-styles.test.ts`
Expected: FAIL — `isWindVariable is not exported` / `deriveDisplayedWindLevel is not exported`.

- [ ] **Step 3: Implémenter les fonctions**

Ajouter à la fin de `src/lib/vector-styles.ts` :

```ts
// ── Résolution du niveau de vent (mode « selon la variable affichée ») ──────

/**
 * Variables que le `vectorManager` rend déjà en flèches (la lib dérive u/v →
 * vitesse/direction). `wind_gusts` est exclu : pas de composante directionnelle,
 * donc traité comme une variable non-vent → éligible au fallback.
 */
export const isWindVariable = (variable: string): boolean =>
	variable.startsWith('wind_') && !variable.startsWith('wind_gusts');

/**
 * Niveau de vent à afficher en repli quand la variable affichée n'est pas du vent :
 * le niveau de la variable (`…_<N>hPa`) si le vent y est publié, sinon `10m`.
 * Renvoie `null` si le modèle ne publie aucun vent exploitable.
 */
export const deriveDisplayedWindLevel = (
	displayedVariable: string,
	modelVariables: Iterable<string>
): string | null => {
	const vars = new Set(modelVariables);
	const level = displayedVariable.match(/_(\d+m|\d+hPa)$/)?.[1];
	if (level && vars.has(`wind_u_component_${level}`)) return level;
	if (vars.has('wind_u_component_10m')) return '10m';
	return null;
};
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/lib/tests/vector-styles.test.ts`
Expected: PASS (tous les tests, anciens + nouveaux).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vector-styles.ts src/lib/tests/vector-styles.test.ts
git commit -m "feat(vent): helpers isWindVariable + deriveDisplayedWindLevel"
```

---

## Task 2 : Décision centralisée `resolveWindArrowLevel()` + `getWindOverlayUrl()`

**Files:**

- Modify: `src/lib/url.ts:325-341` (la fonction `getWindOverlayUrl` actuelle)
- Test: `src/lib/tests/url-builder.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

En tête de `src/lib/tests/url-builder.test.ts`, ajouter l'import du store metaJson et de la variable affichée (le fichier importe déjà `domain as d, variable as v` et `vectorOptions, windOverlayEnabled, windOverlayLevel`). Ajouter :

```ts
import { metaJson as mJ } from '$lib/stores/time';
```

Puis ajouter ce `describe` (helper `meta` local + cas fallback) :

```ts
const meta = (variables: string[]) => ({
	completed: true,
	last_modified_time: '',
	reference_time: '2026-06-01T00:00:00Z',
	valid_times: ['2026-06-01T01:00'],
	variables
});

describe('getWindOverlayUrl — fallback « selon la variable affichée »', () => {
	beforeEach(() => {
		vi.stubEnv('VITE_OM_WORKER_URL', 'http://localhost:8080');
		d.set('meteofrance_arome_france_hd');
		mR.set(new Date('2026-05-23T00:00:00Z'));
		time.set(new Date('2026-05-23T15:00:00Z'));
		windOverlayEnabled.set(false); // mode « selon la variable affichée »
		vectorOptions.update((o) => ({ ...o, arrows: true }));
		mJ.set(meta(['temperature_2m', 'wind_u_component_10m', 'wind_u_component_850hPa']));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		windOverlayEnabled.set(false);
	});

	it('dérive le vent 10 m pour une variable de surface non-vent', () => {
		v.set('temperature_2m');
		const url = getWindOverlayUrl();
		expect(url).toContain('variable=wind_u_component_10m');
		expect(url).not.toContain('contours=true');
		expect(url).not.toContain('grid=true');
	});

	it('dérive le vent au niveau de pression de la variable affichée', () => {
		v.set('temperature_850hPa');
		expect(getWindOverlayUrl()).toContain('variable=wind_u_component_850hPa');
	});

	it('ne dessine rien quand la variable affichée est déjà du vent', () => {
		v.set('wind_u_component_10m');
		expect(getWindOverlayUrl()).toBeUndefined();
	});

	it('ne dessine rien quand les flèches sont désactivées', () => {
		vectorOptions.update((o) => ({ ...o, arrows: false }));
		v.set('temperature_2m');
		expect(getWindOverlayUrl()).toBeUndefined();
	});
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/lib/tests/url-builder.test.ts`
Expected: FAIL — en mode `windOverlayEnabled=false`, l'actuel `getWindOverlayUrl()` retourne `undefined`, donc le 1er test échoue (`expect(undefined).toContain(...)`).

- [ ] **Step 3: Implémenter `resolveWindArrowLevel` + réécrire `getWindOverlayUrl`**

Dans `src/lib/url.ts`, ajouter l'import des helpers (regrouper avec l'import existant depuis `./vector-styles` s'il y en a un, sinon ajouter une ligne ; prettier rangera) :

```ts
import { deriveDisplayedWindLevel, isWindVariable } from './vector-styles';
```

Remplacer le bloc actuel `getWindOverlayUrl` (lignes ~325-341, `export const getWindOverlayUrl = …`) par :

```ts
/**
 * Niveau de vent que l'`arrowManager` doit rendre, ou `null` s'il ne dessine pas
 * les flèches :
 *  - flèches désactivées → null ;
 *  - overlay vent explicite → le niveau choisi (inchangé) ;
 *  - mode « selon la variable affichée » + variable déjà de vent → null
 *    (le vectorManager rend les flèches, comportement historique) ;
 *  - mode « selon la variable affichée » + variable non-vent → niveau dérivé
 *    (`deriveDisplayedWindLevel`), ou null si aucun vent publié.
 */
export const resolveWindArrowLevel = (): string | null => {
	if (!get(vO).arrows) return null;
	if (get(windOverlayEnabled)) return get(windOverlayLevel);
	const displayed = get(v);
	if (isWindVariable(displayed)) return null;
	return deriveDisplayedWindLevel(displayed, get(mJ)?.variables ?? []);
};

/**
 * URL om:// flèches-seules pour l'arrowManager, ou `undefined` si aucune flèche
 * d'overlay/fallback à dessiner. On force `contours`/`grid` à false : contours et
 * étiquettes suivent la variable affichée (rendus par le vectorManager).
 */
export const getWindOverlayUrl = (): string | undefined => {
	const level = resolveWindArrowLevel();
	if (!level) return undefined;
	return getOMUrlFor(`wind_u_component_${level}`, undefined, { contours: false, grid: false });
};
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/lib/tests/url-builder.test.ts`
Expected: PASS (anciens tests d'overlay explicite + nouveaux tests fallback).

- [ ] **Step 5: Commit**

```bash
git add src/lib/url.ts src/lib/tests/url-builder.test.ts
git commit -m "feat(vent): fallback niveau dérivé en mode « selon la variable affichée »"
```

---

## Task 3 : Garde de couche dans `layers.ts`

**Files:**

- Modify: `src/lib/layers.ts:121-133`

Note : ce module pilote MapLibre et n'a pas de tests unitaires Vitest (dépend de la carte). Vérification par typecheck + tests existants + comportement.

- [ ] **Step 1: Importer `resolveWindArrowLevel`**

Dans `src/lib/layers.ts`, l'import depuis `./url` contient déjà `getWindOverlayUrl`. Y ajouter `resolveWindArrowLevel` :

```ts
import { /* …existant…, */ getWindOverlayUrl, resolveWindArrowLevel } from './url';
```

(Conserver tous les autres symboles déjà importés depuis `./url`.)

- [ ] **Step 2: Mettre à jour le commentaire + le garde**

Remplacer le commentaire (lignes ~121-125) et la ligne de garde (~133).

Commentaire — remplacer le bloc existant par :

```ts
// Les flèches sont rendues par EXACTEMENT un manager à la fois :
//  - `forOverlay = true`  → arrowManager (niveau de vent dédié) quand un niveau est
//    résolu : overlay vent explicite, OU mode « selon la variable affichée » sur une
//    variable non-vent (fallback niveau dérivé, cf. resolveWindArrowLevel) ;
//  - `forOverlay = false` → vectorManager (source = variable affichée) quand la
//    variable affichée est elle-même du vent.
// Le garde `(resolveWindArrowLevel() !== null) !== forOverlay` évite de dessiner les
// flèches en double et laisse contours/étiquettes du vectorManager suivre la variable.
```

Garde — remplacer :

```ts
if (get(windOverlayEnabled) !== forOverlay) return;
```

par :

```ts
if ((resolveWindArrowLevel() !== null) !== forOverlay) return;
```

(Ne pas toucher la ligne `if (!vectorOptions.arrows) return;` juste au-dessus — elle reste un court-circuit valide ; `resolveWindArrowLevel()` la redouble mais c'est sans effet.)

- [ ] **Step 3: Vérifier le typecheck et les tests**

Run: `npm run check && npx vitest run`
Expected: 0 erreur de type ; tous les tests passent.

Si `windOverlayEnabled` n'est plus référencé ailleurs dans `layers.ts` après ce changement, retirer son import (sinon eslint signalera un import inutilisé). Vérifier avec : `grep -n "windOverlayEnabled" src/lib/layers.ts` — s'il reste des usages, garder l'import.

- [ ] **Step 4: Commit**

```bash
git add src/lib/layers.ts
git commit -m "feat(vent): arrowManager rend aussi le fallback « variable affichée »"
```

---

## Task 4 : Popup — lire le vent depuis l'arrowManager en mode fallback

**Files:**

- Modify: `src/lib/popup.ts:19,24,113`

- [ ] **Step 1: Remplacer la condition `showWind`**

Dans `src/lib/popup.ts`, remplacer la ligne 113 :

```ts
const showWind = get(windOverlayEnabled) && !WIND_VARIABLE_REGEX.test(get(v));
```

par :

```ts
// L'arrowManager dessine dès qu'un niveau de vent est résolu (overlay explicite OU
// fallback « selon la variable affichée » sur variable non-vent). On lit alors le
// vent depuis lui, sauf si la variable affichée est elle-même une composante u/v
// (sa valeur principale est déjà du vent).
const showWind = resolveWindArrowLevel() !== null && !WIND_VARIABLE_REGEX.test(get(v));
```

- [ ] **Step 2: Ajuster les imports**

Ajouter l'import de `resolveWindArrowLevel` (groupe des imports relatifs, à côté de `./layers`) :

```ts
import { resolveWindArrowLevel } from './url';
```

Retirer l'import devenu inutile à la ligne 19 :

```ts
import { windOverlayEnabled } from '$lib/stores/vector';
```

- [ ] **Step 3: Vérifier qu'aucun autre usage ne subsiste**

Run: `grep -n "windOverlayEnabled" src/lib/popup.ts`
Expected: aucun résultat (sinon, ne pas retirer l'import).

Run: `npm run check`
Expected: 0 erreur de type, pas d'import inutilisé.

- [ ] **Step 4: Commit**

```bash
git add src/lib/popup.ts
git commit -m "fix(vent): popup lit le vent en mode fallback « variable affichée »"
```

---

## Task 5 : Disclosure « Style des flèches » (UI)

**Files:**

- Modify: `src/lib/components/settings/arrows-settings.svelte`

Note : suivre la convention du repo — déléguer l'édition `.svelte` à l'agent `svelte-file-editor` si le plugin Svelte est installé, et valider avec `svelte-autofixer`. Sinon, éditer directement puis `npm run check`.

- [ ] **Step 1: Ajouter les imports et l'état dans le `<script>`**

Dans le bloc `import` (les icônes lucide se déclarent comme `RotateCcwIcon`) ajouter :

```ts
import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
```

Avec les imports svelte/framework (le fichier importe déjà `toast` de svelte-sonner ; ajouter en tête de groupe svelte) :

```ts
import { MediaQuery } from 'svelte/reactivity';
import { slide } from 'svelte/transition';
```

Après les autres `$state`/`$derived` (par ex. après `let editing … = $state(null);`), ajouter :

```ts
let styleOpen = $state(false);
const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');
```

- [ ] **Step 2: Remplacer le bloc « Style des flèches » du template**

Remplacer entièrement le `<div class="mt-2 flex flex-col gap-1.5 border-t border-white/10 pt-2 pl-1">…</div>` (bloc actuel lignes ~152-197) par :

```svelte
<div class="mt-2 border-t border-white/10 pt-2 pl-1">
	<button
		type="button"
		class="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 text-xs text-white/70 hover:text-white/90 md:min-h-0"
		aria-expanded={styleOpen}
		aria-controls="arrow-style-panel"
		onclick={() => (styleOpen = !styleOpen)}
	>
		<span>Style des flèches</span>
		<ChevronDownIcon
			class="size-4 transition-transform duration-200 motion-reduce:transition-none {styleOpen
				? 'rotate-180'
				: ''}"
			aria-hidden="true"
		/>
	</button>
	{#if styleOpen}
		<div
			id="arrow-style-panel"
			class="mt-1.5 flex flex-col gap-1.5"
			transition:slide={{ duration: reducedMotion.current ? 0 : 200 }}
		>
			<div class="flex justify-end">
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
							aria-label={`Couleur ${level.label}`}
							class="size-5 cursor-pointer rounded border border-white/20"
							style="background: {level.darkColor};"
							onclick={(e) =>
								(editing = { index: i, rect: e.currentTarget.getBoundingClientRect() })}
						></button>
						{#if editing?.index === i}
							<ColorPicker
								portalToBody
								anchorRect={editing.rect}
								color={rgbaStringToHex(level.darkColor)}
								alpha={parseRgbaOpacity(level.darkColor)}
								onchange={(hex, alpha) => setColor(i, hex, alpha)}
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
	{/if}
</div>
```

- [ ] **Step 3: Valider le composant**

Run: `npm run check && npm run lint`
Expected: 0 erreur de type, prettier/eslint OK. (Si `svelte-autofixer` est disponible, l'exécuter sur le fichier.)

Vérification visuelle rapide (manuelle) : `npm run dev`, ouvrir le panneau réglages, activer « Flèches de vent ». Attendu : section « Style des flèches » **repliée** par défaut avec un chevron ; clic → la grille des 7 niveaux glisse (ou apparaît sans animation si `prefers-reduced-motion`) avec le bouton « Réinitialiser » en haut ; re-clic → repli.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/settings/arrows-settings.svelte
git commit -m "feat(vent): replie « Style des flèches » dans un sous-menu"
```

---

## Task 6 : Documentation + vérification finale

**Files:**

- Modify: `.claude/rules/architecture.md` (section « Découplage flèches/contours »)

- [ ] **Step 1: Mettre à jour `architecture.md`**

Dans la section **« Découplage flèches/contours (overlay vent) »** de `.claude/rules/architecture.md`, après la phrase décrivant l'arrowManager en overlay, ajouter ce paragraphe :

```markdown
**3ᵉ cas — fallback « selon la variable affichée ».** Une seule fonction décide quel niveau l'`arrowManager` rend : `resolveWindArrowLevel()` (`url.ts`). En mode « selon la variable affichée » (`windOverlayEnabled = false`), si la variable affichée n'est **pas** du vent (`isWindVariable`, `vector-styles.ts`), elle dérive un niveau via `deriveDisplayedWindLevel()` (niveau de pression de la variable si le vent y est publié, sinon `10m`) et l'`arrowManager` rend ce vent — sans quoi une `temperature_2m` n'affichait aucune flèche. Le garde de couche (`vectorArrowLayer`) est passé de `windOverlayEnabled === forOverlay` à `(resolveWindArrowLevel() !== null) === forOverlay`, et `popup.ts` lit le vent dès que `resolveWindArrowLevel() !== null` (plus seulement quand l'overlay explicite est actif). La règle « exactement un manager dessine les flèches » est préservée.
```

- [ ] **Step 2: Vérification complète du projet**

Run: `npm run check && npm run lint && npx vitest run`
Expected: typecheck OK, lint OK, **tous** les tests passent.

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/architecture.md
git commit -m "docs(vent): documente le fallback « selon la variable affichée »"
```

---

## Vérification d'intégration (manuelle, après tous les commits)

Lancer `npm run dev` et vérifier sur un modèle qui publie du vent (p. ex. `meteofrance_arome_france_hd`) :

1. Variable `temperature_2m` affichée, « Flèches de vent » ON, niveau « Selon la variable affichée » → **les flèches de vent 10 m apparaissent** (avant : aucune).
2. Passer la variable affichée à une variable d'altitude `…_850hPa` → les flèches suivent le vent 850 hPa (si publié).
3. Survol carte (popup) en cas 1 → la vitesse du vent (10 m) s'affiche à côté de la température.
4. Variable de vent affichée directement (`wind_u_component_10m`) → flèches rendues comme avant (pas de double).
5. Overlay vent explicite (niveau 100 m, 300 hPa…) → comportement inchangé.
6. Réglages : « Style des flèches » replié par défaut, dépliable, « Réinitialiser » fonctionnel, animation respectant `prefers-reduced-motion`.

---

## Notes

- **DRY** : `resolveWindArrowLevel()` est l'unique source de vérité du « quel niveau de vent » — réutilisée par l'URL, le garde de couche et le popup. Ne pas dupliquer la logique.
- **YAGNI** : pas de persistance de l'état déplié, pas de changement du label du sélecteur, pas de partage du style par URL.
- **Ordre des tâches** : 1 → 2 sont prérequis de 3, 4, 5 (qui dépendent de `resolveWindArrowLevel`). 3/4/5 sont indépendants entre eux. 6 en dernier.
