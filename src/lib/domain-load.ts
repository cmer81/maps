import { DomainUnavailableError } from '$lib/metadata';

export interface DomainLoaderDeps {
	/** Charge les métadonnées initiales du domaine courant (`getInitialMetaData`) ;
	 *  `false` : la sélection a changé pendant la requête, rien n'a été écrit. */
	load: () => Promise<boolean>;
	/** Domaine actuellement sélectionné (valeur du store au moment de l'appel). */
	currentDomain: () => string;
	labelOf: (domain: string) => string;
	warn: (message: string) => void;
	/** Sélectionne un autre domaine (repli). */
	switchTo: (domain: string) => void;
	defaultDomain: string;
}

/** `loaded` : métadonnées chargées ; `unavailable` : rien de publié, repli
 *  effectué ; `stale` : réponse (succès ou erreur) d'un chargement dépassé, ignorée. */
export type DomainLoadResult = 'loaded' | 'unavailable' | 'stale';

/**
 * Chargement des métadonnées à chaque sélection de domaine, avec repli quand le
 * domaine n'a encore rien publié (`DomainUnavailableError`, premier run Weather
 * AI). Chaque appel reçoit une génération : seule la dernière sélection, encore
 * courante quand sa réponse arrive, peut afficher l'avertissement et changer de
 * domaine. Une réponse tardive d'un domaine déjà quitté ne reprend donc pas la
 * main sur le choix suivant (Weather AI → ECMWF : le 404 tardif de Weather AI
 * n'annule pas ECMWF).
 */
export function createDomainLoader(deps: DomainLoaderDeps) {
	let generation = 0;
	let lastAvailable: string | undefined;

	return async function loadDomain(domain: string): Promise<DomainLoadResult> {
		const id = ++generation;
		const isCurrent = () => id === generation && deps.currentDomain() === domain;
		let loaded: boolean;
		try {
			loaded = await deps.load();
		} catch (e) {
			// Erreur d'une sélection déjà quittée : elle ne concerne plus la carte.
			if (!isCurrent()) return 'stale';
			if (!(e instanceof DomainUnavailableError)) throw e;
			const fallback =
				lastAvailable && lastAvailable !== domain ? lastAvailable : deps.defaultDomain;
			deps.warn(`${e.message} Retour à ${deps.labelOf(fallback)}.`);
			if (fallback !== domain) deps.switchTo(fallback);
			return 'unavailable';
		}
		if (!loaded || !isCurrent()) return 'stale';
		lastAvailable = domain;
		return 'loaded';
	};
}
