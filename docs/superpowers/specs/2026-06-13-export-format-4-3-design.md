# Export PNG au format 4:3 adaptatif

**Date :** 2026-06-13
**Statut :** validé, prêt pour plan d'implémentation

## Contexte

L'export d'image du module de capture (`capture/capture-flow.svelte`) produit
aujourd'hui un PNG **carré 1080×1080** (`png-export.ts`, format `'square'`). Le
carré est adapté aux réseaux sociaux mais peu naturel pour partager une carte
météo (le champ visuel est rogné agressivement). On veut un format au ratio plus
habituel, ~1.3 (longueur/largeur).

## Objectif

Remplacer le format carré par un **4:3 adaptatif selon l'orientation du
viewport** :

- viewport large (paysage, `vw >= vh`) → **paysage 4:3**, sortie **1440×1080**
- viewport haut (portrait, `vw < vh`) → **portrait 3:4**, sortie **1080×1440**

Le petit côté reste à **1080 px** (qualité identique au carré actuel). Le carré
1:1 est **supprimé** (pas conservé comme option).

## Décisions figées

| Décision | Valeur |
|----------|--------|
| Ratio | 4:3 exact (1.333) |
| Orientation | adaptative au viewport au moment de la capture |
| Résolution paysage | 1440×1080 |
| Résolution portrait | 1080×1440 |
| Carré 1:1 | supprimé |
| Format `'current-view'` | conservé inchangé |

## Contrainte architecturale centrale

**Trois endroits doivent décrire exactement la même zone capturée**, sinon le
WYSIWYG est cassé (l'utilisateur cadre une zone et le PNG en sort une autre) :

1. le **cadre overlay** (bandes sombres + rectangle) dans `+page.svelte` ;
2. la **détection de clic hors-cadre** qui ferme le cadre (`+page.svelte:252-272`) ;
3. le **recadrage du canvas** dans `png-export.ts`.

Aujourd'hui la cohérence est fortuite : « plus grand carré centré » est trivial à
dupliquer dans les trois. Un ratio 4:3/3:4 est plus piégeux → on centralise.

## Approche retenue : helper pur partagé

Une fonction pure, sans DOM, testable unitairement, devient la **source de vérité
unique** de la géométrie pour l'overlay et la détection de clic. Le crop de
`png-export` applique la **même règle** (« plus grand rectangle de ratio R
centré ») sur les dimensions du canvas ; comme la règle est invariante d'échelle,
le crop correspond automatiquement à la zone de l'overlay — aucune dérive
possible.

(Alternative écartée : CSS Tailwind `landscape:`/`portrait:` + maths dupliquées
en JS → trois implémentations à synchroniser, non testable.)

## Unités

### 1. `src/lib/capture-geometry.ts` (nouveau, pur)

```ts
export type CaptureOrientation = 'landscape' | 'portrait';

export interface CaptureRect {
	x: number;          // px depuis le bord gauche du viewport
	y: number;          // px depuis le haut du viewport
	w: number;
	h: number;
	orientation: CaptureOrientation;
}

/**
 * Plus grand rectangle de ratio 4:3 (paysage) ou 3:4 (portrait, selon
 * l'orientation du viewport) centré dans vw×vh.
 */
export function computeCaptureRect(vw: number, vh: number): CaptureRect;
```

- `landscape` ssi `vw >= vh` ; ratio cible `targetRatio = orientation==='landscape' ? 4/3 : 3/4` (largeur/hauteur).
- Si `vw / vh > targetRatio` → borné par la hauteur (`h = vh`, `w = vh * targetRatio`), sinon borné par la largeur (`w = vw`, `h = vw / targetRatio`).
- Centré : `x = (vw - w) / 2`, `y = (vh - h) / 2`.

**Test** : `src/lib/tests/capture-geometry.test.ts` — cas paysage, portrait,
carré (`vw === vh`), bornage hauteur vs largeur, centrage.

### 2. `src/lib/png-export.ts`

- `PngExportFormat` : `'square'` → `'social'`. (`'current-view'` conservé.)
- Dans `captureWatermarkedPng`, branche `'social'` :
  - `landscape = sourceWidth >= sourceHeight` ;
  - même règle de crop que `computeCaptureRect` mais sur `sourceWidth/sourceHeight` (px canvas, déjà multipliés par le devicePixelRatio) ;
  - canvas de sortie : `landscape ? 1440×1080 : 1080×1440` ;
  - `drawImage(source, sx, sy, cropW, cropH, 0, 0, outW, outH)`.
- Le filigrane (`drawWatermark`) reste inchangé : il se dessine en bas du canvas
  de sortie, son échelle `Math.min(width/1200, 2)` s'adapte déjà à la largeur.

### 3. `src/routes/+page.svelte`

- `<svelte:window bind:innerWidth bind:innerHeight>` pour réagir aux
  resize/rotations.
- `const rect = $derived(computeCaptureRect(innerWidth, innerHeight))`.
- Overlay : les 4 bandes sombres (`bg-black/24`) et le cadre se positionnent via
  **style inline** dérivé de `rect` (haut/bas/gauche/droite + le rectangle
  central), au lieu des `calc(min(50vw,50vh)…)` carrés actuels. Le wrapper reste
  `pointer-events-none`, `overflow-hidden`, clippé à `bottom: $bottomChromeHeight`.
- Détection clic hors-cadre : remplacer le calcul carré inline par
  `const r = computeCaptureRect(window.innerWidth, window.innerHeight)` puis test
  `inside = x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h`.
- Bande « filigrane » indicative : hauteur recalculée selon l'orientation
  (~13 % de la hauteur en paysage 1440×1080, ~8 % en portrait 1080×1440 — dérivé
  de `bandHeight/outputHeight`). Indicatif/cosmétique.
- Badge « PNG carré » → « PNG 4:3 ».

### 4. `src/lib/components/capture/capture-flow.svelte`

- `captureWatermarkedPng(map, details, 'social')`.
- Suffixe de nom de fichier : `'square'` → `'paysage'` ou `'portrait'` selon
  `computeCaptureRect(window.innerWidth, window.innerHeight).orientation` (même
  source de vérité que l'overlay et le crop). Le reste du nom (`infoclimat_…`)
  inchangé.

## Hors périmètre

Issus de la revue UI/UX précédente, à traiter séparément si souhaité :

- spinner de progression pendant la capture ;
- dé-persistance de `exportFrameVisible` (état d'UI éphémère) ;
- fermeture du cadre par la touche Échap + bouton « Annuler » visible ;
- réglage pour couper le son du déclencheur.

## Tests

- Unitaire : `capture-geometry.test.ts` (la géométrie partagée).
- La logique de crop de `png-export` reste difficile à tester sans canvas réel ;
  on s'appuie sur la cohérence par construction avec `computeCaptureRect` et une
  vérification manuelle (capture en paysage desktop + portrait mobile).

## Critères de succès

- En desktop large : le cadre est un rectangle 4:3 centré, le PNG sort en
  1440×1080 et correspond pixel-près à la zone cadrée (filigrane compris).
- En mobile portrait : cadre 3:4, PNG 1080×1440.
- La détection clic-hors-cadre ferme le cadre uniquement hors du nouveau
  rectangle.
- `npm run check`, `npm run lint`, `npm run test` passent.
