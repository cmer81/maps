<!--
	Bandeau d'aveu du « Mode Confort™ » (easter egg ?giec=non).
	Volontairement NON masquable : tant que le mode est actif, l'aveu ironique
	reste à l'écran (et il est aussi gravé dans le watermark des exports PNG via
	png-export.ts), pour qu'aucun screenshot de la carte miroitée ne puisse
	circuler sans sa propre punchline. pointer-events-none → n'intercepte rien.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';

	import { COMFORT_BANNER_TEXT, comfortMode } from '$lib/stores/comfort';

	import { startChristmasMusic, stopChristmasMusic } from '$lib/christmas-audio';

	let musicOn = $state(false);

	const toggleMusic = async () => {
		if (musicOn) {
			stopChristmasMusic();
			musicOn = false;
		} else {
			await startChristmasMusic();
			musicOn = true;
		}
	};

	// Quitter le Mode Confort coupe la musique (sinon elle survivrait à l'easter egg).
	$effect(() => {
		if (!$comfortMode && musicOn) {
			stopChristmasMusic();
			musicOn = false;
		}
	});

	onDestroy(stopChristmasMusic);
</script>

{#if $comfortMode}
	<!-- top-16 : passe SOUS la top-bar (fixed top-2.5 h-12 → ~58px) au lieu d'être
	     masqué derrière elle. Centré sur la carte, sans gêner les contrôles. -->
	<div
		class="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-3"
		role="status"
		transition:fly={{ y: -24, duration: 250 }}
	>
		<div
			class="pointer-events-auto flex max-w-[92vw] items-center gap-2 rounded-full border border-amber-300/40 bg-amber-500/90 py-1.5 pr-2 pl-4 text-sm font-semibold text-amber-950 shadow-lg backdrop-blur-sm"
		>
			<span class="truncate">{COMFORT_BANNER_TEXT}</span>
			<button
				type="button"
				onclick={toggleMusic}
				class="shrink-0 rounded-full bg-amber-950/15 px-2 py-0.5 transition-colors hover:bg-amber-950/25"
				title={musicOn ? 'Couper la musique' : 'Ambiance de Noël'}
				aria-label={musicOn ? 'Couper la musique' : 'Ambiance de Noël'}
			>
				{musicOn ? '🔇' : '🔊'}
			</button>
		</div>
	</div>
{/if}
