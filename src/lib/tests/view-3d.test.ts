import { get } from 'svelte/store';

import { beforeEach, describe, expect, it } from 'vitest';

import { map } from '$lib/stores/map';
import { defaultPreferences, preferences, url as urlStore } from '$lib/stores/preferences';

import { VIEW_3D_EXAGGERATION, VIEW_3D_PITCH } from '$lib/constants';
import { applyView3D, restoreView3DFromPrefs, trueElevation } from '$lib/view-3d';

// Fausse carte MapLibre minimale : enregistre les appels caméra/terrain.
function fakeMap() {
	const calls: { ease: unknown[]; terrain: unknown[] } = { ease: [], terrain: [] };
	return {
		calls,
		easeTo: (opts: unknown) => calls.ease.push(opts),
		setTerrain: (opts: unknown) => calls.terrain.push(opts)
	};
}

describe('applyView3D', () => {
	beforeEach(() => {
		preferences.set({ ...defaultPreferences });
		urlStore.set(new URL('http://localhost/'));
		// @ts-expect-error — fausse carte de test
		map.set(undefined);
	});

	it("no-op quand la carte n'est pas prête", () => {
		expect(() => applyView3D(true)).not.toThrow();
	});

	it('active la vue 3D : incline + relève le relief + flippe la préférence', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		applyView3D(true);
		expect(m.calls.ease).toEqual([{ pitch: VIEW_3D_PITCH }]);
		expect(m.calls.terrain).toEqual([
			{ source: 'terrainSource2', exaggeration: VIEW_3D_EXAGGERATION }
		]);
		expect(get(preferences).terrain).toBe(true);
		// searchParams.set s'exécute avant le `await tick()` interne → lisible aussitôt.
		expect(get(urlStore).searchParams.get('terrain')).toBe('true');
	});

	it('désactive la vue 3D : remet à plat + retire le relief', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		preferences.set({ ...defaultPreferences, terrain: true });
		applyView3D(false);
		expect(m.calls.ease).toEqual([{ pitch: 0 }]);
		expect(m.calls.terrain).toEqual([null]);
		expect(get(preferences).terrain).toBe(false);
		// 'false' == défaut → le param est retiré de l'URL.
		expect(get(urlStore).searchParams.get('terrain')).toBeNull();
	});
});

describe('trueElevation', () => {
	it("annule l'exagération du terrain (queryTerrainElevation renvoie DEM × exagération)", () => {
		// 1500 m réels affichés 2100 m avec exagération 1,4 → ~600 m de trop.
		expect(trueElevation(1500 * VIEW_3D_EXAGGERATION, VIEW_3D_EXAGGERATION)).toBeCloseTo(1500);
	});

	it('exagération absente/nulle → facteur neutre (1)', () => {
		expect(trueElevation(800, null)).toBe(800);
		expect(trueElevation(800, undefined)).toBe(800);
		expect(trueElevation(800, 0)).toBe(800);
	});

	it('renvoie null si la valeur DEM est absente ou non finie', () => {
		expect(trueElevation(null, 1.4)).toBeNull();
		expect(trueElevation(undefined, 1.4)).toBeNull();
		expect(trueElevation(NaN, 1.4)).toBeNull();
	});
});

describe('restoreView3DFromPrefs', () => {
	beforeEach(() => {
		preferences.set({ ...defaultPreferences });
		// @ts-expect-error — fausse carte de test
		map.set(undefined);
	});

	it("no-op quand la carte n'est pas prête", () => {
		expect(() => restoreView3DFromPrefs()).not.toThrow();
	});

	it('ne touche pas au relief si la préférence est false', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		restoreView3DFromPrefs();
		expect(m.calls.terrain).toEqual([]);
	});

	it('réapplique le relief si la préférence est true (lien partagé)', () => {
		const m = fakeMap();
		// @ts-expect-error — fausse carte de test
		map.set(m);
		preferences.set({ ...defaultPreferences, terrain: true });
		restoreView3DFromPrefs();
		expect(m.calls.terrain).toEqual([
			{ source: 'terrainSource2', exaggeration: VIEW_3D_EXAGGERATION }
		]);
	});
});
