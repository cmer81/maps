import { describe, expect, it } from 'vitest';

import { categoricalLegendEntries, isCategorical } from '$lib/color-scales/legend';
import { precipitationTypeScale } from '$lib/color-scales/precipitation-type';
import { radarReflectivityScale } from '$lib/color-scales/radar-reflectivity';

describe('isCategorical', () => {
	it('detects a categorical scale', () => {
		expect(isCategorical(precipitationTypeScale)).toBe(true);
	});
	it('rejects a plain breakpoint scale', () => {
		expect(isCategorical(radarReflectivityScale)).toBe(false);
	});
});

describe('categoricalLegendEntries', () => {
	it('returns one entry per category, aligned to colors', () => {
		const entries = categoricalLegendEntries(precipitationTypeScale);
		expect(entries.length).toBe(precipitationTypeScale.categories.length);
		expect(entries[0]).toMatchObject({ code: 0, label: 'Aucune', index: 0 });
		const hailIdx = precipitationTypeScale.breakpoints.indexOf(10);
		const hail = entries.find((e) => e.code === 10);
		expect(hail?.label).toBe('Grêle');
		expect(hail?.index).toBe(hailIdx);
		expect(hail?.color).toEqual((precipitationTypeScale.colors as number[][])[hailIdx]);
	});

	it('produces a defined RGBA color for every entry', () => {
		const entries = categoricalLegendEntries(precipitationTypeScale);
		for (const e of entries) {
			expect(Array.isArray(e.color)).toBe(true);
			expect(e.color.length).toBe(4);
		}
	});

	it('throws when colors and categories lengths diverge', () => {
		const broken = {
			...precipitationTypeScale,
			categories: [...precipitationTypeScale.categories, { code: 999, label: 'Oups' }]
		};
		expect(() => categoricalLegendEntries(broken)).toThrow();
	});
});
