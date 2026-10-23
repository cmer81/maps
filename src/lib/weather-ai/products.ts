// Produits Weather AI que le front sait afficher. Ce n'est PAS la liste des
// couches : elle vient du catalogue (`GET /products`) ; un `product_id` présent
// ici mais absent du catalogue n'est pas proposé, et un `product_id` du
// catalogue absent d'ici est ignoré proprement tant qu'on ne sait pas le rendre.
// Tant que le portail ne sert pas `products[].presentation`, le rendu de chaque
// produit connu est défini ici ; le contrat (schéma, variable, unité) est
// re-vérifié sur chaque document reçu.
import { CONES_MENTION, CONES_PRODUCT_ID } from './cones';

import type { Catalog } from './api';

export type ProductKind = 'mslp' | 'existence' | 'tracks' | 'cones';

export interface ProductSpec {
	kind: ProductKind;
	label: string;
	/** Préfixe attendu de `schema_version` (les versions mineures évoluent). */
	schemaPrefix: string;
	/** Grilles : variable et unité stockées attendues. */
	variable?: string;
	unit?: string;
}

export const PRODUCT_SPECS: Record<string, ProductSpec> = {
	'global-mslp-1deg': {
		kind: 'mslp',
		label: 'Pression au niveau de la mer',
		schemaPrefix: 'carto-grid-product/1.',
		variable: 'mean_sea_level_pressure',
		unit: 'Pa'
	},
	'global-cyclone-existence-1deg': {
		kind: 'existence',
		label: "Probabilité d'existence cyclonique",
		schemaPrefix: 'carto-grid-product/1.',
		variable: 'cyclone_exists_gaussian_unit_mode',
		unit: '1'
	},
	'global-cyclone-tracks-1deg': {
		kind: 'tracks',
		label: 'Trajectoires cycloniques',
		schemaPrefix: 'cyclone-tracks-product/1.'
	},
	[CONES_PRODUCT_ID]: {
		kind: 'cones',
		label: "Cônes d'incertitude",
		schemaPrefix: 'cyclone-cones-public-product/1.'
	}
};

export interface DiscoveredProduct {
	productId: string;
	spec: ProductSpec;
	attribution: string;
	licenseNotice: string;
	/** Cônes : `valid_time` (amorce) de l'unique document du run, à passer à `/data`. */
	validTime?: string;
	/** Cônes : empreinte du document, pour recharger s'il est remplacé dans le même run. */
	sha256?: string;
	/** Cônes : statut de calibration annoncé par le catalogue (le document doit porter le même). */
	calibrationStatus?: string;
}

/**
 * Déduplique les `product_id` du catalogue (une entrée par échéance) et sépare
 * ceux qu'on sait afficher des inconnus, ignorés sans erreur.
 */
export function discoverProducts(catalog: Catalog): {
	known: DiscoveredProduct[];
	ignored: string[];
} {
	const seen = new Map<string, DiscoveredProduct>();
	const ignored = new Set<string>();
	for (const entry of catalog.produits) {
		const spec = PRODUCT_SPECS[entry.product_id];
		// Les cônes ne viennent que du champ `cones` (leur propre catalogue).
		if (spec?.kind === 'cones') continue;
		if (!spec) {
			ignored.add(entry.product_id);
			continue;
		}
		if (!seen.has(entry.product_id)) {
			seen.set(entry.product_id, {
				productId: entry.product_id,
				spec,
				attribution: entry.attribution,
				licenseNotice: entry.license_notice
			});
		}
	}
	const cones = conesProduct(catalog);
	if (cones) seen.set(cones.productId, cones);
	return { known: [...seen.values()], ignored: [...ignored] };
}

/**
 * Cônes annoncés par le champ `cones` du catalogue, seulement s'ils sont du run
 * et du snapshot des autres produits : des cônes d'un autre run ne sont jamais
 * proposés (le portail applique la même règle, on la vérifie aussi).
 */
function conesProduct(catalog: Catalog): DiscoveredProduct | undefined {
	const entry = catalog.cones;
	if (!entry || entry.product_id !== CONES_PRODUCT_ID) return undefined;
	const snapshots = new Set(catalog.produits.map((p) => p.snapshot_id));
	if (entry.run_id !== catalog.run_id || snapshots.size !== 1 || !snapshots.has(entry.snapshot_id))
		return undefined;
	if (entry.experimental !== true || typeof entry.valid_time !== 'string') return undefined;
	if (entry.mention !== CONES_MENTION || typeof entry.calibration_status !== 'string')
		return undefined;
	return {
		productId: entry.product_id,
		spec: PRODUCT_SPECS[CONES_PRODUCT_ID],
		attribution: entry.attribution,
		licenseNotice: entry.license_notice,
		validTime: entry.valid_time,
		sha256: entry.sha256,
		calibrationStatus: entry.calibration_status
	};
}
