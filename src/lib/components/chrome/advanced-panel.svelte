<script lang="ts">
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { MediaQuery } from 'svelte/reactivity';
	import { get } from 'svelte/store';
	import { fly } from 'svelte/transition';

	import SettingsIcon from '@lucide/svelte/icons/settings-2';
	import XIcon from '@lucide/svelte/icons/x';

	import { basemapTheme } from '$lib/stores/basemap-theme';
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

	import { setHillshadeEnabled } from '$lib/hillshade';
	import { updateUrl } from '$lib/url';

	import LayerToggle from './layer-toggle.svelte';

	// Reactive snapshots driving the toggle UI.
	const departmentsOn = $derived($showDepartments);
	const labelsOn = $derived($showLabels);
	const hillshadeOn = $derived($preferences.hillshade);
	// Thème du FOND DE CARTE (le chrome reste sombre en permanence — cf. basemap-theme.ts).
	const darkOn = $derived($basemapTheme === 'dark');

	// --- IControl behaviors ported to plain handlers ---
	function toggleDepartments(next: boolean) {
		showDepartments.set(next);
		updateUrl('departments', String(next), String(DEFAULT_SHOW_DEPARTMENTS));
	}

	function toggleLabels(next: boolean) {
		showLabels.set(next);
		updateUrl('labels', String(next), String(DEFAULT_SHOW_LABELS));
	}

	function toggleHillshade(next: boolean) {
		preferences.update((p) => ({ ...p, hillshade: next }));
		setHillshadeEnabled(next);
		updateUrl('hillshade', String(next), String(defaultPreferences.hillshade));
	}

	// Bascule le fond de carte clair/sombre (persisté). Le ré-affichage du basemap +
	// couches météo est piloté par l'effet réactif sur `basemapTheme` dans +page.svelte.
	function toggleDark(next: boolean) {
		basemapTheme.set(next ? 'dark' : 'light');
	}

	// Respecte prefers-reduced-motion : neutralise la transition JS du rail desktop.
	const reduceMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

	// Porte le rail sur <body> : un backdrop-filter imbriqué dans celui de la barre
	// haute est neutralisé par le navigateur, donc le flou ne s'appliquerait pas.
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		measureControls(); // cale le top dès le montage, avant la 1re peinture
		return {
			destroy() {
				node.parentNode?.removeChild(node);
			}
		};
	}

	// Les contrôles MapLibre (zoom, boussole, géoloc, globe) s'empilent en haut-droit.
	// On mesure le bas réel de leur conteneur pour ouvrir le panneau juste en dessous
	// (plutôt qu'un offset codé en dur, fragile au nombre de contrôles / version MapLibre).
	const TOP_FALLBACK = 64; // sous la barre haute si les contrôles sont absents
	let controlsBottom = $state(TOP_FALLBACK);

	function measureControls() {
		const el = document.querySelector('.maplibregl-ctrl-top-right');
		controlsBottom = el ? Math.round(el.getBoundingClientRect().bottom) : TOP_FALLBACK;
	}

	$effect(() => {
		if (!desktop.current || !$advancedOpen) return;
		measureControls();
		window.addEventListener('resize', measureControls);
		return () => window.removeEventListener('resize', measureControls);
	});
</script>

{#snippet body()}
	<section class="flex flex-col gap-1">
		<h3 class="text-xs font-semibold tracking-wide text-white/60 uppercase">Calques carte</h3>
		<ArrowsSettings />
		<div class="my-1 h-px bg-white/10"></div>
		<ContourSettings />
		<div class="my-1 h-px bg-white/10"></div>
		<SecondaryLayerPanel />
		<LayerToggle label="Départements" checked={departmentsOn} onCheckedChange={toggleDepartments} />
		<LayerToggle label="Villes &amp; pays" checked={labelsOn} onCheckedChange={toggleLabels} />
		<LayerToggle label="Relief ombré" checked={hillshadeOn} onCheckedChange={toggleHillshade} />
		<LayerToggle label="Dark Mode" checked={darkOn} onCheckedChange={toggleDark} />
		<OpacitySetting />
	</section>

	<section class="flex flex-col gap-1">
		<h3 class="text-xs font-semibold tracking-wide text-white/60 uppercase">Réglages</h3>
		<UnitSettings />
		<GridSettings />
		<PopupSettings />
		<TileSizeSettings />
		<SoundingSettings />
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
			Découpage
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
	class="bg-glass/50 hover:bg-glass/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex h-11 md:h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 px-3 text-sm text-white shadow-md glass-blur"
>
	<SettingsIcon class="size-4" aria-hidden="true" />
	<span class="hidden sm:inline">Calques &amp; réglages</span>
</button>

{#if desktop.current}
	{#if $advancedOpen}
		<!-- use:portal → rendu sur <body> pour que le backdrop-blur s'applique vraiment
		     (même voile que la barre haute). -->
		<!-- Drawer collé au bord droit : glisse entièrement depuis l'extérieur (x = largeur
		     du rail, w-80 = 320px) et se referme vers la droite. La hauteur reste calée sur
		     le contenu (max-height) pour ne jamais couvrir la timeline ni la légende en bas. -->
		<div
			use:portal
			class="bg-glass/45 scrollbar-thin fixed right-0 z-60 w-80 overflow-x-hidden overflow-y-auto rounded-l-xl border border-r-0 border-white/15 p-3 text-white shadow-lg backdrop-blur-md"
			style="top: {controlsBottom + 8}px; max-height: calc(100dvh - {controlsBottom + 24}px);"
			in:fly={{ x: 320, duration: reduceMotion.current ? 0 : 260, easing: cubicOut }}
			out:fly={{ x: 320, duration: reduceMotion.current ? 0 : 200, easing: cubicIn }}
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-semibold">Calques &amp; réglages</h2>
				<button
					type="button"
					onclick={() => advancedOpen.set(false)}
					aria-label="Fermer"
					title="Fermer"
					class="hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 -mr-1 inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-white/70 hover:text-white"
				>
					<XIcon class="size-4" aria-hidden="true" />
				</button>
			</div>
			<div class="flex flex-col gap-6">
				{@render body()}
			</div>
		</div>
	{/if}
{:else}
	<Sheet.Root bind:open={$advancedOpen}>
		<Sheet.Content
			side="bottom"
			class="bg-glass/90 z-100 max-h-[85vh] border-none text-white backdrop-blur-xl"
		>
			<div class="flex max-h-[85vh] flex-col gap-6 overflow-y-auto px-6 pt-10 pb-8">
				{@render body()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/if}
