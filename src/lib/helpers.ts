import { browser } from '$app/environment';

import {
	ANOMALY_DOMAIN,
	AROME_FRANCE_CONVECTION_DOMAIN,
	AROME_FRANCE_DOMAIN,
	AROME_FRANCE_HD_DOMAIN,
	AROME_OM_ANTILLES_DOMAIN,
	AROME_OM_GUYANE_DOMAIN,
	AROME_OM_NCALEDONIE_DOMAIN,
	AROME_OM_POLYNESIE_DOMAIN,
	AROME_OM_REUNION_DOMAIN,
	WEATHER_AI_GLOBAL_DOMAIN
} from '$lib/constants';
import { getModelsBucketUrl } from '$lib/runtime-env';

const BUCKET_DOMAINS: ReadonlySet<string> = new Set([
	ANOMALY_DOMAIN,
	AROME_OM_REUNION_DOMAIN,
	AROME_OM_ANTILLES_DOMAIN,
	AROME_OM_GUYANE_DOMAIN,
	AROME_OM_NCALEDONIE_DOMAIN,
	AROME_OM_POLYNESIE_DOMAIN,
	AROME_FRANCE_CONVECTION_DOMAIN,
	AROME_FRANCE_DOMAIN,
	AROME_FRANCE_HD_DOMAIN,
	WEATHER_AI_GLOBAL_DOMAIN
]);

/**
 * Pads a number with leading zeros to ensure 2 digits
 */
export const pad = (num: number | string): string => String(num).padStart(2, '0');

export const fmtModelRun = (modelRun: Date): string =>
	`${modelRun.getUTCFullYear()}/${pad(modelRun.getUTCMonth() + 1)}/${pad(modelRun.getUTCDate())}/${pad(modelRun.getUTCHours())}${pad(modelRun.getUTCMinutes())}Z`;

export const fmtSelectedTime = (t: Date): string =>
	`${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}`;

/**
 * URL `.om` path-style (sans query) : domaine + run + temps valide arbitraires,
 * indépendamment des stores globaux. Le `omProtocol` strip la query-string — on n'en
 * ajoute donc pas ici (les lecteurs attendent la base nue, comme prefetch.ts).
 */
export const buildOmFileUrl = (domain: string, modelRun: Date, validTime: Date): string =>
	`${getBaseUri(domain)}/data_spatial/${domain}/${fmtModelRun(modelRun)}/${fmtSelectedTime(validTime)}.om`;

/**
 * Idem, pour une lecture de sondage : permet de lire la colonne verticale sur un
 * domaine source distinct du domaine affiché (cf. `soundingSourceDomain`).
 */
export const buildSoundingOmUrl = buildOmFileUrl;

/**
 * Bucket S3 public Open-Meteo — source des domaines « upstream » (tous ceux qui
 * ne sont pas dans `BUCKET_DOMAINS`, servis par notre propre bucket).
 *
 * On lisait auparavant `map-tiles.open-meteo.com`, dont le DNS ne résout plus
 * (NXDOMAIN) : tous les domaines upstream étaient donc morts, seuls les modèles
 * maison répondaient encore. Le bucket expose la même arborescence
 * (`data_spatial/<domain>/YYYY/MM/DD/HHMMZ/<valid-time>.om`, plus
 * `latest.json` / `in-progress.json` / `meta.json`), avec CORS `*` et les
 * requêtes `Range` autorisées — ce dont le reader `.om` a besoin.
 *
 * C'est l'endpoint public retenu en amont : `weather-map-layer` a migré
 * `map-tiles` -> BunnyCDN (#294), puis retiré BunnyCDN au profit de S3 brut
 * (#306). Les deux autres endpoints connus sont hors-jeu :
 *   - `openmeteo-data-spatial.b-cdn.net` -> 403 (CDN retiré) ;
 *   - `data-spatial.open-meteo.com/data_spatial`, utilisé par l'app officielle,
 *     -> 403 hors referer `localhost` / `*.open-meteo.com` (vérifié depuis un
 *     referer `infoclimat.fr`).
 *
 * Contrepartie assumée : accès direct au bucket (us-west-2), sans CDN devant,
 * donc latence plus élevée depuis l'Europe. Pas de miroir à repointer — si on
 * veut du cache, il faudra le mettre en place de notre côté.
 *
 * Il n'y a volontairement plus de dérogation par domaine : un ancien fallback
 * `dev` renvoyait les domaines `dwd_icon*` (hors `_eps`) vers `s3.servert.ch`,
 * hôte qui répond aujourd'hui 404 sur toutes ses routes (racine incluse) et
 * sans en-têtes CORS. En dev, ICON Global/EU/D2 partaient donc dans le mur.
 */
const OPEN_METEO_BUCKET_URL = 'https://openmeteo.s3.amazonaws.com';

export const getBaseUri = (domainValue: string): string =>
	BUCKET_DOMAINS.has(domainValue) ? getModelsBucketUrl().replace(/\/$/, '') : OPEN_METEO_BUCKET_URL;

export const hashValue = (val: string): string => {
	// FNV-1a 32-bit – synchronous, fast, and sufficient for cache-busting keys.
	let h = 0x811c9dc5;
	for (let i = 0; i < val.length; i++) {
		h ^= val.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
};

export const throttle = <T extends unknown[]>(
	callback: (...args: T) => void,
	delay: number
): ((...args: T) => void) => {
	let waiting = false;
	return (...args: T) => {
		if (waiting) return;
		callback(...args);
		waiting = true;
		setTimeout(() => {
			waiting = false;
		}, delay);
	};
};

function isHighDensity(): boolean {
	return (
		window.matchMedia?.(
			'only screen and (min-resolution: 124dpi), only screen and (min-resolution: 1.3dppx), only screen and (min-resolution: 48.8dpcm)'
		).matches ||
		window.matchMedia?.(
			'only screen and (-webkit-min-device-pixel-ratio: 1.3), only screen and (-o-min-device-pixel-ratio: 2.6/2), only screen and (min--moz-device-pixel-ratio: 1.3), only screen and (min-device-pixel-ratio: 1.3)'
		).matches ||
		window.devicePixelRatio > 1.3
	);
}

function isRetina(): boolean {
	return (
		(window.matchMedia?.(
			'only screen and (min-resolution: 192dpi), only screen and (min-resolution: 2dppx), only screen and (min-resolution: 75.6dpcm)'
		).matches ||
			window.matchMedia?.(
				'only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (-o-min-device-pixel-ratio: 2/1), only screen and (min--moz-device-pixel-ratio: 2), only screen and (min-device-pixel-ratio: 2)'
			).matches ||
			window.devicePixelRatio >= 2) &&
		/(iPad|iPhone|iPod)/g.test(navigator.userAgent)
	);
}

export const checkHighDefinition = (): boolean => (browser ? isRetina() || isHighDensity() : false);

export const textWhite = (
	[r, g, b, a]: [number, number, number, number] | [number, number, number],
	dark?: boolean,
	globalOpacity?: number
): boolean => {
	const alpha = ((a ?? 1) * (globalOpacity ?? 100)) / 100;
	if (alpha < 0.65) return dark ?? false;
	return r * 0.299 + g * 0.587 + b * 0.114 <= 150;
};
