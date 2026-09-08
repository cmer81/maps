<script lang="ts">
	import {
		TRACKS_PRODUCT,
		formatForecastDate,
		isTracks,
		productLabel,
		trackColor,
		trackKey
	} from '$lib/weather-ai/products';
	import { weatherAi } from '$lib/weather-ai/state';

	const ids = $derived(
		[...new Set($weatherAi.catalog?.produits.map((p) => p.product_id) ?? [])].sort(
			(a, b) => Number(b === TRACKS_PRODUCT) - Number(a === TRACKS_PRODUCT)
		)
	);
	const members = $derived(
		[
			...new Set(
				$weatherAi.data.flatMap((d) =>
					isTracks(d.product) ? d.product.sources.map((s) => s.member) : []
				)
			)
		].sort((a, b) => a - b)
	);
	const candidates = $derived([
		...new Map(
			$weatherAi.data
				.flatMap((d) => (isTracks(d.product) ? d.product.tracks : []))
				.filter((p) => $weatherAi.member === undefined || p.member === $weatherAi.member)
				.map((p) => [trackKey(p), p])
		).values()
	]);
</script>

<div class="flex flex-col gap-4 text-sm text-white">
	<div class="flex flex-col gap-1" aria-label="Produits disponibles">
		{#each ids as id (id)}
			<button
				type="button"
				aria-pressed={$weatherAi.productId === id}
				onclick={() => weatherAi.selectProduct(id)}
				class="min-h-11 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300 {$weatherAi.productId ===
				id
					? 'border-sky-400/40 bg-sky-400/10 text-sky-300'
					: 'border-transparent text-white/80'}">{productLabel(id)}</button
			>
		{/each}
		{#if !ids.length}<p class="px-2 text-xs text-white/65">
				{$weatherAi.status === 'loading' ? 'Chargement des produits…' : 'Aucun produit disponible.'}
			</p>{/if}
	</div>
	<label class="flex min-w-0 flex-col gap-1.5 text-xs text-white/65">
		Initialisation du modèle
		<select
			aria-label="Initialisation du modèle"
			class="min-h-11 w-full min-w-0 rounded-lg border border-white/20 bg-slate-900 px-2 text-xs text-white focus-visible:outline-2 focus-visible:outline-sky-300"
			value={$weatherAi.run?.run_id ?? ''}
			onchange={(e) => weatherAi.selectRun(e.currentTarget.value)}
			disabled={!$weatherAi.runs.length}
		>
			{#if !$weatherAi.run}<option value="">Chargement…</option>{/if}
			{#each $weatherAi.runs as run (run.run_id)}
				<option value={run.run_id}
					>{formatForecastDate(run.init_time)} · publié {formatForecastDate(
						run.published_at
					)}</option
				>
			{/each}
		</select>
	</label>
	<div class="rounded-lg bg-white/5 p-3 text-xs leading-relaxed">
		<div class="text-white/60">Publication</div>
		<div class="tabular-nums">{formatForecastDate($weatherAi.catalog?.published_at)}</div>
		<p class="mt-2 text-white/60">
			Chaque entrée correspond à une publication disponible. Plusieurs publications peuvent partager
			la même initialisation.
		</p>
	</div>
	{#if $weatherAi.historyError}
		<div role="status" class="text-xs text-amber-200">
			{$weatherAi.historyError}<button
				class="mt-1 block min-h-11 underline"
				onclick={() => weatherAi.refreshHistory()}>Recharger l’historique</button
			>
		</div>
	{/if}
	{#if $weatherAi.productId === TRACKS_PRODUCT}
		<div class="border-t border-white/10 pt-3">
			{#if members.length > 1}
				<label class="text-xs text-white/70"
					>Membre de prévision<select
						aria-label="Membre de prévision"
						class="mt-1 min-h-11 w-full rounded-lg bg-slate-900 px-2"
						value={$weatherAi.member ?? 'all'}
						onchange={(e) =>
							weatherAi.selectMember(
								e.currentTarget.value === 'all' ? undefined : Number(e.currentTarget.value)
							)}
						><option value="all">Tous les membres disponibles</option
						>{#each members as member (member)}<option value={member}>Membre {member}</option
							>{/each}</select
					></label
				>
			{:else if members.length === 1}<p class="text-xs text-white/70">
					1 membre de prévision disponible
				</p>{/if}
			<p class="mt-2 text-xs leading-relaxed text-white/60">
				Les tracés identifient des trajectoires candidates distinctes. Ils ne représentent pas
				plusieurs scénarios d’un même cyclone.
			</p>
			{#if candidates.length}
				<p class="mt-3 text-xs text-white/70">
					{candidates.length} trajectoire{candidates.length > 1 ? 's' : ''} candidate{candidates.length >
					1
						? 's'
						: ''}
				</p>
				<div class="mt-1 max-h-56 overflow-y-auto" aria-label="Liste des trajectoires candidates">
					{#each candidates as p (trackKey(p))}
						<button
							class="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300 {$weatherAi.selectedTrack ===
							trackKey(p)
								? 'bg-white/10'
								: ''}"
							aria-pressed={$weatherAi.selectedTrack === trackKey(p)}
							onclick={() => weatherAi.selectTrack(trackKey(p))}
							><span
								class="size-2.5 shrink-0 rounded-full"
								style:background={trackColor(trackKey(p))}
							></span><span class="break-all">{p.model_track_id}</span>{#if members.length > 1}<span
									class="ml-auto shrink-0 text-white/55">M{p.member}</span
								>{/if}</button
						>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
