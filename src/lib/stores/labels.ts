import { persisted } from 'svelte-persisted-store';

export const DEFAULT_SHOW_LABELS = true;

// Affichage des noms de villes et de pays du fond de carte (symbol-layers du
// basemap, cf. labels-layer.ts). Persisté, synchronisé dans l'URL (param `labels`).
export const showLabels = persisted('show_labels', DEFAULT_SHOW_LABELS);
