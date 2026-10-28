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
			OO_RUM_CLIENT_TOKEN?: string;
			OO_RUM_SITE?: string;
			OO_RUM_ORG?: string;
			OO_RUM_APPLICATION_ID?: string;
			OO_RUM_ENV?: string;
			OO_RUM_SESSION_SAMPLE_RATE?: string;
			OO_RUM_REPLAY_SAMPLE_RATE?: string;
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
 * Feature flag des cônes d'incertitude publics (`global-cyclone-cones-public`).
 * `on` (défaut, décision de Pam du 23/10/2026) : affichés quand le champ `cones`
 * du catalogue les annonce pour le run affiché — le portail ne sert que des cônes
 * validés, avec leur mention de calibration, et `null` sinon (rien n'est proposé).
 * `off` : interrupteur de retrait, jamais affichés (`VITE_WEATHER_AI_CONES=off`
 * au build, `WEATHER_AI_CONES=off` au runtime Docker). `fixture` : démonstration
 * hors API (trajectoires archivées du run de référence + cônes fictifs du même
 * run), activable aussi par le paramètre d'URL `?weather_ai_cones=fixture` pour
 * juger le rendu en prévisualisation — sauf en `off`, qui gagne partout. Le
 * paramètre d'URL ne peut que demander la démo, jamais couper ou allumer les
 * cônes réels.
 */
export type WeatherAiConesMode = 'off' | 'on' | 'fixture';

export function getWeatherAiConesMode(): WeatherAiConesMode {
	let raw: string | undefined;
	if (typeof window !== 'undefined' && window.__OM_CONFIG?.WEATHER_AI_CONES) {
		raw = window.__OM_CONFIG.WEATHER_AI_CONES;
	} else {
		raw = import.meta.env.VITE_WEATHER_AI_CONES as string | undefined;
	}
	// `off` gagne partout : le paramètre d'URL ne peut pas rallumer la démo.
	if (raw === 'off') return 'off';
	if (typeof window !== 'undefined') {
		const fromUrl = new URLSearchParams(window.location.search).get('weather_ai_cones');
		if (fromUrl === 'fixture') return 'fixture';
	}
	return raw === 'fixture' ? 'fixture' : 'on';
}

/**
 * Real User Monitoring OpenObserve (`src/lib/rum.ts`). Sans client token, le RUM
 * reste inactif (dev, CI, forks). Le token RUM est un jeton d'ingestion seule,
 * prévu pour être exposé côté navigateur. Valeurs runtime (`window.__OM_CONFIG`,
 * Docker) prioritaires sur les `VITE_*` inlinés au build (Cloudflare Workers).
 */
export interface RumConfig {
	clientToken: string;
	site: string;
	organizationIdentifier: string;
	applicationId: string;
	service: string;
	env: string;
	version: string;
	/** % des sessions suivies. */
	sessionSampleRate: number;
	/** % des sessions SUIVIES qui sont enregistrées (relatif à `sessionSampleRate`). */
	sessionReplaySampleRate: number;
}

export function getRumConfig(): RumConfig {
	const fromWindow = typeof window !== 'undefined' ? window.__OM_CONFIG : undefined;
	const pick = (runtime: string | undefined, build: unknown, fallback = ''): string =>
		runtime || (build as string | undefined) || fallback;
	// Taux d'échantillonnage en % (0..100) ; valeur absente ou invalide → défaut.
	const rate = (runtime: string | undefined, build: unknown, fallback: number): number => {
		const raw = pick(runtime, build);
		const value = raw === '' ? NaN : Number(raw);
		return Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback;
	};
	return {
		clientToken: pick(fromWindow?.OO_RUM_CLIENT_TOKEN, import.meta.env.VITE_OO_RUM_CLIENT_TOKEN),
		site: pick(fromWindow?.OO_RUM_SITE, import.meta.env.VITE_OO_RUM_SITE, 'openobserve.cmer.fr'),
		organizationIdentifier: pick(
			fromWindow?.OO_RUM_ORG,
			import.meta.env.VITE_OO_RUM_ORG,
			'default'
		),
		applicationId: pick(
			fromWindow?.OO_RUM_APPLICATION_ID,
			import.meta.env.VITE_OO_RUM_APPLICATION_ID,
			'infoclimat-maps'
		),
		service: 'infoclimat-maps',
		env: pick(fromWindow?.OO_RUM_ENV, import.meta.env.VITE_OO_RUM_ENV, 'production'),
		version: (import.meta.env.VITE_OO_RUM_VERSION as string | undefined) ?? '',
		sessionSampleRate: rate(
			fromWindow?.OO_RUM_SESSION_SAMPLE_RATE,
			import.meta.env.VITE_OO_RUM_SESSION_SAMPLE_RATE,
			10
		),
		sessionReplaySampleRate: rate(
			fromWindow?.OO_RUM_REPLAY_SAMPLE_RATE,
			import.meta.env.VITE_OO_RUM_REPLAY_SAMPLE_RATE,
			10
		)
	};
}
