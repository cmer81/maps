<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import {
		playbackEnd,
		playbackMode,
		playbackPrefetchProgress,
		playbackStart,
		playbackStatus
	} from '$lib/stores/playback';
	import { metaJson, modelRun, time } from '$lib/stores/time';
	import {
		domain as domainStore,
		selectedDomain,
		selectedVariable,
		variable as variableStore
	} from '$lib/stores/variables';

	import * as Select from '$lib/components/ui/select';

	import { PLAYBACK_FRAME_MS } from '$lib/constants';
	import { changeOMfileURL } from '$lib/layers';
	import { nextPlaybackFrame, timeStepsBetween } from '$lib/playback';
	import { type PrefetchMode, getDateRangeForMode, prefetchData } from '$lib/prefetch';

	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let abortController: AbortController | null = null;

	const playbackModeLabels = new Map<PrefetchMode, string>([
		['today', "Aujourd'hui"],
		['next24h', '24 h suivantes'],
		['prev24h', '24 h précédentes'],
		['completeModelRun', 'Run complet']
	]);

	const frameCount = $derived(
		timeStepsBetween(
			$playbackStart,
			$playbackEnd,
			($metaJson?.valid_times ?? []).map((vt: string) => new Date(vt))
		)
	);

	const frameIndexLabel = $derived.by(() => {
		if (!$playbackStart || !$playbackEnd) return '';
		const steps = ($metaJson?.valid_times ?? []).map((vt: string) => new Date(vt));
		const startMs = $playbackStart.getTime();
		const startIdx = steps.findIndex((s) => s.getTime() >= startMs);
		const currentIdx = steps.findIndex((s) => s.getTime() === $time.getTime());
		if (startIdx < 0 || currentIdx < 0) return '';
		return `${currentIdx - startIdx + 1}/${frameCount}`;
	});

	const stopPlayback = () => {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
		}
		playbackStatus.set('idle');
		playbackPrefetchProgress.set(null);
		playbackStart.set(undefined);
		playbackEnd.set(undefined);
	};

	const tick = () => {
		if (get(playbackStatus) !== 'playing') return;
		const steps = (get(metaJson)?.valid_times ?? []).map((vt: string) => new Date(vt));
		const start = get(playbackStart);
		const end = get(playbackEnd);
		if (!start || !end || steps.length === 0) {
			playbackStatus.set('paused');
			return;
		}
		const next = nextPlaybackFrame(get(time), start, end, steps);
		if (next) {
			time.set(next);
			changeOMfileURL();
		}
		timeoutId = setTimeout(tick, PLAYBACK_FRAME_MS);
	};

	const play = async () => {
		const status = get(playbackStatus);

		if (status === 'prefetching') return;

		if (status === 'paused') {
			playbackStatus.set('playing');
			timeoutId = setTimeout(tick, PLAYBACK_FRAME_MS);
			return;
		}

		const meta = get(metaJson);
		const run = get(modelRun);
		if (!meta || !run) {
			toast.warning('Métadonnées de la carte non encore chargées');
			return;
		}

		const { startDate, endDate } = getDateRangeForMode(get(playbackMode), get(time), meta);
		if (!startDate || !endDate || startDate.getTime() >= endDate.getTime()) {
			toast.warning('Aucune plage lisible pour le mode sélectionné');
			return;
		}

		playbackStart.set(startDate);
		playbackEnd.set(endDate);
		playbackStatus.set('prefetching');
		playbackPrefetchProgress.set({ current: 0, total: 0 });
		abortController = new AbortController();

		const result = await prefetchData(
			{
				startDate,
				endDate,
				metaJson: meta,
				modelRun: run,
				domain: get(domainStore),
				variable: get(variableStore),
				signal: abortController.signal
			},
			(progress) => playbackPrefetchProgress.set(progress)
		);

		abortController = null;

		if (result.aborted) {
			playbackStatus.set('idle');
			playbackPrefetchProgress.set(null);
			playbackStart.set(undefined);
			playbackEnd.set(undefined);
			return;
		}

		if (!result.success) {
			toast.error(result.error ?? 'Échec du préchargement');
			playbackStatus.set('idle');
			playbackPrefetchProgress.set(null);
			playbackStart.set(undefined);
			playbackEnd.set(undefined);
			return;
		}

		// Snap $time to the first frame in the range so playback always starts there.
		const steps = meta.valid_times.map((vt: string) => new Date(vt));
		const firstFrame = steps.find((s) => s.getTime() >= startDate.getTime());
		if (firstFrame) {
			time.set(firstFrame);
			changeOMfileURL();
		}

		playbackPrefetchProgress.set(null);
		playbackStatus.set('playing');
		timeoutId = setTimeout(tick, PLAYBACK_FRAME_MS);
	};

	const pause = () => {
		if (get(playbackStatus) === 'playing') {
			playbackStatus.set('paused');
		}
	};

	const cancelPrefetch = () => {
		if (abortController) abortController.abort();
	};

	// Stop on domain/variable/modelRun change.
	$effect(() => {
		void $selectedDomain;
		void $selectedVariable;
		void $modelRun;
		const s = get(playbackStatus);
		if (s === 'playing' || s === 'prefetching' || s === 'paused') {
			stopPlayback();
		}
	});

	onDestroy(() => {
		stopPlayback();
	});
</script>

<div class="flex items-center gap-0.5 text-xs">
	<Select.Root
		type="single"
		value={$playbackMode}
		onValueChange={(v) => {
			if (v) playbackMode.set(v as PrefetchMode);
		}}
	>
		<Select.Trigger
			class="h-4.5! text-xs pl-1.5 pr-0.75 py-0 gap-1 border-none bg-transparent shadow-none hover:bg-accent/50 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer"
			aria-label="Choisir la plage de lecture"
			disabled={$playbackStatus === 'playing' || $playbackStatus === 'prefetching'}
		>
			{playbackModeLabels.get($playbackMode) ?? '24 h suivantes'}
		</Select.Trigger>
		<Select.Content
			class="left-5 border-none max-h-60 bg-glass/65 backdrop-blur-sm"
			sideOffset={4}
			align="end"
		>
			{#each Array.from(playbackModeLabels.entries()) as [value, label] (value)}
				<Select.Item {value} {label} class="cursor-pointer text-xs">
					{label}
				</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>

	{#if $playbackStatus === 'prefetching'}
		<span class="text-blue-500 animate-pulse tabular-nums">
			{$playbackPrefetchProgress?.current ?? 0}/{$playbackPrefetchProgress?.total ?? 0}
		</span>
		<button
			type="button"
			class="cursor-pointer hover:text-foreground text-foreground/70 w-4 h-4.5 flex items-center justify-center"
			onclick={cancelPrefetch}
			aria-label="Annuler le préchargement"
			title="Annuler le préchargement"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	{:else if $playbackStatus === 'playing'}
		<button
			type="button"
			class="cursor-pointer text-blue-500 hover:text-foreground w-4 h-4.5 flex items-center justify-center"
			onclick={pause}
			aria-label="Mettre en pause la lecture"
			title="Mettre en pause la lecture ({frameIndexLabel})"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="currentColor"
				stroke="none"
			>
				<rect x="6" y="5" width="4" height="14" />
				<rect x="14" y="5" width="4" height="14" />
			</svg>
		</button>
		<span class="tabular-nums text-foreground/60">{frameIndexLabel}</span>
	{:else}
		<button
			type="button"
			class="cursor-pointer text-foreground/70 hover:text-foreground w-4 h-4.5 flex items-center justify-center"
			onclick={play}
			aria-label={$playbackStatus === 'paused' ? 'Reprendre la lecture' : "Lancer l'animation"}
			title={$playbackStatus === 'paused' ? 'Reprendre la lecture' : "Lancer l'animation"}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="currentColor"
				stroke="none"
			>
				<polygon points="6,4 20,12 6,20" />
			</svg>
		</button>
	{/if}
</div>
