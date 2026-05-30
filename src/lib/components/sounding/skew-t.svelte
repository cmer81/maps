<script lang="ts">
	import { mode } from 'mode-watcher';

	import { type SkewTConfig, pressureToY, tempToX } from '$lib/sounding/skewt-coords';
	import { type ColumnProfile, type ParcelResult } from '$lib/sounding/types';

	let { profile, parcel }: { profile: ColumnProfile; parcel: ParcelResult } = $props();

	const W = 320;
	const H = 420;
	const cfg: SkewTConfig = { pTop: 100, pBottom: 1050, tMin: -40, tMax: 40, skew: 0.55 };

	const isobars = [1000, 850, 700, 500, 400, 300, 200, 150, 100];
	const isotherms = [-60, -40, -20, 0, 20, 40];

	const px = (t: number, p: number) => tempToX(t, p, cfg) * W;
	const py = (p: number) => pressureToY(p, cfg) * H;

	const isDark = $derived(mode.current === 'dark');
	const grid = $derived(isDark ? '#334155' : '#cbd5e1');
	const axis = $derived(isDark ? '#64748b' : '#94a3b8');
	const legendText = $derived(isDark ? '#cbd5e1' : '#334155');
	const legendBg = $derived(isDark ? 'rgba(15,23,42,0.82)' : 'rgba(255,255,255,0.82)');

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

	<!-- Légende -->
	<g font-size="10" font-family="ui-monospace, monospace">
		<rect
			x="4"
			y="342"
			width="118"
			height="68"
			rx="3"
			fill={legendBg}
			stroke={grid}
			stroke-width="0.5"
		/>
		<line x1="10" y1="356" x2="26" y2="356" stroke="#ef4444" stroke-width="2" />
		<text x="31" y="359" fill={legendText}>Température</text>
		<line x1="10" y1="372" x2="26" y2="372" stroke="#22c55e" stroke-width="2" />
		<text x="31" y="375" fill={legendText}>Point de rosée</text>
		<line
			x1="10"
			y1="388"
			x2="26"
			y2="388"
			stroke="#f59e0b"
			stroke-width="1.5"
			stroke-dasharray="4 3"
		/>
		<text x="31" y="391" fill={legendText}>Particule</text>
		<text x="10" y="405" fill={axis}>Pression en hPa · T inclinée</text>
	</g>
</svg>
