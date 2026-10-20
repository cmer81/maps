import { get } from 'svelte/store';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { overlays } from '$lib/stores/composition';
import { resetStates } from '$lib/stores/preferences';
import { latest, metaJson } from '$lib/stores/time';
import { domain } from '$lib/stores/variables';

// Sans mock de `$lib/metadata` (contrairement à reset-states.test.ts) : la
// réinitialisation passe par les vraies gardes de péremption.
vi.mock('mode-watcher', () => ({ setMode: vi.fn(), mode: { current: 'dark' } }));
vi.mock('@openmeteo/weather-map-layer', async (importOriginal) => ({
	...(await importOriginal<object>()),
	clearBlockCache: vi.fn(async () => {})
}));

afterEach(() => {
	vi.unstubAllGlobals();
	metaJson.set(undefined);
	latest.set(undefined);
});

describe('resetStates pendant un changement de domaine', () => {
	it('termine la réinitialisation sans écrire de métadonnées périmées', async () => {
		domain.set('ecmwf_ifs025');
		const pending: (() => void)[] = [];
		vi.stubGlobal(
			'fetch',
			(url: string) =>
				new Promise<Response>((resolve) =>
					pending.push(() =>
						resolve(
							Object.defineProperty(
								new Response(
									JSON.stringify({
										completed: true,
										last_modified_time: '',
										reference_time: '2026-10-19T06:00:00Z',
										valid_times: ['2026-10-19T06:00:00Z'],
										variables: ['pressure_msl']
									})
								),
								'url',
								{ value: url }
							)
						)
					)
				)
		);
		overlays.set([{ variable: 'pressure_msl', contours: true }]);
		const reset = resetStates();
		domain.set('dwd_icon'); // autre modèle choisi pendant la lecture
		pending.forEach((release) => release());
		await expect(reset).resolves.toBeUndefined();
		// Ni latest ni metaJson de l'ancien domaine ; le reste du reset a eu lieu.
		expect(get(latest)).toBeUndefined();
		expect(get(metaJson)).toBeUndefined();
		expect(get(overlays)).toEqual([]);
	});
});
