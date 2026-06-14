# Export vidéo animé (MP4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'exporter la séquence de playback météo en fichier MP4 partageable sur les réseaux sociaux, rendu frame-par-frame côté client.

**Architecture:** On rend hors-temps-réel chaque pas de temps de la plage de lecture courante (`prefetchMode`) : pour chaque frame on avance le store `time` + recharge les couches (`changeOMfileURL`), on attend le commit du SlotManager puis l'idle de la carte, on compose la frame (crop 4:3/3:4 + watermark daté réutilisés de la capture PNG) sur un canvas unique, et on la pousse dans **mediabunny** (encodeur WebCodecs + muxer MP4). La boucle d'orchestration est une fonction pure à dépendances injectées (testable sans canvas ni carte réels) ; l'I/O réelle (mediabunny, canvas 2D, MapLibre) est isolée dans des helpers fins non testés unitairement.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, MapLibre GL, [mediabunny](https://mediabunny.dev) (WebCodecs/MP4), Vitest (environnement `node`).

---

## Contraintes de l'environnement de test

- Vitest tourne en `environment: 'node'` (`vitest.config.ts`) → **pas de DOM** : `document.createElement('canvas')`, `CanvasRenderingContext2D`, `VideoEncoder` et MapLibre ne sont pas disponibles dans les tests.
- Conséquence : on teste **la logique pure** (séquencement de la boucle, calcul des timestamps, gestion de l'annulation, restauration du temps, branche de détection de support, helper `waitForCommit`). Le rendu canvas, l'encodage mediabunny et `renderFrameAt`/`createVideoSink` sont de la colle d'I/O, **non testée unitairement** (cohérent avec l'absence de test pour `captureWatermarkedPng` aujourd'hui).
- `mediabunny` est chargé via `await import('mediabunny')` **dans les implémentations par défaut uniquement**, jamais au top-level de `video-export.ts` : ainsi le module reste importable en `node` et les tests injectent des fakes sans jamais charger mediabunny.

## Constantes introduites (dans `src/lib/constants.ts`)

```ts
/** Cadence (frames/s) de la vidéo exportée — découplée du playback écran (1,2 s/frame). */
export const VIDEO_EXPORT_FPS = 10;
/** Au-delà de ce nombre de frames, l'overlay avertit avant de lancer (vidéo longue). */
export const VIDEO_EXPORT_FRAME_WARN = 60;
```

---

## File Structure

- **Modify** `package.json` — ajoute la dépendance `mediabunny`.
- **Modify** `src/lib/constants.ts` — ajoute `VIDEO_EXPORT_FPS`, `VIDEO_EXPORT_FRAME_WARN`.
- **Modify** `src/lib/prefetch.ts` — exporte `getTimeStepsInRange` (aujourd'hui privé) pour réutilisation.
- **Modify** `src/lib/png-export.ts` — extrait `drawCaptureFrame(ctx, source, region, details, logo, destW, destH)` + `getExportDimensions(orientation)` + exporte `loadInfoclimatLogo`. `captureWatermarkedPng` réutilise ces helpers (comportement inchangé).
- **Create** `src/lib/video-export.ts` — `getExportFrames`, `exportAnimation` (boucle pure), `detectMp4Codec`, `createVideoSink`, types `VideoSink`/`ExportAnimationDeps`.
- **Modify** `src/lib/playback-renderer.ts` — ajoute `waitForCommit(events, timeoutMs, signal)` et `renderFrameAt(deps)` à côté de `waitForIdle`.
- **Create** `src/lib/components/capture/video-export-flow.svelte` — bouton dédié + overlay de progression bloquant (compteur frame N/total, avertissement plage longue, bouton Annuler).
- **Modify** `src/lib/components/chrome/app-chrome.svelte` — monte `VideoExportFlow` à côté de `CaptureFlow` (variantes bar + fab).
- **Create** `src/lib/tests/video-export.test.ts` — tests de la boucle pure + détection.
- **Create** `src/lib/tests/playback-renderer.test.ts` — tests de `waitForCommit`.

---

## Task 1 : Dépendance mediabunny + constantes

**Files:**
- Modify: `package.json`
- Modify: `src/lib/constants.ts`

- [ ] **Step 1 : Installer mediabunny**

Run :
```bash
npm install mediabunny
```
Expected : `package.json` gagne une entrée `"mediabunny": "^x.y.z"` dans `dependencies`, `package-lock.json` mis à jour, exit 0.

- [ ] **Step 2 : Vérifier que mediabunny expose les symboles attendus**

Run :
```bash
node -e "const m=require('mediabunny'); console.log(['Output','Mp4OutputFormat','BufferTarget','CanvasSource','QUALITY_HIGH','getFirstEncodableVideoCodec'].map(k=>k+':'+(k in m)).join(' '))"
```
Expected : toutes les clés à `true`. (Si l'import CJS échoue, vérifier avec un `import` ESM dans un fichier `.mjs` — mediabunny est ESM-first.)

- [ ] **Step 3 : Ajouter les constantes**

Dans `src/lib/constants.ts`, ajouter en fin de fichier :
```ts
/** Cadence (frames/s) de la vidéo exportée — découplée du playback écran (1,2 s/frame). */
export const VIDEO_EXPORT_FPS = 10;
/** Au-delà de ce nombre de frames, l'overlay avertit avant de lancer (vidéo longue). */
export const VIDEO_EXPORT_FRAME_WARN = 60;
```

- [ ] **Step 4 : Typecheck**

Run : `npm run check`
Expected : 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add package.json package-lock.json src/lib/constants.ts
git commit -m "chore(video-export): ajoute mediabunny + constantes fps/seuil"
```

---

## Task 2 : Exporter `getTimeStepsInRange`

**Files:**
- Modify: `src/lib/prefetch.ts:89`

- [ ] **Step 1 : Rendre la fonction publique**

Dans `src/lib/prefetch.ts`, remplacer la déclaration privée (ligne ~89) :
```ts
const getTimeStepsInRange = (
```
par :
```ts
/**
 * Pas de temps des `valid_times` tombant dans `[startDate, endDate]` inclus.
 * Exporté pour réutilisation par l'export vidéo (mêmes bornes que le playback).
 */
export const getTimeStepsInRange = (
```
(Aucun autre changement : le corps et les usages internes restent identiques.)

- [ ] **Step 2 : Typecheck**

Run : `npm run check`
Expected : 0 erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/prefetch.ts
git commit -m "refactor(prefetch): exporte getTimeStepsInRange"
```

---

## Task 3 : Refactor `png-export.ts` (composition de frame réutilisable)

**Files:**
- Modify: `src/lib/png-export.ts:232-259`

But : extraire la composition d'une frame (crop + watermark sur un `ctx` fourni) et les dimensions, sans changer la sortie de `captureWatermarkedPng`. Pas de test unitaire (canvas indisponible en `node`) — la non-régression est garantie par réutilisation à l'identique + typecheck.

- [ ] **Step 1 : Ajouter `getExportDimensions` et exporter `loadInfoclimatLogo`**

Dans `src/lib/png-export.ts`, transformer la déclaration de `loadInfoclimatLogo` (ligne ~67) en `export const loadInfoclimatLogo = ...` (ajouter `export` devant `const`).

Puis ajouter, juste avant `captureWatermarkedPng` (vers la ligne 231) :
```ts
/** Dimensions du canvas d'export selon l'orientation (4:3 paysage / 3:4 portrait). */
export const getExportDimensions = (
	orientation: CaptureOrientation
): { width: number; height: number } =>
	orientation === 'landscape' ? { width: 1440, height: 1080 } : { width: 1080, height: 1440 };

/**
 * Compose une frame sur un `ctx` existant : crop de la zone visible de la carte
 * (px viewport → px canvas source) puis watermark daté. Partagé par la capture
 * PNG unitaire et l'export vidéo (un seul rendu de filigrane à maintenir).
 */
export const drawCaptureFrame = (
	ctx: CanvasRenderingContext2D,
	source: CanvasImageSource & { width: number; height: number },
	region: PngCaptureRegion,
	details: PngWatermarkDetails,
	logo: HTMLImageElement | undefined,
	destW: number,
	destH: number
): void => {
	const { sx, sy, sw, sh } = computeSourceCrop(
		region,
		region.viewportW,
		region.viewportH,
		source.width,
		source.height
	);
	ctx.drawImage(source, sx, sy, sw, sh, 0, 0, destW, destH);
	drawWatermark(ctx, destW, destH, { ...details, logo });
};
```
(`CaptureOrientation` est déjà importé en tête de fichier ; `PngCaptureRegion`, `PngWatermarkDetails`, `computeSourceCrop`, `drawWatermark` sont déjà dans le module.)

- [ ] **Step 2 : Réécrire `captureWatermarkedPng` pour réutiliser les helpers**

Remplacer le corps de `captureWatermarkedPng` (lignes ~232-259) par :
```ts
export const captureWatermarkedPng = async (
	map: MaplibreMap,
	details: PngWatermarkDetails,
	region: PngCaptureRegion
): Promise<Blob> => {
	const source = map.getCanvas();
	const { width, height } = getExportDimensions(region.orientation);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D canvas context unavailable');

	drawCaptureFrame(ctx, source, region, details, await loadInfoclimatLogo(), width, height);
	return blobFromCanvas(canvas, 'image/png');
};
```

- [ ] **Step 3 : Typecheck**

Run : `npm run check`
Expected : 0 erreur.

- [ ] **Step 4 : Vérifier visuellement la non-régression de la capture PNG**

Run : `npm run dev`, ouvrir l'app, déclencher la capture photo (bouton appareil photo → cadrer → exporter). Vérifier que le PNG produit est identique à avant (cadrage 4:3 + watermark inchangés).
Expected : capture PNG fonctionne comme avant.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/png-export.ts
git commit -m "refactor(png-export): extrait drawCaptureFrame + getExportDimensions"
```

---

## Task 4 : `exportAnimation` (boucle pure orchestrée) — TDD

**Files:**
- Create: `src/lib/video-export.ts`
- Test: `src/lib/tests/video-export.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/lib/tests/video-export.test.ts` :
```ts
import { describe, expect, it, vi } from 'vitest';

import { exportAnimation, getExportFrames, type VideoSink } from '$lib/video-export';

const makeSink = (): VideoSink & { calls: Array<[number, number]> } => {
	const calls: Array<[number, number]> = [];
	return {
		calls,
		add: vi.fn(async (ts: number, dur: number) => {
			calls.push([ts, dur]);
		}),
		finalize: vi.fn(async () => new Blob(['mp4'], { type: 'video/mp4' }))
	};
};

const frames = [new Date('2026-06-14T00:00Z'), new Date('2026-06-14T01:00Z'), new Date('2026-06-14T02:00Z')];

describe('exportAnimation', () => {
	it('rend chaque frame puis pousse les timestamps à la cadence fps', async () => {
		const sink = makeSink();
		const order: string[] = [];
		const blob = await exportAnimation({
			frames,
			fps: 10,
			sink,
			renderFrame: async (d) => order.push('render:' + d.toISOString()),
			drawFrame: (d) => order.push('draw:' + d.toISOString()),
			restore: () => order.push('restore')
		});

		expect(sink.calls).toEqual([
			[0, 0.1],
			[0.1, 0.1],
			[0.2, 0.1]
		]);
		expect(sink.finalize).toHaveBeenCalledOnce();
		expect(blob.type).toBe('video/mp4');
		// render avant draw avant restore final
		expect(order[0]).toBe('render:' + frames[0].toISOString());
		expect(order[1]).toBe('draw:' + frames[0].toISOString());
		expect(order.at(-1)).toBe('restore');
	});

	it('rapporte la progression frame par frame', async () => {
		const sink = makeSink();
		const progress: Array<[number, number]> = [];
		await exportAnimation({
			frames,
			fps: 10,
			sink,
			renderFrame: async () => {},
			drawFrame: () => {},
			restore: () => {},
			onProgress: (c, t) => progress.push([c, t])
		});
		expect(progress).toEqual([
			[1, 3],
			[2, 3],
			[3, 3]
		]);
	});

	it('annule proprement, ne finalise pas, et restaure le temps', async () => {
		const sink = makeSink();
		const controller = new AbortController();
		controller.abort();
		const restore = vi.fn();

		await expect(
			exportAnimation({
				frames,
				fps: 10,
				sink,
				renderFrame: async () => {},
				drawFrame: () => {},
				restore,
				signal: controller.signal
			})
		).rejects.toThrow(/abort/i);

		expect(sink.add).not.toHaveBeenCalled();
		expect(sink.finalize).not.toHaveBeenCalled();
		expect(restore).toHaveBeenCalledOnce();
	});

	it('restaure le temps même si une frame échoue', async () => {
		const sink = makeSink();
		const restore = vi.fn();
		await expect(
			exportAnimation({
				frames,
				fps: 10,
				sink,
				renderFrame: async () => {
					throw new Error('render boom');
				},
				drawFrame: () => {},
				restore
			})
		).rejects.toThrow('render boom');
		expect(restore).toHaveBeenCalledOnce();
	});
});

describe('getExportFrames', () => {
	it('filtre les valid_times dans la plage inclusive', () => {
		const meta = {
			valid_times: ['2026-06-14T00:00Z', '2026-06-14T01:00Z', '2026-06-14T02:00Z', '2026-06-14T03:00Z']
		} as never;
		const got = getExportFrames(meta, new Date('2026-06-14T01:00Z'), new Date('2026-06-14T02:00Z'));
		expect(got.map((d) => d.toISOString())).toEqual([
			'2026-06-14T01:00:00.000Z',
			'2026-06-14T02:00:00.000Z'
		]);
	});
});
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

Run : `npx vitest run src/lib/tests/video-export.test.ts`
Expected : FAIL — `Cannot find module '$lib/video-export'`.

- [ ] **Step 3 : Implémenter la boucle pure + `getExportFrames`**

Créer `src/lib/video-export.ts` :
```ts
import type { DomainMetaDataJson } from '@openmeteo/weather-map-layer';

import { getTimeStepsInRange } from '$lib/prefetch';

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
export const getExportFrames = (
	metaJson: DomainMetaDataJson,
	start: Date,
	end: Date
): Date[] => getTimeStepsInRange(metaJson, start, end);

/**
 * Rend la séquence frame-par-frame de façon déterministe : pour chaque pas, on
 * attend le rendu réel (`renderFrame`), on compose (`drawFrame`) puis on pousse
 * dans l'encodeur. `restore()` est garanti (try/finally). Renvoie le Blob MP4.
 */
export const exportAnimation = async (deps: ExportAnimationDeps): Promise<Blob> => {
	const { frames, fps, sink, renderFrame, drawFrame, onProgress, restore, signal } = deps;
	try {
		for (let i = 0; i < frames.length; i++) {
			if (signal?.aborted) throw new DOMException('Export annulé', 'AbortError');
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
```

- [ ] **Step 4 : Lancer le test pour vérifier le succès**

Run : `npx vitest run src/lib/tests/video-export.test.ts`
Expected : PASS (tous les `describe` ci-dessus verts).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/video-export.ts src/lib/tests/video-export.test.ts
git commit -m "feat(video-export): boucle d'export frame-par-frame (pure, testée)"
```

---

## Task 5 : `detectMp4Codec` (détection de support) — TDD

**Files:**
- Modify: `src/lib/video-export.ts`
- Test: `src/lib/tests/video-export.test.ts`

- [ ] **Step 1 : Ajouter le test qui échoue**

Ajouter à `src/lib/tests/video-export.test.ts` :
```ts
import { detectMp4Codec } from '$lib/video-export';

describe('detectMp4Codec', () => {
	it("retourne le codec quand le sondage en trouve un", async () => {
		const codec = await detectMp4Codec(
			{ width: 1440, height: 1080 },
			{
				supportedCodecs: async () => ['avc', 'hevc'],
				probe: async (codecs) => codecs[0]
			}
		);
		expect(codec).toBe('avc');
	});

	it('retourne null quand aucun codec encodable', async () => {
		const codec = await detectMp4Codec(
			{ width: 1440, height: 1080 },
			{
				supportedCodecs: async () => ['avc'],
				probe: async () => null
			}
		);
		expect(codec).toBeNull();
	});
});
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

Run : `npx vitest run src/lib/tests/video-export.test.ts -t "detectMp4Codec"`
Expected : FAIL — `detectMp4Codec` n'est pas exporté.

- [ ] **Step 3 : Implémenter `detectMp4Codec`**

Ajouter à `src/lib/video-export.ts` :
```ts
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
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run : `npx vitest run src/lib/tests/video-export.test.ts`
Expected : PASS (incl. `detectMp4Codec`).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/video-export.ts src/lib/tests/video-export.test.ts
git commit -m "feat(video-export): détection de support MP4/H.264 (injectable)"
```

---

## Task 6 : `createVideoSink` (encodeur mediabunny réel)

**Files:**
- Modify: `src/lib/video-export.ts`

Colle d'I/O autour de mediabunny — pas de test unitaire (WebCodecs/canvas absents en `node`). Validée à l'exécution dans la Task 9.

- [ ] **Step 1 : Implémenter `createVideoSink`**

Ajouter à `src/lib/video-export.ts` :
```ts
/**
 * Crée un encodeur MP4/H.264 adossé à `canvas` via mediabunny. Chaque `add()`
 * encode le contenu **courant** du canvas ; `finalize()` rend le MP4 complet.
 */
export const createVideoSink = async (
	canvas: HTMLCanvasElement,
	codec: string
): Promise<VideoSink> => {
	const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH } = await import(
		'mediabunny'
	);

	const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
	const videoSource = new CanvasSource(canvas, { codec: codec as never, bitrate: QUALITY_HIGH });
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
```

- [ ] **Step 2 : Typecheck**

Run : `npm run check`
Expected : 0 erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/video-export.ts
git commit -m "feat(video-export): encodeur MP4 mediabunny (createVideoSink)"
```

---

## Task 7 : `waitForCommit` + `renderFrameAt` — TDD pour le premier

**Files:**
- Modify: `src/lib/playback-renderer.ts`
- Test: `src/lib/tests/playback-renderer.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/lib/tests/playback-renderer.test.ts` :
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SLOT_EVENT_COMMIT, SLOT_EVENT_ERROR } from '$lib/slot-events';

import { waitForCommit } from '$lib/playback-renderer';

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
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

Run : `npx vitest run src/lib/tests/playback-renderer.test.ts`
Expected : FAIL — `waitForCommit` n'est pas exporté.

- [ ] **Step 3 : Implémenter `waitForCommit` et `renderFrameAt`**

Dans `src/lib/playback-renderer.ts`, ajouter en tête l'import :
```ts
import { SLOT_EVENT_COMMIT, SLOT_EVENT_ERROR } from '$lib/slot-events';
```
Puis ajouter à la fin du fichier :
```ts
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
		const onAbort = () => settle(() => reject(new DOMException('waitForCommit aborted', 'AbortError')));
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
	await waitForIdle(map, timeoutMs, signal);
};
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run : `npx vitest run src/lib/tests/playback-renderer.test.ts`
Expected : PASS (4 tests verts).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/playback-renderer.ts src/lib/tests/playback-renderer.test.ts
git commit -m "feat(playback-renderer): waitForCommit + renderFrameAt déterministes"
```

---

## Task 8 : Composant `video-export-flow.svelte`

**Files:**
- Create: `src/lib/components/capture/video-export-flow.svelte`

Composant de colle (câble stores + helpers). Validé à l'exécution (Task 9). Suivre les conventions Svelte 5 runes du projet ; déléguer l'édition à l'agent `svelte-file-editor` si disponible et valider avec `svelte-autofixer`.

- [ ] **Step 1 : Créer le composant**

```svelte
<script lang="ts">
	import { get } from 'svelte/store';

	import FilmIcon from '@lucide/svelte/icons/film';
	import { toast } from 'svelte-sonner';

	import { map as mapStore } from '$lib/stores/map';
	import { bottomChromeHeight } from '$lib/stores/preferences';
	import { prefetchMode } from '$lib/stores/prefetch';
	import { metaJson, modelRun, time } from '$lib/stores/time';
	import {
		domain as domainStore,
		selectedDomain,
		selectedVariable,
		variable as variableStore
	} from '$lib/stores/variables';

	import { computeCaptureRect } from '$lib/capture-geometry';
	import { PRERENDER_FRAME_TIMEOUT_MS, VIDEO_EXPORT_FPS, VIDEO_EXPORT_FRAME_WARN } from '$lib/constants';
	import { changeOMfileURL } from '$lib/layers';
	import {
		downloadBlob,
		drawCaptureFrame,
		formatUtcStamp,
		getExportDimensions,
		loadInfoclimatLogo,
		sanitizeFilenamePart
	} from '$lib/png-export';
	import { renderFrameAt } from '$lib/playback-renderer';
	import { getDateRangeForMode, prefetchData } from '$lib/prefetch';
	import { shareOrDownload } from '$lib/share';
	import { slotEvents } from '$lib/slot-events';
	import { formatISOWithoutTimezone } from '$lib/time-format';
	import { updateUrl } from '$lib/url';
	import { createVideoSink, detectMp4Codec, exportAnimation, getExportFrames } from '$lib/video-export';
	import { buildWatermarkDetails, formatLeadTimeForFilename } from '$lib/watermark-details';

	interface Props {
		variant?: 'bar' | 'fab';
	}
	let { variant = 'bar' }: Props = $props();

	let supported = $state(true);
	let phase = $state<'idle' | 'confirm' | 'rendering'>('idle');
	let progress = $state({ current: 0, total: 0 });
	let pendingFrames: Date[] = [];
	let abort: AbortController | null = null;

	// Détection de support au montage (H.264 via WebCodecs).
	$effect(() => {
		void detectMp4Codec(getExportDimensions('landscape')).then((codec) => {
			supported = codec !== null;
		});
	});

	// Avance la carte sur une échéance (mêmes effets que playbackAdvance, sans le
	// scroll UI) : store time + URL + rechargement des couches.
	const advance = (date: Date) => {
		time.set(new Date(date));
		updateUrl('time', formatISOWithoutTimezone(date));
		changeOMfileURL();
	};

	const run = async () => {
		const map = get(mapStore);
		const run = get(modelRun);
		const meta = get(metaJson);
		if (!map || !run || !meta) {
			toast.warning('Carte ou run non chargés');
			phase = 'idle';
			return;
		}

		phase = 'rendering';
		progress = { current: 0, total: pendingFrames.length };
		abort = new AbortController();
		const initialTime = get(time);

		const rect = computeCaptureRect(window.innerWidth, window.innerHeight - get(bottomChromeHeight));
		const region = { ...rect, viewportW: window.innerWidth, viewportH: window.innerHeight };
		const dims = getExportDimensions(rect.orientation);

		const domainValue = get(domainStore);
		const variableValue = get(variableStore);
		const domainLabel = get(selectedDomain).label ?? domainValue;
		const variableLabel = get(selectedVariable).label ?? variableValue;

		try {
			const codec = await detectMp4Codec(dims);
			if (!codec) {
				toast.error('Export vidéo non supporté par ce navigateur');
				return;
			}

			// Pré-chauffe la plage en arrière-plan (fire-and-forget, accélère le rendu).
			void prefetchData({
				startDate: pendingFrames[0],
				endDate: pendingFrames[pendingFrames.length - 1],
				metaJson: meta,
				modelRun: run,
				domain: domainValue,
				variable: variableValue,
				signal: abort.signal
			});

			const canvas = document.createElement('canvas');
			canvas.width = dims.width;
			canvas.height = dims.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('2D canvas context unavailable');
			const logo = await loadInfoclimatLogo();
			const sink = await createVideoSink(canvas, codec);

			const signal = abort.signal;
			const blob = await exportAnimation({
				frames: pendingFrames,
				fps: VIDEO_EXPORT_FPS,
				sink,
				renderFrame: (date) =>
					renderFrameAt({
						map,
						events: slotEvents,
						advance,
						date,
						timeoutMs: PRERENDER_FRAME_TIMEOUT_MS,
						signal
					}),
				drawFrame: (date, index, total) => {
					const details = buildWatermarkDetails(run, date, index, total, domainLabel, variableLabel);
					drawCaptureFrame(ctx, map.getCanvas(), region, details, logo, dims.width, dims.height);
				},
				onProgress: (current, total) => {
					progress = { current, total };
				},
				restore: () => advance(initialTime),
				signal
			});

			const filename =
				[
					'infoclimat',
					sanitizeFilenamePart(domainValue),
					sanitizeFilenamePart(variableValue),
					formatUtcStamp(run),
					formatLeadTimeForFilename(run, pendingFrames[0]),
					'anim'
				].join('_') + '.mp4';

			const file = new File([blob], filename, { type: 'video/mp4' });
			const result = await shareOrDownload(navigator, file, (f) => downloadBlob(blob, f.name));
			if (result === 'downloaded') toast.success('Vidéo enregistrée');
			else if (result === 'shared') toast.success('Vidéo partagée');
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				toast.info('Export annulé');
			} else {
				console.error('Video export failed', error);
				toast.error("L'export vidéo a échoué. Réessayer.");
			}
		} finally {
			abort = null;
			phase = 'idle';
		}
	};

	const onClick = () => {
		if (phase !== 'idle') return;
		if (!supported) {
			toast.error('Export vidéo non supporté par ce navigateur');
			return;
		}
		const meta = get(metaJson);
		if (!meta) {
			toast.warning('Run non encore chargé');
			return;
		}
		const { startDate, endDate } = getDateRangeForMode(get(prefetchMode), get(time), meta);
		pendingFrames = getExportFrames(meta, startDate, endDate);
		if (pendingFrames.length === 0) {
			toast.warning('Aucune échéance dans la plage sélectionnée');
			return;
		}
		if (pendingFrames.length > VIDEO_EXPORT_FRAME_WARN) {
			phase = 'confirm';
			return;
		}
		void run();
	};

	const cancel = () => {
		abort?.abort();
		phase = 'idle';
	};

	const label = 'Exporter en vidéo';
	const pct = $derived(progress.total ? Math.round((progress.current / progress.total) * 100) : 0);
</script>

{#if variant === 'fab'}
	<button
		type="button"
		onclick={onClick}
		disabled={!supported || phase !== 'idle'}
		aria-label={label}
		class="flex size-11 cursor-pointer items-center justify-center rounded-full bg-[#0d47a1]/85 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-md transition-transform duration-150 hover:bg-[#0d47a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
	>
		<FilmIcon class="size-5" aria-hidden="true" />
	</button>
{:else}
	<button
		type="button"
		onclick={onClick}
		disabled={!supported || phase !== 'idle'}
		aria-label={label}
		title={supported ? label : 'Export vidéo non supporté par ce navigateur'}
		class="flex h-11 md:h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 bg-[#0d47a1]/85 px-3 text-sm font-semibold text-white shadow-md backdrop-blur-md transition-transform duration-150 hover:bg-[#0d47a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
	>
		<FilmIcon class="size-4" aria-hidden="true" />
		Vidéo
	</button>
{/if}

{#if phase !== 'idle'}
	<div
		class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
	>
		<div class="w-80 max-w-[90vw] rounded-xl bg-glass/80 p-5 text-white shadow-xl ring-1 ring-white/15 backdrop-blur-xl">
			{#if phase === 'confirm'}
				<p class="mb-4 text-sm">
					Cette plage contient {pendingFrames.length} images : la vidéo sera longue et sa préparation
					peut prendre un moment. Continuer ?
				</p>
				<div class="flex justify-end gap-2">
					<button
						type="button"
						class="rounded-lg px-3 py-1.5 text-sm text-white/80 hover:text-white"
						onclick={() => (phase = 'idle')}>Annuler</button
					>
					<button
						type="button"
						class="rounded-lg bg-[#0d47a1] px-3 py-1.5 text-sm font-semibold"
						onclick={() => void run()}>Continuer</button
					>
				</div>
			{:else}
				<p class="mb-3 text-sm font-semibold">Préparation de la vidéo…</p>
				<div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
					<div class="h-full rounded-full bg-[#3b82f6] transition-all" style="width: {pct}%"></div>
				</div>
				<p class="mb-4 text-xs text-white/70">{progress.current} / {progress.total} images</p>
				<div class="flex justify-end">
					<button
						type="button"
						class="rounded-lg px-3 py-1.5 text-sm text-white/80 hover:text-white"
						onclick={cancel}>Annuler</button
					>
				</div>
			{/if}
		</div>
	</div>
{/if}
```

- [ ] **Step 2 : Typecheck + lint**

Run : `npm run check && npm run lint`
Expected : 0 erreur. (Si `svelte-autofixer` est disponible, le passer sur le fichier.)

- [ ] **Step 3 : Commit**

```bash
git add src/lib/components/capture/video-export-flow.svelte
git commit -m "feat(video-export): composant bouton + overlay de progression"
```

---

## Task 9 : Monter le composant + vérification de bout en bout

**Files:**
- Modify: `src/lib/components/chrome/app-chrome.svelte`

- [ ] **Step 1 : Monter `VideoExportFlow` à côté de `CaptureFlow`**

Dans `src/lib/components/chrome/app-chrome.svelte`, ajouter l'import après celui de `CaptureFlow` (ligne 4) :
```ts
	import VideoExportFlow from '$lib/components/capture/video-export-flow.svelte';
```
Puis mettre à jour les deux snippets `capture` :
```svelte
		{#snippet capture()}<CaptureFlow /><VideoExportFlow />{/snippet}
```
(ligne 13, variante bar) et
```svelte
		{#snippet capture()}<CaptureFlow variant="fab" /><VideoExportFlow variant="fab" />{/snippet}
```
(ligne 18, variante fab).

- [ ] **Step 2 : Typecheck + lint + suite de tests**

Run : `npm run check && npm run lint && npm run test -- --run`
Expected : 0 erreur, tous les tests verts (dont `video-export` et `playback-renderer`).

- [ ] **Step 3 : Vérification manuelle de l'export vidéo**

Run : `npm run dev`. Dans l'app :
1. Choisir un domaine horaire (ex. AROME France) et une variable avec dégradé (température / précipitations).
2. Régler la plage de lecture sur « Aujourd'hui » ou « 24 h suivantes » (sélecteur de préchargement).
3. Cliquer le bouton **Vidéo** → l'overlay de progression s'affiche, le compteur avance.
4. À la fin : la vidéo est partagée (mobile) ou téléchargée (`.mp4`).

Vérifier :
- Expected : MP4 lisible, ~10 fps, watermark présent et **horodatage qui défile** frame par frame, cadrage 4:3/3:4 identique à la capture photo.
- Tester **Annuler** pendant la préparation → l'overlay se ferme, la carte revient sur l'échéance initiale.
- Tester une plage > 60 images (« Run complet ») → l'overlay de confirmation apparaît avant lancement.

- [ ] **Step 4 : Build statique**

Run : `npm run build`
Expected : build réussi (export statique).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/components/chrome/app-chrome.svelte
git commit -m "feat(video-export): monte le bouton d'export vidéo dans le chrome"
```

---

## Mise à jour de la documentation

- [ ] **Mettre à jour `.claude/rules/architecture.md`** : ajouter un court paragraphe sous la section Playback décrivant l'export vidéo (rendu frame-par-frame déterministe via `renderFrameAt`, encodage MP4 mediabunny dans `video-export.ts`, réutilisation de `drawCaptureFrame`/watermark) — dans le même commit que la Task 9 ou un commit `docs:` dédié.

---

## Self-Review (rempli par l'auteur du plan)

- **Couverture du spec :** méthode frame-par-frame (Task 4/7), plage `prefetchMode` (Task 8, `getDateRangeForMode`), MP4/mediabunny (Task 5/6), cadrage 4:3 réutilisé (Task 3/8), cadence 10 fps (`VIDEO_EXPORT_FPS`, Task 1/4), bouton dédié + overlay (Task 8), garde-fou « avertir, laisser passer » (Task 8, phase `confirm`), pas de fallback WebM + bouton désactivé si non supporté (Task 5/8), restauration du temps (Task 4 `restore`), watermark daté défilant (Task 8 `drawFrame` rebuild par frame). ✓
- **Placeholders :** aucun — code complet à chaque étape.
- **Cohérence des types :** `VideoSink`/`ExportAnimationDeps`/`CodecProbeDeps` définis Task 4-5 et consommés tels quels Task 6/8 ; `getExportDimensions`/`drawCaptureFrame`/`loadInfoclimatLogo` exportés Task 3 et importés Task 8 ; `renderFrameAt`/`waitForCommit` Task 7 → Task 8 ; `getTimeStepsInRange` exporté Task 2 → utilisé par `getExportFrames` Task 4. ✓
- **Points laissés au plan (tranchés ici) :** seuil d'avertissement = `VIDEO_EXPORT_FRAME_WARN` (60) ; bitrate = `QUALITY_HIGH` ; pas d'estimation de durée affichée (YAGNI) ; bouton monté dans `app-chrome.svelte` à côté de `CaptureFlow`.
