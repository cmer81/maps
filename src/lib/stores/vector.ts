import { persisted } from 'svelte-persisted-store';

import { DEFAULT_VECTOR_OPTIONS } from '$lib/constants';

export const defaultVectorOptions = DEFAULT_VECTOR_OPTIONS;

export interface VectorOptions {
	grid: boolean;
	arrows: boolean;
	contours: boolean;
	breakpoints: boolean;
	contourInterval: number;
}

export const vectorOptions = persisted('vector-options', defaultVectorOptions);

export const windOverlayEnabled = persisted('windOverlayEnabled', false);
export const windOverlayLevel = persisted('windOverlayLevel', '10m');

/** Calque « valeurs aux points de grille » (façon Météociel). Indépendant du
 *  toggle `vectorOptions.grid` (points orange) : les deux sont orthogonaux. */
export const gridValues = persisted('gridValues', false);
