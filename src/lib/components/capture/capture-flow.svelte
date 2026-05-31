<script lang="ts">
	import { get } from 'svelte/store';

	import CameraIcon from '@lucide/svelte/icons/camera';
	import { toast } from 'svelte-sonner';

	import { map as mapStore } from '$lib/stores/map';
	import { exportFrameVisible } from '$lib/stores/preferences';
	import { modelRun, time } from '$lib/stores/time';
	import {
		domain as domainStore,
		selectedDomain,
		selectedVariable,
		variable as variableStore
	} from '$lib/stores/variables';

	import { playShutter } from '$lib/capture-sound';
	import { PRERENDER_FRAME_TIMEOUT_MS } from '$lib/constants';
	import { waitForIdle } from '$lib/playback-renderer';
	import {
		captureWatermarkedPng,
		downloadBlob,
		formatUtcStamp,
		sanitizeFilenamePart
	} from '$lib/png-export';
	import { shareOrDownload } from '$lib/share';
	import { formatISOWithoutTimezone } from '$lib/time-format';
	import { buildWatermarkDetails, formatLeadTimeForFilename } from '$lib/watermark-details';

	interface Props {
		variant?: 'bar' | 'fab';
	}
	let { variant = 'bar' }: Props = $props();

	let busy = $state(false);

	// Cadre carré affiché → le bouton bascule en action « Exporter ».
	const framing = $derived($exportFrameVisible);

	const capture = async () => {
		const map = get(mapStore);
		if (!map) {
			toast.error('Carte non initialisée');
			return;
		}
		const run = get(modelRun);
		if (!run) {
			toast.warning('Run non encore chargé');
			return;
		}

		busy = true;
		try {
			if (!map.loaded()) {
				await waitForIdle(map, PRERENDER_FRAME_TIMEOUT_MS);
			}

			const currentTime = get(time);
			const domainValue = get(domainStore);
			const variableValue = get(variableStore);
			const domainLabel = get(selectedDomain).label ?? domainValue;
			const variableLabel = get(selectedVariable).label ?? variableValue;

			const details = buildWatermarkDetails(run, currentTime, 0, 1, domainLabel, variableLabel);
			const blob = await captureWatermarkedPng(map, details, 'square');
			playShutter();

			const filename =
				[
					'infoclimat',
					sanitizeFilenamePart(domainValue),
					sanitizeFilenamePart(variableValue),
					formatUtcStamp(run),
					formatLeadTimeForFilename(run, currentTime),
					formatISOWithoutTimezone(currentTime),
					'square'
				].join('_') + '.png';

			const file = new File([blob], filename, { type: 'image/png' });
			const result = await shareOrDownload(navigator, file, (f) => downloadBlob(blob, f.name));

			if (result === 'downloaded') toast.success('Image enregistrée');
			else if (result === 'shared') toast.success('Image partagée');

			exportFrameVisible.set(false);
		} catch (error) {
			console.error('Capture failed', error);
			toast.error('La capture a échoué. Réessayer.');
		} finally {
			busy = false;
		}
	};

	const onClick = () => {
		if (busy) return;
		// Premier clic : afficher le cadre carré pour cadrer. Second clic : capturer.
		if (!get(exportFrameVisible)) {
			exportFrameVisible.set(true);
			toast.info('Cadrez la carte, puis cliquez à nouveau pour capturer');
			return;
		}
		void capture();
	};

	const label = $derived(framing ? 'Exporter la carte' : 'Capturer la carte');
</script>

{#if variant === 'fab'}
	<button
		type="button"
		onclick={onClick}
		disabled={busy}
		aria-label={label}
		class="flex size-11 cursor-pointer items-center justify-center rounded-full bg-[#0d47a1]/85 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-md transition-transform duration-150 hover:bg-[#0d47a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
	>
		<CameraIcon class="size-5" aria-hidden="true" />
	</button>
{:else}
	<button
		type="button"
		onclick={onClick}
		disabled={busy}
		aria-label={label}
		class="flex h-11 md:h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 bg-[#0d47a1]/85 px-3 text-sm font-semibold text-white shadow-md backdrop-blur-md transition-transform duration-150 hover:bg-[#0d47a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
	>
		<CameraIcon class="size-4" aria-hidden="true" />
		{framing ? 'Exporter' : 'Capturer'}
	</button>
{/if}
