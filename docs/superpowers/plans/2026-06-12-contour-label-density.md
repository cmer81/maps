# Étiquettes d'isocontours denses + halo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Répéter les étiquettes de valeur le long des isolignes et les rendre lisibles sur le raster via un halo, à la Meteociel.

**Architecture:** Pur styling MapLibre dans la couche symbol existante `omVectorContourLayerLabels` (`src/lib/layers.ts`). Aucun changement de données, de stores, d'URL ni d'UI. Spec validé : `docs/superpowers/specs/2026-06-11-contour-labels-density-design.md`.

**Tech Stack:** SvelteKit (statique), MapLibre GL, TypeScript. Prettier tabs/single quotes (ne pas formater à la main, `npm run format`).

**Note TDD :** pas de test unitaire ajouté — décision actée dans le spec. Le changement est de la configuration déclarative MapLibre passée à `map.addLayer` ; aucun builder testable de `src/lib/vector-styles.ts` ne change. La vérification est visuelle (étape 3).

---

### Task 1: Densifier et haloter les étiquettes de contours

**Files:**

- Modify: `src/lib/layers.ts:195-225` (factory `vectorContourLabelsLayer`)

- [ ] **Step 1: Modifier layout et paint de la couche labels**

Dans `src/lib/layers.ts`, fonction `vectorContourLabelsLayer`, remplacer le bloc `map.addLayer({...})` actuel :

```ts
			{
				id: layerId,
				type: 'symbol',
				source: sourceId,
				'source-layer': 'contours',
				layout: {
					'symbol-placement': 'line-center',
					'symbol-spacing': 1,
					'text-font': ['Noto Sans Regular'],
					'text-field': buildContourLabelExpr(get(displayedVariable), get(geopotentialUnit)),
					'text-padding': 1,
					'text-offset': [0, -0.6]
				},
				paint: {
					'text-opacity': 0,
					'text-opacity-transition': { duration: 200, delay: 0 },
					'text-color': lightOrDark('rgba(0,0,0, 0.7)', 'rgba(255,255,255, 0.8)')
				}
			},
```

par :

```ts
			{
				id: layerId,
				type: 'symbol',
				source: sourceId,
				'source-layer': 'contours',
				layout: {
					// 'line' (et non 'line-center') : étiquette répétée tous les
					// `symbol-spacing` px écran le long de l'isoligne.
					'symbol-placement': 'line',
					'symbol-spacing': 280,
					'text-font': ['Noto Sans Regular'],
					'text-field': buildContourLabelExpr(get(displayedVariable), get(geopotentialUnit)),
					'text-padding': 1
				},
				paint: {
					'text-opacity': 0,
					'text-opacity-transition': { duration: 200, delay: 0 },
					'text-color': lightOrDark('rgba(0,0,0, 0.7)', 'rgba(255,255,255, 0.8)'),
					// Le halo interrompt visuellement la ligne sous l'étiquette.
					'text-halo-color': lightOrDark('rgba(255,255,255, 0.8)', 'rgba(0,0,0, 0.6)'),
					'text-halo-width': 1.5
				}
			},
```

Détails :

- `text-offset` est supprimé (défaut `[0, 0]`) : l'étiquette se pose sur la ligne au lieu de flotter au-dessus.
- `lightOrDark(light, dark)` est le helper module défini en `src/lib/layers.ts:50` — il suit le thème du **fond de carte** (`basemapTheme`), déjà utilisé pour `text-color` ; ne pas le remplacer par un test sur le thème du chrome.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run check && npm run lint`
Expected: `svelte-check found 0 errors` et prettier/eslint sans erreur. (`symbol-spacing`, `text-halo-color`, `text-halo-width` sont des propriétés MapLibre valides pour une couche `symbol` — une erreur ici signalerait une faute de frappe.)

- [ ] **Step 3: Vérification visuelle**

Run: `npm run dev`
Ouvrir : `http://localhost:5173/?domain=meteofrance_arpege_europe&variable=temperature_850hPa&contours=true&interval=2`

Vérifier :

1. Plusieurs étiquettes le long d'une même isoligne (pas une seule par ligne), sans chevauchement.
2. Halo clair autour du texte, valeurs lisibles sur les zones saturées du raster.
3. Basculer le fond de carte en sombre (réglages) : texte clair + halo sombre.
4. Scrubbing temporel : les étiquettes suivent le fade-in groupé, pas de saccade nouvelle.

Si la densité ou le halo semblent mal réglés, ajuster `symbol-spacing` (220–350) ou `text-halo-width` (1–2) — une ligne chacun — et re-vérifier.

- [ ] **Step 4: Commit**

```bash
git add src/lib/layers.ts
git commit -m "feat(contours): étiquettes répétées le long des isolignes + halo"
```
