import { SLOT_EVENT_COMMIT, SLOT_EVENT_ERROR } from '$lib/slot-events';

import type { Map as MaplibreMap } from 'maplibre-gl';

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
 *
 * NOTE on stale commits across frames: both raster and vector dispatch into the
 * same `slotEvents` bus, and raster typically commits before vector. If the
 * prerender loop has already moved on by the time the vector commit arrives,
 * that stale event could resolve the next frame's `waitForCommit` prematurely.
 * The pipeline's true serialization barrier is `waitForIdle` — `waitForCommit`
 * is a fast-path optimization and may resolve on a stale event. Capture
 * correctness is guaranteed by `waitForIdle`, not by `waitForCommit`.
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

/**
 * Wait for the map to become idle (no in-flight tile loads, all paints done),
 * or reject on timeout or abort signal. Acts as a safety net in case the
 * SlotManager `commit` event fires before all auxiliary layers (hillshade,
 * labels) are painted.
 */
export const waitForIdle = (
	map: MaplibreMap,
	timeoutMs: number,
	signal?: AbortSignal
): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		let settled = false;
		const cleanup = () => {
			clearTimeout(timeoutId);
			map.off('idle', onIdle);
			signal?.removeEventListener('abort', onAbort);
		};
		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			fn();
		};
		const onIdle = () => settle(() => resolve());
		const onAbort = () => settle(() => reject(new Error('waitForIdle aborted')));
		const timeoutId = setTimeout(
			() => settle(() => reject(new Error(`waitForIdle timeout after ${timeoutMs}ms`))),
			timeoutMs
		);
		if (signal?.aborted) {
			settle(() => reject(new Error('waitForIdle aborted')));
			return;
		}
		signal?.addEventListener('abort', onAbort);
		map.once('idle', onIdle);
	});

/**
 * Capture the current map canvas as a WebP blob. Returns null on encode failure.
 * The map must be at rest (waitForCommit + waitForIdle) before calling — otherwise
 * the capture will show whatever is currently painted, which may be a transient
 * blend state during a cross-fade.
 *
 * Note: MapLibre's WebGL context must be created with `preserveDrawingBuffer: true`
 * for `toBlob` to work reliably. This is set in src/routes/+page.svelte via canvasContextAttributes.
 */
export const captureFrame = (map: MaplibreMap, quality: number): Promise<Blob | null> =>
	new Promise<Blob | null>((resolve) => {
		map.getCanvas().toBlob((blob) => resolve(blob), 'image/webp', quality);
	});

/**
 * Decode an array of WebP/PNG/JPEG blobs into GPU-resident ImageBitmaps in parallel.
 * Failed decodes are filtered out.
 */
export const decodeFrames = async (blobs: Blob[]): Promise<ImageBitmap[]> => {
	if (blobs.length === 0) return [];
	const results = await Promise.allSettled(blobs.map((b) => createImageBitmap(b)));
	const bitmaps: ImageBitmap[] = [];
	for (const r of results) {
		if (r.status === 'fulfilled') bitmaps.push(r.value);
	}
	return bitmaps;
};

type MapInteractionHandler = {
	enable: () => void;
	disable: () => void;
	isEnabled: () => boolean;
};

const INTERACTION_KEYS = [
	'dragPan',
	'scrollZoom',
	'boxZoom',
	'doubleClickZoom',
	'touchZoomRotate',
	'touchPitch',
	'keyboard',
	'dragRotate'
] as const;
type InteractionKey = (typeof INTERACTION_KEYS)[number];

/**
 * Freeze and restore map user interactions. Records which were enabled at
 * freeze time so we only re-enable those, not all of them blindly.
 */
export class MapInteractionLock {
	private previouslyEnabled: InteractionKey[] = [];

	constructor(private map: MaplibreMap) {}

	freeze(): void {
		if (this.previouslyEnabled.length > 0) return;
		for (const key of INTERACTION_KEYS) {
			const handler = this.map[key] as MapInteractionHandler | undefined;
			if (handler && handler.isEnabled()) {
				this.previouslyEnabled.push(key);
				handler.disable();
			}
		}
	}

	thaw(): void {
		for (const key of this.previouslyEnabled) {
			const handler = this.map[key] as MapInteractionHandler | undefined;
			handler?.enable();
		}
		this.previouslyEnabled = [];
	}
}

/**
 * Canvas overlay that displays pre-rendered ImageBitmap frames in a loop.
 * Owns its DOM node, drawing interval, and the bitmap references (closes them
 * on `detach`).
 */
export class PlaybackOverlay {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private bitmaps: ImageBitmap[] = [];
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private currentIndex = 0;
	private resizeHandler: (() => void) | null = null;
	private resizeRaf: number | null = null;
	private onIndexChange: ((idx: number) => void) | null = null;

	constructor(private container: HTMLElement) {
		this.canvas = document.createElement('canvas');
		this.canvas.style.cssText =
			'position:absolute;inset:0;pointer-events:none;width:100%;height:100%';
		this.canvas.setAttribute('aria-hidden', 'true');
		const ctx = this.canvas.getContext('2d');
		if (!ctx) throw new Error('2D canvas context unavailable');
		this.ctx = ctx;
	}

	attach(bitmaps: ImageBitmap[], onIndexChange?: (idx: number) => void): void {
		// Defensive: clean up any prior attached state.
		if (this.resizeHandler) {
			window.removeEventListener('resize', this.resizeHandler);
			this.resizeHandler = null;
		}
		if (this.resizeRaf !== null) {
			cancelAnimationFrame(this.resizeRaf);
			this.resizeRaf = null;
		}
		this.stopInterval();
		for (const bm of this.bitmaps) bm.close();
		this.bitmaps = bitmaps;
		this.currentIndex = 0;
		this.onIndexChange = onIndexChange ?? null;
		this.container.appendChild(this.canvas);
		this.syncCanvasSize();

		this.resizeHandler = () => {
			if (this.resizeRaf !== null) cancelAnimationFrame(this.resizeRaf);
			this.resizeRaf = requestAnimationFrame(() => {
				this.resizeRaf = null;
				this.syncCanvasSize();
				this.drawCurrent();
			});
		};
		window.addEventListener('resize', this.resizeHandler);

		this.drawCurrent();
	}

	start(intervalMs: number): void {
		this.stopInterval();
		this.intervalId = setInterval(() => this.advance(), intervalMs);
	}

	pause(): void {
		this.stopInterval();
	}

	setIndex(idx: number): void {
		if (this.bitmaps.length === 0) return;
		this.currentIndex = ((idx % this.bitmaps.length) + this.bitmaps.length) % this.bitmaps.length;
		this.drawCurrent();
		this.onIndexChange?.(this.currentIndex);
	}

	detach(): void {
		this.stopInterval();
		if (this.resizeHandler) {
			window.removeEventListener('resize', this.resizeHandler);
			this.resizeHandler = null;
		}
		if (this.resizeRaf !== null) {
			cancelAnimationFrame(this.resizeRaf);
			this.resizeRaf = null;
		}
		if (this.canvas.parentNode === this.container) {
			this.container.removeChild(this.canvas);
		}
		for (const bm of this.bitmaps) bm.close();
		this.bitmaps = [];
		this.onIndexChange = null;
	}

	private stopInterval(): void {
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	private advance(): void {
		if (this.bitmaps.length === 0) return;
		this.currentIndex = (this.currentIndex + 1) % this.bitmaps.length;
		this.drawCurrent();
		this.onIndexChange?.(this.currentIndex);
	}

	private syncCanvasSize(): void {
		const dpr = window.devicePixelRatio || 1;
		const cw = this.container.clientWidth;
		const ch = this.container.clientHeight;
		this.canvas.width = Math.max(1, Math.round(cw * dpr));
		this.canvas.height = Math.max(1, Math.round(ch * dpr));
	}

	private drawCurrent(): void {
		const bm = this.bitmaps[this.currentIndex];
		if (!bm) return;
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.drawImage(bm, 0, 0, this.canvas.width, this.canvas.height);
	}
}
