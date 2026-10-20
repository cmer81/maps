import { get } from 'svelte/store';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loading } from '$lib/stores/preferences';
import { inProgress, latest, modelRun } from '$lib/stores/time';
import { domain } from '$lib/stores/variables';

import { StaleMetadataError, getInitialMetaData, getMetaData } from '$lib/metadata';

// Deux domaines upstream (bucket Open-Meteo), runs distincts : 06Z pour ECMWF,
// 12Z pour ICON. La course de prod : la réponse tardive de l'ancien domaine
// écrasait `latest` du nouveau, dont le run devenait celui de l'autre modèle.
const RUNS: Record<string, string> = {
	ecmwf_ifs025: '2026-10-19T06:00:00Z',
	dwd_icon: '2026-10-19T12:00:00Z'
};
const meta = (reference: string) => ({
	completed: true,
	last_modified_time: reference,
	reference_time: reference,
	valid_times: [reference],
	variables: ['pressure_msl']
});
/** Issue d'une promesse capturée dès sa création (pas de rejet non géré). */
const outcome = <T>(p: Promise<T>) =>
	p.then(
		(value) => ({ value }),
		(error: unknown) => ({ error })
	);
/** Run décrit par la réponse : celui du chemin pour un meta.json, sinon le
 *  dernier run du domaine (latest.json / in-progress.json). */
const referenceOf = (url: string) => {
	const run = url.match(/\/(\d{4})\/(\d\d)\/(\d\d)\/(\d\d)(\d\d)Z\/meta\.json$/);
	return run ? `${run[1]}-${run[2]}-${run[3]}T${run[4]}:${run[5]}:00Z` : RUNS[domainOf(url)];
};
const domainOf = (url: string) => url.split('/data_spatial/')[1].split('/')[0];

/** Faux bucket : chaque réponse attend d'être libérée à la main (`release`). */
function deferredBucket() {
	const requests: { url: string; release: (status?: number) => void }[] = [];
	vi.stubGlobal(
		'fetch',
		(url: string) =>
			new Promise<Response>((resolve) => {
				requests.push({
					url,
					release: (status = 200) => {
						const body = status === 200 ? JSON.stringify(meta(referenceOf(url))) : '';
						resolve(Object.defineProperty(new Response(body, { status }), 'url', { value: url }));
					}
				});
			})
	);
	const flush = () => new Promise((r) => setTimeout(r, 0));
	/** Libère toutes les requêtes en attente d'un domaine (ou d'un fichier). */
	const release = async (match: string, status?: number) => {
		for (const r of requests.filter((x) => x.url.includes(match))) r.release(status);
		await flush();
	};
	return { requests, release, flush };
}

beforeEach(() => {
	domain.set('ecmwf_ifs025');
	modelRun.set(undefined);
	latest.set(undefined);
	inProgress.set(undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	domain.set('arome_france');
	modelRun.set(undefined);
	latest.set(undefined);
	inProgress.set(undefined);
});

describe('course des métadonnées entre domaines', () => {
	it('la réponse tardive de l’ancien domaine n’écrase pas le nouveau', async () => {
		const bucket = deferredBucket();
		const previous = getInitialMetaData(); // ECMWF, en attente
		domain.set('dwd_icon');
		const current = getInitialMetaData(); // ICON
		await bucket.release('/dwd_icon/');
		expect(await current).toBe(true);
		expect(get(latest)?.reference_time).toBe(RUNS.dwd_icon);

		await bucket.release('/ecmwf_ifs025/'); // ECMWF répond enfin
		expect(await previous).toBe(false);
		expect(get(latest)?.reference_time).toBe(RUNS.dwd_icon);
		expect(get(inProgress)?.reference_time).toBe(RUNS.dwd_icon);

		// Le run choisi est bien celui d'ICON, sans requête de meta.json étranger.
		await getMetaData();
		expect(get(modelRun)?.toISOString()).toBe(new Date(RUNS.dwd_icon).toISOString());
		expect(bucket.requests.some((r) => r.url.endsWith('/meta.json'))).toBe(false);
	});

	it('ordre inverse : l’ancien domaine répond avant, puis le nouveau', async () => {
		const bucket = deferredBucket();
		const previous = getInitialMetaData();
		domain.set('dwd_icon');
		const current = getInitialMetaData();
		await bucket.release('/ecmwf_ifs025/');
		expect(await previous).toBe(false);
		expect(get(latest)).toBeUndefined();
		await bucket.release('/dwd_icon/');
		expect(await current).toBe(true);
		expect(get(latest)?.reference_time).toBe(RUNS.dwd_icon);
	});

	it('erreur d’un domaine déjà quitté : ignorée, ni levée ni écrite', async () => {
		const bucket = deferredBucket();
		const previous = getInitialMetaData();
		domain.set('dwd_icon');
		await bucket.release('/ecmwf_ifs025/', 404);
		expect(await previous).toBe(false);
	});

	it('les erreurs du domaine courant restent levées', async () => {
		const bucket = deferredBucket();
		const current = outcome(getInitialMetaData());
		await bucket.release('/ecmwf_ifs025/', 500);
		expect(await current).toEqual({ error: new Error('HTTP 500') });
	});

	it('A → B → A : seule la dernière sélection de A écrit', async () => {
		const bucket = deferredBucket();
		const first = getInitialMetaData(); // A (ECMWF), 1re sélection
		domain.set('dwd_icon');
		const icon = getInitialMetaData();
		domain.set('ecmwf_ifs025');
		const again = getInitialMetaData(); // A, 2e sélection
		await bucket.release('/dwd_icon/');
		expect(await icon).toBe(false);
		expect(get(latest)).toBeUndefined();
		await bucket.release('/ecmwf_ifs025/');
		expect(await first).toBe(false);
		expect(await again).toBe(true);
		expect(get(latest)?.reference_time).toBe(RUNS.ecmwf_ifs025);
	});

	it('le relevé périodique du même domaine ne rend pas périmé le chargement en cours', async () => {
		const bucket = deferredBucket();
		const load = getInitialMetaData();
		const refresh = getInitialMetaData(); // +layout.svelte, toutes les 5 min
		await bucket.release('/ecmwf_ifs025/');
		expect(await load).toBe(true);
		expect(await refresh).toBe(true);
	});
});

describe('getMetaData : meta.json d’un run passé', () => {
	const PAST = new Date('2026-10-18T18:00:00Z');

	async function loaded() {
		const bucket = deferredBucket();
		const load = getInitialMetaData();
		await bucket.release('/ecmwf_ifs025/');
		await load;
		return bucket;
	}

	it('domaine changé pendant la lecture : StaleMetadataError, rien d’utilisable', async () => {
		const bucket = await loaded();
		modelRun.set(PAST);
		const pending = outcome(getMetaData());
		await bucket.flush();
		domain.set('dwd_icon');
		await bucket.release('/meta.json');
		expect(((await pending) as { error: unknown }).error).toBeInstanceOf(StaleMetadataError);
	});

	it('run changé pendant la lecture : StaleMetadataError', async () => {
		const bucket = await loaded();
		modelRun.set(PAST);
		const pending = outcome(getMetaData());
		await bucket.flush();
		modelRun.set(new Date(RUNS.ecmwf_ifs025));
		await bucket.release('/meta.json');
		expect(((await pending) as { error: unknown }).error).toBeInstanceOf(StaleMetadataError);
	});

	it('404 d’un run déjà quitté : périmé plutôt qu’erreur', async () => {
		const bucket = await loaded();
		modelRun.set(PAST);
		const pending = outcome(getMetaData());
		await bucket.flush();
		domain.set('dwd_icon');
		await bucket.release('/meta.json', 404);
		expect(((await pending) as { error: unknown }).error).toBeInstanceOf(StaleMetadataError);
	});

	it('404 d’un run déjà quitté : l’indicateur de chargement du domaine courant reste intact', async () => {
		const bucket = await loaded();
		modelRun.set(PAST);
		const pending = outcome(getMetaData());
		await bucket.flush();
		domain.set('dwd_icon');
		loading.set(true); // chargement de la nouvelle sélection en cours
		await bucket.release('/meta.json', 404);
		expect(((await pending) as { error: unknown }).error).toBeInstanceOf(StaleMetadataError);
		expect(get(loading)).toBe(true);
	});

	it('404 du run courant : l’indicateur de chargement est bien levé', async () => {
		const bucket = await loaded();
		modelRun.set(PAST);
		loading.set(true);
		const pending = outcome(getMetaData());
		await bucket.flush();
		await bucket.release('/1800Z/meta.json', 404);
		expect(await pending).toEqual({ error: new Error('HTTP 404') });
		expect(get(loading)).toBe(false);
	});

	it('sans changement, le meta.json du run passé est renvoyé, et un 404 reste une erreur', async () => {
		const bucket = await loaded();
		modelRun.set(PAST);
		const ok = getMetaData();
		await bucket.release('/1800Z/meta.json');
		expect((await ok).reference_time).toBe('2026-10-18T18:00:00Z');

		const missing = outcome(getMetaData());
		await bucket.flush();
		await bucket.release('/1800Z/meta.json', 404);
		expect(await missing).toEqual({ error: new Error('HTTP 404') });
	});
});
