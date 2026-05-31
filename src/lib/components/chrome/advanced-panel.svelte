<script lang="ts">
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { MediaQuery } from 'svelte/reactivity';
	import { get } from 'svelte/store';
	import { fly } from 'svelte/transition';

	import SettingsIcon from '@lucide/svelte/icons/settings-2';
	import { mode, setMode } from 'mode-watcher';

	import { clippingPanelOpen } from '$lib/stores/clipping';
	import { DEFAULT_SHOW_DEPARTMENTS, showDepartments } from '$lib/stores/departments';
	import { DEFAULT_SHOW_LABELS, showLabels } from '$lib/stores/labels';
	import {
		advancedOpen,
		defaultPreferences,
		desktop,
		helpOpen,
		preferences
	} from '$lib/stores/preferences';

	import SecondaryLayerPanel from '$lib/components/secondary-layer/secondary-layer-panel.svelte';
	import ArrowsSettings from '$lib/components/settings/arrows-settings.svelte';
	import CacheSettings from '$lib/components/settings/cache-settings.svelte';
	import ContourSettings from '$lib/components/settings/contour-settings.svelte';
	import GridSettings from '$lib/components/settings/grid-settings.svelte';
	import OpacitySetting from '$lib/components/settings/opacity-setting.svelte';
	import PopupSettings from '$lib/components/settings/popup-settings.svelte';
	import SoundingSettings from '$lib/components/settings/sounding-settings.svelte';
	import StateSettings from '$lib/components/settings/state-settings.svelte';
	import TileSizeSettings from '$lib/components/settings/tile-size-settings.svelte';
	import UnitSettings from '$lib/components/settings/unit-settings.svelte';
	import * as Sheet from '$lib/components/ui/sheet';
	import WindOverlayPanel from '$lib/components/wind-overlay/wind-overlay-panel.svelte';

	import { setHillshadeEnabled } from '$lib/hillshade';
	import { reloadStyles } from '$lib/map-controls';
	import { updateUrl } from '$lib/url';

	import LayerToggle from './layer-toggle.svelte';

	// Reactive snapshots driving the toggle UI.
	const labelsOn = $derived($showLabels);
	const departmentsOn = $derived($showDepartments);
	const hillshadeOn = $derived($preferences.hillshade);
	const darkOn = $derived(mode.current === 'dark');

	// --- IControl behaviors ported to plain handlers ---
	function toggleLabels(next: boolean) {
		showLabels.set(next);
		updateUrl('labels', String(next), String(DEFAULT_SHOW_LABELS));
	}

	function toggleDepartments(next: boolean) {
		showDepartments.set(next);
		updateUrl('departments', String(next), String(DEFAULT_SHOW_DEPARTMENTS));
	}

	function toggleDark(next: boolean) {
		setMode(next ? 'dark' : 'light');
		reloadStyles();
	}

	function toggleHillshade(next: boolean) {
		preferences.update((p) => ({ ...p, hillshade: next }));
		setHillshadeEnabled(next);
		updateUrl('hillshade', String(next), String(defaultPreferences.hillshade));
	}

	// Respecte prefers-reduced-motion : neutralise la transition JS du rail desktop.
	const reduceMotion = new MediaQuery('(prefers-reduced-motion: reduce)');
</script>

{#snippet body()}
	<section class="flex flex-col gap-1">
		<h3 class="text-xs font-semibold tracking-wide text-white/60 uppercase">Calques carte</h3>
		<WindOverlayPanel />
		<ArrowsSettings />
		<ContourSettings />
		<LayerToggle label="Valeurs" checked={labelsOn} onCheckedChange={toggleLabels} />
		<LayerToggle label="Départements" checked={departmentsOn} onCheckedChange={toggleDepartments} />
		<LayerToggle label="Relief ombré" checked={hillshadeOn} onCheckedChange={toggleHillshade} />
		<SecondaryLayerPanel />
		<OpacitySetting />
	</section>

	<section class="flex flex-col gap-1">
		<h3 class="text-xs font-semibold tracking-wide text-white/60 uppercase">Réglages</h3>
		<UnitSettings />
		<GridSettings />
		<PopupSettings />
		<TileSizeSettings />
		<SoundingSettings />
		<LayerToggle label="Mode sombre" checked={darkOn} onCheckedChange={toggleDark} />
		<CacheSettings />
		<StateSettings />
	</section>

	<section class="flex flex-col gap-1">
		<h3 class="text-xs font-semibold tracking-wide text-white/60 uppercase">Outils</h3>
		<button
			type="button"
			class="hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 md:min-h-0 w-full items-center rounded-md px-2 py-3 md:py-1.5 text-left text-sm"
			onclick={() => clippingPanelOpen.set(!get(clippingPanelOpen))}
		>
			Découpe pays
		</button>
		<button
			type="button"
			class="hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 md:min-h-0 w-full items-center rounded-md px-2 py-3 md:py-1.5 text-left text-sm"
			onclick={() => helpOpen.set(true)}
		>
			Aide
		</button>
	</section>
{/snippet}

<button
	type="button"
	onclick={() => advancedOpen.update((v) => !v)}
	aria-label="Calques et réglages"
	class="bg-glass/40 hover:bg-glass/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex h-11 md:h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 px-2.5 text-sm text-white backdrop-blur-md"
>
	<SettingsIcon class="size-4" aria-hidden="true" />
	<span class="hidden sm:inline">Calques &amp; réglages</span>
</button>

{#if desktop.current}
	{#if $advancedOpen}
		<div
			class="bg-glass/55 fixed top-16 right-2.5 z-60 max-h-[80vh] w-72 overflow-y-auto rounded-xl border border-white/15 p-3 text-white shadow-lg backdrop-blur-md"
			in:fly={{ x: 16, duration: reduceMotion.current ? 0 : 200, easing: cubicOut }}
			out:fly={{ x: 16, duration: reduceMotion.current ? 0 : 150, easing: cubicIn }}
		>
			<div class="flex flex-col gap-6">
				{@render body()}
			</div>
		</div>
	{/if}
{:else}
	<Sheet.Root bind:open={$advancedOpen}>
		<Sheet.Content
			side="bottom"
			class="bg-glass/80 z-100 max-h-[85vh] border-none text-white backdrop-blur-sm"
		>
			<div class="flex max-h-[85vh] flex-col gap-6 overflow-y-auto px-6 pt-10 pb-8">
				{@render body()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/if}
