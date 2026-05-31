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
</script>

<!-- Pastille modèle, haut centre -->
<div class="fixed inset-x-0 top-2.5 z-60 flex justify-center">
	<ModelSelector />
</div>

<!-- FAB capture, côté pouce, au-dessus du dock -->
<div class="fixed right-2.5 z-60" style="bottom: calc({$bottomChromeHeight}px + 4.5rem)">
	{@render capture?.()}
</div>

<!-- Dock bas : onglets variables défilants + accès avancé -->
<div
	class="bg-glass/45 fixed inset-x-2.5 z-60 flex items-center gap-2 overflow-x-auto rounded-xl border border-white/15 px-3 py-2 shadow-lg backdrop-blur-md"
	style="bottom: calc({$bottomChromeHeight}px + 0.5rem)"
>
	<VariableTabs />
	<div class="ml-auto shrink-0">{@render advanced?.()}</div>
</div>
