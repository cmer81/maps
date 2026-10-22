// Runtime config — populated by /runtime-config.js (generated at container
// start by docker-entrypoint.d/40-runtime-env.sh). We can't rely on
// import.meta.env at runtime because:
//   1. Vite inlines VITE_* values into the bundle at *build* time;
//   2. We'd want to change them across deployments without rebuilding.
//
// Vite's static analysis also performs dead-code elimination on conditionals
// involving build-time-constant strings, which makes "build-time placeholder
// + runtime sed-substitution" patterns unreliable for boolean-like checks.
// Reading from `window` (which doesn't exist at build time) sidesteps both.

declare global {
	interface Window {
		__OM_CONFIG?: {
			OM_WORKER_URL?: string;
			MODELS_BUCKET_URL?: string;
			WEATHER_AI_OM_BUCKET_URL?: string;
			FORECAST_API_URL?: string;
			WEATHER_AI_API_URL?: string;
			WEATHER_AI_CONES?: string;
		};
	}
}

export function getOmWorkerUrl(): string {
	if (typeof window !== 'undefined') {
		const fromWindow = window.__OM_CONFIG?.OM_WORKER_URL;
		if (fromWindow && fromWindow.length > 0) return fromWindow;
	}
	return (import.meta.env.VITE_OM_WORKER_URL as string | undefined) ?? '';
}

export function getModelsBucketUrl(): string {
	if (typeof window !== 'undefined') {
		const fromWindow = window.__OM_CONFIG?.MODELS_BUCKET_URL;
		if (fromWindow && fromWindow.length > 0) return fromWindow;
	}
	return (import.meta.env.VITE_MODELS_BUCKET_URL as string | undefined) ?? '';
}

/**
 * Bucket des fichiers `.om` Weather AI (pseudo-domaine `weather_ai_wnc_mini`),
 * distinct de `MODELS_BUCKET_URL` : bucket OVH dédié, alimenté par l'export du
 * producteur weather-ai. Sans valeur, le domaine reste absent du sélecteur.
 */
export function getWeatherAiOmBucketUrl(): string {
	if (typeof window !== 'undefined') {
		const fromWindow = window.__OM_CONFIG?.WEATHER_AI_OM_BUCKET_URL;
		if (fromWindow && fromWindow.length > 0) return fromWindow;
	}
	return (import.meta.env.VITE_WEATHER_AI_OM_BUCKET_URL as string | undefined) ?? '';
}

/**
 * Base de l'API forecast JSON (compatible Open-Meteo) alimentant le meteogram.
 * Défaut : l'API maison Infoclimat/cmer (`modeles-api.cmer.fr`), qui sert AUSSI
 * les pseudo-domaines France (`meteofrance_arome_france`/`_hd`) absents de
 * l'API publique. Pas d'authentification pour l'instant (aucune clé requise).
 * Surchargeable au runtime (`window.__OM_CONFIG`) ou au build (`VITE_*`).
 * La barre oblique finale est retirée (l'appelant ajoute `/v1/forecast`).
 */
export function getForecastApiUrl(): string {
	const fallback = 'https://modeles-api.cmer.fr';
	let url = fallback;
	if (typeof window !== 'undefined' && window.__OM_CONFIG?.FORECAST_API_URL) {
		url = window.__OM_CONFIG.FORECAST_API_URL;
	} else {
		const fromEnv = import.meta.env.VITE_FORECAST_API_URL as string | undefined;
		if (fromEnv && fromEnv.length > 0) url = fromEnv;
	}
	return url.replace(/\/$/, '');
}

/**
 * Base de l'API Weather AI du portail (cartes expérimentales WeatherNext Cyclones
 * Mini). Défaut : le portail public, appelé en direct (il renvoie l'en-tête CORS).
 * `VITE_WEATHER_AI_API_URL=/api/weather-ai` passe optionnellement par le proxy du
 * dev/preview server (`vite.config.ts`). La barre oblique finale est retirée
 * (l'appelant ajoute `/products`…).
 */
export function getWeatherAiApiUrl(): string {
	const fallback = 'https://portail.chom.engineering/api/weather-ai';
	let url = fallback;
	if (typeof window !== 'undefined' && window.__OM_CONFIG?.WEATHER_AI_API_URL) {
		url = window.__OM_CONFIG.WEATHER_AI_API_URL;
	} else {
		const fromEnv = import.meta.env.VITE_WEATHER_AI_API_URL as string | undefined;
		if (fromEnv && fromEnv.length > 0) url = fromEnv;
	}
	return url.replace(/\/$/, '');
}

/**
 * Feature flag des cônes d'incertitude (`global-cyclone-cones-public`, pas encore
 * servis par le portail). `off` (défaut) : jamais affichés. `on` : affichés quand
 * le produit apparaît dans le catalogue. `fixture` : démonstration hors API
 * (trajectoires archivées du run de référence + cônes fictifs du même run),
 * activable aussi par le paramètre d'URL `?weather_ai_cones=fixture` pour juger
 * le rendu en prévisualisation. Le paramètre d'URL ne peut que demander la démo,
 * jamais allumer `on`.
 */
export type WeatherAiConesMode = 'off' | 'on' | 'fixture';

export function getWeatherAiConesMode(): WeatherAiConesMode {
	if (typeof window !== 'undefined') {
		const fromUrl = new URLSearchParams(window.location.search).get('weather_ai_cones');
		if (fromUrl === 'fixture') return 'fixture';
	}
	let raw: string | undefined;
	if (typeof window !== 'undefined' && window.__OM_CONFIG?.WEATHER_AI_CONES) {
		raw = window.__OM_CONFIG.WEATHER_AI_CONES;
	} else {
		raw = import.meta.env.VITE_WEATHER_AI_CONES as string | undefined;
	}
	return raw === 'on' || raw === 'fixture' ? raw : 'off';
}
