import { type Writable, get, writable } from 'svelte/store';

import { OmDataType, OmFileReader, OmHttpBackend } from '@openmeteo/file-reader';

import { modelRun as mR, time as timeStore } from '$lib/stores/time';
import { domain as domainStore } from '$lib/stores/variables';

import { WEATHER_AI_GLOBAL_DOMAIN } from '$lib/constants';
import { buildOmFileUrl } from '$lib/helpers';

/**
 * Métadonnée de provenance portée par l'OMfile `weather_ai_global`.
 *
 * Le pipeline amont (`weather-ai-forecast`) écrit un scalaire **String** nommé
 * `metadata`, enfant de la variable `pressure_msl`, contenant un JSON :
 *
 * ```json
 * {
 *   "source": "Weather AI (WeatherNext Cyclones Mini, Google DeepMind) via …",
 *   "generated_at": "2026-09-06T11:47:52Z",
 *   "extra": {
 *     "attribution": "…", "experimental": true, "license_notice": "…",
 *     "run_id": "…", "snapshot_id": "…"
 *   }
 * }
 * ```
 *
 * `attribution` et `license_notice` sont des **chaînes contractuelles** : elles sont
 * affichées telles quelles, jamais reformulées ni traduites côté client (les poids du
 * modèle sont sous CC BY-NC-SA 4.0 — attribution obligatoire, partage à l'identique,
 * usage non lucratif).
 */
export interface WeatherAiMetadata {
	source?: string;
	generatedAt?: string;
	/** Miroir de `extra.experimental`. Le client ne s'y fie **pas** pour décider
	 *  d'afficher le badge (cf. `EXPERIMENTAL_DOMAINS`) : un fetch raté ne doit
	 *  jamais faire disparaître l'avertissement. */
	experimental: boolean;
	/** `extra.license_notice`, affichée verbatim. */
	licenseNotice?: string;
	/** `extra.attribution`, affichée verbatim. */
	attribution?: string;
	runId?: string;
	snapshotId?: string;
}

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * Parse le JSON du scalaire `metadata`. Purement défensif : un champ manquant ou
 * d'un type inattendu est ignoré plutôt que de faire échouer la lecture — la notice
 * est un bonus d'affichage, elle ne doit jamais casser la carte.
 */
export function parseWeatherAiMetadata(raw: string): WeatherAiMetadata | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (typeof parsed !== 'object' || parsed === null) return undefined;

	const root = parsed as Record<string, unknown>;
	const extraRaw = root.extra;
	const extra: Record<string, unknown> =
		typeof extraRaw === 'object' && extraRaw !== null ? (extraRaw as Record<string, unknown>) : {};

	return {
		source: asString(root.source),
		generatedAt: asString(root.generated_at),
		experimental: extra.experimental === true,
		licenseNotice: asString(extra.license_notice),
		attribution: asString(extra.attribution),
		runId: asString(extra.run_id),
		snapshotId: asString(extra.snapshot_id)
	};
}

/** Chemin du scalaire dans l'arborescence de l'OMfile. */
const METADATA_PATH = 'pressure_msl/metadata';

/**
 * Lit la métadonnée de provenance d'un OMfile `weather_ai_global`.
 *
 * Reader dédié (`OmHttpBackend` + `OmFileReader`) plutôt que le
 * `WeatherMapLayerFileReader` partagé du protocole : ce dernier n'expose que
 * `readVariable`/`readRawVariable` et aucune navigation d'arborescence ni lecture de
 * scalaire. Le coût reste marginal — on ne lit que l'en-tête, le trailer et le
 * scalaire, jamais un champ de données.
 */
export async function readWeatherAiMetadata(
	omUrl: string,
	signal?: AbortSignal
): Promise<WeatherAiMetadata | undefined> {
	const backend = new OmHttpBackend({ url: omUrl });
	try {
		const reader = await OmFileReader.create(backend);
		const node = await reader.findByPath(METADATA_PATH);
		if (!node) return undefined;
		if (signal?.aborted) return undefined;
		const raw = node.readScalar<string>(OmDataType.String);
		return raw ? parseWeatherAiMetadata(raw) : undefined;
	} catch {
		// Réseau, 404 sur un run tout juste expiré, format inattendu : on retombe
		// silencieusement sur `undefined`. Le bandeau affiche alors l'avertissement
		// « expérimental » sans les chaînes de licence (cf. weather-ai-notice.svelte).
		return undefined;
	} finally {
		await backend.close().catch(() => undefined);
	}
}

/** Métadonnée du run/échéance courants, ou `undefined` hors domaine IA. */
export const weatherAiMetadata: Writable<WeatherAiMetadata | undefined> = writable(undefined);

/** Clé du dernier fichier lu, pour ne pas refetcher à chaque scrub. */
let lastKey: string | undefined;

/**
 * Rafraîchit `weatherAiMetadata` pour le domaine/run/échéance courants. No-op (et
 * remise à `undefined`) hors `weather_ai_global`. Idempotent par fichier.
 */
export async function refreshWeatherAiMetadata(): Promise<void> {
	const domain = get(domainStore);
	if (domain !== WEATHER_AI_GLOBAL_DOMAIN) {
		lastKey = undefined;
		weatherAiMetadata.set(undefined);
		return;
	}
	const modelRun = get(mR);
	if (!modelRun) return;
	const validTime = get(timeStore);
	const omUrl = buildOmFileUrl(domain, modelRun, validTime);
	if (omUrl === lastKey) return;
	lastKey = omUrl;
	const meta = await readWeatherAiMetadata(omUrl);
	// Une bascule de domaine a pu survenir pendant la lecture : on n'écrase pas.
	if (get(domainStore) !== WEATHER_AI_GLOBAL_DOMAIN) return;
	weatherAiMetadata.set(meta);
}
