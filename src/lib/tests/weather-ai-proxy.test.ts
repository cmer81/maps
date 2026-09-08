import { afterEach, describe, expect, it, vi } from 'vitest';

import { weatherAiUpstreamUrl } from '$lib/weather-ai/proxy';

import worker from '../../../server/worker';

afterEach(() => vi.unstubAllGlobals());
describe('Relais Weather AI', () => {
	it('utilise un mode de redirection compatible avec le runtime Cloudflare', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn<typeof fetch>(async (_input, options) => {
				if (options?.redirect === 'error') throw new TypeError('Invalid redirect value');
				return new Response('{"produits":[]}', { status: 200 });
			})
		);
		const result = await worker.fetch(new Request('https://front.test/api/weather-ai/products'), {
			ASSETS: { fetch: async () => new Response('asset') }
		});
		expect(result.status).toBe(200);
		expect(await result.json()).toEqual({ produits: [] });
	});
	it('refuse les redirections amont sans les suivre ni les transmettre au navigateur', async () => {
		const fetcher = vi.fn<typeof fetch>(
			async () =>
				new Response(null, {
					status: 302,
					headers: { Location: 'https://other.test' }
				})
		);
		vi.stubGlobal('fetch', fetcher);
		const result = await worker.fetch(new Request('https://front.test/api/weather-ai/products'), {
			ASSETS: { fetch: async () => new Response('asset') }
		});
		expect(result.status).toBe(502);
		expect(result.headers.has('Location')).toBe(false);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('manual');
	});
	it('limite les destinations et les paramètres', () => {
		expect(
			weatherAiUpstreamUrl(
				'https://front.test/api/weather-ai/products/other/data?run_id=r&valid_time=t&url=https://bad.test'
			)?.href
		).toBe(
			'https://portail.chom.engineering/api/weather-ai/products/other/data?run_id=r&valid_time=t'
		);
		expect(weatherAiUpstreamUrl('https://front.test/api/weather-ai/admin')).toBeUndefined();
	});
	it('préserve les erreurs API sans transmettre cookies ni autorisation', async () => {
		const fetcher = vi.fn<typeof fetch>(async () => new Response('{}', { status: 503 }));
		vi.stubGlobal('fetch', fetcher);
		const result = await worker.fetch(
			new Request('https://front.test/api/weather-ai/products', {
				headers: { Cookie: 'secret', Authorization: 'secret' }
			}),
			{ ASSETS: { fetch: async () => new Response('asset') } }
		);
		expect(result.status).toBe(503);
		expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { Accept: 'application/json' } });
	});
	it('interdit les mutations', async () => {
		const result = await worker.fetch(
			new Request('https://front.test/api/weather-ai/products', { method: 'POST' }),
			{ ASSETS: { fetch: async () => new Response('asset') } }
		);
		expect(result.status).toBe(405);
	});
});
