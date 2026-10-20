import { get } from 'svelte/store';

import { describe, expect, it, vi } from 'vitest';

import { overlays, savedCompositions } from '$lib/stores/composition';
import { resetStates } from '$lib/stores/preferences';

vi.mock('$lib/metadata', () => ({
	StaleMetadataError: class extends Error {},
	getInitialMetaData: vi.fn(async () => true),
	getMetaData: vi.fn(async () => undefined)
}));
vi.mock('mode-watcher', () => ({ setMode: vi.fn(), mode: { current: 'dark' } }));
vi.mock('@openmeteo/weather-map-layer', async (importOriginal) => ({
	...(await importOriginal<object>()),
	clearBlockCache: vi.fn(async () => {})
}));

describe('resetStates', () => {
	it('vide les superpositions mais garde les compositions enregistrées', async () => {
		const saved = {
			version: 1 as const,
			compositions: [
				{
					id: 'a',
					name: 'Ma carte',
					composition: { variable: 'temperature_2m', overlays: [] },
					createdAt: 0
				}
			]
		};
		overlays.set([{ variable: 'pressure_msl', contours: true }]);
		savedCompositions.set(saved);
		await resetStates();
		expect(get(overlays)).toEqual([]);
		expect(get(savedCompositions)).toEqual(saved);
	});
});
