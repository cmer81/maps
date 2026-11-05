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

import {
	CONES_PRODUCT_ID,
	type PreviousCones,
	keepPreviousCones,
	loadConesDocument,
	loadPreviousConesDocument,
	previousEntryKey,
	seedPreviousCones,
	validateCones
} from './cones';
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
/**
 * Derniers cônes validés de la session (mémoire seule) : au passage sur un run
 * qui n'a pas encore les siens, ceux du run précédent restent affichés.
 */
let lastCones: PreviousCones | null = null;
let unsubscribeLayers: (() => void) | undefined;

const errorMessage = (err: unknown) =>
	err instanceof TypeError
		? 'API Weather AI injoignable (réseau ou CORS)'
		: ((err as Error)?.message ?? String(err));

function commitRun(run: LoadedRun) {
	const prev = get(weatherAiRun);
	// L'échéance affichée découle de la frise principale (weatherAiFrame).
	weatherAiRun.set(run);
	if (prev?.runId !== run.runId) {
		const previous = run.demo ? null : keepPreviousCones(lastCones, prev?.runId, run);
		// Mémoire invalidée dès qu'elle ne couvre pas ce passage (retour vers un run
		// plus ancien, run mémorisé qui n'est pas le précédent immédiat, retrait) :
		// elle ne peut plus resurgir plus tard.
		if (!previous) lastCones = null;
		weatherAiCones.set(previous ? { runId: run.runId, doc: null, previous } : null);
	}
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
				const entry = next.available.find((p) => p.productId === CONES_PRODUCT_ID);
				// Cônes de ce run retirés ou remplacés : leur mémoire ne vaut plus.
				if (lastCones?.runId === next.runId && lastCones.sha256 !== entry?.sha256) {
					lastCones = null;
				}
				// Ni attente explicite ni cônes annoncés : retrait, le repli s'efface.
				const withdrawn = !entry && !next.conesAwaited;
				if (withdrawn) lastCones = null;
				// Sinon, les cônes d'un run antérieur restent jusqu'à la validation de ceux du run.
				// Ceux amorcés depuis `cones_previous` suivent ce champ : changé ou retiré, ils partent.
				weatherAiCones.update((c) =>
					!withdrawn &&
					c?.previous &&
					c.runId === next.runId &&
					(!c.previous.seeded || seedKey(next) === c.seededFrom)
						? { runId: c.runId, doc: null, previous: c.previous, seededFrom: c.seededFrom }
						: null
				);
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

/**
 * Identité complète de l'entrée `cones_previous` du run (run, snapshot,
 * `valid_time`, amorce, document, calibration, crédits) : une seule lecture par
 * entrée, et tout changement fait partir les cônes amorcés et relire la nouvelle.
 */
const seedKey = (run: LoadedRun) => previousEntryKey(run.conesPrevious);

/**
 * Les cônes sont proposés si le flag le permet et que le catalogue les annonce
 * (ou en mode fixture), si ceux du run précédent sont gardés pour ce run, ou si
 * `cones_previous` les annonce et n'a pas encore été lu.
 */
export function conesOffered(run: LoadedRun | undefined, cones = get(weatherAiCones)): boolean {
	const mode = getWeatherAiConesMode();
	if (mode === 'off' || !run) return false;
	if (cones?.previous && cones.runId === run.runId) return true;
	// `cones_previous` annoncés et pas encore lus (une lecture refusée ne propose plus rien).
	if (mode === 'on' && run.conesPrevious && cones?.seededFrom !== seedKey(run)) return true;
	return mode === 'fixture' || run.available.some((p) => p.productId === CONES_PRODUCT_ID);
}

/** Retour à l'état initial de la mémoire de session (tests). */
export function forgetSessionCones(): void {
	lastCones = null;
}

async function syncCones(): Promise<void> {
	const run = get(weatherAiRun);
	if (!run || !get(weatherAiLayers).cones || !conesOffered(run)) return;
	const entry = run.available.find((p) => p.productId === CONES_PRODUCT_ID);
	const sha256 = entry?.sha256;
	const current = get(weatherAiCones);
	// Cônes du run précédent gardés, et rien d'annoncé pour ce run : rien à lire.
	if (!entry && current?.previous && current.runId === run.runId) return;
	if (!entry) {
		// Rien en mémoire : amorçage depuis `cones_previous` (premier chargement).
		if (run.conesPrevious && getWeatherAiConesMode() === 'on') await seedCones(run);
		return;
	}
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
			? validateCones(doc, {
					runId: run.runId,
					snapshotId: run.snapshotId,
					calibrationStatus: entry?.calibrationStatus
				})
			: 'aucun document de cônes pour ce run';
		if (!refusal && doc && entry && getWeatherAiConesMode() === 'on') {
			lastCones = {
				runId: run.runId,
				snapshotId: run.snapshotId,
				sha256,
				calibrationStatus: entry.calibrationStatus,
				attribution: entry.attribution,
				licenseNotice: entry.licenseNotice,
				doc
			};
		}
		weatherAiCones.set({
			runId: run.runId,
			sha256,
			doc: refusal ? null : doc,
			message: refusal ?? undefined,
			// Refus : les cônes du run précédent, s'il y en a, restent affichés.
			previous: refusal ? previousFor(run.runId) : undefined
		});
	} catch (err) {
		if (isAbort(err)) return;
		weatherAiCones.set({
			runId: run.runId,
			sha256,
			doc: null,
			message: errorMessage(err),
			previous: previousFor(run.runId)
		});
	}
}

/**
 * Premier chargement pendant le calcul des cônes du run affiché (`cones: null`) :
 * lit le document annoncé par `cones_previous` et l'affiche dans le slot
 * « précédent » (rendu atténué, mention du run), jamais comme les cônes du run.
 * Un 404, une erreur ou une incohérence n'affichent rien, sans message : le run
 * reste sans cônes comme avant. Une seule lecture par entrée (`seededFrom`).
 */
async function seedCones(run: LoadedRun): Promise<void> {
	const entry = run.conesPrevious;
	const key = seedKey(run);
	if (!entry || !key) return;
	const current = get(weatherAiCones);
	if (current?.runId === run.runId && current.seededFrom === key) return;
	conesCtl?.abort();
	const ctl = new AbortController();
	conesCtl = ctl;
	let previous: PreviousCones | null = null;
	try {
		const doc = await loadPreviousConesDocument(entry, getWeatherAiApiUrl(), ctl.signal);
		previous = seedPreviousCones(entry, doc, run);
	} catch (err) {
		if (isAbort(err)) return;
		console.warn('[weather-ai] cônes précédents non chargés', err);
	}
	// Run, entrée, ou cônes du run publiés pendant la lecture : on n'applique pas.
	const now = get(weatherAiRun);
	if (now?.runId !== run.runId || seedKey(now) !== key) return;
	if (now.available.some((p) => p.productId === CONES_PRODUCT_ID)) return;
	weatherAiCones.set({
		runId: run.runId,
		doc: null,
		seededFrom: key,
		...(previous ? { previous } : {})
	});
}

function previousFor(runId: string): PreviousCones | undefined {
	const c = get(weatherAiCones);
	return c?.runId === runId ? c.previous : undefined;
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
