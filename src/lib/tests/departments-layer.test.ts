import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { showDepartments } from '$lib/stores/departments';
import { map } from '$lib/stores/map';

import {
	DEPARTMENTS_LAYER_ID,
	DEPARTMENTS_SOURCE_ID,
	buildDepartmentsLineLayer,
	ensureDepartmentsLayer,
	refreshDepartments
} from '$lib/departments-layer';

import type maplibregl from 'maplibre-gl';

const SAMPLE_FC = {
	type: 'FeatureCollection',
	features: [
		{
			type: 'Feature',
			properties: { code: '01', nom: 'Ain' },
			geometry: {
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0]
					]
				]
			}
		}
	]
};

// Fausse carte MapLibre minimale : source geojson avec setData capturé.
function fakeMap(opts: { hasBefore?: boolean } = {}) {
	const sources: Record<string, { setData: (d: unknown) => void; lastData?: unknown }> = {};
	const layers: Record<string, maplibregl.LineLayerSpecification> = {};
	const added: Array<{ layer: maplibregl.LineLayerSpecification; before?: string }> = [];
	const visibility: string[] = [];
	return {
		sources,
		added,
		visibility,
		getSource: (id: string) => sources[id],
		addSource: (id: string) => {
			sources[id] = {
				setData(d: unknown) {
					this.lastData = d;
				}
			};
		},
		getLayer: (id: string) => {
			if (id === 'place_label_other') return opts.hasBefore ? {} : undefined;
			return layers[id];
		},
		addLayer: (layer: maplibregl.LineLayerSpecification, before?: string) => {
			layers[layer.id] = layer;
			added.push({ layer, before });
		},
		setLayoutProperty: (_id: string, _prop: string, value: string) => {
			visibility.push(value);
		}
	};
}

describe('buildDepartmentsLineLayer', () => {
	it('layer ligne sur la source geojson dédiée', () => {
		const layer = buildDepartmentsLineLayer(true, true);
		expect(layer.id).toBe(DEPARTMENTS_LAYER_ID);
		expect(layer.type).toBe('line');
		expect(layer.source).toBe(DEPARTMENTS_SOURCE_ID);
		// Source geojson autonome : pas de `source-layer` (contrairement au fond).
		expect((layer as Record<string, unknown>)['source-layer']).toBeUndefined();
	});

	it('ligne blanche sur fond sombre, noire sur fond clair', () => {
		expect(buildDepartmentsLineLayer(true, true).paint!['line-color']).toBe(
			'rgba(255,255,255,0.55)'
		);
		expect(buildDepartmentsLineLayer(false, true).paint!['line-color']).toBe('rgba(0,0,0,0.55)');
	});

	it('encode la visibilité initiale', () => {
		expect(buildDepartmentsLineLayer(true, true).layout!.visibility).toBe('visible');
		expect(buildDepartmentsLineLayer(true, false).layout!.visibility).toBe('none');
	});

	it('masqué dès z>=9 (le fond OpenFreeMap prend le relais)', () => {
		expect(buildDepartmentsLineLayer(true, true).maxzoom).toBe(9);
	});
});

describe('ensureDepartmentsLayer', () => {
	beforeEach(() => {
		showDepartments.set(true);
		// @ts-expect-error — fausse carte de test
		map.set(undefined);
	});

	it('no-op quand la carte n’est pas prête', () => {
		expect(() => ensureDepartmentsLayer()).not.toThrow();
	});

	it('ajoute source + layer une seule fois (idempotent), avant BEFORE_LAYER_VECTOR', () => {
		const m = fakeMap({ hasBefore: true });
		// @ts-expect-error — fausse carte de test
		map.set(m);
		ensureDepartmentsLayer();
		ensureDepartmentsLayer();
		expect(m.added).toHaveLength(1);
		expect(m.added[0].layer.id).toBe(DEPARTMENTS_LAYER_ID);
		expect(m.added[0].before).toBe('place_label_other');
		expect(m.getSource(DEPARTMENTS_SOURCE_ID)).toBeDefined();
	});

	it('insère sans before-layer quand BEFORE_LAYER_VECTOR est absent', () => {
		const m = fakeMap({ hasBefore: false });
		// @ts-expect-error — fausse carte de test
		map.set(m);
		ensureDepartmentsLayer();
		expect(m.added[0].before).toBeUndefined();
	});
});

describe('refreshDepartments', () => {
	beforeEach(() => {
		showDepartments.set(true);
		// @ts-expect-error — fausse carte de test
		map.set(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('masque sans fetch quand showDepartments est false', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		showDepartments.set(false);
		await refreshDepartments(false);
		expect(m.visibility.at(-1)).toBe('none');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('rend visible et fetch + setData quand showDepartments est true', async () => {
		const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => SAMPLE_FC }));
		vi.stubGlobal('fetch', fetchSpy);
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		await refreshDepartments(true);
		expect(m.visibility).toContain('visible');
		expect(fetchSpy).toHaveBeenCalledWith('/departements.geojson');
		expect(m.getSource(DEPARTMENTS_SOURCE_ID)!.lastData).toEqual(SAMPLE_FC);
	});
});
