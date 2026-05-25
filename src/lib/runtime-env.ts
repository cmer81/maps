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
			CUMUL_ENABLED?: string;
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

export function isCumulFlagEnabled(): boolean {
	const fromWindow = typeof window !== 'undefined' ? window.__OM_CONFIG?.CUMUL_ENABLED : undefined;
	const fromEnv = import.meta.env.VITE_CUMUL_ENABLED as string | undefined;
	const v = fromWindow ?? fromEnv;
	return v !== 'false';
}
