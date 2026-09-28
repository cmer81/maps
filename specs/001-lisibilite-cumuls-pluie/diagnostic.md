# Diagnostic : couleurs de précipitations `maps` et échelle Infoclimat

**Date** : 2026-09-28
**Spec** : [spec.md](./spec.md)

**Conventions de chemins**

- `maps/…` : ce dépôt.
- `site/…` : `~/Documents/git/infoclimat/site-infoclimat`.

## 1. État actuel dans `maps`

### Échelles de couleur des variables de précipitations (mm)

| Variable                                                           | Échelle actuelle                                                                             | Bornes                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `precipitation` (par pas de temps)                                 | défaut Open-Meteo (`@openmeteo/weather-map-layer`, clé `precipitation`)                      | 15 classes : 0.01, 0.055, 0.11, 0.255, 0.45, 0.95, 2, 3, 4.95, 7.45, 10, 15, 20, 25, 30 |
| `rain`, `showers`, `snowfall_water_equivalent`                     | alias Open-Meteo de `precipitation`                                                          | idem                                                                                    |
| `precipitation_sum` (cumul du run)                                 | `maps/src/lib/color-scales/precipitation-sum.ts`                                             | 12 classes : 1, 2, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300                            |
| `graupel_sum`, `snow_graupel_sum`, `snowfall_water_equivalent_sum` | échelle `precipitation` d'Open-Meteo (`maps/src/lib/stores/om-protocol-settings.ts:151-153`) | sature à 30 mm                                                                          |

- Les échelles sont branchées dans `standardColorScales` (`om-protocol-settings.ts`).
- La résolution par nom de variable (correspondance exacte, puis préfixe) se fait dans le package (`getOptionalColorScale`).
- La légende (`maps/src/lib/components/scale/scale.svelte`) liste les breakpoints de l'échelle. Les couleurs sont éditables par l'utilisateur et persistées (`customColorScales`).

### Pas de temps de `precipitation`

- 1 h pour la plupart des domaines.
- 15 min pour `meteofrance_arome_france_hd_15min` et `…0025_15min`.
- Certains modèles globaux passent probablement à 3 h ou 6 h aux longues échéances. **À vérifier lors du plan.**

### « Vignettes » = calque « Valeurs » aux points de grille

Code : `maps/src/lib/layers.ts:283-330` et `maps/src/lib/vector-styles.ts:202-300`.

- **Police** : texte de 11 px, noir à 0,85 avec halo blanc de 1,5 px (inversé en thème sombre), sans fond coloré.
- **Densité** :
  - décimation 2D régulière qui vise un espacement de 48 px à l'écran (`GRID_VALUE_TARGET_PX`) ;
  - `text-allow-overlap: true`, donc aucune collision gérée ;
  - le code note lui-même qu'en dessous d'environ 40 px les libellés de 2-3 chiffres se touchent ;
  - un libellé à 5 caractères (« 152,4 ») n'est pas prévu.
- **Visibilité** : à partir du zoom 3.
- **Format** : `['round', value]`, soit un **arrondi à l'unité pour toutes les variables**. Pour la pluie :
  - 0,3 mm s'affiche « 0 » ;
  - toute zone sèche se couvre de « 0 ».

## 2. Référence Infoclimat

### Palettes de cumul

- **Sources** :
  - `site/cartes/palettes/radar*.cpt`, identiques à `site/cron/palettes/radar*.cpt` ;
  - elles servent aux rasters de cumul et à la légende de l'application radar-foudre-satellite (`site/cartes/radar-foudre-satellite/src/Palette.ts`).
- **Rendu** : aplats discrets (`gdaldem color-relief -nearest_color_entry`). La légende affiche « ≥ borne ».
- **Structure** :
  - la même suite de 17 couleurs pour toutes les durées ;
  - une première entrée à 0, transparente ;
  - seul `radar1h` a une 3e couleur différente et une entrée transparente supplémentaire à 1 mm.

| #   | Couleur RGB                   | 1 h | 3 h | 6 h | 12 h | 24 h | 48 h | 72 h |
| --- | ----------------------------- | --- | --- | --- | ---- | ---- | ---- | ---- |
| 1   | 183,218,226                   | 1.5 | 2   | 3   | 4.5  | 5.5  | 6.5  | 7.5  |
| 2   | 0,23,254 (1 h : 40,58,228)    | 2   | 2.5 | 4.5 | 6    | 7.5  | 9    | 10   |
| 3   | 0,131,209                     | 2.5 | 3.5 | 6   | 8    | 10   | 10   | 15   |
| 4   | 83,195,215 (1 h : 59,199,224) | 3.5 | 5   | 8   | 10   | 15   | 15   | 20   |
| 5   | 34,240,150                    | 4.5 | 7   | 10  | 15   | 20   | 20   | 25   |
| 6   | 110,245,40                    | 6   | 9   | 15  | 20   | 25   | 30   | 35   |
| 7   | 163,255,17                    | 8.5 | 10  | 20  | 25   | 35   | 40   | 45   |
| 8   | 216,228,134                   | 10  | 15  | 25  | 35   | 45   | 55   | 60   |
| 9   | 244,240,149                   | 15  | 25  | 35  | 50   | 65   | 75   | 80   |
| 10  | 255,255,0                     | 20  | 30  | 50  | 65   | 85   | 100  | 110  |
| 11  | 253,229,116                   | 30  | 40  | 65  | 90   | 115  | 130  | 150  |
| 12  | 248,168,136                   | 40  | 55  | 90  | 125  | 155  | 180  | 200  |
| 13  | 251,163,64                    | 50  | 75  | 120 | 165  | 210  | 240  | 270  |
| 14  | 255,117,10                    | 70  | 100 | 165 | 225  | 285  | 325  | 365  |
| 15  | 255,0,0                       | 95  | 135 | 220 | 300  | 385  | 440  | 495  |
| 16  | 192,0,0                       | 125 | 185 | 295 | 405  | 520  | 595  | 665  |
| 17  | 142,17,31                     | 150 | 250 | 400 | 550  | 700  | 800  | 900  |

**Vignettes stations du site** (`site/include/js/colorpal.js`, `rr1colorPal`, `rr3colorPal`, `rr24colorPal`)

- Mêmes couleurs, mais avec une classe supplémentaire à 0,2 mm et une interpolation HSV entre les bornes.
- Valeurs à 0,1 mm près.

**Hors périmètre**

- La « lame d'eau » Météo-France (`site/include/Radar/LAME_D_EAU_vers_RGBi.pal`) ne sert qu'à l'intensité 5 min.
- `radaric.cpt` sert à l'intensité et au cumul 5 min.

### Lisibilité mesurée de la palette Infoclimat

Mesures CIELAB / CIEDE2000, script `references/delta-e.py`. Les couleurs sont identiques pour toutes les durées (sauf les rangs 2 et 4 en 1 h), donc les écarts le sont aussi :

| Rang                        | 1    | 2    | 3    | 4    | 5    | 6    | 7       | 8    | 9       | 10   | 11   | 12   | 13   | 14   | 15   | 16   | 17   |
| --------------------------- | ---- | ---- | ---- | ---- | ---- | ---- | ------- | ---- | ------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Clarté L*                   | 84.8 | 33.5 | 52.8 | 73.4 | 84.4 | 86.4 | 91.4    | 87.9 | 93.3    | 97.1 | 90.9 | 75.9 | 74.2 | 65.0 | 53.2 | 39.9 | 30.0 |
| ΔE00 avec le rang précédent | –    | 50.2 | 29.7 | 25.0 | 32.0 | 14.2 | **5.9** | 14.3 | **5.2** | 12.4 | 10.9 | 29.3 | 14.9 | 12.8 | 17.4 | 13.5 | 12.8 |

- **Plateau de clarté.** Les rangs 5 à 11 (20 à 115 mm en 24 h ; 4,5 à 30 mm en 1 h) ont tous une clarté comprise entre 84 et 97. Ce sont des couleurs claires et pâles, distinguées par la seule teinte.
- **Inversion aux faibles valeurs.** Le rang 2 (7,5 mm en 24 h ; 2 mm en 1 h) est presque aussi sombre que le rang 16 (L* 33 contre 40). Un faible cumul paraît donc « fort ».
- **Paires quasi indiscernables** : rangs 6/7 et 8/9 (ΔE00 < 6).
- **Rang 1 sur fond sombre** : ce bleu très clair (L* 85) ressortira fortement sur le fond sombre de `maps`. Sur le fond clair, il se confondra presque avec le fond.

## 3. Captures de référence (cartes d'observations Infoclimat)

- **R1** (22/12/2025, pluie 24 h, zoom 9) : raster et vignettes. `references/ref1-2025-12-22-z9.png`.
  - Le cœur de l'épisode, de 45 à 155 mm, est « délavé ».
  - Des vignettes se chevauchent.
- **R2** (17/10/2024, pluie 24 h, zoom 9) : raster seul, les vignettes n'étaient pas chargées. `references/ref2-2024-10-17-z9.png`.
  - Le bleu saturé des faibles cumuls est plus voyant que les classes intermédiaires.
- Aucune observation à un autre zoom ni sur mobile.

## 4. Impact d'une modification dans `maps`

- **Échelles** : ajouter ou remplacer des entrées `standardColorScales` (clés exactes `precipitation`, `precipitation_sum`, etc.) suffit. Aucune modification du package forké n'est nécessaire.
  - **Exception** : pour `precipitation_sum`, l'échelle dépend de l'échéance (Q1 = A). Il faut donc la choisir selon le temps affiché, en tenant compte de l'heure de début du run.
  - Cette sélection concerne le rendu, la légende et les vignettes. À étudier au plan, a priori via `resolveRequest` / `omProtocolSettings`, sans toucher au fork.
- **Vignettes** : le format (décimale, masquage des 0) et l'espacement se règlent dans `maps` (`vector-styles.ts`, `layers.ts`). Il faudra un format **par variable** pour ne pas toucher aux autres couches (FR-014).
- **Tests existants à mettre à jour** : `maps/src/lib/tests/upstream-color-scales.test.ts`, `arome-france-color-scales.test.ts`, `vector-styles.test.ts`.
- **Documentation** : mettre à jour `.claude/rules/*.md` si le comportement de l'échelle ou des vignettes change (règle du `CLAUDE.md`).
