<script lang="ts">
	import { sheet } from '$lib/stores/preferences';

	import SecondaryLayerPanel from '$lib/components/secondary-layer/secondary-layer-panel.svelte';
	import * as Sheet from '$lib/components/ui/sheet';
	import WindOverlayPanel from '$lib/components/wind-overlay/wind-overlay-panel.svelte';

	import ArrowsSettings from './arrows-settings.svelte';
	import CacheSettings from './cache-settings.svelte';
	import ContourSettings from './contour-settings.svelte';
	import GridSettings from './grid-settings.svelte';
	import OpacitySetting from './opacity-setting.svelte';
	import PopupSettings from './popup-settings.svelte';
	import StateSettings from './state-settings.svelte';
	import TileSizeSettings from './tile-size-settings.svelte';
	import UnitSettings from './unit-settings.svelte';
	import WaterClipSetting from './water-clip-setting.svelte';
</script>

<Sheet.Root bind:open={$sheet}>
	<Sheet.Content class="z-100 bg-glass/80 backdrop-blur-sm max-h-screen w-96 border-none">
		<div class="flex flex-col px-6 pt-12 pb-18 gap-6 min-h-full overflow-y-scroll">
			<UnitSettings />
			<GridSettings />
			<ArrowsSettings />
			<ContourSettings />
			<TileSizeSettings />
			<PopupSettings />
			<WaterClipSetting />
			<OpacitySetting />
			<SecondaryLayerPanel />
			<WindOverlayPanel />
			<CacheSettings />
			<StateSettings />
		</div>
	</Sheet.Content>
</Sheet.Root>
