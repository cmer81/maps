import { SLOT_EVENT_COMMIT, SLOT_EVENT_ERROR } from '$lib/slot-events';

import type { Map as MaplibreMap } from 'maplibre-gl';

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
		const onAbort = () =>
			settle(() => reject(new DOMException('waitForIdle aborted', 'AbortError')));
		const timeoutId = setTimeout(
			() => settle(() => reject(new Error(`waitForIdle timeout after ${timeoutMs}ms`))),
			timeoutMs
		);
		if (signal?.aborted) {
			settle(() => reject(new DOMException('waitForIdle aborted', 'AbortError')));
			return;
		}
		signal?.addEventListener('abort', onAbort);
		map.once('idle', onIdle);
	});

/**
 * Résout au prochain `commit` du SlotManager, rejette sur `error`, timeout ou
 * abort. Armer **avant** de déclencher l'avancée pour ne pas rater le commit.
 */
export const waitForCommit = (
	events: EventTarget,
	timeoutMs: number,
	signal?: AbortSignal
): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		let settled = false;
		const cleanup = () => {
			clearTimeout(timeoutId);
			events.removeEventListener(SLOT_EVENT_COMMIT, onCommit);
			events.removeEventListener(SLOT_EVENT_ERROR, onError);
			signal?.removeEventListener('abort', onAbort);
		};
		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			fn();
		};
		const onCommit = () => settle(resolve);
		const onError = () => settle(() => reject(new Error('slot error during frame render')));
		const onAbort = () =>
			settle(() => reject(new DOMException('waitForCommit aborted', 'AbortError')));
		const timeoutId = setTimeout(
			() => settle(() => reject(new Error(`waitForCommit timeout after ${timeoutMs}ms`))),
			timeoutMs
		);
		if (signal?.aborted) {
			settle(() => reject(new DOMException('waitForCommit aborted', 'AbortError')));
			return;
		}
		signal?.addEventListener('abort', onAbort);
		events.addEventListener(SLOT_EVENT_COMMIT, onCommit);
		events.addEventListener(SLOT_EVENT_ERROR, onError);
	});

/**
 * Rend une frame de façon déterministe : avance la carte sur `date`, attend le
 * commit du SlotManager (frame chargée + cross-fade lancé) puis l'idle de la
 * carte (paint final). Le listener de commit est armé avant l'avancée.
 */
export const renderFrameAt = async (deps: {
	map: MaplibreMap;
	events: EventTarget;
	advance: (date: Date) => void;
	date: Date;
	timeoutMs: number;
	signal?: AbortSignal;
}): Promise<void> => {
	const { map, events, advance, date, timeoutMs, signal } = deps;
	const committed = waitForCommit(events, timeoutMs, signal);
	advance(date);
	await committed;
	// L'idle est un filet de peinture après le commit (frame déjà chargée) : un
	// timeout ne doit pas faire échouer l'export, seul l'abort se propage.
	try {
		await waitForIdle(map, timeoutMs, signal);
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') throw err;
	}
};

/**
 * Résout quand `predicate()` devient vrai (polling à `pollMs`) ou au `timeoutMs`
 * (best-effort : on ne fait pas échouer l'export pour une condition de rendu non
 * remplie). Rejette uniquement sur abort. Sert à attendre une condition de rendu
 * réelle — p. ex. que les symboles-flèches du vent soient effectivement placés —
 * que `commit`/`idle` ne garantissent pas (placement des symboles asynchrone).
 */
export const waitForCondition = (
	predicate: () => boolean,
	timeoutMs: number,
	signal?: AbortSignal,
	pollMs = 50
): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException('waitForCondition aborted', 'AbortError'));
			return;
		}
		if (predicate()) {
			resolve();
			return;
		}
		let elapsed = 0;
		const cleanup = () => {
			clearInterval(timer);
			signal?.removeEventListener('abort', onAbort);
		};
		const onAbort = () => {
			cleanup();
			reject(new DOMException('waitForCondition aborted', 'AbortError'));
		};
		const timer = setInterval(() => {
			if (predicate()) {
				cleanup();
				resolve();
				return;
			}
			elapsed += pollMs;
			if (elapsed >= timeoutMs) {
				cleanup();
				resolve(); // best-effort : on capture quand même
			}
		}, pollMs);
		signal?.addEventListener('abort', onAbort);
	});
