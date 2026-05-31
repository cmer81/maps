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

`src/lib/labels-layer.ts` (valeurs numériques au-dessus de la carte) and `src/lib/departments-layer.ts` (contours des départements français) share the same pattern: a single `geojson` source + a MapLibre layer placed below `BEFORE_LAYER_VECTOR`, toggled by a persisted store (`showLabels`, `showDepartments`). Both expose `ensure<Name>Layer()` (idempotent registration) and `refresh<Name>()` (data update, possibly fetching). Reuse this pattern for any new overlay (régions, communes, etc.) rather than wiring sources/layers from `+page.svelte` directly.

The departments contour file is bundled (`static/departements.geojson`) to avoid CORS issues with third-party CDNs; the labels endpoint is dynamic (per-viewport fetches to `infoclimat-om-worker`).

## Playback (diaporama)

`src/lib/playback-renderer.ts` and `src/lib/playback.ts` implement a pre-rendered animation feature: frames are captured from the canvas (`preserveDrawingBuffer` is enabled on the map for this — see `+page.svelte`), decoded, and replayed via a `PlaybackOverlay`. State lives in `src/lib/stores/playback.ts` (fps, frames, currentIndex, prerenderProgress). The slot manager emits commit/error events (`slot-events.ts`) so playback can observe when a tile load completes. Playback locks map interaction (`MapInteractionLock`) during pre-render.

## Domain allowlist (Infoclimat preset)

`DOMAIN_ALLOWLIST` in `src/lib/constants.ts` filters the domain selector in `variable-selection.svelte` to the Infoclimat-relevant subset (MF AROME / ARPEGE, ECMWF IFS / AIFS, DWD ICON). This is **display-only**: URLs sharing a non-listed domain still resolve correctly (the rest of the app reads `domainOptions` from the package unfiltered). Add/remove entries in the list to expose more models in the UI.

## Sondage vertical (Skew-T)

`src/lib/sounding/` implémente un sondage atmosphérique client-side en trois couches indépendantes :

1. **Lecture** (`column.ts`) — `fetchColumn()` instancie un `WeatherMapLayerFileReader`, appelle `setToOmFile()` une seule fois puis `readSimpleVariable()` pour chaque variable (température, humidité, vent U/V) sur une petite bbox autour du point cliqué, avec interpolation bilinéaire. On utilise `readSimpleVariable` (et non `readVariable`) pour récupérer les champs **bruts** : `readVariable` applique des règles de dérivation qui transforment les composantes de vent en vitesse+direction, alors que le sondage a besoin des U/V séparés. Le choix de `WeatherMapLayerFileReader` est délibéré : `getValueFromLatLong()` ne retourne la valeur que pour la variable actuellement rendue ; ici on lit les niveaux de pression indépendamment. Le cache bloc-byte du reader évite un re-téléchargement du `.om` (même mécanique que `src/lib/prefetch.ts`).
2. **Calcul** (`thermo.ts`, `parcel.ts`, `indices.ts`, `skewt-coords.ts`) — fonctions pures TypeScript sans dépendance au domaine : primitives Bolton/Magnus, adiabates, bulbe humide, parcelle SB & MU (LCL/LFC/EL), CAPE/CIN/LI, LPN/isothermie, cisaillement 0-1/0-3/0-6 km, et la transformation log-P + inclinaison du Skew-T.
3. **UI** (`src/lib/components/sounding/`) — panel tabulé réactif sur le scrubber de temps (debounce + jeton de génération pour annuler les fetch obsolètes).

La couche lecture est source-agnostique : `SOUNDING_LEVELS_BY_DOMAIN` dans `src/lib/constants.ts` mappe chaque domaine vers ses niveaux de pression disponibles ; le domaine `arome_om_reunion` (Réunion) est anticipé dans la table mais pas encore exposé dans l'UI. Ajouter un nouveau domaine ne nécessite de modifier que cette constante et `soundingLevelsForDomain()`.

Le bouton « Sondage vertical » du popup n'est affiché que si `isSoundingDomain(domaine)` (domaine listé dans `SOUNDING_LEVELS_BY_DOMAIN`, donc seuls les modèles à niveaux de pression — AROME 0,025° aujourd'hui) **et** si le toggle persisté `soundingButtonEnabled` (réglages → `sounding-settings.svelte`) est activé. Sur les autres modèles le bouton est masqué (`display:none` dans `updatePopupContent`).

## infoclimat-om-worker integration

The worker URL (`getOmWorkerUrl()`, read from `VITE_OM_WORKER_URL` at build time or `/runtime-config.js` for Docker runtime templating) backs two features: the basemap tile-proxy (`map-controls.ts`) and the labels overlay (`labels-layer.ts`, per-viewport numeric value fetches). When the URL is unset, those features are disabled.
