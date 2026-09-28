import { defaultOmProtocolSettings } from '@openmeteo/weather-map-layer';
import { describe, expect, it } from 'vitest';

import { standardColorScales } from '$lib/stores/om-protocol-settings';

import { absoluteVorticityScale } from '$lib/color-scales/absolute-vorticity';
import { geopotentialPv1500Scale } from '$lib/color-scales/geopotential-pv1500';
import { snowfallSumScale } from '$lib/color-scales/snowfall-sum';
import { thetaEScale } from '$lib/color-scales/theta-e';
import { thetaWScale } from '$lib/color-scales/theta-w';
import { thicknessScale } from '$lib/color-scales/thickness';

import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

// Échelles ajoutées pour les variables d'altitude/dérivées du domaine
// arome_france (Infoclimat) : forme valide + unités/bornes attendues.
const scales: [string, BreakpointColorScale][] = [
	['snowfall_sum', snowfallSumScale],
	['theta_e_850hPa', thetaEScale],
	['theta_w_850hPa', thetaWScale],
	['thickness_500_1000hPa', thicknessScale],
	['absolute_vorticity_500hPa', absoluteVorticityScale],
	['geopotential_height_pv1500', geopotentialPv1500Scale]
];

describe('arome_france color scales', () => {
	it.each(scales)('%s has aligned, strictly ascending breakpoints', (_name, scale) => {
		expect(scale.type).toBe('breakpoint');
		const colors = scale.colors as number[][];
		expect(colors.length).toBe(scale.breakpoints.length);
		for (let i = 1; i < scale.breakpoints.length; i++) {
			expect(scale.breakpoints[i]).toBeGreaterThan(scale.breakpoints[i - 1]);
		}
		for (const c of colors) {
			expect(c.length).toBe(4);
			expect(c[3]).toBeGreaterThanOrEqual(0);
			expect(c[3]).toBeLessThanOrEqual(1);
		}
	});

	it('uses the expected display units', () => {
		expect(snowfallSumScale.unit).toBe('cm');
		expect(thetaEScale.unit).toBe('K');
		expect(thetaWScale.unit).toBe('°C');
		expect(thicknessScale.unit).toBe('gpm');
		expect(absoluteVorticityScale.unit).toBe('×10⁻⁵ s⁻¹');
		expect(geopotentialPv1500Scale.unit).toBe('m');
	});

	it('centres thickness on the 5400 gpm rain/snow line', () => {
		expect(thicknessScale.breakpoints).toContain(5400);
	});

	it('covers the observed dynamic tropopause height range (~3700-13800 m)', () => {
		expect(Math.min(...geopotentialPv1500Scale.breakpoints)).toBeLessThanOrEqual(4000);
		expect(Math.max(...geopotentialPv1500Scale.breakpoints)).toBeGreaterThanOrEqual(13800);
	});

	it('registers each scale by exact variable key in standardColorScales', () => {
		for (const [variable, scale] of scales) {
			expect((standardColorScales as Record<string, unknown>)[variable]).toBe(scale);
		}
	});
});

// Cumuls de grésil / neige en équivalent eau (arome_france_hd) : hors périmètre
// de l'alignement Infoclimat (Q2 = B) → toujours l'échelle `precipitation` d'origine
// du package, pas la nouvelle échelle à paliers.
describe('arome_france_hd — cumuls en équivalent eau inchangés', () => {
	it.each(['graupel_sum', 'snow_graupel_sum', 'snowfall_water_equivalent_sum'])('%s', (v) => {
		expect(standardColorScales[v as keyof typeof standardColorScales]).toBe(
			defaultOmProtocolSettings.colorScales.precipitation
		);
		expect(standardColorScales[v as keyof typeof standardColorScales]).not.toEqual(
			standardColorScales.precipitation
		);
	});
});
