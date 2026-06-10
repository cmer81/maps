<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { metaJson, modelRun, time } from '$lib/stores/time';
	import { domain as domainStore, variable as variableStore } from '$lib/stores/variables';

	import { createPlaybackEngine } from '$lib/playback-engine';
	import { prefetchData } from '$lib/prefetch';
	import { slotEvents } from '$lib/slot-events';

	// L'avancée d'échéance est déléguée à time-selector pour réutiliser son
	// chemin de mise à jour (store time + URL + rechargement + centrage).
	let { advance }: { advance: (date: Date) => void } = $props();

	let playing = $state(false);
	let prefetchAbort: AbortController | null = null;

	// Au lancement de la lecture, on précharge en arrière-plan la plage à jouer
	// (échéance courante → fin de run) pour lisser l'animation sur réseau lent.
	// Fire-and-forget : la lecture n'attend pas, le cache rattrape en route.
	const startBackgroundPrefetch = () => {
		if (!$metaJson || !$modelRun) return;
		prefetchAbort = new AbortController();
		void prefetchData({
			startDate: new Date($time),
			endDate: new Date($metaJson.valid_times[$metaJson.valid_times.length - 1] as string),
			metaJson: $metaJson,
			modelRun: $modelRun,
			domain: $domainStore,
			variable: $variableStore,
			signal: prefetchAbort.signal
		});
	};

	const stopBackgroundPrefetch = () => {
		prefetchAbort?.abort();
		prefetchAbort = null;
	};

	const engine = createPlaybackEngine({
		events: slotEvents,
		getSteps: () => $metaJson?.valid_times.map((validTime: string) => new Date(validTime)),
		getCurrent: () => $time,
		advance: (date) => advance(date),
		onAutoStop: () => {
			stopBackgroundPrefetch();
			playing = false;
		}
	});

	const stopPlayback = () => {
		engine.stop();
		stopBackgroundPrefetch();
		playing = false;
	};

	const togglePlayback = () => {
		if (engine.running) {
			stopPlayback();
			return;
		}
		if (!engine.start()) {
			toast.warning('Aucune échéance disponible pour lancer la lecture');
			return;
		}
		startBackgroundPrefetch();
		playing = true;
	};

	// Les échéances changent avec le domaine ou le run : on arrête la lecture.
	$effect(() => {
		void $domainStore;
		void $modelRun;
		if (engine.running) {
			stopPlayback();
		}
	});

	$effect(() => {
		return () => stopPlayback();
	});
</script>

<!-- Playback Button -->
<button
	class="cursor-pointer w-4 h-4.5 flex items-center justify-center"
	onclick={(e) => {
		e.preventDefault();
		e.stopPropagation();
		togglePlayback();
	}}
	aria-label={playing ? "Arrêter l'animation" : "Lancer l'animation"}
	title={playing ? "Arrêter l'animation" : 'Animer les échéances jusqu’à la fin du run (en boucle)'}
>
	{#if playing}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="text-blue-500 lucide lucide-pause-icon"
		>
			<rect x="14" y="4" width="4" height="16" rx="1" />
			<rect x="6" y="4" width="4" height="16" rx="1" />
		</svg>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="text-foreground/70 hover:text-foreground lucide lucide-play-icon"
		>
			<polygon points="6 3 20 12 6 21 6 3" />
		</svg>
	{/if}
</button>
