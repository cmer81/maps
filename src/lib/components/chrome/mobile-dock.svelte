<script lang="ts">
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import LayersIcon from '@lucide/svelte/icons/layers';

	import { pointWorkspace } from '$lib/stores/point-workspace';
	import { bottomChromeHeight } from '$lib/stores/preferences';

	import * as Sheet from '$lib/components/ui/sheet';

	import LayerList from './layer-list.svelte';
	import ModelSelector from './model-selector.svelte';

	import type { Snippet } from 'svelte';

	interface Props {
		capture?: Snippet;
		display?: Snippet;
		style?: Snippet;
	}
	let { capture, display, style }: Props = $props();

	let open = $state(false);
	let activeTab: 'layers' | 'display' = $state('layers');
</script>

<!-- FAB + poignée masqués quand le tiroir météogramme est ouvert : il couvre la
     moitié basse de l'écran, ces éléments flottants le chevaucheraient (z-60 > z-40). -->
{#if !$pointWorkspace.open}
	<!-- FAB capture, décalé à gauche des contrôles MapLibre (bas-droite), au-dessus de la poignée -->
	<div class="fixed right-16 z-60" style="bottom: calc({$bottomChromeHeight}px + 4.5rem)">
		{@render capture?.()}
	</div>

	<!-- Poignée d'ouverture du bottom-sheet, au-dessus de la timeline -->
	<button
		type="button"
		onclick={() => (open = true)}
		aria-expanded={open}
		class="bg-glass/85 hover:bg-glass/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 fixed left-1/2 z-60 flex h-11 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-lg border border-white/20 px-4 text-sm text-white shadow-md glass-blur"
		style="bottom: calc({$bottomChromeHeight}px + 0.5rem)"
	>
		<LayersIcon class="size-4" aria-hidden="true" />
		Calques &amp; affichage
		<ChevronUpIcon class="size-4 opacity-60" aria-hidden="true" />
	</button>
{/if}

<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		class="bg-glass/90 z-100 flex max-h-[85vh] flex-col gap-0 border-none text-white backdrop-blur-xl"
	>
		<Sheet.Title class="sr-only">Calques &amp; affichage</Sheet.Title>
		<!-- Onglets (cibles ≥ 44 px, gap ≥ 8 px) ; le corps seul défile. -->
		<div role="tablist" aria-label="Réglages carte" class="flex shrink-0 gap-2 px-4 pt-4">
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === 'layers'}
				onclick={() => (activeTab = 'layers')}
				class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 min-h-11 flex-1 cursor-pointer rounded-lg text-sm font-medium {activeTab ===
				'layers'
					? 'bg-white/12 text-sky-300'
					: 'text-white/70 hover:bg-white/[0.05]'}"
			>
				Calques
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === 'display'}
				onclick={() => (activeTab = 'display')}
				class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 min-h-11 flex-1 cursor-pointer rounded-lg text-sm font-medium {activeTab ===
				'display'
					? 'bg-white/12 text-sky-300'
					: 'text-white/70 hover:bg-white/[0.05]'}"
			>
				Affichage &amp; style
			</button>
		</div>
		<div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-8">
			{#if activeTab === 'layers'}
				<div class="mb-3 flex justify-center"><ModelSelector /></div>
				<LayerList />
			{:else}
				{@render display?.()}
				<div class="mt-4">{@render style?.()}</div>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
