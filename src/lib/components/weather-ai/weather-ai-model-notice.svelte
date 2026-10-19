<script lang="ts">
	import { WEATHER_AI_ATTRIBUTION, WEATHER_AI_LICENSE_NOTICE } from '$lib/weather-ai-domain';

	// Mentions obligatoires du modèle Weather AI quand il est sélectionné dans
	// « Données » : badge expérimental, avertissement, attribution et licence du
	// produit (identiques au catalogue du portail, cf. `weather-ai-domain.ts`),
	// non-responsabilité ECMWF non reformulée, mention Google, DOI Copernicus.
	let open = $state(false);
</script>

<section
	class="rounded-xl border border-amber-300/30 bg-amber-300/[0.07] px-3 py-2 text-white"
	aria-label="Modèle IA expérimental Weather AI"
>
	<div class="flex items-center gap-2">
		<span
			class="rounded bg-amber-300 px-1.5 py-px text-[10px] font-bold tracking-wide text-slate-950 uppercase"
			>Expérimental</span
		>
		<span class="text-xs font-semibold">Modèle IA</span>
	</div>
	<p class="mt-1 text-[11px] leading-snug font-medium text-amber-100">
		Prévision expérimentale — ne remplace aucune alerte, vigilance ou bulletin officiel.
	</p>
	<p class="mt-1 text-[11px] leading-snug text-white/60">
		WeatherNext Cyclones Mini (Google DeepMind), initialisé sur ECMWF open data. Grille 1°,
		échéances de 6 h en 6 h jusqu'à +72 h, heures en UTC.
	</p>
	<button
		type="button"
		class="mt-1.5 cursor-pointer text-[11px] text-white/70 underline-offset-2 hover:text-white hover:underline"
		aria-expanded={open}
		onclick={() => (open = !open)}>{open ? 'Masquer' : 'Afficher'} sources et licence</button
	>
	{#if open}
		<div class="mt-1.5 flex flex-col gap-2 text-[11px] leading-snug text-white/70">
			<p>{WEATHER_AI_ATTRIBUTION}</p>
			<p class="text-white/55">Licence : {WEATHER_AI_LICENSE_NOTICE}</p>
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
	{/if}
</section>
