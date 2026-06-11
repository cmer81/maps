# Étiquettes d'isocontours denses et lisibles — design

**Date :** 2026-06-11
**Statut :** validé

## Contexte

Les utilisateurs demandent d'afficher les valeurs sur les isocontours (rendu type
Meteociel). La fonctionnalité existe déjà (`omVectorContourLayerLabels`,
`layers.ts`) mais souffre de deux limites :

1. `symbol-placement: 'line-center'` ne place qu'une étiquette par segment de
   ligne et par tuile — trop rare sur les longues isolignes. Le
   `symbol-spacing: 1` présent dans le code est ignoré par MapLibre avec ce
   placement (il ne s'applique qu'au placement `'line'`).
2. Pas de halo : le texte semi-transparent est peu lisible sur les zones
   saturées du raster.

## Décision

Améliorer la couche symbol existante par pur styling MapLibre (approche A
retenue parmi : A styling, B labels générés dans les tuiles via fork de
`@openmeteo/weather-map-layer`, C couche canvas custom — B et C écartées,
coût disproportionné).

Premier jet : densité + halo uniquement. Le filtrage « étiqueter seulement les
lignes majeures » (via les modulos de `ContourStyle`) est volontairement exclu ;
à ajouter plus tard si le rendu est trop chargé avec un intervalle fin.

## Changement

Uniquement dans `vectorContourLabelsLayer` (`src/lib/layers.ts`) :

- `symbol-placement: 'line-center'` → `'line'` avec `symbol-spacing: 120`
  (étiquette répétée le long des lignes, collision gérée par MapLibre).
- `text-rotation-alignment: 'viewport'` + `text-max-angle: 180` — voir
  « Découverte en implémentation » ci-dessous.
- `text-offset: [0, -0.6]` → `[0, 0]` — l'étiquette se pose sur la ligne, le
  halo l'interrompt visuellement.
- Paint : ajout de `text-halo-color` (accordé au thème via `lightOrDark`,
  comme `text-color`) et `text-halo-width: 1.5`.

## Découverte en implémentation (cause racine)

Le premier jet (`'line'` + `symbol-spacing: 280` seul) plaçait **zéro**
étiquette au zoom continental — et l'ancien `line-center` aussi (bug
préexistant, masqué à fort zoom). Cause, mesurée en headless via
`queryRenderedFeatures` sur la couche labels :

1. Les polylignes marching-squares de `@openmeteo/weather-map-layer` sont en
   escalier à l'échelle de la maille (~3 px/maille ARPEGE 0,1° au zoom 5) ;
   le contrôle de courbure MapLibre (`text-max-angle`, défaut 45°, appliqué
   dès qu'il y a du texte, quel que soit l'alignement) rejette quasi tous les
   ancrages (0 placé à 45°, 1 à 85° sur ~3 000 fragments).
2. Les contours arrivent fragmentés par tuile ; chaque fragment doit être plus
   long que l'offset d'entrée (~`symbol-spacing`/2) pour recevoir un ancrage —
   d'où `symbol-spacing: 120` plutôt que 280.

Remède : texte aligné **viewport** (horizontal, style Meteociel) — la
courbure de la ligne n'a alors plus d'incidence sur le rendu du texte, ce qui
permet de neutraliser le contrôle avec `text-max-angle: 180`. Mesures après
correctif (Europe entière, 1440×900) : 23 étiquettes placées à intervalle 2,
4 à intervalle 15 (3 isolignes à l'écran), contre 0/0 avant.

## Hors périmètre (inchangé)

Contenu des étiquettes (`buildContourLabelExpr`, conversion gpdam), génération
des contours, stores, paramètres d'URL, UI du panneau avancé. Aucun nouveau
réglage exposé.

## Risques / perf

Aucun nouveau chemin d'erreur : styling déclaratif. Le placement `'line'` est
le mode standard MapLibre des labels routiers. La couche conserve
`text-opacity-transition` et son intégration au commit groupé du scrubbing —
pas d'impact sur la fluidité (goulot connu : `setToOmFile`, hors sujet ici).

## Vérification

Visuelle via `npm run dev` avec `?contours=true&interval=2` (ex. température
850 hPa), thèmes clair et sombre, plusieurs niveaux de zoom. Pas de test
unitaire : aucun builder de `vector-styles.ts` ne change. `symbol-spacing` et
`text-halo-width` sont des réglages d'une ligne, ajustables après coup d'œil.
