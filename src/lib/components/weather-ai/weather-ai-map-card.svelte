<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';

	import { basemapTheme } from '$lib/stores/basemap-theme';
	import { map } from '$lib/stores/map';
	import { desktop, sidebarWidth } from '$lib/stores/preferences';
	import {
		weatherAiCones,
		weatherAiDisplayed,
		weatherAiFrame,
		weatherAiLayers,
		weatherAiRun,
		weatherAiStatus,
		weatherAiTime
	} from '$lib/stores/weather-ai';

	import { CONES_MENTION } from '$lib/weather-ai/cones';
	import { useWeatherAi } from '$lib/weather-ai/controller';
	import { cardSummary } from '$lib/weather-ai/displayed';
	import { syncWeatherAiLayers } from '$lib/weather-ai/map-layers';

	import WeatherAiMentions from './weather-ai-mentions.svelte';

	// Légende flottante des superpositions Weather AI, visible dès qu'une est
	// active (panneau replié compris) : mentions obligatoires, run Weather AI
	// (distinct du run du modèle de fond) et échéance RÉELLEMENT affichée. Pas de
	// curseur propre : l'échéance suit la frise principale.
	const anyOn = $derived(Object.values($weatherAiLayers).some(Boolean));

	// Une couche active (persistée) suffit à charger le run, onglet fermé ou non.
	$effect(() => {
		if (anyOn) return useWeatherAi();
	});

	// Toute évolution d'état (frise comprise, via weatherAiTime) se répercute sur la carte.
	$effect(() => {
		const _deps = [
			$map,
			$weatherAiLayers,
			$weatherAiRun,
			$weatherAiTime,
			$weatherAiCones,
			$basemapTheme
		];
		void syncWeatherAiLayers();
	});

	let infoOpen = $state(false);
	const summary = $derived(
		cardSummary(
			$weatherAiDisplayed,
			{ runId: $weatherAiRun?.runId, validTime: $weatherAiTime },
			$weatherAiStatus,
			Date.now(),
			$weatherAiFrame,
			$weatherAiRun?.initTime
		)
	);
	const outOfHorizon = $derived(summary.relation === 'before' || summary.relation === 'after');
	const showCones = $derived(
		$weatherAiLayers.cones &&
			!!$weatherAiCones?.doc &&
			$weatherAiCones.runId === $weatherAiDisplayed?.runId
	);
</script>

{#if anyOn}
	<div
		class="bg-glass/90 fixed top-[82px] z-40 w-[min(340px,calc(100vw-24px))] rounded-xl border border-white/15 px-3 py-2 text-white shadow-lg glass-blur transition-[left] duration-200 motion-reduce:transition-none"
		style="left: {(desktop.current ? $sidebarWidth : 0) + 12}px"
		role="region"
		aria-label="Superpositions expérimentales Weather AI"
	>
		<div class="flex items-center gap-2">
			<span
				class="rounded bg-amber-300 px-1.5 py-px text-[10px] font-bold tracking-wide text-slate-950 uppercase"
				>Expérimental</span
			>
			<span class="text-xs font-semibold">Cyclones IA · Weather AI</span>
			<button
				type="button"
				class="ml-auto inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
				aria-label="Sources, attribution et licence"
				aria-expanded={infoOpen}
				onclick={() => (infoOpen = !infoOpen)}><InfoIcon class="size-4" /></button
			>
		</div>
		<p class="mt-1 text-[11px] leading-snug font-medium text-amber-100">
			Prévision expérimentale — ne remplace aucune alerte, vigilance ou bulletin officiel.
		</p>

		{#if summary.shown?.demo}
			<p
				class="mt-1 rounded bg-violet-400/20 px-2 py-1 text-[11px] leading-snug text-violet-100"
				role="note"
			>
				Démonstration hors API : trajectoires archivées du run de référence (18/10/2026 00Z), cônes
				fictifs construits d'après le schéma. Pas une prévision en cours.
			</p>
		{/if}

		{#if summary.shown}
			<p class="mt-1.5 text-xs tabular-nums">
				<span class="text-white/60">Échéance Weather AI</span>
				<span class="font-semibold">{summary.shown.lead}</span>
				<span class="text-white/70">· {summary.shown.utc}</span>
				{#if summary.shown.elapsed}<span class="text-amber-200/80"> · écoulée</span>{/if}
			</p>
			<p class="truncate font-mono text-[10px] text-white/45" title={summary.shown.runId}>
				run Weather AI {summary.shown.runId}
			</p>
		{:else if !summary.error && !outOfHorizon}
			<p class="mt-1 text-[11px] text-white/55">Chargement du run Weather AI…</p>
		{/if}

		{#if summary.betweenShown}
			<p class="mt-1 text-[11px] leading-snug text-sky-200/90">
				L'heure de la frise tombe entre deux échéances Weather AI (pas de 6 h) : l'échéance
				précédente est affichée.
			</p>
		{:else if outOfHorizon}
			<p class="mt-1 text-[11px] leading-snug text-sky-200/90">
				Heure de la frise hors de l'horizon Weather AI{summary.horizon
					? ` (${summary.horizon})`
					: ''} : aucune position affichée.
			</p>
		{/if}

		{#if summary.requested && !summary.error}
			<p class="text-[11px] text-white/55 tabular-nums">
				Chargement de l'échéance demandée {summary.requested.lead} · {summary.requested.utc}{summary
					.requested.sameRun
					? ''
					: ` (nouveau run Weather AI ${summary.requested.runId})`}…
			</p>
		{/if}

		<!-- Erreur toujours visible, qu'un état soit affiché ou non (panneau replié compris). -->
		{#if summary.error}
			<p
				class="mt-1 rounded bg-red-500/15 px-2 py-1 text-[11px] leading-snug text-red-200"
				role="alert"
			>
				{summary.error}{#if summary.shown && summary.pending}
					Données affichées : {summary.shown.lead} · {summary.shown.utc} (run {summary.shown
						.runId}).{/if}{#if summary.requested}
					Échéance demandée {summary.requested.lead} · {summary.requested.utc} non affichée.{/if}
			</p>
		{/if}

		{#if showCones}
			<p class="mt-1 text-[11px] leading-snug text-amber-100">{CONES_MENTION}</p>
			<p class="text-[10px] leading-snug text-white/50">
				Statut de calibration : <span class="font-mono break-all"
					>{$weatherAiCones?.doc?.calibration_status}</span
				>
			</p>
		{/if}

		{#if infoOpen}
			<div class="mt-2 border-t border-white/10 pt-2">
				{#if summary.shown}
					<!-- Initialisation du run AFFICHÉ, pas du run en préparation. -->
					<p class="mb-1.5 text-[11px] text-white/60 tabular-nums">
						Run Weather AI affiché initialisé le {summary.shown.init ?? 'inconnu'}, distinct du run
						du modèle de fond.
					</p>
				{/if}
				<WeatherAiMentions />
			</div>
		{/if}
	</div>
{/if}
