<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { get } from 'svelte/store';

	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import X from '@lucide/svelte/icons/x';
	import { getColor } from '@openmeteo/weather-map-layer';

	import { timeSelectorActions } from '$lib/stores/keyboard';
	import { map } from '$lib/stores/map';
	import { bottomChromeHeight, desktop, opacity, sidebarWidth } from '$lib/stores/preferences';
	import { modelRun, time } from '$lib/stores/time';
	import { variable } from '$lib/stores/variables';

	import { formatISOWithoutTimezone, parseISOWithoutTimezone } from '$lib/time-format';
	import { updateUrl } from '$lib/url';
	import { cycloneSignalScale, pressureScale } from '$lib/weather-ai/grid';
	import { WeatherAiMapLayer } from '$lib/weather-ai/map-layer';
	import {
		TRACKS_PRODUCT,
		formatForecastDate,
		isTracks,
		trackColor,
		trackKey
	} from '$lib/weather-ai/products';
	import { weatherAi } from '$lib/weather-ai/state';

	const pressureGradient =
		'linear-gradient(to right,' +
		Array.from(
			{ length: 25 },
			(_, i) => `rgba(${getColor(pressureScale, 940 + i * 5, true).join(',')}) ${(i / 24) * 100}%`
		).join(',') +
		')';
	const signalGradient =
		'linear-gradient(to right,' +
		Array.from(
			{ length: 101 },
			(_, i) => `rgba(${getColor(cycloneSignalScale, i / 100, true).join(',')}) ${i}%`
		).join(',') +
		')';
	let renderer: WeatherAiMapLayer | undefined;
	let renderError = $state<string>();
	let playing = $state(false);
	let height = $state(0);
	let stepsElement: HTMLDivElement | undefined;
	const current = $derived($weatherAi.steps.find((s) => s.leadHours === $weatherAi.leadHours));
	const index = $derived($weatherAi.steps.findIndex((s) => s.leadHours === $weatherAi.leadHours));
	const tracks = $derived(
		$weatherAi.data
			.flatMap((d) => (isTracks(d.product) ? d.product.tracks : []))
			.filter((p) => $weatherAi.member === undefined || p.member === $weatherAi.member)
	);
	const activePoints = $derived(
		tracks.filter((p) => Date.parse(p.valid_time) === Date.parse(current?.validTime ?? ''))
	);
	const selected = $derived(activePoints.find((p) => trackKey(p) === $weatherAi.selectedTrack));
	const tracksMode = $derived($weatherAi.productId === TRACKS_PRODUCT);
	const empty = $derived(
		$weatherAi.status === 'ready' &&
			($weatherAi.data.length === 0 || (tracksMode && tracks.length === 0))
	);
	const offset = $derived(desktop.current ? $sidebarWidth : 0);
	const step = (delta: number) => {
		const s = get(weatherAi);
		const i = s.steps.findIndex((t) => t.leadHours === s.leadHours);
		const next = s.steps[i + delta];
		if (next) void weatherAi.selectLead(next.leadHours);
	};
	onMount(() => {
		const params = new URL(location.href).searchParams;
		const productIds: Record<string, string> = {
			cyclone_tracks: TRACKS_PRODUCT,
			pressure_msl: 'global-mslp-1deg',
			cyclone_existence: 'global-cyclone-existence-1deg'
		};
		void weatherAi.start({
			runId: params.get('weather_ai_run') ?? undefined,
			productId: params.has('variable') ? productIds[params.get('variable')!] : undefined,
			validTime:
				params.get('time')?.length === 15
					? parseISOWithoutTimezone(params.get('time')!).toISOString()
					: undefined
		});
	});
	onDestroy(() => {
		weatherAi.destroy();
		timeSelectorActions.set({});
		bottomChromeHeight.set(0);
	});
	$effect(() => {
		const instance = $map;
		if (!instance) return;
		renderer = new WeatherAiMapLayer(
			instance,
			(key, valid) => {
				weatherAi.selectTrack(key);
				const s = get(weatherAi).steps.find((s) => Date.parse(s.validTime) === Date.parse(valid));
				if (s) void weatherAi.selectLead(s.leadHours);
			},
			(message) => {
				renderError = message;
			}
		);
		renderer.update(get(weatherAi), get(opacity) / 100);
		return () => {
			renderer?.destroy();
			renderer = undefined;
		};
	});
	$effect(() => {
		const s = $weatherAi;
		renderError = undefined;
		renderer?.update(s, $opacity / 100);
	});
	$effect(() => {
		bottomChromeHeight.set(height + 16);
	});
	$effect(() => {
		const s = $weatherAi;
		if (s.run) {
			updateUrl('weather_ai_run', s.run.run_id);
			$modelRun = new Date(s.run.init_time);
			updateUrl('model_run', formatISOWithoutTimezone(new Date(s.run.init_time)));
		}
		if (current) {
			$time = new Date(current.validTime);
			updateUrl('time', formatISOWithoutTimezone(new Date(current.validTime)));
		}
		const v =
			s.productId === TRACKS_PRODUCT
				? 'cyclone_tracks'
				: s.productId === 'global-mslp-1deg'
					? 'pressure_msl'
					: s.productId === 'global-cyclone-existence-1deg'
						? 'cyclone_existence'
						: s.productId;
		untrack(() => {
			if (get(variable) !== v) {
				variable.set(v);
				updateUrl('variable', v);
			}
		});
	});
	$effect(() => {
		timeSelectorActions.set({
			previousHour: () => step(-1),
			nextHour: () => step(1),
			timeNavigationDisabled: !$weatherAi.steps.length
		});
	});
	$effect(() => {
		if (!playing || $weatherAi.status !== 'ready') return;
		if (index === $weatherAi.steps.length - 1) {
			playing = false;
			return;
		}
		const timer = setTimeout(() => step(1), 1000);
		return () => clearTimeout(timer);
	});
	$effect(() => {
		if ($weatherAi.status === 'error') playing = false;
	});
	$effect(() => {
		const lead = $weatherAi.leadHours;
		void tick().then(() =>
			stepsElement
				?.querySelector(`[data-lead="${lead}"]`)
				?.scrollIntoView({ block: 'nearest', inline: 'center' })
		);
	});
</script>

<div
	class="pointer-events-none fixed top-36 right-3 z-40 px-2 md:top-32"
	style:left="{offset + 8}px"
>
	{#if $weatherAi.status === 'loading' || $weatherAi.status === 'error' || renderError || empty}
		<div
			class="bg-glass/95 pointer-events-auto mx-auto w-fit max-w-md rounded-xl border border-white/20 px-4 py-3 text-center text-sm text-white shadow-lg glass-blur"
			role={$weatherAi.status === 'error' || renderError ? 'alert' : 'status'}
		>
			{#if $weatherAi.status === 'loading'}<span
					class="inline-block size-3 animate-pulse rounded-full bg-sky-300 motion-reduce:animate-none"
				></span> Chargement des prévisions…
			{:else if $weatherAi.status === 'error' || renderError}<p>
					{$weatherAi.error ?? renderError}
				</p>
				<button
					class="mt-2 min-h-11 rounded-lg bg-white/10 px-4 hover:bg-white/20"
					onclick={() => weatherAi.retry()}>Réessayer</button
				>
			{:else if tracksMode}<strong class="block">Aucune trajectoire candidate disponible</strong>
				<p class="mt-1 text-xs text-white/65">
					Pour cette initialisation et ce membre. Choisissez une autre publication ou une autre
					couche.
				</p>
			{:else}<strong>Aucune donnée disponible pour cette échéance.</strong>{/if}
		</div>
	{:else if tracksMode && activePoints.length === 0}
		<div role="status" class="bg-glass/95 mx-auto w-fit rounded-lg px-3 py-2 text-xs text-white/80">
			Aucune position candidate à +{$weatherAi.leadHours} h. Les tracés montrent les autres échéances
			disponibles.
		</div>
	{/if}
	{#if $weatherAi.selectedTrack && $weatherAi.status === 'ready' && !empty}
		<section
			aria-label="Détails de la trajectoire candidate"
			class="bg-glass/95 pointer-events-auto mt-2 ml-auto max-w-xs rounded-xl border border-white/20 p-3 text-xs text-white shadow-lg glass-blur"
		>
			<div class="flex items-center gap-2">
				<span class="size-3 rounded-full" style:background={trackColor($weatherAi.selectedTrack)}
				></span><strong class="min-w-0 flex-1 break-all"
					>{selected?.model_track_id ?? $weatherAi.selectedTrack}</strong
				><button
					aria-label="Fermer les détails de la trajectoire"
					class="-my-2 flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"
					onclick={() => weatherAi.selectTrack()}><X class="size-4" /></button
				>
			</div>
			{#if selected}<p class="mt-2 text-white/65">
					{formatForecastDate(selected.valid_time)} · +{$weatherAi.leadHours} h
				</p>
				<dl class="mt-2 grid grid-cols-2 gap-2">
					<div>
						<dt class="text-white/60">Pression</dt>
						<dd>{selected.mslp_hpa.toFixed(1)} hPa</dd>
					</div>
					<div>
						<dt class="text-white/60">Vent maximal</dt>
						<dd>{selected.vmax_ms.toFixed(1)} m/s</dd>
					</div>
					<div>
						<dt class="text-white/60">Position</dt>
						<dd>{selected.latitude.toFixed(2)}°, {selected.longitude.toFixed(2)}°</dd>
					</div>
					<div>
						<dt class="text-white/60">Membre</dt>
						<dd>{selected.member}</dd>
					</div>
				</dl>
			{:else}<p class="mt-2 text-white/65">
					Aucune position de cette trajectoire à l’échéance sélectionnée.
				</p>{/if}
		</section>
	{/if}
</div>

<div class="pointer-events-none fixed right-0 bottom-2 z-50 px-2 md:px-8" style:left="{offset}px">
	<section
		aria-label="Navigation des prévisions cycloniques"
		bind:clientHeight={height}
		class="bg-glass/95 pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-white/20 px-3 py-2 text-white shadow-xl glass-blur"
	>
		<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
			<div>
				<span class="text-white/60">Valide le&nbsp;</span><strong class="font-medium tabular-nums"
					>{formatForecastDate(current?.validTime)}</strong
				>
			</div>
			{#if current}<span class="rounded-md bg-sky-400/15 px-2 py-1 font-semibold text-sky-300"
					>+{current.leadHours} h</span
				>{/if}
		</div>
		<div class="mt-1 flex min-w-0 items-center gap-1">
			<button
				aria-label={playing ? 'Mettre en pause' : 'Animer les prévisions'}
				class="timeline-icon"
				disabled={!$weatherAi.steps.length || $weatherAi.status === 'error'}
				onclick={() => {
					if (!playing && index === $weatherAi.steps.length - 1)
						void weatherAi.selectLead($weatherAi.steps[0].leadHours);
					playing = !playing;
				}}
				>{#if playing}<Pause class="size-4" />{:else}<Play class="size-4" />{/if}</button
			>
			<button
				aria-label="Échéance précédente"
				class="timeline-icon"
				disabled={index <= 0}
				onclick={() => {
					playing = false;
					step(-1);
				}}><ChevronLeft class="size-4" /></button
			>
			<div
				class="flex min-w-0 flex-1 gap-1 overflow-x-auto py-1"
				aria-label="Échéances disponibles"
				bind:this={stepsElement}
			>
				{#each $weatherAi.steps as s (s.leadHours)}
					<button
						data-lead={s.leadHours}
						aria-label="Échéance +{s.leadHours} h"
						aria-pressed={s.leadHours === $weatherAi.leadHours}
						class="min-h-11 min-w-12 flex-1 shrink-0 rounded-lg px-2 text-xs tabular-nums hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300 {s.leadHours ===
						$weatherAi.leadHours
							? 'bg-sky-400/20 font-semibold text-sky-200'
							: 'text-white/70'}"
						onclick={() => {
							playing = false;
							void weatherAi.selectLead(s.leadHours);
						}}>+{s.leadHours} h</button
					>
				{/each}
			</div>
			<button
				aria-label="Échéance suivante"
				class="timeline-icon"
				disabled={index < 0 || index >= $weatherAi.steps.length - 1}
				onclick={() => {
					playing = false;
					step(1);
				}}><ChevronRight class="size-4" /></button
			>
		</div>
		<div class="grid gap-x-4 gap-y-1 border-t border-white/10 pt-2 text-[11px] sm:grid-cols-2">
			<div>
				<span class="text-white/60">Initialisation&nbsp;</span><span class="tabular-nums"
					>{formatForecastDate($weatherAi.run?.init_time)}</span
				>
			</div>
			<div>
				<span class="text-white/60">Publication&nbsp;</span><span class="tabular-nums"
					>{formatForecastDate($weatherAi.catalog?.published_at)}</span
				>
			</div>
		</div>
		{#if $weatherAi.notice}<p role="status" class="mt-1 text-[11px] text-amber-200">
				{$weatherAi.notice}
			</p>{/if}
		{#if tracksMode}<div
				class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/65"
			>
				<span>● Position à l’échéance</span><span>━ Trajet précédent</span><span
					>┄ Suite du trajet</span
				>
			</div>
		{:else if $weatherAi.productId === 'global-mslp-1deg'}<div
				class="mt-2 flex items-center gap-2 text-[10px] text-white/65"
			>
				<span>Pression (hPa)</span><span>940</span>
				<div class="h-1.5 flex-1 rounded-full" style:background={pressureGradient}></div>
				<span>1060</span>
			</div>
		{:else if $weatherAi.productId === 'global-cyclone-existence-1deg'}<div
				class="mt-2 flex items-center gap-2 text-[10px] text-white/65"
			>
				<span>Signal cyclonique · sans unité</span><span>0</span>
				<div class="h-1.5 flex-1 rounded-full" style:background={signalGradient}></div>
				<span>1</span>
			</div>{/if}
	</section>
</div>

<style>
	.timeline-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		border-radius: 8px;
		cursor: pointer;
	}
	.timeline-icon:hover {
		background: #ffffff15;
	}
	.timeline-icon:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.timeline-icon:focus-visible {
		outline: 2px solid #7dd3fc;
	}
	@media (min-width: 640px) {
		.timeline-icon {
			min-width: 44px;
		}
	}
</style>
