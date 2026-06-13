import { describe, expect, it } from 'vitest';

import { computeCaptureRect, computeSourceCrop } from '$lib/capture-geometry';

describe('computeCaptureRect', () => {
	it('écran large → paysage 4:3 borné par la hauteur, centré horizontalement', () => {
		const r = computeCaptureRect(1600, 900);
		expect(r.orientation).toBe('landscape');
		expect(r.w).toBeCloseTo(1200, 5); // 900 * 4/3
		expect(r.h).toBeCloseTo(900, 5);
		expect(r.x).toBeCloseTo(200, 5); // (1600 - 1200) / 2
		expect(r.y).toBeCloseTo(0, 5);
	});

	it('paysage peu large → 4:3 borné par la largeur, centré verticalement', () => {
		const r = computeCaptureRect(1000, 900);
		expect(r.orientation).toBe('landscape');
		expect(r.w).toBeCloseTo(1000, 5);
		expect(r.h).toBeCloseTo(750, 5); // 1000 / (4/3)
		expect(r.x).toBeCloseTo(0, 5);
		expect(r.y).toBeCloseTo(75, 5); // (900 - 750) / 2
	});

	it('écran haut → portrait 3:4 borné par la largeur, centré verticalement', () => {
		const r = computeCaptureRect(400, 800);
		expect(r.orientation).toBe('portrait');
		expect(r.w).toBeCloseTo(400, 5);
		expect(r.h).toBeCloseTo(533.333, 2); // 400 / (3/4)
		expect(r.x).toBeCloseTo(0, 5);
		expect(r.y).toBeCloseTo(133.333, 2); // (800 - 533.33) / 2
	});

	it('viewport carré → paysage borné par la largeur', () => {
		const r = computeCaptureRect(500, 500);
		expect(r.orientation).toBe('landscape');
		expect(r.w).toBeCloseTo(500, 5);
		expect(r.h).toBeCloseTo(375, 5); // 500 / (4/3)
		expect(r.y).toBeCloseTo(62.5, 5);
	});

	it('rectangle toujours centré dans le viewport', () => {
		const r = computeCaptureRect(1280, 720);
		expect(r.x + r.w / 2).toBeCloseTo(640, 5);
		expect(r.y + r.h / 2).toBeCloseTo(360, 5);
	});
});

describe('computeSourceCrop', () => {
	it('dpr=1 → identité (canvas = viewport)', () => {
		const c = computeSourceCrop({ x: 100, y: 50, w: 400, h: 300 }, 1000, 800, 1000, 800);
		expect(c).toEqual({ sx: 100, sy: 50, sw: 400, sh: 300 });
	});

	it('dpr=2 → doublement des coordonnées', () => {
		const c = computeSourceCrop({ x: 100, y: 50, w: 400, h: 300 }, 1000, 800, 2000, 1600);
		expect(c).toEqual({ sx: 200, sy: 100, sw: 800, sh: 600 });
	});

	it('rectangle décalé, échelles X/Y distinctes', () => {
		const c = computeSourceCrop({ x: 10, y: 20, w: 100, h: 200 }, 500, 1000, 1000, 3000);
		// scaleX = 2, scaleY = 3
		expect(c).toEqual({ sx: 20, sy: 60, sw: 200, sh: 600 });
	});

	it('arrondit au pixel entier', () => {
		const c = computeSourceCrop({ x: 10.4, y: 10.6, w: 100.5, h: 100.4 }, 1000, 1000, 1000, 1000);
		expect(c).toEqual({ sx: 10, sy: 11, sw: 101, sh: 100 });
	});
});
