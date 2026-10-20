import { get } from 'svelte/store';

import { type DomainMetaDataJson, VARIABLE_PREFIX } from '@openmeteo/weather-map-layer';

import { loading } from '$lib/stores/preferences';
import { inProgress as iP, latest as l, metaJson as mJ, modelRun as mR } from '$lib/stores/time';
import { domain as d, selectedDomain, variable as v } from '$lib/stores/variables';

import { DOMAIN_DEFAULT_VARIABLES } from '$lib/constants';

import { fmtModelRun, getBaseUri } from './helpers';

/** Réponse de métadonnées arrivée après un changement de domaine ou de run :
 *  elle ne décrit plus la carte et n'est écrite dans aucun store. */
export class StaleMetadataError extends Error {
	constructor() {
		super('Métadonnées périmées (domaine ou run changé pendant la requête)');
	}
}

// Sélections successives du domaine. Une requête de métadonnées n'écrit dans les
// stores globaux (`latest`, `inProgress`) que si la sélection n'a pas changé
// depuis son départ : sans cette garde, la réponse tardive de l'ancien domaine
// écrasait celle du nouveau (run 12Z d'AROME pris pour ECMWF IFS, fond vide).
// Le relevé périodique du même domaine ne change pas la sélection : il ne rend
// donc pas périmé un chargement en cours.
let domainSelection = 0;
d.subscribe(() => {
	domainSelection++;
});

/**
 * Charge `latest.json` et `in-progress.json` du domaine sélectionné. Renvoie
 * `false`, sans rien écrire ni lever, si le domaine a changé entre-temps (y
 * compris en cas d'erreur HTTP : l'erreur concerne un domaine déjà quitté).
 */
export const getInitialMetaData = async (): Promise<boolean> => {
	const selection = domainSelection;
	const isCurrent = () => selection === domainSelection;
	const domain = get(selectedDomain);
	const uri = getBaseUri(domain.value);

	const [latestRes, inProgressRes] = await Promise.all([
		fetch(`${uri}/data_spatial/${domain.value}/latest.json`),
		fetch(`${uri}/data_spatial/${domain.value}/in-progress.json`)
	]);

	for (const res of [latestRes, inProgressRes]) {
		if (!isCurrent()) return false;
		if (!res.ok) {
			loading.set(false);
			throw new Error(`HTTP ${res.status}`);
		}
		const json = await res.json();
		if (!isCurrent()) return false;
		if (res.url.includes('latest.json')) l.set(json);
		if (res.url.includes('in-progress.json')) iP.set(json);
	}
	return true;
};

const toDate = (dateString: string | undefined): Date | undefined =>
	dateString ? new Date(dateString) : undefined;

const matchesModelRun = (referenceTime: Date | undefined, modelRun: Date): boolean =>
	referenceTime?.getTime() === modelRun.getTime();

const fetchMetaData = async (
	uri: string,
	domain: string,
	modelRun: Date
): Promise<DomainMetaDataJson> => {
	const url = `${uri}/data_spatial/${domain}/${fmtModelRun(modelRun)}/meta.json`;
	const res = await fetch(url);

	// `loading` n'est remis à zéro qu'après le contrôle de péremption (getMetaData) :
	// le 404 d'un run déjà quitté ne doit pas masquer le chargement en cours.
	if (!res.ok) throw new Error(`HTTP ${res.status}`);

	return res.json();
};

/**
 * Métadonnées du run sélectionné (`latest`, `inProgress` ou `meta.json` d'un run
 * passé). Lève `StaleMetadataError` si le domaine ou le run a changé pendant la
 * lecture du `meta.json` : l'appelant ne doit alors rien écrire.
 */
export const getMetaData = async (): Promise<DomainMetaDataJson> => {
	const selection = domainSelection;
	const domain = get(d);
	const uri = getBaseUri(domain);

	const latest = get(l);
	const latestReferenceTime = toDate(latest?.reference_time);

	if (get(mR) === undefined) {
		mR.set(latestReferenceTime);
	}
	const modelRun = get(mR) as Date;
	const isStale = () => selection !== domainSelection || get(mR)?.getTime() !== modelRun.getTime();

	const inProgress = get(iP);
	const inProgressReferenceTime = toDate(inProgress?.reference_time);

	const result: DomainMetaDataJson = matchesModelRun(latestReferenceTime, modelRun)
		? (latest as DomainMetaDataJson)
		: matchesModelRun(inProgressReferenceTime, modelRun)
			? (inProgress as DomainMetaDataJson)
			: await fetchMetaData(uri, domain, modelRun).catch((e: unknown) => {
					// Erreur d'un run ou d'un domaine déjà quitté : périmée aussi, sans
					// toucher à l'état de la sélection courante.
					if (isStale()) throw new StaleMetadataError();
					loading.set(false);
					throw e;
				});
	if (isStale()) throw new StaleMetadataError();

	result.valid_times.sort();
	return result;
};

export const matchVariableOrFirst = () => {
	const variable = get(v);
	const metaJson = get(mJ);
	if (!metaJson || metaJson.variables.includes(variable)) return;
	if (variable === 'temperature_2m_anomaly') return;

	let matched: string | undefined;
	const prefix = variable.match(VARIABLE_PREFIX)?.groups?.prefix;

	if (prefix) {
		matched = metaJson.variables.find((mv) => mv.startsWith(prefix));
	}

	// Défaut par domaine (ex. arome_france_convection → radar_reflectivity) avant le
	// fallback `variables[0]`, à condition que la variable préférée soit publiée.
	const domainDefault = DOMAIN_DEFAULT_VARIABLES[get(d)];
	if (!matched && domainDefault && metaJson.variables.includes(domainDefault)) {
		matched = domainDefault;
	}

	v.set(matched ?? metaJson.variables[0]);
};
