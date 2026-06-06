<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import Cloud from '@lucide/svelte/icons/cloud';
	import CloudRain from '@lucide/svelte/icons/cloud-rain';
	import Gauge from '@lucide/svelte/icons/gauge';
	import Layers from '@lucide/svelte/icons/layers';
	import Thermometer from '@lucide/svelte/icons/thermometer';
	import Wind from '@lucide/svelte/icons/wind';
	import {
		LEVEL_PREFIX,
		LEVEL_REGEX,
		LEVEL_UNIT_REGEX,
		levelGroupVariables,
		variableOptions
	} from '@openmeteo/weather-map-layer';

	import { metaJson } from '$lib/stores/time';
	import {
		level,
		levelGroupSelected,
		pressureLevelsSelectionOpen as pLSO,
		selectedVariable,
		unit,
		variableSelectionOpen as vSO,
		variable
	} from '$lib/stores/variables';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { HIDDEN_VARIABLES, VISIBLE_PRESSURE_LEVELS_HPA } from '$lib/constants';
	import { localizeVariableOption, translateVariableLabel } from '$lib/i18n/variables-fr';
	import { CATEGORIES, type CategoryKey, categorize } from '$lib/variable-categories';

	const ICONS = {
		temperature: Thermometer,
		precipitation: CloudRain,
		wind: Wind,
		clouds: Cloud,
		pressure: Gauge,
		other: Layers
	} as const;

	// Liste de variables, avec les groupes de niveaux repliés sur leur préfixe.
	let variableList = $derived.by(() => {
		if ($metaJson) {
			const variables: string[] = [];
			for (let mjVariable of $metaJson.variables) {
				// Variables masquées du sélecteur (rendu cassé en attente de refacto).
				if (HIDDEN_VARIABLES.includes(mjVariable)) continue;
				let match = mjVariable.match(LEVEL_REGEX);
				if (match) {
					const prefixMatch = mjVariable.match(LEVEL_PREFIX);
					const prefix = prefixMatch?.groups?.prefix;
					if (prefix) {
						if (!variables.includes(prefix)) variables.push(prefix);
						continue;
					}
				}

				variables.push(mjVariable);
			}
			return variables;
		}
	});

	const visiblePressureLevels = new Set<number>(VISIBLE_PRESSURE_LEVELS_HPA);

	const levelGroupsList = $derived.by(() => {
		if ($metaJson) {
			const groups: { [key: string]: [{ value: string; label: string }] } = {};
			for (let mjVariable of $metaJson.variables) {
				let match = mjVariable.match(LEVEL_REGEX);
				if (match && match.groups) {
					const prefixMatch = mjVariable.match(LEVEL_PREFIX);
					const prefix = prefixMatch?.groups?.prefix;

					if (prefix) {
						// Filtre d'affichage : ne garde que les niveaux hPa whitelistés.
						// Les autres unités (m) passent toujours.
						const unitMatch = mjVariable.match(LEVEL_UNIT_REGEX);
						if (unitMatch?.groups?.unit === 'hPa') {
							const lvlNum = Number(unitMatch.groups.level);
							if (!visiblePressureLevels.has(lvlNum)) continue;
						}

						let variableObject = variableOptions.find(({ value }) => value === mjVariable) ?? {
							value: mjVariable,
							label: mjVariable
						};
						if (!Object.keys(groups).includes(prefix)) {
							groups[prefix] = [variableObject];
						} else {
							groups[prefix].push(variableObject);
						}
					}
				}
			}
			return groups;
		}
	});

	let variableSelectionOpen = $state(get(vSO));
	const unsubVSO = vSO.subscribe((vO) => {
		variableSelectionOpen = vO;
	});
	onDestroy(unsubVSO);

	let pressureLevelSelectionOpen = $state(get(pLSO));
	const unsubPLSO = pLSO.subscribe((plO) => {
		pressureLevelSelectionOpen = plO;
	});
	onDestroy(unsubPLSO);

	const checkDefaultLevel = (value: string) => {
		if (levelGroupsList && $levelGroupSelected) {
			const levelGroup = levelGroupsList[$levelGroupSelected.value];
			if (levelGroup) {
				// define some default levels
				for (let level of levelGroup) {
					if (level.value.includes('2m')) {
						return level.value;
					} else if (level.value.includes('10m')) {
						return level.value;
					} else if (level.value.includes('100m')) {
						return level.value;
					}
				}
				return levelGroup[0].value;
			}
		}
		return value;
	};

	// Variables disponibles (préfixes de groupes + variables simples), groupées par
	// catégorie pour une liste organisée dans le sélecteur.
	let groupedVariables = $derived.by(() => {
		const list = variableList ?? [];
		const groups: { cat: (typeof CATEGORIES)[number]; items: string[] }[] = [];
		for (const cat of CATEGORIES) {
			const items = list.filter(
				(vr) => !vr.includes('_v_') && !vr.includes('_direction') && categorize(vr) === cat.key
			);
			if (items.length) groups.push({ cat, items });
		}
		return groups;
	});

	// Catégorie + libellé de la variable (ou groupe de niveaux) active.
	let activeCategory = $derived<CategoryKey>(
		categorize($levelGroupSelected?.value ?? $selectedVariable?.value ?? '')
	);
	let activeLabel = $derived(
		$levelGroupSelected
			? translateVariableLabel($levelGroupSelected.label)
			: $selectedVariable?.label
				? translateVariableLabel($selectedVariable.label)
				: 'Variable…'
	);
</script>

{#if $metaJson}
	<div class="flex items-center gap-1.5">
		<!-- Sélecteur unique : affiche la variable active, ouvre la liste complète groupée -->
		<Popover.Root bind:open={variableSelectionOpen} onOpenChange={(e) => vSO.set(e)}>
			<Popover.Trigger>
				{#snippet child({ props })}
					{@const ActiveIcon = ICONS[activeCategory]}
					<Button
						{...props}
						variant="outline"
						class="bg-glass/50 hover:bg-glass/70 {variableSelectionOpen
							? 'bg-glass/70'
							: ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 h-11 md:h-8 max-w-56 cursor-pointer justify-between gap-1.5 rounded-lg border border-white/20 px-3 text-white shadow-md glass-blur"
						role="combobox"
						aria-expanded={variableSelectionOpen}
						aria-label="Choisir une variable"
					>
						<span class="flex items-center gap-1.5 truncate">
							<ActiveIcon class="size-4 shrink-0" aria-hidden="true" />
							<span class="truncate">{activeLabel}</span>
						</span>
						<ChevronsUpDownIcon class="size-4 shrink-0 opacity-60" aria-hidden="true" />
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content
				tabindex={0}
				onOpenAutoFocus={(e) => {
					e.preventDefault();
					const query = document.querySelector(
						'[data-value=' + $selectedVariable.value + ']'
					) as HTMLElement;
					if (query) {
						query.scrollIntoView({ block: 'center' });
						query.setAttribute('tabindex', '0');
						query.focus();
					}
				}}
				class="bg-glass/60 z-80 w-62.5 rounded-lg border-none p-0 backdrop-blur-xl"
			>
				<Command.Root class="bg-transparent text-white">
					<Command.Input class="border-none ring-0" placeholder="Rechercher une variable…" />
					<Command.List>
						<Command.Empty>Aucune variable trouvée.</Command.Empty>
						{#each groupedVariables as { cat, items } (cat.key)}
							<Command.Group heading={cat.label}>
								{#each items as vr (vr)}
									{@const v = variableOptions.find(({ value }) => value === vr) ?? {
										value: vr,
										label: vr
									}}
									{#if levelGroupVariables.includes(vr)}
										<Command.Item
											value={v.value}
											class="hover:bg-primary/15 cursor-pointer {$levelGroupSelected &&
											$levelGroupSelected.value === v.value
												? 'bg-primary/10'
												: ''}"
											onSelect={() => {
												$levelGroupSelected = localizeVariableOption(v);
												$variable = checkDefaultLevel(v.value);
												vSO.set(false);
											}}
										>
											<div class="flex w-full items-center justify-between">
												{translateVariableLabel(v.label)}
												<CheckIcon
													class="size-4 {!$levelGroupSelected ||
													$levelGroupSelected?.value !== v.value
														? 'text-transparent'
														: ''}"
												/>
											</div>
										</Command.Item>
									{:else}
										<Command.Item
											value={v.value}
											class="hover:bg-primary/20! cursor-pointer {$selectedVariable.value ===
											v.value
												? 'bg-primary/10!'
												: ''}"
											onSelect={() => {
												$levelGroupSelected = undefined;
												$variable = v.value;
												vSO.set(false);
											}}
										>
											<div class="flex w-full items-center justify-between">
												{translateVariableLabel(v.label)}
												<CheckIcon
													class="size-4 {$selectedVariable.value !== v.value
														? 'text-transparent'
														: ''}"
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

		<!-- Sous-sélecteur de niveau de pression (visible si un groupe de niveaux est actif) -->
		{#if levelGroupsList && $levelGroupSelected && $levelGroupSelected?.value && levelGroupsList[$levelGroupSelected.value]}
			<Popover.Root
				bind:open={pressureLevelSelectionOpen}
				onOpenChange={(e) => {
					pLSO.set(e);
				}}
			>
				<Popover.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="outline"
							class="bg-glass/50 hover:bg-glass/70 {pressureLevelSelectionOpen
								? 'bg-glass/70'
								: ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 h-11 md:h-8 cursor-pointer justify-between gap-1.5 rounded-lg border border-white/20 px-3 text-white shadow-md glass-blur"
							role="combobox"
							aria-expanded={pressureLevelSelectionOpen}
						>
							<span class="truncate">
								{$level && $unit ? `${$level} ${$unit}` : 'Choisir un niveau…'}
							</span>
							<ChevronsUpDownIcon class="size-4 shrink-0 opacity-60" aria-hidden="true" />
						</Button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content
					tabindex={0}
					onOpenAutoFocus={(e) => {
						// Empêche l'autofocus de l'input (clavier mobile qui casse le scroll) ;
						// focus plutôt le niveau actif, centré. Cf. sélecteur de variable/modèle.
						e.preventDefault();
						const query = document.querySelector(
							'[data-value="' + $variable + '"]'
						) as HTMLElement | null;
						if (query) {
							query.scrollIntoView({ block: 'center' });
							query.setAttribute('tabindex', '0');
							query.focus();
						}
					}}
					class="bg-glass/60 z-80 w-62.5 rounded-lg border-none p-0 backdrop-blur-xl"
				>
					<Command.Root class="bg-transparent text-white">
						<Command.Input class="border-none ring-0" placeholder="Rechercher un niveau…" />
						<Command.List>
							<Command.Empty>Aucun niveau trouvé.</Command.Empty>
							<Command.Group>
								{#each levelGroupsList[$levelGroupSelected.value] as { value, label } (value)}
									{@const lvl = value.match(LEVEL_UNIT_REGEX)?.groups?.level}
									{@const u = value.match(LEVEL_UNIT_REGEX)?.groups?.unit}

									{#if !value.includes('v_component') && !value.includes('_direction')}
										<Command.Item
											{value}
											class="hover:bg-primary/20! cursor-pointer {lvl === $level && u === $unit
												? 'bg-primary/10!'
												: ''}"
											onSelect={() => {
												$variable = value;
												pLSO.set(false);
											}}
										>
											<div class="flex w-full items-center justify-between">
												{translateVariableLabel(label)}
												<CheckIcon
													class="size-4 {lvl !== $level || u !== $unit ? 'text-transparent' : ''}"
												/>
											</div>
										</Command.Item>
									{/if}
								{/each}
							</Command.Group>
						</Command.List>
					</Command.Root>
				</Popover.Content>
			</Popover.Root>
		{/if}
	</div>
{/if}
