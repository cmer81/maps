<script lang="ts">
	import { productLabel } from '$lib/weather-ai/products';
	import { weatherAi } from '$lib/weather-ai/state';

	const attribution = $derived(
		$weatherAi.data[0]?.attribution ??
			$weatherAi.catalog?.produits.find((p) => p.product_id === $weatherAi.productId)?.attribution
	);
	const license = $derived(
		$weatherAi.data[0]?.license_notice ??
			$weatherAi.catalog?.produits.find((p) => p.product_id === $weatherAi.productId)
				?.license_notice
	);
</script>

<div class="bg-glass/95 border-b border-white/10 px-3 py-2 text-white glass-blur">
	<div class="flex flex-wrap items-center gap-2 text-xs">
		<strong class="font-medium">{productLabel($weatherAi.productId)}</strong><span
			class="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-200">Expérimental</span
		><span class="text-[11px] text-white/65">Aucune valeur d’alerte</span>
	</div>
	<details class="mt-1 text-[11px] text-white/65">
		<summary class="w-fit cursor-pointer py-1 focus-visible:outline-2 focus-visible:outline-sky-300"
			>Source &amp; attribution</summary
		>
		<div class="max-h-32 overflow-y-auto pt-1">
			<p>{attribution ?? 'Attribution en attente du catalogue.'}</p>
			{#if license}<p class="mt-1">{license}</p>{/if}
		</div>
	</details>
</div>
