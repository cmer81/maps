<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	import { modelRun, time } from '$lib/stores/time';
	import { domain } from '$lib/stores/variables';

	import { isExperimentalDomain } from '$lib/constants';
	import { formatISOUTCWithZ } from '$lib/time-format';
	import { formatLeadTimeLabel } from '$lib/watermark-details';
	import { refreshWeatherAiMetadata, weatherAiMetadata } from '$lib/weather-ai-metadata';

	// Le bandeau ne dépend PAS de la métadonnée : le domaine suffit à le montrer.
	// Un fetch raté doit dégrader les mentions légales, jamais l'avertissement.
	const experimental = $derived(isExperimentalDomain($domain));

	let detailsOpen = $state(false);

	$effect(() => {
		// Relit la métadonnée quand le fichier change (domaine, run ou échéance).
		// `refreshWeatherAiMetadata` est idempotent par URL : le scrubbing dans un
		// même run ne déclenche qu'une lecture par échéance.
		const _deps = [$domain, $modelRun, $time];
		void refreshWeatherAiMetadata();
	});

	// Échéance affichée en UTC, jamais en heure locale et jamais « maintenant » :
	// la chaîne amont (latence ECMWF + inférence GPU) publie un run avec ~8 h de
	// retard, donc la première échéance est déjà écoulée à la publication.
	const validTimeUtc = $derived($time ? formatISOUTCWithZ(new Date($time)) : undefined);
	const runUtc = $derived($modelRun ? formatISOUTCWithZ($modelRun) : undefined);
	const leadLabel = $derived(
		$modelRun && $time ? formatLeadTimeLabel($modelRun, new Date($time)) : undefined
	);
	const elapsed = $derived($time ? new Date($time).getTime() < Date.now() : false);
</script>

{#if experimental}
	<div
		class="bg-glass/95 flex flex-col gap-1 border-b border-amber-400/30 px-3 py-1.5 text-[11px] leading-snug text-white/70 glass-blur"
	>
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<span
				class="inline-flex items-center gap-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200"
			>
				<TriangleAlertIcon class="size-3" aria-hidden="true" />
				Expérimental
			</span>
			<span class="text-white/75">
				Produit de recherche — <strong class="font-semibold">aucune valeur d'alerte</strong>.
			</span>
			{#if validTimeUtc}
				<span class="tabular-nums text-white/60">
					Échéance {validTimeUtc}{#if leadLabel}&nbsp;({leadLabel}){/if}
				</span>
			{/if}
			{#if elapsed}
				<span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
					échéance déjà écoulée
				</span>
			{/if}
			<button
				type="button"
				class="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
				aria-expanded={detailsOpen}
				onclick={() => (detailsOpen = !detailsOpen)}
			>
				Licence & attribution
				<ChevronDownIcon
					class="size-3 transition-transform duration-200 {detailsOpen ? 'rotate-180' : ''}"
					aria-hidden="true"
				/>
			</button>
		</div>

		{#if detailsOpen}
			<!-- Chaînes contractuelles issues de la métadonnée de l'OMfile
			     (extra.attribution / extra.license_notice) : affichées verbatim, jamais
			     reformulées ni traduites. Les poids du modèle sont sous CC BY-NC-SA 4.0
			     (usage non lucratif, attribution obligatoire, partage à l'identique). -->
			<dl class="grid gap-y-0.5 pt-0.5 text-[11px] text-white/60">
				{#if $weatherAiMetadata?.attribution}
					<div class="flex flex-wrap gap-x-1.5">
						<dt class="font-semibold text-white/75">Attribution</dt>
						<dd>{$weatherAiMetadata.attribution}</dd>
					</div>
				{/if}
				{#if $weatherAiMetadata?.licenseNotice}
					<div class="flex flex-wrap gap-x-1.5">
						<dt class="font-semibold text-white/75">Licence</dt>
						<dd>{$weatherAiMetadata.licenseNotice}</dd>
					</div>
				{/if}
				<div class="flex flex-wrap gap-x-1.5">
					<dt class="font-semibold text-white/75">Licence des poids</dt>
					<dd>
						<a
							class="underline decoration-dotted underline-offset-2 hover:text-white"
							href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
							target="_blank"
							rel="noopener noreferrer license"
						>
							CC BY-NC-SA 4.0
						</a>
						— usage non lucratif, attribution obligatoire, partage à l'identique.
					</dd>
				</div>
				{#if $weatherAiMetadata?.source}
					<div class="flex flex-wrap gap-x-1.5">
						<dt class="font-semibold text-white/75">Source</dt>
						<dd>{$weatherAiMetadata.source}</dd>
					</div>
				{/if}
				{#if runUtc}
					<div class="flex flex-wrap gap-x-1.5">
						<dt class="font-semibold text-white/75">Run</dt>
						<dd class="tabular-nums">{runUtc}</dd>
					</div>
				{/if}
				{#if $weatherAiMetadata?.runId}
					<div class="flex flex-wrap gap-x-1.5">
						<dt class="font-semibold text-white/75">run_id</dt>
						<dd class="font-mono break-all">{$weatherAiMetadata.runId}</dd>
					</div>
				{/if}
				{#if $weatherAiMetadata?.snapshotId}
					<div class="flex flex-wrap gap-x-1.5">
						<dt class="font-semibold text-white/75">snapshot_id</dt>
						<dd class="font-mono break-all">{$weatherAiMetadata.snapshotId}</dd>
					</div>
				{/if}
				{#if !$weatherAiMetadata}
					<div class="text-white/45">
						Métadonnée de provenance indisponible pour cette échéance.
					</div>
				{/if}
			</dl>
		{/if}
	</div>
{/if}
