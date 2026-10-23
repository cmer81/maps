// Orchestration des couches Weather AI : relecture du catalogue toutes les
// 5 minutes, chargement hors écran d'un nouveau run puis bascule atomique,
// chargement à la demande d'une couche activée après coup (même run), cônes via
// leur adaptateur isolé (et relus quand ils apparaissent ou changent dans le même run). Démarré au premier besoin (onglet ouvert ou couche
// active), arrêté quand plus rien ne l'utilise.
import { get } from 'svelte/store';

import {
	type WeatherAiOverlay,
	weatherAiCones,
	weatherAiLayers,
	weatherAiRun,
	weatherAiStatus
} from '$lib/stores/weather-ai';

import { getWeatherAiApiUrl, getWeatherAiConesMode } from '$lib/runtime-env';

import { CONES_PRODUCT_ID, loadConesDocument, validateCones } from './cones';
import { loadDemoRun } from './demo';
import {
	type LoadedRun,
	RunChangedError,
	extendRun,
	fetchCatalog,
	prepareRun,
	pruneCache,
	withCatalogCones
} from './loader';

import type { ProductKind } from './products';

export const CATALOG_POLL_MS = 5 * 60 * 1000;

const isAbort = (err: unknown) => (err as Error)?.name === 'AbortError';

const enabledKinds = (): ProductKind[] =>
	(Object.entries(get(weatherAiLayers)) as [WeatherAiOverlay, boolean][])
		.filter(([, on]) => on)
		.map(([k]) => k);

let refreshCtl: AbortController | undefined;
let extendCtl: AbortController | undefined;
let conesCtl: AbortController | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let users = 0;
let unsubscribeLayers: (() => void) | undefined;

const errorMessage = (err: unknown) =>
	err instanceof TypeError
		? 'API Weather AI injoignable (réseau ou CORS)'
		: ((err as Error)?.message ?? String(err));

function commitRun(run: LoadedRun) {
	const prev = get(weatherAiRun);
	// L'échéance affichée découle de la frise principale (weatherAiFrame).
	weatherAiRun.set(run);
	if (prev?.runId !== run.runId) weatherAiCones.set(null);
	pruneCache([run.runId]);
}

/**
 * Relit le catalogue ; si le run actif a changé, prépare le nouveau hors écran
 * et ne bascule qu'une fois tout chargé et validé. Toute erreur garde le run
 * affiché.
 */
export async function refresh(retry = 0): Promise<void> {
	refreshCtl?.abort();
	const ctl = new AbortController();
	refreshCtl = ctl;
	const base = getWeatherAiApiUrl();
	const active = get(weatherAiRun);
	weatherAiStatus.set({ state: 'loading' });
	try {
		if (getWeatherAiConesMode() === 'fixture') {
			// Démonstration : run de référence bundlé, aucune requête à l'API.
			if (!active?.demo) commitRun(await loadDemoRun(ctl.signal));
			weatherAiStatus.set({ state: 'ready' });
			refreshCtl = undefined;
			await ensureEnabledLoaded();
			return;
		}
		const catalog = await fetchCatalog(base, ctl.signal);
		if (active && catalog.run_id === active.runId) {
			// Même run : seuls les cônes peuvent avoir changé (apparus en fin de cycle).
			const next = withCatalogCones(active, catalog);
			if (next !== active) {
				weatherAiRun.set(next);
				weatherAiCones.set(null);
			}
			weatherAiStatus.set({ state: 'ready' });
			refreshCtl = undefined;
			await ensureEnabledLoaded();
			return;
		}
		const run = await prepareRun(base, catalog, enabledKinds(), ctl.signal);
		if (ctl.signal.aborted) return;
		commitRun(run);
		weatherAiStatus.set({ state: 'ready' });
		// Réconciliation : une couche activée pendant la préparation (ignorée alors
		// par ensureEnabledLoaded) est chargée maintenant, pour ce même run.
		refreshCtl = undefined;
		await ensureEnabledLoaded();
	} catch (err) {
		if (isAbort(err)) return;
		if (err instanceof RunChangedError && retry === 0 && refreshCtl === ctl) {
			// Le catalogue a basculé pendant la séquence : on recommence une fois.
			refreshCtl = undefined;
			void refresh(1);
			return;
		}
		console.warn('[weather-ai] refresh failed', err);
		weatherAiStatus.set({ state: 'error', message: errorMessage(err) });
	} finally {
		if (refreshCtl === ctl) refreshCtl = undefined;
	}
}

/** Charge, pour le run affiché, les produits des couches activées qui ne le sont pas encore. */
async function ensureEnabledLoaded(): Promise<void> {
	const run = get(weatherAiRun);
	if (!run || refreshCtl) {
		if (!run && !refreshCtl) void refresh();
		return;
	}
	const kinds = new Set(enabledKinds());
	const missing = run.available.filter(
		(p) => kinds.has(p.spec.kind) && p.spec.kind !== 'cones' && !run.loaded[p.productId]
	);
	if (missing.length) {
		extendCtl?.abort();
		const ctl = new AbortController();
		extendCtl = ctl;
		weatherAiStatus.set({ state: 'loading' });
		try {
			let next = run;
			for (const p of missing) {
				next = await extendRun(getWeatherAiApiUrl(), next, p.productId, ctl.signal);
			}
			// Le run affiché a pu basculer pendant le chargement : on n'applique pas.
			if (get(weatherAiRun)?.runId !== run.runId) return;
			commitRun(next);
			weatherAiStatus.set({ state: 'ready' });
		} catch (err) {
			if (isAbort(err)) return;
			if (err instanceof RunChangedError) {
				void refresh();
				return;
			}
			console.warn('[weather-ai] layer load failed', err);
			weatherAiStatus.set({ state: 'error', message: errorMessage(err) });
		} finally {
			if (extendCtl === ctl) extendCtl = undefined;
		}
	}
	void syncCones();
}

/** Les cônes sont proposés si le flag le permet et que le catalogue les annonce (ou en mode fixture). */
export function conesOffered(run: LoadedRun | undefined): boolean {
	const mode = getWeatherAiConesMode();
	if (mode === 'off' || !run) return false;
	return mode === 'fixture' || run.available.some((p) => p.productId === CONES_PRODUCT_ID);
}

async function syncCones(): Promise<void> {
	const run = get(weatherAiRun);
	if (!run || !get(weatherAiLayers).cones || !conesOffered(run)) return;
	const sha256 = run.available.find((p) => p.productId === CONES_PRODUCT_ID)?.sha256;
	const current = get(weatherAiCones);
	if (current?.runId === run.runId && current.sha256 === sha256) return;
	conesCtl?.abort();
	const ctl = new AbortController();
	conesCtl = ctl;
	try {
		const doc = await loadConesDocument(run, getWeatherAiApiUrl(), ctl.signal);
		// Run ou document des cônes remplacé pendant la lecture : on n'applique pas.
		const now = get(weatherAiRun);
		if (now?.runId !== run.runId) return;
		if (now.available.find((p) => p.productId === CONES_PRODUCT_ID)?.sha256 !== sha256) return;
		const refusal = doc
			? validateCones(doc, { runId: run.runId, snapshotId: run.snapshotId })
			: 'aucun document de cônes pour ce run';
		weatherAiCones.set({
			runId: run.runId,
			sha256,
			doc: refusal ? null : doc,
			message: refusal ?? undefined
		});
	} catch (err) {
		if (isAbort(err)) return;
		weatherAiCones.set({ runId: run.runId, sha256, doc: null, message: errorMessage(err) });
	}
}

/**
 * Déclare un utilisateur des couches (onglet monté, couche active…). Le premier
 * démarre le chargement et la relecture périodique ; renvoie la fonction de
 * libération.
 */
export function useWeatherAi(): () => void {
	users++;
	if (users === 1) {
		void refresh();
		pollTimer = setInterval(() => void refresh(), CATALOG_POLL_MS);
		let first = true;
		unsubscribeLayers = weatherAiLayers.subscribe(() => {
			if (first) {
				first = false;
				return;
			}
			void ensureEnabledLoaded();
		});
	}
	return () => {
		users--;
		if (users > 0) return;
		clearInterval(pollTimer);
		pollTimer = undefined;
		unsubscribeLayers?.();
		refreshCtl?.abort();
		extendCtl?.abort();
		conesCtl?.abort();
	};
}
