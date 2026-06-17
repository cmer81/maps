# Calque « Valeurs aux points de grille » (façon Météociel)

**Date** : 2026-06-16
**Statut** : design validé, prêt pour le plan d'implémentation

## Contexte & objectif

Demande récurrente (relayée par un prévi Météo-France et le président de l'association) :
afficher la **valeur numérique du modèle à chaque point de grille**, superposée à la
carte, comme le fait Météociel (chiffres de température semés sur la grille du modèle).

Aujourd'hui le client rend la donnée en raster coloré + isolignes optionnelles + points
de grille (cercles orange). Aucune valeur chiffrée n'est lisible directement sur la
carte hors du popup au clic. Les prévis veulent lire les valeurs exactes du modèle d'un
coup d'œil, sans cliquer.

## Découverte technique décisive

Les tuiles vecteur émises par `@openmeteo/weather-map-layer` exposent déjà une
source-layer **`'grid'`** (celle des points orange, toggle « grille »). Chaque point
y porte :

```js
properties.value = Number(value.toFixed(2)); // valeur EXACTE au nœud (non interpolée)
properties.direction = directions[index]; // si la variable est du vent
```

Référence package : `forEachPoint` → construction de la couche `'grid'` dans
`node_modules/@openmeteo/weather-map-layer/dist/index.mjs` (writeLayer `name: "grid"`).

**Conséquence** : afficher le chiffre = ajouter un `symbol` layer sur cette source-layer
existante, exactement comme les étiquettes d'isolignes (`vectorContourLabelsLayer` /
`buildContourLabelExpr`). **Zéro requête réseau supplémentaire, zéro dépendance.**

## Risque principal & parade

`grid.forEachPoint()` émet **tous** les nœuds dans l'emprise, sans décimation par zoom.
Pour AROME France (1121×717 ≈ 800 000 points), à l'échelle continentale un `symbol`
layer non filtré devrait calculer le layout + collision de centaines de milliers
d'étiquettes → jank. Les cercles encaissent ça, le texte non.

Parade : **décimation par zoom** (cf. §3), à deux niveaux qui se combinent.

## Décisions de design (validées)

| Sujet           | Décision                                                              |
| --------------- | --------------------------------------------------------------------- |
| Densité         | Décimation par zoom (vrai « façon Météociel ») — clairsemé puis dense |
| Relation grille | Toggle **indépendant**, décorrélé des points orange                   |
| Format          | **Entiers**, conversion d'unité d'affichage incluse (°C/°F, km/h…)    |

## Architecture

### 1. Source de données — aucune nouvelle

Le `symbol` layer s'accroche à la source-layer `'grid'` déjà émise par le package
(mêmes tuiles que les points orange). Il rejoint la liste de couches du **`vectorManager`**
existant (à côté de `vectorGridLayer` / `vectorContourLabelsLayer`) — pas de nouveau
manager, pas de nouvelle source, pas de requête réseau dédiée.

### 2. Activation

- Nouveau store persisté `gridValues: boolean` (défaut `false`) + param URL `grid_values`.
- Dans `getOMUrlFor` (`url.ts`) : `grid = vectorOverride?.grid ?? (vectorOptions.grid || gridValues)`
  → activer les valeurs force `&grid=true` dans l'URL même si les points orange sont off,
  sans afficher les dots (les dots restent gatés sur `vectorOptions.grid`, le nouveau layer
  sur `gridValues`).
- Toggle indépendant ajouté **sous la section « Grille »** de
  `grid-settings.svelte` (deux switches : « Points de grille » / « Valeurs aux points »).
  Orthogonaux logiquement, regroupés visuellement (même sujet).
- Hydratation du param URL dans `urlParamsToPreferences()`, défaut dans
  `COMPLETE_DEFAULT_VALUES` (`constants.ts`).

### 3. Décimation par zoom (le cœur)

Filtre MapLibre sur le `id` du point (`id = j·nx + i`), structuré en
**`['step', ['zoom'], …]`** — le `['zoom']` reste au niveau racine du filtre, seule forme
acceptée par MapLibre dans un filtre :

```
i = id % nx          j = floor(id / nx)
garder si   i % strideX(zoom) == 0   ET   j % strideY(zoom) == 0
```

Chaque branche du `step` est un booléen :

```js
[
	'all',
	['==', ['%', ['%', ['id'], nx], strideX], 0],
	['==', ['%', ['floor', ['/', ['id'], nx]], strideY], 0]
];
```

`strideX/strideY` sont **précalculés par domaine** à partir du pas de grille (`dx`/`dy`
en degrés) et du zoom, pour viser un espacement écran ~constant (cible ≈ 45-50 px).
Évaluation à chaque zoom entier (≈ 0..14) via la projection web-mercator :
`pxParDegréLon ≈ 512·2^zoom / 360` (à une latitude de référence = centre du domaine),
`stride = max(1, round(cibleEspacementPx / (pxParDegré · pas°)))`.

Deux niveaux de filtrage se combinent :

1. le **stride analytique** borne le nombre de symboles envoyés au layout (perf : jamais
   800k) ;
2. la **collision MapLibre** (`text-allow-overlap: false`, défaut) élague le résidu
   (lisibilité). Le stride n'a donc qu'à être dans le bon ordre de grandeur.

Le stride dépendant du domaine (et l'expr label dépendant de l'unité), la couche est
reconstruite via `reloadVectorStyle()` au changement de domaine / d'unité — mécanisme
déjà existant.

**Types de grille** :

- **régulières** (`RegularGrid`) et **projetées** (`ProjectionGrid`) : `id = j·nx + i`
  avec `nx` constant → lattice propre, traitement first-class.
- **gaussiennes** (`GaussianGrid`, largeur de ligne variable `nxOf(y)`, `index =
integral(y) + x`) : l'extraction `i = id % nx` est invalide. Repli sur une décimation
  1D `id % stride` (scatter régulier, acceptable). Le set exact de domaines concernés
  sera vérifié au plan (lire `domain.grid.type`).

### 4. Format & style

- **Entiers**, via la même conversion d'unité affine que les isolignes. Nouvel helper
  `buildGridValueLabelExpr(variable, baseUnit, units)` dans `vector-styles.ts`, analogue à
  `buildContourLabelExpr` mais `max-fraction-digits: 0` (donc arrondi) ; sans conversion :
  `['to-string', ['round', ['get', 'value']]]`.
- Style repris des étiquettes d'isolignes : texte noir / halo blanc (clair), texte blanc /
  halo noir (sombre), `text-halo-width` 1.5, `text-font: ['Noto Sans Regular']`, taille
  ~11-12 px, `symbol-placement: 'point'`, `text-allow-overlap: false`. Le layer suit le
  fade opacity opt-in des autres `SlotLayer` (`text-opacity` 0→1, transition 200 ms).

### 5. Garde-fous lisibilité

Clairsemé à l'échelle France (stride élevé), densification progressive au zoom, halo pour
détacher du fond coloré, collision pour ne jamais empiler. Rendu cible = la capture
Météociel fournie.

## Fichiers touchés

- `src/lib/stores/vector.ts` — `gridValues` (+ défaut dans `constants.ts`).
- `src/lib/url.ts` — param `grid_values` (hydratation + `updateUrl`), `grid` OR dans
  `getOMUrlFor`.
- `src/lib/layers.ts` — nouveau `SlotLayer` (gaté sur `gridValues`) ajouté à la liste du
  `vectorManager`.
- `src/lib/vector-styles.ts` — `buildGridValueLabelExpr` + helper de calcul de stride par
  domaine + builder du filtre `step(zoom)` sur `id`.
- `src/lib/components/settings/grid-settings.svelte` — 2ᵉ switch « Valeurs aux points ».
- `src/lib/constants.ts` — défaut `COMPLETE_DEFAULT_VALUES`.

## Tests (Vitest, builders purs)

- `buildGridValueLabelExpr` : arrondi entier + conversion d'unité (°C identité, °C→°F,
  km/h, etc.).
- Calcul de stride : `dx`/`dy` + zoom + latitude de référence → stride attendu (cas
  AROME 0,025° et GFS 0,25°, plusieurs zooms).
- Filtre `id` : extraction `i`/`j` et garde lattice (cas régulier) ; repli 1D (cas
  gaussien).

## Hors scope (YAGNI)

- Décimale configurable par variable.
- Coloration du texte par valeur.
- Réglage de densité exposé à l'utilisateur (le stride auto suffit).

À ajouter seulement si réclamé.
