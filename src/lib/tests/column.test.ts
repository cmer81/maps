// src/lib/tests/column.test.ts
import { describe, expect, it, vi } from 'vitest';

import { assembleColumn } from '$lib/sounding/column';

describe('assembleColumn', () => {
	it('dérive le dewpoint, exclut les NaN, trie du sol vers le sommet', async () => {
		const reader = vi.fn(async (variable: string) => {
			if (variable.includes('150hPa') && variable.startsWith('temperature')) return NaN;
			if (variable.startsWith('temperature')) return 5;
			if (variable.startsWith('relative_humidity')) return 80;
			if (variable.startsWith('geopotential_height')) return 3000;
			return 4; // u / v
		});
		const surface = { temperature: 20, rh: 60, pressure: 1000, height: 100, u: 1, v: 2 };
		const profile = await assembleColumn({
			lat: 45,
			lng: 2,
			validTime: 't',
			levels: [500, 150, 850],
			surface,
			read: reader
		});

		expect(profile.levels.map((l) => l.pressure)).toEqual([850, 500]); // 150 exclu (NaN), trié desc
		expect(profile.levels[0].dewpoint).toBeLessThan(profile.levels[0].temperature);
		expect(profile.surface.dewpoint).toBeCloseTo(12, 0); // 20°C / 60%
	});
});
