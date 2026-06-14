import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitForCommit, waitForCondition } from '$lib/playback-renderer';
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

describe('waitForCondition', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('résout immédiatement si la condition est déjà vraie', async () => {
		await expect(waitForCondition(() => true, 1000)).resolves.toBeUndefined();
	});

	it('résout quand la condition devient vraie au fil du polling', async () => {
		let ready = false;
		const p = waitForCondition(() => ready, 1000, undefined, 50);
		await vi.advanceTimersByTimeAsync(120);
		ready = true;
		await vi.advanceTimersByTimeAsync(60);
		await expect(p).resolves.toBeUndefined();
	});

	it('résout au timeout (best-effort, sans rejet)', async () => {
		const p = waitForCondition(() => false, 200, undefined, 50);
		const assertion = expect(p).resolves.toBeUndefined();
		await vi.advanceTimersByTimeAsync(260);
		await assertion;
	});

	it('rejette immédiatement si le signal est déjà annulé', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(waitForCondition(() => false, 1000, controller.signal)).rejects.toThrow(/abort/i);
	});
});
