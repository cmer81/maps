import { persisted } from 'svelte-persisted-store';

export const DEFAULT_SHOW_LABELS = false;

export const showLabels = persisted('show_labels', DEFAULT_SHOW_LABELS);
