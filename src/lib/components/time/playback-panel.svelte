<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { map as m } from '$lib/stores/map';
	import { currentOmUrl } from '$lib/stores/om-url';
	import {
		playbackCurrentIndex,
		playbackEnd,
		playbackExportProgress,
		playbackFps,
		playbackFrames,
		playbackMode,
		playbackPrefetchProgress,
		playbackPrerenderProgress,
		playbackStart,
		playbackStatus
	} from '$lib/stores/playback';
	import { exportFrameVisible } from '$lib/stores/preferences';
	import { metaJson, modelRun, time } from '$lib/stores/time';
	import {
		domain as domainStore,
		selectedDomain,
		selectedVariable,
		variable as variableStore
	} from '$lib/stores/variables';

	import * as Select from '$lib/components/ui/select';

	import { playSeriesEnd, playSeriesStart, playShutter } from '$lib/capture-sound';
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
	import {
		type PngExportFormat,
		type ZipFileEntry,
		captureWatermarkedPng,
		createStoredZip,
		downloadBlob,
		formatUtcStamp,
		sanitizeFilenamePart
	} from '$lib/png-export';
	import { type PrefetchMode, getDateRangeForMode, prefetchData } from '$lib/prefetch';
	import { slotEvents } from '$lib/slot-events';
	import { formatISOWithoutTimezone } from '$lib/time-format';
	import { buildWatermarkDetails, formatLeadTimeForFilename } from '$lib/watermark-details';

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
		playbackExportProgress.set(null);
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

		if (
			status === 'prefetching' ||
			status === 'prerendering' ||
			status === 'exporting' ||
			status === 'playing'
		)
			return;
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

			const previousOmUrl = get(currentOmUrl);
			time.set(steps[i]);
			changeOMfileURL();
			// changeOMfileURL court-circuite quand l'URL ne change pas (frame déjà
			// affichée). Dans ce cas, aucun event commit ne sera émis — on saute
			// directement au waitForIdle qui résoudra vite si la map est déjà au repos.
			const triggeredLoad = get(currentOmUrl) !== previousOmUrl;

			try {
				if (triggeredLoad) {
					await waitForCommit(slotEvents, PRERENDER_FRAME_TIMEOUT_MS, signal);
				}
				await waitForIdle(map, PRERENDER_FRAME_TIMEOUT_MS, signal);
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

			// N'applique le seuil d'échec qu'après assez d'échantillons : un échec sur
			// la première frame (cas rare) ne doit pas tuer toute la lecture.
			if (i + 1 >= 5 && isFailureRateExceeded(failures, i + 1, PRERENDER_MAX_FAILURE_RATIO)) {
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

		try {
			const container = map.getContainer();
			overlay = new PlaybackOverlay(container);
			overlay.attach(bitmaps, (idx) => playbackCurrentIndex.set(idx));
			playbackFrames.set(bitmaps);
			playbackCurrentIndex.set(0);

			playbackStatus.set('playing');
			overlay.start(computeFrameIntervalMs(get(playbackFps)));
		} catch {
			for (const bm of bitmaps) bm.close();
			toast.error("Impossible d'initialiser l'overlay de lecture");
			stopPlayback();
			return;
		}
	};

	const getPlaybackSteps = () => {
		const meta = get(metaJson);
		const currentTime = get(time);
		if (!meta) return { meta, startDate: undefined, endDate: undefined, steps: [] as Date[] };

		const { startDate, endDate } = getDateRangeForMode(get(playbackMode), currentTime, meta);
		const steps = meta.valid_times
			.map((vt: string) => new Date(vt))
			.filter((s) => s.getTime() >= startDate.getTime() && s.getTime() <= endDate.getTime());

		return { meta, startDate, endDate, steps };
	};

	const exportPngArchive = async () => {
		const status = get(playbackStatus);
		if (status !== 'idle' && status !== 'paused') return;

		// Même flux à deux temps que l'export unitaire « PNG » : premier clic pour
		// afficher le cadre carré, second clic pour lancer l'export de la série.
		if (!get(exportFrameVisible)) {
			exportFrameVisible.set(true);
			toast.info('Cadrez la carte, puis cliquez à nouveau sur Série');
			return;
		}

		const run = get(modelRun);
		const map = get(m);
		const { meta, startDate, endDate, steps } = getPlaybackSteps();
		if (!meta || !run) {
			toast.warning('Métadonnées de la carte non encore chargées');
			return;
		}
		if (!map) {
			toast.error('Carte non initialisée');
			return;
		}
		if (!startDate || !endDate || steps.length === 0) {
			toast.warning('Aucune frame à exporter');
			return;
		}

		detachOverlay();
		playbackStart.set(startDate);
		playbackEnd.set(endDate);
		abortController = new AbortController();
		const signal = abortController.signal;
		const originalTime = new Date(get(time));
		let timeMutated = false;

		playbackStatus.set('prefetching');
		playbackPrefetchProgress.set({ current: 0, total: 0 });

		try {
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
			if (prefetchResult.aborted || signal.aborted) return;
			if (!prefetchResult.success) {
				toast.error(prefetchResult.error ?? "Échec du préchargement avant l'export PNG");
				return;
			}

			interactionLock = new MapInteractionLock(map);
			interactionLock.freeze();
			playbackStatus.set('exporting');
			playbackExportProgress.set({ current: 0, total: steps.length });
			toast.info(`Export PNG de ${steps.length} frames en cours`);
			playSeriesStart();

			const entries: ZipFileEntry[] = [];
			// On n'arrive ici qu'avec le cadre carré affiché : la série est croppée carré.
			const pngFormat: PngExportFormat = 'square';
			const domainLabel = get(selectedDomain).label ?? get(domainStore);
			const variableLabel = get(selectedVariable).label ?? get(variableStore);
			const basename = [
				sanitizeFilenamePart(get(domainStore)),
				sanitizeFilenamePart(get(variableStore)),
				formatUtcStamp(run)
			].join('_');

			let failures = 0;
			for (let i = 0; i < steps.length; i++) {
				if (signal.aborted) return;

				const previousOmUrl = get(currentOmUrl);
				timeMutated = true;
				time.set(steps[i]);
				changeOMfileURL();
				const triggeredLoad = get(currentOmUrl) !== previousOmUrl;

				try {
					if (triggeredLoad) {
						await waitForCommit(slotEvents, PRERENDER_FRAME_TIMEOUT_MS, signal);
					}
					await waitForIdle(map, PRERENDER_FRAME_TIMEOUT_MS, signal);
					const png = await captureWatermarkedPng(
						map,
						buildWatermarkDetails(run, steps[i], i, steps.length, domainLabel, variableLabel),
						pngFormat
					);
					entries.push({
						name: `${basename}_${formatLeadTimeForFilename(
							run,
							steps[i]
						)}_${formatISOWithoutTimezone(steps[i])}.png`,
						blob: png
					});
				} catch {
					failures++;
				}

				playbackExportProgress.set({ current: i + 1, total: steps.length });
				if (i + 1 >= 5 && isFailureRateExceeded(failures, i + 1, PRERENDER_MAX_FAILURE_RATIO)) {
					toast.error('Export PNG interrompu : trop de frames en échec');
					return;
				}
			}

			if (entries.length === 0) {
				toast.error('Aucune image PNG générée');
				return;
			}

			try {
				const zip = await createStoredZip(entries);
				downloadBlob(zip, `${basename}_carre_png.zip`);
				toast.success(`${entries.length} PNG exportés`);
				exportFrameVisible.set(false);
				playSeriesEnd();
			} catch {
				toast.error("Impossible de créer l'archive PNG");
			}
		} finally {
			interactionLock?.thaw();
			interactionLock = null;
			abortController = null;
			playbackStatus.set('idle');
			playbackPrefetchProgress.set(null);
			playbackExportProgress.set(null);
			playbackStart.set(undefined);
			playbackEnd.set(undefined);
			if (timeMutated) {
				time.set(originalTime);
				changeOMfileURL();
			}
		}
	};

	const exportCurrentSquarePng = async () => {
		const status = get(playbackStatus);
		if (status !== 'idle' && status !== 'paused') return;

		if (!get(exportFrameVisible)) {
			exportFrameVisible.set(true);
			toast.info('Cadrez la carte, puis cliquez à nouveau sur PNG');
			return;
		}

		const run = get(modelRun);
		const map = get(m);
		const currentTime = get(time);
		if (!run) {
			toast.warning('Run non encore chargé');
			return;
		}
		if (!map) {
			toast.error('Carte non initialisée');
			return;
		}

		try {
			if (!map.loaded()) {
				await waitForIdle(map, PRERENDER_FRAME_TIMEOUT_MS);
			}
			const domainValue = get(domainStore);
			const variableValue = get(variableStore);
			const domainLabel = get(selectedDomain).label ?? domainValue;
			const variableLabel = get(selectedVariable).label ?? variableValue;
			const png = await captureWatermarkedPng(
				map,
				buildWatermarkDetails(run, currentTime, 0, 1, domainLabel, variableLabel),
				'square'
			);
			playShutter();
			const filename = [
				'infoclimat',
				sanitizeFilenamePart(domainValue),
				sanitizeFilenamePart(variableValue),
				formatUtcStamp(run),
				formatLeadTimeForFilename(run, currentTime),
				formatISOWithoutTimezone(currentTime),
				'square'
			].join('_');
			downloadBlob(png, `${filename}.png`);
			exportFrameVisible.set(false);
			toast.success('PNG carré exporté');
		} catch (error) {
			console.error('Square PNG export failed', error);
			toast.error("Impossible d'exporter le PNG carré");
		}
	};

	// Stop sur changement domain/variable/modelRun (cleanup overlay + bitmaps inclus dans stopPlayback)
	$effect(() => {
		void $selectedDomain;
		void $selectedVariable;
		void $modelRun;
		const s = get(playbackStatus);
		if (
			s === 'playing' ||
			s === 'prefetching' ||
			s === 'prerendering' ||
			s === 'exporting' ||
			s === 'paused'
		) {
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
	{:else if $playbackStatus === 'exporting'}
		<span class="text-blue-500 animate-pulse tabular-nums">
			PNG {$playbackExportProgress?.current ?? 0}/{$playbackExportProgress?.total ?? 0}
		</span>
		<button
			type="button"
			class="cursor-pointer hover:text-foreground text-foreground/70 w-4 h-4.5 flex items-center justify-center"
			onclick={cancelPrefetch}
			aria-label="Annuler l'export PNG"
			title="Annuler l'export PNG"
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
			class="cursor-pointer min-w-6 h-4.5 flex items-center justify-center text-[10px] font-bold tabular-nums {$exportFrameVisible
				? 'text-blue-500'
				: 'text-foreground/70 hover:text-foreground'}"
			onclick={exportCurrentSquarePng}
			aria-label="Exporter la carte courante en PNG carré"
			title={$exportFrameVisible
				? 'Exporter le cadre en PNG carré'
				: "Afficher le cadre d'export PNG carré"}
		>
			PNG
		</button>
		<button
			type="button"
			class="cursor-pointer min-w-7 h-4.5 flex items-center justify-center text-[10px] font-bold tabular-nums {$exportFrameVisible
				? 'text-blue-500'
				: 'text-foreground/60 hover:text-foreground'}"
			onclick={exportPngArchive}
			aria-label="Exporter la série de cartes en PNG carré"
			title={$exportFrameVisible
				? 'Exporter la série dans le cadre carré'
				: "Afficher le cadre d'export PNG carré"}
		>
			Série
		</button>
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
