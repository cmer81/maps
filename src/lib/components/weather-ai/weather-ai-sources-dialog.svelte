<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';

	import {
		WEATHER_AI_ATTRIBUTION,
		WEATHER_AI_LICENSE_NOTICE,
		WEATHER_AI_SOURCES_LINK_ATTR
	} from '$lib/weather-ai-domain';

	// Mentions complètes du modèle Weather AI de « Données », ouvertes par le lien
	// « Sources et licence » de la notice d'attribution de la carte (« i ») :
	// attribution et licence du produit (identiques au catalogue du portail, cf.
	// `weather-ai-domain.ts`), non-responsabilité ECMWF non reformulée, mention
	// Google, DOI Copernicus.
	let open = $state(false);

	$effect(() => {
		// Le lien est du HTML injecté par MapLibre : délégation au niveau du document.
		const onClick = (event: MouseEvent) => {
			if (!(event.target instanceof Element)) return;
			if (!event.target.closest(`[${WEATHER_AI_SOURCES_LINK_ATTR}]`)) return;
			event.preventDefault();
			open = true;
		};
		document.addEventListener('click', onClick);
		return () => document.removeEventListener('click', onClick);
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="z-90 bg-glass/80 backdrop-blur-sm shaded-md max-h-[90vh] border-none">
		<Dialog.Header>
			<Dialog.Title>Weather AI (WeatherNext) : sources et licence</Dialog.Title>
			<Dialog.Description>
				Prévision expérimentale — ne remplace aucune alerte, vigilance ou bulletin officiel.
				WeatherNext Cyclones Mini (Google DeepMind), initialisé sur ECMWF open data. Grille 1°,
				échéances de 6 h en 6 h jusqu'à +72 h, heures en UTC.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-2 text-xs leading-snug">
			<p>{WEATHER_AI_ATTRIBUTION}</p>
			<p class="opacity-75">Licence : {WEATHER_AI_LICENSE_NOTICE}</p>
			<p class="opacity-75">
				Calcul : association Infoclimat. Not an officially supported Google product.
			</p>
			<p class="opacity-75">
				ECMWF does not accept any liability whatsoever for any error or omission in the data, their
				availability, or for any loss or damage arising from their use.
			</p>
			<p class="opacity-75">
				Copernicus : <a
					class="underline"
					href="https://doi.org/10.48670/moi-00165"
					target="_blank"
					rel="noopener noreferrer">doi.org/10.48670/moi-00165</a
				>
			</p>
		</div>
	</Dialog.Content>
</Dialog.Root>
