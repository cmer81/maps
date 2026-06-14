import { getTimeStepsInRange } from '$lib/prefetch';

import type { DomainMetaDataJson } from '@openmeteo/weather-map-layer';

/** Abstraction d'un encodeur vidéo : reçoit des frames et produit un Blob. */
export interface VideoSink {
	add(timestamp: number, duration: number): Promise<void>;
	finalize(): Promise<Blob>;
}

export interface ExportAnimationDeps {
	/** Pas de temps à rendre, dans l'ordre. */
	frames: Date[];
	/** Cadence de sortie (frames/s). */
	fps: number;
	/** Encodeur cible. */
	sink: VideoSink;
	/** Avance la carte sur `date` et attend que la frame soit rendue. */
	renderFrame: (date: Date) => Promise<void>;
	/** Compose la frame courante sur le canvas d'export. */
	drawFrame: (date: Date, index: number, total: number) => void;
	/** Restaure l'état initial (temps + couches) — appelé en succès comme en échec. */
	restore: () => void;
	onProgress?: (current: number, total: number) => void;
	signal?: AbortSignal;
}

/** Pas de temps de la plage `[start, end]` (réutilise le filtre du prefetch). */
export const getExportFrames = (metaJson: DomainMetaDataJson, start: Date, end: Date): Date[] =>
	getTimeStepsInRange(metaJson, start, end);

/**
 * Rend la séquence frame-par-frame de façon déterministe : pour chaque pas, on
 * attend le rendu réel (`renderFrame`), on compose (`drawFrame`) puis on pousse
 * dans l'encodeur. `restore()` est garanti (try/finally). Renvoie le Blob MP4.
 */
export const exportAnimation = async (deps: ExportAnimationDeps): Promise<Blob> => {
	const { frames, fps, sink, renderFrame, drawFrame, onProgress, restore, signal } = deps;
	try {
		for (let i = 0; i < frames.length; i++) {
			if (signal?.aborted) throw new DOMException('Export aborted', 'AbortError');
			await renderFrame(frames[i]);
			drawFrame(frames[i], i, frames.length);
			await sink.add(i / fps, 1 / fps);
			onProgress?.(i + 1, frames.length);
		}
		return await sink.finalize();
	} finally {
		restore();
	}
};
