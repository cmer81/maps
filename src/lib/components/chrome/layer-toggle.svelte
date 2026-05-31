<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';

	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		checked: boolean;
		onCheckedChange: (v: boolean) => void;
		icon?: Snippet;
	}
	let { label, checked, onCheckedChange, icon }: Props = $props();
</script>

<label
	class="flex min-h-11 md:min-h-0 cursor-pointer items-center justify-between gap-3 py-2 md:py-1.5"
>
	<span class="flex items-center gap-2 text-sm">
		{@render icon?.()}
		{label}
	</span>
	<Switch {checked} {onCheckedChange} aria-label={label} />
</label>
