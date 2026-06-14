<script lang="ts">
	import { get } from 'svelte/store';

	import FilmIcon from '@lucide/svelte/icons/film';
	import { omProtocol } from '@openmeteo/weather-map-layer';
	import { toast } from 'svelte-sonner';

	import { map as mapStore } from '$lib/stores/map';
	import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import { currentOmUrl } from '$lib/stores/om-url';
	import { bottomChromeHeight } from '$lib/stores/preferences';
	import { prefetchMode } from '$lib/stores/prefetch';
	import { metaJson, modelRun, time } from '$lib/stores/time';
	import {
		domain as domainStore,
		selectedDomain,
		selectedVariable,
		variable as variableStore
	} from '$lib/stores/variables';

	import { computeCaptureRect } from '$lib/capture-geometry';
	import {
		PRERENDER_FRAME_TIMEOUT_MS,
		VIDEO_EXPORT_FPS,
		VIDEO_EXPORT_FRAME_WARN
	} from '$lib/constants';
	import { changeOMfileURL } from '$lib/layers';
	import { renderFrameAt } from '$lib/playback-renderer';
	import {
		downloadBlob,
		drawCaptureFrame,
		formatUtcStamp,
		getExportDimensions,
		loadInfoclimatLogo,
		sanitizeFilenamePart
	} from '$lib/png-export';
	import { getDateRangeForMode } from '$lib/prefetch';
	import { shareOrDownload } from '$lib/share';
	import { slotEvents } from '$lib/slot-events';
	import { formatISOWithoutTimezone } from '$lib/time-format';
	import { getOMUrlFor, updateUrl } from '$lib/url';
	import {
		createVideoSink,
		detectMp4Codec,
		exportAnimation,
		getExportFrames
	} from '$lib/video-export';
	import { buildWatermarkDetails, formatLeadTimeForFilename } from '$lib/watermark-details';

	interface Props {
		variant?: 'bar' | 'fab';
	}
	let { variant = 'bar' }: Props = $props();

	let supported = $state(true);
	let phase = $state<'idle' | 'confirm' | 'rendering'>('idle');
	let progress = $state({ current: 0, total: 0 });
	let pendingFrames: Date[] = $state([]);
	let abort: AbortController | null = null;

	// Détection de support au montage (H.264 via WebCodecs).
	$effect(() => {
		void detectMp4Codec(getExportDimensions('landscape')).then((codec) => {
			supported = codec !== null;
		});
	});

	// Avance la carte sur une échéance (mêmes effets que playbackAdvance, sans le
	// scroll UI) : store time + URL + rechargement des couches.
	const advance = (date: Date) => {
		time.set(new Date(date));
		updateUrl('time', formatISOWithoutTimezone(date));
		changeOMfileURL();
	};

	const run = async () => {
		const map = get(mapStore);
		const modelRunValue = get(modelRun);
		const meta = get(metaJson);
		if (!map || !modelRunValue || !meta) {
			toast.warning('Carte ou run non chargés');
			phase = 'idle';
			return;
		}

		phase = 'rendering';
		progress = { current: 0, total: pendingFrames.length };
		const controller = new AbortController();
		abort = controller;
		const initialTime = get(time);

		const rect = computeCaptureRect(
			window.innerWidth,
			window.innerHeight - get(bottomChromeHeight)
		);
		const region = { ...rect, viewportW: window.innerWidth, viewportH: window.innerHeight };
		const dims = getExportDimensions(rect.orientation);

		const domainValue = get(domainStore);
		const variableValue = get(variableStore);
		const domainLabel = get(selectedDomain).label ?? domainValue;
		const variableLabel = get(selectedVariable).label ?? variableValue;

		try {
			const codec = await detectMp4Codec(dims);
			if (!codec) {
				toast.error('Export vidéo non supporté par ce navigateur');
				return;
			}

			const canvas = document.createElement('canvas');
			canvas.width = dims.width;
			canvas.height = dims.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('2D canvas context unavailable');
			const logo = await loadInfoclimatLogo();
			const sink = await createVideoSink(canvas, codec);

			const signal = controller.signal;
			// La 1ʳᵉ frame égale souvent le `time` courant : sans invalidation,
			// changeOMfileURL() dédupe sur currentOmUrl et n'émet pas de `commit`,
			// donc renderFrameAt timeout. On force le rechargement de la 1ʳᵉ frame.
			currentOmUrl.set('');

			// Pré-décodage pipeliné : on peuple `state.data` du protocole `om://` pour les
			// frames à venir (look-ahead), en parallèle et toujours en avance sur le curseur
			// de rendu. Chaque frame rendue est alors « chaude » (~250 ms GPU) au lieu de
			// « froide » (~1 s+). Borné par PREDECODE_LOOKAHEAD → respecte le cap
			// MAX_STATES_WITH_DATA=24 du protocole (marche aussi pour les plages > 24).
			const PREDECODE_LOOKAHEAD = 8;
			const settings = get(omProtocolSettings);
			const decodeJobs: Array<Promise<void> | undefined> = [];
			const ensureDecoded = (i: number): Promise<void> => {
				if (i < 0 || i >= pendingFrames.length) return Promise.resolve();
				let job = decodeJobs[i];
				if (!job) {
					const omUrl = getOMUrlFor(variableValue, pendingFrames[i]);
					job = omUrl
						? omProtocol({ url: 'om://' + omUrl, type: 'json' }, controller, settings)
								.then(() => undefined)
								.catch(() => undefined)
						: Promise.resolve();
					decodeJobs[i] = job;
				}
				return job;
			};
			// Amorce le 1er lot avant la boucle de rendu.
			for (let i = 0; i <= PREDECODE_LOOKAHEAD && i < pendingFrames.length; i++) {
				void ensureDecoded(i);
			}

			let renderCursor = 0;
			const exportStart = performance.now();
			const blob = await exportAnimation({
				frames: pendingFrames,
				fps: VIDEO_EXPORT_FPS,
				sink,
				renderFrame: async (date) => {
					const i = renderCursor++;
					void ensureDecoded(i + PREDECODE_LOOKAHEAD); // garde le look-ahead devant
					await ensureDecoded(i); // s'assure que la frame courante est chaude
					const t = performance.now();
					await renderFrameAt({
						map,
						events: slotEvents,
						advance,
						date,
						timeoutMs: PRERENDER_FRAME_TIMEOUT_MS,
						signal
					});
					console.log(
						`[video-export] frame ${i + 1}/${pendingFrames.length} en ${Math.round(
							performance.now() - t
						)}ms`
					);
				},
				drawFrame: (date, index, total) => {
					const details = buildWatermarkDetails(
						modelRunValue,
						date,
						index,
						total,
						domainLabel,
						variableLabel
					);
					drawCaptureFrame(ctx, map.getCanvas(), region, details, logo);
				},
				onProgress: (current, total) => {
					progress = { current, total };
				},
				restore: () => advance(initialTime),
				signal
			});
			console.log(
				`[video-export] ${pendingFrames.length} frames en ${Math.round(
					performance.now() - exportStart
				)}ms (${Math.round((performance.now() - exportStart) / pendingFrames.length)}ms/frame)`
			);

			const filename =
				[
					'infoclimat',
					sanitizeFilenamePart(domainValue),
					sanitizeFilenamePart(variableValue),
					formatUtcStamp(modelRunValue),
					formatLeadTimeForFilename(modelRunValue, pendingFrames[0]),
					'anim'
				].join('_') + '.mp4';

			const file = new File([blob], filename, { type: 'video/mp4' });
			const result = await shareOrDownload(navigator, file, (f) => downloadBlob(blob, f.name));
			if (result === 'downloaded') toast.success('Vidéo enregistrée');
			else if (result === 'shared') toast.success('Vidéo partagée');
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				toast.info('Export annulé');
			} else {
				console.error('Video export failed', error);
				toast.error("L'export vidéo a échoué. Réessayer.");
			}
		} finally {
			abort = null;
			phase = 'idle';
		}
	};

	const onClick = () => {
		if (phase !== 'idle') return;
		if (!supported) {
			toast.error('Export vidéo non supporté par ce navigateur');
			return;
		}
		const meta = get(metaJson);
		if (!meta) {
			toast.warning('Run non encore chargé');
			return;
		}
		const { startDate, endDate } = getDateRangeForMode(get(prefetchMode), get(time), meta);
		pendingFrames = getExportFrames(meta, startDate, endDate);
		if (pendingFrames.length === 0) {
			toast.warning('Aucune échéance dans la plage sélectionnée');
			return;
		}
		if (pendingFrames.length > VIDEO_EXPORT_FRAME_WARN) {
			phase = 'confirm';
			return;
		}
		void run();
	};

	// L'abort fait lever AbortError dans run(), dont le `finally` repasse phase à 'idle'.
	const cancel = () => {
		abort?.abort();
	};

	const label = 'Exporter en vidéo';
	const pct = $derived(progress.total ? Math.round((progress.current / progress.total) * 100) : 0);
</script>

{#if variant === 'fab'}
	<button
		type="button"
		onclick={onClick}
		disabled={!supported || phase !== 'idle'}
		aria-label={label}
		class="flex size-11 cursor-pointer items-center justify-center rounded-full bg-[#0d47a1]/85 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-md transition-transform duration-150 hover:bg-[#0d47a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
	>
		<FilmIcon class="size-5" aria-hidden="true" />
	</button>
{:else}
	<button
		type="button"
		onclick={onClick}
		disabled={!supported || phase !== 'idle'}
		aria-label={label}
		title={supported ? label : 'Export vidéo non supporté par ce navigateur'}
		class="flex h-11 md:h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 bg-[#0d47a1]/85 px-3 text-sm font-semibold text-white shadow-md backdrop-blur-md transition-transform duration-150 hover:bg-[#0d47a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
	>
		<FilmIcon class="size-4" aria-hidden="true" />
		Vidéo
	</button>
{/if}

{#if phase !== 'idle'}
	<div
		class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="w-80 max-w-[90vw] rounded-xl bg-glass/80 p-5 text-white shadow-xl ring-1 ring-white/15 backdrop-blur-xl"
		>
			{#if phase === 'confirm'}
				<p class="mb-4 text-sm">
					Cette plage contient {pendingFrames.length} images : la vidéo sera longue et sa préparation
					peut prendre un moment. Continuer ?
				</p>
				<div class="flex justify-end gap-2">
					<button
						type="button"
						class="rounded-lg px-3 py-1.5 text-sm text-white/80 hover:text-white"
						onclick={() => (phase = 'idle')}>Annuler</button
					>
					<button
						type="button"
						class="rounded-lg bg-[#0d47a1] px-3 py-1.5 text-sm font-semibold"
						onclick={() => void run()}>Continuer</button
					>
				</div>
			{:else}
				<p class="mb-3 text-sm font-semibold">Préparation de la vidéo…</p>
				<div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
					<div class="h-full rounded-full bg-[#3b82f6] transition-all" style="width: {pct}%"></div>
				</div>
				<p class="mb-4 text-xs text-white/70">{progress.current} / {progress.total} images</p>
				<div class="flex justify-end">
					<button
						type="button"
						class="rounded-lg px-3 py-1.5 text-sm text-white/80 hover:text-white"
						onclick={cancel}>Annuler</button
					>
				</div>
			{/if}
		</div>
	</div>
{/if}
