# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Open-Meteo Maps — a client-side SvelteKit app that fetches weather OMfiles from `openmeteo.s3.amazonaws.com` and renders them with MapLibre GL. All tile rendering happens in the browser via `@openmeteo/weather-map-layer`; there is no server-side tile generation. The build is a static export (`@sveltejs/adapter-static`, no SSR).

## Commands

```bash
npm install
npm run dev              # vite dev
npm run build            # vite build → ./build
npm run preview          # serve the static build
npm run check            # svelte-kit sync + svelte-check (typecheck)
npm run lint             # prettier --check + eslint
npm run format           # prettier --write .
npm run test             # vitest (watch)
npm run coverage         # vitest run --coverage (v8)
```

Run a single test file: `npx vitest run src/lib/tests/time-format.test.ts`
Run a single test by name: `npx vitest run -t "parses ISO"`

Node version is pinned via `.nvmrc` (`lts/*`). CI (`.github/workflows/build.yml`) runs `check`, `test`, then `build`.

## Architecture

### Custom `om://` MapLibre protocol

The app registers a custom protocol with MapLibre in `src/routes/+page.svelte` (`maplibregl.addProtocol('om', ...)`) wired to `omProtocol` from `@openmeteo/weather-map-layer`. All sources use `om://<https-url-with-query-params>` URLs. Source URLs are constructed in `src/lib/url.ts → getOMUrl()`, which encodes the domain, model run, valid time, variable, vector toggles, tile size, dark mode, and stable hashes of clipping/color settings.

The dev/preview server in `vite.config.ts` injects `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers — required for `SharedArrayBuffer` used by `@openmeteo/file-reader` (which is excluded from Vite's `optimizeDeps` along with `@openmeteo/file-format-wasm`).

### SlotManager (double-buffered tiles)

`src/lib/slot-manager.ts` implements an A/B slot system used by `src/lib/layers.ts`. MapLibre's `setUrl`/`setTiles` does not reliably abort in-flight requests, so each data update creates a new source+layers in the pending slot, waits for `source.loaded()`, then cross-fades opacity and removes the old slot after `removeDelayMs`. When changing rendering code, preserve this pattern — there are two managers (`rasterManager`, `vectorManager`) created in `createManagers()` and both must be updated through `update()`/`setBeforeLayer()` rather than mutating sources/layers directly.

`changeOMfileURL()` short-circuits when `getOMUrl()` equals `currentOmUrl` — any code that should force a reload must either invalidate `currentOmUrl` or change a parameter that flows into `getOMUrl()`.

### State (svelte stores)

All app state lives under `src/lib/stores/` as svelte stores. Many are `persisted(...)` from `svelte-persisted-store` (localStorage-backed): `preferences`, `tileSize`, `opacity`, `cacheBlockSizeKb`, `cacheMaxBytesMb`, `customColorScales`, units, etc. `localStorageVersion` is compared against `package.json` version on mount; when it changes, `resetStates()` in `preferences.ts` wipes all persisted state — bump the package version when introducing breaking state shape changes.

URL ↔ store sync is centralized in `src/lib/url.ts`:

- `urlParamsToPreferences()` runs on mount to hydrate stores from query params.
- `updateUrl(param, value)` is called from store subscriptions / event handlers; it omits params equal to defaults (defined in `COMPLETE_DEFAULT_VALUES` in `constants.ts`).
- The MapLibre `_hash` (zoom/center) is appended back into the URL.

### Routes

Single page app: `src/routes/+page.svelte` is the entry; `+layout.ts` opts out of SSR (`export const prerender = true` / no server logic). Adding new routes is unusual — most features become components under `src/lib/components/`.

### Components

Organized by feature under `src/lib/components/` (`buttons/`, `clipping/`, `time/`, `scale/`, `selection/`, `settings/`, `help/`, `keyboard/`, `dropzone/`, `loading/`). Primitive UI lives under `src/lib/components/ui/` and is managed by `shadcn-svelte` — regenerate with `npm run upgrade:ui` (uses `components.json`). Aliases: `$lib/components`, `$lib/components/ui`, `$lib/utils`.

The map buttons (`ClippingButton`, `DarkModeButton`, `DepartmentsButton`, `HelpButton`, `HillshadeButton`, `LabelsButton`, `SettingsButton`) are MapLibre `IControl` implementations exported from `src/lib/components/buttons/index.ts`, added via `$map.addControl(...)`.

### GeoJSON overlays

`src/lib/labels-layer.ts` (valeurs numériques au-dessus de la carte) and `src/lib/departments-layer.ts` (contours des départements français) share the same pattern: a single `geojson` source + a MapLibre layer placed below `BEFORE_LAYER_VECTOR`, toggled by a persisted store (`showLabels`, `showDepartments`). Both expose `ensure<Name>Layer()` (idempotent registration) and `refresh<Name>()` (data update, possibly fetching). Reuse this pattern for any new overlay (régions, communes, etc.) rather than wiring sources/layers from `+page.svelte` directly.

The departments contour file is bundled (`static/departements.geojson`) to avoid CORS issues with third-party CDNs; the labels endpoint is dynamic (per-viewport fetches to `infoclimat-om-worker`).

### Playback (diaporama)

`src/lib/playback-renderer.ts` and `src/lib/playback.ts` implement a pre-rendered animation feature: frames are captured from the canvas (`preserveDrawingBuffer` is enabled on the map for this — see `+page.svelte`), decoded, and replayed via a `PlaybackOverlay`. State lives in `src/lib/stores/playback.ts` (fps, frames, currentIndex, prerenderProgress). The slot manager emits commit/error events (`slot-events.ts`) so playback can observe when a tile load completes. Playback locks map interaction (`MapInteractionLock`) during pre-render.

### Domain allowlist (Infoclimat preset)

`DOMAIN_ALLOWLIST` in `src/lib/constants.ts` filters the domain selector in `variable-selection.svelte` to the Infoclimat-relevant subset (MF AROME / ARPEGE, ECMWF IFS / AIFS, DWD ICON). This is **display-only**: URLs sharing a non-listed domain still resolve correctly (the rest of the app reads `domainOptions` from the package unfiltered). Add/remove entries in the list to expose more models in the UI.

### Cumul precipitation (worker integration)

Variables matching `CUMUL_VARIABLE_REGEX` (`^(.+)_sum_(\d+)h$`) are routed to `infoclimat-om-worker` via `getOMUrl()` instead of the upstream Open-Meteo S3 bucket. The worker URL is read from `VITE_OM_WORKER_URL` (build-time) or `/runtime-config.js` (Docker runtime templating). Cumul UI entries appear in the variable selector only when the worker URL is set AND the cumul flag is enabled (`isCumulEnabled()`). See the root `CLAUDE.md` for the full cross-project contract.

### Tests

Vitest config (`vitest.config.ts`) only collects tests from `src/lib/tests/**`. Environment is `node`, so tests should target pure logic (time parsing, utility helpers); DOM/Svelte component tests are not currently set up.

## Conventions

- **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`) — not Svelte 4 reactive statements. `svelte.config.js` sets `compilerOptions.modernAst: true`.
- **Tailwind v4** with `@tailwindcss/vite`; tokens live in `src/styles.css`. `slate` is the shadcn base color.
- **Prettier** uses tabs, single quotes, no trailing commas, 100 col print width. Imports are auto-sorted by `@trivago/prettier-plugin-sort-imports` following the order in `prettier.config.js` (`svelte` → 3rd party → `$app/` → `$lib/stores` → `$lib/utils` → `$lib/components` → `$lib`). Don't hand-order imports — run `npm run format`.
- **Semantic PR titles** are enforced (`.github/workflows/semantic-pr.yml`). Use `feat:`, `fix:`, `chore:`, etc.
- Path aliases: `$lib/*` resolves to `src/lib/*` (SvelteKit default); use these instead of relative paths across directories.
