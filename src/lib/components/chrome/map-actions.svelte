<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import LinkIcon from '@lucide/svelte/icons/link';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';

	let copied = $state(false);
	let isFullscreen = $state(false);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(window.location.href);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* presse-papier indisponible : silencieux */
		}
	}

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			void document.documentElement.requestFullscreen?.();
		} else {
			void document.exitFullscreen?.();
		}
	}

	$effect(() => {
		const onChange = () => (isFullscreen = !!document.fullscreenElement);
		document.addEventListener('fullscreenchange', onChange);
		return () => document.removeEventListener('fullscreenchange', onChange);
	});
</script>

<!-- Cluster flottant haut-droite, `fixed` (et non `absolute`) : app-chrome.svelte
     est monté en frère de `#map_container` dans +page.svelte, pas à l'intérieur —
     un positionnement `absolute` se calerait donc sur `<body>` et non sur la
     carte. Header (44px, z-60) + bande de contexte (26px, z-40) occupent déjà le
     haut ; l'offset (44+26+12 marge) évite de les recouvrir, même que le motif
     déjà en place dans app-chrome.svelte pour la bande de contexte (`fixed
     top-11`). z-40 : même plan que la bande de contexte, au-dessus de la carte,
     sous le header et les Sheets/dialogs (z-100). -->
<div class="fixed top-[82px] retro:top-[112px] right-3 z-40 flex gap-1">
	<button
		type="button"
		onclick={copyLink}
		aria-label="Copier le lien de la vue"
		title="Copier le lien"
		class="bg-glass/85 hover:bg-glass/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-white/20 text-white shadow-md glass-blur"
	>
		{#if copied}
			<CheckIcon class="size-4 text-emerald-400" aria-hidden="true" />
		{:else}
			<LinkIcon class="size-4" aria-hidden="true" />
		{/if}
	</button>
	<button
		type="button"
		onclick={toggleFullscreen}
		aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
		title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
		class="bg-glass/85 hover:bg-glass/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-white/20 text-white shadow-md glass-blur"
	>
		{#if isFullscreen}
			<MinimizeIcon class="size-4" aria-hidden="true" />
		{:else}
			<MaximizeIcon class="size-4" aria-hidden="true" />
		{/if}
	</button>
</div>
