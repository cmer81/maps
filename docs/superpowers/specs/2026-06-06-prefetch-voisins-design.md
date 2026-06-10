# Préchargement automatique des échéances voisines

Date : 2026-06-06
Issue : [#46 — perf: lag au chargement de nouvelles échéances](https://github.com/cmer81/maps/issues/46)
Statut : design validé, en attente de plan d'implémentation

## Problème

Chaque changement d'échéance déclenche un cycle **download S3 → decode WASM → render**
(`onDateChange` → `changeOMfileURL`, `time-selector.svelte`). Le coût de ce cycle est le
lag perçu par le testeur (iMac 2014, Firefox).

Un préchargement des voisins existe déjà dans `postReadCallback`
(`stores/om-protocol-settings.ts:135`) : après chaque lecture, il précharge le fichier
précédent et suivant (±1) via `getNextOmUrls()`. **Mais il ne charge que le header/index**
du `.om` voisin :

```js
omFileReader.setToOmFile(nextOmUrl).then(() => omFileReader.prefetchVariable('not_a_real_variable'))
```

La variable `'not_a_real_variable'` est volontairement inexistante pour « éviter de
télécharger des données supplémentaires ». Résultat : les **blocs de données** de la
variable affichée (le gros du coût) ne sont jamais préchargés, donc le lag persiste.

## Objectif

Précharger les **données réelles** (variable affichée + couche 2 si active, sur la zone
visible) des échéances voisines de l'échéance courante, dans le sens de navigation, après
une courte pause. Le scrubbing devient instantané là où l'utilisateur se dirige.

## Décisions de conception

| Point | Décision |
|---|---|
| Fenêtre | **Adaptative au sens** : 3 échéances devant / 1 derrière dans le sens de navigation détecté. |
| Saut / 1er chargement | Fenêtre symétrique **±1**. |
| Couches | Variable principale **+ `variable2` si `layer2Enabled`**. Les contours/flèches partagent la variable principale → couverts sans requête dédiée (même domaine pour les deux couches : un seul store `domain`). |
| Déclenchement | **Debounce 400 ms** après le dernier changement d'échéance. |
| Annulation | Un seul `AbortController` actif ; chaque nouveau lancement abort le précédent. |
| Implémentation | Module dédié `src/lib/neighbor-prefetch.ts`, store-driven, initialisé depuis `+page.svelte`. |
| Mécanisme existant | **Retiré** : préchargement header-only du `postReadCallback`, `getNextOmUrls` et ses tests (pas de code mort). |
| Toggle UI | Aucun pour l'instant (YAGNI). Extension naturelle : un réglage dans `cache-settings.svelte`. |

## Architecture

Nouveau module **`src/lib/neighbor-prefetch.ts`**.

```ts
// Fonction PURE, testable en isolation — aucun accès réseau/store.
// Détermine sens ET contiguïté à partir des index de currentTime/previousTime
// dans validTimes, puis retourne une plage contiguë [startDate, endDate] clampée
// aux bornes du run, incluant l'échéance courante (déjà en cache → cache hit gratuit).
// previousTime null/introuvable → premier chargement → fenêtre ±1.
export const computeNeighborWindow = (
  currentTime: Date,
  previousTime: Date | null,
  validTimes: Date[],
  cfg: { forward: number; backward: number }
): { startDate: Date; endDate: Date } | null

// Effet de bord : abonnement store `time` + debounce + abort.
// Retourne une fonction de cleanup (unsubscribe + clear timer + abort).
export const initNeighborPrefetch = (): (() => void)
```

- `initNeighborPrefetch` s'abonne au store `time`. À chaque tick il lit `selectedDomain`,
  `variable`, `variable2`, `layer2Enabled`, `modelRun`, `metaJson`.
- Le réseau passe **exclusivement** par `prefetchData()` (`prefetch.ts`, inchangé) qui
  filtre les `valid_times` dans la plage et précharge chaque pas via
  `omFileReader.prefetchVariable(variable, ranges)` avec `ranges = getRanges(grid, currentBounds)`
  (zone visible uniquement, 8 workers concurrents).
- Le module ne touche jamais aux sources/layers MapLibre.
- Initialisé dans `+page.svelte` (`onMount`), cleanup dans le `return`.

### Détection du sens & contiguïté

Le module mémorise le `time` précédent et le passe à `computeNeighborWindow`. La fonction
raisonne sur les **index dans `validTimes`** (pas sur les millisecondes — le pas temporel
peut varier selon le domaine) :

- `currentIdx = validTimes.findIndex(currentTime)` ; `null` si introuvable.
- `previousTime` null/introuvable → **premier chargement** → fenêtre symétrique `±1`.
- `delta = currentIdx − prevIdx` :
  - `delta === 1` → avancée d'un pas → fenêtre `[−backward, +forward]` (1 derrière, 3 devant) ;
  - `delta === -1` → recul d'un pas → fenêtre `[−forward, +backward]` (3 derrière, 1 devant) ;
  - sinon (`|delta| > 1`, saut) → fenêtre symétrique `±1`.

### Constantes (`constants.ts`)

```ts
export const NEIGHBOR_PREFETCH_FORWARD = 3;
export const NEIGHBOR_PREFETCH_BACKWARD = 1;
export const NEIGHBOR_PREFETCH_DEBOUNCE_MS = 400;
```

## Data flow

1. L'utilisateur change d'échéance → `time` change.
2. Le subscriber (re)arme le timer de debounce (400 ms). Scrubbing rapide → aucune requête.
3. Au déclenchement : abort du préchargement précédent, nouveau `AbortController`.
4. `direction` calculé, `computeNeighborWindow` → `{ startDate, endDate }` (ou `null` → no-op).
5. `prefetchData({ variable principale, plage, domain, modelRun, metaJson, signal })` (await).
6. Si `layer2Enabled` : `prefetchData({ variable2, … même plage/signal })`.
7. Résultats ignorés (best-effort). Le block cache du reader est désormais chaud pour les voisins.

## Error handling

- `prefetchData` avale déjà les erreurs par pas (catch silencieux, 404 en lisière d'horizon).
- Abort → silencieux, pas d'erreur remontée.
- Garde-fous : no-op si `metaJson` ou `modelRun` absents, ou si `computeNeighborWindow`
  retourne `null`.
- Priorité : variable principale préchargée avant la couche 2 (la couche visible d'abord).

## Retrait du code existant

- `stores/om-protocol-settings.ts` : retirer le bloc `for (const nextOmUrl of nextOmUrls)`
  (lignes ~136-148) du `postReadCallback`. **Conserver** la transformation
  `ecmwf_ifs / pressure_msl`.
- `url.ts` : retirer `getNextOmUrls`. Vérifier et retirer les helpers devenus orphelins
  s'ils ne sont utilisés que par elle (`closestModelRun`, `domainStep`, `anomalyPhase`,
  `provisionalDateSet`, imports associés) — **ne pas retirer** ceux utilisés ailleurs.
- `tests/url-builder.test.ts` : retirer le `describe('getNextOmUrls', …)`.

## Tests (`src/lib/tests/neighbor-prefetch.test.ts`)

Sur `computeNeighborWindow` (fonction pure) :

- avancée d'un pas (`delta = 1`) → plage `[currentTime − 1 pas, currentTime + 3 pas]` ;
- recul d'un pas (`delta = -1`) → plage `[currentTime − 3 pas, currentTime + 1 pas]` ;
- saut (`|delta| > 1`) → plage `±1` ;
- `previousTime = null` (premier chargement) → plage `±1` ;
- borne début de run → clamp au premier `valid_time` ;
- borne fin de run → clamp au dernier `valid_time` ;
- `validTimes` vide ou `currentTime` introuvable → `null`.

Le debounce/abort (effet de bord) est validé manuellement en local (Network tab : pas de
requêtes pendant un scrubbing rapide, requêtes voisines après la pause).

## Docs à mettre à jour (même changement)

- `.claude/rules/architecture.md` § Playback/Préchargement : décrire le préchargement
  automatique des voisins et le retrait du header-only du `postReadCallback`.
