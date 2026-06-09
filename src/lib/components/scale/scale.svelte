<script lang="ts">
	import { tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';

	import { type RenderableColorScale, getColor, getColorScale } from '@openmeteo/weather-map-layer';
	import { mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import {
		customColorScales,
		omProtocolSettings,
		standardColorScales
	} from '$lib/stores/om-protocol-settings';
	import {
		bottomChromeHeight,
		opacity,
		preferences,
		scaleCollapsed
	} from '$lib/stores/preferences';
	import {
		convertValue,
		getDisplayUnit,
		getUnitOptions,
		isGeopotentialVariable,
		setUnitForCategory,
		unitPreferences
	} from '$lib/stores/units';
	import { variable } from '$lib/stores/variables';

	import * as Select from '$lib/components/ui/select';

	import { getAlpha, hexToRgba, rgbaToHex } from '$lib/color';
	import { categoricalLegendEntries, isCategorical } from '$lib/color-scales/legend';
	import { textWhite } from '$lib/helpers';
	import { changeOMfileURL, reloadVectorStyle } from '$lib/layers';
	import { refreshPopup } from '$lib/popup';

	import CategoricalLegend from './categorical-legend.svelte';
	import ColorPicker from './color-picker.svelte';

	interface Props {
		editable?: boolean;
	}

	let { editable = true }: Props = $props();

	const isDark = $derived(mode.current === 'dark');
	const baseColorScale: RenderableColorScale = $derived(
		getColorScale($variable, isDark, $omProtocolSettings.colorScales)
	);
	// Use custom scale if available, otherwise use base
	const colorScale = $derived($customColorScales[$variable] ?? baseColorScale);

	const categorical = $derived(isCategorical(colorScale));
	// isCategorical(colorScale) inline narrows colorScale to CategoricalColorScale for the call.
	const categoryEntries = $derived(
		isCategorical(colorScale) ? categoricalLegendEntries(colorScale) : []
	);

	let editingIndex: number | null = $state(null);

	const getLabeledColorsForLegend = (scale: RenderableColorScale) => {
		if (scale.type === 'rgba') {
			const steps = 25;
			const stepSize = (scale.max - scale.min) / steps;
			return Array.from({ length: steps + 1 }, (_, i) => {
				const value = Math.floor(scale.min + i * stepSize);
				return { value, color: getColor(scale, value), index: i };
			});
		}

		return scale.breakpoints.map((value, i) => ({
			value,
			color: getColor(scale, value),
			index: i
		}));
	};

	const formatValue = (value: number, digits: number): string => {
		const converted = convertValue(value, colorScale.unit, $unitPreferences, $variable);
		if (Math.abs(converted) >= 1) return converted.toFixed(0);
		if (Math.abs(converted) >= 0.1) return converted.toFixed(1);
		return converted.toFixed(digits);
	};

	const handleColorClick = (index: number, e: MouseEvent) => {
		if (!editable) return;
		e.stopPropagation();

		editingIndex = index;
	};

	const handleColorChange = async (newHex: string, newAlpha: number) => {
		if (editingIndex === null) return;

		const newScale = structuredClone(colorScale);
		const newColor = hexToRgba(newHex, newAlpha);

		if (newScale.colors) {
			newScale.colors[editingIndex] = newColor;
		}

		customColorScales.update((scales) => ({
			...scales,
			[$variable]: newScale
		}));
		$omProtocolSettings.colorScales[$variable] = newScale;
		await tick();
		await changeOMfileURL();
		toast('Échelle de couleurs modifiée');
	};

	const closePicker = () => {
		editingIndex = null;
	};

	// Vrai quand l'utilisateur a personnalisé les couleurs de la variable courante.
	const hasCustomScale = $derived(Boolean($customColorScales[$variable]));

	/** Réinitialise l'échelle de la variable courante aux couleurs standard. */
	const resetColorScale = async () => {
		const standard = getColorScale($variable, isDark, standardColorScales);
		customColorScales.update((scales) => {
			const next = { ...scales };
			delete next[$variable];
			return next;
		});
		$omProtocolSettings.colorScales[$variable] = standard;
		editingIndex = null;
		await tick();
		await changeOMfileURL();
		toast('Couleurs réinitialisées');
	};

	const digits = 2;
	const labeledColors = $derived(getLabeledColorsForLegend(colorScale));
	const displayUnit = $derived(getDisplayUnit(colorScale.unit, $unitPreferences, $variable));
	const unitOptions = $derived(getUnitOptions(colorScale.unit, $variable));
	const valueLength = $derived(String(Math.round(labeledColors.at(-1)?.value ?? 1)).length);
	const labelWidth = $derived(17 + Math.max(valueLength, displayUnit.length + 1, digits + 2) * 4);
	const desktop = new MediaQuery('min-width: 768px');
	const isMobile = $derived(!desktop.current);
	const colorBlockHeight = $derived(isMobile && labeledColors.length >= 20 ? 10 : 20);
	// Catégories affichables dans la légende (code 0 « Aucune » = transparent, masqué).
	const visibleCategoryEntries = $derived(categoryEntries.filter((e) => e.code !== 0));
	// Nombre d'items réellement rendus dans la légende (catégoriel vs paliers numériques) —
	// pilote la hauteur du panneau et la bande repliée.
	const legendItemCount = $derived(
		categorical ? visibleCategoryEntries.length : labeledColors.length
	);
	const totalHeight = $derived((categorical ? 30 : colorBlockHeight) * legendItemCount);
	// Bande repliée : hauteur de bloc réduite pour une légende compacte (~150px max).
	const collapsedBlockHeight = $derived(
		Math.min(colorBlockHeight, Math.max(4, Math.floor(150 / Math.max(1, legendItemCount))))
	);
</script>

{#if $preferences.showScale}
	{#if $scaleCollapsed}
		<!-- Légende repliée : bande de couleur fine + unité, clic pour déplier -->
		<button
			type="button"
			onclick={() => scaleCollapsed.set(false)}
			aria-label="Déplier la légende"
			title="Déplier la légende"
			class="bg-glass/45 absolute left-2.5 z-60 flex cursor-pointer flex-col items-center overflow-hidden rounded-lg shadow-md backdrop-blur-md {desktop.current
				? 'bottom-2.5'
				: ''}"
			style={!desktop.current ? `bottom: calc(${$bottomChromeHeight}px + 4.5rem);` : ''}
		>
			{#if colorScale.unit}
				<span class="px-1 pt-0.5 text-[10px] leading-tight text-white/90">{displayUnit}</span>
			{/if}
			<div class="flex flex-col-reverse">
				{#if categorical}
					{#each visibleCategoryEntries as entry (entry.code)}
						{@const a = entry.color[3] ?? 1}
						<div
							style="background: rgb({entry.color[0]}, {entry.color[1]}, {entry
								.color[2]}); opacity: {(a * $opacity) /
								100}; width: 16px; height: {collapsedBlockHeight}px;"
						></div>
					{/each}
				{:else}
					{#each labeledColors as lc (lc)}
						{@const alphaValue = getAlpha(lc.color)}
						<div
							style="background: rgb({lc.color[0]}, {lc.color[1]}, {lc
								.color[2]}); opacity: {(alphaValue * $opacity) /
								100}; width: 16px; height: {collapsedBlockHeight}px;"
						></div>
					{/each}
				{/if}
			</div>
		</button>
	{:else}
		<div
			class="absolute z-60 {desktop.current
				? 'bottom-2.5'
				: ''} duration-500 left-2.5 z-10 select-none rounded-lg"
			style="max-height: {totalHeight + 100}px;{!desktop.current
				? ` bottom: calc(${$bottomChromeHeight}px + 4.5rem);`
				: ''}"
		>
			<div class="flex flex-col-reverse shadow-md">
				{#if categorical}
					<CategoricalLegend entries={categoryEntries} opacity={$opacity} />
				{:else}
					<div class="flex flex-col-reverse bg-glass/45 backdrop-blur-md rounded-b-lg">
						{#each labeledColors as lc, i (lc)}
							{@const alphaValue = getAlpha(lc.color)}
							<button
								type="button"
								disabled={!editable && colorScale.type !== 'breakpoint'}
								onclick={(e) => handleColorClick(i, e)}
								style={`background: rgb({lc.color[0]}, {lc.color[1]}, {lc
								.color[2]}); opacity: {alphaValue};min-width: 28px; width: ${labelWidth}px; height: ${colorBlockHeight}px;`}
								class="relative border-none outline-none transition-all {editable
									? 'cursor-pointer hover:brightness-110 hover:z-10 hover:ring-3 hover:ring-white/65'
									: 'cursor-default'} {editingIndex === i ? 'ring-2 ring-white/40  z-20' : ''}"
								title={editable
									? `Cliquer pour changer la couleur (opacité : ${Math.round(alphaValue * 100)} %)`
									: undefined}
							>
								<div
									class="absolute inset-0 {i === 0 ? 'rounded-b-lg' : ''}"
									style="background: rgb({lc.color[0]}, {lc.color[1]}, {lc
										.color[2]}); opacity: {(alphaValue * $opacity) / 100};"
								></div>
							</button>
							<!-- Color Picker Popover -->
							{#if editingIndex === i}
								<ColorPicker
									color={rgbaToHex(lc.color)}
									alpha={alphaValue}
									onchange={handleColorChange}
									onclose={closePicker}
								/>
							{/if}
						{/each}
					</div>

					<!-- Labels column - positioned between buttons -->
					<div class="flex flex-col-reverse" style="width: {labelWidth}px;">
						{#each labeledColors as lc, i (lc)}
							{#if i > 0 && !(labeledColors.length > 20 && i % 2 === 1 && !desktop.current)}
								<div
									class="absolute flex items-center justify-center text-xs z-20 pointer-events-none"
									style={`bottom: ${i * colorBlockHeight - 6}px; height: 12px; width: ${labelWidth}px;
								color: ${textWhite(lc.color, isDark, $opacity) ? 'white' : 'black'};`}
								>
									{formatValue(lc.value, digits)}
								</div>
							{/if}
						{/each}
					</div>
				{/if}

				{#if colorScale.unit}
					<div
						class="bg-glass/45 backdrop-blur-md shadow-md h-6 w-full overflow-hidden text-center text-xs {editable
							? ''
							: 'rounded-t-lg'}"
					>
						{#if unitOptions}
							<Select.Root
								type="single"
								value={displayUnit}
								onValueChange={(v) => {
									if (v) {
										setUnitForCategory(colorScale.unit, v, $variable);
										refreshPopup();
										// Le géopotentiel convertit aussi les étiquettes d'isolignes (gpm↔gpdam).
										if (isGeopotentialVariable($variable)) reloadVectorStyle();
									}
								}}
							>
								<Select.Trigger
									class="h-6! cursor-pointer w-full p-0 text-xs flex items-center justify-center px-1 py-0 gap-0.5 border-none bg-transparent shadow-none focus-visible:ring-0"
									aria-label="Changer d'unité"
									icon={false}
								>
									{displayUnit}
								</Select.Trigger>
								<Select.Content
									side="top"
									class="z-80 left-2.5 border-none bg-glass/45 backdrop-blur-md rounded-lg min-w-20"
								>
									{#each unitOptions as { value, label } (value)}
										<Select.Item {value} {label} class="cursor-pointer text-xs" />
									{/each}
								</Select.Content>
							</Select.Root>
						{:else}
							<span class="leading-6">{displayUnit}</span>
						{/if}
					</div>
				{/if}

				{#if editable && !categorical}
					<button
						type="button"
						onclick={resetColorScale}
						disabled={!hasCustomScale}
						class="bg-glass/45 backdrop-blur-md shadow-md h-4 w-full text-center text-[11px] leading-4 {hasCustomScale
							? 'hover:bg-glass/65 cursor-pointer'
							: 'cursor-default opacity-40'}"
						title={hasCustomScale
							? 'Réinitialiser aux couleurs standard'
							: 'Couleurs déjà standard'}
						aria-label="Réinitialiser aux couleurs standard"
					>
						↺
					</button>
				{/if}

				<!-- Bouton de repli (en haut de la légende) -->
				<button
					type="button"
					onclick={() => scaleCollapsed.set(true)}
					class="bg-glass/45 hover:bg-glass/65 h-4 w-full cursor-pointer rounded-t-lg text-center text-[11px] leading-4 shadow-md backdrop-blur-md"
					title="Replier la légende"
					aria-label="Replier la légende"
				>
					⌃
				</button>
			</div>
		</div>
	{/if}
{/if}
