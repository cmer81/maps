<script lang="ts">
	import { mode } from 'mode-watcher';

	import { type ColumnProfile } from '$lib/sounding/types';

	let { profile }: { profile: ColumnProfile } = $props();

	const S = 280;
	const c = S / 2;
	const maxWind = 40;
	const scale = (val: number) => (val / maxWind) * (S / 2);

	const isDark = $derived(mode.current === 'dark');
	const grid = $derived(isDark ? '#334155' : '#cbd5e1');
	const legendText = $derived(isDark ? '#cbd5e1' : '#334155');

	const path = $derived(
		profile.levels.map((l, i) => `${i ? 'L' : 'M'}${c + scale(l.u)},${c - scale(l.v)}`).join(' ')
	);
	// Point de surface (premier niveau, le plus bas) pour marquer le départ du tracé.
	const surfacePt = $derived(
		profile.levels.length
			? { x: c + scale(profile.levels[0].u), y: c - scale(profile.levels[0].v) }
			: null
	);
	const rings = [10, 20, 30, 40];
</script>

<svg viewBox="0 0 {S} {S}" class="h-full w-full" role="img" aria-label="Hodographe">
	{#each rings as r (r)}
		<circle cx={c} cy={c} r={scale(r)} fill="none" stroke={grid} stroke-width="0.5" />
		<text x={c + scale(r) + 2} y={c - 3} font-size="8" fill={grid}>{r}</text>
	{/each}
	<line x1="0" y1={c} x2={S} y2={c} stroke={grid} stroke-width="0.5" />
	<line x1={c} y1="0" x2={c} y2={S} stroke={grid} stroke-width="0.5" />
	<path d={path} fill="none" stroke="#38bdf8" stroke-width="2" />
	{#if surfacePt}
		<circle cx={surfacePt.x} cy={surfacePt.y} r="3" fill="#38bdf8" />
		<text x={surfacePt.x + 5} y={surfacePt.y + 3} font-size="9" fill={legendText}>sol</text>
	{/if}
	<text x="6" y="13" font-size="9" font-family="ui-monospace, monospace" fill={legendText}>
		Vent par niveau · cercles = m/s
	</text>
</svg>
