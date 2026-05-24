import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { domain as d, variable as v } from '$lib/stores/variables';
import { modelRun as mR, time } from '$lib/stores/time';
import { getOMUrlFor, getOMUrl } from '$lib/url';

describe('getOMUrlFor', () => {
	beforeEach(() => {
		d.set('meteofrance_arome_france_hd');
		mR.set(new Date('2026-05-23T00:00:00Z'));
		time.set(new Date('2026-05-23T15:00:00Z'));
		v.set('temperature_2m');
	});

	it('builds URL with the variable passed as argument, not the store value', () => {
		const url = getOMUrlFor('precipitation');
		expect(url).toContain('variable=precipitation');
		expect(url).not.toContain('variable=temperature_2m');
	});

	it('keeps the store-driven getOMUrl() in sync with the store', () => {
		expect(getOMUrl()).toContain('variable=temperature_2m');
	});
});
