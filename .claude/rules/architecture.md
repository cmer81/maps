---
description: Core rendering engine — om:// protocol, SlotManager, GeoJSON overlays, playback, worker integration
paths:
  - 'src/lib/*.ts'
  - 'src/routes/**'
  - 'vite.config.ts'
---

# Architecture (rendering engine)

## Custom `om://` MapLibre protocol

The app registers a custom protocol with MapLibre in `src/routes/+page.svelte` (`maplibregl.addProtocol('om', ...)`) wired to `omProtocol` from `@openmeteo/weather-map-layer`. All sources use `om://<https-url-with-query-params>` URLs. Source URLs are constructed in `src/lib/url.ts → getOMUrl()`, which encodes the domain, model run, valid time, variable, vector toggles, tile size, dark mode, and stable hashes of clipping/color settings.

The dev/preview server in `vite.config.ts` injects `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers — required for `SharedArrayBuffer` used by `@openmeteo/file-reader` (which is excluded from Vite's `optimizeDeps` along with `@openmeteo/file-format-wasm`).

## SlotManager (double-buffered tiles)

`src/lib/slot-manager.ts` implements an A/B slot system used by `src/lib/layers.ts`. MapLibre's `setUrl`/`setTiles` does not reliably abort in-flight requests, so each data update creates a new source+layers in the pending slot, waits for `source.loaded()`, then cross-fades opacity and removes the old slot after `removeDelayMs`. When changing rendering code, preserve this pattern — there are two managers (`rasterManager`, `vectorManager`) created in `createManagers()` and both must be updated through `update()`/`setBeforeLayer()` rather than mutating sources/layers directly.

`changeOMfileURL()` short-circuits when `getOMUrl()` equals `currentOmUrl` — any code that should force a reload must either invalidate `currentOmUrl` or change a parameter that flows into `getOMUrl()`.

## Routes

Single page app: `src/routes/+page.svelte` is the entry; `+layout.ts` opts out of SSR (`export const prerender = true` / no server logic). Adding new routes is unusual — most features become components under `src/lib/components/`.

## GeoJSON overlays

`src/lib/departments-layer.ts` (contours des départements français) suit ce pattern : un seul `geojson` source + un layer MapLibre placé sous `BEFORE_LAYER_VECTOR`, togglé par un store persisté (`showDepartments`). Il expose `ensureDepartmentsLayer()` (enregistrement idempotent) et `refreshDepartments()` (mise à jour des données). Réutiliser ce pattern pour tout nouvel overlay (régions, communes, etc.) plutôt que de câbler sources/layers depuis `+page.svelte` directement.

The departments contour file is bundled (`static/departements.geojson`) to avoid CORS issues with third-party CDNs.

## Playback (diaporama) — retiré

Le player d'animation pré-rendu a été retiré (à reconstruire dans un module propre). Vestiges conservés :

- `src/lib/playback-renderer.ts` ne contient plus que `waitForIdle(map, timeoutMs, signal?)`, utilisé par `capture-flow.svelte` pour attendre la mise au repos de la carte avant la capture PNG du canvas (`preserveDrawingBuffer` reste activé sur la map — voir `+page.svelte`).
- `src/lib/slot-events.ts` continue d'émettre `commit`/`error` depuis le slot manager (`layers.ts`), mais plus aucun consommateur n'écoute ce bus — émission inoffensive, conservée pour le futur module d'animation.

Supprimés : `src/lib/stores/playback.ts`, le composant `playback-panel.svelte`, et les exports `PlaybackOverlay` / `MapInteractionLock` / `captureFrame` / `decodeFrames` / `computeFrameIntervalMs` / `estimatePrerenderMs` / `isFailureRateExceeded` / `waitForCommit` de `playback-renderer.ts`.

**Préchargement (prefetch) — réintroduit seul.** `src/lib/prefetch.ts` + `src/lib/components/time/prefetch-button.svelte` ont été restaurés (sans le player d'animation). Le bouton vit dans la barre de run (`time-selector.svelte`, dans le `<div>` `-top-4.5` à côté du sélecteur de run) : un `Select` de mode (Aujourd'hui / 24 h suivantes / 24 h précédentes / Run complet) + un bouton télécharger qui appelle `prefetchData()`. `getDateRangeForMode()` traduit le mode en plage `[startDate, endDate]`, `prefetchData()` filtre les `valid_times` du `metaJson` dans cette plage et précharge chaque pas via `omFileReader.prefetchVariable()` (8 workers concurrents, annulable via `AbortController`). Sans `metaJson`/`modelRun` chargés, un toast d'avertissement s'affiche.

## Domain allowlist (Infoclimat preset)

`DOMAIN_ALLOWLIST` in `src/lib/constants.ts` filters the domain selector in `model-selector.svelte` to the Infoclimat-relevant subset (MF AROME / ARPEGE, ECMWF IFS / AIFS, DWD ICON). This is **display-only**: URLs sharing a non-listed domain still resolve correctly (the rest of the app reads `domainOptions` from the package unfiltered). Add/remove entries in the list to expose more models in the UI.

## Pseudo-domaines servis depuis le bucket R2

Certains domaines ne viennent pas d'Open-Meteo mais d'un bucket R2 (`VITE_MODELS_BUCKET_URL`, voir `getModelsBucketUrl()`) : ils sont listés dans `BUCKET_DOMAINS` (`src/lib/helpers.ts → getBaseUri()`) et enregistrés via un module dédié appelé depuis `stores/variables.ts`, **gated** sur la présence du bucket (invisibles dans le sélecteur sinon). Aujourd'hui : `anomaly_europe` (`anomaly-domain.ts`, layout `/anomaly/…` → resolver custom dans `om-protocol-settings.ts`), `arome_om_reunion` (`arome-om-domain.ts`), `arome_france_convection` (`arome-france-convection-domain.ts`) et `arome_france` (`arome-france-domain.ts`). Les trois derniers utilisent le layout `data_spatial/{domain}/…` standard → resolver par défaut, aucune modif du protocole.

`arome_france_convection` (AROME France métropole, convection/orage) expose 9 variables avec colormaps dédiées dans `src/lib/color-scales/` (7 continues + 1 catégorielle partagée par `precipitation_type`/`precipitation_type_severe`, type `CategoricalColorScale` rendu par `components/scale/categorical-legend.svelte`). La variable affichée par défaut sur bascule de domaine est pilotée par `DOMAIN_DEFAULT_VARIABLES` (`constants.ts`), consultée par `matchVariableOrFirst()` (`metadata.ts`).

`arome_france` (AROME France métropole, **surface**) expose 12 variables standard Open-Meteo (`temperature_2m`, `relative_humidity_2m`, `dew_point_2m`, `wind_u_component_10m`, `wind_v_component_10m`, `wind_gusts_10m`, `pressure_msl`, `cloud_cover_low/mid/high`, `precipitation`, `precipitation_sum`) servies depuis le bucket maison — **pas de fallback Open-Meteo**. Même grille que `arome_france_convection` (1121×717 à 0,025°). Colormaps par défaut du package (`precipitation_sum` surchargé dans `standardColorScales`) ; le vent u/v est dérivé en vitesse/direction par le package (le `_v_component` est masqué par `variable-tabs.svelte`), donc aucune dérivation côté client. Le groupe de sélecteur partagé « AROME France (Infoclimat) » (valeur `arome_france`, défini dans `arome-france-domain.ts → ensureAromeFranceGroup()`) regroupe `arome_france` **et** `arome_france_convection` — `arome-france-convection-domain.ts` ne pousse plus son propre groupe.

**`precipitation_type` / `precipitation_type_severe` masquées (à refactorer).** Ces deux variables sont **catégorielles** (codes producteur entiers) mais `@openmeteo/weather-map-layer@0.0.19` n'a pas de rendu catégoriel : le rasterizer échantillonne les données en **bilinéaire** (`grid.getLinearInterpolatedValue`) avant le LUT couleur, à la fois pour les tuiles et pour `getValueFromLatLong` (popup), et aucune option nearest-neighbor n'est exposée (`RenderOptions` n'a pas de type d'échelle `categorical`). Résultat : halos de catégorie parasite en lisière (une valeur interpolée entre deux codes éloignés tombe sur un code intermédiaire) et valeurs non entières au survol. En attendant une refacto / un correctif amont du package (échantillonnage NN + correspondance exacte → hors-code transparent, à porter dans le rasterizer worker **et** `getValueFromLatLong`), elles sont **masquées du sélecteur** via `HIDDEN_VARIABLES` (`constants.ts`), filtré dans `variable-tabs.svelte`. Masquage display-only : une URL partagée ciblant ces variables résout toujours (rendu avec l'artefact). La `precipitationTypeScale` (`color-scales/precipitation-type.ts`) et la légende catégorielle restent en place pour la reprise. Suivi : [issue #35](https://github.com/cmer81/maps/issues/35).

## Sondage vertical (Skew-T)

`src/lib/sounding/` implémente un sondage atmosphérique client-side en trois couches indépendantes :

1. **Lecture** (`column.ts`) — `fetchColumn()` instancie un `WeatherMapLayerFileReader`, appelle `setToOmFile()` une seule fois puis `readSimpleVariable()` pour chaque variable (température, humidité, vent U/V) sur une petite bbox autour du point cliqué, avec interpolation bilinéaire. On utilise `readSimpleVariable` (et non `readVariable`) pour récupérer les champs **bruts** : `readVariable` applique des règles de dérivation qui transforment les composantes de vent en vitesse+direction, alors que le sondage a besoin des U/V séparés. Le choix de `WeatherMapLayerFileReader` est délibéré : `getValueFromLatLong()` ne retourne la valeur que pour la variable actuellement rendue ; ici on lit les niveaux de pression indépendamment. Le cache bloc-byte du reader évite un re-téléchargement du `.om` (même mécanique que `src/lib/prefetch.ts`).
2. **Calcul** (`thermo.ts`, `parcel.ts`, `indices.ts`, `skewt-coords.ts`) — fonctions pures TypeScript sans dépendance au domaine : primitives Bolton/Magnus, adiabates, bulbe humide, parcelle SB & MU (LCL/LFC/EL), CAPE/CIN/LI, LPN/isothermie, cisaillement 0-1/0-3/0-6 km, et la transformation log-P + inclinaison du Skew-T.
3. **UI** (`src/lib/components/sounding/`) — panel tabulé réactif sur le scrubber de temps (debounce + jeton de génération pour annuler les fetch obsolètes).

La couche lecture est source-agnostique : `SOUNDING_LEVELS_BY_DOMAIN` dans `src/lib/constants.ts` mappe chaque domaine **source** vers ses niveaux de pression disponibles ; le domaine `arome_om_reunion` (Réunion) est anticipé dans la table mais pas encore exposé dans l'UI.

**Domaine affiché ≠ domaine source du sondage.** Certains domaines affichés ne diffusent pas eux-mêmes les niveaux de pression : `SOUNDING_SOURCE_BY_DOMAIN` redirige alors le sondage vers un autre domaine sur **la même grille**. Aujourd'hui `arome_france` (pseudo-domaine surface, bucket maison Infoclimat, 12 variables surface uniquement) → `meteofrance_arome_france0025` (AROME 0,025° d'Open-Meteo, grille identique 1121×717 @ 0,025°, 24 niveaux iso-pression). `soundingSourceDomain()` résout la redirection (identité par défaut) ; `isSoundingDomain()` et `soundingLevelsForDomain()` raisonnent sur la source. Quand la source diffère de l'affiché, `column.ts → doFetchColumn()` lit le run de la source via son propre `latest.json` (`fetchSoundingSourceRun()` — le store `modelRun` ne porte que le run de l'affiché) et bâtit l'URL `.om` avec `buildSoundingOmUrl()` (`helpers.ts`) sur la grille de la source. Ajouter un nouveau domaine : éditer `SOUNDING_LEVELS_BY_DOMAIN` (s'il porte ses niveaux) ou `SOUNDING_SOURCE_BY_DOMAIN` (s'il faut rediriger), rien d'autre.

Le bouton « Sondage vertical » du popup n'est affiché que si `isSoundingDomain(domaine)` (domaine dont la **source** est listée dans `SOUNDING_LEVELS_BY_DOMAIN` — AROME 0,025° en direct, ou `arome_france` via sa redirection) **et** si le toggle persisté `soundingButtonEnabled` (réglages → `sounding-settings.svelte`) est activé. Sur les autres modèles le bouton est masqué (`display:none` dans `updatePopupContent`).

## infoclimat-om-worker integration

The worker URL (`getOmWorkerUrl()`, read from `VITE_OM_WORKER_URL` at build time or `/runtime-config.js` for Docker runtime templating) backs the basemap tile-proxy (`map-controls.ts`). When the URL is unset, that feature is disabled.
