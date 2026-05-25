import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	computeFrameIntervalMs,
	estimatePrerenderMs,
	isFailureRateExceeded,
	waitForCommit
} from '$lib/playback-renderer';
import { SLOT_EVENT_COMMIT, SLOT_EVENT_ERROR, slotEvents } from '$lib/slot-events';

describe('computeFrameIntervalMs', () => {
	it('returns 1000/fps for all valid options', () => {
		expect(computeFrameIntervalMs(4)).toBeCloseTo(250);
		expect(computeFrameIntervalMs(6)).toBeCloseTo(166.66, 1);
		expect(computeFrameIntervalMs(10)).toBeCloseTo(100);
		expect(computeFrameIntervalMs(15)).toBeCloseTo(66.66, 1);
	});

	it('throws on non-positive fps', () => {
		expect(() => computeFrameIntervalMs(0)).toThrow();
		expect(() => computeFrameIntervalMs(-1)).toThrow();
	});
});

describe('estimatePrerenderMs', () => {
	it('multiplies frame count by 400ms baseline', () => {
		expect(estimatePrerenderMs(0)).toBe(0);
		expect(estimatePrerenderMs(1)).toBe(400);
		expect(estimatePrerenderMs(120)).toBe(48_000);
	});
});

describe('isFailureRateExceeded', () => {
	it('returns false when no frames attempted', () => {
		expect(isFailureRateExceeded(0, 0, 0.2)).toBe(false);
	});

	it('returns false at 20% exactly (threshold is strict)', () => {
		expect(isFailureRateExceeded(2, 10, 0.2)).toBe(false);
	});

	it('returns true above threshold', () => {
		expect(isFailureRateExceeded(3, 10, 0.2)).toBe(true);
	});

	it('returns true when 100% failures', () => {
		expect(isFailureRateExceeded(5, 5, 0.2)).toBe(true);
	});
});

describe('waitForCommit', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('resolves when commit event fires', async () => {
		const p = waitForCommit(slotEvents, 5_000);
		slotEvents.dispatchEvent(new Event(SLOT_EVENT_COMMIT));
		await expect(p).resolves.toBeUndefined();
	});

	it('rejects when error event fires', async () => {
		const p = waitForCommit(slotEvents, 5_000);
		slotEvents.dispatchEvent(new Event(SLOT_EVENT_ERROR));
		await expect(p).rejects.toThrow(/error/i);
	});

	it('rejects on timeout', async () => {
		const p = waitForCommit(slotEvents, 1_000);
		vi.advanceTimersByTime(1_001);
		await expect(p).rejects.toThrow(/timeout/i);
	});

	it('rejects on abort signal', async () => {
		const controller = new AbortController();
		const p = waitForCommit(slotEvents, 5_000, controller.signal);
		controller.abort();
		await expect(p).rejects.toThrow(/abort/i);
	});

	it('rejects immediately when signal is already aborted at call time', async () => {
		const controller = new AbortController();
		controller.abort();
		const p = waitForCommit(slotEvents, 5_000, controller.signal);
		await expect(p).rejects.toThrow(/abort/i);
	});

	it('does not double-resolve if commit fires after timeout', async () => {
		const p = waitForCommit(slotEvents, 1_000);
		vi.advanceTimersByTime(1_001);
		// Le commit après timeout ne doit pas crash — on dispatch et on attend que p rejette.
		slotEvents.dispatchEvent(new Event(SLOT_EVENT_COMMIT));
		await expect(p).rejects.toThrow(/timeout/i);
	});
});
