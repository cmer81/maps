<script lang="ts">
	import { getColorScale } from '@openmeteo/weather-map-layer';
	import { mode } from 'mode-watcher';

	import { customColorScales, omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import { getDisplayUnit, unitPreferences } from '$lib/stores/units';
	import { domain, selectedVariable, variable } from '$lib/stores/variables';

	import { WEATHER_AI_DOMAIN } from '$lib/constants';
	import { translateVariableLabel } from '$lib/i18n/variables-fr';

	const label = $derived($selectedVariable ? translateVariableLabel($selectedVariable.label) : '');

	// Unité d'affichage : miroir de la dérivation de scale.svelte (lignes 48-53 &
	// 139). Pas de cycle d'import entre units.ts/variables.ts/om-protocol-settings.ts
	// (vérifié), mais `mode.current` (mode-watcher) est un rune, pas un store
	// svelte : un `derived()` classique ne réagirait pas à ses changements en
	// dehors d'un module `.svelte.ts` — renommer units.ts casserait tous ses
	// imports existants (`$lib/stores/units`). On inline donc les 4 lignes ici
	// plutôt que d'extraire un store partagé, et on laisse scale.svelte inchangé.
	const isDark = $derived(mode.current === 'dark');
	const baseColorScale = $derived(
		getColorScale($variable, isDark, $omProtocolSettings.colorScales)
	);
	const colorScale = $derived($customColorScales[$variable] ?? baseColorScale);
	const displayUnit = $derived(getDisplayUnit(colorScale.unit, $unitPreferences, $variable));
</script>

{#if label}
	<!-- Bande de contexte : rappelle « qu'est-ce que je regarde ? » juste au-dessus
	     de la carte, y compris sur mobile où le fil contextuel du header est masqué.
	     Masquée si aucune variable sélectionnée. -->
	<div
		class="bg-glass/95 flex h-[26px] shrink-0 items-center gap-2 border-b border-white/10 px-3 text-xs text-white/60 glass-blur"
	>
		<span class="min-w-0 truncate font-medium text-white">{label}</span>
		{#if displayUnit}<span class="shrink-0 tabular-nums text-white/50">({displayUnit})</span>{/if}
		{#if $domain === WEATHER_AI_DOMAIN}
			<!-- Visible panneau replié : le modèle IA reste signalé comme expérimental.
			     Mentions complètes dans l'onglet Données (weather-ai-model-notice). -->
			<span
				class="shrink-0 rounded bg-amber-300 px-1.5 py-px text-[10px] font-bold tracking-wide whitespace-nowrap text-slate-950 uppercase"
				title="Weather AI (WeatherNext, Google DeepMind) : prévision expérimentale, ne remplace aucune alerte, vigilance ou bulletin officiel."
				>Expérimental<span class="hidden sm:inline"> · modèle IA</span></span
			>
		{/if}
	</div>
{/if}
