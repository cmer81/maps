<script lang="ts">
	import { metaJson, modelRun, time } from '$lib/stores/time';

	import { goToValidTime } from '$lib/time-navigation';

	// Échéancier « Rétro 2000 » (PROTOTYPE, desktop, skin rétro uniquement) : grille de
	// cases +Nh façon pages modèles des années 2000. Vert = pas de temps initial,
	// orange = au-delà du premier changement de pas (ou 2ᵉ moitié de l'horizon si le
	// pas est constant). Case courante : cerclée rouge + gras (pas la couleur seule).
	const MS_PER_HOUR = 3_600_000;

	const steps = $derived.by(() => {
		const run = $modelRun?.getTime();
		const validTimes = $metaJson?.valid_times;
		if (run === undefined || !validTimes) return [];
		return validTimes
			.map((v: string) => new Date(v))
			.filter((d: Date) => d.getTime() >= run)
			.map((date: Date) => ({ date, hours: Math.round((date.getTime() - run) / MS_PER_HOUR) }));
	});

	const longRangeFrom = $derived.by(() => {
		if (steps.length < 3) return Infinity;
		const firstStep = steps[1].hours - steps[0].hours;
		for (let i = 2; i < steps.length; i++) {
			if (steps[i].hours - steps[i - 1].hours > firstStep) return i;
		}
		return Math.ceil(steps.length / 2);
	});

	const current = $derived($time.getTime());

	const dateFormat = new Intl.DateTimeFormat('fr-FR', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'UTC'
	});
</script>

{#if steps.length}
	<div
		class="retro-time-grid mb-5 ml-10 flex items-stretch border border-[#7f9db9] bg-[#fff] text-black"
	>
		<div
			class="flex shrink-0 items-center px-2 text-[11px] font-bold whitespace-nowrap text-[#fff] uppercase"
			style="background-image: var(--retro-title-bg)"
		>
			Échéance »
		</div>
		<div class="flex flex-wrap gap-px p-1" role="group" aria-label="Échéances du run">
			{#each steps as step, i (step.hours)}
				{@const active = step.date.getTime() === current}
				<button
					type="button"
					aria-pressed={active}
					title="+{step.hours} h — {dateFormat.format(step.date)} UTC"
					onclick={() => goToValidTime(step.date)}
					class="h-4 min-w-[26px] cursor-pointer border px-0.5 text-[10px] leading-none tabular-nums hover:brightness-95 {active
						? 'border-[#e00] font-bold outline outline-1 outline-[#e00]'
						: 'border-[#b9b9a8]'}"
					style="background-color: {i >= longRangeFrom ? '#ffd385' : '#9fc663'}"
				>
					{step.hours}h
				</button>
			{/each}
		</div>
	</div>
{/if}
