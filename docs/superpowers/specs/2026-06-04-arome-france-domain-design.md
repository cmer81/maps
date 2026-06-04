# Pseudo-domaine `arome_france` (AROME France surface, bucket maison)

**Date** : 2026-06-04
**Statut** : design validé, prêt pour plan d'implémentation

## Contexte

Un pipeline maison publie désormais le modèle **AROME France surface** dans notre
propre bucket S3 (le même que les autres pseudo-domaines, exposé via
`VITE_MODELS_BUCKET_URL` / `getModelsBucketUrl()`), au lieu de dépendre
d'Open-Meteo. Motivation initiale : le bucket spatial d'Open-Meteo est lent ;
servir depuis notre bucket réduit la latence.

Le bucket utilise le layout path-style standard, identique à Open-Meteo :

```
{BASE}/data_spatial/arome_france/{YYYY}/{MM}/{DD}/{HHMM}Z/{valid_time}.om
```

- run dir = `{HHMM}Z` (ex. `1200Z`) ;
- fichier nommé par le `valid_time` au format `%Y-%m-%dT%H%M` (sans secondes, sans
  `Z`, ex. `2026-06-04T1300.om`) ; un OMfile multi-variables par échéance ;
- métadonnées : `data_spatial/arome_france/latest.json`, `in-progress.json`, et
  `meta.json` par run.

**12 variables publiées** (nommage Open-Meteo) : `temperature_2m`,
`relative_humidity_2m`, `dew_point_2m`, `wind_u_component_10m`,
`wind_v_component_10m`, `wind_gusts_10m`, `pressure_msl`, `cloud_cover_low`,
`cloud_cover_mid`, `cloud_cover_high`, `precipitation`, `precipitation_sum`.

**Grille** : `AromeFranceGrid` — 1121×717 à 0.025° (latMin 37.5, lonMin −12),
identique à l'OM `meteofrance_arome_france0025` et à `arome_france_convection`.
Horizon 51 h horaire, runs 8/j (00, 03, …, 21 UTC).

## Décision d'architecture

`arome_france` est un **nouveau pseudo-domaine dédié**, servi à 100 % depuis le
bucket maison, **sans fallback Open-Meteo** et **sans interférence** avec les
domaines AROME d'Open-Meteo (`meteofrance_arome_france0025`, `…_hd`, `…_15min`).

C'est un quasi-clone du pattern existant `arome_france_convection`
(voir `2026-06-01-arome-france-convection-design.md`). Le bare `arome_france`
n'existe pas dans `@openmeteo/weather-map-layer` (seuls les `meteofrance_arome_*`),
donc aucun risque de collision de valeur de domaine côté package.

### Points de vérification résolus (aucun changement requis)

- **Format du fichier temps** — `url.ts → getOMUrlFor()` et `getNextOmUrls()`
  construisent déjà le `.om` avec `fmtSelectedTime()` = `YYYY-MM-DDTHHMM` (sans
  `Z`, sans secondes), pour tous les domaines. Correspond exactement à notre
  `{valid_time}.om`.
- **Vent (u/v)** — l'app attend déjà des composantes u/v. La règle de dérivation
  du package (`/_[uv]_(component|current)/`) lit `wind_u_component_10m` **et**
  `wind_v_component_10m` du même fichier et calcule vitesse+direction. Le
  sélecteur (`variable-tabs.svelte:324`) masque déjà `*_v_component` et
  `*_direction` : `wind_u_component_10m` s'affiche et se rend comme vitesse du
  vent (+ flèches), `wind_v_component_10m` reste masqué, `wind_gusts_10m`
  s'affiche normalement. **Aucune dérivation côté client ni changement de
  pipeline nécessaire.**
- **Resolver** — `defaultResolveRequest` extrait le domaine via
  `data_spatial/(?<domain>[^/]+)` puis le cherche dans `domainOptions`. Le segment
  `data_spatial/arome_france/` est donc résolu correctement dès lors qu'`arome_france`
  est enregistré avec sa grille. Pas de resolver custom.
- **12 variables / colormaps** — toutes standard Open-Meteo → colormaps par défaut
  du package (température surchargée infoclimat, précip, nuages, pression,
  humidité, point de rosée, vitesse de vent, rafales). `precipitation_sum` est
  déjà surchargé par `precipitationSumScale` dans `standardColorScales`
  (`om-protocol-settings.ts`). Aucune nouvelle colormap.
- **Worker cumul** — `precipitation_sum` (sans suffixe `_Nh`) ne matche pas le
  pattern worker `^(.+)_sum_(\d+)h$` : servi comme variable normale du bucket.

## Changements

### 1. `src/lib/constants.ts`

- `export const AROME_FRANCE_DOMAIN = 'arome_france';`
- Ajouter `'arome_france'` à `DOMAIN_ALLOWLIST` (sous-section pseudo-domaines maison).
- `DOMAIN_DEFAULT_VIEWS['arome_france'] = { center: [2.3, 46.6], zoom: 5 }`
  (même vue métropole que convection).
- `DOMAIN_DEFAULT_VARIABLES['arome_france'] = 'temperature_2m'` — bascule propre
  depuis un domaine dont la variable courante n'existe pas chez nous (ex.
  `radar_reflectivity` de convection → `temperature_2m`), avant le fallback
  `variables[0]` dans `matchVariableOrFirst()`.
- `MODEL_DESCRIPTIONS['arome_france'] = 'Infoclimat · 0,025° (~2,5 km), France métropole · surface · ~51 h'`.

### 2. `src/lib/helpers.ts`

- Ajouter `AROME_FRANCE_DOMAIN` à `BUCKET_DOMAINS` → `getBaseUri('arome_france')`
  retourne `getModelsBucketUrl()`.

### 3. Nouveau `src/lib/arome-france-domain.ts`

- Définition `Domain` : `{ value: 'arome_france', label: 'AROME France', grid: { type:'regular', nx:1121, ny:717, latMin:37.5, lonMin:-12, dx:0.025, dy:0.025, zoom:5.2 }, time_interval:'hourly', model_interval:'3_hourly' }`.
- `registerAromeFranceDomain()` : gated sur `getModelsBucketUrl()` (sinon no-op,
  domaine absent du sélecteur — gating identique aux autres pseudo-domaines) ;
  garantit l'existence du groupe partagé (cf. §4) ; pousse le domaine dans
  `domainOptions` (idempotent).

### 4. Groupe de sélecteur partagé « AROME France (Infoclimat) »

Le sélecteur (`model-selector.svelte`) groupe par préfixe : un domaine `D` est
listé sous un groupe `G` si `D.value.startsWith(G.value)`. Un groupe de valeur
`arome_france` capture donc `arome_france` **et** `arome_france_convection` (mais
aucun domaine OM, qui commencent par `meteofrance`).

- Définir le groupe partagé `{ value: 'arome_france', label: 'AROME France (Infoclimat)' }`
  dans **un seul point** (helper `ensureAromeFranceGroup()` idempotent, exporté
  depuis `arome-france-domain.ts`).
- `arome-france-domain.ts` et `arome-france-convection-domain.ts` appellent tous
  deux `ensureAromeFranceGroup()` et ne poussent plus de groupe propre.
  `arome-france-convection-domain.ts` cesse de pousser
  `{ value:'arome_france_convection', label:'AROME Convection' }`.
- Résultat : « AROME France » + « AROME Convection » sous un unique heading
  « AROME France (Infoclimat) », sans doublon.

### 5. `src/lib/stores/variables.ts`

- Importer et appeler `registerAromeFranceDomain()` au chargement, à côté des
  autres `register…Domain()`. L'ordre vis-à-vis de convection est indifférent
  (group ensure idempotent).

### 6. Aucun changement

- `src/lib/stores/om-protocol-settings.ts` — resolver par défaut + colormaps
  standard suffisent.
- `src/lib/metadata.ts` — `matchVariableOrFirst()` est générique ; les 12
  variables sont reconnues via `meta.json` ; `DOMAIN_DEFAULT_VARIABLES` couvre la
  bascule.
- `src/lib/url.ts` — format temps et routing bucket déjà corrects.

## Tests (`src/lib/tests/`)

- **Nouveau `arome-france-domain.test.ts`** (miroir de
  `arome-france-convection-domain.test.ts`) :
  - enregistre le domaine avec la grille producteur (1121×717, 0.025°, lonMin −12,
    latMin 37.5, `hourly`/`3_hourly`) ;
  - garantit le groupe partagé `arome_france` ;
  - idempotence (pas de double push domaine ni groupe) ;
  - no-op quand `VITE_MODELS_BUCKET_URL` est vide.
- **Mettre à jour `arome-france-convection-domain.test.ts`** : le groupe attendu
  passe de `arome_france_convection` à `arome_france` (groupe partagé) ; vérifier
  que `arome_france_convection` n'apparaît plus comme valeur de groupe.
- **`getBaseUri('arome_france')`** → bucket (test helpers si existant, sinon
  inclure dans le test de domaine).

## Hors-code (ops)

- Mesurer la latence avant/après bascule (motif initial : bucket OM lent).
- Stratégie de cutover : la liste blanche des variables servies maison est
  implicite (les 12 du `meta.json`) ; élargie au fil de l'eau côté pipeline.
