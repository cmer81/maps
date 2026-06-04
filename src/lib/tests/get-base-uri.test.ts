import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('getBaseUri', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('route arome_france vers le bucket maison', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { getBaseUri } = await import('$lib/helpers');
		expect(getBaseUri('arome_france')).toBe('https://bucket.test');
	});

	it('retire un slash final de la base bucket', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test/');
		const { getBaseUri } = await import('$lib/helpers');
		expect(getBaseUri('arome_france')).toBe('https://bucket.test');
	});

	it('laisse les domaines non-bucket sur open-meteo', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { getBaseUri } = await import('$lib/helpers');
		expect(getBaseUri('ecmwf_ifs')).toBe('https://map-tiles.open-meteo.com');
	});
});
