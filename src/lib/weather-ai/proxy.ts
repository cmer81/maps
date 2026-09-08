/** Fixed upstream and read-only routes. Never forward browser credentials upstream. */
export const WEATHER_AI_UPSTREAM = 'https://portail.chom.engineering';
export function weatherAiUpstreamUrl(input: string): URL | undefined {
	const url = new URL(input);
	if (
		!/^\/api\/weather-ai\/(runs|products(?:\/[^/]+(?:\/(?:data|timeline))?)?)$/.test(url.pathname)
	)
		return;
	const upstream = new URL(url.pathname, WEATHER_AI_UPSTREAM);
	for (const key of ['run_id', 'valid_time']) {
		const value = url.searchParams.get(key);
		if (value) upstream.searchParams.set(key, value);
	}
	return upstream;
}
