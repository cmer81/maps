<script lang="ts">
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { MediaQuery } from 'svelte/reactivity';
	import { get } from 'svelte/store';
	import { fly, slide } from 'svelte/transition';

	import Building2Icon from '@lucide/svelte/icons/building-2';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import HelpIcon from '@lucide/svelte/icons/circle-question-mark';
	import Grid3x3Icon from '@lucide/svelte/icons/grid-3x3';
	import HashIcon from '@lucide/svelte/icons/hash';
	import MapIcon from '@lucide/svelte/icons/map';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import MountainIcon from '@lucide/svelte/icons/mountain';
	import ScissorsIcon from '@lucide/svelte/icons/scissors';
	import SettingsIcon from '@lucide/svelte/icons/settings-2';
	import SlidersIcon from '@lucide/svelte/icons/sliders-horizontal';
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
	import { gridValues, vectorOptions } from '$lib/stores/vector';

	import SecondaryLayerPanel from '$lib/components/secondary-layer/secondary-layer-panel.svelte';
	import ArrowsSettings from '$lib/components/settings/arrows-settings.svelte';
	import CacheSettings from '$lib/components/settings/cache-settings.svelte';
	import ContourSettings from '$lib/components/settings/contour-settings.svelte';
	import OpacitySetting from '$lib/components/settings/opacity-setting.svelte';
	import PopupSettings from '$lib/components/settings/popup-settings.svelte';
	import SoundingSettings from '$lib/components/settings/sounding-settings.svelte';
	import StateSettings from '$lib/components/settings/state-settings.svelte';
	import TileSizeSettings from '$lib/components/settings/tile-size-settings.svelte';
	import UnitSettings from '$lib/components/settings/unit-settings.svelte';
	import * as Sheet from '$lib/components/ui/sheet';

	import { setHillshadeEnabled } from '$lib/hillshade';
	import { changeOMfileURL, reloadVectorStyle } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	import LayerToggle from './layer-toggle.svelte';

	// Reactive snapshots driving the toggle UI.
	const gridDotsOn = $derived($vectorOptions.grid);
	const gridValuesOn = $derived($gridValues);
	const departmentsOn = $derived($showDepartments);
	const labelsOn = $derived($showLabels);
	const hillshadeOn = $derived($preferences.hillshade);
	// Thème du FOND DE CARTE (le chrome reste sombre en permanence — cf. basemap-theme.ts).
	const darkOn = $derived($basemapTheme === 'dark');

	// Points de grille (cercles) : changer le flag `grid` modifie l'URL des tuiles
	// vecteur → `changeOMfileURL()` recharge la source.
	function toggleGridDots(next: boolean) {
		vectorOptions.update((o) => ({ ...o, grid: next }));
		updateUrl('grid', String(next));
		changeOMfileURL();
	}

	// Valeurs aux nœuds : activer force `&grid=true` dans l'URL. Si les points étaient
	// off, l'URL change → `changeOMfileURL()` refait la source ; s'ils étaient déjà on,
	// l'URL est inchangée → `reloadVectorStyle()` reconstruit la couche vecteur en place
	// pour ajouter/retirer le symbol layer. Appeler les deux couvre tous les cas.
	function toggleGridValues(next: boolean) {
		gridValues.set(next);
		updateUrl('grid_values', String(next));
		changeOMfileURL();
		reloadVectorStyle();
	}

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

	// Section « Avancé » repliée par défaut : ces réglages experts/système (cache,
	// taille des tuiles, sondage, réinitialisation) gonflent la complexité perçue
	// alors que la plupart des utilisateurs n'y touchent jamais. Local (non persisté)
	// → repart fermé à chaque session.
	let advancedSettingsOpen = $state(false);

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

{#snippet sectionLabel(text: string)}
	<h3 class="mb-1.5 px-1 text-xs font-semibold tracking-wide text-white/45 uppercase">{text}</h3>
{/snippet}

{#snippet body()}
	<!-- Niveau 1 — calques qu'on bascule au quotidien. Deux cartes encartées :
	     d'abord les calques riches (dépliables), puis les bascules simples. -->
	<section>
		{@render sectionLabel('Calques')}
		<div
			class="overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
		>
			<ArrowsSettings />
			<ContourSettings />
			<!-- Valeurs voisine des isocontours : c'est une façon de lire le champ
			     (valeur exacte au nœud) au même titre que les isolignes. -->
			<LayerToggle label="Valeurs" checked={gridValuesOn} onCheckedChange={toggleGridValues}>
				{#snippet icon()}<HashIcon class="size-[18px]" aria-hidden="true" />{/snippet}
			</LayerToggle>
			<SecondaryLayerPanel />
		</div>
		<div
			class="mt-2.5 overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
		>
			<LayerToggle label="Départements" checked={departmentsOn} onCheckedChange={toggleDepartments}>
				{#snippet icon()}<MapIcon class="size-[18px]" aria-hidden="true" />{/snippet}
			</LayerToggle>
			<LayerToggle label="Villes &amp; pays" checked={labelsOn} onCheckedChange={toggleLabels}>
				{#snippet icon()}<Building2Icon class="size-[18px]" aria-hidden="true" />{/snippet}
			</LayerToggle>
			<LayerToggle label="Relief ombré" checked={hillshadeOn} onCheckedChange={toggleHillshade}>
				{#snippet icon()}<MountainIcon class="size-[18px]" aria-hidden="true" />{/snippet}
			</LayerToggle>
			<OpacitySetting />
		</div>
	</section>

	<!-- Niveau 2 — préférences d'affichage occasionnelles. -->
	<section>
		{@render sectionLabel('Affichage')}
		<div
			class="overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
		>
			<UnitSettings />
			<PopupSettings />
			<LayerToggle label="Mode sombre" checked={darkOn} onCheckedChange={toggleDark}>
				{#snippet icon()}<MoonIcon class="size-[18px]" aria-hidden="true" />{/snippet}
			</LayerToggle>
		</div>
	</section>

	<!-- Niveau 3 — réglages experts/système, repliés par défaut pour dégonfler le panneau. -->
	<section>
		{@render sectionLabel('Avancé')}
		<div class="overflow-hidden rounded-xl bg-white/[0.04]">
			<button
				type="button"
				class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left text-sm"
				aria-expanded={advancedSettingsOpen}
				onclick={() => (advancedSettingsOpen = !advancedSettingsOpen)}
			>
				<span class="flex items-center gap-3">
					<SlidersIcon class="size-[18px] text-white/55" aria-hidden="true" />
					Réglages experts
				</span>
				<ChevronDownIcon
					class={[
						'size-4 text-white/45 transition-transform duration-200 motion-reduce:transition-none',
						advancedSettingsOpen && 'rotate-180'
					]
						.filter(Boolean)
						.join(' ')}
					aria-hidden="true"
				/>
			</button>
			{#if advancedSettingsOpen}
				<div
					class="border-t border-white/[0.06] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
					transition:slide={{ duration: reduceMotion.current ? 0 : 200 }}
				>
					<LayerToggle
						label="Points de grille"
						checked={gridDotsOn}
						onCheckedChange={toggleGridDots}
					>
						{#snippet icon()}<Grid3x3Icon class="size-[18px]" aria-hidden="true" />{/snippet}
					</LayerToggle>
					<TileSizeSettings />
					<SoundingSettings />
					<CacheSettings />
					<StateSettings />
				</div>
			{/if}
		</div>
	</section>

	<!-- Outils — actions ponctuelles, distinctes des réglages. -->
	<section>
		{@render sectionLabel('Outils')}
		<div
			class="overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
		>
			<button
				type="button"
				class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm"
				onclick={() => clippingPanelOpen.set(!get(clippingPanelOpen))}
			>
				<ScissorsIcon class="size-[18px] text-white/55" aria-hidden="true" />
				<span class="flex-1">Découpage</span>
				<ChevronDownIcon class="size-4 -rotate-90 text-white/35" aria-hidden="true" />
			</button>
			<button
				type="button"
				class="hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm"
				onclick={() => helpOpen.set(true)}
			>
				<HelpIcon class="size-[18px] text-white/55" aria-hidden="true" />
				<span class="flex-1">Aide</span>
				<ChevronDownIcon class="size-4 -rotate-90 text-white/35" aria-hidden="true" />
			</button>
		</div>
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
		<!-- Conteneur flex colonne, SANS scroll : seul le corps défile, l'en-tête (titre + ✕)
		     reste figé → fermeture toujours accessible sans scroller, quelle que soit la hauteur. -->
		<div
			use:portal
			class="bg-glass/65 fixed right-0 z-60 flex w-80 flex-col overflow-hidden rounded-l-xl border border-r-0 border-white/15 text-white shadow-lg backdrop-blur-md"
			style="top: {controlsBottom + 8}px; max-height: calc(100dvh - {controlsBottom + 24}px);"
			in:fly={{ x: 320, duration: reduceMotion.current ? 0 : 260, easing: cubicOut }}
			out:fly={{ x: 320, duration: reduceMotion.current ? 0 : 200, easing: cubicIn }}
		>
			<div class="flex shrink-0 items-center justify-between px-3 pt-3 pb-2">
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
			<div class="scrollbar-thin flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-3">
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
