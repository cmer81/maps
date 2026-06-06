# Calque « Stations Infoclimat » — design

**Date :** 2026-06-03
**Statut :** validé (brainstorming), en attente de relecture avant plan d'implémentation

## Objectif

Afficher le réseau de stations météo Infoclimat sur la carte MapLibre, de façon
**discrète et élégante** : un calque de repérage (où sont les stations), pas un
calque de données temps réel. La source `stations_xhr.php` ne fournit que des
**métadonnées** (position, nom, altitude, département, dates d'activité), aucune
observation — ce qui cadre exactement avec un calque de repérage opt-in.

## Décisions de cadrage (brainstorming)

| Question                                 | Décision                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Interaction au clic                      | Popup métadonnées + lien vers la fiche Infoclimat                                               |
| Livraison de la donnée (contrainte CORS) | **Snapshot statique bundlé** (comme `departements.geojson`)                                     |
| Périmètre des stations                   | **Actives récentes uniquement** (`derniere_activite` < 30 j), tous pays                         |
| Style de marqueur                        | **« C »** : cœur slate `#1e293b` + liseré blanc (contraste clair/sombre sans changer de teinte) |
| Densité / zoom                           | **Apparition progressive** : masqué dézoomé, fondu à l'approche régionale                       |
| Toggle par défaut                        | **OFF** (overlay dense → opt-in), contrairement aux départements (ON)                           |

### Contrainte CORS (justification du snapshot)

`https://www.infoclimat.fr/opendata/stations_xhr.php` ne renvoie **aucun en-tête
`Access-Control-Allow-Origin`** → un `fetch` direct depuis le navigateur est
bloqué. L'app étant un export statique 100 % client (`adapter-static`, pas de
SSR), la solution robuste est de bundler un snapshot GeoJSON dans `static/`,
exactement comme `static/departements.geojson` (qui a été bundlé pour la même
raison). Les métadonnées de station sont quasi statiques (positions fixes,
ajouts de stations occasionnels), donc un snapshot régénérable convient.

## Architecture

### 1. Snapshot de données

**Générateur :** `scripts/generate-stations.mjs` (Node ESM, exécuté à la demande,
pas dans le build CI).

- `fetch` de `https://www.infoclimat.fr/opendata/stations_xhr.php`.
- **Filtre « actif »** : conserver les stations dont `derniere_activite` est une
  date valide (≠ `0000-00-00 00:00:00`) et < 30 jours avant la date de génération.
- Conversion en **GeoJSON `FeatureCollection`** de `Point`
  (`[longitude, latitude]`), propriétés **minimales** par feature :
  - `id` (string) — identifiant station Infoclimat
  - `name` (string) — `libelle`
  - `dept` (string) — `departement`
  - `alt` (number) — `altitude`
  - `last` (string) — `derniere_activite` (pour affichage popup)
- Écriture dans `static/infoclimat-stations.geojson`.
- La logique de filtre est **extraite en fonction pure exportée**
  (`isRecentlyActive(derniereActivite, now)` ou `filterActiveStations(rows, now)`)
  pour être testable sans réseau.

Taille estimée : ~860–913 features, ~150 KB (ordre de grandeur de
`departements.geojson`). Acceptable pour un bundle statique.

### 2. Module de rendu — `src/lib/stations-layer.ts`

Suit le pattern de `src/lib/departments-layer.ts` :

- **Une** `geojson` source (`omStationsSource`) + **un** layer `circle`
  (`omStationsLayer`).
- Fetch **paresseux** du GeoJSON au premier affichage, **cache module-scope**
  (`cachedData` / `inflight`), de sorte que les bascules de toggle suivantes
  soient instantanées.
- `ensureStationsLayer()` — enregistrement **idempotent** (réinscriptible après
  un reload de style MapLibre).
- `refreshStations()` — si `showStations` est faux → source vidée
  (`FeatureCollection` vide) ; sinon → fetch + `setData`.
- **Placement :** **au-dessus** du raster et des layers vecteur (pas de `beforeId`,
  ou explicitement au sommet), pour que les marqueurs restent **cliquables et
  visibles** — contrairement aux contours départements qui passent sous
  `BEFORE_LAYER_VECTOR`.

**Paint (style « C »), valeurs dans `constants.ts` :**

- `circle-color` : `#1e293b` (slate-800), identique clair/sombre.
- `circle-stroke-color` : `#ffffff`.
- `circle-stroke-width` : ~`1.5`.
- `circle-radius` : interpolé sur le zoom, ex. `['interpolate', ['linear'],
['zoom'], 6, 3, 10, 5]`.
- **Apparition progressive** : `circle-opacity` et `circle-stroke-opacity`
  interpolés — `0` sous `z≈6`, fondu `z6→z7.5`, plein au-delà. Seuil ajustable
  via constante (`STATIONS_FADE_*`).

### 3. État (store) + UI réglages

- `src/lib/stores/stations.ts` :

  ```ts
  import { persisted } from 'svelte-persisted-store';

  export const DEFAULT_SHOW_STATIONS = false;
  export const showStations = persisted('show_stations', DEFAULT_SHOW_STATIONS);
  ```

  **OFF par défaut** (overlay dense → opt-in).

- Toggle ajouté dans `src/lib/components/chrome/advanced-panel.svelte`, à côté du
  toggle « départements » (`showDepartments`), même présentation.

### 4. Interaction — popup au clic

- Handler **layer-scopé** `map.on('click', STATIONS_LAYER_ID, handler)` :
  ouvre un `maplibregl.Popup` dédié positionné sur la station, contenant :
  - **nom** (gras) · **altitude** (`{alt} m`) · **département** (`{dept}`)
  - **dernière activité** (`last`, formaté lisible)
  - lien **« Voir sur Infoclimat ↗ »** vers
    `https://www.infoclimat.fr/observations-meteo/temps-reel/{slug}/{id}.html`
    avec `target="_blank" rel="noopener"`.
- **Slug** : dérivé du `name` par un `slugify` simple (minuscules, accents
  retirés, espaces → `-`). **Cosmétique uniquement** — Infoclimat résout la fiche
  par `id` (un slug vide/faux renvoie tout de même 200). Pas besoin de slugifier
  parfaitement.
- **Curseur :** `map.on('mouseenter'/'mouseleave', STATIONS_LAYER_ID, …)` →
  `cursor: pointer`.
- **Intégration avec le popup existant (`popup.ts`) :** le handler **global**
  `map.on('click', …)` de `addPopup()` (qui affiche la valeur du modèle au point)
  doit **ignorer** les clics tombant sur une station, sinon double-popup. Garde en
  début de handler :
  ```ts
  if (map.queryRenderedFeatures(e.point, { layers: [STATIONS_LAYER_ID] }).length) return;
  ```
  (le layer peut ne pas exister → entourer d'un guard `getLayer`).

### 5. Câblage — `src/routes/+page.svelte`

- Appeler `ensureStationsLayer()` à l'initialisation de la carte (après le style
  prêt), et `refreshStations()`.
- `$effect` réactif sur `showStations` → `refreshStations()` (même schéma que
  `showDepartments` / `refreshDepartments`).
- Réinscription après reload de style si applicable (idempotence déjà gérée).

## Découpage (unités à responsabilité unique)

| Unité                                | Rôle                                          | Dépend de                   |
| ------------------------------------ | --------------------------------------------- | --------------------------- |
| `generate-stations.mjs`              | Fetch + filtre + écriture GeoJSON             | réseau (hors runtime app)   |
| `filterActiveStations` (pure)        | Sélection actives < 30 j                      | —                           |
| `slugify` + `buildStationUrl` (pure) | URL fiche Infoclimat                          | —                           |
| `stations-layer.ts`                  | Source/layer MapLibre, fetch paresseux, popup | store `showStations`, `map` |
| `stores/stations.ts`                 | État persisté du toggle                       | —                           |
| `advanced-panel.svelte`              | UI du toggle                                  | store                       |

## Tests (Vitest, `src/lib/tests/`)

1. **`slugify` + `buildStationUrl`** : libellés avec accents/espaces → URL bien
   formée ; vérifie que l'`id` est présent dans l'URL.
2. **`filterActiveStations`** : écarte `0000-00-00 00:00:00` et les dates > 30 j,
   conserve une date récente (now injecté pour déterminisme).
3. **Forme du GeoJSON** (optionnel léger) : une station d'entrée → un `Feature`
   `Point` avec `id`/`name`/`dept`/`alt`/`last` et coordonnées `[lon, lat]`.

## Fichiers

**Nouveaux**

- `scripts/generate-stations.mjs`
- `static/infoclimat-stations.geojson` (généré, commité)
- `src/lib/stations-layer.ts`
- `src/lib/stores/stations.ts`
- `src/lib/tests/stations.test.ts`

**Modifiés**

- `src/routes/+page.svelte` — câblage `ensure`/`refresh` + `$effect`
- `src/lib/popup.ts` — garde « clic sur station » dans le handler global
- `src/lib/components/chrome/advanced-panel.svelte` — toggle
- `src/lib/constants.ts` — `STATIONS_GEOJSON_URL`, seuils de zoom/fondu, URL base fiche
- `.claude/rules/architecture.md` — section overlay stations + commande de régénération

## Hors périmètre (YAGNI)

- Pas d'observations temps réel (la source ne les fournit pas).
- Pas de clustering ni de bulles de comptage (apparition progressive retenue).
- Pas de proxy worker ni de pipeline R2 (snapshot statique retenu).
- Pas de régénération automatique en CI (script manuel, documenté).

## Accessibilité / notes

- Les marqueurs `circle` sur canvas ne sont pas navigables au clavier — limite
  inhérente aux marqueurs cartographiques, cohérente avec le calque départements.
  Le **contenu du popup** (lien) reste focusable une fois ouvert.
- Le style « C » garantit un contraste ≥ 3:1 sur fonds clairs et foncés grâce au
  liseré blanc, sans dépendre de la couleur du raster sous-jacent.
- Snapshot figé : les nouvelles stations n'apparaissent qu'après régénération.
  Documenté ; acceptable pour un calque de repérage.
