import * as maplibregl from 'maplibre-gl';

import { omSourceAttribution } from '$lib/weather-ai-domain';

/**
 * SlotManager: double-buffered A/B slot system for MapLibre layers.
 *
 * Problem: MapLibre's `source.setUrl()` / `source.setTiles()` does not
 * reliably abort in-flight tile requests, leading to stale tiles appearing
 * briefly after a URL change. Removing a source and re-adding it works, but
 * causes a visible gap while new tiles load.
 *
 * Solution: maintain two slots (A and B). The active slot stays visible while
 * the pending slot loads its new source in the background. Once the pending
 * slot's source reports `loaded()`, we fade in the new slot and fade out the
 * old one, then remove the old slot after a delay. This guarantees no visual
 * gap and smooth opacity transitions between data updates.
 *
 * Each slot owns its own source and set of layers. The `slotLayers` record
 * tracks which layers were actually added per slot, so removal always
 * references the correct layer ids even when `layerFactory` returns different
 * layers between calls.
 */

type Slot = 'A' | 'B';

export interface SlotLayer {
	/** Base layer id — suffixed with `_A` or `_B` per slot. */
	id: string;
	/** Paint property used for opacity (e.g. `raster-opacity`, `line-opacity`). */
	opacityProp: 'raster-opacity' | 'line-opacity' | 'circle-opacity' | 'text-opacity';
	/** Target opacity set when the slot becomes active. */
	commitOpacity: number;
	/** Add the layer to the map. Must set initial opacity to 0 for fade-in. */
	add: (map: maplibregl.Map, sourceId: string, layerId: string, beforeLayer: string) => void;
}

export interface SlotManagerOptions {
	sourceIdPrefix: string;
	/** Called on each `update()` to get fresh layer definitions. */
	layerFactory: () => SlotLayer[];
	beforeLayer: string;
	sourceSpec: (sourceUrl: string) => maplibregl.SourceSpecification;
	/** Delay in ms before removing the previous slot after fade-out. Default: 300 */
	removeDelayMs?: number;
	/** Called once the new slot is committed and visible. */
	onCommit?: () => void;
	/** Called on source load error. */
	onError?: () => void;
	/**
	 * When true, a source load error clears BOTH the failed pending slot and the
	 * previous (still-visible) slot, instead of leaving the old data displayed.
	 * Used for the vector/arrows layer: a domain without the requested wind
	 * variable 404s, and stale arrows must not stay frozen as if current.
	 */
	clearOnError?: boolean;
	slowLoadWarningMs?: number;
	onSlowLoad?: () => void;
	/**
	 * Si `true`, le manager ne committe PAS automatiquement quand les tuiles sont
	 * chargées : il appelle `onReady()` et attend un `commitNow()` explicite. Sert
	 * à synchroniser le fade-in de plusieurs managers (cf. layers.ts).
	 */
	deferCommit?: boolean;
	/** Appelé quand les tuiles sont chargées et prêtes à committer (mode `deferCommit`). */
	onReady?: () => void;
	/**
	 * Recharge le slot en attente (même URL) quand sa source échoue ou n'a pas fini
	 * de charger au bout de `stallMs`. Sans ça, une seule lecture `.om` en échec
	 * (5xx répétés, réseau coupé) ou bloquée (corps de réponse qui ne vient jamais :
	 * le timeout du reader ne couvre que les en-têtes) laisse le slot invisible
	 * jusqu'au prochain `update()` — carte vide tant qu'on ne change pas d'échéance.
	 * Un fichier absent (404) n'est pas réessayé : c'est une variable que le
	 * domaine ne publie pas. Après `attempts` rechargements, une erreur appelle
	 * `onError` ; un chargement lent n'est plus interrompu.
	 */
	retry?: { attempts: number; delayMs: number; stallMs?: number };
}

/**
 * Réglage de `retry` des couches OMfile. 20 s sans fin de chargement est bien
 * au-delà d'une frame normale (~1-2 s) ; recharger ne perd que les blocs encore
 * en vol, les autres restent dans le cache du reader.
 */
export const OM_SLOT_RETRY: NonNullable<SlotManagerOptions['retry']> = {
	attempts: 2,
	delayMs: 1000,
	stallMs: 20000
};

/** Erreur de source définitive (fichier absent) : inutile de réessayer. */
export const isMissingFileError = (error: unknown): boolean => {
	if ((error as { status?: number } | undefined)?.status === 404) return true;
	const message = error instanceof Error ? error.message : String(error ?? '');
	return /File not found|\b404\b/.test(message);
};

export class SlotManager {
	private map: maplibregl.Map;
	private opts: SlotManagerOptions;
	private activeSlot: Slot | null = null;
	private pendingSlot: Slot | null = null;
	private cleanupListener: (() => void) | null = null;
	/** Tracks which layers were actually added per slot for correct removal. */
	private slotLayers: Record<Slot, SlotLayer[]> = { A: [], B: [] };
	/** En mode deferCommit, mémorise l'état prêt-à-committer. */
	private deferredCommit: { nextSlot: Slot; previousSlot: Slot | null } | null = null;
	/** Rechargements déjà tentés pour l'URL en cours (remis à zéro par `update()`). */
	private retryCount = 0;
	private retryTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(map: maplibregl.Map, opts: SlotManagerOptions) {
		this.map = map;
		this.opts = opts;
	}

	getActiveSourceUrl(): string | undefined {
		if (!this.activeSlot) return undefined;
		const srcId = this.sourceId(this.activeSlot);
		const source = this.map.getSource(srcId) as maplibregl.RasterTileSource | undefined;
		return source?.url;
	}

	setBeforeLayer(beforeLayer: string): void {
		this.opts.beforeLayer = beforeLayer;
	}

	/** Force un commit différé en attente (fade-in synchronisé avec d'autres managers). */
	commitNow(): void {
		if (!this.deferredCommit) return;
		const { nextSlot, previousSlot } = this.deferredCommit;
		this.deferredCommit = null;
		this.executeCommit(nextSlot, previousSlot);
	}

	/** `true` quand les tuiles sont chargées mais le commit est en attente (mode différé). */
	isReady(): boolean {
		return this.deferredCommit !== null;
	}

	update(sourceUrl: string): void {
		this.clearRetry();
		this.retryCount = 0;
		this.load(sourceUrl);
	}

	private load(sourceUrl: string): void {
		this.cleanupListener?.();
		this.cleanupListener = null;
		this.deferredCommit = null;

		// Abandon stale pending slot
		if (this.pendingSlot !== null && this.pendingSlot !== this.activeSlot) {
			this.forceRemoveSlot(this.pendingSlot);
			this.pendingSlot = null;
		}

		const nextSlot: Slot = this.activeSlot === 'A' ? 'B' : 'A';

		// Clean the next slot using its own recorded layers
		this.forceRemoveSlot(nextSlot);

		this.pendingSlot = nextSlot;
		this.addSlotLayers(nextSlot, sourceUrl);

		const sourceId = this.sourceId(nextSlot);
		if (!this.map.style.getSource(sourceId)) {
			if (this.activeSlot) {
				this.forceRemoveSlot(this.activeSlot);
			}
			this.activeSlot = null;
			this.pendingSlot = null;
			// La source n'a pas pu être enregistrée : signaler l'échec pour que le
			// coordinateur retire ce manager du groupe (sinon `loading` reste bloqué).
			this.opts.onError?.();
			return;
		}

		this.waitForLoad(nextSlot, sourceId, this.activeSlot, sourceUrl);
	}

	destroy(): void {
		this.clearRetry();
		this.cleanupListener?.();
		this.cleanupListener = null;
		this.forceRemoveSlot('A');
		this.forceRemoveSlot('B');
		this.activeSlot = null;
		this.pendingSlot = null;
		this.deferredCommit = null;
	}

	private clearRetry(): void {
		if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
		this.retryTimer = undefined;
	}

	/**
	 * Programme un rechargement du slot en attente sur la même URL. Retirer puis
	 * recréer la source annule les requêtes en vol (le cache de blocs du reader
	 * garde ce qui est déjà téléchargé). `false` si les tentatives sont épuisées.
	 */
	private scheduleRetry(nextSlot: Slot, sourceUrl: string): boolean {
		const retry = this.opts.retry;
		if (!retry || this.retryCount >= retry.attempts) return false;
		this.retryCount += 1;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = undefined;
			if (this.pendingSlot === nextSlot) this.load(sourceUrl);
		}, retry.delayMs * this.retryCount);
		return true;
	}

	private sourceId(slot: Slot): string {
		return `${this.opts.sourceIdPrefix}_${slot}`;
	}

	private layerId(layer: SlotLayer, slot: Slot): string {
		return `${layer.id}_${slot}`;
	}

	private setSlotOpacity(slot: Slot, target: 'commit' | 'zero'): void {
		for (const layer of this.slotLayers[slot]) {
			const id = this.layerId(layer, slot);
			if (this.map.getLayer(id)) {
				const value = target === 'commit' ? layer.commitOpacity : 0;
				this.map.setPaintProperty(id, layer.opacityProp, value);
			}
		}
	}

	private forceRemoveSlot(slot: Slot): void {
		for (const layer of this.slotLayers[slot]) {
			const id = this.layerId(layer, slot);
			if (this.map.getLayer(id)) this.map.removeLayer(id);
		}
		this.slotLayers[slot] = [];
		this.purgeOrphanSource(this.sourceId(slot));
	}

	/**
	 * Remove a source even if untracked layers still reference it.
	 *
	 * `slotLayers` only tracks layers we successfully added through `addSlotLayers`.
	 * In rare cases (fast playback ticks, aborted rotations), MapLibre may keep a
	 * layer attached to the source that we no longer reference here. Calling
	 * `removeSource` then throws ("Source is in use") or is silently skipped, and
	 * the next `addSource` with the same id fails with "Source already exists".
	 */
	private purgeOrphanSource(srcId: string): void {
		if (!this.map.style.getSource(srcId)) return;

		const style = this.map.getStyle();
		if (style?.layers) {
			for (const layer of style.layers) {
				if ('source' in layer && layer.source === srcId) {
					if (this.map.getLayer(layer.id)) this.map.removeLayer(layer.id);
				}
			}
		}

		this.map.removeSource(srcId);
	}

	private removeSlot(slot: Slot): void {
		if (slot === this.activeSlot || slot === this.pendingSlot) return;
		this.forceRemoveSlot(slot);
	}

	private addSlotLayers(slot: Slot, sourceUrl: string): void {
		const sourceId = this.sourceId(slot);
		// Defensive: a concurrent rotation may have left the source in the style.
		this.purgeOrphanSource(sourceId);
		// Attribution propre à la source (Weather AI) : affichée tant que la couche l'est.
		this.map.addSource(sourceId, {
			...this.opts.sourceSpec(sourceUrl),
			...omSourceAttribution(sourceUrl)
		});

		const layers = this.opts.layerFactory();
		const addedLayers: SlotLayer[] = [];

		for (const layer of layers) {
			const layerId = this.layerId(layer, slot);
			layer.add(this.map, sourceId, layerId, this.opts.beforeLayer);
			if (this.map.getLayer(layerId)) {
				addedLayers.push(layer);
			}
		}

		this.slotLayers[slot] = addedLayers;
	}

	private commit(nextSlot: Slot, previousSlot: Slot | null): void {
		if (this.opts.deferCommit) {
			// assigné avant onReady pour que isReady() soit déjà true dans le callback
			this.deferredCommit = { nextSlot, previousSlot };
			this.opts.onReady?.();
			return;
		}
		this.executeCommit(nextSlot, previousSlot);
	}

	private executeCommit(nextSlot: Slot, previousSlot: Slot | null): void {
		this.activeSlot = nextSlot;
		this.pendingSlot = null;

		// Fade in new slot to each layer's target opacity
		this.setSlotOpacity(nextSlot, 'commit');

		// Fade out previous slot
		if (previousSlot) {
			this.setSlotOpacity(previousSlot, 'zero');
		}

		this.opts.onCommit?.();

		// Remove previous slot after fade-out completes
		if (previousSlot) {
			const delay = this.opts.removeDelayMs ?? 300;
			setTimeout(() => this.removeSlot(previousSlot), delay);
		}
	}

	private waitForLoad(
		nextSlot: Slot,
		sourceId: string,
		previousSlot: Slot | null,
		sourceUrl: string
	): void {
		if (this.map.style.getSource(sourceId)?.loaded()) {
			this.commit(nextSlot, previousSlot);
			return;
		}

		// Un seul avertissement par update(), pas un par rechargement.
		let warningTimeout: ReturnType<typeof setTimeout> | undefined;
		if (this.retryCount === 0 && this.opts.slowLoadWarningMs && this.opts.onSlowLoad) {
			warningTimeout = setTimeout(this.opts.onSlowLoad, this.opts.slowLoadWarningMs);
		}

		const fail = (): void => {
			if (this.opts.clearOnError) {
				// Drop the failed pending slot AND the stale previous slot so outdated
				// data (e.g. arrows from the previous model) isn't left frozen on screen.
				this.forceRemoveSlot(nextSlot);
				if (previousSlot) this.forceRemoveSlot(previousSlot);
				this.activeSlot = null;
				this.pendingSlot = null;
			}
			this.opts.onError?.();
		};

		// Pas de minuterie au dernier essai : sur une connexion très lente mais qui
		// progresse, on laisse ce chargement aller au bout au lieu d'abandonner.
		let stallTimeout: ReturnType<typeof setTimeout> | undefined;
		const retry = this.opts.retry;
		if (retry?.stallMs && this.retryCount < retry.attempts) {
			stallTimeout = setTimeout(() => {
				cleanup();
				this.scheduleRetry(nextSlot, sourceUrl);
			}, retry.stallMs);
		}

		const cleanup = (): void => {
			if (warningTimeout !== undefined) clearTimeout(warningTimeout);
			if (stallTimeout !== undefined) clearTimeout(stallTimeout);
			this.map.off('sourcedata', onSourceData);
			this.map.off('error', onError);
			this.cleanupListener = null;
		};

		const onSourceData = (e: maplibregl.MapSourceDataEvent): void => {
			if (e.sourceId !== sourceId || !e.isSourceLoaded || e.dataType !== 'source') return;
			if (this.pendingSlot !== nextSlot) {
				cleanup();
				return;
			}
			if (this.map.style.getSource(sourceId)?.loaded()) {
				cleanup();
				this.commit(nextSlot, previousSlot);
			}
		};

		// Les erreurs de source portent `sourceId` (données passées à `ErrorEvent`), non typé en v6.
		const onError = (e: maplibregl.ErrorEvent & { sourceId?: string }): void => {
			if (e.sourceId !== sourceId) return;
			cleanup();
			if (!isMissingFileError(e.error) && this.scheduleRetry(nextSlot, sourceUrl)) return;
			fail();
		};

		this.map.on('sourcedata', onSourceData);
		this.map.on('error', onError);
		this.cleanupListener = cleanup;
	}
}
