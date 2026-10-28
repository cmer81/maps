// Real User Monitoring OpenObserve (`@openobserve/browser-rum`, fork du SDK Datadog).
//
// Inactif tant qu'aucun client token n'est configuré (dev, CI, forks) : le SDK
// n'est alors même pas téléchargé (import dynamique). Échantillonné (sessions et
// replay, 10 % par défaut) : des centaines de range requests .om par vue sont
// suivies en ressources. Le replay ne capture pas la carte (canvas WebGL), seulement l'UI.
import { version as appVersion } from '$app/environment';

import { getRumConfig } from '$lib/runtime-env';
import { isMissingFileError } from '$lib/slot-manager';

import type { FrameLoadTiming } from '$lib/frame-timing';
import type * as maplibregl from 'maplibre-gl';

type RumApi = (typeof import('@openobserve/browser-rum'))['openobserveRum'];

let rum: RumApi | undefined;

/**
 * Appels reçus avant la fin de `initRum()` (SDK chargé à la demande) : le premier
 * affichage de la carte se termine souvent avant. Rejoués après l'init, bornés,
 * et seulement si le RUM est configuré (sinon jetés tout de suite).
 */
const MAX_PENDING_CALLS = 50;
let pendingCalls: ((api: RumApi) => void)[] = [];
let enabled: boolean | undefined;

const withRum = (call: (api: RumApi) => void): void => {
	if (rum) return call(rum);
	enabled ??= Boolean(getRumConfig().clientToken);
	if (enabled && pendingCalls.length < MAX_PENDING_CALLS) pendingCalls.push(call);
};

/**
 * Hôtes du fond de carte (tuiles vectorielles, glyphes, sprites, relief) : hors
 * sujet et très bavards, leurs ressources ne sont pas envoyées.
 */
const IGNORED_RESOURCE_HOSTS = ['tiles.openfreemap.org', 'tiles.mapterhorn.com'];

const isIgnoredResource = (url: string): boolean => {
	try {
		return IGNORED_RESOURCE_HOSTS.includes(new URL(url).hostname);
	} catch {
		return false;
	}
};

export async function initRum(): Promise<void> {
	const config = getRumConfig();
	if (!config.clientToken || rum) return;

	const { openobserveRum } = await import('@openobserve/browser-rum');
	openobserveRum.init({
		applicationId: config.applicationId,
		clientToken: config.clientToken,
		site: config.site,
		organizationIdentifier: config.organizationIdentifier,
		service: config.service,
		env: config.env,
		version: config.version || appVersion || 'dev',
		apiVersion: 'v1',
		insecureHTTP: false,
		sessionSampleRate: config.sessionSampleRate,
		sessionReplaySampleRate: config.sessionReplaySampleRate,
		trackResources: true,
		trackLongTasks: true,
		trackUserInteractions: true,
		defaultPrivacyLevel: 'mask-user-input',
		beforeSend: (event) => !(event.type === 'resource' && isIgnoredResource(event.resource.url))
	});
	rum = openobserveRum;
	for (const call of pendingCalls) call(openobserveRum);
	pendingCalls = [];
}

/**
 * Remonte les erreurs de la carte (protocole `om://`, décodage dans les workers
 * de tuiles, style) : elles n'atteignent jamais `window.onerror`, MapLibre les
 * émet en événements `error`. Les fichiers absents (variable non publiée par le
 * domaine) et les requêtes annulées sont du fonctionnement normal, ignorés.
 */
export function trackMapErrors(map: maplibregl.Map): void {
	map.on('error', (e: maplibregl.ErrorEvent & { sourceId?: string }) => {
		const error = e.error;
		if (
			isMissingFileError(error) ||
			(error as { name?: string } | undefined)?.name === 'AbortError'
		)
			return;
		withRum((api) =>
			api.addError(error ?? new Error('MapLibre error'), {
				source: 'maplibre',
				sourceId: e.sourceId
			})
		);
	});
}

/** Temps d'affichage d'une échéance (`frame-timing.ts`), en vital `om_frame_load`. */
export function reportFrameLoad(timing: FrameLoadTiming): void {
	const { startTime, duration, ...context } = timing;
	withRum((api) => api.addDurationVital('om_frame_load', { startTime, duration, context }));
}
