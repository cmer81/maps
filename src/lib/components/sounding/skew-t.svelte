<script lang="ts">
	import { mode } from 'mode-watcher';

	import { type SkewTConfig, pressureToY, tempToX } from '$lib/sounding/skewt-coords';
	import { type ColumnProfile, type ParcelResult } from '$lib/sounding/types';

	let { profile, parcel }: { profile: ColumnProfile; parcel: ParcelResult } = $props();

	const W = 320;
	const H = 420;
	const cfg: SkewTConfig = { pTop: 100, pBottom: 1050, tMin: -90, tMax: 40, skew: 0.9 };

	const isobars = [1000, 850, 700, 500, 400, 300, 200, 150, 100];
	const isotherms = [-80, -60, -40, -20, 0, 20, 40];

	const px = (t: number, p: number) => tempToX(t, p, cfg) * W;
	const py = (p: number) => pressureToY(p, cfg) * H;

	const isDark = $derived(mode.current === 'dark');
	const grid = $derived(isDark ? '#334155' : '#cbd5e1');
	const axis = $derived(isDark ? '#64748b' : '#94a3b8');

	const tempPath = $derived(
		profile.levels
			.map((l, i) => `${i ? 'L' : 'M'}${px(l.temperature, l.pressure)},${py(l.pressure)}`)
			.join(' ')
	);
	const dewPath = $derived(
		profile.levels
			.map((l, i) => `${i ? 'L' : 'M'}${px(l.dewpoint, l.pressure)},${py(l.pressure)}`)
			.join(' ')
	);
	const parcelPath = $derived(
		profile.levels
			.map((l, i) => `${i ? 'L' : 'M'}${px(parcel.temperature[i], l.pressure)},${py(l.pressure)}`)
			.join(' ')
	);
</script>

<svg viewBox="0 0 {W} {H}" class="h-full w-full" role="img" aria-label="Diagramme Skew-T">
	{#each isobars as p (p)}
		<line x1="0" y1={py(p)} x2={W} y2={py(p)} stroke={grid} stroke-width="0.5" />
		<text x="2" y={py(p) - 2} fill={axis} font-size="9">{p}</text>
	{/each}
	{#each isotherms as t (t)}
		<line
			x1={px(t, cfg.pBottom)}
			y1={H}
			x2={px(t, cfg.pTop)}
			y2="0"
			stroke={grid}
			stroke-width="0.4"
		/>
	{/each}
	<path d={dewPath} fill="none" stroke="#22c55e" stroke-width="2" />
	<path d={tempPath} fill="none" stroke="#ef4444" stroke-width="2" />
	<path d={parcelPath} fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3" />
</svg>
