<script lang="ts">
	import type { CategoricalLegendEntry } from '$lib/color-scales/legend';

	interface Props {
		entries: CategoricalLegendEntry[];
		opacity: number;
		isDark: boolean;
	}

	let { entries, opacity, isDark: _isDark }: Props = $props();

	// Code 0 (« Aucune » = transparent) masqué de la liste : rien à montrer.
	const visible = $derived(entries.filter((e) => e.code !== 0));
</script>

<div class="bg-glass/45 flex flex-col rounded-b-lg backdrop-blur-md">
	{#each visible as entry (entry.code)}
		{@const alpha = entry.color[3] ?? 1}
		<div class="flex items-center gap-2 px-2 py-1">
			<span
				class="inline-block size-3.5 shrink-0 rounded-sm border border-white/30"
				style="background: rgb({entry.color[0]}, {entry.color[1]}, {entry
					.color[2]}); opacity: {(alpha * opacity) / 100};"
			></span>
			<span class="text-xs whitespace-nowrap text-white">{entry.label}</span>
		</div>
	{/each}
</div>
