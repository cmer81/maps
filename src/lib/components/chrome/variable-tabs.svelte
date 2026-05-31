<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import Cloud from '@lucide/svelte/icons/cloud';
	import CloudRain from '@lucide/svelte/icons/cloud-rain';
	import Gauge from '@lucide/svelte/icons/gauge';
	import Layers from '@lucide/svelte/icons/layers';
	import PlusIcon from '@lucide/svelte/icons/plus';
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

	import { VISIBLE_PRESSURE_LEVELS_HPA } from '$lib/constants';
	import { localizeVariableOption, translateVariableLabel } from '$lib/i18n/variables-fr';
	import {
		CATEGORIES,
		type Category,
		type CategoryKey,
		categorize
	} from '$lib/variable-categories';

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

	// Sélectionne une variable (gère branche groupe de niveaux vs variable simple).
	const selectVariable = (vr: string) => {
		const v = variableOptions.find(({ value }) => value === vr) ?? { value: vr, label: vr };
		if (levelGroupVariables.includes(vr)) {
			$levelGroupSelected = localizeVariableOption(v);
			$variable = checkDefaultLevel(v.value);
		} else {
			$levelGroupSelected = undefined;
			$variable = v.value;
		}
	};

	// Catégories ayant au moins une variable disponible (hors composantes vectorielles brutes).
	let availableCategories = $derived.by(() => {
		if (!$metaJson) return [] as { cat: Category; first: string }[];
		const result: { cat: Category; first: string }[] = [];
		for (const cat of CATEGORIES) {
			const first = $metaJson.variables.find(
				(v) => !v.includes('_v_') && !v.includes('_direction') && categorize(v) === cat.key
			);
			if (first) result.push({ cat, first });
		}
		return result;
	});

	// Catégorie active = celle de la variable (ou du groupe de niveaux) sélectionnée.
	let activeCategory = $derived<CategoryKey>(
		categorize($levelGroupSelected?.value ?? $selectedVariable?.value ?? '')
	);
</script>

{#if $metaJson}
	<div class="flex items-center gap-1.5">
		<!-- Onglets imagés par catégorie -->
		{#each availableCategories as { cat, first } (cat.key)}
			{@const Icon = ICONS[cat.key]}
			<button
				type="button"
				class="bg-glass/75 backdrop-blur-sm shadow-md hover:bg-glass/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-colors duration-200 flex h-11 md:h-7.25 cursor-pointer items-center gap-1.5 rounded px-2.5 text-xs text-white {activeCategory ===
				cat.key
					? 'bg-glass/95! ring-1 ring-white/40'
					: ''}"
				aria-pressed={activeCategory === cat.key}
				aria-label={cat.label}
				onclick={() => selectVariable(first)}
			>
				<Icon class="size-4" aria-hidden="true" />
				<span class="hidden sm:inline">{cat.label}</span>
			</button>
		{/each}

		<!-- Bouton « + » : liste complète catégorisée des variables -->
		<Popover.Root
			bind:open={variableSelectionOpen}
			onOpenChange={(e) => {
				vSO.set(e);
			}}
		>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						class="bg-glass/75 dark:bg-glass/75 backdrop-blur-sm shadow-md {variableSelectionOpen
							? 'bg-glass/95!'
							: ''} hover:bg-glass/95! focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 h-11 w-11 md:h-7.25 md:w-7.25 cursor-pointer items-center justify-center rounded border-none p-0! text-white"
						role="combobox"
						aria-expanded={variableSelectionOpen}
						aria-label="Toutes les variables"
					>
						<PlusIcon class="size-4" aria-hidden="true" />
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
						const firstChild = query.querySelector(
							'[data-value=' + $selectedVariable.value + ']'
						) as HTMLElement;

						firstChild.scrollIntoView({ block: 'center' });
						firstChild.setAttribute('tabindex', '0');
						firstChild.focus();
					}
				}}
				class="z-80 w-62.5 rounded border-none bg-transparent! p-0"
			>
				<Command.Root class="bg-glass/85! backdrop-blur-sm rounded text-white">
					<Command.Input class="border-none ring-0" placeholder="Rechercher une variable…" />
					<Command.List>
						<Command.Empty>Aucune variable trouvée.</Command.Empty>
						<Command.Group>
							{#each variableList as vr, i (i)}
								{@const v = variableOptions.find(({ value }) => value === vr) ?? {
									value: vr,
									label: vr
								}}
								{#if levelGroupVariables.includes(vr)}
									<Command.Item
										value={v?.value}
										class="hover:bg-primary/15 cursor-pointer {$levelGroupSelected &&
										$levelGroupSelected.value === v?.value
											? 'bg-primary/10'
											: ''}"
										onSelect={() => {
											$levelGroupSelected = localizeVariableOption(v);
											$variable = checkDefaultLevel(v?.value as string);
											vSO.set(false);
										}}
									>
										<div class="flex w-full items-center justify-between">
											{v?.label ? translateVariableLabel(v.label) : ''}
											<CheckIcon
												class="size-4 {!$levelGroupSelected ||
												$levelGroupSelected?.value !== v?.value
													? 'text-transparent'
													: ''}"
											/>
										</div>
									</Command.Item>
								{:else if !vr.includes('_v_') && !vr.includes('_direction')}
									{@const simpleVar = variableOptions.find(({ value }) => value === vr) ?? {
										value: vr,
										label: vr
									}}

									<Command.Item
										value={simpleVar?.value}
										class="hover:bg-primary/20! cursor-pointer {$selectedVariable.value ===
										simpleVar?.value
											? 'bg-primary/10!'
											: ''}"
										onSelect={() => {
											$levelGroupSelected = undefined;
											$variable = simpleVar?.value as string;
											vSO.set(false);
										}}
									>
										<div class="flex w-full items-center justify-between">
											{simpleVar?.label ? translateVariableLabel(simpleVar.label) : ''}
											<CheckIcon
												class="size-4 {$selectedVariable.value !== simpleVar?.value
													? 'text-transparent'
													: ''}"
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
							class="bg-glass/75 dark:bg-glass/75 backdrop-blur-sm shadow-md {pressureLevelSelectionOpen
								? 'bg-glass/95!'
								: ''} hover:bg-glass/95! focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 h-11 md:h-7.25 cursor-pointer justify-between gap-1.5 rounded border-none px-2.5 text-xs text-white"
							role="combobox"
							aria-expanded={pressureLevelSelectionOpen}
						>
							<span class="truncate">
								{$level && $unit ? `${$level} ${$unit}` : 'Choisir un niveau…'}
							</span>
							<ChevronsUpDownIcon class="size-4 shrink-0 opacity-50" aria-hidden="true" />
						</Button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content tabindex={0} class="z-80 w-62.5 rounded border-none bg-transparent! p-0">
					<Command.Root class="bg-glass/85! backdrop-blur-sm rounded text-white">
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
