<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { type Domain, domainGroups, domainOptions } from '@openmeteo/weather-map-layer';

	import { domainSelectionOpen as dSO, domain, selectedDomain } from '$lib/stores/variables';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { DOMAIN_ALLOWLIST, MODEL_DESCRIPTIONS } from '$lib/constants';

	const visibleDomainOptions = domainOptions.filter((d: Domain) =>
		DOMAIN_ALLOWLIST.includes(d.value)
	);
	const visibleDomainGroups = domainGroups.filter((g) =>
		visibleDomainOptions.some((d) => d.value.startsWith(g.value))
	);

	let open = $state(get(dSO));
	const unsub = dSO.subscribe((v) => (open = v));
	onDestroy(unsub);
</script>

<Popover.Root bind:open onOpenChange={(e) => dSO.set(e)}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class="bg-glass/50 hover:bg-glass/70 h-11 md:h-8 cursor-pointer justify-between gap-1.5 rounded-lg border border-white/20 px-3 text-white shadow-md backdrop-blur-md"
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
				{#each visibleDomainGroups as { value: group, label: groupLabel } (group)}
					<Command.Group heading={groupLabel}>
						{#each visibleDomainOptions as { value, label } (value)}
							{#if value.startsWith(group)}
								<Command.Item
									{value}
									class="hover:bg-primary/20 cursor-pointer"
									onSelect={() => {
										$domain = value;
										dSO.set(false);
									}}
								>
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
											class="mt-0.5 size-4 shrink-0 {$selectedDomain.value !== value
												? 'text-transparent'
												: ''}"
										/>
									</div>
								</Command.Item>
							{/if}
						{/each}
					</Command.Group>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
