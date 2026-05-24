<script lang="ts">
	import { get } from 'svelte/store';
	import { SvelteDate } from 'svelte/reactivity';
	import { onDestroy } from 'svelte';

	import { toast } from 'svelte-sonner';

	import { PLAYBACK_FRAME_MS } from '$lib/constants';
	import { arePlaybackBoundsValid, nextPlaybackFrame, timeStepsBetween } from '$lib/playback';
	import { prefetchData } from '$lib/prefetch';
	import {
		playbackEnd,
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

	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let abortController: AbortController | null = null;

	// Reactive timeSteps derived from current metaJson.
	const timeSteps = $derived(
		$metaJson?.valid_times.map((vt: string) => new SvelteDate(vt)) ?? []
	);

	const boundsValid = $derived(
		arePlaybackBoundsValid($playbackStart, $playbackEnd, timeSteps as Date[])
	);

	const frameCount = $derived(
		timeStepsBetween($playbackStart, $playbackEnd, timeSteps as Date[])
	);

	const currentIdx = $derived(
		boundsValid ? (timeSteps as Date[]).findIndex((s) => s.getTime() === $time.getTime()) : -1
	);

	const startIdx = $derived(
		$playbackStart
			? (timeSteps as Date[]).findIndex((s) => s.getTime() === $playbackStart!.getTime())
			: -1
	);

	const frameIndexLabel = $derived(
		boundsValid && currentIdx >= 0 && startIdx >= 0
			? `${currentIdx - startIdx + 1}/${frameCount}`
			: ''
	);

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
		}
		timeoutId = setTimeout(tick, PLAYBACK_FRAME_MS);
	};

	const setStartHere = () => {
		const t = get(time);
		const end = get(playbackEnd);
		playbackStart.set(t);
		if (end && end.getTime() <= t.getTime()) {
			playbackEnd.set(undefined);
		}
	};

	const setEndHere = () => {
		const t = get(time);
		const start = get(playbackStart);
		playbackEnd.set(t);
		if (start && start.getTime() >= t.getTime()) {
			playbackStart.set(undefined);
		}
	};

	const play = async () => {
		const status = get(playbackStatus);
		const start = get(playbackStart);
		const end = get(playbackEnd);
		const meta = get(metaJson);
		const run = get(modelRun);

		if (!boundsValid || !meta || !run || !start || !end) {
			toast.warning('Define start and end bounds before playing');
			return;
		}

		if (status === 'paused') {
			playbackStatus.set('playing');
			timeoutId = setTimeout(tick, PLAYBACK_FRAME_MS);
			return;
		}

		// idle path → prefetch then play
		playbackStatus.set('prefetching');
		playbackPrefetchProgress.set({ current: 0, total: 0 });
		abortController = new AbortController();

		const result = await prefetchData(
			{
				startDate: start,
				endDate: end,
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
			return;
		}

		if (!result.success) {
			toast.error(result.error ?? 'Prefetch failed');
			playbackStatus.set('idle');
			playbackPrefetchProgress.set(null);
			return;
		}

		// Snap $time to start so playback begins at the first frame.
		time.set(new Date(start));
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

	// Stop on domain/variable/modelRun change — bounds preserved.
	$effect(() => {
		// register deps
		void $selectedDomain;
		void $selectedVariable;
		void $modelRun;
		const s = get(playbackStatus);
		if (s === 'playing' || s === 'prefetching') {
			stopPlayback();
		}
	});

	onDestroy(() => {
		stopPlayback();
	});
</script>

<div class="flex items-center gap-1 text-xs">
	{#if $playbackStatus === 'prefetching'}
		<span class="text-blue-500 animate-pulse">
			{$playbackPrefetchProgress?.current ?? 0}/{$playbackPrefetchProgress?.total ?? 0}
		</span>
		<button
			type="button"
			class="cursor-pointer hover:text-foreground text-foreground/70"
			onclick={cancelPrefetch}
			aria-label="Cancel prefetch"
			title="Cancel prefetch"
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
	{:else}
		<button
			type="button"
			class="cursor-pointer text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
			onclick={setStartHere}
			disabled={$playbackStatus === 'playing'}
			aria-label="Set playback start at current time"
			title="Set playback start at current time"
		>
			[
		</button>
		<button
			type="button"
			class="cursor-pointer text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
			onclick={setEndHere}
			disabled={$playbackStatus === 'playing'}
			aria-label="Set playback end at current time"
			title="Set playback end at current time"
		>
			]
		</button>

		{#if $playbackStatus === 'playing'}
			<button
				type="button"
				class="cursor-pointer text-blue-500 hover:text-foreground"
				onclick={pause}
				aria-label="Pause playback"
				title="Pause playback ({frameIndexLabel})"
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
				class="cursor-pointer text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
				onclick={play}
				disabled={!boundsValid}
				aria-label={$playbackStatus === 'paused' ? 'Resume playback' : 'Play animation'}
				title={boundsValid
					? `Play (${frameCount} frames)`
					: 'Define start [ and end ] bounds first'}
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
			{#if boundsValid}
				<span class="tabular-nums text-foreground/60">{frameCount}f</span>
			{/if}
		{/if}
	{/if}
</div>
