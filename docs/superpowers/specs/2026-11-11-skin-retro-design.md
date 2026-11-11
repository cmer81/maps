# Étude — Skin interchangeable « Rétro 2000 » (look Infoclimat v5 / Meteociel)

Statut : **étude** (pas encore de plan d'implémentation). Date : 2026-11-11.

## 1. Objectif

Proposer un second habillage, au choix de l'utilisateur, qui rappelle les sites
de cartes météo des années 2000 (pages « modèles » d'Infoclimat, Meteociel) :
bandeaux dégradés, panneaux à liseré, police Verdana 11–12 px, angles droits,
échéancier en grille de cases colorées, cartouche de titre sur la carte. Le
skin actuel (« Moderne » : verre dépoli sombre, teal Infoclimat) reste le skin
par défaut. Aucune fonctionnalité ne change : seul l'aspect change.

## 2. Relevé des références (mesuré dans le navigateur, 2026-11-11)

### Infoclimat — page `modeles-meteorologiques.html` (GFS France)

| Élément                                                                        | Valeur relevée                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fond de page                                                                   | `#efefef` + texture `fond_5.2.jpg`                                                                                                                                                                                                                              |
| Police                                                                         | `helvetica, verdana, trebuchet, arial` 12 px, noir                                                                                                                                                                                                              |
| Nav principale                                                                 | Exo 20 px blanc sur bandeau teal dégradé (image)                                                                                                                                                                                                                |
| Barres de section (`MODÈLES »`, `ÉCHÉANCE »`, `↓ PARAMÈTRES ↓`, `↓ OPTIONS ↓`) | fond `#3b679e`, texte blanc gras 12 px, liseré bas 1 px `#99bbff`                                                                                                                                                                                               |
| Sous-titres de groupe (« En altitude », « Au sol »)                            | bleu très pâle, italique, triangle ▿                                                                                                                                                                                                                            |
| Liste de paramètres                                                            | fond blanc, item actif en gras, séparateurs 1 px gris                                                                                                                                                                                                           |
| Échéancier                                                                     | grille de cases 10 px : vert `#9fc663` (≤ 54 h), orange pâle `#ffd385` (au-delà), case courante cerclée rouge ; `+ 0h ▾` en select à côté                                                                                                                       |
| Pastilles de run                                                               | 00Z `#63c5c6`, 06Z `#ffd385`, 12Z `#9fc663`, 18Z `#d08be7`                                                                                                                                                                                                      |
| Selects / boutons                                                              | natifs, radius 2 px, bouton « PLAY » gris système                                                                                                                                                                                                               |
| Carte                                                                          | image cadrée avec **cartouche blanc** : « Run GFS 0.5° / 04 novembre 2026 12Z / Géopotentiel à 500hPa » à gauche, « Échéance : mercredi… / **+ 0H** » à droite, Max/Min ; départements en traits noirs fins, isohypses blanches pleines, isothermes pointillées |
| Layout                                                                         | 3 colonnes : paramètres (≈200 px) / carte / options (≈200 px)                                                                                                                                                                                                   |

### Meteociel — accueil et `modeles/gfse_cartes.php`

| Élément                | Valeur relevée                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fond de page           | dégradé vertical `#122498 → #0d6ccc`                                                                                                                            |
| Logo / slogan          | manuscrit blanc sur le bleu (« Observations, Prévisions, Modèles »)                                                                                             |
| Police                 | `Verdana, Arial, Helvetica` 12 px, bleu nuit `#000066`                                                                                                          |
| Panneaux de menu       | fond menthe `#ebfaf7`, puces ▸ (gif), item mis en avant fond orange `#ff9900`                                                                                   |
| Barres de titre        | bleu ciel `#a5c7e3` dégradé (image), texte `#000066` gras, puce « • »                                                                                           |
| Boutons                | fond crème `#fafaf2`, bordure `#e9e9dc`, texte gris `#555` gras, ombre légère                                                                                   |
| Tableau des paramètres | en-têtes bleu ciel, cellules crème centrées                                                                                                                     |
| Échéancier             | **liste verticale** de puces violettes (6h, 12h, 18h…) à gauche de la carte                                                                                     |
| Carte                  | échelle arc-en-ciel saturée façon GrADS, isobares blanches étiquetées, date en cyan en surimpression haut-gauche, bandeau noir « Run GFS 0 Z du … » haut-droite |

### Les traits qui font « 2000 »

1. **Angles droits** partout (radius 0–2 px), liserés 1 px, petits reliefs (bevel) plutôt que des ombres floues.
2. **Bandeaux dégradés** horizontaux pour les titres de section ; texte blanc ou bleu nuit gras, souvent en capitales avec « » » ou « ↓ ».
3. **Petite typo dense** (Verdana 11–12 px), aucune hiérarchie par la taille, beaucoup de gras.
4. **Couleurs codées** : cases d'échéance vertes/orange, pastilles de run colorées.
5. **Chrome clair et opaque** (pas de verre, pas de flou) autour d'une carte cadrée.
6. **Carte « image de modèle »** : cartouche de titre incrusté, traits noirs des frontières, isolignes blanches.

## 3. Diagnostic technique de l'app actuelle

| Point                                      | Constat                                                                                                                                                                                                                                         | Impact sur un skin                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Mode sombre forcé                          | `ModeWatcher defaultMode="dark"`, `setMode('dark')` dans `+layout.svelte` et `resetStates()` ; `color-scheme: dark` figé dans `src/styles.css`                                                                                                  | Le skin rétro est **clair** : il doit piloter `color-scheme` et le jeu de tokens, indépendamment de mode-watcher       |
| Tokens shadcn                              | `--background`, `--popover`, `--border`… définis dans `:root` / `.dark`                                                                                                                                                                         | Bonne base : les primitives `ui/*` (select, dialog, popover, sheet…) suivront un jeu de tokens rétro sans modification |
| Couleurs codées en dur dans les composants | **193 occurrences** de `text-white/NN`, `bg-white/NN`, `border-white/NN` (top : `weather-ai-panel` 29, `model-selector` 26, `layer-list` 20, `composition-editor` 17, `advanced-panel` 17) + 62 couleurs Tailwind nommées (`slate-*`, `sky-*`…) | **Principal chantier** : ces classes supposent un chrome sombre ; sur fond clair elles deviennent invisibles           |
| Utilitaires de marque                      | `ic-brand-bar` (header), `glass-blur` + `bg-glass/85` (54 usages)                                                                                                                                                                               | Faciles à re-styler par skin (ce sont déjà des points d'entrée uniques)                                                |
| Arrondis                                   | ~150 `rounded-*` (dont 23 `rounded-xl`, 14 `rounded-full`)                                                                                                                                                                                      | Neutralisables globalement via `--radius` + override des utilitaires sous le skin                                      |
| Couleurs en dur hors classes               | `#…`/`rgba()` dans 11 composants (scale, time-selector, model-selector, meteogram, skew-t, hodograph, capture-flow…)                                                                                                                            | À passer en variables CSS ou à lire depuis le skin (canvas / Highcharts)                                               |
| Fond de carte                              | 2 styles figés (`src/lib/basemap/minimal-{light,dark}.json`) choisis par `getStyle()` selon `basemapTheme`                                                                                                                                      | Ajouter un 3ᵉ style « rétro » (ou dériver du clair) est simple ; `reloadStyles()` gère déjà le ré-ajout des couches    |
| Couches vecteur                            | `layers.ts` / `departments-layer.ts` : couleurs via `isDark()` / `lightOrDark()` ; police `Noto Sans Regular`                                                                                                                                   | Généraliser `isDark()` en « palette carte du skin » (contours, flèches, labels, départements)                          |
| Échelles de couleurs                       | surchargées côté `maps` via `omProtocolSettings.colorScales` (28 échelles locales)                                                                                                                                                              | Un jeu d'échelles « rétro » est faisable **sans toucher au fork**                                                      |

## 4. Architecture proposée

### 4.1 Un store `skin`, un attribut sur `<html>`

```ts
// src/lib/stores/skin.ts
export type Skin = 'modern' | 'retro';
export const skin = persisted<Skin>('skin', 'modern');
```

- Un `$effect` dans `+layout.svelte` pose `document.documentElement.dataset.skin` et
  (pour `retro`) retire la classe `.dark` / force `color-scheme: light`.
- Paramètre d'URL `?skin=retro` (même mécanique que les autres préférences
  dans `url.ts`) pour partager un lien rétro.
- Toggle dans `advanced-panel.svelte` (section Affichage) : « Habillage : Moderne / Rétro 2000 ».
- Ajouté à `resetStates()`.

### 4.2 Trois couches à habiller

| Couche                                                             | Mécanisme                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Chrome** (header, sidebar, dock, dialogs, popups)                | Jeu de tokens CSS sous `[data-skin='retro']` + quelques utilitaires de skin       |
| **Carte** (basemap + couches vecteur + cartouche)                  | Style basemap rétro + « palette carte » lue par `layers.ts` + composant cartouche |
| **Graphiques canvas** (météogramme Highcharts, skew-T, hodographe) | Thème lu depuis les variables CSS du skin au montage (`getComputedStyle`)         |

### 4.3 Trois options pour le chrome

**A. Override CSS pur** — sous `[data-skin='retro']`, cibler les classes existantes
(`.text-white\/70 { color: … }`, etc.). Rapide (≈ 1 j), mais fragile : chaque
nouvelle classe casse le skin, et les opacités blanches n'ont pas d'équivalent
sémantique sur fond clair.

**B. Tokenisation puis skin = jeu de tokens (recommandé).** Introduire des tokens
sémantiques pour le chrome et remplacer les 193 `*-white/NN` :

| Token               | Moderne                       | Rétro                       |
| ------------------- | ----------------------------- | --------------------------- |
| `--chrome-bg`       | `--glass` teal abyssal + flou | `#ffffff` opaque            |
| `--chrome-fg`       | blanc                         | `#000000` / `#000066`       |
| `--chrome-fg-muted` | `white/50–70`                 | `#555555`                   |
| `--chrome-border`   | `white/10`                    | `#99bbff` 1 px              |
| `--chrome-hover`    | `white/8–12`                  | `#d6e6f7`                   |
| `--chrome-active`   | `--ic-sky`                    | `#3b679e` texte blanc       |
| `--chrome-title-bg` | (sans)                        | dégradé `#4a7ab4 → #2d5689` |
| `--radius`          | `0.625rem`                    | `0`                         |

Utilitaires Tailwind v4 associés (`text-chrome-fg`, `bg-chrome-hover`…) via
`@theme inline`. Le skin moderne reste **pixel-identique** (les tokens prennent
ses valeurs actuelles) — vérifiable par captures avant/après. Bénéfice
secondaire : un futur thème clair « moderne » deviendrait quasi gratuit.

**C. Composants dédiés par skin** — dupliquer header/sidebar/time-selector. Non
recommandé : double maintenance de la logique.

Exception assumée à B : l'**échéancier** rétro (grille de cases) est une
présentation différente, pas un recoloriage. On garde la logique de
`time-selector.svelte` et on ajoute une variante de rendu (`{#if $skin === 'retro'}`)
— c'est le marqueur visuel le plus fort, ça vaut la branche.

## 5. Spécification visuelle du skin « Rétro 2000 »

Inspiration, **pas copie** : aucune image, logo ou gif repris de Meteociel ou
d'Infoclimat (`fond_5.2.jpg`, `car3.gif`, `fond_titre_cat.jpg`) ; dégradés et
puces refaits en CSS/SVG. Le logo Infoclimat déjà utilisé reste celui du header.

- **Typo** : `Verdana, Tahoma, Geneva, sans-serif` 12 px (11 px pour les cases
  d'échéance), gras pour titres et item actif, `tabular-nums` conservé.
- **Header** : dégradé teal → bleu, logo + titre en blanc, fil
  « GFS 0.5° · Run 12Z · + 81h » en gras blanc ; pas de pilule, onglet carré.
- **Barres de section** (onglets sidebar, titres de panneaux) : `--chrome-title-bg`,
  texte blanc gras capitales, suffixe « » », liseré bas 1 px `#99bbff`.
- **Panneaux** : fond blanc opaque, bordure 1 px, angles droits, sous-groupes
  sur fond `#e4f0fa` en italique avec ▿ ; item actif en gras + fond pâle.
- **Boutons** : style Meteociel (crème `#fafaf2`, bordure `#e9e9dc`, texte `#555`
  gras) avec bevel 1 px (`box-shadow: inset 1px 1px #fff, inset -1px -1px #c8c8b8`).
- **Échéancier** : grille de cases 26×16 px, vert `#9fc663` pour l'horizon court,
  orange `#ffd385` au-delà (seuil = pas de temps du modèle qui change, ou 50 % de
  l'horizon), case courante cerclée rouge `#e00`, cases déjà en cache marquées
  d'un point. Bouton ▷ PLAY gris système.
- **Pastilles de run** 00Z/06Z/12Z/18Z avec les couleurs relevées.
- **Fond de page / mobile dock** : option d'un fond bleu Meteociel
  (`#122498 → #0d6ccc`) derrière les panneaux sur mobile.
- **Contrôles MapLibre** (`.maplibregl-ctrl-group`) : carrés, fond blanc, bordure 1 px.

### 5.1 Carte

- **Basemap rétro** : terres gris très pâle / blanc, mers bleu pâle uni,
  frontières et côtes **noires 0.8 px**, pas de routes ni de bâti, labels villes
  en Noto Sans noir sans halo (ou masqués par défaut).
- **Départements** : noir 0.5 px (au lieu du blanc/noir à 55 %).
- **Isolignes** : blanches pleines (géopotentiel/pression), étiquettes blanches
  sur fond de la couleur, à la façon des cartes de modèles ; flèches de vent noires.
- **Cartouche de titre** (signature) : bandeau blanc en haut de la carte,
  « Run GFS 0.5° — 04 novembre 2026 12Z / Géopotentiel à 500 hPa » à gauche,
  « Échéance : mercredi 4 novembre 12h UTC — **+ 81H** » à droite. Composant
  HTML superposé, alimenté par les stores existants (`selectedDomain`, `modelRun`,
  `time`, variable). Il remplace la `context-strip` en skin rétro et doit être
  **inclus dans les exports** (`capture-flow.svelte`) — une capture rétro
  ressemble alors vraiment à une « carte de modèle ».
- **Échelles de couleurs (optionnel, lot séparé)** : jeu « rétro » à paliers
  francs (arc-en-ciel GrADS pour le géopotentiel, palette Meteociel pour la
  température), injecté via `omProtocolSettings.colorScales`. **Aucune modif du
  fork nécessaire.** À garder découplé du skin (préférence distincte) : certains
  voudront le chrome rétro avec les échelles actuelles.

### 5.2 Graphiques

Météogramme (Highcharts) : fond blanc, grille grise pointillée, police Verdana,
séries aux couleurs saturées. Skew-T / hodographe : lire les couleurs depuis les
variables CSS du skin au lieu des valeurs en dur.

## 6. Découpage en lots

| Lot | Contenu                                                                                                                                | Effort  | Risque                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------ |
| 0   | Tokens chrome + remplacement des 193 `*-white/NN` et couleurs nommées ; captures avant/après pour prouver que « Moderne » est inchangé | 1,5–2 j | Moyen (régressions visuelles)        |
| 1   | Store `skin`, `data-skin`, URL `?skin=`, toggle, découplage du dark forcé                                                              | 0,5 j   | Faible                               |
| 2   | Feuille `skins/retro.css` : tokens, barres de titre, panneaux, boutons, radius, contrôles MapLibre                                     | 1,5 j   | Faible                               |
| 3   | Échéancier en grille + pastilles de run                                                                                                | 1 j     | Faible                               |
| 4   | Carte : basemap rétro, palette carte dans `layers.ts`/`departments-layer.ts`, cartouche + export                                       | 1,5–2 j | Moyen (ré-application au `setStyle`) |
| 5   | Météogramme / skew-T / hodographe thémés                                                                                               | 1 j     | Faible                               |
| 6   | (Optionnel) jeu d'échelles de couleurs rétro                                                                                           | 1 j     | Faible                               |

**Total ≈ 8–10 jours**, livrables en 3 PR : (0) tokenisation sans changement
visible → (1+2+3) skin chrome → (4+5+6) carte et graphiques. Le lot 0 a de la
valeur seul (prépare tout thème futur).

Un **prototype rapide** (option A sur 2–3 composants : header, sidebar,
échéancier) est faisable en ~1 j pour valider le rendu avant d'engager le lot 0.

## 7. Risques et questions ouvertes

- **Lisibilité / accessibilité** : 11–12 px Verdana reste lisible, mais sur mobile
  il faut garder des cibles tactiles ≥ 44 px même si le visuel est dense.
- **Mobile** : les sites de référence n'ont pas de version mobile ; le bottom-sheet
  actuel sera simplement habillé (pas de layout 3 colonnes sur mobile).
- **Desktop 3 colonnes** : faut-il reproduire paramètres à gauche / options à
  droite ? Proposition : non au départ (structure inchangée, habillage seulement),
  à reconsidérer si le rendu manque de caractère.
- **Basemap rétro** sans labels par défaut ? Les cartes de modèles d'époque n'en
  ont pas ; mais le toggle « Villes & pays » existe déjà.
- **Nom du skin** : « Rétro 2000 », « Classique », « v5 » ?
- **Contrats tests** : ajouter un test Vitest du store `skin` + sync URL ; la
  non-régression visuelle du lot 0 se fait par captures (pas d'outillage visuel
  en CI aujourd'hui).
- **Docs** : mettre à jour `.claude/rules/stores.md` (nouveau store),
  `.claude/rules/components.md` (tokens chrome) et la section Architecture du
  `README.md`.

---

## 8. Contre-expertise (agent autonome, 2026-11-11) — corrections retenues

Les points ci-dessous **priment** sur les sections 3 à 6 en cas de contradiction.

### 8.1 Corrections factuelles

- Le chantier « blanc » est ~**359 classes** dans 35 fichiers (pas 193) : s'ajoutent
  `text-white` nus (61), `ring-white/NN` (35 — **anneaux de focus**), opacités
  arbitraires `bg-white/[0.04]` (67). Couleurs nommées : **117** (dont 55 `sky-*`,
  l'accent d'état actif). `bg-glass*` : 59 usages sur 6 opacités.
- `--radius` ne pilote que `rounded-sm/md/lg/xl` ; `rounded` nu et `rounded-full` non.
- 26 échelles de couleurs locales (pas 28).
- Skew-T / hodographe sont des **SVG Svelte** réactifs à `mode.current`, pas des canvas.
- Le toggle d'affichage vit dans `display-section.svelte`, pas `advanced-panel.svelte`.
- **L'export PNG ne capture pas le DOM** : `png-export.ts` recadre le canvas MapLibre
  et dessine son bandeau en Canvas 2D. Le cartouche rétro doit donc être implémenté
  **deux fois** (HTML à l'écran, Canvas 2D à l'export).
- Couleurs en dur aussi hors composants : `vector-styles.ts`, `meteogram-chart.ts`
  (constantes module → reconstruire le graphe au changement de skin),
  `png-export.ts`, `weather-ai/map-layers.ts`, `weather-ai/tracks.ts`.
- `ui/select-content.svelte` (`bg-glass/85`) et `ui/switch.svelte` (`bg-sky-500`) sont
  déjà retouchées : les primitives ne suivront pas « sans modification ».

### 8.2 Le nœud oublié : `mode.current`

`mode.current` (mode-watcher) est lu à ~10 endroits, dont **`url.ts:382`** qui ajoute
`&dark=true` à l'URL `om://` → le worker choisit des variantes de palettes raster.
Retirer `.dark` pour un chrome clair changerait donc **les couleurs de la carte** et
toutes les URL de slots (2 tests assertent `dark=true`). Autres lecteurs : `popup.ts`,
`scale.svelte`, `context-strip.svelte`, `layer-list.svelte`, `watermark-details.ts`,
`skew-t`, `hodograph`, `time-selector`, `ui/sonner`.

**Décision** : le skin **ne touche pas** mode-watcher. `.dark` reste posée ; le skin
rétro est une couche `[data-skin='retro']` par-dessus. Le découplage
`&dark=true` ↔ chrome devient une PR préalable (« source de vérité thème ») seulement
si on veut un jour un vrai thème clair. Lever explicitement la règle
« ne pas remettre le chrome sur un thème adaptatif » de `.claude/rules/stores.md`
quand le skin sera livré.

### 8.3 Architecture révisée

- **Token d'encre à alpha** plutôt que 5 tokens `--chrome-*` : `--color-ink` (blanc en
  Moderne, bleu nuit en Rétro), remplacement mécanique `white` → `ink`
  (`text-ink/70`, `bg-ink/[0.04]`, `ring-ink/20`). Moderne identique par construction ;
  seuls les `text-white` posés sur fond coloré restent `white`.
- **Réutiliser les tokens shadcn** (`--popover`, `--border`, `--glass`, `--radius`…) et
  n'ajouter que 3–4 tokens : encre, accent (remplace `sky-*`), fond de barre de titre.
- **`@custom-variant retro (&:where([data-skin='retro'] *))`** pour les écarts
  structurels (capitales, bevel, pas de flou) au lieu de `{#if $skin}` dispersés.
- **Anti-FOUC** : script inline dans `app.html` qui pose `data-skin` avant le bundle
  (le store persisté stocke du JSON : `"\"retro\""`).
- Échéancier : extraire d'abord la logique de `time-selector.svelte` (1198 lignes)
  avant d'ajouter un rendu rétro.
- CSS global à couvrir : `:root` (`color`, `background-color`), règles `.dark …` des
  contrôles MapLibre / popups / time-slider, `.weather-ai-tooltip`, `.scrollbar-thin`.
- `?skin=` : un lien partagé **n'écrase pas** la préférence persistée (à trancher).

### 8.4 IP et accessibilité

- Aucune mention nominative de Meteociel dans l'UI ni le code ; palettes rétro
  **dérivées de GrADS**, pas d'un relevé du concurrent. Verdana n'est pas
  redistribuable en webfont (pile système uniquement ; absente d'Android/Linux).
- Cases d'échéance 26×16 px incompatibles avec les cibles tactiles : grille desktop
  seulement, mobile garde le curseur. Ne pas coder l'information par la couleur seule
  (case courante : contour + gras). `app.html` bloque le zoom (`user-scalable=no`) —
  aggravant avec du 11–12 px. Focus (`ring-white/*`) et scrollbars à re-teinter.

### 8.5 Estimation révisée

**13–18 jours** (vs 8–10), lot 6 (échelles) hors périmètre. Découpage :
prototype jetable (1 j) → tokenisation encre (1,5–2 j, à caler entre deux PR
weather-ai, zone la plus chargée en classes blanches) → store/URL/anti-FOUC/tokens
rétro → échéancier seul → carte + cartouche (×2) → graphiques.
