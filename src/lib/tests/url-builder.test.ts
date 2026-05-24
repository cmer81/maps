import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { modelRun as mR, time } from '$lib/stores/time';
import { domain as d, variable as v } from '$lib/stores/variables';

import { getOMUrl, getOMUrlFor, resolveCumulModelRun } from '$lib/url';

describe('getOMUrlFor', () => {
	beforeEach(() => {
		// The cumul branch of getOMUrlFor is gated on both env vars; tests pin
		// them so they're independent of the dev machine's .env.local.
		vi.stubEnv('VITE_OM_WORKER_URL', 'http://localhost:8080');
		vi.stubEnv('VITE_CUMUL_ENABLED', 'true');
		d.set('meteofrance_arome_france_hd');
		mR.set(new Date('2026-05-23T00:00:00Z'));
		time.set(new Date('2026-05-23T15:00:00Z'));
		v.set('temperature_2m');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('builds URL with the variable passed as argument, not the store value', () => {
		const url = getOMUrlFor('precipitation');
		expect(url).toContain('variable=precipitation');
		expect(url).not.toContain('variable=temperature_2m');
	});

	it('keeps the store-driven getOMUrl() in sync with the store', () => {
		expect(getOMUrl()).toContain('variable=temperature_2m');
	});

	it('snaps the run path to 00Z of the window-start day when a cumul window predates the user run', () => {
		// User picked the 15Z run, then asks for a 24h cumul ending at 22:00 of
		// the same day — window starts at 23:00 of the previous day, which is
		// before the 15Z run. The URL must rewrite the run segment to 00Z of
		// the previous day so the worker accepts it.
		mR.set(new Date('2026-05-24T15:00:00Z'));
		time.set(new Date('2026-05-24T22:00:00Z'));
		const url = getOMUrlFor('precipitation_sum_24h');
		expect(url).toContain('/2026/05/23/0000Z/');
		expect(url).not.toContain('/2026/05/24/1500Z/');
	});

	it('keeps the user-selected run for cumul variables when the window fits inside it', () => {
		mR.set(new Date('2026-05-23T00:00:00Z'));
		time.set(new Date('2026-05-23T23:00:00Z'));
		const url = getOMUrlFor('precipitation_sum_24h');
		expect(url).toContain('/2026/05/23/0000Z/');
	});
});

describe('resolveCumulModelRun', () => {
	it('returns the original run when the window fits entirely after it', () => {
		const run = new Date('2026-05-23T00:00:00Z');
		const t = new Date('2026-05-23T23:00:00Z');
		expect(resolveCumulModelRun(run, t, 24)).toEqual(run);
	});

	it('returns the original run when the window starts exactly at the run', () => {
		const run = new Date('2026-05-23T00:00:00Z');
		const t = new Date('2026-05-23T23:00:00Z'); // start = 00:00 = run
		expect(resolveCumulModelRun(run, t, 24)).toEqual(run);
	});

	it('snaps to 00Z of the window-start day when the run is later than the window start', () => {
		const run = new Date('2026-05-24T15:00:00Z');
		const t = new Date('2026-05-24T22:00:00Z'); // start = 2026-05-23T23:00Z
		expect(resolveCumulModelRun(run, t, 24)).toEqual(new Date('2026-05-23T00:00:00Z'));
	});

	it('snaps within the same UTC day when the window stays inside it', () => {
		const run = new Date('2026-05-24T15:00:00Z');
		const t = new Date('2026-05-24T14:00:00Z'); // 3h cumul → start = 12:00Z same day
		expect(resolveCumulModelRun(run, t, 3)).toEqual(new Date('2026-05-24T00:00:00Z'));
	});
});
