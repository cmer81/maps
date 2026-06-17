# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

It holds **global facts** only. Zone-specific guidance lives in path-scoped rules under `.claude/rules/` and loads automatically when you work in the matching area:

- `.claude/rules/architecture.md` — `om://` protocol, SlotManager, GeoJSON overlays, playback, worker integration (`src/lib/*.ts`, `src/routes/**`)
- `.claude/rules/stores.md` — svelte stores, persisted state, URL ↔ store sync (`src/lib/stores/**`, `url.ts`)
- `.claude/rules/components.md` — component organization, `IControl` buttons, shadcn-svelte (`src/lib/components/**`)
- `.claude/rules/tests.md` — Vitest scope and conventions (`src/lib/tests/**`)

## Keeping these docs in sync

When a change alters project structure or architecture, update the matching doc **in the same change** — a stale path-scoped rule is worse than none because it loads silently:

- Engine behavior (`om://`, slots, overlays, playback, worker), stores, components, or test setup → update the matching `.claude/rules/*.md` (and its `paths:` if files moved or were renamed).
- New command, convention, or global fact → update this `CLAUDE.md`.
- Human-facing architecture summary → update the `## Architecture` section of `README.md`.

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

## Conventions

- **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`) — not Svelte 4 reactive statements. `svelte.config.js` sets `compilerOptions.modernAst: true`.
- **Svelte AI tooling** — install the official `sveltejs/ai-tools` Claude Code plugin (`/plugin marketplace add sveltejs/ai-tools` then `/plugin install svelte`). It provides the Svelte MCP server, the `svelte-core-bestpractices` skill, and the `svelte-file-editor` agent — delegate `.svelte` / `.svelte.ts` edits to that agent and validate with `svelte-autofixer`.
- **Tailwind v4** with `@tailwindcss/vite`; tokens live in `src/styles.css`. `slate` is the shadcn base color.
- **Prettier** uses tabs, single quotes, no trailing commas, 100 col print width. Imports are auto-sorted by `@trivago/prettier-plugin-sort-imports` following the order in `prettier.config.js` (`svelte` → 3rd party → `$app/` → `$lib/stores` → `$lib/utils` → `$lib/components` → `$lib`). Don't hand-order imports — run `npm run format`.
- **Semantic PR titles** are enforced (`.github/workflows/semantic-pr.yml`). Use `feat:`, `fix:`, `chore:`, etc.
- Path aliases: `$lib/*` resolves to `src/lib/*` (SvelteKit default); use these instead of relative paths across directories.
- **Dépendances forkées** (`@openmeteo/file-reader` → `@cm3r/file-reader`, `@openmeteo/weather-map-layer` → `@cm3r/weather-map-layer`). Si une modif ne peut se faire côté `maps` et exige de toucher la lib : modifier le **fork**, garder le patch petit/isolé, puis **publier une nouvelle version npm et bumper le pin ici** — jamais consommer une lib forkée autrement que par une version npm publiée + épinglée (reproductibilité CI). Workflow détaillé : section « Dépendances forkées » du `README.md`.
