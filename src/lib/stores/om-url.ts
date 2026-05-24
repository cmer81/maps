import { writable } from 'svelte/store';

export const currentOmUrl = writable('');

/** URL effectivement chargée pour la couche secondaire (anti-doublon). */
export const currentOmUrl2 = writable('');
