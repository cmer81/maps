# Sélecteur de modèles « made in France » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ordonner, regrouper et renommer le sélecteur de modèles (`model-selector.svelte`) pour mettre les modèles français en tête, exactement comme spécifié dans l'issue #48.

**Architecture:** Une table locale `MODEL_SELECTOR_GROUPS` (dans `constants.ts`) devient l'unique source de vérité (domaines × ordre × groupe × libellé). `DOMAIN_ALLOWLIST` en est dérivé. Une fonction `applyModelSelectorLabels()` aligne les libellés de `domainOptions` (cohérence bouton ↔ liste). Le composant itère la table au lieu du couple `domainGroups`/`startsWith` du package.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest, `@openmeteo/weather-map-layer`.

Spec : `docs/superpowers/specs/2026-06-06-model-selector-france-first-design.md`

---

## File Structure

- **Modify** `src/lib/constants.ts` — remplace le littéral `DOMAIN_ALLOWLIST` par `MODEL_SELECTOR_GROUPS` + dérivation ; ajoute la mention émagramme à `MODEL_DESCRIPTIONS`.
- **Create** `src/lib/model-selector-labels.ts` — `applyModelSelectorLabels()` aligne `domainOptions`.
- **Modify** `src/lib/stores/variables.ts` — appelle `applyModelSelectorLabels()` après les `register*Domain()`.
- **Modify** `src/lib/components/chrome/model-selector.svelte` — itère `MODEL_SELECTOR_GROUPS`.
- **Create** `src/lib/tests/model-selector-groups.test.ts` — couvre dérivation + libellés.
- **Modify** `.claude/rules/architecture.md` — note la dérivation et l'abandon de `startsWith`.

Les `register*Domain()` conservent leurs `domainGroups.push(...)` actuels (inoffensifs, encore couverts par leurs tests) ; le sélecteur les ignore désormais.

---

### Task 1: Table d'ordre + allowlist dérivée + description émagramme

**Files:**
- Modify: `src/lib/constants.ts` (bloc `DOMAIN_ALLOWLIST` L177-234 ; `MODEL_DESCRIPTIONS` L247)
- Test: `src/lib/tests/model-selector-groups.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/tests/model-selector-groups.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { DOMAIN_ALLOWLIST, MODEL_SELECTOR_GROUPS } from '$lib/constants';

const EXPECTED_ORDER = [
	'meteofrance_arome_france_hd',
	'arome_france',
	'arome_france_convection',
	'arome_om_reunion',
	'arome_om_antilles',
	'arome_om_guyane',
	'arome_om_polynesie',
	'arome_om_ncaledonie',
	'meteofrance_arpege_europe',
	'meteofrance_arpege_world025',
	'dwd_icon_eu',
	'dwd_icon_d2',
	'ecmwf_ifs025',
	'ecmwf_ifs',
	'ecmwf_aifs025_single',
	'ncep_gfs025',
	'anomaly_europe'
];

describe('MODEL_SELECTOR_GROUPS', () => {
	it('met les groupes français en tête, dans l’ordre attendu', () => {
		expect(MODEL_SELECTOR_GROUPS.map((g) => g.label)).toEqual([
			'Météo-France Arome',
			'Météo-France Arpège',
			'DWD Germany',
			'ECMWF',
			'NOAA US',
			'Anomalie'
		]);
	});

	it('aplatit dans l’ordre cible exact', () => {
		const flat = MODEL_SELECTOR_GROUPS.flatMap((g) => g.domains.map((d) => d.value));
		expect(flat).toEqual(EXPECTED_ORDER);
	});

	it('DOMAIN_ALLOWLIST est dérivé de la table, sans doublon', () => {
		expect([...DOMAIN_ALLOWLIST]).toEqual(EXPECTED_ORDER);
		expect(new Set(DOMAIN_ALLOWLIST).size).toBe(DOMAIN_ALLOWLIST.length);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/lib/tests/model-selector-groups.test.ts`
Expected: FAIL — `MODEL_SELECTOR_GROUPS` n'est pas exporté (import `undefined`).

- [ ] **Step 3: Implémenter la table et dériver l'allowlist**

Dans `src/lib/constants.ts`, **remplacer** tout le bloc `export const DOMAIN_ALLOWLIST: readonly string[] = [ … ];` (L177-234) par :

```ts
/** Source unique du sélecteur de modèles : ordre des groupes, ordre des modèles,
 *  groupe d'appartenance et libellé affiché. Privilégie les modèles français en tête
 *  (issue #48). Remplace l'ancien mécanisme de regroupement par préfixe
 *  (`domain.value.startsWith(group.value)`) du package, incapable de fusionner sous
 *  un même groupe des domaines aux préfixes hétérogènes (AROME HD / France / OM).
 *
 *  Les pseudo-domaines servis depuis le bucket R2 (`anomaly_europe`, `arome_*`) ne
 *  sont enregistrés dans `domainOptions` que si le bucket est configuré ; le sélecteur
 *  saute ceux absents (cf. `model-selector.svelte`). */
export const MODEL_SELECTOR_GROUPS: readonly {
	label: string;
	domains: readonly { value: string; label: string }[];
}[] = [
	{
		label: 'Météo-France Arome',
		domains: [
			{ value: 'meteofrance_arome_france_hd', label: 'Arome France HD' },
			{ value: AROME_FRANCE_DOMAIN, label: 'Arome France 2.5' },
			{ value: AROME_FRANCE_CONVECTION_DOMAIN, label: 'Arome France Convection' },
			{ value: AROME_OM_REUNION_DOMAIN, label: 'Arome OM Réunion-Mayotte' },
			{ value: AROME_OM_ANTILLES_DOMAIN, label: 'Arome OM Antilles' },
			{ value: AROME_OM_GUYANE_DOMAIN, label: 'Arome OM Guyane' },
			{ value: AROME_OM_POLYNESIE_DOMAIN, label: 'Arome OM Polynésie' },
			{ value: AROME_OM_NCALEDONIE_DOMAIN, label: 'Arome OM Nouvelle-Calédonie' }
		]
	},
	{
		label: 'Météo-France Arpège',
		domains: [
			{ value: 'meteofrance_arpege_europe', label: 'Arpège Europe' },
			{ value: 'meteofrance_arpege_world025', label: 'Arpège Monde' }
		]
	},
	{
		label: 'DWD Germany',
		domains: [
			{ value: 'dwd_icon_eu', label: 'DWD ICON EU' },
			{ value: 'dwd_icon_d2', label: 'DWD ICON D2' }
		]
	},
	{
		label: 'ECMWF',
		domains: [
			{ value: 'ecmwf_ifs025', label: 'ECMWF IFS 0.25' },
			{ value: 'ecmwf_ifs', label: 'ECMWF IFS HRES' },
			{ value: 'ecmwf_aifs025_single', label: 'ECMWF AIFS 0.25' }
		]
	},
	{
		label: 'NOAA US',
		domains: [{ value: 'ncep_gfs025', label: 'GFS Global 0.25' }]
	},
	{
		label: 'Anomalie',
		domains: [{ value: ANOMALY_DOMAIN, label: 'Anomalie T°C (Europe ERA/Arpège)' }]
	}
];

/** Domaines visibles dans le sélecteur, dérivés de `MODEL_SELECTOR_GROUPS` (aplatissement
 *  dans l'ordre d'affichage). Display-only : filtre le sélecteur sans bloquer le routing
 *  — une URL partagée ciblant un domaine non listé résout toujours (le reste de l'app lit
 *  `domainOptions` non filtré). */
export const DOMAIN_ALLOWLIST: readonly string[] = MODEL_SELECTOR_GROUPS.flatMap((g) =>
	g.domains.map((d) => d.value)
);
```

Note : `AROME_FRANCE_DOMAIN`, `AROME_FRANCE_CONVECTION_DOMAIN`, `AROME_OM_*_DOMAIN`, `ANOMALY_DOMAIN` sont déjà définis plus haut dans le même fichier (L7-44) ; les littéraux `meteofrance_*`, `dwd_*`, `ecmwf_*`, `ncep_gfs025` sont des domaines du package sans constante locale.

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/lib/tests/model-selector-groups.test.ts`
Expected: PASS (3 tests verts).

- [ ] **Step 5: Ajouter la mention émagramme à la description AROME France 2.5**

Dans `src/lib/constants.ts`, `MODEL_DESCRIPTIONS`, remplacer la ligne `arome_france` :

```ts
	arome_france: 'Infoclimat · 0,025° (~2,5 km), France métropole · surface · ~51 h',
```

par :

```ts
	arome_france:
		'Infoclimat · 0,025° (~2,5 km), France métropole · surface · ~51 h · émagramme (sondage)',
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/constants.ts src/lib/tests/model-selector-groups.test.ts
git commit -m "feat(model-selector): table d'ordre France-first + allowlist dérivée (#48)"
```

---

### Task 2: Alignement des libellés sur `domainOptions`

**Files:**
- Create: `src/lib/model-selector-labels.ts`
- Modify: `src/lib/stores/variables.ts:18-22`
- Test: `src/lib/tests/model-selector-groups.test.ts` (ajout d'un `describe`)

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `src/lib/tests/model-selector-groups.test.ts` :

```ts
describe('applyModelSelectorLabels', () => {
	it('aligne le libellé de domainOptions sur la table (package + pseudo-domaines)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { domainOptions } = await import('@openmeteo/weather-map-layer');
		const { registerAnomalyDomain } = await import('$lib/anomaly-domain');
		const { registerAromeOmDomain } = await import('$lib/arome-om-domain');
		const { registerAromeFranceConvectionDomain } = await import(
			'$lib/arome-france-convection-domain'
		);
		const { registerAromeFranceDomain } = await import('$lib/arome-france-domain');
		const { applyModelSelectorLabels } = await import('$lib/model-selector-labels');

		registerAnomalyDomain();
		registerAromeOmDomain();
		registerAromeFranceConvectionDomain();
		registerAromeFranceDomain();
		applyModelSelectorLabels();

		const labelOf = (v: string) => domainOptions.find((d) => d.value === v)?.label;
		expect(labelOf('meteofrance_arpege_europe')).toBe('Arpège Europe');
		expect(labelOf('meteofrance_arome_france_hd')).toBe('Arome France HD');
		expect(labelOf('arome_france')).toBe('Arome France 2.5');
		expect(labelOf('anomaly_europe')).toBe('Anomalie T°C (Europe ERA/Arpège)');
	});
});
```

Ajouter `vi` à l'import vitest en tête de fichier :

```ts
import { describe, expect, it, vi } from 'vitest';
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/lib/tests/model-selector-groups.test.ts -t "aligne le libellé"`
Expected: FAIL — `$lib/model-selector-labels` introuvable.

- [ ] **Step 3: Implémenter `applyModelSelectorLabels()`**

Créer `src/lib/model-selector-labels.ts` :

```ts
import { domainOptions } from '@openmeteo/weather-map-layer';

import { MODEL_SELECTOR_GROUPS } from '$lib/constants';

/** Aligne le `label` des entrées `domainOptions` sur la source unique
 *  `MODEL_SELECTOR_GROUPS`, pour que le bouton déclencheur du sélecteur
 *  (qui lit `selectedDomain.label` depuis `domainOptions`) et la liste déroulante
 *  affichent le même nom. Idempotent ; à appeler après les `register*Domain()`
 *  et avant la première évaluation de `selectedDomain`. */
export function applyModelSelectorLabels(): void {
	const labelByValue = new Map(
		MODEL_SELECTOR_GROUPS.flatMap((g) => g.domains.map((d) => [d.value, d.label] as const))
	);
	for (const opt of domainOptions) {
		const label = labelByValue.get(opt.value);
		if (label) opt.label = label;
	}
}
```

- [ ] **Step 4: Câbler l'appel dans `variables.ts`**

Dans `src/lib/stores/variables.ts`, ajouter l'import (à côté des autres `$lib/*-domain`) :

```ts
import { applyModelSelectorLabels } from '$lib/model-selector-labels';
```

Puis, dans le bloc d'enregistrement (L18-22), ajouter l'appel **après** les quatre `register*Domain()` :

```ts
// Doit tourner avant la première évaluation de `selectedDomain`.
registerAnomalyDomain();
registerAromeOmDomain();
registerAromeFranceConvectionDomain();
registerAromeFranceDomain();
applyModelSelectorLabels();
```

- [ ] **Step 5: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/lib/tests/model-selector-groups.test.ts`
Expected: PASS (tous les tests verts).

- [ ] **Step 6: Commit**

```bash
git add src/lib/model-selector-labels.ts src/lib/stores/variables.ts src/lib/tests/model-selector-groups.test.ts
git commit -m "feat(model-selector): aligne les libellés de domainOptions sur la table (#48)"
```

---

### Task 3: Rendu du composant via la table

**Files:**
- Modify: `src/lib/components/chrome/model-selector.svelte`

- [ ] **Step 1: Réécrire le composant**

Remplacer **intégralement** le contenu de `src/lib/components/chrome/model-selector.svelte` par :

```svelte
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { domainOptions } from '@openmeteo/weather-map-layer';

	import { domainSelectionOpen as dSO, domain, selectedDomain } from '$lib/stores/variables';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { MODEL_DESCRIPTIONS, MODEL_SELECTOR_GROUPS } from '$lib/constants';

	let open = $state(get(dSO));
	const unsub = dSO.subscribe((v) => (open = v));
	onDestroy(unsub);
</script>

<Popover.Root bind:open onOpenChange={(e) => dSO.set(e)}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class="bg-glass/50 hover:bg-glass/70 h-11 md:h-8 cursor-pointer justify-between gap-1.5 rounded-lg border border-white/20 px-3 text-white shadow-md glass-blur"
				role="combobox"
				aria-expanded={open}
				aria-label="Choisir le modèle météo"
			>
				<span class="truncate">{$selectedDomain?.label || 'Modèle…'}</span>
				<ChevronsUpDownIcon class="size-4 shrink-0 opacity-60" aria-hidden="true" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		tabindex={0}
		onOpenAutoFocus={(e) => {
			// Empêche l'autofocus de l'input de recherche : sur mobile il ferait monter
			// le clavier virtuel, qui compresse la liste et capte le geste de scroll.
			// On focus plutôt le modèle actif (centré), comme le sélecteur de variable.
			e.preventDefault();
			const query = document.querySelector(
				'[data-value="' + $selectedDomain?.value + '"]'
			) as HTMLElement | null;
			if (query) {
				query.scrollIntoView({ block: 'center' });
				query.setAttribute('tabindex', '0');
				query.focus();
			}
		}}
		class="bg-glass/60 z-80 w-72 rounded-lg border-none p-0 backdrop-blur-xl"
	>
		<Command.Root class="bg-transparent">
			<Command.Input placeholder="Rechercher un modèle…" class="border-none ring-0" />
			<Command.List>
				<Command.Empty>Aucun modèle trouvé.</Command.Empty>
				{#each MODEL_SELECTOR_GROUPS as group (group.label)}
					{@const visible = group.domains.filter((d) =>
						domainOptions.some((o) => o.value === d.value)
					)}
					{#if visible.length}
						<Command.Group heading={group.label}>
							{#each visible as { value, label } (value)}
								<Command.Item
									{value}
									class="hover:bg-primary/20 cursor-pointer"
									onSelect={() => {
										$domain = value;
										dSO.set(false);
									}}
								>
									<div class="flex w-full items-start justify-between gap-2">
										<div class="min-w-0">
											<div>{label}</div>
											{#if MODEL_DESCRIPTIONS[value]}
												<div class="text-xs leading-snug text-white/55">
													{MODEL_DESCRIPTIONS[value]}
												</div>
											{/if}
										</div>
										<CheckIcon
											class="mt-0.5 size-4 shrink-0 {$selectedDomain.value !== value
												? 'text-transparent'
												: ''}"
										/>
									</div>
								</Command.Item>
							{/each}
						</Command.Group>
					{/if}
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
```

Différences clés vs. l'ancien : suppression des imports `domainGroups` et `type Domain` et des constantes locales `visibleDomainOptions`/`visibleDomainGroups` ; itération directe de `MODEL_SELECTOR_GROUPS` avec filtrage `domainOptions.some(...)` (gating bucket) ; libellé tiré de la table (`label`), plus de `startsWith`.

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: 0 erreur (aucune référence résiduelle à `domainGroups`/`DOMAIN_ALLOWLIST` dans le composant).

- [ ] **Step 3: Lint/format**

Run: `npm run lint`
Expected: PASS. Si Prettier signale un écart, lancer `npm run format` puis re-vérifier.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/chrome/model-selector.svelte
git commit -m "feat(model-selector): rendu via MODEL_SELECTOR_GROUPS, France d'abord (#48)"
```

---

### Task 4: Doc de synchronisation + vérification globale

**Files:**
- Modify: `.claude/rules/architecture.md` (§ *Domain allowlist (Infoclimat preset)*)

- [ ] **Step 1: Mettre à jour la doc**

Dans `.claude/rules/architecture.md`, remplacer le paragraphe de la section
`## Domain allowlist (Infoclimat preset)` par :

```markdown
## Domain allowlist (Infoclimat preset)

`MODEL_SELECTOR_GROUPS` in `src/lib/constants.ts` is the single source of truth for the
domain selector (`model-selector.svelte`): it declares the visible domains, their order,
their group, and their display label — French models first (issue #48). `DOMAIN_ALLOWLIST`
is **derived** from it (flattened domain values). The selector iterates this table directly;
it no longer relies on the package's `domainGroups` + `startsWith(group.value)` grouping
(which could not merge AROME HD / France / OM under one group). Labels are aligned onto
`domainOptions` via `applyModelSelectorLabels()` (`src/lib/model-selector-labels.ts`, called
in `stores/variables.ts`) so the trigger button and the dropdown agree. This is still
**display-only**: URLs sharing a non-listed domain resolve correctly. Add/reorder entries in
`MODEL_SELECTOR_GROUPS` to change the UI.
```

- [ ] **Step 2: Suite de tests complète**

Run: `npm run test -- --run`
Expected: PASS (dont `model-selector-groups.test.ts` ; les tests `*-domain.test.ts` existants restent verts — les `domainGroups.push` ne sont pas retirés).

- [ ] **Step 3: Build de validation**

Run: `npm run build`
Expected: build statique réussi, 0 erreur.

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/architecture.md
git commit -m "docs(architecture): MODEL_SELECTOR_GROUPS source unique du sélecteur (#48)"
```

---

## Vérification manuelle (après Task 3/4)

`npm run dev`, ouvrir le sélecteur de modèles :

- [ ] Ordre des groupes : Météo-France Arome → Météo-France Arpège → DWD Germany → ECMWF → NOAA US → Anomalie.
- [ ] Groupe « Météo-France Arome » : HD, France 2.5, France Convection, OM Réunion-Mayotte, Antilles, Guyane, Polynésie, Nouvelle-Calédonie.
- [ ] Le bouton déclencheur affiche le **même** libellé que l'item sélectionné (ex. « Arpège Europe », pas « MF ARPEGE Europe »).
- [ ] Sans bucket configuré (`VITE_MODELS_BUCKET_URL` absent) : les pseudo-domaines (anomalie, AROME France/OM) disparaissent proprement, sans groupe vide.
- [ ] La recherche (`Command.Input`) filtre toujours sur les nouveaux libellés.
