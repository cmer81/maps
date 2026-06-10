# Contours de départements via la couche `boundary` du fond

**Date** : 2026-06-10
**Statut** : approuvé, prêt pour plan d'implémentation

## Problème

L'overlay des départements français repose sur `static/departements.geojson` (source
`gregoiredavid/france-geojson`, IGN). Trois défauts remontés :

1. **Poids** — 556 KB (96 features), bundlé dans le build.
2. **Coordonnées à 16-18 décimales** — bruit flottant inutile (6 décimales ≈ 11 cm) qui
   gonfle le fichier.
3. **Non-raccord topologique** — les frontières IGN ne coïncident pas avec celles du fond
   OpenFreeMap (dérivé d'OpenStreetMap).

## Cause racine

Le basemap minimal (`src/lib/basemap/minimal-{light,dark}.json`) **stylise déjà** la couche
vectorielle `boundary` des tuiles OpenFreeMap (`tiles.openfreemap.org/planet`, schéma
OpenMapTiles 3.x) :

- `admin_sub` — `admin_level in [4, 6, 8]`, ligne pointillée grise, dessinée **sous** le
  raster météo.
- `admin_country` — `admin_level <= 2`, frontières nationales.

L'overlay geojson est posé **au-dessus** du raster (avant `BEFORE_LAYER_VECTOR`). Ses lignes
(source IGN) ne s'alignent pas avec celles que le fond trace lui-même depuis OSM → c'est le
décalage visible. En prime : redondance + 556 KB + décimales parasites.

En France métropolitaine, `admin_level = 6` correspond exactement aux **départements**. Les
tuiles OSM exposent ces frontières de z5 à z14.

## Conception retenue (approche A)

Abandonner l'overlay geojson autonome au profit d'un layer `line` lisant la couche `boundary`
déjà chargée par le fond. Les lignes proviennent alors des **mêmes tuiles OSM** que le
basemap → raccord parfait, poids nul, plus de décimales.

### Changements

1. **Suppression**
   - `static/departements.geojson` (556 KB).
   - Constante `DEPARTMENTS_GEOJSON_URL` dans `src/lib/constants.ts`.
   - Fetch + cache module (`fetchDepartments`, `cachedData`, `inflight`) dans
     `src/lib/departments-layer.ts`.

2. **Réécriture de `src/lib/departments-layer.ts`** — même contrat public
   (`ensureDepartmentsLayer`, `refreshDepartments`), nouvelle implémentation calquée sur
   `src/lib/labels-layer.ts` :
   - `ensureDepartmentsLayer()` : ajoute (idempotent) un layer `line` —
     - `source: 'openmaptiles'`, `source-layer: 'boundary'`
     - `filter: ['==', ['get', 'admin_level'], 6]`
     - inséré **avant `BEFORE_LAYER_VECTOR`** (placement inchangé → lignes nettes
       au-dessus du raster)
     - `line-color` piloté par le store `basemapTheme` (blanc sur fond sombre / noir sur
       clair), `line-width` interpolé sur le zoom (réutiliser les valeurs actuelles),
       `line-opacity` ~0.85
   - `refreshDepartments()` : ne fetch plus rien — bascule la `visibility` du layer via
     `setLayoutProperty` selon le store `showDepartments` (défensif si layer absent),
     exactement le pattern de `applyLabelsVisibility()`.

3. **Piège re-style (inchangé, à préserver)** — `setStyle`/`reloadStyles()` recrée la source
   `openmaptiles` et purge les layers custom. `ensureDepartmentsLayer()` est déjà rappelé
   après re-style (`map-controls.ts` / `+page.svelte`) ; on conserve ce câblage. La
   visibilité doit être réappliquée après chaque re-style (comme `applyLabelsVisibility`).

4. **Documentation** — mettre à jour `.claude/rules/architecture.md` (§ _GeoJSON overlays_)
   dans le même commit : l'overlay départements ne lit plus un geojson bundlé mais la couche
   `boundary` du fond ; retirer la phrase « The departments contour file is bundled ».

### Décisions assumées (KISS)

- **Subdivisions des pays voisins** en lisière (niveau 6 = Kreise allemands, provinces
  belges/italiennes/espagnoles) : affichées, car l'`admin_level 6` ne porte pas de code pays
  (`adm0_l`/`adm0_r` ne sont renseignés que sur l'`admin_level 2`). Non filtrable. C'est déjà
  le comportement du fond (`admin_sub` montre 4/6/8 pour tous les pays) → cohérent, non
  régressif.
- **Filtre `admin_level == 6` seul** (départements), pour coller à la sémantique du toggle
  « Départements ». Le fond conserve son `admin_sub` pointillé en contexte dessous.

## Hors périmètre

- Toggles régions (admin_level 4) / communes (admin_level 8) — non demandés.
- Filtrage géographique « France uniquement » de l'overlay.
- Modification du style `admin_sub` / `admin_country` existant du fond.

## Critères de réussite

- `static/departements.geojson` supprimé ; aucune référence résiduelle
  (`DEPARTMENTS_GEOJSON_URL`, fetch) dans le code.
- Toggle « Départements » : les contours apparaissent/disparaissent au-dessus du raster,
  alignés avec les frontières du fond, dans les deux thèmes (clair/sombre).
- Couleurs correctes après changement de thème de fond et après re-style.
- `npm run check`, `npm run lint`, `npm run test`, `npm run build` passent.
