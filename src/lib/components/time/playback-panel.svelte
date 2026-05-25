<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { map as m } from '$lib/stores/map';
	import {
		playbackCurrentIndex,
		playbackEnd,
		playbackFps,
		playbackFrames,
		playbackMode,
		playbackPrefetchProgress,
		playbackPrerenderProgress,
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

	import {
		PLAYBACK_FPS_OPTIONS,
		PLAYBACK_WEBP_QUALITY,
		PRERENDER_FRAME_TIMEOUT_MS,
		PRERENDER_MAX_FAILURE_RATIO,
		type PlaybackFps
	} from '$lib/constants';
	import { changeOMfileURL } from '$lib/layers';
	import {
		MapInteractionLock,
		PlaybackOverlay,
		captureFrame,
		computeFrameIntervalMs,
		decodeFrames,
		estimatePrerenderMs,
		isFailureRateExceeded,
		waitForCommit,
		waitForIdle
	} from '$lib/playback-renderer';
	import { type PrefetchMode, getDateRangeForMode, prefetchData } from '$lib/prefetch';
	import { slotEvents } from '$lib/slot-events';

	let abortController: AbortController | null = null;
	let overlay: PlaybackOverlay | null = null;
	let interactionLock: MapInteractionLock | null = null;

	const playbackModeLabels = new Map<PrefetchMode, string>([
		['today', "Aujourd'hui"],
		['next24h', '24 h suivantes'],
		['prev24h', '24 h précédentes'],
		['completeModelRun', 'Run complet']
	]);

	const frameIndexLabel = $derived.by(() => {
		const total = $playbackFrames.length;
		if (total === 0) return '';
		return `${$playbackCurrentIndex + 1}/${total}`;
	});

	const detachOverlay = () => {
		if (overlay) {
			overlay.detach();
			overlay = null;
		}
		if (interactionLock) {
			interactionLock.thaw();
			interactionLock = null;
		}
		playbackFrames.set([]);
		playbackCurrentIndex.set(0);
	};

	const stopPlayback = () => {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
		detachOverlay();
		playbackStatus.set('idle');
		playbackPrefetchProgress.set(null);
		playbackPrerenderProgress.set(null);
		playbackStart.set(undefined);
		playbackEnd.set(undefined);
	};

	const cancelPrefetch = () => {
		if (abortController) abortController.abort();
	};

	const pause = () => {
		if (get(playbackStatus) === 'playing') {
			overlay?.pause();
			playbackStatus.set('paused');
		}
	};

	const resume = () => {
		if (get(playbackStatus) === 'paused' && overlay) {
			overlay.start(computeFrameIntervalMs(get(playbackFps)));
			playbackStatus.set('playing');
		}
	};

	const play = async () => {
		const status = get(playbackStatus);

		if (status === 'prefetching' || status === 'prerendering') return;
		if (status === 'paused') {
			resume();
			return;
		}

		const meta = get(metaJson);
		const run = get(modelRun);
		const map = get(m);
		if (!meta || !run) {
			toast.warning('Métadonnées de la carte non encore chargées');
			return;
		}
		if (!map) {
			toast.error('Carte non initialisée');
			return;
		}

		const { startDate, endDate } = getDateRangeForMode(get(playbackMode), get(time), meta);
		if (!startDate || !endDate || startDate.getTime() >= endDate.getTime()) {
			toast.warning('Aucune plage lisible pour le mode sélectionné');
			return;
		}

		playbackStart.set(startDate);
		playbackEnd.set(endDate);
		abortController = new AbortController();
		const signal = abortController.signal;

		// --- Phase 1 : prefetch OMfiles ---
		playbackStatus.set('prefetching');
		playbackPrefetchProgress.set({ current: 0, total: 0 });

		const prefetchResult = await prefetchData(
			{
				startDate,
				endDate,
				metaJson: meta,
				modelRun: run,
				domain: get(domainStore),
				variable: get(variableStore),
				signal
			},
			(progress) => playbackPrefetchProgress.set(progress)
		);

		playbackPrefetchProgress.set(null);

		if (prefetchResult.aborted || signal.aborted) {
			stopPlayback();
			return;
		}
		if (!prefetchResult.success) {
			toast.error(prefetchResult.error ?? 'Échec du préchargement');
			stopPlayback();
			return;
		}

		// --- Phase 2 : pre-render frames ---
		const steps = meta.valid_times
			.map((vt: string) => new Date(vt))
			.filter((s) => s.getTime() >= startDate.getTime() && s.getTime() <= endDate.getTime());
		if (steps.length === 0) {
			toast.warning('Aucune frame à pré-rendre');
			stopPlayback();
			return;
		}

		// Verrouille la carte AVANT de commencer la capture — sinon l'utilisateur
		// peut pan/zoom au milieu du rendu et produire des frames incohérentes.
		interactionLock = new MapInteractionLock(map);
		interactionLock.freeze();

		const estimatedSec = Math.round(estimatePrerenderMs(steps.length) / 1000);
		toast.info(
			`Pré-rendu de ${steps.length} frames en cours, la carte sera figée ~${estimatedSec} s`
		);

		playbackStatus.set('prerendering');
		playbackPrerenderProgress.set({ current: 0, total: steps.length });

		const blobs: Blob[] = [];
		let failures = 0;
		for (let i = 0; i < steps.length; i++) {
			if (signal.aborted) {
				stopPlayback();
				return;
			}

			time.set(steps[i]);
			changeOMfileURL();

			try {
				await waitForCommit(slotEvents, PRERENDER_FRAME_TIMEOUT_MS, signal);
				await waitForIdle(map, PRERENDER_FRAME_TIMEOUT_MS);
				const blob = await captureFrame(map, PLAYBACK_WEBP_QUALITY);
				if (blob) {
					blobs.push(blob);
				} else {
					failures++;
				}
			} catch {
				failures++;
			}

			playbackPrerenderProgress.set({ current: i + 1, total: steps.length });

			if (isFailureRateExceeded(failures, i + 1, PRERENDER_MAX_FAILURE_RATIO)) {
				toast.error('Pré-rendu interrompu : trop de frames en échec');
				stopPlayback();
				return;
			}
		}

		playbackPrerenderProgress.set(null);

		if (blobs.length === 0) {
			toast.error('Aucune frame rendue');
			stopPlayback();
			return;
		}

		// --- Phase 3 : démarrer le diaporama ---
		const bitmaps = await decodeFrames(blobs);
		if (signal.aborted) {
			for (const bm of bitmaps) bm.close();
			stopPlayback();
			return;
		}
		if (bitmaps.length === 0) {
			toast.error('Décodage des frames échoué');
			stopPlayback();
			return;
		}

		const container = map.getContainer();
		overlay = new PlaybackOverlay(container);
		overlay.attach(bitmaps, (idx) => playbackCurrentIndex.set(idx));
		playbackFrames.set(bitmaps);
		playbackCurrentIndex.set(0);

		playbackStatus.set('playing');
		overlay.start(computeFrameIntervalMs(get(playbackFps)));
	};

	// Stop sur changement domain/variable/modelRun (cleanup overlay + bitmaps inclus dans stopPlayback)
	$effect(() => {
		void $selectedDomain;
		void $selectedVariable;
		void $modelRun;
		const s = get(playbackStatus);
		if (s === 'playing' || s === 'prefetching' || s === 'prerendering' || s === 'paused') {
			stopPlayback();
		}
	});

	// Reactivity sur changement FPS en cours de lecture
	$effect(() => {
		const fps = $playbackFps;
		if (get(playbackStatus) === 'playing' && overlay) {
			overlay.start(computeFrameIntervalMs(fps));
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
			disabled={$playbackStatus !== 'idle'}
		>
			{playbackModeLabels.get($playbackMode) ?? '24 h suivantes'}
		</Select.Trigger>
		<Select.Content
			class="left-5 border-none max-h-60 bg-glass/65 backdrop-blur-sm"
			sideOffset={4}
			align="end"
		>
			{#each Array.from(playbackModeLabels.entries()) as [value, label] (value)}
				<Select.Item {value} {label} class="cursor-pointer text-xs">{label}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>

	<Select.Root
		type="single"
		value={String($playbackFps)}
		onValueChange={(v) => {
			if (v) playbackFps.set(Number(v) as PlaybackFps);
		}}
	>
		<Select.Trigger
			class="h-4.5! text-xs pl-1.5 pr-0.75 py-0 gap-1 border-none bg-transparent shadow-none hover:bg-accent/50 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer"
			aria-label="Choisir la vitesse de lecture"
			disabled={$playbackStatus === 'prefetching' || $playbackStatus === 'prerendering'}
		>
			{$playbackFps} fps
		</Select.Trigger>
		<Select.Content
			class="left-5 border-none bg-glass/65 backdrop-blur-sm"
			sideOffset={4}
			align="end"
		>
			{#each PLAYBACK_FPS_OPTIONS as fps (fps)}
				<Select.Item value={String(fps)} label={`${fps} fps`} class="cursor-pointer text-xs">
					{fps} fps
				</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>

	{#if $playbackStatus === 'prefetching'}
		<span class="text-blue-500 animate-pulse tabular-nums">
			Préchargement {$playbackPrefetchProgress?.current ?? 0}/{$playbackPrefetchProgress?.total ??
				0}
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
	{:else if $playbackStatus === 'prerendering'}
		<span class="text-blue-500 animate-pulse tabular-nums">
			Rendu {$playbackPrerenderProgress?.current ?? 0}/{$playbackPrerenderProgress?.total ?? 0}
		</span>
		<button
			type="button"
			class="cursor-pointer hover:text-foreground text-foreground/70 w-4 h-4.5 flex items-center justify-center"
			onclick={cancelPrefetch}
			aria-label="Annuler le pré-rendu"
			title="Annuler le pré-rendu"
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
		{#if $playbackStatus === 'paused'}
			<span class="tabular-nums text-foreground/60">{frameIndexLabel}</span>
		{/if}
	{/if}
</div>
