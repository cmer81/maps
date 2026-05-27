import { describe, expect, it } from 'vitest';

import { anomalyPhase, fmtDateYMD, provisionalDateSet } from '$lib/url';

describe('fmtDateYMD', () => {
	it('formats a UTC date as YYYY-MM-DD', () => {
		expect(fmtDateYMD(new Date('2026-05-21T15:00:00Z'))).toBe('2026-05-21');
	});
});

describe('anomalyPhase', () => {
	const today = new Date('2026-05-26T00:00:00Z');

	it('past date is observed', () => {
		expect(anomalyPhase(new Date('2026-05-25T23:00:00Z'), today)).toBe('observed');
	});

	it('today is forecast', () => {
		expect(anomalyPhase(new Date('2026-05-26T00:00:00Z'), today)).toBe('forecast');
	});

	it('future date is forecast', () => {
		expect(anomalyPhase(new Date('2026-05-28T12:00:00Z'), today)).toBe('forecast');
	});

	it('past date in provisional set is provisional', () => {
		const prov = new Set(['2026-05-24']);
		expect(anomalyPhase(new Date('2026-05-24T10:00:00Z'), today, prov)).toBe('provisional');
	});

	it('past date NOT in provisional set is observed', () => {
		const prov = new Set(['2026-05-24']);
		expect(anomalyPhase(new Date('2026-05-23T10:00:00Z'), today, prov)).toBe('observed');
	});
});

describe('provisionalDateSet', () => {
	it('extracts YYYY-MM-DD from provisional_times', () => {
		const meta = { provisional_times: ['2026-05-23T00:00:00Z', '2026-05-24T00:00:00Z'] };
		const set = provisionalDateSet(meta);
		expect(set.has('2026-05-23')).toBe(true);
		expect(set.has('2026-05-24')).toBe(true);
		expect(set.has('2026-05-25')).toBe(false);
	});

	it('returns empty set when field is absent', () => {
		expect(provisionalDateSet({}).size).toBe(0);
		expect(provisionalDateSet(undefined).size).toBe(0);
	});
});
