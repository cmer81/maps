import { describe, expect, it } from 'vitest';

import {
	computeNeighborWindow,
	isPrefetchableDomain,
	neighborTimesToDecode
} from '$lib/neighbor-prefetch';

// 6 pas horaires : 00:00 … 05:00
const VALID_TIMES = [
	new Date('2026-06-06T00:00:00Z'),
	new Date('2026-06-06T01:00:00Z'),
	new Date('2026-06-06T02:00:00Z'),
	new Date('2026-06-06T03:00:00Z'),
	new Date('2026-06-06T04:00:00Z'),
	new Date('2026-06-06T05:00:00Z')
];

const CFG = { forward: 3, backward: 1 };

describe('computeNeighborWindow', () => {
	it("avancée d'un pas → 1 derrière, 3 devant", () => {
		// current = 02:00 (idx 2), previous = 01:00 (idx 1) → delta = +1
		const w = computeNeighborWindow(VALID_TIMES[2], VALID_TIMES[1], VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[1]); // idx 2 - 1
		expect(w?.endDate).toEqual(VALID_TIMES[5]); // idx 2 + 3
	});

	it("recul d'un pas → 3 derrière, 1 devant", () => {
		// current = 03:00 (idx 3), previous = 04:00 (idx 4) → delta = -1
		const w = computeNeighborWindow(VALID_TIMES[3], VALID_TIMES[4], VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[0]); // idx 3 - 3
		expect(w?.endDate).toEqual(VALID_TIMES[4]); // idx 3 + 1
	});

	it('saut (|delta| > 1) → fenêtre symétrique ±1', () => {
		// current = 03:00 (idx 3), previous = 00:00 (idx 0) → delta = +3
		const w = computeNeighborWindow(VALID_TIMES[3], VALID_TIMES[0], VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[2]);
		expect(w?.endDate).toEqual(VALID_TIMES[4]);
	});

	it('premier chargement (previousTime null) → fenêtre symétrique ±1', () => {
		const w = computeNeighborWindow(VALID_TIMES[2], null, VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[1]);
		expect(w?.endDate).toEqual(VALID_TIMES[3]);
	});

	it('previousTime hors validTimes → traité comme premier chargement (±1)', () => {
		const stale = new Date('1970-01-01T00:00:00Z');
		const w = computeNeighborWindow(VALID_TIMES[2], stale, VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[1]);
		expect(w?.endDate).toEqual(VALID_TIMES[3]);
	});

	it('borne début de run → clamp au premier valid_time', () => {
		// current = 00:00 (idx 0), recul → voudrait idx -3, clamp à 0
		const w = computeNeighborWindow(VALID_TIMES[0], VALID_TIMES[1], VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[0]);
		expect(w?.endDate).toEqual(VALID_TIMES[1]); // idx 0 + 1
	});

	it('borne fin de run → clamp au dernier valid_time', () => {
		// current = 05:00 (idx 5), avancée → voudrait idx 8, clamp à 5
		const w = computeNeighborWindow(VALID_TIMES[5], VALID_TIMES[4], VALID_TIMES, CFG);
		expect(w?.startDate).toEqual(VALID_TIMES[4]); // idx 5 - 1
		expect(w?.endDate).toEqual(VALID_TIMES[5]);
	});

	it('validTimes vide → null', () => {
		expect(computeNeighborWindow(VALID_TIMES[0], null, [], CFG)).toBeNull();
	});

	it('currentTime introuvable → null', () => {
		const unknown = new Date('2026-06-06T09:00:00Z');
		expect(computeNeighborWindow(unknown, null, VALID_TIMES, CFG)).toBeNull();
	});
});

describe('neighborTimesToDecode', () => {
	it('liste les échéances de la fenêtre, courante exclue, plus proche en premier', () => {
		// fenêtre [idx1 … idx5], courante = idx2 → décoder 1,3,4,5 (jamais 2)
		// tri par distance à idx2 ; à distance égale, l'avant (idx supérieur) d'abord
		const w = { startDate: VALID_TIMES[1], endDate: VALID_TIMES[5] };
		const got = neighborTimesToDecode(w, VALID_TIMES, VALID_TIMES[2]);
		expect(got).toEqual([VALID_TIMES[3], VALID_TIMES[1], VALID_TIMES[4], VALID_TIMES[5]]);
	});

	it('exclut toujours la courante (fenêtre réduite à un seul pas)', () => {
		const w = { startDate: VALID_TIMES[2], endDate: VALID_TIMES[2] };
		expect(neighborTimesToDecode(w, VALID_TIMES, VALID_TIMES[2])).toEqual([]);
	});
});

describe('isPrefetchableDomain', () => {
	it('exclut le pseudo-domaine anomalie', () => {
		expect(isPrefetchableDomain('anomaly_europe')).toBe(false);
	});

	it('autorise les domaines standard et bucket arome', () => {
		expect(isPrefetchableDomain('meteofrance_arome_france0025')).toBe(true);
		expect(isPrefetchableDomain('arome_france')).toBe(true);
	});
});
