<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { domainOptions } from '@openmeteo/weather-map-layer';

	import { recentDomains, recordRecentDomain } from '$lib/stores/recent-domains';
	import { domainSelectionOpen as dSO, domain, selectedDomain } from '$lib/stores/variables';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { MODEL_DESCRIPTIONS, MODEL_SELECTOR_GROUPS } from '$lib/constants';

	let open = $state(get(dSO));
	const unsub = dSO.subscribe((v) => (open = v));
	onDestroy(unsub);

	// Sélectionne un modèle : applique le domaine, l'enregistre dans les récents
	// (groupe « Récents » en tête) et referme le popover.
	function select(value: string) {
		$domain = value;
		recordRecentDomain(value);
		dSO.set(false);
	}

	// Modèles récemment utilisés, résolus en {value, label} et filtrés à ceux
	// réellement enregistrés dans `domainOptions` (un domaine bucket absent — ex.
	// anomalie sans bucket — disparaît, comme pour les groupes principaux).
	const recentItems = $derived(
		$recentDomains
			.map((value) => domainOptions.find((o) => o.value === value))
			.filter((o): o is NonNullable<typeof o> => o != null)
			.map((o) => ({ value: o.value, label: o.label ?? o.value }))
	);
</script>

<!-- Contenu d'un item, partagé entre le groupe « Récents » et les groupes
     fournisseurs pour éviter toute divergence de rendu. -->
{#snippet itemContent(value: string, label: string)}
	<div class="flex w-full items-start justify-between gap-2">
		<div class="min-w-0">
			<div>{label}</div>
			{#if MODEL_DESCRIPTIONS[value]}
				<div class="text-xs leading-snug text-white/55">
					{MODEL_DESCRIPTIONS[value]}
				</div>
			{/if}
		</div>
		<CheckIcon
			class="mt-0.5 size-4 shrink-0 {$selectedDomain.value !== value ? 'text-transparent' : ''}"
		/>
	</div>
{/snippet}

<Popover.Root bind:open onOpenChange={(e) => dSO.set(e)}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class="bg-glass/50 hover:bg-glass/70 h-11 md:h-8 cursor-pointer justify-between gap-1.5 rounded-lg border border-white/20 px-3 text-white shadow-md glass-blur"
				role="combobox"
				aria-expanded={open}
				aria-label="Choisir le modèle météo"
			>
				<span class="truncate">{$selectedDomain?.label || 'Modèle…'}</span>
				<ChevronsUpDownIcon class="size-4 shrink-0 opacity-60" aria-hidden="true" />
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
		class="bg-glass/60 z-80 w-72 rounded-lg border-none p-0 backdrop-blur-xl"
	>
		<Command.Root class="bg-transparent">
			<Command.Input placeholder="Rechercher un modèle…" class="border-none ring-0" />
			<Command.List>
				<Command.Empty>Aucun modèle trouvé.</Command.Empty>
				{#if recentItems.length}
					<Command.Group heading="Récents">
						{#each recentItems as { value, label } (value)}
							<!-- value préfixée pour rester unique vs la copie du groupe fournisseur
							     (deux items de même `value` partageraient l'état surligné) ; `keywords`
							     préserve la recherche sur le nom/valeur réels du modèle. -->
							<Command.Item
								value={`recent:${value}`}
								keywords={[value, label]}
								class="hover:bg-primary/20 cursor-pointer"
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
						<Command.Group heading={group.label}>
							{#each visible as { value, label } (value)}
								<Command.Item
									{value}
									class="hover:bg-primary/20 cursor-pointer"
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
