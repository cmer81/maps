import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitForCommit } from '$lib/playback-renderer';
import { SLOT_EVENT_COMMIT, SLOT_EVENT_ERROR } from '$lib/slot-events';

describe('waitForCommit', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('résout au premier événement commit', async () => {
		const events = new EventTarget();
		const p = waitForCommit(events, 1000);
		events.dispatchEvent(new Event(SLOT_EVENT_COMMIT));
		await expect(p).resolves.toBeUndefined();
	});

	it('rejette sur événement error', async () => {
		const events = new EventTarget();
		const p = waitForCommit(events, 1000);
		events.dispatchEvent(new Event(SLOT_EVENT_ERROR));
		await expect(p).rejects.toThrow(/slot error/i);
	});

	it('rejette sur timeout', async () => {
		const events = new EventTarget();
		const p = waitForCommit(events, 1000);
		const assertion = expect(p).rejects.toThrow(/timeout/i);
		await vi.advanceTimersByTimeAsync(1001);
		await assertion;
	});

	it('rejette immédiatement si le signal est déjà annulé', async () => {
		const events = new EventTarget();
		const controller = new AbortController();
		controller.abort();
		await expect(waitForCommit(events, 1000, controller.signal)).rejects.toThrow(/abort/i);
	});
});
