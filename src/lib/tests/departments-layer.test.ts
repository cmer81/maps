import { beforeEach, describe, expect, it } from 'vitest';

import { showDepartments } from '$lib/stores/departments';
import { map } from '$lib/stores/map';

import {
	DEPARTMENTS_LAYER_ID,
	buildDepartmentsLineLayer,
	ensureDepartmentsLayer,
	refreshDepartments
} from '$lib/departments-layer';

import type maplibregl from 'maplibre-gl';

describe('buildDepartmentsLineLayer', () => {
	it('cible la couche boundary admin_level 6 du fond', () => {
		const layer = buildDepartmentsLineLayer(true, true);
		expect(layer.id).toBe(DEPARTMENTS_LAYER_ID);
		expect(layer.type).toBe('line');
		expect(layer.source).toBe('openmaptiles');
		expect(layer['source-layer']).toBe('boundary');
		expect(layer.filter).toEqual(['==', ['get', 'admin_level'], 6]);
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
});

// Fausse carte MapLibre minimale.
function fakeMap(opts: { hasBefore?: boolean } = {}) {
	const added: Array<{ layer: maplibregl.LineLayerSpecification; before?: string }> = [];
	const visibility: Array<string> = [];
	let hasLayer = false;
	return {
		added,
		visibility,
		get hasLayer() {
			return hasLayer;
		},
		getLayer: (id: string) => {
			if (id === 'place_label_other') return opts.hasBefore ? {} : undefined;
			return id === DEPARTMENTS_LAYER_ID && hasLayer ? {} : undefined;
		},
		addLayer: (layer: maplibregl.LineLayerSpecification, before?: string) => {
			added.push({ layer, before });
			hasLayer = true;
		},
		setLayoutProperty: (_id: string, _prop: string, value: string) => {
			visibility.push(value);
		}
	};
}

describe('ensureDepartmentsLayer', () => {
	beforeEach(() => {
		showDepartments.set(true);
		// @ts-expect-error — fausse carte de test
		map.set(undefined);
	});

	it('no-op quand la carte n’est pas prête', () => {
		expect(() => ensureDepartmentsLayer()).not.toThrow();
	});

	it('ajoute le layer une seule fois (idempotent)', () => {
		const m = fakeMap({ hasBefore: true });
		// @ts-expect-error — fausse carte de test
		map.set(m);
		ensureDepartmentsLayer();
		ensureDepartmentsLayer();
		expect(m.added).toHaveLength(1);
		expect(m.added[0].layer.id).toBe(DEPARTMENTS_LAYER_ID);
		expect(m.added[0].before).toBe('place_label_other');
	});

	it('insère sans before-layer quand BEFORE_LAYER_VECTOR est absent', () => {
		const m = fakeMap({ hasBefore: false });
		// @ts-expect-error — fausse carte de test
		map.set(m);
		ensureDepartmentsLayer();
		expect(m.added).toHaveLength(1);
		expect(m.added[0].before).toBeUndefined();
	});
});

describe('refreshDepartments', () => {
	beforeEach(() => {
		showDepartments.set(true);
		// @ts-expect-error — fausse carte de test
		map.set(undefined);
	});

	it('rend visible quand showDepartments est true', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		refreshDepartments();
		expect(m.visibility.at(-1)).toBe('visible');
	});

	it('masque quand showDepartments est false', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		showDepartments.set(false);
		refreshDepartments();
		expect(m.visibility.at(-1)).toBe('none');
	});
});
