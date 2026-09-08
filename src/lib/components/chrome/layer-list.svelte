<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';

	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Cloud from '@lucide/svelte/icons/cloud';
	import CloudRain from '@lucide/svelte/icons/cloud-rain';
	import Gauge from '@lucide/svelte/icons/gauge';
	import Layers from '@lucide/svelte/icons/layers';
	import Thermometer from '@lucide/svelte/icons/thermometer';
	import Wind from '@lucide/svelte/icons/wind';
	import {
		LEVEL_UNIT_REGEX,
		getColorScale,
		levelGroupVariables,
		variableOptions
	} from '@openmeteo/weather-map-layer';
	import { mode } from 'mode-watcher';

	import { customColorScales, omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import { metaJson } from '$lib/stores/time';
	import { getDisplayUnit, unitPreferences } from '$lib/stores/units';
	import { domain } from '$lib/stores/variables';
	import {
		level,
		levelGroupSelected,
		selectedVariable,
		unit,
		variable
	} from '$lib/stores/variables';

	import ForecastPanel from '$lib/components/weather-ai/forecast-panel.svelte';

	import { WEATHER_AI_GLOBAL_DOMAIN } from '$lib/constants';
	import { localizeVariableOption, translateVariableLabel } from '$lib/i18n/variables-fr';
	import { buildLevelGroups, buildVariableList, groupVariablesByCategory } from '$lib/layer-list';
	import { pickDefaultLevel } from '$lib/level-groups';

	const ICONS = {
		temperature: Thermometer,
		precipitation: CloudRain,
		wind: Wind,
		clouds: Cloud,
		pressure: Gauge,
		other: Layers
	} as const;

	const grouped = $derived(
		$metaJson ? groupVariablesByCategory(buildVariableList($metaJson.variables)) : []
	);
	const levelGroups = $derived($metaJson ? buildLevelGroups($metaJson.variables) : {});

	// Unité affichée à droite de chaque ligne de variable : même dérivation que
	// context-strip.svelte/scale.svelte (échelle de couleur → préférence d'unité
	// de l'utilisateur). Retourne '' pour les variables sans unité pertinente
	// (catégorielles, directions…) afin que le rendu l'omette proprement.
	const isDark = $derived(mode.current === 'dark');
	function unitFor(value: string): string {
		const base = getColorScale(value, isDark, $omProtocolSettings.colorScales);
		const scale = $customColorScales[value] ?? base;
		return getDisplayUnit(scale.unit, $unitPreferences, value);
	}

	const activeValue = $derived($levelGroupSelected?.value ?? $selectedVariable?.value);
	// Libellé de la variable sélectionnée, affiché en sous-titre quand sa famille
	// est repliée (on garde toujours la sélection courante sous les yeux).
	const activeLabel = $derived(
		$selectedVariable ? translateVariableLabel($selectedVariable.label) : ''
	);
	// Clé de la famille contenant la variable active (fallback : première famille).
	const activeCategory = $derived(
		grouped.find(({ items }) => items.includes(activeValue as string))?.cat.key ??
			grouped[0]?.cat.key ??
			''
	);

	// Accordéon à une seule famille ouverte. `$derived` inscriptible : par défaut
	// la famille active (chargement initial + deep-link), réassignable au clic pour
	// ouvrir/replier, et réinitialisé automatiquement quand `activeCategory` change.
	let openKey: string = $derived(activeCategory);

	function toggleCategory(key: string) {
		openKey = openKey === key ? '' : key;
	}

	// Durées d'accordéon : entrée un peu plus lente que la sortie (« exit faster
	// than enter »), et 0 ms si l'utilisateur a demandé moins d'animations.
	const enterMs = $derived(prefersReducedMotion.current ? 0 : 200);
	const exitMs = $derived(prefersReducedMotion.current ? 0 : 140);

	// Sélectionne une ligne : groupe de niveaux → niveau par défaut (2 m > 10 m >
	// le plus bas), variable simple → sélection directe. Même logique que
	// l'ancien variable-tabs.
	function selectRow(value: string) {
		const option = variableOptions.find((o) => o.value === value) ?? { value, label: value };
		if (levelGroupVariables.includes(value)) {
			$levelGroupSelected = localizeVariableOption(option);
			const levels = levelGroups[value];
			$variable = (levels && pickDefaultLevel(levels)) ?? value;
		} else {
			$levelGroupSelected = undefined;
			$variable = value;
		}
	}
</script>

{#if $domain === WEATHER_AI_GLOBAL_DOMAIN}
	<ForecastPanel />
{:else if $metaJson}
	<div class="flex flex-col gap-1">
		{#each grouped as { cat, items } (cat.key)}
			{@const Icon = ICONS[cat.key]}
			{@const open = openKey === cat.key}
			{@const hasActive = items.includes(activeValue as string)}
			<div>
				<!-- En-tête de famille : ouvre/replie l'accordéon -->
				<button
					type="button"
					onclick={() => toggleCategory(cat.key)}
					aria-expanded={open}
					aria-controls="layer-cat-{cat.key}"
					class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left transition-colors md:min-h-9"
				>
					<Icon
						class="size-[18px] shrink-0 {hasActive ? 'text-sky-300' : 'text-white/55'}"
						aria-hidden="true"
					/>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-sm font-medium text-white">{cat.label}</span>
						{#if !open && hasActive}
							<span title={activeLabel} class="block truncate text-[11px] text-sky-300"
								>{activeLabel}</span
							>
						{/if}
					</span>
					<ChevronDown
						class="size-4 shrink-0 text-white/40 transition-transform duration-200 motion-reduce:transition-none {open
							? ''
							: '-rotate-90'}"
						aria-hidden="true"
					/>
				</button>

				{#if open}
					<div
						id="layer-cat-{cat.key}"
						in:slide={{ duration: enterMs, easing: cubicOut }}
						out:slide={{ duration: exitMs, easing: cubicOut }}
						class="mt-1 overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
					>
						{#each items as item (item)}
							{@const option = variableOptions.find(({ value }) => value === item) ?? {
								value: item,
								label: item
							}}
							{@const active = activeValue === item}
							{@const u = unitFor(item)}
							<button
								type="button"
								onclick={() => selectRow(item)}
								title={translateVariableLabel(option.label)}
								aria-pressed={active}
								class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 w-full cursor-pointer items-center px-3 py-2 text-left text-sm transition-colors md:min-h-9 {active
									? 'text-sky-300'
									: 'text-white'}"
							>
								<span class="flex-1 truncate">{translateVariableLabel(option.label)}</span>
								{#if u}
									<span
										class="ml-2 shrink-0 text-[11px] tabular-nums {active
											? 'text-sky-300/70'
											: 'text-white/45'}">{u}</span
									>
								{/if}
							</button>
							{#if active && levelGroups[item]?.length}
								<!-- Niveaux de la variable active, en radios (sous-échéances de la spec) -->
								<div
									role="radiogroup"
									aria-label="Niveau"
									class="flex flex-col border-t border-white/[0.06] bg-white/[0.02] py-1"
								>
									{#each levelGroups[item] as { value, label } (value)}
										{#if !value.includes('v_component') && !value.includes('_direction')}
											{@const lvl = value.match(LEVEL_UNIT_REGEX)?.groups?.level}
											{@const u = value.match(LEVEL_UNIT_REGEX)?.groups?.unit}
											{@const checked = lvl === $level && u === $unit}
											<label
												class="flex min-h-11 cursor-pointer items-center gap-2.5 pr-3 pl-8 text-sm md:min-h-9 {checked
													? 'text-sky-300'
													: 'text-white/80'}"
											>
												<input
													type="radio"
													name="layer-level-{item}"
													{checked}
													onchange={() => ($variable = value)}
													class="size-3.5 accent-sky-400"
												/>
												{translateVariableLabel(label)}
											</label>
										{/if}
									{/each}
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
