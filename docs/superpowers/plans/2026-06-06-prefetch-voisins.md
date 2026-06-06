# Préchargement automatique des échéances voisines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Précharger en arrière-plan les données réelles (variable affichée + couche 2) des échéances voisines de l'échéance courante, dans le sens de navigation, après une courte pause — pour supprimer le lag au scrubbing (issue #46).

**Architecture:** Un module dédié `src/lib/neighbor-prefetch.ts` expose une fonction pure `computeNeighborWindow` (calcul de la plage voisine selon sens/contiguïté) et `initNeighborPrefetch` (abonnement au store `time`, debounce, annulation, appel de `prefetchData`). Initialisé depuis `+page.svelte`. Le préchargement header-only existant (`postReadCallback`, `getNextOmUrls`) est retiré.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Vitest, `@openmeteo/weather-map-layer`.

Spec de référence : `docs/superpowers/specs/2026-06-06-prefetch-voisins-design.md`.

## File Structure

- **Create** `src/lib/neighbor-prefetch.ts` — fonction pure `computeNeighborWindow` + orchestrateur `initNeighborPrefetch`.
- **Create** `src/lib/tests/neighbor-prefetch.test.ts` — tests de la fonction pure.
- **Modify** `src/lib/constants.ts` — trois constantes de configuration.
- **Modify** `src/routes/+page.svelte` — init + cleanup du module.
- **Modify** `src/lib/stores/om-protocol-settings.ts` — retrait du préchargement header-only.
- **Modify** `src/lib/url.ts` — retrait de `getNextOmUrls` + imports orphelins.
- **Modify** `src/lib/tests/url-builder.test.ts` — retrait du `describe('getNextOmUrls')`.
- **Modify** `.claude/rules/architecture.md` — doc du nouveau mécanisme.

---

## Task 1 : Constantes de configuration

**Files:**
- Modify: `src/lib/constants.ts` (à la suite des constantes de cache, après `HTTP_OVERHEAD_BYTES` ligne ~105)

- [ ] **Step 1: Ajouter les constantes**

Ajouter dans `src/lib/constants.ts`, juste après la ligne `export const HTTP_OVERHEAD_BYTES = 1408;` :

```ts
// Préchargement automatique des échéances voisines (issue #46).
// Fenêtre asymétrique dans le sens de navigation : FORWARD pas devant, BACKWARD derrière.
export const NEIGHBOR_PREFETCH_FORWARD = 3;
export const NEIGHBOR_PREFETCH_BACKWARD = 1;
// Pause après le dernier changement d'échéance avant de lancer le préchargement.
export const NEIGHBOR_PREFETCH_DEBOUNCE_MS = 400;
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npm run check`
Expected: PASS (aucune nouvelle erreur de type)

- [ ] **Step 3: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat(prefetch): constantes de configuration du préchargement voisin (#46)"
```

---

## Task 2 : Fonction pure `computeNeighborWindow` (TDD)

**Files:**
- Create: `src/lib/neighbor-prefetch.ts`
- Test: `src/lib/tests/neighbor-prefetch.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/lib/tests/neighbor-prefetch.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { computeNeighborWindow } from '$lib/neighbor-prefetch';

// 6 pas horaires : 00:00 … 05:00
const VALID_TIMES = [
	new Date('2026-06-06T00:00:00Z'),
	new Date('2026-06-06T01:00:00Z'),
	new Date('2026-06-06T02:00:00Z'),
	new Date('2026-06-06T03:00:00Z'),
	new Date('2026-06-06T04:00:00Z'),
	new Date('2026-06-06T05:00:00Z')
];

const CFG = { forward: 3, backward: 1 };

describe('computeNeighborWindow', () => {
	it('avancée d’un pas → 1 derrière, 3 devant', () => {
		// current = 02:00 (idx 2), previous = 01:00 (idx 1) → delta = +1
		const w = computeNeighborWindow(VALID_TIMES[2], VALID_TIMES[1], VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[1]); // idx 2 - 1
		expect(w?.endDate).toEqual(VALID_TIMES[5]); // idx 2 + 3
	});

	it('recul d’un pas → 3 derrière, 1 devant', () => {
		// current = 03:00 (idx 3), previous = 04:00 (idx 4) → delta = -1
		const w = computeNeighborWindow(VALID_TIMES[3], VALID_TIMES[4], VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[0]); // idx 3 - 3
		expect(w?.endDate).toEqual(VALID_TIMES[4]); // idx 3 + 1
	});

	it('saut (|delta| > 1) → fenêtre symétrique ±1', () => {
		// current = 03:00 (idx 3), previous = 00:00 (idx 0) → delta = +3
		const w = computeNeighborWindow(VALID_TIMES[3], VALID_TIMES[0], VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[2]);
		expect(w?.endDate).toEqual(VALID_TIMES[4]);
	});

	it('premier chargement (previousTime null) → fenêtre symétrique ±1', () => {
		const w = computeNeighborWindow(VALID_TIMES[2], null, VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[1]);
		expect(w?.endDate).toEqual(VALID_TIMES[3]);
	});

	it('borne début de run → clamp au premier valid_time', () => {
		// current = 00:00 (idx 0), recul → voudrait idx -3, clamp à 0
		const w = computeNeighborWindow(VALID_TIMES[0], VALID_TIMES[1], VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[0]);
		expect(w?.endDate).toEqual(VALID_TIMES[1]); // idx 0 + 1
	});

	it('borne fin de run → clamp au dernier valid_time', () => {
		// current = 05:00 (idx 5), avancée → voudrait idx 8, clamp à 5
		const w = computeNeighborWindow(VALID_TIMES[5], VALID_TIMES[4], VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[4]); // idx 5 - 1
		expect(w?.endDate).toEqual(VALID_TIMES[5]);
	});

	it('validTimes vide → null', () => {
		expect(computeNeighborWindow(VALID_TIMES[0], null, [], CFG)).toBeNull();
	});

	it('currentTime introuvable → null', () => {
		const unknown = new Date('2026-06-06T09:00:00Z');
		expect(computeNeighborWindow(unknown, null, VALID_TIMES, CFG)).toBeNull();
	});
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/lib/tests/neighbor-prefetch.test.ts`
Expected: FAIL — `computeNeighborWindow` n'existe pas (module introuvable / export manquant).

- [ ] **Step 3: Implémenter la fonction pure**

Créer `src/lib/neighbor-prefetch.ts` :

```ts
export interface NeighborWindow {
	startDate: Date;
	endDate: Date;
}

/**
 * Calcule la plage contiguë d'échéances voisines à précharger autour de `currentTime`.
 *
 * Le sens et la contiguïté sont déduits des index de `currentTime`/`previousTime` dans
 * `validTimes` (pas sur les millisecondes — le pas temporel varie selon le domaine) :
 * - avancée d'un pas (delta = +1)  → [−backward, +forward]
 * - recul d'un pas   (delta = −1)  → [−forward, +backward]
 * - saut (|delta| > 1) ou premier chargement (previousTime null) → ±1 symétrique
 *
 * La plage est clampée aux bornes du run et inclut l'échéance courante (déjà en cache
 * → re-prefetch quasi gratuit). Retourne null si la grille est vide ou l'échéance absente.
 */
export const computeNeighborWindow = (
	currentTime: Date,
	previousTime: Date | null,
	validTimes: Date[],
	cfg: { forward: number; backward: number }
): NeighborWindow | null => {
	if (validTimes.length === 0) return null;

	const currentIdx = validTimes.findIndex((t) => t.getTime() === currentTime.getTime());
	if (currentIdx === -1) return null;

	const prevIdx =
		previousTime === null
			? -1
			: validTimes.findIndex((t) => t.getTime() === previousTime.getTime());
	const delta = prevIdx === -1 ? 0 : currentIdx - prevIdx;

	let before: number;
	let after: number;
	if (delta === 1) {
		before = cfg.backward;
		after = cfg.forward;
	} else if (delta === -1) {
		before = cfg.forward;
		after = cfg.backward;
	} else {
		before = 1;
		after = 1;
	}

	const startIdx = Math.max(0, currentIdx - before);
	const endIdx = Math.min(validTimes.length - 1, currentIdx + after);

	return {
		startDate: validTimes[startIdx],
		endDate: validTimes[endIdx]
	};
};
```

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/lib/tests/neighbor-prefetch.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/neighbor-prefetch.ts src/lib/tests/neighbor-prefetch.test.ts
git commit -m "feat(prefetch): computeNeighborWindow — calcul de la fenêtre voisine (#46)"
```

---

## Task 3 : Orchestrateur `initNeighborPrefetch`

**Files:**
- Modify: `src/lib/neighbor-prefetch.ts`

- [ ] **Step 1: Ajouter l'orchestrateur**

Ajouter en tête de `src/lib/neighbor-prefetch.ts` les imports, puis la fonction `initNeighborPrefetch` à la fin du fichier (après `computeNeighborWindow`).

Imports à placer tout en haut du fichier (avant `export interface NeighborWindow`) :

```ts
import { get } from 'svelte/store';

import {
	NEIGHBOR_PREFETCH_BACKWARD,
	NEIGHBOR_PREFETCH_DEBOUNCE_MS,
	NEIGHBOR_PREFETCH_FORWARD
} from './constants';
import { prefetchData } from './prefetch';
import { metaJson, modelRun, time } from './stores/time';
import { layer2Enabled, selectedDomain, variable, variable2 } from './stores/variables';
```

Fonction à ajouter à la fin du fichier :

```ts
/**
 * Abonne le préchargement automatique au store `time`. À chaque changement d'échéance,
 * (re)arme un debounce ; à l'échéance du timer, précharge les données de la variable
 * affichée (+ variable2 si la couche 2 est active) sur la fenêtre voisine. Un seul
 * préchargement est en vol — tout nouveau lancement annule le précédent.
 *
 * Retourne une fonction de cleanup (désabonnement + clear timer + abort).
 */
export const initNeighborPrefetch = (): (() => void) => {
	let previousTime: Date | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | null = null;

	const triggerPrefetch = async () => {
		const meta = get(metaJson);
		const currentRun = get(modelRun);
		if (!meta || !currentRun) return;

		const current = get(time);
		const validTimes = meta.valid_times.map((vt: string) => new Date(vt));
		const window = computeNeighborWindow(current, previousTime, validTimes, {
			forward: NEIGHBOR_PREFETCH_FORWARD,
			backward: NEIGHBOR_PREFETCH_BACKWARD
		});
		previousTime = new Date(current.getTime());
		if (!window) return;

		controller?.abort();
		controller = new AbortController();
		const signal = controller.signal;

		const domain = get(selectedDomain).value;
		const base = {
			startDate: window.startDate,
			endDate: window.endDate,
			metaJson: meta,
			modelRun: currentRun,
			domain,
			signal
		};

		// Variable principale d'abord (couche visible), puis couche 2 si active.
		await prefetchData({ ...base, variable: get(variable) });
		if (signal.aborted) return;
		if (get(layer2Enabled)) {
			await prefetchData({ ...base, variable: get(variable2) });
		}
	};

	const unsubscribe = time.subscribe(() => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			void triggerPrefetch();
		}, NEIGHBOR_PREFETCH_DEBOUNCE_MS);
	});

	return () => {
		unsubscribe();
		clearTimeout(timer);
		controller?.abort();
	};
};
```

- [ ] **Step 2: Vérifier la compilation et les tests**

Run: `npm run check && npx vitest run src/lib/tests/neighbor-prefetch.test.ts`
Expected: PASS — types OK (signatures `prefetchData`/stores correctes), 8 tests toujours verts.

Note : si `npm run check` signale une incompatibilité de type sur `base` (ex. `domain` typé `string`), vérifier que `PrefetchOptions.domain` est bien `string` dans `src/lib/prefetch.ts:21` — c'est le cas attendu. Les stores `selectedDomain`/`variable`/`variable2`/`layer2Enabled` viennent de `src/lib/stores/variables`, et `time`/`metaJson`/`modelRun` de `src/lib/stores/time`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/neighbor-prefetch.ts
git commit -m "feat(prefetch): initNeighborPrefetch — orchestrateur debounce + abort (#46)"
```

---

## Task 4 : Câblage dans `+page.svelte`

**Files:**
- Modify: `src/routes/+page.svelte` (import en tête ; `onMount` ~67 ; `onDestroy` ~235)

- [ ] **Step 1: Ajouter l'import**

Dans la zone d'imports `$lib/*` de `src/routes/+page.svelte` (à côté de `import { initHillshadeFromPrefs } from '$lib/hillshade';` ligne ~50), ajouter :

```ts
	import { initNeighborPrefetch } from '$lib/neighbor-prefetch';
```

- [ ] **Step 2: Déclarer la variable de cleanup et initialiser dans `onMount`**

Repérer l'appel `initHillshadeFromPrefs();` dans `onMount` (ligne ~129). Juste après cette ligne, ajouter l'initialisation et stocker le cleanup dans une variable de module (déclarée avec les autres `let …Subscription` du `<script>`, ex. à côté de `domainSubscription`).

Déclaration (zone des `let` du `<script>`, près des autres subscriptions) :

```ts
	let stopNeighborPrefetch: (() => void) | undefined;
```

Dans `onMount`, juste après `initHillshadeFromPrefs();` :

```ts
		stopNeighborPrefetch = initNeighborPrefetch();
```

- [ ] **Step 3: Nettoyer dans `onDestroy`**

Dans le bloc `onDestroy(() => { … })` (ligne ~235), à côté de `domainSubscription();` / `variableSubscription();`, ajouter :

```ts
		stopNeighborPrefetch?.();
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(prefetch): initialise le préchargement voisin au montage (#46)"
```

---

## Task 5 : Retirer le préchargement header-only du `postReadCallback`

**Files:**
- Modify: `src/lib/stores/om-protocol-settings.ts:135-148`

- [ ] **Step 1: Supprimer le bloc de préchargement header-only**

Dans `postReadCallback` (`src/lib/stores/om-protocol-settings.ts`), supprimer ces lignes (la boucle `nextOmUrls`), en conservant la transformation `ecmwf_ifs` qui suit :

```ts
		const nextOmUrls = getNextOmUrls(state.omFileUrl, get(selectedDomain), get(metaJson));
		for (const nextOmUrl of nextOmUrls) {
			if (nextOmUrl === undefined) continue;
			// Préchargement best-effort : on enchaîne le prefetch après l'ouverture du
			// fichier, et on avale les rejets — un 404 en lisière d'horizon (pas de
			// frame suivante) ne doit pas remonter en rejet de promesse non capturé.
			void omFileReader
				.setToOmFile(nextOmUrl)
				// Requête sur la queue du fichier pour la mettre en cache. Demander une
				// variable inexistante évite de télécharger des données supplémentaires.
				.then(() => omFileReader.prefetchVariable('not_a_real_variable'))
				.catch(() => {});
		}
```

Le `postReadCallback` doit conserver son bloc `if (state.dataOptions.domain.value === 'ecmwf_ifs' && …)`.

- [ ] **Step 2: Retirer l'import `getNextOmUrls`**

Dans `src/lib/stores/om-protocol-settings.ts`, supprimer la ligne d'import (ligne ~31) :

```ts
import { getNextOmUrls } from '$lib/url';
```

Si l'import groupait d'autres symboles, ne retirer que `getNextOmUrls`. Vérifier ensuite que `get`, `selectedDomain`, `metaJson` (s'ils n'étaient utilisés que par le bloc supprimé) ne deviennent pas des imports orphelins — les retirer le cas échéant. `npm run check` à l'étape suivante les signalera.

- [ ] **Step 3: Vérifier la compilation**

Run: `npm run check`
Expected: PASS. Corriger tout import devenu inutilisé signalé par svelte-check.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/om-protocol-settings.ts
git commit -m "refactor(prefetch): retire le préchargement header-only du postReadCallback (#46)"
```

---

## Task 6 : Retirer `getNextOmUrls` et ses imports orphelins

**Files:**
- Modify: `src/lib/url.ts` (fonction `getNextOmUrls` ~324-389 ; imports ~4-10)
- Modify: `src/lib/tests/url-builder.test.ts` (`describe('getNextOmUrls')` ~57-78)

- [ ] **Step 1: Supprimer la fonction `getNextOmUrls`**

Dans `src/lib/url.ts`, supprimer entièrement `export const getNextOmUrls = (…) => { … };` (de la signature jusqu'au `};` final, ~ lignes 324-389), y compris ses helpers internes `clampRun` / `currentModelRun` / `prevDate` / `nextDate` qui sont locaux à la fonction.

- [ ] **Step 2: Retirer les imports devenus orphelins**

Dans le bloc d'import `@openmeteo/weather-map-layer` (`src/lib/url.ts:4-10`), `closestModelRun` et `domainStep` ne sont plus utilisés que par `getNextOmUrls`, et les types `Domain` / `DomainMetaDataJson` n'étaient utilisés que par sa signature. Réduire le bloc à :

```ts
import { defaultOmProtocolSettings } from '@openmeteo/weather-map-layer';
```

Conserver tous les autres imports du fichier (`anomalyPhase`, `provisionalDateSet`, `fmtDateYMD`, `getModelsBucketUrl`, `ANOMALY_DOMAIN`, `ANOMALY_VARIABLE`, etc. — toujours utilisés ailleurs).

- [ ] **Step 3: Retirer le bloc de tests**

Dans `src/lib/tests/url-builder.test.ts`, supprimer l'import `getNextOmUrls` (le retirer de la ligne 6 `import { getNextOmUrls, getOMUrl, getOMUrlFor } from '$lib/url';` → `import { getOMUrl, getOMUrlFor } from '$lib/url';`) et tout le bloc `describe('getNextOmUrls', () => { … })` (~lignes 57-78). Vérifier qu'aucune variable de fixture (ex. `convectionDomain`) ne devient orpheline ; si elle n'est utilisée que par ce describe, la retirer aussi.

- [ ] **Step 4: Vérifier compilation + tests**

Run: `npm run check && npx vitest run src/lib/tests/url-builder.test.ts`
Expected: PASS — aucun import inutilisé, le fichier de test passe sans le describe retiré.

- [ ] **Step 5: Commit**

```bash
git add src/lib/url.ts src/lib/tests/url-builder.test.ts
git commit -m "refactor(prefetch): retire getNextOmUrls devenu code mort (#46)"
```

---

## Task 7 : Mettre à jour la doc d'architecture

**Files:**
- Modify: `.claude/rules/architecture.md` (§ « Préchargement (prefetch) — réintroduit seul »)

- [ ] **Step 1: Documenter le préchargement automatique**

Dans `.claude/rules/architecture.md`, à la fin du paragraphe `**Préchargement (prefetch) — réintroduit seul.**`, ajouter :

```markdown

**Préchargement automatique des échéances voisines (#46).** `src/lib/neighbor-prefetch.ts`
s'abonne au store `time` (initialisé dans `+page.svelte`), debounce
`NEIGHBOR_PREFETCH_DEBOUNCE_MS` (400 ms), détecte le sens de navigation via les index
`valid_times` et précharge une fenêtre asymétrique (`computeNeighborWindow` : 3 devant /
1 derrière dans le sens, ±1 sur saut/premier chargement) de la variable affichée — et de
`variable2` si `layer2Enabled` — via `prefetchData()`. Un seul préchargement en vol
(`AbortController`, annulé à chaque nouveau changement). Les contours/flèches partagent la
variable principale → couverts sans requête dédiée. Remplace l'ancien préchargement
header-only du `postReadCallback` (`getNextOmUrls`, retiré).
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/architecture.md
git commit -m "docs(prefetch): documente le préchargement automatique des voisins (#46)"
```

---

## Task 8 : Vérification finale

**Files:** aucune modification — vérification globale.

- [ ] **Step 1: Suite complète check + lint + tests**

Run: `npm run check && npm run lint && npm run test -- --run`
Expected: PASS partout. Si `npm run lint` signale un ordre d'import, lancer `npm run format` puis re-commit.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build statique réussi.

- [ ] **Step 3: Validation manuelle locale (à faire par l'utilisateur)**

Démarrer `npm run dev`, ouvrir l'app, onglet Réseau :
- scrubber rapidement plusieurs échéances → **aucune** requête `.om` voisine pendant le défilement (debounce) ;
- s'arrêter → après ~400 ms, requêtes des échéances voisines (sens avant : ~3 devant) ;
- revenir sur une échéance préchargée → affichage **instantané** (cache hit, pas de download) ;
- activer la couche 2 → les voisins préchargent aussi `variable2`.

- [ ] **Step 4: Commit éventuel des reformatages**

```bash
git add -A
git commit -m "style(prefetch): formatage" || echo "rien à committer"
```

---

## Self-Review (effectué)

- **Couverture spec :** fenêtre adaptative (Task 2), couches principale+2 (Task 3), debounce+abort (Task 3), init/cleanup (Task 4), retrait header-only (Task 5), retrait `getNextOmUrls`+tests (Task 6), constantes (Task 1), doc (Task 7), tests pure-function (Task 2), validation manuelle debounce/abort (Task 8). ✔
- **Placeholders :** aucun — tout le code est fourni.
- **Cohérence des types :** `computeNeighborWindow(currentTime, previousTime, validTimes, cfg)` et `NeighborWindow` identiques entre Task 2, Task 3 et le spec ; `initNeighborPrefetch(): (() => void)` cohérent entre Task 3 et Task 4 ; `prefetchData(PrefetchOptions)` consommé conformément à `prefetch.ts`.
