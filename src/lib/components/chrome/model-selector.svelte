<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import StarIcon from '@lucide/svelte/icons/star';
	import { domainOptions } from '@openmeteo/weather-map-layer';

	import { favoriteDomains, toggleFavoriteDomain } from '$lib/stores/favorite-domains';
	import { recentDomains, recordRecentDomain } from '$lib/stores/recent-domains';
	import { domainSelectionOpen as dSO, domain, selectedDomain } from '$lib/stores/variables';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { MODEL_BADGES, MODEL_DESCRIPTIONS, MODEL_SELECTOR_GROUPS } from '$lib/constants';

	let open = $state(get(dSO));
	const unsub = dSO.subscribe((v) => (open = v));
	onDestroy(unsub);

	// Sélectionne un modèle : applique le domaine, l'enregistre dans les récents
	// et referme le popover.
	function select(value: string) {
		$domain = value;
		recordRecentDomain(value);
		dSO.set(false);
	}

	// Bascule l'état favori sans sélectionner le modèle.
	function toggleFavorite(e: Event, value: string) {
		e.preventDefault();
		e.stopPropagation();
		toggleFavoriteDomain(value);
	}

	// Modèles récemment utilisés, résolus en {value, label} et filtrés à ceux
	// réellement enregistrés dans `domainOptions`.
	const recentItems = $derived(
		$recentDomains
			.map((value) => domainOptions.find((o) => o.value === value))
			.filter((o): o is NonNullable<typeof o> => o != null)
			.map((o) => ({ value: o.value, label: o.label ?? o.value }))
	);

	// Favoris, résolus de la même façon.
	const favoriteItems = $derived(
		$favoriteDomains
			.map((value) => domainOptions.find((o) => o.value === value))
			.filter((o): o is NonNullable<typeof o> => o != null)
			.map((o) => ({ value: o.value, label: o.label ?? o.value }))
	);

	const isFavorite = $derived((value: string) => $favoriteDomains.includes(value));
	const selectedBadge = $derived(MODEL_BADGES[$selectedDomain?.value ?? '']);
</script>

{#snippet itemContent(value: string, label: string)}
	{@const badge = MODEL_BADGES[value]}
	{@const description = MODEL_DESCRIPTIONS[value]}
	<div class="flex w-full items-start justify-between gap-2">
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="truncate text-sm font-medium">{label}</span>
				{#if badge}
					<span class="bg-white/10 rounded px-1.5 py-0 text-[10px] font-medium tracking-wide text-white/75">
						{badge}
					</span>
				{/if}
			</div>
			{#if description}
				<div class="mt-0.5 line-clamp-2 text-xs leading-snug text-white/50">
					{description}
				</div>
			{/if}
		</div>
		<div class="flex shrink-0 items-start gap-1">
			<CheckIcon
				class="mt-0.5 size-4 shrink-0 {$selectedDomain.value !== value ? 'text-transparent' : ''}"
				aria-hidden="true"
			/>
			<button
				type="button"
				onclick={(e) => toggleFavorite(e, value)}
				aria-label={isFavorite(value) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
				aria-pressed={isFavorite(value)}
				title={isFavorite(value) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
				tabindex="-1"
				class="focus-visible:ring-sky-300/70 -mr-1 mt-0.5 rounded p-1 focus-visible:outline-none focus-visible:ring-2"
			>
				<StarIcon
					class="size-4 transition-colors {isFavorite(value)
						? 'fill-amber-400 text-amber-400'
						: 'text-white/40 hover:text-amber-300'}"
					aria-hidden="true"
				/>
			</button>
		</div>
	</div>
{/snippet}

<Popover.Root bind:open onOpenChange={(e) => dSO.set(e)}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class="bg-glass/85 hover:bg-glass/95 h-10 md:h-9 cursor-pointer items-center gap-2 rounded-full border border-white/15 px-2.5 py-1 text-white shadow-md glass-blur transition-colors"
				role="combobox"
				aria-expanded={open}
				aria-label="Choisir le modèle météo"
			>
				<GlobeIcon class="size-4 shrink-0 text-sky-300" aria-hidden="true" />
				<span class="hidden min-w-0 truncate sm:inline">
					{$selectedDomain?.label || 'Choisir un modèle'}
				</span>
				<span class="min-w-0 truncate sm:hidden">
					{$selectedDomain?.label || 'Modèle'}
				</span>
				{#if selectedBadge}
					<span class="bg-white/15 hidden rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide text-white/80 sm:inline">
						{selectedBadge}
					</span>
				{/if}
				<ChevronDownIcon
					class="size-4 shrink-0 opacity-60 transition-transform duration-200 {open ? 'rotate-180' : ''}"
					aria-hidden="true"
				/>
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		tabindex={0}
		onOpenAutoFocus={(e) => {
			// Empêche l'autofocus de l'input de recherche : sur mobile il ferait monter
			// le clavier virtuel, qui compresse la liste et capte le geste de scroll.
			// On focus plutôt le modèle actif (centré), comme le sélecteur de variable.
			e.preventDefault();
			const query = document.querySelector(
				'[data-value="' + $selectedDomain?.value + '"]'
			) as HTMLElement | null;
			if (query) {
				query.scrollIntoView({ block: 'center' });
				query.setAttribute('tabindex', '0');
				query.focus();
			}
		}}
		class="bg-glass/90 z-110 w-[22rem] rounded-xl border border-white/10 p-0 shadow-2xl backdrop-blur-xl"
	>
		<Command.Root class="bg-transparent">
			<div class="border-b border-white/10 px-3 py-2.5">
				<Command.Input
					placeholder="Rechercher un modèle…"
					class="bg-white/5 h-9 rounded-lg border border-white/10 px-3 text-sm text-white placeholder:text-white/40 focus:ring-1 focus:ring-sky-300/50 focus:outline-none"
				/>
			</div>
			<Command.List class="max-h-[60vh] overflow-y-auto px-2 py-2">
				<Command.Empty class="py-6 text-center text-sm text-white/50">
					Aucun modèle trouvé.
				</Command.Empty>

				{#if favoriteItems.length}
					<Command.Group class="model-group" heading="Favoris">
						{#each favoriteItems as { value, label } (value)}
							<Command.Item
								value={`fav:${value}`}
								keywords={[value, label]}
								class="hover:bg-amber-400/10 hover:text-white aria-selected:bg-amber-400/10 cursor-pointer rounded-lg px-2.5 py-2"
								onSelect={() => select(value)}
							>
								{@render itemContent(value, label)}
							</Command.Item>
						{/each}
					</Command.Group>
				{/if}

				{#if recentItems.length}
					<Command.Group class="model-group" heading="Récents">
						{#each recentItems as { value, label } (value)}
							<Command.Item
								value={`recent:${value}`}
								keywords={[value, label]}
								class="hover:bg-white/10 aria-selected:bg-white/10 cursor-pointer rounded-lg px-2.5 py-2"
								onSelect={() => select(value)}
							>
								{@render itemContent(value, label)}
							</Command.Item>
						{/each}
					</Command.Group>
				{/if}

				{#each MODEL_SELECTOR_GROUPS as group (group.label)}
					{@const visible = group.domains.filter((d) =>
						domainOptions.some((o) => o.value === d.value)
					)}
					{#if visible.length}
						<Command.Group class="model-group" heading={group.label}>
							{#each visible as { value, label } (value)}
								<Command.Item
									{value}
									class="hover:bg-white/10 aria-selected:bg-white/10 cursor-pointer rounded-lg px-2.5 py-2"
									onSelect={() => select(value)}
								>
									{@render itemContent(value, label)}
								</Command.Item>
							{/each}
						</Command.Group>
					{/if}
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>

<style>
	:global([data-slot='command-group'].model-group) {
		padding-top: 1rem;
	}
	:global([data-slot='command-group'].model-group:first-of-type) {
		padding-top: 0.25rem;
	}
	:global([data-slot='command-group'].model-group [data-slot='command-group-heading']) {
		border-radius: 0.5rem;
		background-color: rgba(255, 255, 255, 0.08);
		padding: 0.375rem 0.625rem;
		margin-bottom: 0.25rem;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #bae6fd;
	}
	:global([data-slot='command-group'].model-group [data-slot='command-group-items']) {
		padding-top: 0.25rem;
		padding-bottom: 0.25rem;
	}
	:global([data-slot='command-item']) {
		border-radius: 0.5rem;
	}
</style>
