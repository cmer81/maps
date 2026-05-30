---
description: Svelte stores, persisted state, and URL ↔ store sync
paths:
  - 'src/lib/stores/**'
  - 'src/lib/url.ts'
  - 'src/lib/constants.ts'
---

# State (svelte stores)

All app state lives under `src/lib/stores/` as svelte stores. Many are `persisted(...)` from `svelte-persisted-store` (localStorage-backed): `preferences`, `tileSize`, `opacity`, `cacheBlockSizeKb`, `cacheMaxBytesMb`, `customColorScales`, units, etc. `localStorageVersion` is compared against `package.json` version on mount; when it changes, `resetStates()` in `preferences.ts` wipes all persisted state — bump the package version when introducing breaking state shape changes.

`src/lib/stores/sounding.ts` gère l'état du panel de sondage vertical (`open`, `lat`, `lng`, `activeTab`). Ce store n'est ni persisté ni synchronisé dans l'URL (MVP) — l'état est perdu au rechargement de page.

URL ↔ store sync is centralized in `src/lib/url.ts`:

- `urlParamsToPreferences()` runs on mount to hydrate stores from query params.
- `updateUrl(param, value)` is called from store subscriptions / event handlers; it omits params equal to defaults (defined in `COMPLETE_DEFAULT_VALUES` in `constants.ts`).
- The MapLibre `_hash` (zoom/center) is appended back into the URL.
