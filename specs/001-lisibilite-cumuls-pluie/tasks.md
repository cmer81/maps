---
description: "Liste de tâches : couleurs de précipitations alignées sur l'échelle Infoclimat"
---

# Tasks : couleurs de précipitations alignées sur l'échelle Infoclimat

**Input** : documents de conception dans `specs/001-lisibilite-cumuls-pluie/`

**Prerequisites** :

- [plan.md](./plan.md)
- [spec.md](./spec.md)
- [research.md](./research.md)
- [data-model.md](./data-model.md)
- [contracts/precipitation-color-scale.md](./contracts/precipitation-color-scale.md)
- [contracts/legend-ui.md](./contracts/legend-ui.md)
- [quickstart.md](./quickstart.md)

**Tests** : inclus. Les contrats C1, C3 et C4 définissent des « garanties testées », et la CI exécute `npm run test`. Les tests sont en Vitest, environnement `node`, dans `src/lib/tests/**` (voir `.claude/rules/tests.md`).

**Organisation** : une phase par user story (spec.md). US1 livre l'alignement avec les couleurs Infoclimat **telles quelles**. US2 substitue ensuite la palette dérivée : c'est un incrément indépendant et démontrable.

**Conventions du projet** (`CLAUDE.md`)

- Runes Svelte 5.
- Édition des `.svelte` déléguée à l'agent `svelte-file-editor`, avec validation par `svelte-autofixer`.
- Imports triés par `npm run format`, ne pas les ordonner à la main.
- Alias `$lib/*`.
- **Ne pas modifier** `node_modules/@openmeteo/weather-map-layer` (fork) : tout passe par `omProtocolSettings`.

## Format : `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichiers différents, pas de dépendance sur une tâche inachevée).
- **[Story]** : US1 à US5, voir spec.md.

---

## Phase 1 : Setup

**Purpose** : isoler le travail et lever l'hypothèse bloquante V2 (research R5).

- [x] T001 Créer la branche git `001-lisibilite-cumuls-pluie` depuis `main` (`git switch -c 001-lisibilite-cumuls-pluie`). Vérifier que `npm install && npm run check && npx vitest run && npm run build` passe **avant** tout changement, et noter l'état de référence.
- [x] T002 Vérification V2 (quickstart Q0) : une valeur `precipitation` d'un fichier spatial à pas de 3 h est-elle un cumul sur 3 h ?
  1. Récupérer `https://openmeteo.s3.amazonaws.com/data_spatial/dwd_icon/latest.json`, et y choisir une échéance du segment 3-horaire.
  2. Lire la valeur en un point pluvieux : popup de `npm run dev`, domaine ICON, variable `precipitation`.
  3. La comparer à la somme des 3 valeurs horaires précédentes de l'API Open-Meteo : `https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&hourly=precipitation&models=icon_global`, même run si possible.
  4. Consigner le résultat (valeurs, date, point) dans une nouvelle section « V2 — résultat » en fin de `specs/001-lisibilite-cumuls-pluie/research.md`.
  5. Si ce n'est **pas** un cumul sur 3 h, écrire explicitement « Repli R5 : palier 1h pour les variables par pas ». Les tâches T005 et T013 appliquent alors ce repli.

---

## Phase 2 : Foundational (prérequis bloquants)

**Purpose** : module pur C1, qui sert à US1, US2, US3 et US4. Aucune dépendance à MapLibre ni aux stores.

**⚠️ CRITICAL** : aucune user story ne commence avant la fin de cette phase.

- [x] T003 Créer `src/lib/color-scales/precipitation-infoclimat.ts`, selon le contrat C1 et data-model E2, E3, E5 et E6 :
  - **Type et listes de variables**
    - `type PrecipitationTier = '1h' | '3h' | '6h' | '12h' | '24h' | '48h' | '72h'` ;
    - `PRECIPITATION_STEP_VARIABLES = ['precipitation', 'rain', 'showers']` et `PRECIPITATION_RUN_SUM_VARIABLES = ['precipitation_sum']` ;
    - `isInfoclimatPrecipitationVariable(variable)`.
  - **Couleurs**
    - `INFOCLIMAT_PRECIPITATION_COLORS` : les 17 couleurs `infoclimat` de `specs/001-lisibilite-cumuls-pluie/research/palette-candidate.json`, rangs 1 à 17.
    - `PRECIPITATION_COLORS` : exporté mais **pour l'instant égal à `INFOCLIMAT_PRECIPITATION_COLORS`**. US2 le remplacera.
  - **`PRECIPITATION_TIER_BOUNDS`** : les 7 jeux `bounds_mm` du même JSON, copiés à l'identique (« 17 bornes, suite strictement croissante »), avec en commentaire la source `site-infoclimat cartes/palettes/radar{1h…72h}.cpt`, relevé du 2026-09-28.
  - **`tierForDuration(hours)`** : « plus petit palier dont la durée est ≥ durationHours ; ≤ 1 → '1h' ; > 72 → '72h' ».
  - **`accumulationHours({ variable, validTime, modelRun, validTimes })`**, selon E5 :
    - pour les variables par pas, écart en heures entre `validTime` et l'élément précédent de `validTimes`, ou avec le suivant si c'est le 1er élément ; `null` si `validTime` est absent de `validTimes` ou si `validTimes` est `undefined` ;
    - pour `precipitation_sum`, `(validTime − modelRun)` en heures ; `null` si `modelRun` est `undefined` ;
    - `null` pour toute autre variable ;
    - si T002 a conclu au repli, les variables par pas renvoient toujours `1`.
  - **`precipitationScaleForTier(tier)`**, selon E4 : `{ type: 'breakpoint', unit: 'mm', breakpoints: [0, ...bounds], colors: [[r1,g1,b1,0], ...PRECIPITATION_COLORS.map(c => [...c, 1])] }`, soit 18 entrées, dont l'entrée 0 transparente.
  - **`defaultTierFor(variable)`**, selon E8 : '1h' pour les variables par pas, '24h' pour `precipitation_sum`, `null` sinon.
  - En-tête de commentaire en français, dans le style de `src/lib/color-scales/snowfall-sum.ts` : rappeler que le moteur applique `colors[0]` sous la première borne (research R3), d'où l'entrée 0 transparente.
- [x] T004 [P] Créer `src/lib/tests/precipitation-infoclimat.test.ts`, qui couvre les garanties C1 :
  - pour chaque palier, `precipitationScaleForTier(t).breakpoints.length === 18`, strictement croissants, et `breakpoints[0] === 0` ;
  - `colors[0][3] === 0` et `colors[1..17][3] === 1` ;
  - avec `getColor` importé de `@openmeteo/weather-map-layer` :
    - v = 0 et v = bounds[0] − 0,01 → alpha 0 ;
    - v = bounds[k] → couleur k+1 ;
    - v = bounds[16] × 10 → couleur 17 ;
  - `tierForDuration` sur la table d'exemples E6 : 0 → 1h, 0,25 → 1h, 1 → 1h, 2 → 3h, 3 → 3h, 18 → 24h, 24 → 24h, 30 → 48h, 72 → 72h, 96 → 72h ;
  - `accumulationHours` : pas de 1 h, de 3 h et de 15 min (valid_times fictifs), 1re échéance, `precipitation_sum` à H0, H18 et H96, `temperature_2m` → null, `validTimes` undefined → null ;
  - `defaultTierFor`.

  Lancer : `npx vitest run src/lib/tests/precipitation-infoclimat.test.ts`.

**Checkpoint** : le module pur est vert. Les user stories peuvent démarrer.

---

## Phase 3 : User Story 1 — retrouver les couleurs d'Infoclimat (Priority : P1) 🎯 MVP

**Goal** : `precipitation`, `rain`, `showers` et `precipitation_sum` sont rendues avec les bornes Infoclimat du palier courant (Q1 = A : palier selon l'échéance pour le cumul du run, selon le pas pour les autres), en couleurs Infoclimat, avec une classe 0 transparente.

**Independent Test** : quickstart Q2 (bornes identiques à `radar1h.cpt`), Q3 (paliers du cumul du run, H0 transparent) et Q4 (pas de 3 h / 15 min). Tests d'URL verts.

### Tests pour User Story 1

- [x] T005 [P] [US1] Étendre `src/lib/tests/url-builder.test.ts` (contrat C3), sur le modèle des tests existants (stores `mJ`, `mR`, `time`, `d`, `v`) :
  - `getOMUrlFor('precipitation')` avec un `metaJson` fictif à pas de 1 h → contient `&precip_tier=1h` ;
  - à pas de 3 h → `3h`, ou `1h` si repli T002 ;
  - `getOMUrlFor('precipitation_sum')` avec `modelRun` à 00:00 et `time` à 18:00 → `precip_tier=24h` ;
  - `getOMUrlFor('temperature_2m')` → pas de `precip_tier` ;
  - `getOMUrlFor('precipitation', new Date(voisin))` produit le même `precip_tier` que `getOMUrlFor` avec `time` réglé sur ce voisin (déterminisme `timeOverride`) ;
  - si `customColorScales` contient `precipitation` → pas de `precip_tier` ;
  - le paramètre est placé avant le suffixe de `colorHashSuffix()`.
- [x] T006 [P] [US1] Ajouter dans `src/lib/tests/precipitation-infoclimat.test.ts` un test du resolver. Il importe `omProtocolSettings` de `$lib/stores/om-protocol-settings` et appelle `get(omProtocolSettings).resolveRequest(...)` sur des `urlComponents` construits à la main :
  - `baseUrl` d'un domaine upstream, `params` avec `variable=precipitation&precip_tier=24h` ;
  - on vérifie que `renderOptions.colorScale.breakpoints` égale `[0, ...PRECIPITATION_TIER_BOUNDS['24h']]` ;
  - sans `precip_tier`, ou avec une valeur invalide, l'échelle reste celle de `colorScales.precipitation`.

  Si l'accès à `resolveRequest` depuis le store n'est pas typé, exporter `customResolveRequest` de `om-protocol-settings.ts` pour les tests.

### Implementation pour User Story 1

- [x] T007 [US1] Dans `src/lib/url.ts`, `getOMUrlFor(variable, timeOverride?)` : juste après `result += \`?variable=${variable}\`` (et avant `interpolation`, `dark` et les hashes), si `isInfoclimatPrecipitationVariable(variable)` **et** `!get(customColorScales)[variable]`, ajouter `&precip_tier=${tier}` :
  - `tier = tierForDuration(accumulationHours({ variable, validTime: timeOverride ?? get(time), modelRun: get(modelRun), validTimes: get(metaJson)?.valid_times }) ?? NaN)` ;
  - si la durée est `null`, `tier = defaultTierFor(variable)`.

  Réutiliser les imports de stores déjà présents dans `url.ts`, et importer `customColorScales` depuis `$lib/stores/om-protocol-settings`. Ne pas écrire `precip_tier` dans l'URL publique de la page (store `url`).

- [x] T008 [US1] Dans `src/lib/stores/om-protocol-settings.ts`, `customResolveRequest` : pour une URL non-anomalie, lire `urlComponents.params.get('precip_tier')` et `params.get('variable')`. Si la variable est concernée, si le palier est valide et si `!get(customColorScales)[variable]`, appeler `defaultResolveRequest(urlComponents, { ...settings, colorScales: { ...settings.colorScales, [variable]: precipitationScaleForTier(tier) } })`. Sinon, garder le comportement actuel. La branche anomalie n'est pas modifiée. Ajouter un commentaire en français qui renvoie à `specs/001-lisibilite-cumuls-pluie/research.md` R6.
- [x] T009 [US1] Dans `src/lib/stores/om-protocol-settings.ts`, `standardColorScales`, selon E8 :
  - `precipitation`, `rain` et `showers` → `precipitationScaleForTier('1h')` ;
  - `precipitation_sum` → `precipitationScaleForTier('24h')` ;
  - supprimer l'import de `precipitationSumScale` et mettre à jour le commentaire du bloc.

  **Ne pas toucher** à `graupel_sum`, `snow_graupel_sum`, `snowfall_water_equivalent_sum` ni à la clé `snowfall_water_equivalent` héritée du package (Q2 = B).

- [x] T010 [US1] Supprimer `src/lib/color-scales/precipitation-sum.ts`. Vérifier par `grep -rn "precipitation-sum\|precipitationSumScale" src` qu'il ne reste aucune référence.
- [x] T011 [US1] Lancer `npx vitest run src/lib/tests/url-builder.test.ts src/lib/tests/precipitation-infoclimat.test.ts`, puis `npm run check`, et corriger jusqu'au vert. Valider ensuite à la main quickstart Q2, Q3 et Q4 avec `npm run dev` :
  - bornes 1 h, paliers au fil de l'échéance ;
  - H0 transparent ;
  - ECMWF en 3 h ;
  - AROME HD 15 min en 1 h.

  La légende n'affiche pas encore le palier (c'est l'objet d'US3) : vérifier les couleurs au survol (popup) et à l'œil.

**Checkpoint** : US1 fonctionnelle. La carte utilise les bornes et couleurs Infoclimat.

---

## Phase 4 : User Story 2 — distinguer faibles et forts cumuls (Priority : P1)

**Goal** : remplacer les couleurs Infoclimat par la palette dérivée validée (research R2, rang 2 pervenche), qui satisfait SC-002 reformulé.

**Independent Test** : les tests d'invariants passent. Le nuancier et la carte d'un épisode intense montrent les faibles classes claires et des classes voisines distinctes (quickstart Q5).

### Tests pour User Story 2

- [x] T012 [P] [US2] Dans `src/lib/tests/precipitation-infoclimat.test.ts`, ajouter les invariants E1, **recalculés** à partir de `PRECIPITATION_COLORS` et non codés en dur :
  - implémenter dans le fichier de test sRGB → CIELAB (D65) et ΔE00 (CIEDE2000), en portant la logique de `specs/001-lisibilite-cumuls-pluie/references/delta-e.py`. Vérifier le portage sur la paire de référence 45/65 mm d'Infoclimat : ΔE00 ≈ 5,2 ± 0,1 ;
  - `ΔE00(k, k+1) ≥ 10` et `ΔE00(k, k+2) ≥ 10` pour tout k ;
  - `L* ≥ 70` pour les rangs 1 à 4 ;
  - `L*` non croissant du rang 10 au rang 17 ;
  - égalité stricte avec `INFOCLIMAT_PRECIPITATION_COLORS` pour les rangs 1, 4, 5, 10 et 12 à 17.

  Ces tests doivent **échouer** tant que T013 n'est pas fait.

### Implementation pour User Story 2

- [x] T013 [US2] Dans `src/lib/color-scales/precipitation-infoclimat.ts`, remplacer `PRECIPITATION_COLORS` par les 17 couleurs `maps` de `specs/001-lisibilite-cumuls-pluie/research/palette-candidate.json` : rang 2 = `[150,172,255]`, rang 3 = `[96,176,255]`, rang 6 = `[96,231,0]`, rang 7 = `[186,255,31]`, rang 8 = `[200,220,126]`, rang 9 = `[255,245,163]`, rang 11 = `[255,220,93]`, les autres identiques. Ajouter en commentaire, rang par rang, l'écart par rapport à Infoclimat (couleur Infoclimat, ΔE00, raison), comme l'exige FR-005, et renvoyer à research R1/R2 et au générateur `research/palette_search.py`.
- [x] T014 [US2] Lancer `npx vitest run src/lib/tests/precipitation-infoclimat.test.ts` (tout vert). Puis contrôle visuel quickstart Q5 : `specs/001-lisibilite-cumuls-pluie/research/palette-candidate.html`, puis une carte d'épisode pluvieux en thème clair et sombre. Consigner dans `research.md` (section « V1 — contrôle sur carte ») si le rang 2 est perçu comme bleu, et si la classe la plus claire reste visible en thème sombre (A5).

**Checkpoint** : US1 + US2. Les couleurs dérivées sont en place et les invariants de lisibilité sont verrouillés par test.

---

## Phase 5 : User Story 3 — une légende qui parle le même langage (Priority : P1)

**Goal** : la légende (écran et export PNG), le popup et la bande de contexte montrent l'échelle du **palier courant**, avec l'en-tête « Cumul N h » et des libellés « ≥ borne » corrects (1,5 et non 2).

**Independent Test** : contrat `contracts/legend-ui.md`, quickstart Q2 (étape légende), Q3 (l'en-tête change pendant la lecture) et Q7.4 (export PNG).

### Tests pour User Story 3

- [x] T015 [P] [US3] Créer `src/lib/tests/resolve-color-scale.test.ts` pour `resolveAppColorScale`, règles C2 :
  1. une palette personnalisée est renvoyée telle quelle ;
  2. une variable concernée avec un palier '6h' donne `precipitationScaleForTier('6h')` ; avec un palier `null`, `defaultTierFor` s'applique ;
  3. `temperature_2m` renvoie un résultat identique à `getColorScale('temperature_2m', dark, colorScales)`.

### Implementation pour User Story 3

- [x] T016 [P] [US3] Créer `src/lib/color-scales/resolve.ts` avec `resolveAppColorScale(variable, dark, colorScales, tier, customScales?)`, selon le contrat C2 (règles 1 → 2 → 3).
- [x] T017 [P] [US3] Créer `src/lib/stores/precipitation-tier.ts` : `export const precipitationTier = derived([variable, time, modelRun, metaJson], …)`, qui renvoie `PrecipitationTier | null` via `accumulationHours` puis `tierForDuration`, et `null` si la variable n'est pas concernée (E7). Documenter le store dans l'en-tête, en français.
- [x] T018 [US3] Dans `src/lib/components/scale/scale.svelte` (via l'agent `svelte-file-editor`, puis `svelte-autofixer`), selon `contracts/legend-ui.md` :
  - `baseColorScale` passe par `resolveAppColorScale($variable, isDark, $omProtocolSettings.colorScales, $precipitationTier, $customColorScales)` ;
  - `resetColorScale` utilise `resolveAppColorScale($variable, isDark, standardColorScales, null)`, au lieu de `getColorScale(..., standardColorScales)` ;
  - pour les variables concernées :
    - masquer l'entrée d'index 0 (transparente) dans `getLabeledColorsForLegend`, en conservant les `index` d'origine pour l'édition de couleur ;
    - libellés « ≥ X » avec `formatValue` corrigé : 1 décimale si la borne convertie n'est pas entière, virgule française. Aujourd'hui, `toFixed(0)` affiche 1,5 comme « 2 » ;
    - en-tête « Cumul {N} h », sauf si une palette personnalisée existe ;
    - nom accessible « ≥ X mm » par case.
  - Vérifier l'affichage des 17 classes à 390 px de large (quickstart Q2) ; aucun libellé tronqué.
- [x] T019 [P] [US3] Dans `src/lib/watermark-details.ts`, `buildWatermarkLegend()` : utiliser `resolveAppColorScale(variable, dark, colorScales, get(precipitationTier), get(customColorScales))`. Dans `getLegendEntries`, appliquer aux variables concernées les mêmes règles que T018 : entrée 0 masquée, 1 décimale pour les bornes non entières.
- [x] T020 [P] [US3] Dans `src/lib/popup.ts` (ligne ≈ 181), remplacer `getColorScale(get(v), isDark, …)` par `resolveAppColorScale(get(v), isDark, omProtocolSettingsState.colorScales, get(precipitationTier), get(customColorScales))`, pour que la couleur de fond du popup corresponde à la carte.
- [x] T021 [P] [US3] Dans `src/lib/components/chrome/context-strip.svelte` (via `svelte-file-editor`), faire passer `baseColorScale` par `resolveAppColorScale(…, $precipitationTier, $customColorScales)`, comme dans T018.
- [x] T022 [US3] Lancer `npx vitest run src/lib/tests/resolve-color-scale.test.ts` et `npm run check`. Validation manuelle quickstart Q2 (légende), Q3 (l'en-tête 1 h → 48 h change pendant la lecture, dans la même frame que la carte) et Q7.2 à Q7.4 (personnalisation, réinitialisation, export PNG).

**Checkpoint** : US1 à US3 livrées : carte, légende, popup et export cohérents.

---

## Phase 6 : User Story 4 — vignettes de valeurs utiles et lisibles (Priority : P2)

**Goal** : pour les variables concernées, les vignettes « Valeurs » affichent la valeur au dixième sous 10 mm et en entier au-delà, sans vignette sous 0,05 mm et sans chevauchement (data-model E9, contrat C4). Les autres variables sont inchangées.

**Independent Test** : tests C4 verts et quickstart Q6.

### Tests pour User Story 4

- [x] T023 [P] [US4] Dans `src/lib/tests/vector-styles.test.ts`, ajouter des tests pour `buildGridValueLabelExprFor` et `buildGridValueVisibilityFilter` :
  - étendre l'évaluateur minimal `evalExpr` du fichier aux opérateurs réellement émis (`case`, `<`, `>=`, `number-format` ou concaténation) ;
  - pour la visibilité, évaluer via `featureFilter` de `@maplibre/maplibre-gl-style-spec`, comme les tests de décimation existants.

  Résultats attendus pour `precipitation` en mm :

  | Valeur | Rendu   |
  | ------ | ------- |
  | 0,04   | masqué  |
  | 0,05   | « 0,1 » |
  | 0,4    | « 0,4 » |
  | 9,94   | « 9,9 » |
  | 9,96   | « 10 »  |
  | 152,4  | « 152 » |

  Pour `temperature_2m`, la sortie est identique à `buildGridValueLabelExpr`, et le filtre de visibilité vaut `null`.

  Ajouter aussi le test d'invariant d'espacement (research R8) : `minSpacingPx = GRID_VALUE_TARGET_PX / 1.5` doit être ≥ `4 × 6.3 + 2 × 1.5` px, largeur estimée de « 1520 » en Noto Sans 11 px. Commenter l'estimation.

- [x] T024 [P] [US4] Test du format en pouces (data-model E9 : « 2 décimales sous 1 in, 1 décimale au-delà »), dans `src/lib/tests/vector-styles.test.ts`, avec `units.precipitation = 'inch'`. Le seuil de masquage s'applique à la valeur convertie : on masque ce qui s'afficherait « 0,00 ».

### Implementation pour User Story 4

- [x] T025 [US4] Dans `src/lib/vector-styles.ts`, ajouter `buildGridValueLabelExprFor(variable, baseUnit, units)` et `buildGridValueVisibilityFilter(variable, baseUnit, units)`, selon le contrat C4 :
  - réutiliser la transformation affine (offset + facteur) de `buildGridValueLabelExpr` ;
  - branche précipitations en mm : `['case', ['<', scaled, 9.95], <1 décimale, virgule>, ['to-string', ['round', scaled]]]` ;
  - pour la décimale, `['number-format', scaled, { locale: 'fr', 'min-fraction-digits': 1, 'max-fraction-digits': 1 }]` (le piège `max-fraction-digits: 0` ne s'applique pas à 1), ou un équivalent testé ;
  - branche pouces : 2 décimales sous 1 in ;
  - filtre de visibilité : `['>=', ['get', 'value'], seuilBrut]`, avec le seuil exprimé dans l'unité brute (0,05 mm, ou l'équivalent du seuil « 0,00 in » converti) ;
  - variables hors périmètre : `buildGridValueLabelExprFor` délègue à `buildGridValueLabelExpr`, et le filtre renvoie `null`.
- [x] T026 [US4] Dans `src/lib/layers.ts`, `vectorGridValuesLayer` (≈ l.283-330) :
  - `text-field` utilise `buildGridValueLabelExprFor(...)` ;
  - `filter` devient `['all', buildGridDecimationFilter(...), visibilityFilter]` quand `buildGridValueVisibilityFilter` n'est pas `null`, et reste inchangé sinon.

  Ne rien changer d'autre (grille figée, `text-allow-overlap`, taille 11, halo).

- [x] T027 [US4] Lancer `npx vitest run src/lib/tests/vector-styles.test.ts`, puis valider à la main quickstart Q6 aux zooms 5, 7, 9 et 11, en thème clair et sombre : pas de « 0 », pas de chevauchement, texte et halo lisibles sur les 17 couleurs (SC-004). Si une classe sombre (15 à 17) pose problème en thème clair, le consigner dans `research.md` R8 et ouvrir une tâche de suivi, sans modifier le halo des autres variables.

**Checkpoint** : US4 livrée.

---

## Phase 7 : User Story 5 — les autres couches ne bougent pas (Priority : P3)

**Goal** : verrouiller la non-régression de toutes les variables hors périmètre (FR-015, SC-008).

**Independent Test** : tests de non-régression verts et quickstart Q7.1.

- [x] T028 [P] [US5] Dans `src/lib/tests/upstream-color-scales.test.ts`, ajouter un test qui vérifie que les variables hors périmètre gardent l'échelle d'avant la feature, à comparer avec `defaultOmProtocolSettings.colorScales` ou les échelles maison existantes : `temperature_2m`, `wind_speed_10m`, `pressure_msl`, `cloud_cover`, `snowfall_sum`, `snowfall_water_equivalent`, `graupel_sum`, `snow_graupel_sum`, `snowfall_water_equivalent_sum`, `precipitation_probability`, `precipitation_type`, `radar_reflectivity`. Contrôle : `resolveAppColorScale(v, dark, standardColorScales, null)` égale `getColorScale(v, dark, standardColorScales)`.
- [x] T029 [P] [US5] Dans `src/lib/tests/arome-france-color-scales.test.ts`, vérifier que `graupel_sum`, `snow_graupel_sum` et `snowfall_water_equivalent_sum` résolvent toujours vers `defaultOmProtocolSettings.colorScales.precipitation` (l'ancienne échelle Open-Meteo), et non vers l'échelle Infoclimat.
- [x] T030 [US5] Validation manuelle quickstart Q7.1 et Q7.5 : captures avant/après de température à 2 m, vent, pression et nébulosité sur 3 runs fixés, identiques ; la couche secondaire (layer 2) sur `precipitation` suit les paliers.

**Checkpoint** : toutes les user stories sont livrées et la non-régression est verrouillée.

---

## Phase 8 : Polish et points transverses

- [x] T031 [P] Mettre à jour `.claude/rules/architecture.md`, section « Calque valeurs aux points de grille » :
  - corriger la description obsolète : c'est une décimation **2D** sur l'`id` global stable émis par le fork, avec `text-allow-overlap: true`, sans collision ; repli 1D pour les grilles gaussiennes. Voir `layers.ts:283-330` et `vector-styles.ts:202-300`, et research R8 ;
  - ajouter le format et le masquage propres aux précipitations ;
  - ajouter un paragraphe « Échelles de précipitations Infoclimat » : `precip_tier` dans `getOMUrlFor`, lecture dans `customResolveRequest`, `resolveAppColorScale`, store `precipitationTier`, classe 0 transparente (R3), et limite connue des grilles gaussiennes.
- [x] T032 [P] Mettre à jour `.claude/rules/stores.md` (store dérivé `precipitationTier` et ses entrées) et `.claude/rules/components.md` (légende à paliers dans `scale.svelte`, en-tête « Cumul N h », entrée 0 masquée). Vérifier les `paths:` des règles.
- [x] T033 [P] Si le `README.md` a une section `## Architecture` qui décrit les échelles de couleur, y ajouter une ligne sur l'alignement Infoclimat et `precip_tier`.
- [x] T034 Lancer `npm run format`, puis `npm run lint`, `npm run check`, `npx vitest run` et `npm run build` : tout vert, comme en CI.
- [ ] T035 Dérouler l'intégralité de `specs/001-lisibilite-cumuls-pluie/quickstart.md` (Q0 à Q7), et cocher dans `specs/001-lisibilite-cumuls-pluie/checklists/requirements.md` une note « validation quickstart » avec la date.
- [x] T036 Préparer le test utilisateur SC-003 / SC-009 : une page de consignes courte dans `specs/001-lisibilite-cumuls-pluie/user-test.md` (10 points par testeur, panel d'au moins 5 personnes, comparaison côte à côte avec Infoclimat, questions à l'auteur du retour). Le test lui-même se déroule hors dépôt.
- [ ] T037 Commit et PR avec un titre sémantique (`feat(color-scales): palette précipitations dérivée d'Infoclimat, paliers de cumul et vignettes au dixième`). Dans la description, lister les écarts de couleur par rang, le résultat V2 et la limite des grilles gaussiennes.

---

## Phase 9 : Révision 3, échelle unique 0,2 → 600 mm (2026-09-28)

**Purpose** : appliquer le changement de cap (voir l'encart en tête de `spec.md`).

- [x] T038 Retirer le système de paliers : restaurer depuis `main` `src/lib/url.ts`, `src/lib/popup.ts`, `src/lib/watermark-details.ts`, `src/lib/components/scale/scale.svelte`, `src/lib/components/chrome/context-strip.svelte`, `src/lib/stores/om-protocol-settings.ts`, `src/lib/tests/url-builder.test.ts` ; supprimer `src/lib/color-scales/precipitation-infoclimat.ts`, `src/lib/color-scales/resolve.ts`, `src/lib/stores/precipitation-tier.ts` et leurs tests.
- [x] T039 Créer `src/lib/color-scales/precipitation.ts` : une échelle unique `precipitationScale` (classe 0 transparente, puis 0,2 · 0,5 · 1 · 2 · 5 · 10 · 20 · 30 · 50 · 75 · 100 · 150 · 200 · 250 · 300 · 400 · 500 · 600 mm, variante B), ainsi que `isPrecipitationVariable` ; la brancher sur `precipitation`, `rain`, `showers` et `precipitation_sum` dans `standardColorScales` (`src/lib/stores/om-protocol-settings.ts`).
- [x] T040 [P] Tests : `src/lib/tests/precipitation-scale.test.ts` (bornes, transparence sous 0,2, couleurs distinctes, saturation au-delà de 600) ; mise à jour de `src/lib/tests/upstream-color-scales.test.ts` (non-régression) et de `src/lib/tests/vector-styles.test.ts` (renommage `isPrecipitationVariable`).
- [x] T041 [P] Docs : `.claude/rules/architecture.md` (section « Échelle de précipitations 0,2 → 600 mm »), retrait du store et de la légende à paliers de `.claude/rules/stores.md` et `.claude/rules/components.md`, `README.md`.
- [x] T042 Contrôle visuel sur `npm run dev` (ICON 3 h, vignettes activées) et CI complète (`check`, `vitest`, `build`, `eslint`).

## Phase 10 : Révision 4, palette ECMWF 0,1 → 500 mm (2026-09-29)

- [x] T043 Remplacer les paliers de `precipitationSumScale` (`src/lib/color-scales/precipitation.ts`) par ceux de la légende ECMWF (0,1 · 1 · 2 · 3 · 5 · 7 · 10 · 15 · 20 · 25 · 30 · 40 · 50 · 60 · 70 · 80 · 90 · 100 · 125 · 150 · 175 · 200 · 250 · 300 · 400 · 500 mm), mettre à jour `src/lib/tests/precipitation-scale.test.ts`, `.claude/rules/architecture.md` et `README.md`.
- [ ] T044 Contrôle visuel sur `npm run dev` (fond clair et fond sombre, légende sur mobile).

## Dependencies & Execution Order

### Phase Dependencies

- **Setup** (T001-T002) : aucune dépendance. T002 conditionne la règle « par pas » dans T003 et T005.
- **Foundational** (T003-T004) : dépend du Setup, et **bloque** toutes les user stories.
- **US1** (T005-T011) : dépend de Foundational.
- **US2** (T012-T014) : dépend de Foundational. Indépendante d'US1 côté code : elle ne touche qu'aux couleurs du module pur. Pour être _visible_ sur la carte, elle a besoin d'US1.
- **US3** (T015-T022) : dépend de Foundational. Pour une cohérence carte/légende de bout en bout, elle a besoin d'US1 (T007, T008).
- **US4** (T023-T027) : dépend de Foundational seulement (`isInfoclimatPrecipitationVariable`). Parallélisable avec US1 à US3.
- **US5** (T028-T030) : T028 dépend de T016 (`resolveAppColorScale`) ; T029 et T030 dépendent d'US1.
- **Polish** (T031-T037) : après les stories visées.

### Dépendances internes notables

- T007 et T008 : T008 peut être écrit avant T007, mais le test T005 attend T007, et le test T006 attend T008.
- T009 avant T010 (retrait de l'import, puis suppression du fichier).
- T016 et T017 avant T018 à T021.
- T025 avant T026.

### Parallel Opportunities

- T004 en parallèle de la fin de T003 (tests écrits d'après le contrat).
- US1 : T005 ∥ T006 ; T007 et T008 touchent des fichiers différents.
- US3 : T015 ∥ T016 ∥ T017 ; puis T019 ∥ T020 ∥ T021 (fichiers distincts ; T018 est séquentiel, car `.svelte` passe par l'agent).
- US4 (T023 à T026) entièrement en parallèle des phases US1 à US3, par un autre développeur ou agent.
- Polish : T031 ∥ T032 ∥ T033.

### Exemple d'exécution parallèle (US3)

```text
En parallèle : T015 (test resolve) · T016 (resolve.ts) · T017 (store precipitation-tier)
Puis :         T018 (scale.svelte, agent svelte-file-editor)
En parallèle : T019 (watermark-details.ts) · T020 (popup.ts) · T021 (context-strip.svelte)
Puis :         T022 (vérification)
```

### Exemple d'exécution parallèle (US4, en parallèle d'US1)

```text
Agent A : T005 → T011 (US1)
Agent B : T023, T024 → T025 → T026 → T027 (US4)
```

---

## Implementation Strategy

### MVP : User Story 1 seule

1. Phase 1 (T001, T002 : **ne pas sauter V2**).
2. Phase 2 (T003, T004).
3. Phase 3 (T005 à T011).
4. **Stop et validation** : la carte suit les bornes Infoclimat par palier, H0 est transparent. C'est démontrable à l'auteur du retour (cohérence avec Infoclimat).

### Livraison incrémentale

1. MVP (US1) : couleurs et bornes Infoclimat.
2. US2 : palette dérivée lisible (invariants verrouillés).
3. US3 : légende, popup et export alignés sur le palier (**à livrer avec US1 ou juste après** : sans l'en-tête de palier, un changement d'échelle pendant l'animation n'est pas explicité).
4. US4 : vignettes.
5. US5 et Polish : non-régression, docs, PR.

Conseil : regrouper US1 à US3 dans une même PR (le parcours utilisateur n'est cohérent qu'avec la légende), et US4 dans une PR distincte si l'on veut réduire la taille des revues.
