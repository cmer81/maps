import { SLOT_EVENT_COMMIT, SLOT_EVENT_ERROR } from '$lib/slot-events';

/**
 * Convert frames-per-second to the interval in milliseconds between frame draws.
 * Throws if fps <= 0.
 */
export const computeFrameIntervalMs = (fps: number): number => {
	if (fps <= 0) throw new Error(`fps must be positive, got ${fps}`);
	return 1000 / fps;
};

/**
 * Rough estimate of total prerender duration. Used for the "~Xs frozen" toast.
 * Assumes 400ms per frame as the median observed cost (decode + render + idle + toBlob).
 */
export const estimatePrerenderMs = (frameCount: number): number => frameCount * 400;

/**
 * True if the failure ratio strictly exceeds the threshold. Returns false when
 * no frames were attempted (avoids div-by-zero at the start of the loop).
 */
export const isFailureRateExceeded = (
	failures: number,
	attempted: number,
	threshold: number
): boolean => {
	if (attempted === 0) return false;
	return failures / attempted > threshold;
};

/**
 * Resolve on the next `commit` from `slotEvents`, reject on `error`, on
 * timeout, or on abort signal. Listeners are cleaned up in all paths.
 */
export const waitForCommit = (
	target: EventTarget,
	timeoutMs: number,
	signal?: AbortSignal
): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		let settled = false;
		const cleanup = () => {
			target.removeEventListener(SLOT_EVENT_COMMIT, onCommit);
			target.removeEventListener(SLOT_EVENT_ERROR, onError);
			if (timeoutId !== undefined) clearTimeout(timeoutId);
			signal?.removeEventListener('abort', onAbort);
		};
		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			fn();
		};
		const onCommit = () => settle(() => resolve());
		const onError = () => settle(() => reject(new Error('slot manager error during commit')));
		const onAbort = () => settle(() => reject(new Error('waitForCommit aborted')));
		const timeoutId = setTimeout(
			() => settle(() => reject(new Error(`waitForCommit timeout after ${timeoutMs}ms`))),
			timeoutMs
		);

		if (signal?.aborted) {
			settle(() => reject(new Error('waitForCommit aborted')));
			return;
		}
		signal?.addEventListener('abort', onAbort);
		target.addEventListener(SLOT_EVENT_COMMIT, onCommit, { once: true });
		target.addEventListener(SLOT_EVENT_ERROR, onError, { once: true });
	});
