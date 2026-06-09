import { get } from 'svelte/store';

import { showLabels } from '$lib/stores/labels';
import { map as m } from '$lib/stores/map';

/**
 * Symbol-layers du basemap portant les noms de villes et de pays
 * (cf. `src/lib/basemap/minimal-dark.json` / `minimal-light.json`).
 */
export const LABEL_LAYER_IDS = [
	'place_label_other',
	'place_label_city',
	'country_label-other',
	'country_label'
] as const;

/**
 * Applique la visibilité des labels villes/pays selon le store `showLabels`.
 * Idempotent et défensif (couche absente = ignorée). À rappeler après chaque
 * `reloadStyles()` : `setStyle` recrée les couches du basemap en `visible`,
 * écrasant l'état du toggle.
 */
export function applyLabelsVisibility(visible: boolean = get(showLabels)): void {
	const map = get(m);
	if (!map) return;
	const value = visible ? 'visible' : 'none';
	for (const id of LABEL_LAYER_IDS) {
		if (map.getLayer(id)) {
			map.setLayoutProperty(id, 'visibility', value);
		}
	}
}
