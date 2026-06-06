import { persisted } from 'svelte-persisted-store';

export const DEFAULT_SHOW_STATIONS = false;

export const showStations = persisted('show_stations', DEFAULT_SHOW_STATIONS);
