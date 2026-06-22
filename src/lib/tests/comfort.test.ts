import { describe, expect, it } from 'vitest';

import {
	COMFORT_VARIABLE_KEYS,
	comfortColorScaleOverrides,
	toComfortScale
} from '$lib/color-scales/comfort';

import type { BreakpointColorScale, RGBA } from '@openmeteo/weather-map-layer';

const fakeScale: BreakpointColorScale = {
	type: 'breakpoint',
	unit: '°C',
	breakpoints: [0, 10, 20],
	colors: [
		[0, 0, 255, 1], // froid
		[255, 255, 255, 1],
		[255, 0, 0, 1] // chaud
	]
};

describe('toComfortScale', () => {
	it('miroite les couleurs sans toucher aux breakpoints', () => {
		const comfort = toComfortScale(fakeScale) as BreakpointColorScale;
		const colors = comfort.colors as RGBA[];
		// les seuils numériques (et donc la légende) sont inchangés
		expect(comfort.breakpoints).toEqual([0, 10, 20]);
		// le chaud hérite de la couleur froide et inversement
		expect(colors[0]).toEqual([255, 0, 0, 1]);
		expect(colors[2]).toEqual([0, 0, 255, 1]);
	});

	it('ne mute pas le barème source', () => {
		toComfortScale(fakeScale);
		expect((fakeScale.colors as RGBA[])[0]).toEqual([0, 0, 255, 1]);
	});

	it('miroite aussi un barème rgba', () => {
		const rgba = {
			type: 'rgba' as const,
			unit: '°C',
			min: 0,
			max: 20,
			colors: [
				[0, 0, 255, 1],
				[255, 0, 0, 1]
			] as RGBA[]
		};
		const comfort = toComfortScale(rgba) as typeof rgba;
		expect(comfort.colors[0]).toEqual([255, 0, 0, 1]);
		expect(comfort.min).toBe(0);
		expect(comfort.max).toBe(20);
	});
});

describe('comfortColorScaleOverrides', () => {
	it('ne surcharge que les clés de température présentes dans la base', () => {
		const base = { temperature: fakeScale, precipitation: fakeScale };
		const overrides = comfortColorScaleOverrides(base);
		expect(Object.keys(overrides)).toEqual(['temperature']);
	});

	it('cible les clés température + anomalie', () => {
		expect(COMFORT_VARIABLE_KEYS).toContain('temperature');
		expect(COMFORT_VARIABLE_KEYS).toContain('temperature_2m_anomaly');
	});
});
