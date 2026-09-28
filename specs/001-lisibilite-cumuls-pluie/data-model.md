# Data model (Phase 1) : couleurs de précipitations Infoclimat

**Plan** : [plan.md](./plan.md)
**Research** : [research.md](./research.md)

Aucun stockage nouveau. Les entités ci-dessous sont des structures en mémoire, statiques ou dérivées. Le seul état persisté touché est `customColorScales`, existant et inchangé dans sa forme.

## E1. `PrecipitationPalette` (statique)

| Champ              | Type           | Règle                                                                                              |
| ------------------ | -------------- | -------------------------------------------------------------------------------------------------- |
| `colors`           | 17 × `[r,g,b]` | Valeurs de `research/palette-candidate.json` → `maps`. Ordre du rang 1 (faible) au rang 17 (fort). |
| `infoclimatColors` | 17 × `[r,g,b]` | Référence `radar*.cpt`, conservée pour les tests de fidélité et la documentation des écarts.       |

**Invariants** (vérifiés par test)

- ΔE00(rang k, rang k+1) ≥ 10 et ΔE00(rang k, rang k+2) ≥ 10.
- L* ≥ 70 pour les rangs 1 à 4.
- L* non croissant du rang 10 au rang 17.
- ΔE00(maps, Infoclimat) documenté pour chaque rang. Les rangs 10 et 12 à 17 sont identiques (égalité stricte).

## E2. `PrecipitationTier` (énumération)

`'1h' | '3h' | '6h' | '12h' | '24h' | '48h' | '72h'`. Chaque palier a une durée en heures.

## E3. `TierBounds` (statique, un jeu par palier)

| Champ    | Type             | Règle                                                                                             |
| -------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `bounds` | 17 × nombre (mm) | Bornes inférieures des classes 1 à 17, reprises des `.cpt` Infoclimat (tableau du diagnostic §2). |

**Invariant** : la suite est strictement croissante.

**Source** : `cartes/palettes/radar{1h,3h,6h,12h,24h,48h,72h}.cpt`, relevé du 2026-09-28.

## E4. Échelle rendue (`BreakpointColorScale` du package), dérivée de E1 + E3

- `type: 'breakpoint'`, `unit: 'mm'`.
- `breakpoints = [0, ...bounds]` (18 entrées).
- `colors = [[r1,g1,b1,0], [r1,g1,b1,1], …, [r17,g17,b17,1]]` : l'entrée 0 est **transparente**, les 17 suivantes sont opaques (R3, R4).
- Pas de variantes clair/sombre : même palette dans les deux thèmes (A5, vérifié au nuancier).

## E5. `PrecipitationVariableKind`

| Variable                           | Type           | Source de la durée                                                                                                        |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `precipitation`, `rain`, `showers` | par pas        | écart entre l'heure valide et l'heure valide précédente de `metaJson.valid_times` (1re échéance : écart avec la suivante) |
| `precipitation_sum`                | cumul du run   | heure valide − `modelRun`                                                                                                 |
| toute autre variable               | hors périmètre | pas de palier ; échelle actuelle inchangée                                                                                |

## E6. Règle de sélection du palier (fonction pure)

`tierFor(durationHours) = plus petit palier dont la durée est ≥ durationHours`

- `durationHours ≤ 1` → `'1h'` : couvre 15 min et H0.
- `durationHours > 72` → `'72h'`.

**Exemples de test**

| Durée | Palier |
| ----- | ------ |
| 0     | 1h     |
| 0,25  | 1h     |
| 1     | 1h     |
| 2     | 3h     |
| 3     | 3h     |
| 18    | 24h    |
| 24    | 24h    |
| 30    | 48h    |
| 72    | 72h    |
| 96    | 72h    |

**Transitions pendant l'animation du cumul du run** : 1h → 3h → 6h → 12h → 24h → 48h → 72h, quand l'échéance franchit 1, 3, 6, 12, 24 et 48 h. La légende change dans la même frame, puisque la source unique est le store dérivé.

## E7. `precipitationTier` (store dérivé)

- **Entrées** : `variable`, `time`, `modelRun`, `metaJson`.
- **Sortie** : `PrecipitationTier | null`. `null` pour les variables hors périmètre, ou si `modelRun`/`metaJson` ne sont pas encore chargés ; on se rabat alors sur le palier par défaut de E8.
- **Consommateurs** : la légende (`scale.svelte`), le popup, `watermark-details`, `context-strip`.
- L'URL, elle, calcule le palier par la même fonction pure pour l'heure demandée (`timeOverride`), sans lire le store `time`.

## E8. Références « couleurs standard »

| Variable                           | Palier de référence (réinitialiser / pas de contexte) |
| ---------------------------------- | ----------------------------------------------------- |
| `precipitation`, `rain`, `showers` | 1h                                                    |
| `precipitation_sum`                | 24h                                                   |

## E9. Format des vignettes de précipitations

| Condition     | Rendu                                  |
| ------------- | -------------------------------------- |
| v < 0,05 mm   | pas de vignette                        |
| 0,05 ≤ v < 10 | 1 décimale, virgule (« 0,4 », « 9,9 ») |
| v ≥ 10        | entier (« 10 », « 152 »)               |

- Conversion en pouces : le seuil et les tranches s'appliquent à la valeur convertie. Le format « pouces » (2 décimales ?) est à trancher en tâche. Par défaut : 2 décimales sous 1 in, 1 décimale au-delà.
- Les autres variables gardent le format actuel (entier).
