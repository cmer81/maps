<script lang="ts">
	import { desktop } from '$lib/stores/preferences';

	import CaptureFlow from '$lib/components/capture/capture-flow.svelte';
	import VideoExportFlow from '$lib/components/capture/video-export-flow.svelte';

	import AdvancedPanel from './advanced-panel.svelte';
	import MobileDock from './mobile-dock.svelte';
	import TopBar from './top-bar.svelte';
</script>

{#if desktop.current}
	<TopBar>
		{#snippet capture()}<CaptureFlow /><VideoExportFlow />{/snippet}
		{#snippet advanced()}<AdvancedPanel />{/snippet}
	</TopBar>
{:else}
	<MobileDock>
		{#snippet capture()}<CaptureFlow variant="fab" /><VideoExportFlow variant="fab" />{/snippet}
		{#snippet advanced()}<AdvancedPanel />{/snippet}
	</MobileDock>
{/if}
