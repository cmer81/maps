import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SlotManager } from '$lib/slot-manager';

/**
 * Minimal fake of the MapLibre API surface used by SlotManager. Tracks sources
 * and layers in plain Maps and lets the test drive `loaded()` and fire
 * `sourcedata` / `error` events manually.
 */
class FakeMap {
	nextLoaded = true;
	sources = new Map<string, { _loaded: boolean; loaded(): boolean }>();
	layers = new Map<string, { source: string }>();
	private listeners: Record<string, Set<(e: unknown) => void>> = {};

	style = {
		getSource: (id: string) => this.sources.get(id)
	};

	getStyle() {
		return {
			layers: [...this.layers.entries()].map(([id, v]) => ({ id, source: v.source }))
		};
	}

	getSource(id: string) {
		return this.sources.get(id);
	}

	addSourceCount = 0;

	addSource(id: string) {
		this.addSourceCount++;
		const loaded = this.nextLoaded;
		this.sources.set(id, {
			_loaded: loaded,
			loaded() {
				return this._loaded;
			}
		});
	}

	removeSource(id: string) {
		this.sources.delete(id);
	}

	addLayer(spec: { id: string; source: string }) {
		this.layers.set(spec.id, { source: spec.source });
	}

	getLayer(id: string) {
		return this.layers.get(id);
	}

	removeLayer(id: string) {
		this.layers.delete(id);
	}

	setPaintProperty() {
		/* noop */
	}

	on(type: string, fn: (e: unknown) => void) {
		(this.listeners[type] ??= new Set()).add(fn);
	}

	off(type: string, fn: (e: unknown) => void) {
		this.listeners[type]?.delete(fn);
	}

	fire(type: string, e: unknown) {
		for (const fn of this.listeners[type] ?? []) fn(e);
	}

	hasLayer(id: string) {
		return this.layers.has(id);
	}
}

function makeManager(map: FakeMap, clearOnError: boolean) {
	return new SlotManager(map as never, {
		sourceIdPrefix: 'vec',
		beforeLayer: 'before',
		removeDelayMs: 0,
		clearOnError,
		sourceSpec: (url: string) => ({ type: 'vector', tiles: [url] }) as never,
		layerFactory: () => [
			{
				id: 'arrow',
				opacityProp: 'line-opacity',
				commitOpacity: 1,
				add: (m, sourceId, layerId) =>
					(m as unknown as FakeMap).addLayer({ id: layerId, source: sourceId })
			}
		]
	});
}

describe('SlotManager clearOnError', () => {
	it('clears stale arrows when the new source errors (no frozen previous slot)', () => {
		const map = new FakeMap();
		const mgr = makeManager(map, true);

		// First update loads synchronously and commits → slot A is active/visible.
		map.nextLoaded = true;
		mgr.update('om://urlA');
		expect(map.hasLayer('arrow_A')).toBe(true);

		// Second update: source does not load; pending slot B added, A still visible.
		map.nextLoaded = false;
		mgr.update('om://urlB');
		expect(map.hasLayer('arrow_B')).toBe(true);
		expect(map.hasLayer('arrow_A')).toBe(true);

		// The new source errors (e.g. wind variable 404 on a domain without wind).
		map.fire('error', { sourceId: 'vec_B' });

		// Both the failed pending slot AND the stale previous slot must be gone.
		expect(map.hasLayer('arrow_B')).toBe(false);
		expect(map.hasLayer('arrow_A')).toBe(false);
	});

	it('without clearOnError, the previous slot is kept on error (raster behavior)', () => {
		const map = new FakeMap();
		const mgr = makeManager(map, false);

		map.nextLoaded = true;
		mgr.update('om://urlA');
		map.nextLoaded = false;
		mgr.update('om://urlB');
		map.fire('error', { sourceId: 'vec_B' });

		// Previous slot stays visible (last-good image) — unchanged legacy behavior.
		expect(map.hasLayer('arrow_A')).toBe(true);
	});
});

describe('SlotManager retry', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	const makeRetryManager = (map: FakeMap, onError: () => void, clearOnError = false) =>
		new SlotManager(map as never, {
			sourceIdPrefix: 'ras',
			beforeLayer: 'before',
			removeDelayMs: 0,
			clearOnError,
			retry: { attempts: 2, delayMs: 1000, stallMs: 15000 },
			onError,
			sourceSpec: (url: string) => ({ type: 'raster', url }) as never,
			layerFactory: () => [
				{
					id: 'raster',
					opacityProp: 'raster-opacity',
					commitOpacity: 1,
					add: (m, sourceId, layerId) =>
						(m as unknown as FakeMap).addLayer({ id: layerId, source: sourceId })
				}
			]
		});

	it('reloads the source after a transient error instead of staying invisible', () => {
		const map = new FakeMap();
		const onError = vi.fn();
		const mgr = makeRetryManager(map, onError);

		map.nextLoaded = false;
		mgr.update('om://urlA');
		expect(map.addSourceCount).toBe(1);

		// Lecture en échec (5xx répétés, réseau coupé…) : avant, le slot restait à
		// l'opacité 0 jusqu'au prochain changement d'échéance.
		map.fire('error', { sourceId: 'ras_A', error: new Error('Server error: 503') });
		expect(onError).not.toHaveBeenCalled();

		map.nextLoaded = true;
		vi.advanceTimersByTime(1000);
		expect(map.addSourceCount).toBe(2);
		expect(map.hasLayer('raster_A')).toBe(true);
		expect(onError).not.toHaveBeenCalled();
	});

	it('does not retry a missing file (404): the variable is absent from the domain', () => {
		const map = new FakeMap();
		const onError = vi.fn();
		const mgr = makeRetryManager(map, onError, true);

		map.nextLoaded = false;
		mgr.update('om://urlA');
		map.fire('error', { sourceId: 'ras_A', error: new Error('File not found') });

		expect(onError).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(60000);
		expect(map.addSourceCount).toBe(1);
	});

	it('reloads a stalled source, then lets the last attempt finish however long it takes', () => {
		const map = new FakeMap();
		const onError = vi.fn();
		const mgr = makeRetryManager(map, onError);

		map.nextLoaded = false;
		mgr.update('om://urlA');

		// Requête bloquée : aucun sourcedata, aucune erreur.
		vi.advanceTimersByTime(15000 + 1000);
		expect(map.addSourceCount).toBe(2);
		vi.advanceTimersByTime(15000 + 2000);
		expect(map.addSourceCount).toBe(3);
		expect(onError).not.toHaveBeenCalled();

		// Dernier essai : plus de minuterie, on attend la fin du chargement.
		vi.advanceTimersByTime(120000);
		expect(map.addSourceCount).toBe(3);
		expect(onError).not.toHaveBeenCalled();

		map.sources.get('ras_A')!._loaded = true;
		map.fire('sourcedata', { sourceId: 'ras_A', isSourceLoaded: true, dataType: 'source' });
		expect(map.hasLayer('raster_A')).toBe(true);
		expect(mgr.isReady()).toBe(false); // committé (pas de deferCommit ici)
	});

	it('a new update cancels a scheduled retry of the previous url', () => {
		const map = new FakeMap();
		const onError = vi.fn();
		const mgr = makeRetryManager(map, onError);

		map.nextLoaded = false;
		mgr.update('om://urlA');
		map.fire('error', { sourceId: 'ras_A', error: new Error('Server error: 503') });

		map.nextLoaded = true;
		mgr.update('om://urlB');
		expect(map.addSourceCount).toBe(2);
		vi.advanceTimersByTime(60000);
		expect(map.addSourceCount).toBe(2);
	});
});
