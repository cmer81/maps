import { getColor } from '@openmeteo/weather-map-layer';
import { describe, expect, it } from 'vitest';

import { brightnessTemperatureScale } from '$lib/color-scales/brightness-temperature';
import { brightnessTemperatureWvScale } from '$lib/color-scales/brightness-temperature-wv';
import { capeScale } from '$lib/color-scales/cape';
import { convectiveInhibitionScale } from '$lib/color-scales/convective-inhibition';
import { lightningDensityScale } from '$lib/color-scales/lightning-density';
import { precipitationTypeScale } from '$lib/color-scales/precipitation-type';
import { radarReflectivityScale } from '$lib/color-scales/radar-reflectivity';
import { visibilityScale } from '$lib/color-scales/visibility';

import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

const continuous: [string, BreakpointColorScale][] = [
	['radar', radarReflectivityScale],
	['brightness', brightnessTemperatureScale],
	['brightness_wv', brightnessTemperatureWvScale],
	['cape', capeScale],
	['cin', convectiveInhibitionScale],
	['visibility', visibilityScale],
	['lightning', lightningDensityScale]
];

describe('continuous convection color scales', () => {
	it.each(continuous)('%s has aligned, ascending breakpoints', (_name, scale) => {
		expect(scale.type).toBe('breakpoint');
		const colors = scale.colors as number[][];
		expect(Array.isArray(colors)).toBe(true);
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

	it('radar reflectivity is transparent below the first threshold', () => {
		expect(radarReflectivityScale.breakpoints[0]).toBe(0);
		expect((radarReflectivityScale.colors as number[][])[0][3]).toBe(0);
	});

	it('cape and lightning are transparent at zero', () => {
		expect((capeScale.colors as number[][])[0][3]).toBe(0);
		expect((lightningDensityScale.colors as number[][])[0][3]).toBe(0);
	});
});

describe('precipitation_type categorical scale', () => {
	const scale = precipitationTypeScale;
	const colors = scale.colors as number[][];

	it('aligns breakpoints, colors and categories index-by-index', () => {
		expect(colors.length).toBe(scale.breakpoints.length);
		expect(scale.categories.length).toBe(scale.breakpoints.length);
		for (let i = 0; i < scale.breakpoints.length; i++) {
			expect(scale.categories[i].code).toBe(scale.breakpoints[i]);
		}
	});

	it('has ascending breakpoints covering every producer code', () => {
		const codes = [0, 1, 3, 5, 6, 7, 8, 10, 11, 12, 193, 201, 205, 206, 207];
		expect(scale.breakpoints).toEqual(codes);
		for (let i = 1; i < scale.breakpoints.length; i++) {
			expect(scale.breakpoints[i]).toBeGreaterThan(scale.breakpoints[i - 1]);
		}
	});

	it('renders code 0 (aucune) transparent', () => {
		expect(getColor(scale, 0)[3]).toBe(0);
	});

	it('maps each exact code to its own color via findLastIndexLE bucketing', () => {
		const idxHail = scale.breakpoints.indexOf(10);
		const idxSleet = scale.breakpoints.indexOf(193);
		expect(getColor(scale, 10)).toEqual(colors[idxHail]);
		expect(getColor(scale, 193)).toEqual(colors[idxSleet]);
		expect(getColor(scale, 1)).toEqual(colors[scale.breakpoints.indexOf(1)]);
	});

	it('maps a non-existent intermediate integer to the nearest lower code color', () => {
		expect(getColor(scale, 50)).toEqual(colors[scale.breakpoints.indexOf(12)]);
	});
});
