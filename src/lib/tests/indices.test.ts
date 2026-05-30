// src/lib/tests/indices.test.ts
import { describe, expect, it } from 'vitest';

import { computeIndices } from '$lib/sounding/indices';
import { type ColumnProfile, type LevelDatum } from '$lib/sounding/types';

const levels: LevelDatum[] = [
	{ pressure: 1000, temperature: 25, dewpoint: 20, height: 100, u: 0, v: 5 },
	{ pressure: 850, temperature: 14, dewpoint: 12, height: 1500, u: 5, v: 8 },
	{ pressure: 700, temperature: 5, dewpoint: 0, height: 3100, u: 10, v: 10 },
	{ pressure: 500, temperature: -12, dewpoint: -20, height: 5800, u: 18, v: 12 },
	{ pressure: 300, temperature: -40, dewpoint: -55, height: 9500, u: 30, v: 15 }
];
const profile: ColumnProfile = {
	lat: 45,
	lng: 2,
	validTime: '2026-05-30T12:00',
	surface: levels[0],
	levels
};

describe('indices', () => {
	it('computeIndices avec levels vide retourne un sentinel sans lever', () => {
		const emptyProfile: ColumnProfile = {
			lat: 45,
			lng: 2,
			validTime: '2026-05-30T12:00',
			surface: levels[0],
			levels: []
		};
		const idx = computeIndices(emptyProfile);
		expect(idx.sb.cape).toBe(0);
		expect(idx.sb.cin).toBe(0);
		expect(Number.isNaN(idx.sb.li)).toBe(true);
		expect(idx.mu.cape).toBe(0);
		expect(idx.lpn.iso0).toBeNull();
		expect(idx.lpn.isoTw).toBeNull();
		expect(idx.shear).toHaveLength(0);
	});

	it('profil instable : CAPE SB > 0, CIN <= 0, LI < 0', () => {
		const idx = computeIndices(profile);
		expect(idx.sb.cape).toBeGreaterThan(0);
		expect(idx.sb.cin).toBeLessThanOrEqual(0);
		expect(idx.sb.li).toBeLessThan(0);
	});

	it('CAPE MU >= CAPE SB', () => {
		const idx = computeIndices(profile);
		expect(idx.mu.cape).toBeGreaterThanOrEqual(idx.sb.cape - 1e-6);
	});

	it('cisaillement : 3 couches, modules croissants', () => {
		const idx = computeIndices(profile);
		expect(idx.shear).toHaveLength(3);
		const m = idx.shear.map((s) => s.magnitude);
		expect(m[2]).toBeGreaterThan(m[0]); // 0-6 km > 0-1 km
	});

	it('LPN : iso0 entre les niveaux 700 hPa (3100 m, T=5°C) et 500 hPa (5800 m, T=-12°C)', () => {
		const idx = computeIndices(profile);
		expect(idx.lpn.iso0).not.toBeNull();
		expect(idx.lpn.iso0!).toBeGreaterThan(3100);
		expect(idx.lpn.iso0!).toBeLessThan(5800);
	});
});
