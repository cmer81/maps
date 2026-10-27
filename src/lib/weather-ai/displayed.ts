// Ce qui est RÉELLEMENT affiché sur la carte, distinct de la sélection : après
// un délai dépassé (`timeout`), la carte garde l'état précédent, et les mentions
// (run, échéance, UTC) doivent décrire cet état-là, pas celui demandé.
import { CONES_PRODUCT_ID, type ConesProduct, type PreviousCones } from './cones';
import { type LoadedRun, leadHours } from './loader';
import { formatLead, formatUtc } from './render';

import type { FrameRelation, ResolvedFrame } from './frame';
import type { CommitResult } from './layer-switcher';

export interface DisplayedState {
	runId: string;
	validTime: string;
	initTime: string | undefined;
	demo: boolean;
	/**
	 * Cônes montrés par le slot affiché : document (calibration) et, pour ceux
	 * d'un run antérieur, leur run. Les mentions des cônes viennent d'ici, jamais
	 * du store des cônes, qui peut déjà porter ceux d'un slot pas encore montré,
	 * ni du catalogue, qui peut déjà les avoir retirés (`credits` : attribution et
	 * licence lues au commit, ceux du run des cônes).
	 */
	cones?: {
		doc: ConesProduct;
		previous?: PreviousCones;
		credits?: { attribution: string; licenseNotice: string };
	};
}

/** Cônes que `preparePlan` met dans le slot pour cette entrée (mêmes conditions). */
export function displayedCones(input: {
	run: LoadedRun | undefined;
	layers?: { cones: boolean };
	cones?: ConesProduct | null;
	previous?: PreviousCones | null;
}): DisplayedState['cones'] {
	const { run, layers, cones, previous } = input;
	if (!run || !layers?.cones) return undefined;
	if (cones && cones.run_id === run.runId) {
		const entry = run.available.find((p) => p.productId === CONES_PRODUCT_ID);
		const credits = entry && { attribution: entry.attribution, licenseNotice: entry.licenseNotice };
		return { doc: cones, credits };
	}
	if (previous && previous.runId !== run.runId)
		return { doc: previous.doc, previous, credits: previous };
	return undefined;
}

/**
 * État affiché après un commit : seul un slot réellement montré ou effacé le
 * change, et il n'y a rien d'affiché dès qu'aucun slot n'existe plus sur la
 * carte (`hasActiveSlot` faux : re-style, démontage), quel que soit le résultat.
 */
export function displayedAfterCommit(
	result: CommitResult,
	input: {
		run: LoadedRun | undefined;
		vt: string | undefined;
		layers?: { cones: boolean };
		cones?: ConesProduct | null;
		previous?: PreviousCones | null;
	},
	prev: DisplayedState | null,
	hasActiveSlot: boolean
): DisplayedState | null {
	if (!hasActiveSlot) return null;
	if (result === 'shown') {
		return input.run && input.vt
			? {
					runId: input.run.runId,
					validTime: input.vt,
					initTime: input.run.initTime,
					demo: !!input.run.demo,
					cones: displayedCones(input)
				}
			: null;
	}
	if (result === 'cleared') return null;
	return prev; // stale, unchanged, timeout : la carte n'a pas changé
}

export interface CardSummary {
	/**
	 * État réellement affiché : échéance, run ET initialisation viennent de
	 * `weatherAiDisplayed`, jamais de la sélection (qui peut être en chargement,
	 * en échec, ou appartenir à un run en préparation).
	 */
	shown?: {
		lead: string;
		utc: string;
		runId: string;
		init?: string;
		elapsed: boolean;
		demo: boolean;
	};
	/** La sélection n'est pas (encore) celle affichée. */
	pending: boolean;
	/** Échéance demandée par la frise quand elle n'est pas celle affichée. */
	requested?: { lead: string; utc: string; runId: string; sameRun: boolean };
	/**
	 * L'heure de la frise tombe entre deux échéances ET l'échéance précédente
	 * demandée est bien celle affichée (sinon on ne l'affirme pas).
	 */
	betweenShown: boolean;
	/** Erreur à montrer, qu'un run soit affiché ou non. */
	error?: string;
	/** Position de l'heure de la frise par rapport aux échéances Weather AI (sélection). */
	relation: FrameRelation;
	/** Horizon du run Weather AI demandé, ex. « +6 h à +72 h, 18/10 12:00 → 21/10 06:00 UTC ». */
	horizon?: string;
}

export function cardSummary(
	displayed: DisplayedState | null,
	selected: { runId: string | undefined; validTime: string | undefined },
	status: { state: string; message?: string },
	now: number,
	frame: ResolvedFrame = { relation: 'none' },
	initTime?: string
): CardSummary {
	const h = frame.horizon;
	const pending =
		!!selected.validTime &&
		(displayed?.runId !== selected.runId || displayed?.validTime !== selected.validTime);
	const summary: CardSummary = {
		relation: frame.relation,
		horizon: h
			? `${formatLead(leadHours(initTime, h.first))} à ${formatLead(leadHours(initTime, h.last))}, ${formatUtc(h.first).replace(' UTC', '')} → ${formatUtc(h.last)}`
			: undefined,
		pending,
		betweenShown: frame.relation === 'between' && !!displayed && !pending,
		error: status.state === 'error' ? status.message : undefined
	};
	if (displayed) {
		summary.shown = {
			lead: formatLead(leadHours(displayed.initTime, displayed.validTime)),
			utc: formatUtc(displayed.validTime),
			runId: displayed.runId,
			init: displayed.initTime ? formatUtc(displayed.initTime) : undefined,
			elapsed: Date.parse(displayed.validTime) < now,
			demo: displayed.demo
		};
	}
	if (pending && selected.validTime && selected.runId) {
		summary.requested = {
			lead: formatLead(leadHours(initTime, selected.validTime)),
			utc: formatUtc(selected.validTime),
			runId: selected.runId,
			sameRun: displayed?.runId === selected.runId
		};
	}
	return summary;
}
