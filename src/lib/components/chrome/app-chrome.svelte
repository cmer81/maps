<script lang="ts">
	import { desktop, sidebarWidth } from '$lib/stores/preferences';

	import CaptureFlow from '$lib/components/capture/capture-flow.svelte';

	import AdvancedPanel from './advanced-panel.svelte';
	import ContextStrip from './context-strip.svelte';
	import DisplaySection from './display-section.svelte';
	import Header from './header.svelte';
	import MapActions from './map-actions.svelte';
	import MobileDock from './mobile-dock.svelte';
	import Sidebar from './sidebar.svelte';
	import StyleSection from './style-section.svelte';
	import WeatherAiNotice from './weather-ai-notice.svelte';
</script>

<Header>
	{#snippet capture()}
		<!-- Desktop : capture/partage promue dans le header. Sur mobile, c'est le FAB
		     de mobile-dock qui prend le relais (meilleure accessibilité au pouce). -->
		{#if desktop.current}<CaptureFlow />{/if}
	{/snippet}
</Header>

<!-- Bande de contexte : sous le header (44px), décalée à droite par la sidebar
     (0 sur mobile, où la sidebar n'est pas montée). z-40 : sous le header/sidebar
     (z-60/z-50), au-dessus de la carte. -->
<div
	class="fixed top-11 right-0 z-40 transition-[left] duration-200 motion-reduce:transition-none"
	style="left: {desktop.current ? $sidebarWidth : 0}px"
>
	<ContextStrip />
	<!-- Bandeau « expérimental » + mentions de licence, sous la bande de contexte.
	     Ne s'affiche que sur les domaines de EXPERIMENTAL_DOMAINS. -->
	<WeatherAiNotice />
</div>

{#if desktop.current}
	<Sidebar>
		{#snippet display()}<DisplaySection />{/snippet}
		{#snippet style()}<StyleSection />{/snippet}
	</Sidebar>
	<AdvancedPanel />
	<MapActions />
{:else}
	<MobileDock>
		{#snippet capture()}<CaptureFlow variant="fab" />{/snippet}
		{#snippet display()}<DisplaySection />{/snippet}
		{#snippet style()}<StyleSection />{/snippet}
	</MobileDock>
	<AdvancedPanel />
{/if}
