<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { ModeWatcher, setMode } from 'mode-watcher';

	import { isSkin, skin } from '$lib/stores/skin';
	import { now } from '$lib/stores/time';

	import { Toaster } from '$lib/components/ui/sonner';

	import { METADATA_REFRESH_INTERVAL, MILLISECONDS_PER_MINUTE } from '$lib/constants';
	import { getInitialMetaData } from '$lib/metadata';

	let { children } = $props();

	let metaDataInterval: ReturnType<typeof setInterval>;
	let updateNowInterval: ReturnType<typeof setTimeout> | undefined;
	onMount(() => {
		// Dark mode forcé : écrase toute préférence claire persistée (mode-watcher@1.1.0
		// n'a pas de prop « forced » ; defaultMode ne s'applique qu'au premier chargement).
		setMode('dark');

		// Prototype : `?skin=retro|modern` applique (et mémorise) l'habillage.
		const skinParam = new URLSearchParams(location.search).get('skin');
		if (isSkin(skinParam)) skin.set(skinParam);

		if (metaDataInterval) clearInterval(metaDataInterval);
		metaDataInterval = setInterval(() => {
			getInitialMetaData();
		}, METADATA_REFRESH_INTERVAL);

		if (updateNowInterval) clearInterval(updateNowInterval);
		updateNowInterval = setInterval(() => {
			$now = new Date();
		}, MILLISECONDS_PER_MINUTE);
	});

	// Habillage : attribut `data-skin` sur <html> (cf. src/skins/retro.css). Indépendant
	// de mode-watcher — `.dark` reste posée (palettes raster `&dark=true` inchangées).
	$effect(() => {
		document.documentElement.dataset.skin = $skin;
	});

	onDestroy(() => {
		if (metaDataInterval) clearInterval(metaDataInterval);
	});
</script>

<Toaster
	closeButton={true}
	richColors={true}
	offset={{ bottom: '85px', right: '10px' }}
	mobileOffset={{ bottom: '85px' }}
/>

{@render children()}
<ModeWatcher defaultMode="dark" track={false} />
