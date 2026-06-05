<script lang="ts">
	import { toast } from 'svelte-sonner';

	import {
		type DistanceUnit,
		type PrecipitationUnit,
		type TemperatureUnit,
		type WindSpeedUnit,
		distanceUnit,
		precipitationUnit,
		temperatureUnit,
		windSpeedUnit
	} from '$lib/stores/units';

	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';

	import { refreshPopup } from '$lib/popup';

	const temperatureOptions: { value: TemperatureUnit; label: string }[] = [
		{ value: '°C', label: 'Celsius (°C)' },
		{ value: '°F', label: 'Fahrenheit (°F)' }
	];

	const precipitationOptions: { value: PrecipitationUnit; label: string }[] = [
		{ value: 'mm', label: 'Millimètre (mm)' },
		{ value: 'inch', label: 'Pouce (in)' }
	];

	const windSpeedOptions: { value: WindSpeedUnit; label: string }[] = [
		{ value: 'm/s', label: 'Mètre/s (m/s)' },
		{ value: 'km/h', label: 'Kilomètre/h (km/h)' },
		{ value: 'mph', label: 'Miles/h (mph)' },
		{ value: 'knots', label: 'Nœuds (kn)' }
	];

	export const distanceOptions: { value: DistanceUnit; label: string }[] = [
		{ value: 'm', label: 'Mètres (m)' },
		{ value: 'ft', label: 'Pieds (ft)' }
	];

	function getLabel<T extends string>(options: { value: T; label: string }[], value: T): string {
		return options.find((o) => o.value === value)?.label ?? value;
	}
</script>

<div>
	<h2 class="text-lg font-bold">Unités</h2>
	<div class="mt-3 flex flex-col gap-3">
		<div class="flex items-center gap-3">
			<Label class="w-28 shrink-0">Température</Label>
			<Select.Root
				type="single"
				value={$temperatureUnit}
				onValueChange={(v) => {
					if (v) {
						temperatureUnit.set(v as TemperatureUnit);
						refreshPopup();
						toast.info(`Unité de température : ${v}`);
					}
				}}
			>
				<Select.Trigger
					class="h-8 min-w-0 flex-1 cursor-pointer bg-background/60 text-sm"
					aria-label="Unité de température"
				>
					<span class="truncate">{getLabel(temperatureOptions, $temperatureUnit)}</span>
				</Select.Trigger>
				<Select.Content class="z-110 border-none bg-glass/65 backdrop-blur-sm">
					{#each temperatureOptions as { value, label } (value)}
						<Select.Item {value} {label} class="cursor-pointer text-sm" />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<!-- Distance selector -->
		<div class="flex items-center gap-3">
			<Label class="w-28 shrink-0">Distance</Label>
			<Select.Root
				type="single"
				value={$distanceUnit}
				onValueChange={(v) => {
					if (v) {
						distanceUnit.set(v as DistanceUnit);
						refreshPopup();
						toast.info(`Unité de distance : ${v}`);
					}
				}}
			>
				<Select.Trigger
					class="h-8 min-w-0 flex-1 cursor-pointer bg-background/60 text-sm"
					aria-label="Unité de distance"
				>
					<span class="truncate">{getLabel(distanceOptions, $distanceUnit)}</span>
				</Select.Trigger>
				<Select.Content class="z-110 border-none bg-glass/65 backdrop-blur-sm">
					{#each distanceOptions as { value, label } (value)}
						<Select.Item {value} {label} class="cursor-pointer text-sm" />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<div class="flex items-center gap-3">
			<Label class="w-28 shrink-0">Précipitations</Label>
			<Select.Root
				type="single"
				value={$precipitationUnit}
				onValueChange={(v) => {
					if (v) {
						precipitationUnit.set(v as PrecipitationUnit);
						refreshPopup();
						toast.info(`Unité de précipitations : ${v}`);
					}
				}}
			>
				<Select.Trigger
					class="h-8 min-w-0 flex-1 cursor-pointer bg-background/60 text-sm"
					aria-label="Unité de précipitations"
				>
					<span class="truncate">{getLabel(precipitationOptions, $precipitationUnit)}</span>
				</Select.Trigger>
				<Select.Content class="z-110 border-none bg-glass/65 backdrop-blur-sm">
					{#each precipitationOptions as { value, label } (value)}
						<Select.Item {value} {label} class="cursor-pointer text-sm" />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<div class="flex items-center gap-3">
			<Label class="w-28 shrink-0">Vitesse du vent</Label>
			<Select.Root
				type="single"
				value={$windSpeedUnit}
				onValueChange={(v) => {
					if (v) {
						windSpeedUnit.set(v as WindSpeedUnit);
						refreshPopup();
						toast.info(`Unité de vitesse du vent : ${v}`);
					}
				}}
			>
				<Select.Trigger
					class="h-8 min-w-0 flex-1 cursor-pointer bg-background/60 text-sm"
					aria-label="Unité de vitesse du vent"
				>
					<span class="truncate">{getLabel(windSpeedOptions, $windSpeedUnit)}</span>
				</Select.Trigger>
				<Select.Content class="z-110 border-none bg-glass/65 backdrop-blur-sm">
					{#each windSpeedOptions as { value, label } (value)}
						<Select.Item {value} {label} class="cursor-pointer text-sm" />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>
</div>
