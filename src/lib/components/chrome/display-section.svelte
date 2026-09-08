<script lang="ts">
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import HashIcon from '@lucide/svelte/icons/hash';
	import MapIcon from '@lucide/svelte/icons/map';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import MountainIcon from '@lucide/svelte/icons/mountain';

	import { basemapTheme } from '$lib/stores/basemap-theme';
	import { DEFAULT_SHOW_DEPARTMENTS, showDepartments } from '$lib/stores/departments';
	import { DEFAULT_SHOW_LABELS, showLabels } from '$lib/stores/labels';
	import { defaultPreferences, preferences } from '$lib/stores/preferences';
	import { domain } from '$lib/stores/variables';
	import { gridValues } from '$lib/stores/vector';

	import ArrowsSettings from '$lib/components/settings/arrows-settings.svelte';
	import ContourSettings from '$lib/components/settings/contour-settings.svelte';
	import PopupSettings from '$lib/components/settings/popup-settings.svelte';

	import { WEATHER_AI_GLOBAL_DOMAIN } from '$lib/constants';
	import { setHillshadeEnabled } from '$lib/hillshade';
	import { changeOMfileURL, reloadVectorStyle } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	import LayerToggle from './layer-toggle.svelte';

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
</script>

<!-- Calques riches OM ; les produits JSON ont leur propre lecture au clic. -->
{#if $domain !== WEATHER_AI_GLOBAL_DOMAIN}
	<div
		class="overflow-hidden rounded-xl bg-white/[0.04] [&>*+*]:border-t [&>*+*]:border-white/[0.06]"
	>
		<ContourSettings />
		<ArrowsSettings />
		<LayerToggle label="Valeurs" checked={gridValuesOn} onCheckedChange={toggleGridValues}>
			{#snippet icon()}<HashIcon class="size-[18px]" aria-hidden="true" />{/snippet}
		</LayerToggle>
		<PopupSettings />
	</div>
{/if}

<!-- Habillage de la carte -->
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
	<LayerToggle label="Mode sombre" checked={darkOn} onCheckedChange={toggleDark}>
		{#snippet icon()}<MoonIcon class="size-[18px]" aria-hidden="true" />{/snippet}
	</LayerToggle>
</div>
