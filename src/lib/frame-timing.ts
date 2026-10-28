/**
 * Temps d'affichage d'une échéance (RUM `om_frame_load`) : de la demande de
 * rechargement de la couche raster principale (`addOmFileLayers` /
 * `changeOMfileURL`) jusqu'au commit groupé des couches (`CommitGroup.onFlushed`).
 * C'est le temps ressenti : réseau, cache de blocs, décodage et rendu compris.
 *
 * Une seule mesure en vol : une nouvelle demande avant le commit (scrubbing,
 * lecture) remplace la précédente sans la rapporter — elle n'a jamais été vue.
 * Pur (horloges injectées) pour être testable sans carte.
 */

export type FrameLoadKind = 'initial' | 'change';
export type FrameLoadOutcome = 'ok' | 'error';

export interface FrameLoadContext {
	kind: FrameLoadKind;
	domain: string;
	variable: string;
}

export interface FrameLoadTiming extends FrameLoadContext {
	/** Début, timestamp UNIX en ms (attendu par `addDurationVital`). */
	startTime: number;
	/** Durée en ms. */
	duration: number;
	outcome: FrameLoadOutcome;
}

export interface FrameTimer {
	start(context: FrameLoadContext): void;
	commit(): void;
	fail(): void;
}

export function createFrameTimer(
	report: (timing: FrameLoadTiming) => void,
	now: () => number = () => performance.now(),
	wallNow: () => number = () => Date.now()
): FrameTimer {
	let pending: (FrameLoadContext & { start: number; startTime: number }) | null = null;

	const end = (outcome: FrameLoadOutcome): void => {
		if (!pending) return;
		const { start, startTime, ...context } = pending;
		pending = null;
		report({ ...context, startTime, duration: now() - start, outcome });
	};

	return {
		start: (context) => {
			pending = { ...context, start: now(), startTime: wallNow() };
		},
		commit: () => end('ok'),
		fail: () => end('error')
	};
}
