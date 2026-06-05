# Styles vecteur personnalisables + fade-in synchronisé

**Date :** 2026-06-05
**Statut :** design validé (en attente relecture)
**Origine :** récupération des parties saines du PR upstream [open-meteo/maps#280](https://github.com/open-meteo/maps/pull/280) (« feat: predefined charts »), sans son architecture multi-source.

## Contexte & motivation

Le PR #280 introduit un système multi-sources (presets de cartes météo, N couches simultanées). Trois de ses idées sont saines et réutilisables ; le reste (dual-path de rendu, `multi-source-manager`, `buildOmUrl` qui court-circuite `getOMUrlFor` et casserait le routing worker/bucket/anomalie du fork) est écarté.

On extrait donc **trois apports**, branchés sur l'existant du fork :

1. **Extraction des styles vecteur** — sortir les expressions MapLibre hardcodées de `layers.ts` vers un module data-driven. Refactor pur, comportement visuel identique.
2. **Fade-in synchronisé** — le `deferCommit` du SlotManager + un coordinateur, pour que les couches actives (`rasterManager`, `rasterManager2`, `vectorManager`) apparaissent **ensemble** au lieu de chacune dans son coin (bug de désync actuel).
3. **Perso utilisateur des styles** — couleurs (clair/sombre) et épaisseurs des contours et des flèches modifiables dans le drawer réglages, persistées.

## Décisions de design

- **Style global, pas par variable.** Le PR keye les styles par variable (`customContourStyles[variable]`) parce qu'il rend N sources en même temps. Le fork n'a **qu'une seule couche vecteur active à la fois** (`vectorManager` : contours OU vent), donc un style global unique (`contourStyle`, `arrowStyle`) suffit et colle au modèle mental d'un panneau de réglages. `rasterManager2` est du raster, non concerné.
- **Nommage `vector-styles`**, pas `chart-styles` : le fork n'a aucun concept « chart ».
- **Coordination toujours active** : à chaque mise à jour, toutes les couches _réellement mises à jour ce tick_ commit ensemble.
- **Persistance** via `svelte-persisted-store` (helper `persisted`, comme `vectorOptions`).
- **Hors périmètre (YAGNI)** : presets, multi-variables, `chart-select`, encodage URL multi-sources. On ne modifie pas `rasterManager2` / `layer2Enabled` (ils bénéficient seulement du fade-in synchronisé).

## Composant 1 — `src/lib/vector-styles.ts` (extraction)

Module pur, sans dépendance aux stores ni à MapLibre runtime (juste les types `maplibregl`).

### Types

```ts
export interface ContourLevel {
	modulo: number; // 0 = fallback ("autres")
	label: string;
	lightColor: string; // rgba(...)
	darkColor: string;
	width: number;
}
export interface ContourStyle {
	levels: ContourLevel[];
}

export interface ArrowLevel {
	minSpeed: number; // 0 = base
	label: string;
	lightColor: string;
	darkColor: string;
	width: number;
}
export interface ArrowStyle {
	levels: ArrowLevel[];
}
```

### Defaults — doivent reproduire EXACTEMENT l'existant

`defaultContourStyle` (cf. `layers.ts:94-121`) :

| modulo       | light           | dark                  | width |
| ------------ | --------------- | --------------------- | ----- |
| 0 (fallback) | rgba(0,0,0,0.3) | rgba(255,255,255,0.5) | 1     |
| 10           | rgba(0,0,0,0.4) | rgba(255,255,255,0.6) | 2     |
| 50           | rgba(0,0,0,0.5) | rgba(255,255,255,0.7) | 2.5   |
| 100          | rgba(0,0,0,0.6) | rgba(255,255,255,0.8) | 3     |

`defaultArrowStyle` (cf. `layers.ts:49-92`) — **table d'union fidèle** (voir note ci-dessous) :

| minSpeed | light           | dark                  | width |
| -------- | --------------- | --------------------- | ----- |
| 0 (base) | rgba(0,0,0,0.2) | rgba(255,255,255,0.2) | 1.5   |
| 2        | rgba(0,0,0,0.3) | rgba(255,255,255,0.3) | 1.6   |
| 3        | rgba(0,0,0,0.4) | rgba(255,255,255,0.4) | 1.8   |
| 4        | rgba(0,0,0,0.5) | rgba(255,255,255,0.5) | 1.8   |
| 5        | rgba(0,0,0,0.6) | rgba(255,255,255,0.6) | 2     |
| 10       | rgba(0,0,0,0.7) | rgba(255,255,255,0.7) | 2.2   |
| 20       | rgba(0,0,0,0.7) | rgba(255,255,255,0.7) | 2.8   |

**Note (seuils couleur ≠ largeur).** Dans l'expression actuelle, la **couleur** change à >2/3/4/5/10 (et plafonne à 0.7 au-delà de 10) tandis que la **largeur** change à >2/3/5/10/20. Les deux jeux ne coïncident pas. Le modèle unifié (un niveau = un `minSpeed` portant couleur **et** largeur) les réconcilie via l'**union des seuils** : les lignes `minSpeed:4` (largeur 1.8, identique à 3) et `minSpeed:20` (couleur 0.7, identique à 10) sont volontairement « redondantes » mais reproduisent exactement le rendu actuel pour toute valeur. Vérification par valeur attendue dans le test, pas « par simplification ».

### Builders

```ts
buildContourColorExpr(style: ContourStyle, dark: boolean): maplibregl.ExpressionSpecification
buildContourWidthExpr(style: ContourStyle): maplibregl.ExpressionSpecification
buildArrowColorExpr(style: ArrowStyle, dark: boolean): maplibregl.ExpressionSpecification
buildArrowWidthExpr(style: ArrowStyle): maplibregl.ExpressionSpecification
```

Contours : on teste le plus grand modulo en premier (`==  % == 0`), fallback en dernier. Flèches : couleur `case` du plus grand seuil au plus petit, largeur idem (highest-first).

Helpers rgba pour l'UI : `parseRgbaOpacity(rgba)`, `setRgbaOpacity(rgba, a)` — placés ici (utilisés par le color-picker du drawer).

### Intégration `layers.ts`

- Supprimer `makeArrowColor/makeArrowWidth/makeContourColor/makeContourWidth`.
- `getArrowStyle()` / `getContourStyle()` lisent les stores (composant 3), `?? defaultXStyle`.
- Les factories vecteur appellent `buildXExpr(getXStyle(), isDark())`.
- `lightOrDark`/`isDark` restent dans `layers.ts` (toujours utilisés ailleurs, ex. labels de contours).

## Composant 2 — `deferCommit` + coordinateur

### SlotManager (`src/lib/slot-manager.ts`)

Reprise quasi littérale du PR (opt-in, aucun impact sans l'option) :

- Options : `deferCommit?: boolean`, `onReady?: () => void`.
- Champ privé `deferredCommit: { nextSlot; previousSlot } | null`.
- Scinder le `commit()` actuel (slot-manager.ts:200) :
  - `commit(next, prev)` : si `deferCommit` → stocke `deferredCommit`, appelle `onReady?()`, return. Sinon → `executeCommit(next, prev)`.
  - `executeCommit(next, prev)` : corps actuel de `commit` (setSlotOpacity + onCommit + dispatch).
- Nouvelles méthodes publiques : `commitNow()` (flush `deferredCommit` via `executeCommit`), `isReady(): boolean` (`deferredCommit !== null`).
- `update()` réinitialise `deferredCommit = null` (abandon de tout commit différé en attente).

### Coordinateur (`src/lib/layers.ts`)

Le but : un batch de mises à jour (mêmes triggers que `changeOMfileURL` / `addOmFileLayers`) déclenche un commit groupé.

- Les managers concernés sont construits avec `deferCommit: true` et un `onReady` pointant vers un dispatcher module-level.
- `commitTogether(managers: SlotManager[])` ouvre un **groupe actif** (set des managers attendus). Le dispatcher `onReady` ré-évalue : quand `[...pending].every(m => m.isReady())`, on `commitNow()` tous, puis `loading.set(false)` + `refreshPopup()`.
- **Gestion erreur** : `onError` d'un manager le **retire** du groupe et ré-évalue (sinon un échec `clearOnError`, ex. variable 404 sur `arome_france_convection`, bloquerait les autres en différé indéfiniment).
- **Nouveau batch** : remplace le groupe actif ; l'`update()` de chaque manager ayant remis `deferredCommit=null`, l'ancien groupe ne peut plus committer.
- Le batch ne met en `pending` que les managers **réellement** mis à jour ce tick (respecte `vectorOnly`/`rasterOnly` et `layer2Enabled`).

Snapshot du set à l'instant de l'appel (les `update()` sont synchrones dans un même `changeOMfileURL`).

## Composant 3 — Stores persistés + UI drawer

### Stores `src/lib/stores/vector-styles.ts`

```ts
import { persisted } from 'svelte-persisted-store';

import {
	type ArrowStyle,
	type ContourStyle,
	defaultArrowStyle,
	defaultContourStyle
} from '$lib/vector-styles';

export const contourStyle = persisted<ContourStyle>('contour-style', defaultContourStyle);
export const arrowStyle = persisted<ArrowStyle>('arrow-style', defaultArrowStyle);
```

`layers.ts` : `getContourStyle = () => get(contourStyle)`, `getArrowStyle = () => get(arrowStyle)`.

### UI

Étendre les composants existants du drawer :

- `src/lib/components/settings/contour-settings.svelte` : pour chaque `ContourLevel`, une ligne — libellé, ColorPicker clair, ColorPicker sombre, input largeur. Bouton « Réinitialiser » → `contourStyle.set(defaultContourStyle)`.
- `src/lib/components/settings/arrows-settings.svelte` : idem pour `ArrowLevel`.
- Réutiliser `src/lib/components/scale/color-picker.svelte` et les primitives shadcn-svelte. **Aucun `<select>`/checkbox natif brut, aucune icône texte** (`✕`) — icônes Lucide.

### Application live des changements

`layers.ts` expose `reloadVectorStyle()` : relance `vectorManager.update('om://' + <url vecteur courante>)`. `update()` ne déduplique pas par URL (la dédup est dans `changeOMfileURL` via `currentOmUrl`), donc rappeler avec la même URL reconstruit les couches via `layerFactory`, qui relisent le style → nouveau rendu, fade-in via le différé. Tuiles vecteur en cache → coût réseau quasi nul.

Les composants de réglages appellent `reloadVectorStyle()` après mutation du store (debounce léger pour les drags de color-picker).

## Tests (Vitest)

- `src/lib/tests/vector-styles.test.ts` :
  - `buildContourColorExpr(defaultContourStyle, false/true)` === expression attendue (snapshot des valeurs actuelles).
  - `buildArrowWidthExpr(defaultArrowStyle)` couvre les 5 paliers de largeur exacts.
  - `parseRgbaOpacity` / `setRgbaOpacity` (round-trip, garde 3 décimales, cas dégradés).
- Pas de test sur le coordinateur (logique liée à MapLibre/DOM) — vérification manuelle au `npm run dev` (changement de pas de temps avec layer2 + vent actifs : apparition simultanée).

## Plan de migration / ordre

1. `vector-styles.ts` + test → intégration `layers.ts` (refactor pur). `npm run check` + `npm run test` verts, rendu identique.
2. `deferCommit` SlotManager + coordinateur `layers.ts`. Vérif manuelle fade-in.
3. Stores `vector-styles` persistés + branchement `layers.ts` + `reloadVectorStyle()`.
4. UI drawer (`contour-settings` / `arrows-settings`).

Chaque étape est indépendamment livrable et vérifiable.

## Risques

- **Régression visuelle silencieuse** à l'étape 1 si un seuil/couleur diffère. Mitigation : test snapshot des expressions + revue seuil par seuil.
- **Blocage en différé** si un manager n'émet jamais `onReady` ni `onError`. Mitigation : `onError` retire du groupe ; envisager un timeout de sécurité si observé en pratique.
- **Surface `*-settings.svelte`** : garder l'UI sobre (la légende reste l'aperçu ; le drawer n'édite que les paliers).
