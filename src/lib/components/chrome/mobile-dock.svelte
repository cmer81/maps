<script lang="ts">
	import { bottomChromeHeight } from '$lib/stores/preferences';

	import ModelSelector from './model-selector.svelte';
	import VariableTabs from './variable-tabs.svelte';

	import type { Snippet } from 'svelte';

	interface Props {
		capture?: Snippet;
		advanced?: Snippet;
	}
	let { capture, advanced }: Props = $props();

	const SITE_URL = 'https://www.infoclimat.fr';
	const LOGO_URL = 'https://static.infoclimat.net/images/v5.1/logo_IC_5.1.png';
</script>

<!-- Logo Infoclimat, coin haut-gauche (lien vers le site) -->
<a
	href={SITE_URL}
	title="Infoclimat"
	target="_blank"
	rel="noopener"
	aria-label="Infoclimat"
	class="bg-glass/50 fixed top-2.5 left-2.5 z-60 flex h-11 items-center rounded-lg border border-white/20 px-2.5 shadow-md glass-blur"
>
	<img src={LOGO_URL} alt="Infoclimat" class="h-6 w-auto" crossorigin="anonymous" />
</a>

<!-- Pastille modèle, haut centre -->
<!-- pointer-events-none sur le conteneur pleine largeur : sans ça, sa zone vide
     recouvre le logo (même top/z-index) et capte les taps destinés au logo. -->
<div class="pointer-events-none fixed inset-x-0 top-2.5 z-60 flex justify-center">
	<div class="pointer-events-auto"><ModelSelector /></div>
</div>

<!-- FAB capture, côté pouce, au-dessus du dock -->
<div class="fixed right-2.5 z-60" style="bottom: calc({$bottomChromeHeight}px + 4.5rem)">
	{@render capture?.()}
</div>

<!-- Dock bas : onglets variables défilants + accès avancé -->
<div
	class="fixed left-1/2 z-60 flex w-max max-w-[calc(100vw-1.25rem)] -translate-x-1/2 items-center gap-2"
	style="bottom: calc({$bottomChromeHeight}px + 0.5rem)"
>
	<VariableTabs />
	<div class="shrink-0">{@render advanced?.()}</div>
</div>
