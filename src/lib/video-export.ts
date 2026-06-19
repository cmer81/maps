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

export interface CodecProbeDeps {
	/** Codecs vidéo contenables par le format MP4. */
	supportedCodecs: () => string[] | Promise<string[]>;
	/** Premier codec réellement encodable par WebCodecs sous ces contraintes (ou null). */
	probe: (
		codecs: string[],
		constraints: { width: number; height: number }
	) => Promise<string | null>;
}

// mediabunny chargé paresseusement : garde le module importable en environnement `node`.
const defaultCodecProbe: CodecProbeDeps = {
	supportedCodecs: async () => {
		const { Mp4OutputFormat } = await import('mediabunny');
		return new Mp4OutputFormat().getSupportedVideoCodecs() as string[];
	},
	probe: async (codecs, constraints) => {
		const { getFirstEncodableVideoCodec } = await import('mediabunny');
		return (await getFirstEncodableVideoCodec(codecs as never, constraints)) as string | null;
	}
};

/**
 * Codec H.264 (avc) encodable par WebCodecs pour ces dimensions, ou `null` si
 * le navigateur ne sait pas encoder du MP4 (ex. WebCodecs absent) → l'UI désactive
 * alors l'export. `deps` injectable pour les tests.
 */
export const detectMp4Codec = async (
	constraints: { width: number; height: number },
	deps: CodecProbeDeps = defaultCodecProbe
): Promise<string | null> => {
	const codecs = await deps.supportedCodecs();
	return deps.probe(codecs, constraints);
};

/**
 * Crée un encodeur MP4/H.264 adossé à `canvas` via mediabunny. Chaque `add()`
 * encode le contenu **courant** du canvas ; `finalize()` rend le MP4 complet.
 */
export const createVideoSink = async (
	canvas: HTMLCanvasElement,
	codec: string
): Promise<VideoSink> => {
	const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_VERY_HIGH } =
		await import('mediabunny');

	const output = new Output<typeof Mp4OutputFormat.prototype, typeof BufferTarget.prototype>({
		// fastStart: 'in-memory' place le moov atom en tête → lecture en streaming
		// immédiate (X/Instagram/navigateur) sans télécharger tout le fichier d'abord.
		format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
		target: new BufferTarget()
	});
	const videoSource = new CanvasSource(canvas, {
		codec: codec as never,
		bitrate: QUALITY_VERY_HIGH
	});
	output.addVideoTrack(videoSource);
	await output.start();

	return {
		add: (timestamp, duration) => videoSource.add(timestamp, duration),
		finalize: async () => {
			await output.finalize();
			const buffer = output.target.buffer;
			if (!buffer) throw new Error('mediabunny: buffer MP4 vide');
			return new Blob([buffer], { type: 'video/mp4' });
		}
	};
};

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
