import { writable } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

/**
 * Affiche le bouton « Sondage vertical » dans le popup. Persisté (réglages).
 * Le bouton reste de toute façon masqué sur les domaines sans niveaux de pression
 * (cf. isSoundingDomain) — ce toggle permet en plus de le désactiver côté AROME.
 */
export const soundingButtonEnabled = persisted('sounding_button_enabled', true);

export type SoundingTab = 'skewt' | 'hodograph' | 'indices';

export interface SoundingState {
	open: boolean;
	lat: number | null;
	lng: number | null;
	activeTab: SoundingTab;
}

const initial: SoundingState = { open: false, lat: null, lng: null, activeTab: 'skewt' };

function createSoundingStore() {
	const { subscribe, set, update } = writable<SoundingState>(initial);
	return {
		subscribe,
		open: (lat: number, lng: number) => set({ open: true, lat, lng, activeTab: 'skewt' }),
		setTab: (activeTab: SoundingTab) => update((s) => ({ ...s, activeTab })),
		close: () => set(initial)
	};
}

export const sounding = createSoundingStore();
