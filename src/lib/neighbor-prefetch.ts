import { get } from 'svelte/store';

import {
	NEIGHBOR_PREFETCH_BACKWARD,
	NEIGHBOR_PREFETCH_DEBOUNCE_MS,
	NEIGHBOR_PREFETCH_FORWARD
} from './constants';
import { prefetchData } from './prefetch';
import { metaJson, modelRun, time } from './stores/time';
import { layer2Enabled, selectedDomain, variable, variable2 } from './stores/variables';

export interface NeighborWindow {
	startDate: Date;
	endDate: Date;
}

/**
 * Calcule la plage contiguë d'échéances voisines à précharger autour de `currentTime`.
 *
 * Le sens et la contiguïté sont déduits des index de `currentTime`/`previousTime` dans
 * `validTimes` (pas sur les millisecondes — le pas temporel varie selon le domaine) :
 * - avancée d'un pas (delta = +1)  → [−backward, +forward]
 * - recul d'un pas   (delta = −1)  → [−forward, +backward]
 * - saut (|delta| > 1), premier chargement (previousTime null), ou previousTime absent
 *   de validTimes (ex. changement de run) → ±1 symétrique
 *
 * La plage est clampée aux bornes du run et inclut l'échéance courante (déjà en cache
 * → re-prefetch quasi gratuit). Retourne null si la grille est vide ou l'échéance absente.
 */
export const computeNeighborWindow = (
	currentTime: Date,
	previousTime: Date | null,
	validTimes: Date[],
	cfg: { forward: number; backward: number }
): NeighborWindow | null => {
	if (validTimes.length === 0) return null;

	const currentIdx = validTimes.findIndex((t) => t.getTime() === currentTime.getTime());
	if (currentIdx === -1) return null;

	const prevIdx =
		previousTime === null
			? -1
			: validTimes.findIndex((t) => t.getTime() === previousTime.getTime());
	const delta = prevIdx === -1 ? 0 : currentIdx - prevIdx;

	let before: number;
	let after: number;
	if (delta === 1) {
		before = cfg.backward;
		after = cfg.forward;
	} else if (delta === -1) {
		before = cfg.forward;
		after = cfg.backward;
	} else {
		before = 1;
		after = 1;
	}

	const startIdx = Math.max(0, currentIdx - before);
	const endIdx = Math.min(validTimes.length - 1, currentIdx + after);

	return {
		startDate: validTimes[startIdx],
		endDate: validTimes[endIdx]
	};
};

/**
 * Abonne le préchargement automatique au store `time`. À chaque changement d'échéance,
 * (re)arme un debounce ; à l'échéance du timer, précharge les données de la variable
 * affichée (+ variable2 si la couche 2 est active) sur la fenêtre voisine. Au plus un
 * run de fetch est actif — tout nouveau déclenchement annule le précédent via AbortController.
 *
 * Retourne une fonction de cleanup (désabonnement + clear timer + abort).
 */
export const initNeighborPrefetch = (): (() => void) => {
	let previousTime: Date | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | null = null;

	const triggerPrefetch = async () => {
		const meta = get(metaJson);
		const currentRun = get(modelRun);
		if (!meta || !currentRun) return;

		const current = get(time);
		const validTimes = meta.valid_times.map((vt: string) => new Date(vt));
		const neighborWindow = computeNeighborWindow(current, previousTime, validTimes, {
			forward: NEIGHBOR_PREFETCH_FORWARD,
			backward: NEIGHBOR_PREFETCH_BACKWARD
		});
		previousTime = new Date(current.getTime());
		if (!neighborWindow) return;

		controller?.abort();
		controller = new AbortController();
		const signal = controller.signal;

		const domain = get(selectedDomain).value;
		const base = {
			startDate: neighborWindow.startDate,
			endDate: neighborWindow.endDate,
			metaJson: meta,
			modelRun: currentRun,
			domain,
			signal
		};

		// Variable principale d'abord (couche visible), puis couche 2 si active.
		await prefetchData({ ...base, variable: get(variable) });
		if (signal.aborted) return;
		if (get(layer2Enabled)) {
			await prefetchData({ ...base, variable: get(variable2) });
		}
	};

	const unsubscribe = time.subscribe(() => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			void triggerPrefetch();
		}, NEIGHBOR_PREFETCH_DEBOUNCE_MS);
	});

	return () => {
		unsubscribe();
		clearTimeout(timer);
		controller?.abort();
	};
};
