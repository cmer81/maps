<script lang="ts">
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	import {
		level,
		levelGroupSelected,
		selectedDomain,
		selectedVariable,
		unit
	} from '$lib/stores/variables';

	import { Button } from '$lib/components/ui/button';

	import { translateVariableLabel } from '$lib/i18n/variables-fr';
</script>

<div class="flex flex-col gap-2.5">
	<Button
		variant="outline"
		class="bg-glass/75 dark:bg-glass/75 backdrop-blur-sm shadow-md hover:bg-background! h-7.25 w-45 cursor-pointer justify-between rounded border-none p-1.5!"
		role="combobox"
	>
		<div class="truncate">
			{$selectedDomain?.label || 'Choisir un domaine…'}
		</div>
		<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
	</Button>

	<Button
		variant="outline"
		class="bg-glass/75 dark:bg-glass/75 backdrop-blur-sm shadow-md hover:bg-background! h-7.25 w-45 cursor-pointer justify-between rounded border-none p-1.5!"
		role="combobox"
	>
		<div class="truncate">
			{$levelGroupSelected
				? translateVariableLabel($levelGroupSelected.label)
				: ($selectedVariable?.label
						? translateVariableLabel($selectedVariable.label)
						: 'Choisir un domaine…')}
		</div>
		<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
	</Button>

	{#if $levelGroupSelected}
		<Button
			variant="outline"
			class="bg-glass/75 dark:bg-glass/75 backdrop-blur-sm shadow-md hover:bg-background! h-7.25 w-45 cursor-pointer justify-between rounded border-none p-1.5!"
			role="combobox"
		>
			<div class="truncate">{$level + ' ' + $unit || 'Choisir un domaine…'}</div>
			<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
		</Button>
	{/if}
</div>
