<script lang="ts">
	import ConeIcon from '@lucide/svelte/icons/cone';
	import RouteIcon from '@lucide/svelte/icons/route';
	import { domainOptions } from '@openmeteo/weather-map-layer';

	import {
		type WeatherAiOverlay,
		weatherAiCones,
		weatherAiDisplayed,
		weatherAiFrame,
		weatherAiLayers,
		weatherAiRun,
		weatherAiStatus,
		weatherAiTime
	} from '$lib/stores/weather-ai';

	import LayerToggle from '$lib/components/chrome/layer-toggle.svelte';

	import { WEATHER_AI_DOMAIN } from '$lib/constants';
	import { CONES_MENTION } from '$lib/weather-ai/cones';
	import { conesOffered, useWeatherAi } from '$lib/weather-ai/controller';
	import { cardSummary } from '$lib/weather-ai/displayed';
	import { formatUtc } from '$lib/weather-ai/render';
	import { WIND_CLASSES, buildTracks, msToKmh } from '$lib/weather-ai/tracks';

	import WeatherAiMentions from './weather-ai-mentions.svelte';

	import type { Component } from 'svelte';

	// Champs continus servis comme modèle « Weather AI (WeatherNext) » de l'onglet
	// Données dès que son bucket .om est configuré (weather-ai-domain.ts).
	const modelAvailable = domainOptions.some((d) => d.value === WEATHER_AI_DOMAIN);

	// L'onglet monté suffit à lire le catalogue (le menu en dépend).
	$effect(() => useWeatherAi());

	const ICONS: Record<WeatherAiOverlay, Component> = {
		tracks: RouteIcon,
		cones: ConeIcon
	};

	// Superpositions issues du catalogue : seuls les produits annoncés et connus
	// sont proposés. Les champs continus (pression, probabilité d'existence) n'en
	// sont pas : ils viendront comme variables d'un modèle du sélecteur.
	const offered = $derived.by(() => {
		const run = $weatherAiRun;
		if (!run) return [];
		const items: { kind: WeatherAiOverlay; label: string }[] = run.available
			.filter((p) => p.spec.kind === 'tracks')
			.map(() => ({ kind: 'tracks', label: 'Cyclones, trajectoires et zones à surveiller' }));
		if (conesOffered(run)) items.push({ kind: 'cones', label: "Cônes d'incertitude" });
		return items;
	});
	const continuousFields = $derived(
		($weatherAiRun?.available ?? []).filter(
			(p) => p.spec.kind === 'mslp' || p.spec.kind === 'existence'
		)
	);

	// Échéance réellement affichée (suit la frise principale), pour la légende.
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

	const storms = $derived.by(() => {
		const run = $weatherAiRun;
		const p = run && Object.values(run.loaded).find((l) => l.kind === 'tracks');
		if (!run || p?.kind !== 'tracks') return { declared: [], candidates: 0 };
		const tracks = buildTracks(
			p.frames.map((f) => f.product),
			run.runId
		).filter((t) => t.member === 0);
		const declared = tracks
			.filter((t) => t.kind === 'declared')
			.map((t) => ({ label: t.label, now: t.points.find((pt) => pt.time === $weatherAiTime) }));
		const candidates = tracks.filter(
			(t) => t.kind === 'candidate' && t.points.some((pt) => pt.time === $weatherAiTime)
		).length;
		return { declared, candidates };
	});

	function toggle(kind: WeatherAiOverlay, next: boolean) {
		weatherAiLayers.update((l) => ({ ...l, [kind]: next }));
	}
</script>

{#snippet group(title: string, body: import('svelte').Snippet)}
	<section class="flex flex-col gap-1.5">
		<h3 class="px-1 text-xs font-semibold text-white/80">{title}</h3>
		<div
			class="overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
		>
			{@render body()}
		</div>
	</section>
{/snippet}

<div class="flex flex-col gap-4">
	<!-- Avertissement permanent : la mention la plus importante d'un produit cyclone public. -->
	<div class="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2.5">
		<span
			class="inline-block rounded bg-amber-300 px-1.5 py-px text-[10px] font-bold tracking-wide text-slate-950 uppercase"
			>Expérimental</span
		>
		<p class="mt-1.5 text-xs leading-snug font-medium text-amber-100">
			Prévision expérimentale — ne remplace aucune alerte, vigilance ou bulletin officiel.
		</p>
		<p class="mt-1 text-[11px] leading-snug text-white/55">
			Modèle IA WeatherNext Cyclones Mini (Google DeepMind), initialisé sur ECMWF open data.
		</p>
	</div>

	{#if $weatherAiStatus.state === 'error'}
		<p class="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200" role="alert">
			{$weatherAiStatus.message}{$weatherAiRun ? ' — le run affiché est conservé.' : ''}
		</p>
	{:else if !$weatherAiRun}
		<p class="px-1 text-xs text-white/55">Chargement du catalogue…</p>
	{/if}

	{#if $weatherAiRun?.demo}
		<p
			class="rounded-lg border border-violet-300/40 bg-violet-400/15 px-3 py-2 text-xs text-violet-100"
			role="note"
		>
			Démonstration hors API : trajectoires archivées du run de référence (18/10/2026 00Z), cônes
			fictifs construits d'après le schéma. Pas une prévision en cours.
		</p>
	{/if}

	{#if $weatherAiRun}
		{#snippet layersBody()}
			{#each offered as item (item.kind)}
				{@const Icon = ICONS[item.kind]}
				<LayerToggle
					label={item.label}
					checked={$weatherAiLayers[item.kind]}
					onCheckedChange={(v) => toggle(item.kind, v)}
				>
					{#snippet icon()}<Icon class="size-[18px]" aria-hidden="true" />{/snippet}
				</LayerToggle>
			{/each}
		{/snippet}
		{@render group('Superpositions', layersBody)}
		<p class="-mt-2 px-1 text-[11px] leading-snug text-white/45">
			Affichables sur n'importe quel modèle de fond. L'échéance suit la frise en bas de l'écran (pas
			de 6 h depuis l'initialisation du run Weather AI).
		</p>
		{#if continuousFields.length}
			<p class="px-1 text-[11px] leading-snug text-white/45">
				{#if modelAvailable}
					Pression et probabilité d'existence cyclonique : modèle « Weather AI (WeatherNext) » de
					l'onglet Données, avec légende et échelle standards.
				{:else}
					Pression et probabilité d'existence cyclonique : à venir comme variables d'un modèle «
					Weather AI » du sélecteur de modèles, avec légende et échelle standards.
				{/if}
			</p>
		{/if}
		<!-- Source des superpositions : run Weather AI et échéance réellement affichée,
		     à ne pas confondre avec le run du modèle de fond. -->
		<section class="flex flex-col gap-0.5 rounded-xl bg-white/[0.04] px-3 py-2 text-[11px]">
			<span class="text-white/45">Source des superpositions</span>
			{#if summary.shown}
				<!-- Run, init et échéance de l'état AFFICHÉ (weatherAiDisplayed), jamais de la sélection. -->
				<span class="font-mono break-all text-white/70">run Weather AI {summary.shown.runId}</span>
				{#if summary.shown.init}
					<span class="text-white/55 tabular-nums">initialisé le {summary.shown.init}</span>
				{/if}
				<span class="text-white/80 tabular-nums"
					>Échéance affichée : {summary.shown.lead} · {summary.shown.utc}{summary.shown.elapsed
						? ' (écoulée)'
						: ''}</span
				>
			{:else}
				<span class="text-white/55">Aucune donnée Weather AI affichée.</span>
			{/if}
			{#if summary.requested}
				<span class="text-white/55 tabular-nums"
					>Échéance demandée {summary.requested.lead} · {summary.requested.utc}{summary.requested
						.sameRun
						? ''
						: ` (run Weather AI ${summary.requested.runId})`} : {summary.error
						? 'non affichée (échec)'
						: 'en chargement'}.</span
				>
			{/if}
			{#if summary.betweenShown}
				<span class="text-sky-200/90"
					>Heure de la frise entre deux échéances : l'échéance précédente est affichée.</span
				>
			{:else if summary.relation === 'before' || summary.relation === 'after'}
				<span class="text-sky-200/90"
					>Heure de la frise hors horizon{summary.horizon ? ` (${summary.horizon})` : ''} : rien d'affiché.</span
				>
			{/if}
		</section>

		{#if $weatherAiRun.ignored.length}
			<p class="-mt-2 px-1 text-[11px] text-white/40">
				{$weatherAiRun.ignored.length} produit(s) du catalogue pas encore pris en charge.
			</p>
		{/if}

		{#if $weatherAiLayers.tracks}
			<section class="flex flex-col gap-1.5 px-1">
				<h3 class="text-xs font-semibold text-white/80">Cyclones suivis</h3>
				{#each storms.declared as s (s.label)}
					<div class="flex items-center justify-between text-xs tabular-nums">
						<span class="font-medium">{s.label}</span>
						<span class="text-white/60">
							{#if s.now}{Math.round(s.now.mslpHpa)} hPa · {Math.round(msToKmh(s.now.vmaxMs))} km/h{:else}hors
								suivi à cette échéance{/if}
						</span>
					</div>
				{:else}
					<p class="text-xs text-white/50">Aucun cyclone déclaré dans ce run.</p>
				{/each}
				<p class="text-[11px] leading-snug text-white/55">
					<span
						class="mr-1 inline-block size-2.5 rounded-full border border-violet-300 bg-violet-300/25"
					></span>
					{storms.candidates} zone(s) à surveiller : candidats de cyclogenèse détectés par le modèle,
					sans système réel associé. Ce ne sont pas des cyclones.
				</p>
				<div class="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-white/55 tabular-nums">
					{#each WIND_CLASSES as c, k (c.minMs)}
						<span class="inline-flex items-center gap-1"
							><span class="inline-block size-2 rounded-full" style="background: {c.color}"></span>
							{k === 0
								? `< ${Math.round(msToKmh(WIND_CLASSES[1].minMs))}`
								: `≥ ${Math.round(msToKmh(c.minMs))}`} km/h</span
						>
					{/each}
				</div>
			</section>
		{/if}

		{#if $weatherAiLayers.cones && conesOffered($weatherAiRun)}
			<section class="flex flex-col gap-1 px-1">
				<h3 class="text-xs font-semibold text-white/80">Cônes d'incertitude</h3>
				{#if $weatherAiCones?.doc}
					<p class="text-[11px] font-medium text-amber-100">{CONES_MENTION}</p>
					<p class="text-[11px] text-white/55">
						Zone claire : 90 % · zone soutenue : 68 %. Enveloppe coupée là où le cône est
						indisponible ; hémisphère sud : pas de cône au-delà de +24 h.
					</p>
				{:else if $weatherAiCones?.message}
					<p class="text-[11px] text-white/55">Cônes non affichés : {$weatherAiCones.message}.</p>
				{/if}
			</section>
		{/if}

		<details class="rounded-xl bg-white/[0.04] px-3 py-2">
			<summary class="cursor-pointer text-xs font-semibold text-white/80"
				>Run, sources et licence</summary
			>
			<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-white/65">
				<dt class="text-white/45">Dernier run</dt>
				<dd class="font-mono break-all">{$weatherAiRun.runId}</dd>
				<dt class="text-white/45">Init.</dt>
				<dd>{$weatherAiRun.initTime ? formatUtc($weatherAiRun.initTime) : 'inconnue'}</dd>
				<dt class="text-white/45">Publié</dt>
				<dd>{formatUtc($weatherAiRun.publishedAt)}</dd>
			</dl>
			<div class="mt-2"><WeatherAiMentions /></div>
		</details>
	{/if}
</div>
