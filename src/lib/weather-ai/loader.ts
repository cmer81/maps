// Chargement d'un run Weather AI hors écran, puis bascule atomique.
//
// Règles (guide d'intégration §8) : le run affiché reste en place tant que le
// nouveau n'est pas entièrement chargé et validé ; on ne complète jamais un run
// avec une frame d'un autre ; une erreur réseau ou de validation garde l'ancien
// run. Les données d'un run sont immuables : cache `<run_id>:<product_id>:<valid_time>`.
import {
	type Catalog,
	type DataResponse,
	type Runs,
	type Timeline,
	catalogUrl,
	dataUrl,
	getJson,
	runsUrl,
	timelineUrl
} from './api';
import { type GridProduct, type NormalizedGrid, mapValues, normalizeGrid } from './grid';
import { type DiscoveredProduct, type ProductKind, discoverProducts } from './products';

import type { TracksProduct } from './tracks';

export type FetchJson = <T>(url: string, signal?: AbortSignal) => Promise<T>;

/** Le catalogue a changé pendant le chargement : il faut recommencer toute la séquence. */
export class RunChangedError extends Error {
	constructor(detail: string) {
		super(`Le run a changé pendant le chargement (${detail})`);
		this.name = 'RunChangedError';
	}
}

export interface GridFrame {
	validTime: string;
	/** Valeurs dans l'unité d'affichage (hPa pour la pression, probabilité 0..1). */
	grid: NormalizedGrid;
}

export interface TracksFrame {
	validTime: string;
	product: TracksProduct;
}

export type LoadedProduct =
	| { kind: 'mslp' | 'existence'; product: DiscoveredProduct; frames: GridFrame[] }
	| { kind: 'tracks'; product: DiscoveredProduct; frames: TracksFrame[] };

export interface LoadedRun {
	runId: string;
	snapshotId: string;
	publishedAt: string;
	/** `init_time` lu dans `GET /runs` (à défaut, dans le produit trajectoires du même run). */
	initTime: string | undefined;
	/** Produits du catalogue que le front sait afficher. */
	available: DiscoveredProduct[];
	/** `product_id` du catalogue ignorés (rendu inconnu). */
	ignored: string[];
	/** Produits chargés et validés, par `product_id`. */
	loaded: Record<string, LoadedProduct>;
	/**
	 * Le catalogue annonce explicitement l'attente des cônes (`cones: null`, job
	 * `cone-members` en cours). Un champ absent est un retrait, pas une attente.
	 */
	conesAwaited?: boolean;
	/** Run de démonstration bundlé (mode `fixture`), jamais servi par l'API. */
	demo?: true;
}

const cache = new Map<string, GridFrame | TracksFrame>();
const cacheKey = (runId: string, productId: string, validTime: string) =>
	`${runId}:${productId}:${validTime}`;

/** Oublie les frames des runs qui ne sont plus affichés ni en cours de chargement. */
export function pruneCache(keepRunIds: string[]): void {
	for (const k of cache.keys()) {
		if (!keepRunIds.some((id) => k.startsWith(`${id}:`))) cache.delete(k);
	}
}

export const defaultFetchJson: FetchJson = (url, signal) => getJson(url, signal);

/** Identité commune à toutes les entrées du catalogue (refus si elles divergent). */
function catalogIdentity(catalog: Catalog): { runId: string; snapshotId: string } {
	if (catalog?.experimental !== true) throw new Error('Catalogue non expérimental');
	if (typeof catalog.run_id !== 'string' || !Array.isArray(catalog.produits)) {
		throw new Error('Catalogue invalide');
	}
	const snapshots = new Set(catalog.produits.map((p) => p.snapshot_id));
	if (snapshots.size !== 1) throw new Error('Catalogue invalide : snapshot_id multiples');
	for (const p of catalog.produits) {
		if (p.run_id !== catalog.run_id) throw new Error('Catalogue invalide : run_id mélangés');
		if (p.experimental !== true) throw new Error('Catalogue invalide : entrée non expérimentale');
	}
	return { runId: catalog.run_id, snapshotId: [...snapshots][0] };
}

function checkIdentity(
	doc: { run_id: string; snapshot_id: string; experimental: boolean },
	runId: string,
	snapshotId: string,
	what: string
) {
	if (doc.run_id !== runId || doc.snapshot_id !== snapshotId) throw new RunChangedError(what);
	if (doc.experimental !== true) throw new Error(`${what} : document non expérimental`);
}

/** Valide un document de grille et le convertit dans l'unité d'affichage. */
export function validateGrid(
	doc: GridProduct,
	product: DiscoveredProduct,
	validTime: string
): NormalizedGrid {
	const { spec } = product;
	if (!doc.schema_version?.startsWith(spec.schemaPrefix))
		throw new Error('Schéma de grille inattendu');
	if (doc.product_id !== product.productId || doc.valid_time !== validTime) {
		throw new Error('Document de grille inattendu');
	}
	if (doc.variable?.name !== spec.variable || doc.variable?.unit !== spec.unit) {
		throw new Error(`Variable ou unité inattendue (${doc.variable?.name}, ${doc.variable?.unit})`);
	}
	const grid = normalizeGrid(doc);
	if (spec.kind === 'mslp') return mapValues(grid, (pa) => pa / 100);
	// Probabilité bornée à [0, 1] par le schéma : une valeur hors bornes refuse le run.
	for (const v of grid.values) {
		if (Number.isFinite(v) && (v < 0 || v > 1)) throw new Error('Probabilité hors de [0, 1]');
	}
	return grid;
}

export function validateTracks(
	doc: TracksProduct,
	product: DiscoveredProduct,
	validTime: string
): TracksProduct {
	if (!doc.schema_version?.startsWith(product.spec.schemaPrefix)) {
		throw new Error('Schéma de trajectoires inattendu');
	}
	if (doc.product_id !== product.productId || doc.valid_time !== validTime) {
		throw new Error('Document de trajectoires inattendu');
	}
	if (doc.qualification?.alert_authority !== false || !Array.isArray(doc.tracks)) {
		throw new Error('Trajectoires invalides');
	}
	return doc;
}

/** Exécute `tasks` avec au plus `limit` requêtes simultanées. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
	const out: T[] = new Array(tasks.length);
	let next = 0;
	const worker = async () => {
		while (next < tasks.length) {
			const i = next++;
			out[i] = await tasks[i]();
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
	return out;
}

/**
 * Charge et valide toutes les frames d'un produit du run `runId`. Une frame
 * d'un autre run (catalogue basculé entre-temps) lève `RunChangedError`.
 */
export async function loadProduct(
	base: string,
	product: DiscoveredProduct,
	runId: string,
	snapshotId: string,
	signal: AbortSignal | undefined,
	fetchJson: FetchJson = defaultFetchJson
): Promise<LoadedProduct> {
	const id = product.productId;
	const tl = await fetchJson<Timeline>(timelineUrl(base, id), signal);
	if (tl.run_id !== runId || tl.snapshot_id !== snapshotId)
		throw new RunChangedError(`timeline ${id}`);
	const frames = [...tl.frames].sort((a, b) => a.valid_time.localeCompare(b.valid_time));
	if (frames.length === 0) throw new Error(`Timeline vide : ${id}`);
	for (const f of frames) {
		if (f.run_id !== runId || f.snapshot_id !== snapshotId)
			throw new RunChangedError(`frame ${id}`);
	}

	const loadFrame = async (validTime: string): Promise<GridFrame | TracksFrame> => {
		const key = cacheKey(runId, id, validTime);
		const hit = cache.get(key);
		if (hit) return hit;
		const res = await fetchJson<DataResponse<GridProduct & TracksProduct>>(
			dataUrl(base, id, validTime),
			signal
		);
		if (res.experimental !== true) throw new Error(`${id} : réponse non expérimentale`);
		checkIdentity(res.product, runId, snapshotId, `${id} ${validTime}`);
		const frame =
			product.spec.kind === 'tracks'
				? { validTime, product: validateTracks(res.product, product, validTime) }
				: { validTime, grid: validateGrid(res.product, product, validTime) };
		cache.set(key, frame);
		return frame;
	};

	const loaded = await pool(
		frames.map((f) => () => loadFrame(f.valid_time)),
		4
	);
	if (product.spec.kind === 'tracks') {
		return { kind: 'tracks', product, frames: loaded as TracksFrame[] };
	}
	return {
		kind: product.spec.kind as 'mslp' | 'existence',
		product,
		frames: loaded as GridFrame[]
	};
}

/** Lit `init_time` dans `GET /runs`, sur l'entrée du run et du snapshot du catalogue actif. */
export function initTimeFromRuns(
	runs: Runs,
	runId: string,
	snapshotId: string
): string | undefined {
	return runs?.runs?.find((r) => r.run_id === runId && r.snapshot_id === snapshotId)?.init_time;
}

/** Produits chargés d'office avec le run : les trajectoires (légères) servent aussi de repli pour `init_time`. */
const ALWAYS_LOADED: ProductKind[] = ['tracks'];

/**
 * Prépare un run complet hors écran : catalogue, `init_time`, et toutes les
 * frames des produits demandés (+ trajectoires). Renvoie le run prêt à être
 * affiché ; lève une erreur sinon (l'appelant garde alors le run affiché).
 */
export async function prepareRun(
	base: string,
	catalog: Catalog,
	wanted: ProductKind[],
	signal: AbortSignal | undefined,
	fetchJson: FetchJson = defaultFetchJson
): Promise<LoadedRun> {
	const { runId, snapshotId } = catalogIdentity(catalog);
	const { known, ignored } = discoverProducts(catalog);

	let initTime: string | undefined;
	try {
		initTime = initTimeFromRuns(await fetchJson<Runs>(runsUrl(base), signal), runId, snapshotId);
	} catch (err) {
		if ((err as Error).name === 'AbortError') throw err;
		// /runs indisponible : repli sur le produit trajectoires ci-dessous.
	}

	const kinds = new Set<ProductKind>([...wanted, ...ALWAYS_LOADED]);
	const toLoad = known.filter((p) => kinds.has(p.spec.kind) && p.spec.kind !== 'cones');
	const loadedList = await Promise.all(
		toLoad.map((p) => loadProduct(base, p, runId, snapshotId, signal, fetchJson))
	);
	const loaded: Record<string, LoadedProduct> = {};
	for (const p of loadedList) loaded[p.product.productId] = p;

	if (!initTime) {
		const tracks = loadedList.find((p) => p.kind === 'tracks');
		initTime = tracks?.kind === 'tracks' ? tracks.frames[0]?.product.init_time : undefined;
	}

	return {
		runId,
		snapshotId,
		publishedAt: catalog.published_at,
		initTime,
		available: known,
		ignored,
		loaded,
		conesAwaited: catalog.cones === null
	};
}

/**
 * Ajoute un produit au run affiché (couche activée après coup). Le chargement
 * vérifie le run : si le catalogue a basculé, `RunChangedError` impose un
 * rechargement complet plutôt qu'un mélange.
 */
export async function extendRun(
	base: string,
	run: LoadedRun,
	productId: string,
	signal: AbortSignal | undefined,
	fetchJson: FetchJson = defaultFetchJson
): Promise<LoadedRun> {
	const product = run.available.find((p) => p.productId === productId);
	if (!product || product.spec.kind === 'cones') return run;
	const loaded = await loadProduct(base, product, run.runId, run.snapshotId, signal, fetchJson);
	return { ...run, loaded: { ...run.loaded, [productId]: loaded } };
}

/**
 * Même run, catalogue relu : les cônes peuvent y apparaître après coup (calculés
 * par le job `cone-members`, après le catalogue du run), être remplacés ou
 * retirés. Renvoie le run avec l'entrée des cônes à jour, ou le même objet si
 * rien n'a changé. Les autres produits du run affiché ne bougent pas.
 */
export function withCatalogCones(run: LoadedRun, catalog: Catalog): LoadedRun {
	const sameSnapshot = catalogIdentity(catalog).snapshotId === run.snapshotId;
	const next = sameSnapshot
		? discoverProducts(catalog).known.find((p) => p.spec.kind === 'cones')
		: undefined;
	const conesAwaited = sameSnapshot && catalog.cones === null;
	const prev = run.available.find((p) => p.spec.kind === 'cones');
	if (
		prev?.sha256 === next?.sha256 &&
		prev?.validTime === next?.validTime &&
		!!run.conesAwaited === conesAwaited
	)
		return run;
	const others = run.available.filter((p) => p.spec.kind !== 'cones');
	return { ...run, available: next ? [...others, next] : others, conesAwaited };
}

export const fetchCatalog = (
	base: string,
	signal?: AbortSignal,
	fetchJson: FetchJson = defaultFetchJson
) => fetchJson<Catalog>(catalogUrl(base), signal);

/** Échéances proposées par le curseur : union triée des échéances des produits chargés. */
export function runValidTimes(run: LoadedRun): string[] {
	const set = new Set<string>();
	for (const p of Object.values(run.loaded)) for (const f of p.frames) set.add(f.validTime);
	return [...set].sort();
}

/** Échéance relative en heures depuis `init_time`, ou `undefined` sans `init_time`. */
export function leadHours(initTime: string | undefined, validTime: string): number | undefined {
	if (!initTime) return undefined;
	return Math.round((Date.parse(validTime) - Date.parse(initTime)) / 3_600_000);
}
