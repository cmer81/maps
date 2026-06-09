<script lang="ts">
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import { toast } from 'svelte-sonner';

	import { defaultVectorOptions, vectorOptions } from '$lib/stores/vector';
	import { contourStyle } from '$lib/stores/vector-styles';

	import ColorPicker from '$lib/components/scale/color-picker.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { reloadVectorStyle } from '$lib/layers';
	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';
	import {
		defaultContourStyle,
		hexToRgbaString,
		parseRgbaOpacity,
		rgbaStringToHex
	} from '$lib/vector-styles';

	const contours = $derived($vectorOptions.contours);
	const breakpoints = $derived($vectorOptions.breakpoints);

	const handleContourIntervalChange = () => {
		updateUrl(
			'contour_interval',
			String($vectorOptions.contourInterval),
			String(defaultVectorOptions.contourInterval) // different urlParam and key
		);
		if (contours) {
			changeOMfileURL();
		}
	};

	let editing: { index: number; rect: DOMRect } | null = $state(null);

	function setColor(index: number, hex: string, alpha: number) {
		contourStyle.update((s) => ({
			...s,
			levels: s.levels.map((l, i) =>
				i === index ? { ...l, darkColor: hexToRgbaString(hex, alpha) } : l
			)
		}));
		reloadVectorStyle();
	}

	function setWidth(index: number, width: number) {
		if (!Number.isFinite(width) || width < 0) return;
		contourStyle.update((s) => ({
			...s,
			levels: s.levels.map((l, i) => (i === index ? { ...l, width } : l))
		}));
		reloadVectorStyle();
	}

	function resetContourStyle() {
		contourStyle.set(structuredClone(defaultContourStyle));
		reloadVectorStyle();
	}
</script>

<div>
	<label
		class="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2 md:min-h-0 md:py-1.5"
		for="contouring"
	>
		<span class="text-sm">Isocontours</span>
		<Switch
			id="contouring"
			class="cursor-pointer"
			bind:checked={$vectorOptions.contours}
			onCheckedChange={() => {
				updateUrl('contours', String(contours));
				changeOMfileURL();
				toast.info('Isocontours ' + (contours ? 'activés' : 'désactivés'));
			}}
		/>
	</label>

	{#if contours}
		<div class="mt-1 flex flex-col gap-2 pl-1">
			<label class="flex cursor-pointer items-center justify-between gap-3" for="breakpoints">
				<span class="text-xs text-white/70">Aligner sur les paliers de l'échelle</span>
				<Switch
					id="breakpoints"
					class="cursor-pointer"
					bind:checked={$vectorOptions.breakpoints}
					onCheckedChange={() => {
						updateUrl(
							'interval_on_breakpoints',
							String(breakpoints),
							String(defaultVectorOptions.breakpoints) // key is different
						);
						changeOMfileURL();
						toast.info(
							breakpoints
								? "Isolignes alignées sur les paliers de l'échelle"
								: 'Isolignes à intervalle fixe'
						);
					}}
				/>
			</label>
			<p class="text-xs leading-snug text-white/45">
				{#if breakpoints}
					Une isoligne par palier de l'échelle de couleurs. Désactivez pour régler vous-même
					l'intervalle.
				{:else}
					Intervalle fixe réglé ci-dessous, indépendant des paliers de l'échelle.
				{/if}
			</p>

			<div
				class="flex flex-col gap-2 duration-300"
				class:opacity-50={breakpoints}
				aria-disabled={breakpoints}
			>
				<Label class="text-xs text-white/70" for="interval">Intervalle fixe des isolignes :</Label>
				<div class="flex items-center gap-3">
					<input
						id="interval_slider"
						class="min-w-0 flex-1 delay-75 duration-200"
						class:cursor-not-allowed={breakpoints}
						type="range"
						min="0"
						max="50"
						disabled={breakpoints}
						bind:value={$vectorOptions.contourInterval}
						onchange={handleContourIntervalChange}
					/>
					<Input
						id="interval"
						class="w-16 shrink-0 bg-background/60"
						step="0.5"
						disabled={breakpoints}
						bind:value={$vectorOptions.contourInterval}
						onchange={handleContourIntervalChange}
					/>
				</div>
			</div>
			<div class="mt-2 flex flex-col gap-1.5 border-t border-white/10 pt-2">
				<div class="flex items-center justify-between">
					<span class="text-xs text-white/70">Style des isolignes</span>
					<button
						type="button"
						class="flex cursor-pointer items-center gap-1 text-xs text-white/50 hover:text-white/80"
						onclick={resetContourStyle}
					>
						<RotateCcwIcon class="size-3" /> Réinitialiser
					</button>
				</div>
				{#each $contourStyle.levels as level, i (level.label)}
					<div class="flex items-center gap-2">
						<span class="w-10 shrink-0 text-xs text-white/60">{level.label}</span>
						<div class="relative">
							<button
								type="button"
								aria-label={`Couleur ${level.label}`}
								class="size-5 cursor-pointer rounded border border-white/20"
								style="background: {level.darkColor};"
								onclick={(e) =>
									(editing = { index: i, rect: e.currentTarget.getBoundingClientRect() })}
							></button>
							{#if editing?.index === i}
								<ColorPicker
									portalToBody
									anchorRect={editing.rect}
									color={rgbaStringToHex(level.darkColor)}
									alpha={parseRgbaOpacity(level.darkColor)}
									onchange={(hex, alpha) => setColor(i, hex, alpha)}
									onclose={() => (editing = null)}
								/>
							{/if}
						</div>
						<Input
							class="h-7 w-16 shrink-0 bg-background/60"
							type="number"
							step="0.5"
							min="0"
							value={level.width}
							onchange={(e) => setWidth(i, Number(e.currentTarget.value))}
							aria-label={`Largeur ${level.label}`}
						/>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
