// État des superpositions Weather AI (onglet « Cyclones IA ») : cyclones,
// trajectoires, zones à surveiller et cônes, activables sur n'importe quel fond.
// Les champs continus (pression, probabilité d'existence…) ne sont PAS des
// superpositions : ils viendront comme variables d'un modèle du sélecteur.
// Seules les bascules sont persistées ; le run et le statut se rechargent depuis
// l'API ; l'échéance découle de la frise principale (store `time`).
import { derived, writable } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

import { resolveFrame } from '$lib/weather-ai/frame';
import { type LoadedRun, runValidTimes } from '$lib/weather-ai/loader';

import { time } from './time';

import type { ConesProduct, PreviousCones } from '$lib/weather-ai/cones';
import type { DisplayedState } from '$lib/weather-ai/displayed';

/** Superpositions proposées (les clés `mslp`/`existence` d'anciennes versions sont ignorées). */
export type WeatherAiOverlay = 'tracks' | 'cones';
export type WeatherAiLayers = Record<WeatherAiOverlay, boolean>;

export const DEFAULT_WEATHER_AI_LAYERS: WeatherAiLayers = {
	tracks: false,
	cones: false
};

/**
 * Forme tolérante des bascules persistées : clé manquante → défaut, valeur non
 * booléenne ignorée, clés inconnues (dont `mslp`/`existence`, superpositions de
 * champs continus des premières versions) écartées.
 */
export const normalizeWeatherAiLayers = (v: unknown): WeatherAiLayers => ({
	...DEFAULT_WEATHER_AI_LAYERS,
	...Object.fromEntries(
		Object.entries((v ?? {}) as Record<string, unknown>).filter(
			([k, b]) => k in DEFAULT_WEATHER_AI_LAYERS && typeof b === 'boolean'
		)
	)
});

export const weatherAiLayers = persisted<WeatherAiLayers>(
	'weather-ai-layers',
	DEFAULT_WEATHER_AI_LAYERS,
	{ beforeRead: normalizeWeatherAiLayers }
);

/** Run affiché. Remplacé d'un bloc (bascule atomique), jamais complété avec un autre run. */
export const weatherAiRun = writable<LoadedRun | undefined>(undefined);

/**
 * Échéance Weather AI correspondant à l'heure de la frise principale : la plus
 * proche inférieure ou égale, avec sa relation (exacte, entre deux échéances,
 * hors horizon).
 */
export const weatherAiFrame = derived([time, weatherAiRun], ([$time, $run]) =>
	resolveFrame($run ? runValidTimes($run) : [], $time)
);

/** Échéance demandée (`valid_time` ISO UTC du run), absente hors horizon. */
export const weatherAiTime = derived(weatherAiFrame, ($f) => $f.validTime);

export interface WeatherAiStatus {
	state: 'idle' | 'loading' | 'ready' | 'error';
	/** Message d'erreur ; le run affiché, s'il y en a un, reste en place. */
	message?: string;
}
export const weatherAiStatus = writable<WeatherAiStatus>({ state: 'idle' });

/**
 * Cônes du run affiché (même `run_id`), ou la raison de leur absence. Tant que
 * le run affiché n'a pas les siens (`doc: null`), `previous` peut porter ceux,
 * validés, du run affiché juste avant : présentés comme tels, jamais comme ceux
 * du run affiché, et remplacés dès que les siens sont validés.
 */
export const weatherAiCones = writable<{
	runId: string;
	/** Empreinte du document annoncé par le catalogue : un remplacement le fait relire. */
	sha256?: string;
	doc: ConesProduct | null;
	message?: string;
	previous?: PreviousCones;
} | null>(null);

/**
 * État réellement affiché sur la carte (mis à jour seulement quand un slot est
 * montré ou effacé) : les mentions de la carte flottante en découlent, pas de la
 * sélection, qui peut ne pas être affichée (chargement, délai dépassé).
 */
export const weatherAiDisplayed = writable<DisplayedState | null>(null);
