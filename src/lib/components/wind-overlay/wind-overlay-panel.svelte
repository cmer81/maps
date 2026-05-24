<script lang="ts">
	import { vectorOptions, windOverlayEnabled, windOverlayLevel } from '$lib/stores/vector';

	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	function onToggle(e: Event) {
		const checked = (e.target as HTMLInputElement).checked;
		windOverlayEnabled.set(checked);
		// Activer automatiquement les flèches pour voir l'overlay
		if (checked) {
			vectorOptions.update((v) => ({ ...v, arrows: true }));
		}
		updateUrl('wind_overlay', String(checked));
		changeOMfileURL();
	}

	function onLevel(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		windOverlayLevel.set(val);
		updateUrl('wind_overlay_level', val);
		changeOMfileURL();
	}
</script>

<div class="space-y-2 p-2">
	<label class="flex items-center gap-2">
		<input type="checkbox" checked={$windOverlayEnabled} onchange={onToggle} />
		<span class="text-sm">Overlay vent</span>
	</label>
	{#if $windOverlayEnabled}
		<select
			class="w-full rounded border px-2 py-1 text-sm"
			value={$windOverlayLevel}
			onchange={onLevel}
		>
			<option value="10m">10 m (surface)</option>
			<option value="100m">100 m</option>
			<option value="925hPa">925 hPa</option>
			<option value="850hPa">850 hPa</option>
			<option value="700hPa">700 hPa</option>
			<option value="500hPa">500 hPa</option>
			<option value="300hPa">300 hPa (jet)</option>
		</select>
	{/if}
</div>
