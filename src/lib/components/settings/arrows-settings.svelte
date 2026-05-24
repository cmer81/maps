<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { vectorOptions } from '$lib/stores/vector';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	let arrows = $derived($vectorOptions.arrows);
</script>

<div>
	<h2 class="text-lg font-bold">Flèches</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="arrows"
			class="cursor-pointer"
			bind:checked={$vectorOptions.arrows}
			onCheckedChange={() => {
				updateUrl('arrows', String(arrows));
				changeOMfileURL();
				toast.info('Flèches ' + (arrows ? 'activées' : 'désactivées'));
			}}
		/>
		<Label class="cursor-pointer" for="arrows">Flèches {arrows ? 'activées' : 'désactivées'}</Label>
	</div>
</div>
