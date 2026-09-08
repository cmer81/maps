import { get, writable } from 'svelte/store';

import {
	type Catalog,
	type Frame,
	type ProductResponse,
	type Run,
	type Step,
	TRACKS_PRODUCT,
	availableSteps,
	chooseLead,
	isTracks,
	parseCatalog,
	parseProduct,
	parseRuns
} from './products';

export interface ForecastState {
	status: 'idle' | 'loading' | 'ready' | 'error';
	error?: string;
	historyError?: string;
	notice?: string;
	runs: Run[];
	run?: Run;
	catalog?: Catalog;
	productId: string;
	leadHours?: number;
	steps: Step[];
	data: ProductResponse[];
	member?: number;
	selectedTrack?: string;
}
const initial: ForecastState = {
	status: 'idle',
	runs: [],
	productId: TRACKS_PRODUCT,
	steps: [],
	data: []
};
export function createWeatherAiStore(
	fetcher: typeof fetch = (...args) => fetch(...args),
	base = '/api/weather-ai'
) {
	const state = writable<ForecastState>({ ...initial });
	let controller: AbortController | undefined,
		generation = 0;
	let requestedRun: string | undefined, initialValidTime: string | undefined;
	const cache = new Map<string, ProductResponse>();
	const begin = () => {
		controller?.abort();
		controller = new AbortController();
		return { signal: controller.signal, token: ++generation };
	};
	const read = async (path: string, signal: AbortSignal) => {
		let res: Response;
		try {
			res = await fetcher(base + path, { signal });
		} catch (e) {
			if (signal.aborted) throw e;
			throw new Error('Connexion à l’API indisponible. Vérifiez votre connexion puis réessayez.');
		}
		if (!res.ok) throw new Error(`Impossible de charger les prévisions (HTTP ${res.status}).`);
		return res.json();
	};
	const error = (e: unknown, token: number) => {
		if (token === generation)
			state.update((s) => ({
				...s,
				status: 'error',
				error: e instanceof Error ? e.message : 'Erreur de connexion à l’API.',
				data: []
			}));
	};
	const readFrame = async (frame: Frame, signal: AbortSignal) => {
		const key = JSON.stringify([
			frame.run_id,
			frame.product_id,
			frame.valid_time,
			frame.snapshot_id
		]);
		const cached = cache.get(key);
		if (cached) return cached;
		const query = new URLSearchParams({ run_id: frame.run_id, valid_time: frame.valid_time });
		const data = parseProduct(
			await read(`/products/${encodeURIComponent(frame.product_id)}/data?${query}`, signal)
		);
		const p = data.product;
		if (
			p.run_id !== frame.run_id ||
			p.product_id !== frame.product_id ||
			p.snapshot_id !== frame.snapshot_id ||
			Date.parse(p.valid_time) !== Date.parse(frame.valid_time)
		)
			throw new Error('La réponse API ne correspond pas à la prévision sélectionnée.');
		if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
		cache.set(key, data);
		while (cache.size > 32) cache.delete(cache.keys().next().value!);
		return data;
	};
	async function loadData() {
		const s = get(state);
		const { token, signal } = begin();
		state.update((s) => ({ ...s, status: 'loading', error: undefined, data: [] }));
		if (!s.catalog || !s.run || s.leadHours === undefined) {
			state.update((s) => ({ ...s, status: 'ready' }));
			return;
		}
		const step = s.steps.find((t) => t.leadHours === s.leadHours);
		const frames = s.catalog.produits.filter(
			(f) =>
				f.product_id === s.productId &&
				(s.productId === TRACKS_PRODUCT
					? s.steps.some((t) => Date.parse(t.validTime) === Date.parse(f.valid_time))
					: Date.parse(f.valid_time) === Date.parse(step?.validTime ?? ''))
		);
		try {
			const data = await Promise.all(frames.map((f) => readFrame(f, signal)));
			if (token !== generation) return;
			if (
				data.some(
					(d) =>
						isTracks(d.product) && Date.parse(d.product.init_time) !== Date.parse(s.run!.init_time)
				)
			)
				throw new Error('Initialisation incohérente dans les trajectoires candidates.');
			state.update((s) => ({ ...s, status: 'ready', data }));
		} catch (e) {
			error(e, token);
		}
	}
	async function loadCatalog(runId?: string, history = false) {
		requestedRun = runId;
		const { token, signal } = begin();
		const previous = get(state);
		state.update((s) => ({
			...s,
			status: 'loading',
			error: undefined,
			notice: undefined,
			catalog: undefined,
			data: [],
			steps: [],
			run: undefined
		}));
		try {
			const [catalogResult, runsResult] = await Promise.allSettled([
				read(`/products${runId ? '?' + new URLSearchParams({ run_id: runId }) : ''}`, signal).then(
					parseCatalog
				),
				history ? read('/runs', signal).then(parseRuns) : Promise.resolve(previous.runs)
			]);
			if (token !== generation) return;
			if (catalogResult.status === 'rejected') throw catalogResult.reason;
			const catalog = catalogResult.value;
			if (runId && catalog.run_id !== runId)
				throw new Error('Le catalogue ne correspond pas à la publication sélectionnée.');
			let runs = runsResult.status === 'fulfilled' ? runsResult.value : previous.runs;
			const historyError =
				runsResult.status === 'rejected'
					? 'Historique indisponible. La publication courante reste consultable.'
					: undefined;
			let run = runs.find((r) => r.run_id === catalog.run_id);
			// The catalog has no init_time. Use explicit API metadata; never parse run_id or published_at.
			if (!run) {
				const frame = catalog.produits.find((f) => f.product_id === TRACKS_PRODUCT);
				if (frame) {
					const d = await readFrame(frame, signal);
					if (isTracks(d.product))
						run = {
							run_id: catalog.run_id,
							init_time: d.product.init_time,
							published_at: catalog.published_at
						};
				}
			}
			if (token !== generation) return;
			if (!run && catalog.produits.length)
				throw new Error('Date d’initialisation indisponible. Réessayez de charger l’historique.');
			if (run) {
				run = { ...run, published_at: catalog.published_at };
				if (!runs.some((r) => r.run_id === run!.run_id)) runs = [run, ...runs];
			}
			const ids = [...new Set(catalog.produits.map((f) => f.product_id))];
			const productId = ids.includes(previous.productId)
				? previous.productId
				: (ids[0] ?? previous.productId);
			const steps = run ? availableSteps(catalog, run.init_time) : [];
			const requestedLead =
				initialValidTime && run
					? (Date.parse(initialValidTime) - Date.parse(run.init_time)) / 3600000
					: previous.leadHours;
			initialValidTime = undefined;
			const leadHours = chooseLead(requestedLead, steps);
			const notices: string[] = [];
			if (ids.length && productId !== previous.productId)
				notices.push(
					previous.productId === TRACKS_PRODUCT
						? 'Aucune trajectoire candidate disponible pour cette initialisation.'
						: 'Le produit précédent n’est pas disponible pour cette initialisation.'
				);
			if (
				previous.leadHours !== undefined &&
				leadHours !== undefined &&
				previous.leadHours !== leadHours
			)
				notices.push(`Échéance ajustée à +${leadHours} h, la plus proche disponible.`);
			state.update((s) => ({
				...s,
				catalog,
				run,
				runs,
				historyError,
				productId,
				steps,
				leadHours,
				selectedTrack: undefined,
				notice: notices.join(' ') || undefined
			}));
			await loadData();
		} catch (e) {
			error(e, token);
		}
	}
	return {
		subscribe: state.subscribe,
		start: (options?: { runId?: string; productId?: string; validTime?: string }) => {
			initialValidTime = options?.validTime;
			if (options?.productId) state.update((s) => ({ ...s, productId: options.productId! }));
			return loadCatalog(options?.runId, true);
		},
		selectRun: (id: string) => loadCatalog(id),
		selectProduct: async (productId: string) => {
			if (!get(state).catalog?.produits.some((f) => f.product_id === productId)) return;
			state.update((s) => ({ ...s, productId, selectedTrack: undefined, notice: undefined }));
			await loadData();
		},
		selectLead: async (leadHours: number) => {
			if (!get(state).steps.some((s) => s.leadHours === leadHours)) return;
			state.update((s) => ({ ...s, leadHours }));
			await loadData();
		},
		selectMember: (member?: number) =>
			state.update((s) => ({ ...s, member, selectedTrack: undefined })),
		selectTrack: (selectedTrack?: string) => state.update((s) => ({ ...s, selectedTrack })),
		retry: () => (get(state).catalog ? loadData() : loadCatalog(requestedRun, true)),
		refreshHistory: () => loadCatalog(get(state).run?.run_id, true),
		destroy: () => {
			generation++;
			controller?.abort();
			cache.clear();
		}
	};
}
export const weatherAi = createWeatherAiStore();
