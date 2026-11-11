<script lang="ts">
	import { modelRun, time } from '$lib/stores/time';
	import { selectedDomain } from '$lib/stores/variables';

	// Cartouche de titre « Rétro 2000 » (PROTOTYPE) : remplace la bande de contexte en
	// skin rétro, façon titre incrusté des cartes de modèles des années 2000.
	// Écran seulement — l'export PNG (png-export.ts, Canvas 2D) ne le reprend pas encore.
	interface Props {
		label: string;
		unit?: string;
		note?: string;
	}
	let { label, unit, note }: Props = $props();

	const MS_PER_HOUR = 3_600_000;

	const runFormat = new Intl.DateTimeFormat('fr-FR', {
		day: '2-digit',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const validFormat = new Intl.DateTimeFormat('fr-FR', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});

	const domainLabel = $derived($selectedDomain?.label ?? '');
	const runLabel = $derived(
		$modelRun
			? `${runFormat.format($modelRun)} ${String($modelRun.getUTCHours()).padStart(2, '0')}Z`
			: ''
	);
	const validLabel = $derived(
		$time ? `${validFormat.format($time)} ${String($time.getUTCHours()).padStart(2, '0')}h UTC` : ''
	);
	const lead = $derived(
		$modelRun && $time ? Math.round(($time.getTime() - $modelRun.getTime()) / MS_PER_HOUR) : null
	);
</script>

<div
	class="flex items-start justify-between gap-4 border-b border-[#7f9db9] bg-[#fff] px-3 py-1 leading-tight text-black"
	style="font-family: Verdana, Tahoma, Geneva, 'DejaVu Sans', sans-serif"
>
	<div class="min-w-0">
		<div class="truncate text-[13px]">Run {domainLabel}</div>
		{#if runLabel}<div class="truncate text-[13px]">{runLabel}</div>{/if}
		<div class="truncate text-[13px] font-bold">
			{label}{#if unit}<span class="font-normal"> ({unit})</span>{/if}{#if note}<span
					class="font-normal text-[#555]"
				>
					· {note}</span
				>{/if}
		</div>
	</div>
	<div class="shrink-0 text-right">
		{#if validLabel}<div class="text-[13px]">Échéance : {validLabel}</div>{/if}
		{#if lead !== null}
			<div class="text-[26px] leading-none font-bold tabular-nums">
				{lead >= 0 ? '+' : '−'}&nbsp;{Math.abs(lead)}H
			</div>
		{/if}
	</div>
</div>
