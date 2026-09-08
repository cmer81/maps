import { weatherAiUpstreamUrl } from '../src/lib/weather-ai/proxy';

interface Env {
	ASSETS: { fetch(request: Request): Promise<Response> };
}
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (!new URL(request.url).pathname.startsWith('/api/weather-ai/'))
			return env.ASSETS.fetch(request);
		const upstream = weatherAiUpstreamUrl(request.url);
		if (!upstream) return new Response('Not found', { status: 404 });
		if (request.method !== 'GET')
			return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
		try {
			const result = await fetch(upstream, {
				headers: { Accept: 'application/json' },
				// workerd supports follow/manual only. Keep the relay on its fixed upstream.
				redirect: 'manual',
				signal: AbortSignal.timeout(30000)
			});
			if (result.status >= 300 && result.status < 400) {
				await result.body?.cancel();
				return Response.json({ error: 'Weather AI upstream redirect refused' }, { status: 502 });
			}
			return new Response(result.body, {
				status: result.status,
				headers: {
					'Content-Type': result.headers.get('Content-Type') ?? 'application/json',
					'Cache-Control': 'no-store'
				}
			});
		} catch {
			return Response.json({ error: 'Weather AI upstream unavailable' }, { status: 502 });
		}
	}
};
