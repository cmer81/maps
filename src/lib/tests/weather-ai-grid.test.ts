import { expect, it } from 'vitest';

import { gridDisplayValue, sampleGrid } from '$lib/weather-ai/grid';

import type { GridProduct } from '$lib/weather-ai/products';

const grid = {
	grid: {
		latitude_count: 3,
		longitude_count: 4,
		latitude_start: -90,
		latitude_step: 90,
		longitude_start: 0,
		longitude_step: 90,
		order: 'latitude-major'
	},
	variable: {
		name: 'mean_sea_level_pressure',
		unit: 'Pa',
		values: [0, 10, 20, 30, 100, 110, 120, 130, 200, 210, 220, 230]
	}
} as GridProduct;
it('respecte le sud au nord, la couture 0/360 et l’interpolation de la grille', () => {
	expect(sampleGrid(grid, 0, -90)).toBe(0);
	expect(sampleGrid(grid, 0, 90)).toBe(200);
	expect(sampleGrid(grid, -90, 0)).toBe(130);
	expect(sampleGrid(grid, 45, 45)).toBe(155);
	expect(sampleGrid(grid, 315, 0)).toBe(115);
	expect(sampleGrid(grid, -45, 0)).toBe(115);
});
it('convertit les Pa en hPa et conserve le signal sans pourcentage', () => {
	expect(gridDisplayValue(grid, 100000)).toBe(1000);
	expect(gridDisplayValue({ ...grid, variable: { ...grid.variable, unit: '1' } }, 0.42)).toBe(0.42);
});
