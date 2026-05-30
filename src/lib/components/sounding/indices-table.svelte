<script lang="ts">
	import { type SoundingIndices } from '$lib/sounding/types';

	let { indices }: { indices: SoundingIndices } = $props();
	const r0 = (n: number | null) => (n === null || !Number.isFinite(n) ? '—' : Math.round(n));
</script>

<div class="space-y-2 p-2 text-sm">
	<table class="w-full">
		<thead>
			<tr class="text-left text-xs text-slate-500">
				<th></th>
				<th title="Particule de surface (2 m)">Surface (SB)</th>
				<th title="Particule la plus instable (θe max sur la colonne)">Plus instable (MU)</th>
			</tr>
		</thead>
		<tbody class="font-mono">
			<tr title="Convective Available Potential Energy — énergie de flottabilité disponible">
				<td>CAPE (J/kg)</td><td>{r0(indices.sb.cape)}</td><td>{r0(indices.mu.cape)}</td>
			</tr>
			<tr title="Convective INhibition — énergie qui s'oppose à l'ascension (≤ 0)">
				<td>CIN (J/kg)</td><td>{r0(indices.sb.cin)}</td><td>{r0(indices.mu.cin)}</td>
			</tr>
			<tr title="Lifted Index — T environnement − T particule à 500 hPa (négatif = instable)">
				<td>LI (°C)</td><td>{r0(indices.sb.li)}</td><td>{r0(indices.mu.li)}</td>
			</tr>
		</tbody>
	</table>
	<div class="border-t pt-2">
		<div class="mb-1 text-xs font-semibold text-slate-500">Limite pluie / neige</div>
		<div title="Altitude de l'isotherme 0 °C">Iso 0 °C : <b>{r0(indices.lpn.iso0)} m</b></div>
		<div title="Altitude de l'iso-thermomètre-mouillé 1,5 °C (limite pluie/neige opérationnelle)">
			Iso Tw 1,5 °C : <b>{r0(indices.lpn.isoTw)} m</b>
		</div>
		{#if indices.lpn.isothermal}<div class="text-amber-500">⚠ Isothermie détectée</div>{/if}
	</div>
	<div class="border-t pt-2">
		<div class="mb-1 text-xs font-semibold text-slate-500">
			Cisaillement (module du vent sol → altitude)
		</div>
		{#each indices.shear as s (s.label)}
			<div>{s.label} : <b>{r0(s.magnitude)} m/s</b></div>
		{/each}
	</div>
	<p class="border-t pt-2 text-xs text-slate-500">
		SB = particule de surface · MU = la plus instable (θe max). CAPE/CIN en J/kg, cisaillement en
		m/s.
	</p>
</div>
