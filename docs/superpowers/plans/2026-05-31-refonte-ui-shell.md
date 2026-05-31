# Refonte du shell UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la couche de présentation d'Open-Meteo Maps par un shell « progressive disclosure » en verre dépoli (barre haute desktop / dock mobile, panneau avancé regroupé, capture+partage de 1er niveau), sans toucher au moteur de rendu.

**Architecture:** Les nouveaux composants Svelte 5 lisent/écrivent les mêmes stores que l'UI actuelle. `+page.svelte` conserve ses subscriptions et `changeOMfileURL()`. Les 7 boutons `IControl` MapLibre deviennent des toggles Svelte montés dans le nouveau chrome. Chaque phase laisse l'app fonctionnelle.

**Tech Stack:** SvelteKit, Svelte 5 runes, Tailwind v4, shadcn-svelte, MapLibre GL, Vitest, `svelte/reactivity` MediaQuery, `mode-watcher`, `svelte-sonner`.

**Spec de référence:** `docs/superpowers/specs/2026-05-31-refonte-ui-shell-design.md`

---

## File Structure

**Créés :**

- `src/lib/variable-categories.ts` — table pure `variable → catégorie` + `categorize()`. Logique testable.
- `src/lib/tests/variable-categories.test.ts` — tests Vitest du module pur.
- `src/lib/components/chrome/scrim.svelte` — dégradés sombres haut/bas (contraste verre sur carte claire).
- `src/lib/components/chrome/app-chrome.svelte` — conteneur responsive : assemble le chrome desktop vs mobile.
- `src/lib/components/chrome/top-bar.svelte` — barre haute desktop.
- `src/lib/components/chrome/mobile-dock.svelte` — dock bas mobile.
- `src/lib/components/chrome/model-selector.svelte` — sélecteur de modèle (extrait de `variable-selection.svelte`).
- `src/lib/components/chrome/variable-tabs.svelte` — onglets imagés + `＋` liste catégorisée.
- `src/lib/components/chrome/advanced-panel.svelte` — rail droit / feuille : Calques / Réglages / Outils.
- `src/lib/components/chrome/layer-toggle.svelte` — ligne toggle réutilisable (label + Switch).
- `src/lib/components/capture/capture-flow.svelte` — bouton capture → cadrage → export → partage.
- `src/lib/share.ts` — helpers purs de partage (détection Web Share, fallback download/copie lien).
- `src/lib/tests/share.test.ts` — tests du module partage.

**Modifiés :**

- `src/routes/+page.svelte` — remplace le montage du chrome (par phase) ; retire les `addControl(...)` au fil des phases.
- `src/lib/components/scale/scale.svelte` — restyle légende (position/style verre cohérent).
- `src/lib/components/time/time-selector.svelte` — restyle barre de temps.
- `src/lib/components/buttons/index.ts` — les classes `IControl` deviennent obsolètes au fil des phases (supprimées en phase 3).

---

## PHASE 1 — Fondations (modules purs + scrim)

### Task 1 : Module de catégorisation des variables

**Files:**

- Create: `src/lib/variable-categories.ts`
- Test: `src/lib/tests/variable-categories.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// src/lib/tests/variable-categories.test.ts
import { describe, expect, it } from 'vitest';

import { CATEGORIES, categorize } from '$lib/variable-categories';

describe('categorize', () => {
	it('classe la température', () => {
		expect(categorize('temperature_2m')).toBe('temperature');
		expect(categorize('temperature_850hPa')).toBe('temperature');
	});

	it('classe les précipitations (pluie + neige)', () => {
		expect(categorize('precipitation')).toBe('precipitation');
		expect(categorize('rain')).toBe('precipitation');
		expect(categorize('snowfall')).toBe('precipitation');
		expect(categorize('precipitation_sum_3h')).toBe('precipitation');
	});

	it('classe le vent', () => {
		expect(categorize('wind_speed_10m')).toBe('wind');
		expect(categorize('wind_gusts_10m')).toBe('wind');
	});

	it('classe les nuages', () => {
		expect(categorize('cloud_cover')).toBe('clouds');
		expect(categorize('cloud_cover_low')).toBe('clouds');
	});

	it('classe la pression / altitude', () => {
		expect(categorize('pressure_msl')).toBe('pressure');
		expect(categorize('geopotential_height_500hPa')).toBe('pressure');
	});

	it('retombe sur "other" pour l’inconnu', () => {
		expect(categorize('soil_moisture_0_to_1cm')).toBe('other');
	});

	it('expose les catégories dans l’ordre d’affichage', () => {
		expect(CATEGORIES.map((c) => c.key)).toEqual([
			'temperature',
			'precipitation',
			'wind',
			'clouds',
			'pressure',
			'other'
		]);
	});
});
```

- [ ] **Step 2 : Lancer le test, vérifier l’échec**

Run: `npx vitest run src/lib/tests/variable-categories.test.ts`
Expected: FAIL — `Cannot find module '$lib/variable-categories'`.

- [ ] **Step 3 : Implémenter le module**

```ts
// src/lib/variable-categories.ts
export type CategoryKey =
	| 'temperature'
	| 'precipitation'
	| 'wind'
	| 'clouds'
	| 'pressure'
	| 'other';

export interface Category {
	key: CategoryKey;
	label: string;
	/** Nom d'icône Lucide (rendu via @lucide/svelte côté composant). */
	icon: string;
}

// Ordre = ordre d'affichage des onglets dans la barre haute / le dock.
export const CATEGORIES: Category[] = [
	{ key: 'temperature', label: 'Température', icon: 'thermometer' },
	{ key: 'precipitation', label: 'Précipitations', icon: 'cloud-rain' },
	{ key: 'wind', label: 'Vent', icon: 'wind' },
	{ key: 'clouds', label: 'Nuages', icon: 'cloud' },
	{ key: 'pressure', label: 'Pression / altitude', icon: 'gauge' },
	{ key: 'other', label: 'Autres', icon: 'layers' }
];

// Règles ordonnées : première correspondance gagne. Volontairement permissif
// (les variables Open-Meteo suivent des préfixes stables).
const RULES: { key: CategoryKey; test: RegExp }[] = [
	{ key: 'temperature', test: /^(temperature|apparent_temperature|dew_?point|wet_bulb)/ },
	{ key: 'precipitation', test: /(precipitation|rain|snow|showers|sleet)/ },
	{ key: 'wind', test: /(wind|gust)/ },
	{ key: 'clouds', test: /(cloud|visibility|fog)/ },
	{ key: 'pressure', test: /(pressure|geopotential|msl|surface_pressure)/ }
];

export function categorize(variable: string): CategoryKey {
	for (const rule of RULES) {
		if (rule.test.test(variable)) return rule.key;
	}
	return 'other';
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npx vitest run src/lib/tests/variable-categories.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/variable-categories.ts src/lib/tests/variable-categories.test.ts
git commit -m "feat(ui): module pur de catégorisation des variables"
```

### Task 2 : Module de partage (capture)

**Files:**

- Create: `src/lib/share.ts`
- Test: `src/lib/tests/share.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// src/lib/tests/share.test.ts
import { describe, expect, it, vi } from 'vitest';

import { canShareFiles, shareOrDownload } from '$lib/share';

function pngFile() {
	return new File([new Uint8Array([1, 2, 3])], 'carte.png', { type: 'image/png' });
}

describe('canShareFiles', () => {
	it('faux quand navigator.canShare absent', () => {
		expect(canShareFiles({} as Navigator, pngFile())).toBe(false);
	});

	it('vrai quand canShare accepte le fichier', () => {
		const nav = { canShare: () => true, share: vi.fn() } as unknown as Navigator;
		expect(canShareFiles(nav, pngFile())).toBe(true);
	});
});

describe('shareOrDownload', () => {
	it('utilise navigator.share quand disponible', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		const nav = { canShare: () => true, share } as unknown as Navigator;
		const download = vi.fn();
		const result = await shareOrDownload(nav, pngFile(), download);
		expect(share).toHaveBeenCalledOnce();
		expect(download).not.toHaveBeenCalled();
		expect(result).toBe('shared');
	});

	it('retombe sur le téléchargement sinon', async () => {
		const nav = {} as Navigator;
		const download = vi.fn();
		const result = await shareOrDownload(nav, pngFile(), download);
		expect(download).toHaveBeenCalledOnce();
		expect(result).toBe('downloaded');
	});

	it('retombe sur le téléchargement si l’utilisateur annule le partage', async () => {
		const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'));
		const nav = { canShare: () => true, share } as unknown as Navigator;
		const download = vi.fn();
		const result = await shareOrDownload(nav, pngFile(), download);
		// Abort = annulation volontaire : on ne télécharge PAS, on ne fait rien.
		expect(download).not.toHaveBeenCalled();
		expect(result).toBe('cancelled');
	});
});
```

- [ ] **Step 2 : Lancer le test, vérifier l’échec**

Run: `npx vitest run src/lib/tests/share.test.ts`
Expected: FAIL — `Cannot find module '$lib/share'`.

- [ ] **Step 3 : Implémenter le module**

```ts
// src/lib/share.ts
export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export function canShareFiles(nav: Navigator, file: File): boolean {
	const n = nav as Navigator & { canShare?: (data: ShareData) => boolean };
	return typeof n.canShare === 'function' && n.canShare({ files: [file] });
}

/**
 * Partage natif si possible, sinon téléchargement via le callback fourni.
 * Une annulation utilisateur (AbortError) ne déclenche aucun fallback.
 */
export async function shareOrDownload(
	nav: Navigator,
	file: File,
	download: (file: File) => void
): Promise<ShareResult> {
	if (canShareFiles(nav, file)) {
		try {
			await (nav as Navigator).share({ files: [file], title: 'Infoclimat — Modèles' });
			return 'shared';
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
			// autre erreur de partage → fallback download
		}
	}
	download(file);
	return 'downloaded';
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npx vitest run src/lib/tests/share.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/share.ts src/lib/tests/share.test.ts
git commit -m "feat(ui): module de partage capture (Web Share + fallback)"
```

### Task 3 : Composant scrim (contraste)

**Files:**

- Create: `src/lib/components/chrome/scrim.svelte`
- Modify: `src/routes/+page.svelte` (montage du scrim)

- [ ] **Step 1 : Créer le composant**

```svelte
<!-- src/lib/components/chrome/scrim.svelte -->
<!--
	Dégradés sombres haut/bas DERRIÈRE les panneaux verre.
	Garantit le contraste du texte blanc même sur une carte claire (critère AA).
	pointer-events:none → n'intercepte aucune interaction carte.
	Respecte prefers-reduced-motion (statique de toute façon).
-->
<div
	class="pointer-events-none fixed inset-x-0 top-0 z-40 h-24 bg-gradient-to-b from-black/30 to-transparent"
	aria-hidden="true"
></div>
<div
	class="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-28 bg-gradient-to-t from-black/35 to-transparent"
	aria-hidden="true"
></div>
```

- [ ] **Step 2 : Monter le scrim dans `+page.svelte`**

Dans `src/routes/+page.svelte`, ajouter l'import puis le composant juste après le `<div class="map ...">` (ligne ~278) :

```svelte
import Scrim from '$lib/components/chrome/scrim.svelte';
```

```svelte
<div class="map maplibregl-map" id="#map_container" bind:this={mapContainer}></div>
<Scrim />
```

- [ ] **Step 3 : Vérifier visuellement**

Run: `npm run dev`
Expected: la carte affiche un léger assombrissement en haut et en bas ; aucune interaction (pan/zoom/clic) bloquée. Tester en mode clair sur une zone de carte claire → les contrôles existants restent lisibles.

- [ ] **Step 4 : Typecheck + lint**

Run: `npm run check && npm run lint`
Expected: aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/components/chrome/scrim.svelte src/routes/+page.svelte
git commit -m "feat(ui): scrim de contraste pour le chrome verre"
```

---

## PHASE 2 — Couche essentielle (modèle · variables · légende · temps)

> Objectif : remplacer `SiteHeader` + `VariableSelection` par `TopBar` (desktop) / `MobileDock` (mobile) via `AppChrome`, et restyler `Scale` + `TimeSelector`. Les `IControl` (réglages/dark/help/clipping/hillshade/labels/départements) **restent en place** cette phase — le Settings sheet continue de fonctionner. App fonctionnelle.

### Task 4 : Sélecteur de modèle isolé

**Files:**

- Create: `src/lib/components/chrome/model-selector.svelte`

Extraire la logique du popover « domaine » de `src/lib/components/selection/variable-selection.svelte:162-259` dans un composant autonome, restylé verre. Le composant écrit `$domain` (store `variables`) exactement comme l'actuel.

- [ ] **Step 1 : Créer le composant**

```svelte
<!-- src/lib/components/chrome/model-selector.svelte -->
<script lang="ts">
	import { get } from 'svelte/store';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { type Domain, domainGroups, domainOptions } from '@openmeteo/weather-map-layer';

	import { domainSelectionOpen as dSO, domain, selectedDomain } from '$lib/stores/variables';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { DOMAIN_ALLOWLIST } from '$lib/constants';

	const visibleDomainOptions = domainOptions.filter((d: Domain) =>
		DOMAIN_ALLOWLIST.includes(d.value)
	);
	const visibleDomainGroups = domainGroups.filter((g) =>
		visibleDomainOptions.some((d) => d.value.startsWith(g.value))
	);

	let open = $state(get(dSO));
	dSO.subscribe((v) => (open = v));
</script>

<Popover.Root bind:open onOpenChange={(e) => dSO.set(e)}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class="bg-glass/50 hover:bg-glass/70 h-8 cursor-pointer justify-between gap-1.5 rounded-lg border border-white/20 px-3 text-white shadow-md backdrop-blur-md"
				role="combobox"
				aria-expanded={open}
				aria-label="Choisir le modèle météo"
			>
				<span class="truncate">{$selectedDomain?.label || 'Modèle…'}</span>
				<ChevronsUpDownIcon class="size-4 shrink-0 opacity-60" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="bg-glass/85 z-80 w-64 rounded-lg border-none p-0 backdrop-blur-md">
		<Command.Root class="bg-transparent">
			<Command.Input placeholder="Rechercher un modèle…" class="border-none ring-0" />
			<Command.List>
				<Command.Empty>Aucun modèle trouvé.</Command.Empty>
				{#each visibleDomainGroups as { value: group, label: groupLabel } (group)}
					<Command.Group heading={groupLabel}>
						{#each visibleDomainOptions as { value, label } (value)}
							{#if value.startsWith(group)}
								<Command.Item
									{value}
									class="hover:bg-primary/20 cursor-pointer"
									onSelect={() => {
										$domain = value;
										dSO.set(false);
									}}
								>
									<div class="flex w-full items-center justify-between">
										{label}
										<CheckIcon
											class="size-4 {$selectedDomain.value !== value ? 'text-transparent' : ''}"
										/>
									</div>
								</Command.Item>
							{/if}
						{/each}
					</Command.Group>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
```

- [ ] **Step 2 : Typecheck**

Run: `npm run check`
Expected: aucune erreur (composant pas encore monté, mais doit compiler).

- [ ] **Step 3 : Commit**

```bash
git add src/lib/components/chrome/model-selector.svelte
git commit -m "feat(ui): sélecteur de modèle isolé (style verre)"
```

### Task 5 : Onglets de variables imagés

**Files:**

- Create: `src/lib/components/chrome/variable-tabs.svelte`

Onglets par catégorie (de `CATEGORIES`) construits à partir de `$metaJson.variables`. Clic sur un onglet → sélectionne la 1re variable de cette catégorie (réutilise la logique `checkDefaultLevel` / `levelGroupSelected` de `variable-selection.svelte`). Un `＋` ouvre la liste catégorisée complète (popover desktop / sheet mobile) reprenant le `Command` existant. Le sous-sélecteur de niveau de pression (`variable-selection.svelte:395-480`) s'affiche quand `$levelGroupSelected` est défini.

- [ ] **Step 1 : Créer le composant** (squelette réel — l'exécutant complète la liste « ＋ » en réutilisant le bloc `Command` de `variable-selection.svelte`)

```svelte
<!-- src/lib/components/chrome/variable-tabs.svelte -->
<script lang="ts">
	import Icon from '@lucide/svelte/icons/thermometer';
	import { variableOptions } from '@openmeteo/weather-map-layer';

	import { metaJson } from '$lib/stores/time';
	import { selectedVariable, variable } from '$lib/stores/variables';

	import { translateVariableLabel } from '$lib/i18n/variables-fr';
	import { CATEGORIES, type CategoryKey, categorize } from '$lib/variable-categories';

	// Variables disponibles dans le modèle courant, groupées par catégorie.
	const byCategory = $derived.by(() => {
		const map = new Map<CategoryKey, string[]>();
		for (const c of CATEGORIES) map.set(c.key, []);
		for (const v of $metaJson?.variables ?? []) {
			if (v.includes('_v_') || v.includes('_direction')) continue; // composantes vent brutes
			map.get(categorize(v))!.push(v);
		}
		return map;
	});

	const activeCategory = $derived(categorize($selectedVariable?.value ?? ''));

	function pickCategory(key: CategoryKey) {
		const first = byCategory.get(key)?.[0];
		if (first) $variable = first;
	}
</script>

<div class="flex items-center gap-1" role="tablist" aria-label="Type de donnée">
	{#each CATEGORIES as cat (cat.key)}
		{#if (byCategory.get(cat.key)?.length ?? 0) > 0}
			<button
				type="button"
				role="tab"
				aria-selected={activeCategory === cat.key}
				onclick={() => pickCategory(cat.key)}
				class="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm text-white transition-colors {activeCategory ===
				cat.key
					? 'bg-white/25 font-semibold ring-1 ring-white/30'
					: 'opacity-80 hover:bg-white/15'}"
			>
				<span class="truncate">{cat.label}</span>
			</button>
		{/if}
	{/each}
	<!-- ＋ : liste catégorisée complète (réutiliser le bloc Command de variable-selection.svelte) -->
	<!-- + sous-sélecteur de niveau de pression quand $levelGroupSelected est défini -->
</div>
```

> **Note exécution :** le bouton `＋` doit ouvrir un `Popover` (desktop) / `Sheet` (mobile) contenant le composant `Command` exact de `variable-selection.svelte:330-393` (liste plate des variables avec `translateVariableLabel`) et le sous-sélecteur de niveau `variable-selection.svelte:395-480`. Importer l'icône Lucide par catégorie via `cat.icon` (mapping dynamique `@lucide/svelte/icons/<icon>`), pas d'emoji.

- [ ] **Step 2 : Typecheck**

Run: `npm run check`
Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/components/chrome/variable-tabs.svelte
git commit -m "feat(ui): onglets de variables imagés par catégorie"
```

### Task 6 : TopBar (desktop) et MobileDock (mobile)

**Files:**

- Create: `src/lib/components/chrome/top-bar.svelte`
- Create: `src/lib/components/chrome/mobile-dock.svelte`
- Create: `src/lib/components/chrome/app-chrome.svelte`

- [ ] **Step 1 : Créer `top-bar.svelte`** (logo + modèle + onglets + slots capture/avancé)

```svelte
<!-- src/lib/components/chrome/top-bar.svelte -->
<script lang="ts">
	import ModelSelector from './model-selector.svelte';
	import VariableTabs from './variable-tabs.svelte';

	import type { Snippet } from 'svelte';

	interface Props {
		capture?: Snippet;
		advanced?: Snippet;
	}
	let { capture, advanced }: Props = $props();

	const SITE_URL = 'https://www.infoclimat.fr';
	const LOGO_URL = 'https://static.infoclimat.net/images/v5.1/logo_IC_5.1.png';
</script>

<div
	class="bg-glass/45 fixed inset-x-2.5 top-2.5 z-60 flex h-12 items-center gap-2.5 rounded-xl border border-white/15 px-3 shadow-lg backdrop-blur-md"
>
	<a href={SITE_URL} title="Infoclimat" rel="noopener" class="shrink-0">
		<img src={LOGO_URL} alt="Infoclimat" class="h-6 w-auto" crossorigin="anonymous" />
	</a>
	<ModelSelector />
	<div class="h-5 w-px bg-white/20"></div>
	<VariableTabs />
	<div class="ml-auto flex items-center gap-2">
		{@render capture?.()}
		{@render advanced?.()}
	</div>
</div>
```

- [ ] **Step 2 : Créer `mobile-dock.svelte`** (pastille modèle haut + dock bas variables ; le temps reste rendu par `TimeSelector`, la capture FAB et `•••` passés en slots)

```svelte
<!-- src/lib/components/chrome/mobile-dock.svelte -->
<script lang="ts">
	import ModelSelector from './model-selector.svelte';
	import VariableTabs from './variable-tabs.svelte';

	import type { Snippet } from 'svelte';

	interface Props {
		capture?: Snippet;
		advanced?: Snippet;
	}
	let { capture, advanced }: Props = $props();
</script>

<!-- Pastille modèle, haut centre -->
<div class="fixed inset-x-0 top-2.5 z-60 flex justify-center">
	<ModelSelector />
</div>

<!-- FAB capture, côté pouce, au-dessus du dock -->
<div class="fixed bottom-32 right-2.5 z-60">
	{@render capture?.()}
</div>

<!-- Dock bas : onglets variables défilants + accès avancé -->
<div
	class="bg-glass/45 fixed inset-x-2.5 bottom-2.5 z-60 flex items-center gap-2 overflow-x-auto rounded-xl border border-white/15 px-3 py-2 shadow-lg backdrop-blur-md"
>
	<VariableTabs />
	<div class="ml-auto shrink-0">{@render advanced?.()}</div>
</div>
```

> **Note exécution :** la barre de temps mobile reste celle de `TimeSelector` (restylée en Task 8). Le dock variables se place au-dessus d'elle ; ajuster `bottom-*` pour ne pas se chevaucher (la légende mobile se positionne déjà à `bottom-22.5`, cf. `scale.svelte:135`).

- [ ] **Step 3 : Créer `app-chrome.svelte`** (bascule responsive via le store `desktop`)

```svelte
<!-- src/lib/components/chrome/app-chrome.svelte -->
<script lang="ts">
	import { desktop } from '$lib/stores/preferences';

	import CaptureFlow from '$lib/components/capture/capture-flow.svelte';

	import AdvancedPanel from './advanced-panel.svelte';
	import MobileDock from './mobile-dock.svelte';
	import TopBar from './top-bar.svelte';
</script>

{#if desktop.current}
	<TopBar>
		{#snippet capture()}<CaptureFlow />{/snippet}
		{#snippet advanced()}<AdvancedPanel />{/snippet}
	</TopBar>
{:else}
	<MobileDock>
		{#snippet capture()}<CaptureFlow variant="fab" />{/snippet}
		{#snippet advanced()}<AdvancedPanel />{/snippet}
	</MobileDock>
{/if}
```

> **Note exécution :** `CaptureFlow` et `AdvancedPanel` sont créés en Phases 4 et 3. Pour que la Phase 2 compile et tourne **avant** ces phases, créer d'abord des **stubs** minimaux (un `<button>` vide chacun) puis les enrichir dans leur phase dédiée. Le stub `advanced-panel.svelte` peut, en Phase 2, simplement déclencher le `sheet` existant : `import { sheet } from '$lib/stores/preferences'` + bouton « ⚙ » qui fait `sheet.set(true)` — ainsi les réglages restent accessibles via le Sheet actuel jusqu'à la Phase 3.

- [ ] **Step 4 : Créer les stubs `advanced-panel.svelte` et `capture-flow.svelte`**

```svelte
<!-- src/lib/components/chrome/advanced-panel.svelte (STUB Phase 2) -->
<script lang="ts">
	import SettingsIcon from '@lucide/svelte/icons/settings-2';

	import { sheet } from '$lib/stores/preferences';
</script>

<button
	type="button"
	onclick={() => sheet.set(true)}
	aria-label="Calques et réglages"
	class="bg-glass/40 hover:bg-glass/60 flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 px-2.5 text-sm text-white backdrop-blur-md"
>
	<SettingsIcon class="size-4" />
	<span class="hidden sm:inline">Calques &amp; réglages</span>
</button>
```

```svelte
<!-- src/lib/components/capture/capture-flow.svelte (STUB Phase 2) -->
<script lang="ts">
	import CameraIcon from '@lucide/svelte/icons/camera';

	import { exportFrameVisible } from '$lib/stores/preferences';

	interface Props {
		variant?: 'bar' | 'fab';
	}
	let { variant = 'bar' }: Props = $props();
</script>

{#if variant === 'fab'}
	<button
		type="button"
		onclick={() => exportFrameVisible.set(true)}
		aria-label="Capturer la carte"
		class="bg-primary flex size-11 cursor-pointer items-center justify-center rounded-full text-white shadow-lg ring-1 ring-white/20"
	>
		<CameraIcon class="size-5" />
	</button>
{:else}
	<button
		type="button"
		onclick={() => exportFrameVisible.set(true)}
		aria-label="Capturer la carte"
		class="bg-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white shadow-md ring-1 ring-white/20"
	>
		<CameraIcon class="size-4" /> Capturer
	</button>
{/if}
```

- [ ] **Step 5 : Typecheck**

Run: `npm run check`
Expected: aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/components/chrome/ src/lib/components/capture/
git commit -m "feat(ui): TopBar, MobileDock, AppChrome + stubs avancé/capture"
```

### Task 7 : Brancher AppChrome dans +page.svelte (remplacer SiteHeader + VariableSelection)

**Files:**

- Modify: `src/routes/+page.svelte`

- [ ] **Step 1 : Remplacer les imports et le montage**

Dans `src/routes/+page.svelte` : retirer les imports `SiteHeader` et `VariableSelection`, ajouter `AppChrome`. Dans le markup (lignes ~339-341), remplacer :

```svelte
<SiteHeader />
<Scale />
<VariableSelection />
```

par :

```svelte
<AppChrome />
<Scale />
```

Import à ajouter (selon l'ordre prettier — lancer `npm run format` ensuite) :

```svelte
import AppChrome from '$lib/components/chrome/app-chrome.svelte';
```

- [ ] **Step 2 : Vérifier visuellement desktop + mobile**

Run: `npm run dev`
Expected (desktop ≥768px) : barre haute verre avec logo, modèle, onglets variables, bouton Capturer, bouton « Calques & réglages » (ouvre le Sheet actuel). Changer de modèle/variable met bien à jour la carte. (mobile <768px, via devtools 375px) : pastille modèle en haut, dock variables + FAB capture en bas.

- [ ] **Step 3 : Format + check + lint + tests**

Run: `npm run format && npm run check && npm run lint && npm run test -- --run`
Expected: aucune erreur ; tests verts.

- [ ] **Step 4 : Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(ui): brancher AppChrome (remplace SiteHeader + VariableSelection)"
```

### Task 8 : Restyle légende + barre de temps

**Files:**

- Modify: `src/lib/components/scale/scale.svelte`
- Modify: `src/lib/components/time/time-selector.svelte`

- [ ] **Step 1 : Harmoniser le style verre de la légende**

Dans `scale.svelte`, aligner les opacités/rayons sur le nouveau chrome : remplacer `bg-glass/30`/`bg-glass/75` par `bg-glass/45` + `backdrop-blur-md` + `rounded-lg`, conserver la logique de positionnement (`bottom-22.5` mobile / `bottom-2.5` desktop) et toute la logique de couleurs inchangée. Ne PAS modifier le JS du composant.

- [ ] **Step 2 : Harmoniser le style verre de la barre de temps**

Dans `time-selector.svelte`, appliquer `bg-glass/45 backdrop-blur-md rounded-xl border border-white/15` au conteneur principal, sans toucher à la logique de scrubbing / `bottomChromeHeight` / playback.

- [ ] **Step 3 : Vérifier visuellement**

Run: `npm run dev`
Expected: légende et barre de temps cohérentes avec la barre haute (même verre, mêmes rayons). Contraste OK grâce au scrim.

- [ ] **Step 4 : check + lint**

Run: `npm run check && npm run lint`
Expected: aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/components/scale/scale.svelte src/lib/components/time/time-selector.svelte
git commit -m "style(ui): harmoniser légende + barre de temps au chrome verre"
```

---

## PHASE 3 — Panneau avancé (Calques / Réglages / Outils) + conversion IControl

> Objectif : remplacer le stub `advanced-panel.svelte` par le vrai panneau (rail droit desktop / feuille mobile) regroupant les composants `settings/*` + les ex-`IControl` convertis en toggles. Retirer les `addControl(...)` de `+page.svelte` et supprimer les classes devenues mortes dans `buttons/index.ts`.

### Task 9 : Composant de ligne toggle réutilisable

**Files:**

- Create: `src/lib/components/chrome/layer-toggle.svelte`

- [ ] **Step 1 : Créer le composant**

```svelte
<!-- src/lib/components/chrome/layer-toggle.svelte -->
<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';

	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		checked: boolean;
		onCheckedChange: (v: boolean) => void;
		icon?: Snippet;
	}
	let { label, checked, onCheckedChange, icon }: Props = $props();
</script>

<label class="flex cursor-pointer items-center justify-between gap-3 py-1.5">
	<span class="flex items-center gap-2 text-sm">
		{@render icon?.()}
		{label}
	</span>
	<Switch {checked} {onCheckedChange} aria-label={label} />
</label>
```

- [ ] **Step 2 : check**

Run: `npm run check`
Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/components/chrome/layer-toggle.svelte
git commit -m "feat(ui): composant LayerToggle réutilisable"
```

### Task 10 : Convertir les ex-IControl en toggles store

**Files:**

- Modify: `src/lib/components/chrome/advanced-panel.svelte`
- Référence (logique à reprendre) : `src/lib/components/buttons/index.ts`

Reprendre la logique de chaque `IControl` (mêmes stores, mêmes effets) en toggles :

- **Relief (hillshade)** : `preferences.hillshade` + `addHillshadeLayer()` / removeLayer + TerrainControl. Reprendre exactement `HillshadeButton.onAdd` (`buttons/index.ts:70-152`) dans une fonction `toggleHillshade(next)`.
- **Valeurs (labels)** : `showLabels` + `updateUrl('labels', …)` (cf. `:176-208`).
- **Départements** : `showDepartments` + `updateUrl('departments', …)` (cf. `:210-242`).
- **Mode sombre** : `mode`/`setMode` + `reloadStyles()` (cf. `:40-68`).
- **Découpe pays (clipping)** : `clippingPanelOpen.set(!open)` (cf. `:244-297`) — reste dans « Outils ».
- **Aide** : `helpOpen.set(true)` (cf. `:155-174`) — « Outils ».

- [ ] **Step 1 : Écrire le vrai `advanced-panel.svelte`**

Structure (rail desktop / feuille mobile via store `desktop`), 3 sections. Réutiliser les composants settings existants pour les blocs non-toggle :

```svelte
<!-- src/lib/components/chrome/advanced-panel.svelte -->
<script lang="ts">
	import { get } from 'svelte/store';

	import { mode, setMode } from 'mode-watcher';

	import { clippingPanelOpen } from '$lib/stores/clipping';
	import { DEFAULT_SHOW_DEPARTMENTS, showDepartments } from '$lib/stores/departments';
	import { DEFAULT_SHOW_LABELS, showLabels } from '$lib/stores/labels';
	import { advancedOpen, desktop, helpOpen, preferences } from '$lib/stores/preferences';

	import SecondaryLayerPanel from '$lib/components/secondary-layer/secondary-layer-panel.svelte';
	import ArrowsSettings from '$lib/components/settings/arrows-settings.svelte';
	import CacheSettings from '$lib/components/settings/cache-settings.svelte';
	import ContourSettings from '$lib/components/settings/contour-settings.svelte';
	import GridSettings from '$lib/components/settings/grid-settings.svelte';
	import OpacitySetting from '$lib/components/settings/opacity-setting.svelte';
	import PopupSettings from '$lib/components/settings/popup-settings.svelte';
	import SoundingSettings from '$lib/components/settings/sounding-settings.svelte';
	import StateSettings from '$lib/components/settings/state-settings.svelte';
	import TileSizeSettings from '$lib/components/settings/tile-size-settings.svelte';
	import UnitSettings from '$lib/components/settings/unit-settings.svelte';
	import * as Sheet from '$lib/components/ui/sheet';
	import WindOverlayPanel from '$lib/components/wind-overlay/wind-overlay-panel.svelte';

	import { addHillshadeLayer, reloadStyles } from '$lib/map-controls';
	import { updateUrl } from '$lib/url';

	import LayerToggle from './layer-toggle.svelte';

	function toggleLabels(next: boolean) {
		showLabels.set(next);
		updateUrl('labels', String(next), String(DEFAULT_SHOW_LABELS));
	}
	function toggleDepartments(next: boolean) {
		showDepartments.set(next);
		updateUrl('departments', String(next), String(DEFAULT_SHOW_DEPARTMENTS));
	}
	function toggleDark(next: boolean) {
		setMode(next ? 'dark' : 'light');
		reloadStyles();
	}
	// hillshade : reprendre la logique complète de HillshadeButton (terrain).
</script>

{#snippet body()}
	<section>
		<h4 class="text-muted-foreground mb-1 text-xs font-semibold uppercase">Calques carte</h4>
		<WindOverlayPanel />
		<ArrowsSettings />
		<ContourSettings />
		<LayerToggle
			label="Valeurs sur la carte"
			checked={$showLabels}
			onCheckedChange={toggleLabels}
		/>
		<LayerToggle
			label="Départements"
			checked={$showDepartments}
			onCheckedChange={toggleDepartments}
		/>
		<LayerToggle
			label="Relief ombré"
			checked={$preferences.hillshade}
			onCheckedChange={(v) => {
				/* toggleHillshade */
			}}
		/>
		<SecondaryLayerPanel />
		<OpacitySetting />
	</section>
	<section>
		<h4 class="text-muted-foreground mb-1 mt-4 text-xs font-semibold uppercase">Réglages</h4>
		<UnitSettings />
		<GridSettings />
		<PopupSettings />
		<TileSizeSettings />
		<SoundingSettings />
		<LayerToggle
			label="Mode sombre"
			checked={mode.current === 'dark'}
			onCheckedChange={toggleDark}
		/>
		<CacheSettings />
		<StateSettings />
	</section>
	<section>
		<h4 class="text-muted-foreground mb-1 mt-4 text-xs font-semibold uppercase">Outils</h4>
		<button
			type="button"
			class="py-1.5 text-sm"
			onclick={() => clippingPanelOpen.set(!get(clippingPanelOpen))}>✂ Découpe pays</button
		>
		<button type="button" class="py-1.5 text-sm" onclick={() => helpOpen.set(true)}>Aide</button>
	</section>
{/snippet}

{#if desktop.current}
	{#if $advancedOpen}
		<aside
			class="bg-glass/55 fixed right-2.5 top-16 z-60 max-h-[80vh] w-64 overflow-y-auto rounded-xl border border-white/15 p-3 text-white shadow-lg backdrop-blur-md"
		>
			{@render body()}
		</aside>
	{/if}
{:else}
	<Sheet.Root bind:open={$advancedOpen}>
		<Sheet.Content side="bottom" class="bg-glass/85 max-h-[85vh] overflow-y-auto backdrop-blur-md">
			<div class="p-4">{@render body()}</div>
		</Sheet.Content>
	</Sheet.Root>
{/if}
```

> **Note exécution :** ajouter un store `advancedOpen = writable(false)` dans `preferences.ts` (remplace l'usage de `sheet` pour le nouveau panneau). Le déclencheur (bouton « Calques & réglages » / « ••• ») bascule `advancedOpen`. Reprendre **intégralement** la logique terrain de `HillshadeButton` pour `toggleHillshade` (ne pas simplifier). Conserver l'ordre de montage : le hillshade dépend du style chargé (`map.once('styledata', …)`).

- [ ] **Step 2 : Ajouter le store `advancedOpen`**

Dans `src/lib/stores/preferences.ts`, après `export const sheet = writable(false);` :

```ts
export const advancedOpen = writable(false);
```

- [ ] **Step 3 : Câbler le déclencheur**

Mettre à jour `top-bar.svelte` / `mobile-dock.svelte` pour que le bouton avancé bascule `advancedOpen` (au lieu du stub `sheet`). Le stub `advanced-panel.svelte` de Phase 2 est entièrement remplacé.

- [ ] **Step 4 : Vérifier visuellement**

Run: `npm run dev`
Expected: desktop → rail droit s'ouvre/ferme ; tous les toggles (vent, flèches, contours, valeurs, départements, relief, opacité) agissent sur la carte comme avant. Réglages (unités, grille, popup, qualité, sondage, mode sombre, cache, réinitialiser) fonctionnels. mobile → feuille bas équivalente.

- [ ] **Step 5 : check + lint + tests**

Run: `npm run check && npm run lint && npm run test -- --run`
Expected: aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/components/chrome/advanced-panel.svelte src/lib/stores/preferences.ts src/lib/components/chrome/top-bar.svelte src/lib/components/chrome/mobile-dock.svelte
git commit -m "feat(ui): panneau avancé Calques/Réglages/Outils (rail + feuille)"
```

### Task 11 : Retirer les addControl + supprimer les IControl morts + ancien Settings sheet

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/buttons/index.ts`
- Modify: `src/lib/components/settings/settings.svelte` (suppression du montage)

- [ ] **Step 1 : Retirer les addControl dans `+page.svelte`**

Supprimer dans le bloc `$map.on('load', …)` (lignes ~133-144) les appels :
`$map.addControl(new DarkModeButton())`, `new SettingsButton()`, `new HelpButton()`, `new ClippingButton()`, `new HillshadeButton()`, `new LabelsButton()`, `new DepartmentsButton()`.
Retirer aussi l'import des boutons (ligne ~37-45) et le composant `<Settings />` (ligne ~344) ainsi que son import.

> **Garde-fou :** la logique hillshade/terrain qui était dans `HillshadeButton` doit déjà vivre dans `advanced-panel.svelte` (Task 10) AVANT cette suppression. Vérifier que `addTerrainSource` (toujours appelé lignes ~140-141) reste en place.

- [ ] **Step 2 : Supprimer les classes mortes dans `buttons/index.ts`**

Supprimer `SettingsButton`, `DarkModeButton`, `HelpButton`, `LabelsButton`, `DepartmentsButton`, `ClippingButton` et `HillshadeButton` une fois leur logique migrée. Si le fichier devient vide, le supprimer et nettoyer `buttons/index.ts` réexports.

- [ ] **Step 3 : Vérifier visuellement (régression complète)**

Run: `npm run dev`
Expected: aucun bouton MapLibre empilé à droite ; toutes les fonctions accessibles via le nouveau chrome ; hillshade + terrain OK ; clipping OK ; aide OK ; dark mode OK.

- [ ] **Step 4 : check + lint + tests + build**

Run: `npm run check && npm run lint && npm run test -- --run && npm run build`
Expected: build statique réussi.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "refactor(ui): retirer les IControl MapLibre au profit du chrome Svelte"
```

---

## PHASE 4 — Capture → partage

### Task 12 : Flux capture complet avec partage

**Files:**

- Modify: `src/lib/components/capture/capture-flow.svelte`
- Référence : `src/lib/png-export.ts`, `src/lib/share.ts`, store `exportFrameVisible`

- [ ] **Step 1 : Remplacer le stub par le flux complet**

Le bouton ouvre le cadrage (`exportFrameVisible.set(true)`). Une fois cadré, l'action « Exporter » appelle `captureWatermarkedPng(map, details, 'square')` (réel, `png-export.ts:226`) pour produire le `Blob` PNG carré filigrané, le convertit en `File`, puis appelle `shareOrDownload(navigator, file, downloadFn)`. Le fallback download réutilise `downloadBlob` (`png-export.ts:385`).

```svelte
<!-- src/lib/components/capture/capture-flow.svelte (extrait logique) -->
<script lang="ts">
	import { get } from 'svelte/store';

	import CameraIcon from '@lucide/svelte/icons/camera';
	import { toast } from 'svelte-sonner';

	import { map } from '$lib/stores/map';
	import { exportFrameVisible } from '$lib/stores/preferences';

	import { captureWatermarkedPng, downloadBlob } from '$lib/png-export';
	import { shareOrDownload } from '$lib/share';

	interface Props {
		variant?: 'bar' | 'fab';
	}
	let { variant = 'bar' }: Props = $props();

	async function capture() {
		const m = get(map);
		if (!m) return;
		try {
			// `details` (PngWatermarkDetails) : construire IDENTIQUEMENT à playback-panel.svelte
			// (modèle, variable, échéance, légende). Voir playback-panel.svelte:64 + :393.
			const details = buildWatermarkDetails(); // helper à reprendre de playback-panel
			const blob = await captureWatermarkedPng(m, details, 'square');
			const filename = 'infoclimat-modele.png';
			const file = new File([blob], filename, { type: 'image/png' });
			const result = await shareOrDownload(navigator, file, (f) => downloadBlob(blob, f.name));
			if (result === 'downloaded') toast('Image téléchargée');
			exportFrameVisible.set(false);
		} catch (e) {
			toast.error('La capture a échoué. Réessayer.');
		}
	}
</script>
```

> **Note exécution :** la construction de `details: PngWatermarkDetails` existe déjà dans `playback-panel.svelte` (import ligne 64, usage `exportPngArchive` ligne 393). **Extraire cette construction dans un helper partagé** (ex. `src/lib/png-export.ts` ou un petit module) et l'appeler depuis les deux endroits (DRY) — c'est une retouche moteur opportuniste légitime. Conserver le filigrane Infoclimat. Le déclencheur « Exporter » final est rendu dans l'overlay de cadrage de `+page.svelte` (lignes ~280-336) et appelle `capture()`.

- [ ] **Step 2 : Vérifier visuellement (desktop + mobile)**

Run: `npm run dev`
Expected: clic Capturer → cadre carré → export → desktop : téléchargement + toast ; mobile (si Web Share dispo) : feuille de partage native. Annulation du partage = aucun téléchargement parasite.

- [ ] **Step 3 : check + lint + tests**

Run: `npm run check && npm run lint && npm run test -- --run`
Expected: aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/components/capture/capture-flow.svelte src/routes/+page.svelte
git commit -m "feat(ui): flux capture → partage (Web Share + fallback download)"
```

---

## PHASE 5 — Polish (animations, a11y, contraste, parité dark)

### Task 13 : Transitions et reduced-motion

**Files:**

- Modify: composants `chrome/*` (ajout transitions)
- Modify: `src/styles.css` (au besoin, classe utilitaire reduced-motion)

- [ ] **Step 1 : Ajouter des transitions 150–300 ms**

Ouverture rail/feuille, hover des onglets, press du FAB capture (`scale-95` à l'appui). Utiliser les transitions Svelte (`fade`/`fly`) ou classes Tailwind `transition-* duration-200 ease-out`.

- [ ] **Step 2 : Respecter `prefers-reduced-motion`**

Envelopper les animations conditionnellement (`MediaQuery('(prefers-reduced-motion: reduce)')`) ou via CSS `@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }` ciblé sur le chrome.

- [ ] **Step 3 : Vérifier**

Run: `npm run dev` puis activer « réduire les animations » dans l'OS/devtools.
Expected: aucune animation parasite ; ouverture instantanée.

- [ ] **Step 4 : Commit**

```bash
git add -A
git commit -m "polish(ui): transitions 150-300ms + prefers-reduced-motion"
```

### Task 14 : Audit accessibilité + contraste + parité dark

**Files:**

- Modify: composants `chrome/*` (aria-labels, focus, contraste)

- [ ] **Step 1 : Vérifier les critères**

- Tous les boutons icône-seule ont un `aria-label` (modèle, onglets, capture, avancé, toggles).
- Focus visible au clavier (anneau) sur tous les contrôles ; ordre de tabulation logique.
- Touch targets ≥ 44 px sur mobile (onglets dock, FAB, `•••`).
- Contraste texte/contrôles ≥ 4.5:1 en mode clair **et** sombre sur fond de carte clair (scrim). Vérifier avec un outil de contraste.
- Mode sombre : ouvrir le chrome en dark, contrôler lisibilité indépendamment du clair.

- [ ] **Step 2 : Corriger les écarts** relevés (opacités scrim, tailles de cible, labels manquants).

- [ ] **Step 3 : Vérification finale complète**

Run: `npm run check && npm run lint && npm run test -- --run && npm run build`
Expected: tout vert, build OK. Tester manuellement à 375 px, 768 px, 1024 px, 1440 px + paysage mobile.

- [ ] **Step 4 : Commit**

```bash
git add -A
git commit -m "polish(ui): accessibilité, contraste AA, parité mode sombre"
```

---

## Self-Review (couverture spec)

- Progressive disclosure → Phases 2 (essentiel visible) + 3 (avancé déplié). ✓
- Couche essentielle (variable/temps/légende/modèle) → Tasks 4-8. ✓
- Barre haute desktop + rail → Tasks 6, 10. ✓
- Dock mobile + feuille → Tasks 6, 10. ✓
- Verre dépoli + scrim contraste → Tasks 3, 6, 8, 14. ✓
- Onglets variables imagés + ＋ + niveaux pression → Task 5. ✓
- Migration 12 réglages → 3 familles → Task 10. ✓
- Conversion IControl → Tasks 10-11. ✓
- Capture 1er niveau + partage → Tasks 2, 12. ✓
- Catégories variables → Task 1. ✓
- Tests purs (Vitest) → Tasks 1, 2. ✓
- Polish anim/a11y/dark → Tasks 13-14. ✓
- Moteur préservé → aucune task ne modifie `slot-manager`/`layers`/`om`/`sounding`/`playback`. ✓

**Risques rappelés :** (1) construction de `PngWatermarkDetails` à extraire de `playback-panel.svelte` (DRY) pour la Task 12 ; (2) logique terrain de `HillshadeButton` à reprendre intégralement (Task 10) avant suppression (Task 11) ; (3) chevauchement vertical dock mobile / légende / barre de temps à ajuster (Task 6/8).
