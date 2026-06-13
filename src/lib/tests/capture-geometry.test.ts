import { describe, expect, it } from 'vitest';

import { computeCaptureRect } from '$lib/capture-geometry';

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
