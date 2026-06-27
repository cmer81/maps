# Design — Mise à jour des variables AROME France (Infoclimat)

Date : 2026-06-28
Domaine : `arome_france` (pseudo-domaine surface servi depuis le bucket maison R2).

## Contexte

Le pipeline Infoclimat publie désormais ~50 variables dans
`data_spatial/arome_france/latest.json` (au lieu des 12 variables surface
historiques) : niveaux iso-pression (geopotential_height, relative_humidity,
temperature, vent u/v aux niveaux 300/500/700/850/925/1000 hPa + pv1500),
indices (humidex, wind_chill_2m, freezing_level_height), cumuls/extrêmes
(snowfall_sum, temperature_2m_max/min, wind_gusts_10m_max) et champs dérivés
(theta_e_850hPa, theta_w_850hPa, thickness_500_1000hPa,
absolute_vorticity_500hPa).

Le sélecteur de variables (`variable-tabs.svelte`) se construit dynamiquement à
partir de `$metaJson.variables`, donc la plupart des variables remontent sans
édition de liste. Restent les trous suivants à combler.

## Décisions

- theta_e_850hPa produit en **K**, theta_w_850hPa en **°C** (confirmé).
- Style des colormaps : **Infoclimat/Météociel** (rainbow pros français).
- Vorticité absolue : valeurs brutes en s⁻¹ (~1e-4), mises à l'échelle **×1e5**
  dans `postReadCallback` pour une légende lisible en ×10⁻⁵ s⁻¹.
- `freezing_level_height` : déjà correct via le package (unité m, bornes
  -4800..5600). On ne touche qu'au libellé FR.
- Redirection sondage `arome_france → meteofrance_arome_france0025` **conservée** :
  les niveaux publiés (300/500/700/850/925/1000) ne couvrent pas les 24 niveaux
  du sondage. Documenté, pas retiré.

## Périmètre

### A. Niveau 1000 hPa — `src/lib/constants.ts`

Ajouter `1000` à `VISIBLE_PRESSURE_LEVELS_HPA` (filtre d'affichage des niveaux
iso-pression). Sans ça le niveau 1000 publié reste invisible dans le
sous-sélecteur de niveau.

### B. Cinq nouvelles colormaps — `src/lib/color-scales/` + `om-protocol-settings.ts`

Toutes en `BreakpointColorScale`, palettes Météociel-like, bornes
commentées/tunables (modèle : `precipitation-sum.ts`). Enregistrées par clé
exacte dans `standardColorScales` (`om-protocol-settings.ts`).

| Variable                    | Fichier                 | Unité     | Plage / centre           | Palette                                    |
| --------------------------- | ----------------------- | --------- | ------------------------ | ------------------------------------------ |
| `snowfall_sum`              | `snowfall-sum.ts`       | cm        | 1 → 100                  | blanc → bleu → violet/magenta              |
| `theta_e_850hPa`            | `theta-e.ts`            | K         | 288 → 342                | rainbow instabilité                        |
| `theta_w_850hPa`            | `theta-w.ts`            | °C        | −8 → 28                  | rainbow (bornes °C)                        |
| `thickness_500_1000hPa`     | `thickness.ts`          | gpm       | 5100 → 5700, centré 5400 | divergente bleu → rouge                    |
| `absolute_vorticity_500hPa` | `absolute-vorticity.ts` | ×10⁻⁵ s⁻¹ | 0 → 40                   | séquentiel jaune → orange → rouge → violet |

Mise à l'échelle vorticité dans `postReadCallback` (`om-protocol-settings.ts`),
gatée sur `domain === 'arome_france' && variable === 'absolute_vorticity_500hPa'`
→ `values.map(v => v * 1e5)`. Même mécanisme que le `pressure_msl / 100` ECMWF
déjà présent.

### C. Libellés FR — `src/lib/i18n/variables-fr.ts` (table `EXPLICIT`)

| Clé                          | Libellé FR                          |
| ---------------------------- | ----------------------------------- |
| `theta_e_850hPa`             | Theta-E (850 hPa)                   |
| `theta_w_850hPa`             | Theta-W (850 hPa)                   |
| `thickness_500_1000hPa`      | Épaisseur 500-1000 hPa              |
| `absolute_vorticity_500hPa`  | Tourbillon absolu (500 hPa)         |
| `freezing_level_height`      | Altitude de l'isotherme 0 °C        |
| `snowfall_sum`               | Cumul de neige                      |
| `temperature_2m_max`         | Température max. (2 m)              |
| `temperature_2m_min`         | Température min. (2 m)              |
| `geopotential_height_pv1500` | Géopotentiel (tropopause dynamique) |

### D. Documentation

- `.claude/rules/architecture.md` : corriger « arome_france = 12 variables
  surface, pas de fallback » → ~50 variables (surface + niveaux iso-pression +
  indices). Documenter la conservation de la redirection sondage.
- Commentaire `constants.ts` (l.177) aligné.

### E. Vérification

- Tests Vitest : forme valide + monotonie des breakpoints des 5 échelles
  (`colors.length === breakpoints.length`, breakpoints strictement croissants).
- `npm run check` (typecheck) + `npm run test`.
- Idéalement vérif headless que les nouvelles variables apparaissent dans le
  sélecteur (optionnel selon le temps).

## Hors périmètre

- Refonte de la redirection sondage (les niveaux ne couvrent pas encore le
  sondage complet).
- Rendu catégoriel / autres variables masquées.
- Affichage en ×10⁻⁵ pour d'autres domaines que `arome_france`.
