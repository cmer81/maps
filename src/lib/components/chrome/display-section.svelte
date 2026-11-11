<script lang="ts">
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import HashIcon from '@lucide/svelte/icons/hash';
	import MapIcon from '@lucide/svelte/icons/map';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import MountainIcon from '@lucide/svelte/icons/mountain';
	import PaletteIcon from '@lucide/svelte/icons/palette';

	import { basemapTheme } from '$lib/stores/basemap-theme';
	import { DEFAULT_SHOW_DEPARTMENTS, showDepartments } from '$lib/stores/departments';
	import { DEFAULT_SHOW_LABELS, showLabels } from '$lib/stores/labels';
	import { defaultPreferences, preferences } from '$lib/stores/preferences';
	import { skin } from '$lib/stores/skin';
	import { gridValues } from '$lib/stores/vector';

	import ArrowsSettings from '$lib/components/settings/arrows-settings.svelte';
	import ContourSettings from '$lib/components/settings/contour-settings.svelte';
	import OpacitySetting from '$lib/components/settings/opacity-setting.svelte';
	import PopupSettings from '$lib/components/settings/popup-settings.svelte';

	import { setHillshadeEnabled } from '$lib/hillshade';
	import { changeOMfileURL, reloadVectorStyle } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	import LayerToggle from './layer-toggle.svelte';

	import type { Snippet } from 'svelte';

	const gridValuesOn = $derived($gridValues);
	const departmentsOn = $derived($showDepartments);
	const labelsOn = $derived($showLabels);
	const hillshadeOn = $derived($preferences.hillshade);
	// Thème du FOND DE CARTE (le chrome reste sombre en permanence — cf. basemap-theme.ts).
	const darkOn = $derived($basemapTheme === 'dark');

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

	// Habillage du chrome (prototype « Rétro 2000 », cf. src/skins/retro.css).
	const retroOn = $derived($skin === 'retro');
	function toggleRetro(next: boolean) {
		skin.set(next ? 'retro' : 'modern');
	}
</script>

{#snippet group(title: string, hint: string, body: Snippet)}
	<section class="flex flex-col gap-1.5">
		<div class="px-1">
			<h3 class="text-xs font-semibold text-white/80">{title}</h3>
			<p class="text-[11px] text-white/40 [@media(max-height:820px)]:hidden">{hint}</p>
		</div>
		<div
			class="overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
		>
			{@render body()}
		</div>
	</section>
{/snippet}

{#snippet weather()}
	<ContourSettings />
	<ArrowsSettings />
	<LayerToggle label="Valeurs aux points" checked={gridValuesOn} onCheckedChange={toggleGridValues}>
		{#snippet icon()}<HashIcon class="size-[18px]" aria-hidden="true" />{/snippet}
	</LayerToggle>
	<OpacitySetting />
{/snippet}

{#snippet basemap()}
	<LayerToggle label="Départements" checked={departmentsOn} onCheckedChange={toggleDepartments}>
		{#snippet icon()}<MapIcon class="size-[18px]" aria-hidden="true" />{/snippet}
	</LayerToggle>
	<LayerToggle label="Villes &amp; pays" checked={labelsOn} onCheckedChange={toggleLabels}>
		{#snippet icon()}<Building2Icon class="size-[18px]" aria-hidden="true" />{/snippet}
	</LayerToggle>
	<LayerToggle label="Relief ombré" checked={hillshadeOn} onCheckedChange={toggleHillshade}>
		{#snippet icon()}<MountainIcon class="size-[18px]" aria-hidden="true" />{/snippet}
	</LayerToggle>
	<LayerToggle label="Fond sombre" checked={darkOn} onCheckedChange={toggleDark}>
		{#snippet icon()}<MoonIcon class="size-[18px]" aria-hidden="true" />{/snippet}
	</LayerToggle>
{/snippet}

{#snippet appearance()}
	<LayerToggle label="Habillage rétro 2000" checked={retroOn} onCheckedChange={toggleRetro}>
		{#snippet icon()}<PaletteIcon class="size-[18px]" aria-hidden="true" />{/snippet}
	</LayerToggle>
{/snippet}

{#snippet interaction()}
	<PopupSettings />
{/snippet}

<div class="flex flex-col gap-4">
	{@render group('Calque météo', 'Lecture du champ affiché', weather)}
	{@render group('Fond de carte', 'Repères géographiques', basemap)}
	{@render group('Interaction', 'Lecture de valeur au pointeur', interaction)}
	{@render group('Habillage', 'Apparence de l’interface (prototype)', appearance)}
</div>
