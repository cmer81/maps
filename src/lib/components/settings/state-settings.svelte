<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { resetStates, url } from '$lib/stores/preferences';
	import { domain } from '$lib/stores/variables';

	import Button from '$lib/components/ui/button/button.svelte';

	import { changeOMfileURL } from '$lib/layers';
	import { reloadStyles } from '$lib/map-controls';
	import { updateUrl } from '$lib/url';

	const reset = async () => {
		await resetStates();
		for (let [key] of $url.searchParams) {
			$url.searchParams.delete(key);
		}
		reloadStyles();
		$domain = $domain; // reload domainData
		await changeOMfileURL();
		updateUrl();
		toast.info('Tous les réglages réinitialisés');
	};
</script>

<div class="mt-auto justify-self-end">
	<h2 class="text-lg font-bold">Réinitialisation</h2>
	<div class="mt-3">
		<Button class="cursor-pointer" onclick={reset}>Réinitialiser tous les réglages</Button>
	</div>
</div>
