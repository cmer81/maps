import { get } from 'svelte/store';

import { beforeEach, describe, expect, it } from 'vitest';

import { showLabels } from '$lib/stores/labels';
import { map } from '$lib/stores/map';
import { url as urlStore } from '$lib/stores/preferences';

import { LABEL_LAYER_IDS, applyLabelsVisibility } from '$lib/labels-layer';
import { urlParamsToPreferences } from '$lib/url';

// Fausse carte MapLibre minimale : ne connaît que les couches déclarées.
function fakeMap(existingLayers: readonly string[]) {
	const calls: Array<{ id: string; value: string }> = [];
	return {
		calls,
		getLayer: (id: string) => (existingLayers.includes(id) ? {} : undefined),
		setLayoutProperty: (id: string, _prop: string, value: string) => {
			calls.push({ id, value });
		}
	};
}

describe('applyLabelsVisibility', () => {
	beforeEach(() => {
		showLabels.set(true);
		// @ts-expect-error — fausse carte de test
		map.set(undefined);
	});

	it('no-op quand la carte n’est pas prête', () => {
		expect(() => applyLabelsVisibility(false)).not.toThrow();
	});

	it('masque toutes les couches de labels présentes', () => {
		const m = fakeMap(LABEL_LAYER_IDS);
		// @ts-expect-error — fausse carte de test
		map.set(m);
		applyLabelsVisibility(false);
		expect(m.calls).toEqual(LABEL_LAYER_IDS.map((id) => ({ id, value: 'none' })));
	});

	it('réaffiche les labels', () => {
		const m = fakeMap(LABEL_LAYER_IDS);
		// @ts-expect-error — fausse carte de test
		map.set(m);
		applyLabelsVisibility(true);
		expect(m.calls.every((c) => c.value === 'visible')).toBe(true);
	});

	it('ignore les couches absentes (défensif)', () => {
		const m = fakeMap(['place_label_city']);
		// @ts-expect-error — fausse carte de test
		map.set(m);
		applyLabelsVisibility(false);
		expect(m.calls).toEqual([{ id: 'place_label_city', value: 'none' }]);
	});

	it('utilise le store showLabels par défaut', () => {
		const m = fakeMap(LABEL_LAYER_IDS);
		// @ts-expect-error — fausse carte de test
		map.set(m);
		showLabels.set(false);
		applyLabelsVisibility();
		expect(m.calls.every((c) => c.value === 'none')).toBe(true);
	});
});

describe('urlParamsToPreferences — labels', () => {
	beforeEach(() => {
		showLabels.set(true);
	});

	it('hydrate labels=false depuis l’URL', () => {
		urlStore.set(new URL('http://localhost/?labels=false'));
		urlParamsToPreferences();
		expect(get(showLabels)).toBe(false);
	});

	it('n’écrit pas le param quand au défaut', () => {
		urlStore.set(new URL('http://localhost/'));
		urlParamsToPreferences();
		expect(get(urlStore).searchParams.get('labels')).toBeNull();
	});

	it('écrit le param quand le store diffère du défaut sans param URL', () => {
		showLabels.set(false);
		urlStore.set(new URL('http://localhost/'));
		urlParamsToPreferences();
		expect(get(urlStore).searchParams.get('labels')).toBe('false');
	});
});
