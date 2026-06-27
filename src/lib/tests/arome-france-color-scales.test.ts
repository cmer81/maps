import { describe, expect, it } from 'vitest';

import { standardColorScales } from '$lib/stores/om-protocol-settings';

import { absoluteVorticityScale } from '$lib/color-scales/absolute-vorticity';
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
	['absolute_vorticity_500hPa', absoluteVorticityScale]
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
	});

	it('centres thickness on the 5400 gpm rain/snow line', () => {
		expect(thicknessScale.breakpoints).toContain(5400);
	});

	it('registers each scale by exact variable key in standardColorScales', () => {
		for (const [variable, scale] of scales) {
			expect((standardColorScales as Record<string, unknown>)[variable]).toBe(scale);
		}
	});
});
