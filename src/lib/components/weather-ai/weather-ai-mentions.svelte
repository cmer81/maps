<script lang="ts">
	import { weatherAiCones, weatherAiRun } from '$lib/stores/weather-ai';

	import { previousConesNotice } from '$lib/weather-ai/cones';

	// Mentions légales des produits affichés : attribution et licence reçues
	// telles quelles (catalogue), plus les mentions imposées par les sources
	// (weather-ai `docs/front-mentions-obligatoires.md` : non-responsabilité ECMWF
	// non reformulée, « not an officially supported Google product »).
	// Cônes d'un run antérieur gardés pour le run affiché : leurs mentions s'ajoutent.
	const previous = $derived(
		$weatherAiCones?.previous && $weatherAiCones.runId === $weatherAiRun?.runId
			? $weatherAiCones.previous
			: undefined
	);
	const shown = $derived([...($weatherAiRun?.available ?? []), ...(previous ? [previous] : [])]);
	const attributions = $derived([...new Set(shown.map((p) => p.attribution).filter(Boolean))]);
	const licenses = $derived([...new Set(shown.map((p) => p.licenseNotice).filter(Boolean))]);
</script>

<div class="flex flex-col gap-2 text-[11px] leading-snug text-white/70">
	{#if previous}
		<p class="text-sky-100/80">{previousConesNotice(previous)}</p>
	{/if}
	{#each attributions as a (a)}
		<p>{a}</p>
	{/each}
	{#each licenses as l (l)}
		<p class="text-white/55">Licence : {l}</p>
	{/each}
	<p class="text-white/55">
		Calcul : association Infoclimat. Not an officially supported Google product.
	</p>
	<p class="text-white/55">
		ECMWF does not accept any liability whatsoever for any error or omission in the data, their
		availability, or for any loss or damage arising from their use.
	</p>
	<p class="text-white/55">
		Copernicus : <a
			class="underline hover:text-white"
			href="https://doi.org/10.48670/moi-00165"
			target="_blank"
			rel="noopener noreferrer">doi.org/10.48670/moi-00165</a
		>
	</p>
</div>
