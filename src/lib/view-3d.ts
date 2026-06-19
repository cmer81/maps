import { get } from 'svelte/store';

import type { IControl, Map as MaplibreMap } from 'maplibre-gl';

import { map as mapStore } from '$lib/stores/map';
import { defaultPreferences, preferences } from '$lib/stores/preferences';

import { VIEW_3D_EXAGGERATION, VIEW_3D_PITCH } from '$lib/constants';

import { updateUrl } from './url';

const TERRAIN_SOURCE = 'terrainSource2';

/**
 * Init-on-load : le hash MapLibre restaure le pitch mais pas le mesh terrain.
 * Si la préférence terrain est active (lien partagé `?terrain=true`), réapplique
 * le relief. Idempotent vis-à-vis du TerrainControl natif.
 */
export function restoreView3DFromPrefs(): void {
	const m = get(mapStore);
	if (!m || !get(preferences).terrain) return;
	m.setTerrain({ source: TERRAIN_SOURCE, exaggeration: VIEW_3D_EXAGGERATION });
}

/**
 * Préset de vue 3D : oriente la caméra en perspective + relève le relief, ou
 * rétablit la vue à plat. Réutilise l'état partagé `preferences.terrain` + l'URL
 * (mêmes clés que `terrainHandler`), donc pas de désynchro avec le TerrainControl
 * natif. Le bearing n'est jamais modifié.
 */
export function applyView3D(on: boolean): void {
	const m = get(mapStore);
	if (!m) return;
	if (on) {
		m.easeTo({ pitch: VIEW_3D_PITCH });
		m.setTerrain({ source: TERRAIN_SOURCE, exaggeration: VIEW_3D_EXAGGERATION });
	} else {
		m.easeTo({ pitch: 0 });
		m.setTerrain(null);
	}
	preferences.update((p) => ({ ...p, terrain: on }));
	updateUrl('terrain', String(on), String(defaultPreferences.terrain));
}

/**
 * Bouton IControl « 3D » : un clic bascule le préset (applyView3D). La classe
 * active reflète `preferences.terrain` — y compris quand l'état change via le
 * TerrainControl natif (abonnement au store).
 */
export class View3DControl implements IControl {
	private container: HTMLElement | undefined;
	private unsubscribe: (() => void) | undefined;

	onAdd(_map: MaplibreMap): HTMLElement {
		const container = document.createElement('div');
		container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

		const button = document.createElement('button');
		button.type = 'button';
		button.title = 'Vue 3D (relief incliné)';
		button.setAttribute('aria-label', 'Vue 3D (relief incliné)');
		button.className = 'maplibregl-ctrl-view3d';
		button.innerHTML = '<span aria-hidden="true">3D</span>';
		button.addEventListener('click', () => applyView3D(!get(preferences).terrain));
		container.appendChild(button);

		this.unsubscribe = preferences.subscribe((p) =>
			button.classList.toggle('maplibregl-ctrl-view3d--active', p.terrain)
		);

		this.container = container;
		return container;
	}

	onRemove(): void {
		this.unsubscribe?.();
		this.container?.parentNode?.removeChild(this.container);
		this.container = undefined;
		this.unsubscribe = undefined;
	}
}
