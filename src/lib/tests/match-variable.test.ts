import { get } from 'svelte/store';

import { beforeEach, describe, expect, it } from 'vitest';

import { metaJson as mJ } from '$lib/stores/time';
import { domain as d, variable as v } from '$lib/stores/variables';

import { matchVariableOrFirst } from '$lib/metadata';

const meta = (variables: string[]) => ({
	completed: true,
	last_modified_time: '',
	reference_time: '2026-06-01T00:00:00Z',
	valid_times: ['2026-06-01T01:00'],
	variables
});

describe('matchVariableOrFirst', () => {
	beforeEach(() => {
		d.set('arome_france_convection');
	});

	it('picks the domain default variable when the current one is absent', () => {
		v.set('temperature_2m');
		mJ.set(meta(['cape', 'radar_reflectivity', 'visibility']));
		matchVariableOrFirst();
		expect(get(v)).toBe('radar_reflectivity');
	});

	it('keeps a valid shared-URL variable that exists in the domain', () => {
		v.set('cape');
		mJ.set(meta(['cape', 'radar_reflectivity']));
		matchVariableOrFirst();
		expect(get(v)).toBe('cape');
	});

	it('falls back to the first variable when no domain default applies', () => {
		d.set('meteofrance_arome_france0025');
		v.set('not_a_real_variable');
		mJ.set(meta(['precipitation', 'cloud_cover']));
		matchVariableOrFirst();
		expect(get(v)).toBe('precipitation');
	});

	it('falls back to variables[0] when the domain default is not published in meta', () => {
		// domaine = arome_france_convection (a un défaut radar_reflectivity) MAIS le meta
		// ne le publie pas (ex. variable absente d'une échéance) → fallback variables[0].
		v.set('temperature_2m');
		mJ.set(meta(['cape', 'visibility']));
		matchVariableOrFirst();
		expect(get(v)).toBe('cape');
	});
});
