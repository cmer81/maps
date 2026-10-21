import { get } from 'svelte/store';

import { getColor, getColorScale } from '@openmeteo/weather-map-layer';
import { describe, expect, it } from 'vitest';

import { omProtocolSettings, standardColorScales } from '$lib/stores/om-protocol-settings';

import { relativeVorticityScale } from '$lib/color-scales/relative-vorticity';
import { surfacePressureScale } from '$lib/color-scales/surface-pressure';

// Variables du domaine ecmwf_ifs_0p1 qui retombaient sur une échelle absurde par la
// résolution par préfixe du package : `relative_vorticity_500hPa` → humidité relative
// (0-95 %, carte vide), `surface_pressure` → température (°C).
// Bornes mesurées sur le run 2026-10-20 12Z, échéance 2026-10-21 12:00 (3600×1801) :
// tourbillon relatif p01/p99 = −17,6 / +18,8 ×10⁻⁵ s⁻¹, pression de surface 465…1060 hPa.
describe('ecmwf_ifs_0p1 — échelles dédiées', () => {
	it('résout le tourbillon relatif sur une échelle ×10⁻⁵ s⁻¹ et non en %', () => {
		const s = getColorScale('relative_vorticity_500hPa', false, standardColorScales);
		expect(s.unit).toBe('×10⁻⁵ s⁻¹');
	});

	it('résout la pression de surface en hPa et non en °C', () => {
		const s = getColorScale('surface_pressure', false, standardColorScales);
		expect(s.unit).toBe('hPa');
	});

	it('tourbillon relatif : échelle divergente symétrique couvrant p01/p99', () => {
		const bp = relativeVorticityScale.breakpoints;
		expect(bp[0]).toBe(-bp[bp.length - 1]);
		expect(bp[0]).toBeLessThanOrEqual(-17.6);
		expect(bp[bp.length - 1]).toBeGreaterThanOrEqual(18.8);
	});

	it('tourbillon relatif : colore les deux signes, transparent autour de zéro', () => {
		const resolved = getColorScale('relative_vorticity_500hPa', false, standardColorScales);
		expect(getColor(resolved, 15)[3]).toBeGreaterThan(0.5);
		expect(getColor(resolved, -15)[3]).toBeGreaterThan(0.5);
		expect(getColor(resolved, 0)[3]).toBe(0);
	});

	it('pression de surface : couvre le relief et le niveau de la mer', () => {
		const bp = surfacePressureScale.breakpoints;
		expect(bp[0]).toBeLessThanOrEqual(500);
		expect(bp[bp.length - 1]).toBeGreaterThanOrEqual(1050);
	});

	it('met le tourbillon relatif à l’échelle ×1e5 à la lecture', () => {
		const data = { values: new Float32Array([1e-4, -5e-5]) };
		const state = {
			dataOptions: { domain: { value: 'ecmwf_ifs_0p1' }, variable: 'relative_vorticity_500hPa' }
		};
		get(omProtocolSettings).postReadCallback?.(null as never, data as never, state as never);
		expect(data.values[0]).toBeCloseTo(10, 4);
		expect(data.values[1]).toBeCloseTo(-5, 4);
	});
});
