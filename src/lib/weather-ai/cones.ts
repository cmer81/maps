// Cônes d'incertitude cycloniques publics (`global-cyclone-cones-public`,
// contrat weather-ai#261, `schema/cyclone-cones-public-product.schema.json`),
// servis par le portail pour le run en ligne (chom-poc-data#260). Un document
// unique par run, toutes échéances comprises, annoncé par le champ `cones` du
// catalogue (hors de `produits`) : on ne réutilise pas la boucle « une frame =
// un document » des grilles, le chargement passe par `loadConesDocument`.
import { convex, featureCollection, point, polygon, union } from '@turf/turf';

import { getWeatherAiConesMode } from '$lib/runtime-env';

import { type DataResponse, dataUrl, getJson } from './api';
import { unwrapLongitudes } from './tracks';

import type { DiscoveredProduct } from './products';

export const CONES_PRODUCT_ID = 'global-cyclone-cones-public';
export const CONES_SCHEMA_VERSION = 'cyclone-cones-public-product/1.0.0';

/** Mention de calibration imposée par le contrat : affichée telle quelle, sinon pas de cône. */
export const CONES_MENTION =
	'Expérimental — calibré sur positions best track, couverture sur amorces opérationnelles en cours de mesure.';

export type ConeLevel = '0.68' | '0.90';
export const CONE_LEVELS: ConeLevel[] = ['0.68', '0.90'];

export type ConeUnavailableReason =
	'insufficient_members' | 'undefined_centre' | 'southern_hemisphere_availability_below_threshold';

export const CONE_REASON_LABELS: Record<ConeUnavailableReason, string> = {
	insufficient_members: 'membres insuffisants',
	undefined_centre: 'centre indéfini',
	southern_hemisphere_availability_below_threshold:
		'hémisphère sud : disponibilité sous le seuil au-delà de +24 h'
};

export type Cone =
	| {
			lead_hours: number;
			valid_time: string;
			available: true;
			available_members: number;
			centre: { latitude: number; longitude: number };
			radius_km: Record<ConeLevel, number>;
	  }
	| {
			lead_hours: number;
			valid_time: string;
			available: false;
			available_members: number;
			reason: ConeUnavailableReason;
	  };

export interface ConeStorm {
	storm_id: string;
	hemisphere: 'north' | 'south';
	maximum_lead_hours: number;
	cones: Cone[];
}

export interface ConesProduct {
	schema_version: string;
	product_id: string;
	run_id: string;
	init_time: string;
	snapshot_id: string;
	experimental: boolean;
	alert_authority: boolean;
	calibration_status: string;
	mention: string;
	public_delivery_allowed: boolean;
	levels: string[];
	member_count: number;
	member_quorum: number;
	maximum_lead_hours: number;
	southern_maximum_lead_hours: number;
	storms: ConeStorm[];
}

/**
 * Accepte le document seulement s'il appartient au run affiché et porte les
 * garde-fous du contrat (mention exacte, statut de calibration du catalogue,
 * diffusion publique permise, pas d'autorité d'alerte). Renvoie la raison du refus, ou `null`.
 */
export function validateCones(
	doc: ConesProduct,
	expected: { runId: string; snapshotId: string; calibrationStatus?: string }
): string | null {
	if (doc?.schema_version !== CONES_SCHEMA_VERSION) return 'schéma inattendu';
	if (doc.product_id !== CONES_PRODUCT_ID) return 'produit inattendu';
	if (doc.run_id !== expected.runId || doc.snapshot_id !== expected.snapshotId) {
		return 'run différent du run affiché';
	}
	if (doc.experimental !== true || doc.alert_authority !== false) return 'qualification invalide';
	if (doc.public_delivery_allowed !== true) return 'diffusion publique non permise';
	if (doc.mention !== CONES_MENTION) return 'mention de calibration absente ou différente';
	// Statut affiché tel quel à côté de la mention : chaîne non vide, et celui du catalogue.
	if (typeof doc.calibration_status !== 'string' || !doc.calibration_status.trim())
		return 'statut de calibration absent';
	if (
		expected.calibrationStatus !== undefined &&
		doc.calibration_status !== expected.calibrationStatus
	)
		return 'statut de calibration différent du catalogue';
	if (!Array.isArray(doc.storms)) return 'cyclones absents';
	const shape = invalidShape(doc);
	if (shape) return shape;
	for (const storm of doc.storms) {
		const limit = stormLeadLimit(doc, storm);
		if (storm.maximum_lead_hours > limit) {
			return `échéance maximale de ${storm.storm_id} au-delà de la limite (+${limit} h)`;
		}
		// Hémisphère sud : aucun cône disponible au-delà de southern_maximum_lead_hours.
		if (storm.cones.some((c) => c.available && c.lead_hours > limit)) {
			return `cône disponible au-delà de +${limit} h pour ${storm.storm_id}`;
		}
	}
	return null;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Raison du contrat seulement : propriété propre de `CONE_REASON_LABELS` (pas `toString`, `__proto__`…). */
export const isConeReason = (v: unknown): v is ConeUnavailableReason =>
	typeof v === 'string' && Object.hasOwn(CONE_REASON_LABELS, v);

/**
 * Types du document, désormais lu sur le réseau : nombres finis, chaînes, raisons
 * connues. Ce qui est affiché (infobulle HTML, géométrie) ne vient que de champs
 * vérifiés ici. Renvoie la raison du refus, ou `null`.
 */
function invalidShape(doc: ConesProduct): string | null {
	if (![doc.member_count, doc.maximum_lead_hours, doc.southern_maximum_lead_hours].every(finite))
		return 'bornes du document invalides';
	for (const storm of doc.storms) {
		if (typeof storm?.storm_id !== 'string' || !Array.isArray(storm.cones))
			return 'cyclone invalide';
		if (storm.hemisphere !== 'north' && storm.hemisphere !== 'south')
			return `hémisphère invalide pour ${storm.storm_id}`;
		if (!finite(storm.maximum_lead_hours))
			return `échéance maximale invalide pour ${storm.storm_id}`;
		for (const c of storm.cones) {
			if (
				!finite(c?.lead_hours) ||
				typeof c.valid_time !== 'string' ||
				!finite(c.available_members)
			)
				return `cône invalide pour ${storm.storm_id}`;
			if (c.available === true) {
				const ok =
					finite(c.centre?.latitude) &&
					finite(c.centre?.longitude) &&
					CONE_LEVELS.every((l) => finite(c.radius_km?.[l]) && c.radius_km[l] > 0);
				if (!ok) return `centre ou rayon invalide pour ${storm.storm_id}`;
			} else if (c.available !== false || !isConeReason(c.reason)) {
				return `indisponibilité invalide pour ${storm.storm_id}`;
			}
		}
	}
	return null;
}

/**
 * Échéance maximale d'un cyclone : la sienne, bornée par la limite globale et,
 * dans l'hémisphère sud, par `southern_maximum_lead_hours`.
 */
export function stormLeadLimit(doc: ConesProduct, storm: ConeStorm): number {
	const global = Math.min(doc.maximum_lead_hours, storm.maximum_lead_hours);
	return storm.hemisphere === 'south' ? Math.min(global, doc.southern_maximum_lead_hours) : global;
}

type AvailableCone = Extract<Cone, { available: true }>;

/**
 * Découpe la suite des cônes d'un cyclone (triée par échéance) en tronçons de
 * cônes disponibles consécutifs : une indisponibilité coupe l'enveloppe, sans
 * interpolation par-dessus le trou.
 */
export function availableRuns(cones: Cone[]): AvailableCone[][] {
	const runs: AvailableCone[][] = [];
	let cur: AvailableCone[] = [];
	for (const c of [...cones].sort((a, b) => a.lead_hours - b.lead_hours)) {
		if (c.available) cur.push(c);
		else if (cur.length) {
			runs.push(cur);
			cur = [];
		}
	}
	if (cur.length) runs.push(cur);
	return runs;
}

const KM_PER_DEG_LAT = 111.32;
const CIRCLE_STEPS = 48;

/**
 * Cercle de rayon `radiusKm` (en km) converti en degrés selon la latitude
 * (Δlon = r / (111,32 · cos φ)). Les longitudes restent dans le repère déroulé
 * du centre : pas de renvoi en ±180, l'enveloppe reste d'un seul tenant.
 */
export function circleRing(lon: number, lat: number, radiusKm: number): [number, number][] {
	const dLat = radiusKm / KM_PER_DEG_LAT;
	const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
	const dLon = radiusKm / (KM_PER_DEG_LAT * cos);
	const ring: [number, number][] = [];
	for (let k = 0; k < CIRCLE_STEPS; k++) {
		const a = (2 * Math.PI * k) / CIRCLE_STEPS;
		ring.push([
			lon + dLon * Math.cos(a),
			Math.max(-89.9, Math.min(89.9, lat + dLat * Math.sin(a)))
		]);
	}
	ring.push(ring[0]);
	return ring;
}

/**
 * Enveloppe d'un tronçon pour un niveau : union des cercles successifs reliés
 * par leurs tangentes (enveloppe convexe de chaque paire de cercles voisins).
 */
export function envelope(
	run: AvailableCone[],
	level: ConeLevel
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
	const lons = unwrapLongitudes(run.map((c) => c.centre.longitude));
	const rings = run.map((c, k) => circleRing(lons[k], c.centre.latitude, c.radius_km[level]));
	const parts: GeoJSON.Feature<GeoJSON.Polygon>[] =
		rings.length === 1
			? [polygon([rings[0]])]
			: rings.slice(1).map((ring, k) => {
					const hull = convex(featureCollection([...rings[k], ...ring].map((p) => point(p))));
					return hull ?? polygon([ring]);
				});
	if (parts.length === 1) return parts[0];
	return union(featureCollection(parts));
}

/**
 * GeoJSON des cônes : enveloppes 90 % et 68 % (dessinées dans cet ordre, 68 %
 * par-dessus) et un point par échéance disponible pour l'infobulle.
 */
export function conesToGeoJson(doc: ConesProduct): {
	envelopes: GeoJSON.FeatureCollection;
	centres: GeoJSON.FeatureCollection<GeoJSON.Point>;
} {
	const envelopes: GeoJSON.Feature[] = [];
	const centres: GeoJSON.Feature<GeoJSON.Point>[] = [];
	for (const storm of doc.storms) {
		// Défense en profondeur : rien au-delà de la limite du cyclone (sud : +24 h).
		const limit = stormLeadLimit(doc, storm);
		const runs = availableRuns(storm.cones.filter((c) => c.lead_hours <= limit));
		for (const level of ['0.90', '0.68'] as ConeLevel[]) {
			for (const run of runs) {
				const env = envelope(run, level);
				if (env) envelopes.push({ ...env, properties: { storm: storm.storm_id, level } });
			}
		}
		for (const run of runs) {
			const lons = unwrapLongitudes(run.map((c) => c.centre.longitude));
			run.forEach((c, k) =>
				centres.push({
					type: 'Feature',
					properties: {
						storm: storm.storm_id,
						lead: c.lead_hours,
						time: c.valid_time,
						members: c.available_members,
						memberCount: doc.member_count,
						r68: c.radius_km['0.68'],
						r90: c.radius_km['0.90']
					},
					geometry: { type: 'Point', coordinates: [lons[k], c.centre.latitude] }
				})
			);
		}
	}
	return {
		envelopes: { type: 'FeatureCollection', features: envelopes },
		centres: { type: 'FeatureCollection', features: centres }
	};
}

/** Cône d'un cyclone à une échéance donnée (pour l'infobulle de la trajectoire). */
export const coneAt = (doc: ConesProduct, stormId: string, validTime: string): Cone | undefined =>
	doc.storms.find((s) => s.storm_id === stormId)?.cones.find((c) => c.valid_time === validTime);

/**
 * Adaptateur de chargement isolé. `fixture` : document de démonstration bundlé
 * (import dynamique, hors du bundle principal). `on` : `GET /products/{cônes}/data`
 * à la date d'amorce annoncée par le catalogue ; `null` si le catalogue n'annonce
 * pas de cônes, ou si le portail ne les sert plus (404 : cônes retirés entre le
 * catalogue et la lecture). `off` : rien n'est chargé. Le document renvoyé n'est
 * pas encore validé : l'appelant le passe à `validateCones` (même run, même snapshot).
 */
export async function loadConesDocument(
	run: { runId: string; available: DiscoveredProduct[] },
	base: string,
	signal?: AbortSignal,
	fetchJson: <T>(url: string, signal?: AbortSignal) => Promise<T> = (url, s) => getJson(url, s)
): Promise<ConesProduct | null> {
	const mode = getWeatherAiConesMode();
	if (mode === 'off') return null;
	if (mode === 'fixture') {
		const mod = await import('./fixtures/cones-public.fixture.json');
		signal?.throwIfAborted();
		const doc = mod.default as unknown as ConesProduct;
		return doc.run_id === run.runId ? doc : null;
	}
	const entry = run.available.find((p) => p.productId === CONES_PRODUCT_ID);
	if (!entry?.validTime) return null;
	try {
		const res = await fetchJson<DataResponse<ConesProduct>>(
			dataUrl(base, CONES_PRODUCT_ID, entry.validTime),
			signal
		);
		if (res?.experimental !== true) throw new Error('cônes : réponse non expérimentale');
		return res.product ?? null;
	} catch (err) {
		if ((err as { status?: number })?.status === 404) return null;
		throw err;
	}
}

/**
 * Cônes validés d'un run antérieur, gardés en mémoire de session pour couvrir
 * l'intervalle (~1 h) entre la bascule du catalogue sur un nouveau run et la fin
 * du job `cone-members` : le portail ne sert les cônes que du run en ligne
 * (`_cones_du_run`), un chargement à froid ne peut donc pas les obtenir.
 */
export interface PreviousCones {
	runId: string;
	snapshotId: string;
	sha256?: string;
	calibrationStatus?: string;
	attribution: string;
	licenseNotice: string;
	doc: ConesProduct;
}

/** Écart maximal entre l'amorce des cônes gardés et celle du run affiché. */
export const PREVIOUS_CONES_MAX_AGE_MS = 12 * 3_600_000;

/**
 * Cônes à garder au passage sur `next`, ou `null`. Seulement ceux du run affiché
 * juste avant (`prevRunId`), si le catalogue de `next` annonce explicitement
 * l'attente des siens (`cones: null` ; un champ absent est un retrait), amorcés
 * avant `next` et au plus 12 h plus tôt, et toujours conformes au contrat
 * (`validateCones` rejoué contre LEUR run, jamais contre celui affiché).
 */
export function keepPreviousCones(
	kept: PreviousCones | null,
	prevRunId: string | undefined,
	next: {
		runId: string;
		initTime: string | undefined;
		available: DiscoveredProduct[];
		conesAwaited?: boolean;
	}
): PreviousCones | null {
	if (!kept || kept.runId !== prevRunId || kept.runId === next.runId) return null;
	if (!next.conesAwaited) return null;
	if (next.available.some((p) => p.productId === CONES_PRODUCT_ID)) return null;
	const age = Date.parse(next.initTime ?? '') - Date.parse(kept.doc.init_time);
	if (!(age > 0 && age <= PREVIOUS_CONES_MAX_AGE_MS)) return null;
	const refusal = validateCones(kept.doc, {
		runId: kept.runId,
		snapshotId: kept.snapshotId,
		calibrationStatus: kept.calibrationStatus
	});
	return refusal ? null : kept;
}

/** Amorce au format court des mentions, ex. « 26/10 00Z ». */
export function shortRunLabel(initTime: string): string {
	const d = new Date(initTime);
	if (Number.isNaN(d.getTime())) return 'inconnu';
	const p = (n: number) => String(n).padStart(2, '0');
	return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}Z`;
}

/** Mention imposée dès que des cônes d'un run antérieur sont affichés. */
export const previousConesNotice = (prev: PreviousCones) =>
	`Cônes du run ${shortRunLabel(prev.doc.init_time)} : ceux du run affiché sont en cours de calcul.`;
