import { describe, expect, it } from 'vitest';

import { anomalyPhase, fmtDateYMD } from '$lib/url';

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
});
