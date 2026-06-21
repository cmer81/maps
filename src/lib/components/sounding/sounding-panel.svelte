<script lang="ts">
	import { get } from 'svelte/store';

	import * as maplibregl from 'maplibre-gl';

	import { map as mapStore } from '$lib/stores/map';
	import { sounding } from '$lib/stores/sounding';
	import { time } from '$lib/stores/time';

	import { fetchColumn } from '$lib/sounding/column';
	import { computeIndices } from '$lib/sounding/indices';
	import { liftParcel } from '$lib/sounding/parcel';
	import { trueElevation } from '$lib/view-3d';

	import Hodograph from './hodograph.svelte';
	import IndicesTable from './indices-table.svelte';
	import SkewT from './skew-t.svelte';

	import type { ColumnProfile, ParcelResult, SoundingIndices } from '$lib/sounding/types';

	let profile = $state<ColumnProfile | null>(null);
	let parcel = $state<ParcelResult | null>(null);
	let indices = $state<SoundingIndices | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	let generation = 0;

	async function load(lat: number, lng: number) {
		// Pas d'AbortController : le cache de blocs est partagé entre lectures, et
		// annuler une charge périmée rejette des fetchs de blocs dont la charge
		// suivante dépend (dédup inflight) → lectures NaN. Le jeton `generation`
		// suffit à écarter les résultats obsolètes sans corrompre les lectures en cours.
		const myGen = ++generation;
		loading = true;
		error = null;
		try {
			const map = get(mapStore);
			// `queryTerrainElevation` renvoie l'altitude DEM × exagération (1,4 en vue
			// 3D) ; on l'annule pour partir de l'altitude de surface réelle.
			const elev =
				trueElevation(
					map?.queryTerrainElevation(new maplibregl.LngLat(lng, lat)),
					map?.getTerrain()?.exaggeration
				) ?? 0;
			const col = await fetchColumn(lat, lng, elev);
			if (myGen !== generation) return;
			if (col.levels.length < 3) {
				error = 'Pas assez de données à ce point.';
				profile = null;
				return;
			}
			profile = col;
			parcel = liftParcel(col.surface, col.levels);
			indices = computeIndices(col);
		} catch {
			if (myGen === generation) error = 'Échec du chargement du sondage.';
		} finally {
			if (myGen === generation) loading = false;
		}
	}

	let debounce: ReturnType<typeof setTimeout> | undefined;
	let lastKey = '';
	$effect(() => {
		// Dépendances : point cliqué + curseur temps (recalcul live au scrub).
		// On exclut activeTab : changer d'onglet ne doit pas relancer ~125 lectures.
		const { open, lat, lng } = $sounding;
		const key = `${lat},${lng},${String($time)}`;
		if (!open || lat === null || lng === null) return;
		if (key === lastKey) return;
		lastKey = key;
		clearTimeout(debounce);
		debounce = setTimeout(() => load(lat, lng), 300);
	});

	// Nettoyage du timer en attente au démontage du composant.
	$effect(() => () => clearTimeout(debounce));
</script>

{#if $sounding.open}
	<div
		class="sounding-panel fixed bottom-4 right-4 z-40 w-[380px] max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-lg"
	>
		<div class="flex items-center justify-between border-b p-2">
			<div class="flex gap-1">
				<button
					class="rounded px-2 py-1 text-sm hover:bg-accent"
					class:font-bold={$sounding.activeTab === 'skewt'}
					onclick={() => sounding.setTab('skewt')}
				>
					Skew-T
				</button>
				<button
					class="rounded px-2 py-1 text-sm hover:bg-accent"
					class:font-bold={$sounding.activeTab === 'hodograph'}
					onclick={() => sounding.setTab('hodograph')}
				>
					Hodographe
				</button>
				<button
					class="rounded px-2 py-1 text-sm hover:bg-accent"
					class:font-bold={$sounding.activeTab === 'indices'}
					onclick={() => sounding.setTab('indices')}
				>
					Indices
				</button>
			</div>
			<button
				class="rounded px-2 py-1 text-sm hover:bg-accent"
				aria-label="Fermer"
				onclick={() => sounding.close()}
			>
				✕
			</button>
		</div>
		<div class="h-[460px] p-2">
			{#if loading}
				<p class="p-4 text-sm text-muted-foreground">Chargement du sondage…</p>
			{:else if error}
				<p class="p-4 text-sm text-destructive">
					{error}
					<button
						class="underline"
						onclick={() => $sounding.lat !== null && load($sounding.lat, $sounding.lng!)}
					>
						Recharger
					</button>
				</p>
			{:else if profile && parcel && indices}
				{#if $sounding.activeTab === 'skewt'}<SkewT {profile} {parcel} />{/if}
				{#if $sounding.activeTab === 'hodograph'}<Hodograph {profile} />{/if}
				{#if $sounding.activeTab === 'indices'}<IndicesTable {indices} />{/if}
			{/if}
		</div>
	</div>
{/if}
