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

	const path = $derived(
		profile.levels.map((l, i) => `${i ? 'L' : 'M'}${c + scale(l.u)},${c - scale(l.v)}`).join(' ')
	);
	const rings = [10, 20, 30, 40];
</script>

<svg viewBox="0 0 {S} {S}" class="h-full w-full" role="img" aria-label="Hodographe">
	{#each rings as r (r)}
		<circle cx={c} cy={c} r={scale(r)} fill="none" stroke={grid} stroke-width="0.5" />
	{/each}
	<line x1="0" y1={c} x2={S} y2={c} stroke={grid} stroke-width="0.5" />
	<line x1={c} y1="0" x2={c} y2={S} stroke={grid} stroke-width="0.5" />
	<path d={path} fill="none" stroke="#38bdf8" stroke-width="2" />
</svg>
