# Cadrage d'export confiné à la zone carte visible

**Date :** 2026-06-13
**Statut :** validé, prêt pour plan d'implémentation
**Suite de :** `2026-06-13-export-format-4-3-design.md`

## Problème

Avec le cadre d'export 4:3 adaptatif, en **paysage large** le cadre est borné par
la hauteur → il fait toute la hauteur de la fenêtre (`y = 0`, `h = vh`). Les
bandes sombres haut/bas sont donc de hauteur nulle, et seules les bandes
gauche/droite existent. Or le conteneur du voile s'arrête volontairement
au-dessus de la barre du temps (`bottom: $bottomChromeHeight`, pour ne pas
l'assombrir). Résultat : la bande de ~`bottomChromeHeight` px en bas n'est
couverte par aucun voile → elle reste claire sur toute la largeur (bas non
grisé), créant une expérience dégradée.

De plus, le crop actuel prend toute la hauteur du canvas → le PNG inclut cette
bande basse, qui passe en partie derrière la barre du temps flottante : ce que
l'utilisateur cadre ne correspond pas exactement à ce qu'il obtient.

## Objectif

Confiner le cadre 4:3/3:4 à la **zone carte visible** (au-dessus de la barre du
temps). Tout l'extérieur du cadre est grisé proprement (haut/bas/côtés), et le
PNG correspond **exactement** au cadre (il exclut la bande derrière la barre du
temps). La barre du temps reste intacte (non assombrie).

## Approche retenue

`computeCaptureRect(vw, vh)` reste inchangé : on l'appelle désormais avec la
**hauteur disponible** `viewportH - bottomChromeHeight` au lieu de la pleine
hauteur. Le cadre se centre alors dans la zone au-dessus de la barre. Le markup
de l'overlay n'a pas besoin de changer (les bandes sont déjà pilotées
génériquement par `captureRect` dans le repère du conteneur, qui occupe
exactement `0 → vh - bottomChromeHeight`).

Le crop ne prend plus toute la hauteur du canvas mais exactement le rectangle
cadré. On en profite pour **supprimer la duplication de la logique de ratio**
entre `png-export.ts` et `computeCaptureRect` (point mineur relevé en revue) :
`png-export` ne recalcule plus le ratio, il recadre le rectangle qu'on lui
passe.

### Pourquoi l'échelle reste correcte (WYSIWYG)

Le canvas MapLibre couvre **tout le viewport** (`vw × vh` en CSS, `× dpr` en px).
Un rectangle exprimé en px CSS dans le repère viewport (origine en haut à
gauche) se mappe vers les px canvas par `scaleX = sourceWidth / viewportW` et
`scaleY = sourceHeight / viewportH`. Le rect est **calé** sur la hauteur
disponible (`vh - chrome`), mais l'échelle utilise la hauteur **pleine** `vh`
(le canvas, lui, couvre tout le viewport). Avec un dpr uniforme,
`scaleX == scaleY == dpr` → pas de distorsion.

## Décisions figées

| Décision                                          | Valeur                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Hauteur de cadrage                                | `viewportH - bottomChromeHeight`                             |
| Barre du haut (top bar)                           | hors périmètre — reste survolante (pas d'asymétrie signalée) |
| Param `format` de `captureWatermarkedPng`         | supprimé, remplacé par une région                            |
| `'social'` / `'current-view'` / `PngExportFormat` | retirés (morts, aucun appelant)                              |
| Résolutions sortie                                | 1440×1080 (paysage) / 1080×1440 (portrait) inchangées        |

## Unités

### 1. `src/lib/capture-geometry.ts`

- `computeCaptureRect` : **inchangé**.
- **Nouveau** helper pur, testable :

```ts
export interface SourceCrop {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
}

/**
 * Met à l'échelle un rectangle exprimé en px CSS du viewport vers les px du
 * canvas source (qui couvre tout le viewport). `sx/sy/sw/sh` sont arrondis pour
 * un découpage pixel entier via drawImage.
 */
export function computeSourceCrop(
	rect: { x: number; y: number; w: number; h: number },
	viewportW: number,
	viewportH: number,
	sourceW: number,
	sourceH: number
): SourceCrop;
```

Logique : `scaleX = sourceW / viewportW`, `scaleY = sourceH / viewportH` ;
`sx = round(rect.x * scaleX)`, `sy = round(rect.y * scaleY)`,
`sw = round(rect.w * scaleX)`, `sh = round(rect.h * scaleY)`.

**Test** : `capture-geometry.test.ts` (ajouts) — dpr=1 (identité), dpr=2
(doublement), rectangle décalé (`x/y` non nuls), arrondi.

### 2. `src/lib/png-export.ts`

- Supprimer `export type PngExportFormat` et toutes ses références.
- Nouveau type d'entrée :

```ts
export interface PngCaptureRegion {
	x: number;
	y: number;
	w: number;
	h: number;
	orientation: 'landscape' | 'portrait';
	viewportW: number;
	viewportH: number;
}
```

- `captureWatermarkedPng(map, details, region: PngCaptureRegion)` :
  - `const { sx, sy, sw, sh } = computeSourceCrop(region, region.viewportW, region.viewportH, source.width, source.height);`
  - `const landscape = region.orientation === 'landscape';`
  - canvas de sortie : `landscape ? 1440×1080 : 1080×1440` ;
  - `ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);`
  - `drawWatermark(...)` puis `blobFromCanvas(...)` (inchangés).
  - Le chemin « plein cadre » (`current-view`) est retiré.

### 3. `src/routes/+page.svelte`

- `const captureRect = $derived(computeCaptureRect(viewportW, viewportH - $bottomChromeHeight));`
- Détection de clic : `const r = computeCaptureRect(window.innerWidth, window.innerHeight - get(bottomChromeHeight));` (le store `bottomChromeHeight` est déjà importé ; ajouter l'usage de `get` si besoin — `get` est déjà importé).
- **Markup overlay inchangé** (bandes déjà dérivées de `captureRect`). Vérifier visuellement qu'en paysage la bande basse disparaît correctement (rect cale exactement la hauteur dispo) et qu'aucune bande claire ne subsiste.

### 4. `src/lib/components/capture/capture-flow.svelte`

- Calculer la région et la passer :

```ts
const rect = computeCaptureRect(window.innerWidth, window.innerHeight - get(bottomChromeHeight));
const blob = await captureWatermarkedPng(map, details, {
	...rect,
	viewportW: window.innerWidth,
	viewportH: window.innerHeight
});
```

- `get` (svelte/store) est déjà importé ; `bottomChromeHeight` provient de
  `$lib/stores/preferences` — ajouter l'import si absent.
- Suffixe de fichier : toujours `rect.orientation === 'landscape' ? 'paysage' : 'portrait'`.
- Le reste de `capture` (toasts, share/download, try/catch/finally) inchangé.

## Tests

- Unitaire : `computeSourceCrop` (capture-geometry.test.ts).
- `computeCaptureRect` : tests existants inchangés (helper non modifié).
- Crop final : cohérence par construction + vérification manuelle (Task de
  vérif).

## Critères de succès

- En paysage : plus aucune bande claire en bas ; tout l'extérieur du cadre est
  grisé uniformément ; la barre du temps n'est pas assombrie.
- Le PNG exporté correspond exactement au rectangle cadré (n'inclut plus la bande
  derrière la barre du temps).
- En portrait : bandes haut/bas/côtés cohérentes, PNG = cadre.
- `npm run check`, `npm run lint`, `npm run test` passent.
