<script lang="ts">
	import CompositionPanel from '$lib/components/composition/composition-panel.svelte';
	import WeatherAiPanel from '$lib/components/weather-ai/weather-ai-panel.svelte';

	import DisplaySection from './display-section.svelte';
	import LayerList from './layer-list.svelte';
	import ModelSelector from './model-selector.svelte';

	import type { SidebarTab } from '$lib/stores/preferences';

	interface Props {
		tab: SidebarTab;
	}
	let { tab }: Props = $props();
</script>

<!-- Contenu d'un onglet du panneau, commun à la sidebar desktop et au
     bottom-sheet mobile (une seule source de vérité pour l'organisation). -->
{#if tab === 'layers'}
	<div class="flex flex-col gap-3">
		<ModelSelector variant="card" />
		<LayerList />
	</div>
{:else if tab === 'compositions'}
	<CompositionPanel />
{:else if tab === 'cyclones'}
	<WeatherAiPanel />
{:else}
	<DisplaySection />
{/if}
