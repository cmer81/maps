<script lang="ts">
	import { variable2, layer2Enabled } from '$lib/stores/variables';
	import { opacity2 } from '$lib/stores/preferences';
	import { changeOMfileURL } from '$lib/layers';
	import { currentOmUrl, currentOmUrl2 } from '$lib/stores/om-url';
	import { updateUrl } from '$lib/url';

	function onToggle(e: Event) {
		const checked = (e.target as HTMLInputElement).checked;
		layer2Enabled.set(checked);
		updateUrl('layer2', String(checked));
		changeOMfileURL();
	}

	function onVariable(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		variable2.set(val);
		updateUrl('variable2', val);
		changeOMfileURL();
	}

	function onOpacity(e: Event) {
		const val = Number((e.target as HTMLInputElement).value);
		opacity2.set(val);
		updateUrl('opacity2', String(val));
		// commitOpacity is captured at SlotManager construction; force a refresh
		// so the new value is picked up on the next slot rotation.
		currentOmUrl.set('');
		currentOmUrl2.set('');
		changeOMfileURL();
	}
</script>

<div class="space-y-2 p-2">
	<label class="flex items-center gap-2">
		<input type="checkbox" checked={$layer2Enabled} onchange={onToggle} />
		<span class="text-sm">Couche secondaire</span>
	</label>
	{#if $layer2Enabled}
		<select
			class="w-full rounded border px-2 py-1 text-sm"
			value={$variable2}
			onchange={onVariable}
		>
			<option value="precipitation">Précipitations</option>
			<option value="cloud_cover_low">Nébulosité basse</option>
			<option value="cloud_cover_mid">Nébulosité moyenne</option>
			<option value="cloud_cover_high">Nébulosité haute</option>
			<option value="temperature_2m">Température 2 m</option>
			<option value="pressure_msl">Pression MSL</option>
		</select>
		<label class="block">
			<span class="text-xs">Opacité {$opacity2}%</span>
			<input
				type="range"
				min="0"
				max="100"
				value={$opacity2}
				oninput={onOpacity}
				class="w-full"
			/>
		</label>
	{/if}
</div>
