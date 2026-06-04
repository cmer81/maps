import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AROME_FRANCE_DOMAIN } from '$lib/constants';

describe('getBaseUri', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('route arome_france vers le bucket maison', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { getBaseUri } = await import('$lib/helpers');
		expect(getBaseUri(AROME_FRANCE_DOMAIN)).toBe('https://bucket.test');
	});

	it('retire un slash final de la base bucket', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test/');
		const { getBaseUri } = await import('$lib/helpers');
		expect(getBaseUri(AROME_FRANCE_DOMAIN)).toBe('https://bucket.test');
	});

	it("retourne une base vide quand le bucket n'est pas configuré", async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', '');
		const { getBaseUri } = await import('$lib/helpers');
		expect(getBaseUri(AROME_FRANCE_DOMAIN)).toBe('');
	});

	it('laisse les domaines non-bucket sur open-meteo', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { getBaseUri } = await import('$lib/helpers');
		expect(getBaseUri('ecmwf_ifs')).toBe('https://map-tiles.open-meteo.com');
	});
});
