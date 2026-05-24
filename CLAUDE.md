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

The map buttons (`ClippingButton`, `DarkModeButton`, `HelpButton`, `HillshadeButton`, `SettingsButton`) are MapLibre `IControl` implementations exported from `src/lib/components/buttons/index.ts`, added via `$map.addControl(...)`.

### Tests

Vitest config (`vitest.config.ts`) only collects tests from `src/lib/tests/**`. Environment is `node`, so tests should target pure logic (time parsing, utility helpers); DOM/Svelte component tests are not currently set up.

## Conventions

- **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`) — not Svelte 4 reactive statements. `svelte.config.js` sets `compilerOptions.modernAst: true`.
- **Tailwind v4** with `@tailwindcss/vite`; tokens live in `src/styles.css`. `slate` is the shadcn base color.
- **Prettier** uses tabs, single quotes, no trailing commas, 100 col print width. Imports are auto-sorted by `@trivago/prettier-plugin-sort-imports` following the order in `prettier.config.js` (`svelte` → 3rd party → `$app/` → `$lib/stores` → `$lib/utils` → `$lib/components` → `$lib`). Don't hand-order imports — run `npm run format`.
- **Semantic PR titles** are enforced (`.github/workflows/semantic-pr.yml`). Use `feat:`, `fix:`, `chore:`, etc.
- Path aliases: `$lib/*` resolves to `src/lib/*` (SvelteKit default); use these instead of relative paths across directories.
