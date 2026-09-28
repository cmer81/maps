import { getColor } from '@openmeteo/weather-map-layer';
import { describe, expect, it } from 'vitest';

import {
	PRECIPITATION_VARIABLES,
	isPrecipitationVariable,
	precipitationScale
} from '$lib/color-scales/precipitation';

const { breakpoints, colors } = precipitationScale;

describe('precipitationScale (0,5 → 800 mm)', () => {
	it('bornes strictement croissantes, alignées sur les couleurs, de 0 à 800 mm', () => {
		expect(breakpoints).toHaveLength(colors.length);
		expect(breakpoints[0]).toBe(0);
		expect(breakpoints.at(-1)).toBe(800);
		for (let i = 1; i < breakpoints.length; i++)
			expect(breakpoints[i]).toBeGreaterThan(breakpoints[i - 1]);
		expect(precipitationScale.unit).toBe('mm');
	});

	it('paliers attendus', () => {
		expect(breakpoints).toEqual([
			0, 0.5, 1, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 300, 400, 500, 600, 700,
			800
		]);
	});

	it('classe 0 transparente : un cumul nul (H0) ou < 0,5 mm n’est pas teinté', () => {
		expect(getColor(precipitationScale, 0)[3]).toBe(0);
		expect(getColor(precipitationScale, 0.49)[3]).toBe(0);
		expect(getColor(precipitationScale, 0.5)[3]).toBe(1);
	});

	it('chaque palier a sa propre couleur, y compris au-delà de 100 mm', () => {
		const rgb = colors.slice(1).map((c) => c.slice(0, 3).join(','));
		expect(new Set(rgb).size).toBe(rgb.length);
		breakpoints.forEach((b, k) => expect(getColor(precipitationScale, b)).toEqual(colors[k]));
	});

	it('au-delà de 800 mm : couleur du dernier palier', () => {
		expect(getColor(precipitationScale, 1500)).toEqual(colors.at(-1));
	});

	it('variables concernées', () => {
		expect(PRECIPITATION_VARIABLES).toEqual([
			'precipitation',
			'rain',
			'showers',
			'precipitation_sum'
		]);
		for (const v of [
			'snowfall_water_equivalent',
			'graupel_sum',
			'snowfall_sum',
			'precipitation_probability'
		])
			expect(isPrecipitationVariable(v)).toBe(false);
	});
});
