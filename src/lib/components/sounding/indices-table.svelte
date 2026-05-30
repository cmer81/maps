<script lang="ts">
	import { type SoundingIndices } from '$lib/sounding/types';

	let { indices }: { indices: SoundingIndices } = $props();
	const r0 = (n: number | null) => (n === null || !Number.isFinite(n) ? '—' : Math.round(n));
</script>

<div class="space-y-2 p-2 text-sm">
	<table class="w-full">
		<thead>
			<tr class="text-left text-xs text-slate-500">
				<th></th><th>Surface</th><th>Plus instable</th>
			</tr>
		</thead>
		<tbody class="font-mono">
			<tr><td>CAPE (J/kg)</td><td>{r0(indices.sb.cape)}</td><td>{r0(indices.mu.cape)}</td></tr>
			<tr><td>CIN (J/kg)</td><td>{r0(indices.sb.cin)}</td><td>{r0(indices.mu.cin)}</td></tr>
			<tr><td>LI (°C)</td><td>{r0(indices.sb.li)}</td><td>{r0(indices.mu.li)}</td></tr>
		</tbody>
	</table>
	<div class="border-t pt-2">
		<div>Iso 0 °C : <b>{r0(indices.lpn.iso0)} m</b></div>
		<div>Iso Tw 1,5 °C : <b>{r0(indices.lpn.isoTw)} m</b></div>
		{#if indices.lpn.isothermal}<div class="text-amber-500">⚠ Isothermie détectée</div>{/if}
	</div>
	<div class="border-t pt-2">
		{#each indices.shear as s (s.label)}
			<div>Cisaillement {s.label} : <b>{r0(s.magnitude)} m/s</b></div>
		{/each}
	</div>
</div>
