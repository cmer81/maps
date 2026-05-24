<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { defaultVectorOptions, vectorOptions } from '$lib/stores/vector';

	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	let contours = $derived($vectorOptions.contours);
	let breakpoints = $derived($vectorOptions.breakpoints);

	const handleContourIntervalChange = () => {
		updateUrl(
			'contour_interval',
			String($vectorOptions.contourInterval),
			String(defaultVectorOptions.contourInterval) // different urlParam and key
		);
		if (contours) {
			changeOMfileURL();
		}
	};
</script>

<div>
	<h2 class="text-lg font-bold">Isocontours</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="contouring"
			class="cursor-pointer"
			bind:checked={$vectorOptions.contours}
			onCheckedChange={() => {
				updateUrl('contours', String(contours));

				changeOMfileURL();
				toast.info('Isocontours ' + (contours ? 'activés' : 'désactivés'));
			}}
		/>
		<Label class="cursor-pointer" for="contouring"
			>Isocontours {contours ? 'activés' : 'désactivés'}</Label
		>
	</div>
	<div class="mt-3 flex gap-3">
		<Switch
			id="breakpoints"
			class="cursor-pointer"
			bind:checked={$vectorOptions.breakpoints}
			onCheckedChange={() => {
				updateUrl(
					'interval_on_breakpoints',
					String(breakpoints),
					String(defaultVectorOptions.breakpoints) // key is different
				);

				if (contours) {
					changeOMfileURL();
					toast.info("Intervalle sur paliers d'échelle " + (breakpoints ? 'activé' : 'désactivé'));
				}
			}}
		/>
		<Label class="cursor-pointer" for="contouring"
			>Intervalle sur paliers {breakpoints ? 'activé' : 'désactivé'}</Label
		>
	</div>
	<div class="mt-3 flex gap-3 duration-300 {breakpoints ? 'opacity-50' : ''}">
		<input
			disabled={breakpoints}
			id="interval_slider"
			class="w-25 delay-75 duration-200"
			type="range"
			min="0"
			max="50"
			bind:value={$vectorOptions.contourInterval}
			onchange={handleContourIntervalChange}
		/>
		<Label for="interval">Intervalle des isolignes :</Label>
		<Input
			id="interval"
			class="w-20 bg-background/60"
			step="0.5"
			bind:value={$vectorOptions.contourInterval}
			onchange={handleContourIntervalChange}
		/>
	</div>
</div>
