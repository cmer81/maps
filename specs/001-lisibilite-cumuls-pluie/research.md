# Research (Phase 0) : couleurs de précipitations alignées sur Infoclimat

**Date** : 2026-09-28
**Plan** : [plan.md](./plan.md)
**Spec** : [spec.md](./spec.md)
**Diagnostic** : [diagnostic.md](./diagnostic.md)

Chaque section donne la décision retenue, sa justification et les alternatives écartées. Les mesures sont reproductibles avec les scripts de `research/` et `references/`.

---

## R1. Faisabilité du critère « clarté monotone » (SC-002 / FR-006) : critère à amender

**Constat (mesuré)**

`research/palette_search.py` cherche une palette de 17 rangs sous plusieurs contraintes :

- chaque rang garde sa teinte Infoclimat (OKLCH, ±8° à ±20°) ;
- chaque rang reste à moins de D en ΔE00 de sa couleur Infoclimat (fidélité) ;
- la clarté CIELAB est non croissante ;
- l'écart ΔE00 est maximal entre voisins.

| Contraintes                                                                                  | Résultat                                                                         |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Clarté monotone sur toute la rampe, D ≤ 25                                                   | **aucune palette** (le bleu foncé du rang 2, L* 33, interdit ensuite tout jaune) |
| Idem, rangs 2-3 libres, D = 15                                                               | faisable, ΔE00 min 16,6 entre voisins…                                           |
| Palette la plus proche d'Infoclimat sous ces contraintes (Σ fid² minimal, ΔE00 voisins ≥ 10) | **inutilisable** (voir ci-dessous)                                               |

Pourquoi la palette la plus proche est inutilisable :

- les rangs 3 à 13 se tassent entre L* 73 et 78, ce qui recrée un plateau ;
- les jaunes virent à l'ocre ou au kaki ;
- les rangs 9 et 11 sortent **identiques** : (201,184,110) et (200,184,110). Le critère « voisins » ne l'interdit pas.

**Conclusion.** Avec l'ordre de teintes d'Infoclimat (bleus → verts → jaunes → rouges), qu'on garde par décision Q3, une clarté monotone sur toute la rampe est **incompatible** avec la conservation des familles de teinte. Le jaune ne peut pas être sombre. Le critère SC-002 tel qu'écrit est donc infaisable, et il faut le reformuler.

**Décision : critère reformulé.** Il est reporté dans la spec (FR-006, SC-002, A8) et **validé par l'utilisateur le 2026-09-28**.

1. ΔE00 ≥ 10 entre classes voisines **et** entre classes séparées d'un rang (distance 2). Cela interdit les « doublons » non voisins du type 9 ≡ 11.
2. Pas d'inversion aux faibles valeurs : L* ≥ 70 pour les rangs 1 à 4, donc aucune faible classe n'est plus sombre que les classes fortes (≥ rang 14).
3. Clarté non croissante à partir du jaune pur (rang 10 → 17) : la montée en intensité est lue de manière univoque sur la moitié haute.
4. La profil en « cloche » (bleus clairs → jaune clair → rouges sombres) est assumé. C'est la forme propre à la rampe Infoclimat.

**Alternatives écartées**

- Clarté monotone stricte : infaisable (voir ci-dessus).
- Monotonie avec tolérance cumulée de 3 L* par pas : produit des palettes aberrantes (bleu → blanc, jaune pâle → brun), car la tolérance s'additionne d'un rang à l'autre.
- Abandonner l'ordre de teintes Infoclimat : contraire à Q3.

---

## R2. Palette dérivée retenue (validée le 2026-09-28 : rang 2 pervenche)

**Décision.** Palette générée par `palette_search.py 8 0 25 11 2,3,4`, avec `CLOSEST2_T=10 LMIN_LOW=70 NCAND=60`. Données : `research/palette-candidate.json`. Nuancier clair/sombre : `research/palette-candidate.html`.

| Rang  | Infoclimat           | maps            | ΔE00 vs Infoclimat | L*          |
| ----- | -------------------- | --------------- | ------------------ | ----------- |
| 1     | 183,218,226          | =               | 0                  | 84.8        |
| 2     | 0,23,254             | **150,172,255** | 41.1               | 71.7        |
| 3     | 0,131,209            | **96,176,255**  | 14.9               | 70.0        |
| 4     | 83,195,215           | =               | 0                  | 73.4        |
| 5     | 34,240,150           | =               | 0                  | 84.4        |
| 6     | 110,245,40           | 96,231,0        | 3.2                | 81.6        |
| 7     | 163,255,17           | 186,255,31      | 2.8                | 92.6        |
| 8     | 216,228,134          | 200,220,126     | 2.9                | 84.5        |
| 9     | 244,240,149          | 255,245,163     | 2.6                | 95.7        |
| 10    | 255,255,0            | =               | 0                  | 97.1        |
| 11    | 253,229,116          | 255,220,93      | 3.6                | 88.6        |
| 12-17 | (oranges → bordeaux) | =               | 0                  | 75.9 → 30.0 |

**Bilan**

- 9 rangs sur 17 inchangés ; 6 rangs retouchés de manière imperceptible à légère (ΔE00 ≤ 3,6).
- 2 rangs franchement modifiés : le bleu saturé du rang 2 devient un bleu pervenche clair, et le rang 3 est éclairci.
- ΔE00 minimal sur **toutes** les paires : 10,0.
- Le jaune pur (rang 10) et toute la moitié haute (rangs 12 à 17) sont strictement identiques à Infoclimat.

**Justification.** Les deux défauts mesurés sont corrigés :

- l'inversion du rang 2 : L* passe de 33 à 72 ;
- les paires quasi indiscernables 6/7 et 8/9 : ΔE00 passe de 5 à 10 et plus.

Tout en respectant FR-005 (mêmes bornes, même ordre et familles de teintes, écarts documentés).

**V1 (tranché le 2026-09-28)** : l'utilisateur a validé le critère et délégué le choix du rang 2. Le **pervenche (150,172,255)** est retenu, parce qu'il garde un bleu saturé proche du bleu vif d'Infoclimat. La variante bleu-gris (129,158,217), plus terne (L* 65), se rapprocherait du rang 1 gris-bleu.

Points qui restent à vérifier sur la carte réelle :

- Validation visuelle sur la carte réelle, clair et sombre (quickstart, scénario Q5).
- Le rang 2 pervenche est proche de la famille « lavande ». Si l'auteur du retour le trouve trop violet, relancer avec `LMIN_LOW=65` : rang 2 = (129,158,217), plus bleu-gris, ΔE00 minimal 10,0.

**Alternatives écartées**

- `HUE_TOL=20` : rang 2 lavande (168,165,255), jugé trop violet au nuancier.
- `LMIN_LOW=60` : l'inversion subsiste en partie (rang 3 à L* 61, plus sombre que le rang 14).

---

## R3. Transparence sous la première borne

**Constat (code du package)**

- `getColor` applique `colors[Math.max(0, findLastIndexLE(breakpoints, px))]` : une valeur sous `breakpoints[0]` reçoit `colors[0]`, **pas** la transparence.
- Le commentaire de `src/lib/color-scales/precipitation-sum.ts` (« rendu transparent par le moteur ») est donc **faux**. Aujourd'hui, un cumul nul à H0 est teinté en bleu très pâle, à 50 % d'opacité.

**Décision.** Chaque échelle commence par une classe explicite `0 → [r,g,b,0]` (transparente), comme la 1re ligne des `.cpt` Infoclimat. Les 17 classes colorées suivent. Une valeur dans [0, borne 1) est ainsi transparente, et une valeur ≥ dernière borne prend la couleur 17 (FR-004).

**Alternative écartée** : modifier `getColor` dans le fork. C'est inutile, et contraire à la règle « d'abord `omProtocolSettings` ».

---

## R4. Opacité des couleurs

**Décision.** Toutes les classes colorées sont opaques (alpha 1), comme sur Infoclimat. L'atténuation relève du curseur d'opacité global de l'app, qui existe déjà.

**Justification**

- Les alphas progressifs des échelles actuelles (0,5 à 1) faussent les couleurs perçues sur fond clair ou sombre.
- Ils rendent aussi la comparaison avec Infoclimat impossible.

**Alternative écartée** : conserver des alphas dégressifs, qui réintroduiraient une dépendance au fond.

---

## R5. Durée d'échelle : cumul du run (Q1 = A) et variables par pas de temps

**Constat (mesuré, `latest.json` du 2026-09-28)**

| Domaine                             | Pas de temps observés                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `ecmwf_ifs025`                      | 3 h partout                                                                  |
| `ncep_gfs025`                       | 1 h (120 pas) puis 3 h (88 pas)                                              |
| `dwd_icon`                          | 1 h (78 pas) puis 3 h (34 pas) ; expose `precipitation`, `rain` et `showers` |
| `meteofrance_arome_france_hd_15min` | 15 min                                                                       |

**Décision**

- **Cumul du run** (`precipitation_sum`) :
  - durée = heure valide − heure du run (`modelRun`) ;
  - palier = plus petit palier ≥ durée (A6), parmi {1, 3, 6, 12, 24, 48, 72} h ;
  - au-delà de 72 h, palier 72 h ;
  - durée ≤ 0 (H0) : palier 1 h, la carte est de toute façon transparente.
- **Variables par pas** (`precipitation`, `rain`, `showers`) :
  - durée = écart entre l'heure valide et l'heure valide précédente dans `metaJson.valid_times` ;
  - pour la 1re échéance, on prend l'écart avec la suivante ;
  - même règle de palier ; un pas de 15 min → palier 1 h (A2).

**⚠ Hypothèse à vérifier (V2, tâche bloquante en début d'implémentation).** On suppose qu'aux pas de 3 h, la valeur `precipitation` des fichiers spatiaux est un **cumul sur 3 h**, et non un cumul horaire ou un taux.

- **Protocole** : sur `dwd_icon`, qui a les deux segments, comparer en un point la valeur spatiale à une échéance 3-horaire avec la somme des 3 valeurs horaires de l'API Open-Meteo pour ce point et ce run.
- **Si c'est faux** (valeur horaire), les variables par pas utilisent le palier 1 h partout et la règle « pas de temps » disparaît. Seul le cumul du run garde des paliers.

**Alternatives écartées**

- Toujours le palier 1 h pour les variables par pas : sature à 150 mm, et donc faux si un pas de 3 h ou 6 h cumule davantage.
- Palier le plus proche plutôt que le palier supérieur : la classe la plus haute sature plus tôt (par exemple, 18 h avec l'échelle 12 h plafonne à 550 mm, contre 700 mm avec l'échelle 24 h).

---

## R6. Où choisir l'échelle : rendu, légende, popup, vignettes

**Constat (code du package)**

- `parseRequest` appelle `settings.resolveRequest` **à chaque requête**, et les `renderOptions`, color scale comprise, sont recalculées à chaque fois.
- Seul `variable` est un paramètre « data » (`DATA_RELEVANT_PARAMS`). Les autres paramètres d'URL servent uniquement au rendu.
- 8 sites d'appel de `getColorScale` dans l'app : `layers.ts` ×2, `popup.ts`, `watermark-details.ts`, `scale.svelte` ×2, `context-strip.svelte`, `layer-list.svelte`.

**Décision**

1. Un module pur `src/lib/color-scales/precipitation-infoclimat.ts` porte :
   - la palette et les bornes par palier ;
   - les fonctions `precipitationTierFor(...)` et `precipitationScaleForTier(...)`.
2. `getOMUrlFor()` (`url.ts`) ajoute `&precip_tier=<1h|3h|…|72h>` pour les variables concernées. Le palier est calculé à partir de l'heure demandée (`timeOverride` compris), de `modelRun` et de `metaJson`.
   - L'URL reste déterministe : le décode anticipé des voisins (`neighbor-prefetch.ts`) bâtit la même URL et obtient donc le même palier.
3. `customResolveRequest` (`om-protocol-settings.ts`) lit `precip_tier`. Si la variable est concernée et que l'utilisateur n'a pas de palette personnalisée pour elle, il injecte l'échelle du palier dans les `colorScales` passées à `defaultResolveRequest`.
4. Un helper `resolveAppColorScale(variable, dark, colorScales, tier?)` remplace les appels directs à `getColorScale` là où l'échelle ou la légende est **affichée** : `scale.svelte`, `popup.ts`, `watermark-details.ts`, `context-strip.svelte`.
   - Le palier courant vient d'un store dérivé `precipitationTier` (`time`, `modelRun`, `metaJson`, `variable`).
   - `layers.ts` et `layer-list.svelte` n'utilisent que l'unité ou un aperçu : ils peuvent rester sur `getColorScale`, l'unité étant la même (mm).
5. **Aucune modification du fork.**

**Alternatives écartées**

- Déduire le palier dans le resolver à partir du seul `baseUrl` (run et heure dans le chemin) : cela marche pour le cumul du run, mais pas pour les variables par pas, qui ont besoin de `valid_times`. Deux mécanismes au lieu d'un.
- Clés d'échelle virtuelles par palier (`precipitation_sum@24h`) dans `colorScales` : cela casse la personnalisation par variable et la résolution par préfixe.
- Mutation du store `omProtocolSettings` à chaque changement d'échéance : cela invaliderait les hashes de couleur (`colorHashSuffix`) et le cache à chaque pas.

---

## R7. Palettes personnalisées et « couleurs standard » (FR-016)

**Décision**

- Si `customColorScales[variable]` existe, elle s'applique **à tous les paliers**, sans substitution, ce qui préserve la personnalisation.
- `standardColorScales.precipitation`, `rain` et `showers` pointent vers le palier 1 h, et `standardColorScales.precipitation_sum` vers le palier 24 h. Ce sont les références de « réinitialiser ».
- Après réinitialisation, la substitution par palier reprend.

**Alternative écartée** : une personnalisation par palier, qui obligerait à éditer 7 palettes. C'est disproportionné.

---

## R8. Vignettes « Valeurs » (US4, FR-010 à FR-014)

**Format (A1)**

- Pour les variables concernées :
  - v < 10 : 1 décimale, virgule française ;
  - v ≥ 10 : entier.
- Réalisation : expression MapLibre à branches (`case`). Le problème documenté `max-fraction-digits: 0` ne se pose pas avec 1 décimale ; l'entier reste arrondi par `['round', …]`.
- Les autres variables gardent `buildGridValueLabelExpr` inchangé.

**Masquage (A3 affiné)** : pas de vignette si la valeur affichée serait « 0,0 », soit v < 0,05 mm. On ajoute un filtre `['>=', value, 0.05]` au filtre de décimation, pour les variables concernées seulement.

**Chevauchement (A4)**

- **Analyse** : `computeStride = max(1, round(target/screenStep))`. L'espacement réel est ≥ `target / 1.5` = **32 px** pour `GRID_VALUE_TARGET_PX = 48`, le pire cas étant un rapport juste sous 1,5, arrondi à 1.
- Une étiquette de 4 caractères au plus (« 9,9 », « 152 », « 1520 ») mesure environ 4 × 6,3 px + 2 × 1,5 px de halo ≈ 28 px de large et 14 px de haut, donc < 32 px. **Aucun chevauchement sur les grilles régulières.**
- **Décision** : garder la grille figée (sans collision). Ajouter un test qui verrouille l'invariant « espacement minimal ≥ largeur maximale d'étiquette » pour le format pluie.
- **Limite connue** : sur les grilles gaussiennes (repli de décimation en 1D, lignes non décimées), l'espacement vertical n'est pas garanti, pour toutes les variables. C'est hors périmètre, à signaler.

**Lisibilité (SC-004)**

- Texte noir à 0,85 avec halo blanc à 0,85 en thème clair, inversé en thème sombre.
- On vérifie par calcul le contraste texte/halo et halo/couleur de classe sur les 17 couleurs, dans les deux thèmes. Si une classe échoue (rangs 15 à 17 sombres en thème clair ?), le halo porte le contraste. Le critère est mesuré sur le couple texte/halo, à confirmer en tâche.

**Documentation.** `.claude/rules/architecture.md` décrit une décimation 1D avec collision native. Le code actuel (`layers.ts:283-330`) fait une décimation **2D** sur `id` global avec `text-allow-overlap: true`. **Le document est obsolète** et sera corrigé dans la même livraison (règle du `CLAUDE.md`).

---

## R9. Légende (US3, FR-007 à FR-009)

**Décision**

- `scale.svelte` affiche déjà les breakpoints d'une échelle `breakpoint`, et la conversion d'unité (`convertValue`) y est déjà gérée.
- On y ajoute :
  - l'échelle du **palier courant** (via `resolveAppColorScale`) ;
  - un en-tête « échelle 24 h » (A7) pour les variables concernées ;
  - le masquage de l'entrée 0 transparente, pour que la légende commence à la 1re classe colorée, avec des libellés « ≥ borne ».
- Même traitement dans `watermark-details.ts` (légende des exports PNG).

**Alternative écartée** : une légende dédiée « façon Infoclimat » dans un nouveau composant. C'est une duplication inutile.

---

## R10. Gouvernance (constitution)

**Constat** : `.specify/memory/constitution.md` est le gabarit non renseigné.

**Décision** : les points de contrôle du plan reprennent les règles durables du `CLAUDE.md` du projet :

- dépendance forkée ;
- mise à jour des docs dans la même livraison ;
- runes Svelte 5 ;
- tests Vitest de logique pure ;
- CI `check`, `test` et `build` ;
- titres de PR sémantiques.

---

## V2 : résultat (2026-09-28), hypothèse confirmée

**Méthode.** L'API horaire d'Open-Meteo est elle-même dérivée des pas de 3 h aux longues échéances, et ne fournit donc pas de vérité indépendante. On compare plutôt la **moyenne globale** du champ `precipitation` lu directement dans les fichiers spatiaux, avec `@openmeteo/file-reader` sous Node (`OmFileReader` + `OmHttpBackend`, `getChildByName('precipitation')`), entre pas horaires et pas de 3 h d'un même run.

| Domaine / run                 | Échéance                   | Pas | Moyenne globale (mm)     | Max (mm)           |
| ----------------------------- | -------------------------- | --- | ------------------------ | ------------------ |
| `dwd_icon` 2026-09-28 12Z     | 2026-10-01 16Z / 17Z / 18Z | 1 h | 0.1137 / 0.1134 / 0.1131 | 67.5 / 70.5 / 65.1 |
| `dwd_icon` 2026-09-28 12Z     | 2026-10-01 21Z             | 3 h | **0.3433** (×3,03)       | 76.0               |
| `ecmwf_ifs025` 2026-09-28 06Z | 2026-09-29 06Z / 09Z       | 3 h | 0.3136 / 0.3287          | 106.8 / 109.6      |

**Conclusion.** Aux pas de 3 h, `precipitation` est un **cumul sur le pas** : la moyenne est multipliée par 3 exactement au passage 1 h → 3 h. La règle R5 « palier = durée du pas » est retenue, et le repli n'est pas nécessaire.

## Recontrôle sur le fork 0.2.0 (2026-09-28)

Les analyses R3 et R6 avaient été faites sur un `node_modules` obsolète (0.1.1). Après `npm ci`, qui installe bien la 0.2.0 épinglée, tout a été recontrôlé dans le build minifié :

- `resolveRequest` est appelé à chaque requête ;
- seul `variable` est un paramètre « data » ;
- `getColor` breakpoint applique `colors[Math.max(0, idx)]`, donc `colors[0]` sous la 1re borne.

**Nouveauté de la 0.2.0** : un paramètre d'URL `color_blend=true` active une interpolation continue entre les couleurs. Il est désactivé par défaut, et l'app ne l'émet pas. Les aplats restent donc discrets (FR-003), et **`color_blend` ne doit pas être émis pour les variables de précipitations**.

## V1 : contrôle sur carte (2026-09-28)

Contrôle sur la carte réelle `dwd_icon`, `precipitation`, échéance 3-horaire du 2026-10-01 21Z, zooms 4 et 5, fond clair :

- les faibles cumuls s'affichent en bleu clair et pervenche : il n'y a plus de bleu saturé qui attirerait l'œil ;
- la progression vers le vert puis le jaune se lit de façon continue ;
- le rang 2 est perçu comme **bleu** (légère nuance lavande), la variante bleu-gris n'est pas nécessaire ;
- les zones sèches sont transparentes.

Non encore contrôlé : le fond de carte sombre (A5) et un épisode à cumuls très forts (rangs 12 à 17). À refaire au quickstart Q5, quand un tel épisode sera disponible dans les runs.
