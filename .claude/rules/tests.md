---
description: Vitest scope and test conventions
paths:
  - 'src/lib/tests/**'
  - 'vitest.config.ts'
  - 'e2e/**'
---

# Tests

Vitest config (`vitest.config.ts`) only collects tests from `src/lib/tests/**`. Environment is `node`, so tests should target pure logic (time parsing, utility helpers); DOM/Svelte component tests are not currently set up.

Run a single test file: `npx vitest run src/lib/tests/time-format.test.ts`
Run a single test by name: `npx vitest run -t "parses ISO"`

## Vérification headless du rendu (`e2e/verify-map.mjs`)

Comme Vitest ne couvre **pas** le rendu MapLibre ni le câblage couches/popup, `npm run verify:map` charge la vraie carte dans Chrome (playwright-core + swiftshader), pilote des états via les paramètres d'URL, et inspecte l'état rendu via l'instance MapLibre exposée sur `window.__map` (uniquement en DEV — `import.meta.env.DEV` dans `+page.svelte`, arbre mort en prod). C'est l'outil pour attraper les **régressions visuelles / de câblage** qui passent sous le radar des tests unitaires (contours parasites, mauvaise unité d'étiquette, mauvaise source lue par le popup).

- **Auto-démarre** le binaire `vite` local (groupe détaché, tué en SIGKILL à la fin → pas de serveur orphelin) ; ou cible un serveur existant via `BASE_URL=…`. Chrome système via `CHROME_PATH` (sinon chemins usuels). Code de sortie : `0` OK, `1` assertion KO, `2` setup KO.
- Inspecte l'état avec les API MapLibre : `querySourceFeatures(sourceId, { sourceLayer })` (compter les features d'un source-layer — p. ex. 0 `contours` sur la source vent), `getLayoutProperty(layerId, 'text-field')` (vérifier l'expression d'étiquette), `getSource(id).url` (quelle variable alimente un manager). IDs de sources : `omVectorSource_{A,B}`, `omWindArrowSource_{A,B}`, `omRasterSource_{A,B}` (slots A/B du SlotManager).
- **Prérequis** : Chrome/Chromium système + accès réseau aux OMfiles amont. **NON branché sur la CI** (réseau + GPU) — vérification manuelle avant merge des changements de rendu.
- **Piège** : ne jamais faire `pkill -f vite` pour nettoyer — la chaîne `vite` figure dans la ligne de commande du shell appelant, donc `pkill` se tue lui-même (signal). Cibler les PID via `pgrep` + `/proc/<pid>/cmdline`, ou laisser le harnais gérer son serveur.
