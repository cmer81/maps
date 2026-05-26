import { describe, expect, it, beforeEach, vi } from 'vitest';

import { domainOptions } from '@openmeteo/weather-map-layer';

describe('registerAnomalyDomain', () => {
	beforeEach(() => {
		// retire toute entrée anomaly_europe d'un test précédent
		const idx = domainOptions.findIndex((d) => d.value === 'anomaly_europe');
		if (idx >= 0) domainOptions.splice(idx, 1);
		vi.resetModules();
	});

	it('pushes anomaly_europe when bucket URL is set', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAnomalyDomain } = await import('$lib/anomaly-domain');
		registerAnomalyDomain();
		const d = domainOptions.find((x) => x.value === 'anomaly_europe');
		expect(d).toBeDefined();
		expect(d?.grid.nx).toBe(741);
		expect(d?.grid.ny).toBe(521);
		expect(d?.time_interval).toBe('daily');
	});

	it('is idempotent (no duplicate push)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAnomalyDomain } = await import('$lib/anomaly-domain');
		registerAnomalyDomain();
		registerAnomalyDomain();
		const count = domainOptions.filter((x) => x.value === 'anomaly_europe').length;
		expect(count).toBe(1);
	});

	it('does not push when bucket URL is empty', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', '');
		const { registerAnomalyDomain } = await import('$lib/anomaly-domain');
		registerAnomalyDomain();
		expect(domainOptions.find((x) => x.value === 'anomaly_europe')).toBeUndefined();
	});
});
