import { getColor, getColorScale } from '@openmeteo/weather-map-layer';

import { cycloneExistenceScale } from '$lib/color-scales/cyclone-existence';

import type { GridProduct } from './products';

/** Bilinear sampling, with cyclic longitude and the API's south-to-north row order. */
export function sampleGrid(p: GridProduct, longitude: number, latitude: number): number {
	const g = p.grid,
		n = g.longitude_count;
	const x = ((((longitude - g.longitude_start) / g.longitude_step) % n) + n) % n;
	const y = Math.max(
		0,
		Math.min(g.latitude_count - 1, (latitude - g.latitude_start) / g.latitude_step)
	);
	const x0 = Math.floor(x),
		y0 = Math.floor(y),
		fx = x - x0,
		fy = y - y0;
	const value = (dx: number, dy: number) =>
		p.variable.values[Math.min(g.latitude_count - 1, y0 + dy) * n + ((x0 + dx) % n)];
	return (
		(value(0, 0) * (1 - fx) + value(1, 0) * fx) * (1 - fy) +
		(value(0, 1) * (1 - fx) + value(1, 1) * fx) * fy
	);
}
export const pressureScale = getColorScale('pressure_msl', false);
export const cycloneSignalScale = cycloneExistenceScale;
export const gridScale = (p: GridProduct) =>
	p.variable.unit === 'Pa' ? pressureScale : cycloneSignalScale;
export const gridDisplayValue = (p: GridProduct, value: number) =>
	p.variable.unit === 'Pa' ? value / 100 : value;
export const MERCATOR_LATITUDE = 85.0511287798066;
/** Reproject the actual grid to Web Mercator before using a MapLibre canvas source. */
export function gridCanvas(p: GridProduct): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = 720;
	canvas.height = 720;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Rendu de la grille indisponible.');
	const img = ctx.createImageData(canvas.width, canvas.height),
		scale = gridScale(p);
	for (let y = 0; y < canvas.height; y++) {
		const lat =
			(Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / canvas.height))) * 180) / Math.PI;
		for (let x = 0; x < canvas.width; x++) {
			const lon = ((x + 0.5) / canvas.width) * 360 - 180;
			const color = getColor(scale, gridDisplayValue(p, sampleGrid(p, lon, lat)), true),
				i = (y * canvas.width + x) * 4;
			img.data[i] = color[0];
			img.data[i + 1] = color[1];
			img.data[i + 2] = color[2];
			img.data[i + 3] = Math.round(color[3] * 255);
		}
	}
	ctx.putImageData(img, 0, 0);
	return canvas;
}
