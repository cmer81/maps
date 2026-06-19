# Bouton « Vue 3D » (preset inclinaison caméra + relief)

**Date :** 2026-06-19
**Statut :** Design validé, prêt pour plan d'implémentation

## Problème

La vue 3D est appréciée des utilisateurs mais sous-exploitée :

- **L'inclinaison caméra (`pitch`)** ne se déclenche qu'au geste caché Shift+glisser (ou clic
  droit + glisser vertical). Peu de monde la découvre, et personne ne peut la doser facilement.
- **Le relief 3D (`setTerrain`)** est enfoui : le bouton natif `TerrainControl` n'apparaît que
  quand le toggle « Relief ombré » (hillshade) est activé, et ce bouton **n'incline pas la
  caméra** — il ne fait que lever le mesh. Résultat : on n'arrive presque jamais à la vraie vue
  3D « caméra inclinée + relief en volume ».

Sur tactile, le drag-pitch est en plus peu pratique, et la rotation tactile est désactivée
(`touchZoomRotate.disableRotation()`).

## Objectif

Un **bouton « 3D » unique et découvrable** qui, en un clic, orchestre **inclinaison caméra +
relief terrain** ensemble (et le rétablit à plat au re-clic). Accessible desktop **et** mobile
sans geste caché.

## Approche retenue

**Option A — preset de vue additif.** Le bouton est un *preset* qui orchestre `pitch` + `terrain`
ensemble, **sans démonter** le câblage hillshade/terrain existant. Le toggle « Relief ombré » et le
`TerrainControl` natif restent inchangés ; le bouton 3D réutilise le même état
`preferences.terrain` + `updateUrl`, donc pas de désynchronisation entre les deux points d'entrée.

Alternatives écartées :
- **(B) Remplacer le `TerrainControl` natif** par le bouton 3D — plus propre conceptuellement mais
  touche au câblage hillshade/terrain (risque de régression) pour un gain faible.
- **(C) Deux boutons séparés** (relief / inclinaison) — recrée exactement la friction qu'on veut
  supprimer ; l'intérêt du « 3D » c'est de tout faire d'un clic.

## Comportement

Bouton **IControl** custom ajouté coin haut-droit, géré dans `map-controls.ts` (même pattern que
`GlobeControl` : `addControl` + écouteur `click`). Ordre vertical : Navigation (zoom+boussole) →
Géoloc → Globe → **3D**.

- **Clic quand inactif → vue 3D :**
  - `map.easeTo({ pitch: VIEW_3D_PITCH })` (animé)
  - `map.setTerrain({ source: 'terrainSource2', exaggeration: VIEW_3D_EXAGGERATION })`
  - `preferences.terrain = true` + `updateUrl('terrain', 'true', defaut)`
- **Clic quand actif → retour à plat :**
  - `map.easeTo({ pitch: 0 })`
  - `map.setTerrain(null)`
  - `preferences.terrain = false` + `updateUrl('terrain', 'false', defaut)`
- **Le cap (`bearing`) n'est jamais touché** : on respecte une éventuelle rotation utilisateur.
  Seuls `pitch` et le relief sont orchestrés.
- **État actif visuel** : le bouton porte une classe `active` pilotée par `preferences.terrain`
  (réutilise la logique de `terrainHandler`). Conséquence assumée : si l'utilisateur active le
  relief via le `TerrainControl` natif sans incliner, le bouton 3D s'affiche « actif » alors que la
  caméra est à plat — désynchro mineure jugée acceptable.

## Constantes (ajustables)

Dans `src/lib/constants.ts` :

```ts
export const VIEW_3D_PITCH = 60;
export const VIEW_3D_EXAGGERATION = 1.4;
```

Itération facile du « look » après coup, sans toucher à la logique.

## Cohabitation avec l'existant

- `terrainSource2` est **déjà ajoutée à l'init** (`+page.svelte` / `addTerrainSource`) ; le bouton
  3D ne fait que la réutiliser → aucune dépendance au toggle hillshade.
- Le bouton 3D réutilise `preferences.terrain` + `updateUrl` (mêmes clés que `terrainHandler`), donc
  activer le relief par n'importe quel point d'entrée se reflète dans l'état partagé.

## Persistance / partage de lien

- `pitch` part déjà dans le **hash MapLibre** (`hash: true`) ; `terrain` dans le **param URL**
  (`?terrain=`). Un lien partagé reconstruit donc l'angle et la préférence.
- **Fix ciblé inclus** : aujourd'hui charger `?terrain=true` après montage hydrate la préférence
  mais **ne rappelle pas `setTerrain()`** — le hash restaure le pitch mais pas le mesh, donc un lien
  3D arriverait « incliné mais plat ». On ajoute donc une **application au `load`** : si
  `preferences.terrain` est vrai à l'init, appeler
  `setTerrain({ source: 'terrainSource2', exaggeration: VIEW_3D_EXAGGERATION })`.

## Mobile

Le bouton IControl s'affiche comme les autres contrôles (déjà présents sur mobile). Aucun geste
tactile réactivé : c'est précisément l'intérêt du bouton — rendre le 3D accessible **sans** geste
caché, y compris là où le drag-pitch est peu pratique.

## Découpage / testabilité

Extraire un handler **pur/testable**, p. ex. `applyView3D(map, on)`, qui :

- à `on=true` : appelle `easeTo({ pitch: VIEW_3D_PITCH })`, `setTerrain({ source: 'terrainSource2',
  exaggeration: VIEW_3D_EXAGGERATION })`, flippe `preferences.terrain=true` + `updateUrl`.
- à `on=false` : `easeTo({ pitch: 0 })`, `setTerrain(null)`, `preferences.terrain=false` +
  `updateUrl`.

La création de l'IControl (DOM + écouteur) reste dans `map-controls.ts` ; seul le handler est testé.

## Tests (Vitest, `src/lib/tests/`)

- `applyView3D` avec map mockée (même approche sans carte réelle que les tests existants) :
  - `on=true` → asserte `easeTo` appelé avec `pitch: 60`, `setTerrain` avec
    `{ source: 'terrainSource2', exaggeration: 1.4 }`, store + `updateUrl` mis à jour.
  - `on=false` → `pitch: 0`, `setTerrain(null)`, store + `updateUrl` mis à jour.
- Pas de test e2e headless requis (logique déterministe mockable).

## Hors périmètre (YAGNI)

- Pas de réactivation des gestes tactiles (rotation / pitch deux doigts).
- Pas de slider d'inclinaison continu ni de présets d'angle multiples.
- Pas de découplage relief / inclinaison en boutons séparés.
- Pas de refonte du couplage hillshade ↔ terrain existant.
