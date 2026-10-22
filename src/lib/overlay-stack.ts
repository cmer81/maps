/**
 * Rendu des superpositions d'une composition de cartes (isolignes, flèches,
 * aplats empilés sur le fond). Chaque couche de superposition a son propre
 * `SlotManager` (double tampon A/B), rattaché au groupe de commit de
 * `layers.ts` pour un fondu synchronisé avec le pipeline principal.
 *
 * Les fonctions de planification sont pures (testées sans carte) ; la classe
 * `OverlayStack` se contente d'aligner les managers sur le plan.
 *
 * `inlineVectors` (isolignes/flèches insérées dans la pile des rasters) est
 * ignoré en v1 : les vecteurs de superposition vont toujours dans la pile
 * vectorielle haute.
 */
import * as maplibregl from 'maplibre-gl';

import { type OverlayContext, effectiveOverlayFlags, isSourceAvailable } from '$lib/composition';
import { OM_SLOT_RETRY, type SlotLayer, SlotManager } from '$lib/slot-manager';

import type { ChartSource } from '$lib/chart-types';
import type { getOverlayOmUrl } from '$lib/url';

export interface OverlayLayerPlan {
	/** Identité stable de la couche : `${index}:${variable}:${kind}`. */
	key: string;
	kind: 'raster' | 'vector';
	/** URL de la source (sans le préfixe `om://`). */
	url: string;
	source: ChartSource;
	/** Drapeaux effectifs, après dédoublonnage avec le pipeline principal. */
	flags: { raster: boolean; contours: boolean; arrows: boolean };
}

export type OverlayPlanContext = OverlayContext & {
	/** Variables publiées par le modèle courant (`metaJson.variables`). */
	metaVariables: readonly string[] | undefined;
};

/**
 * Couches de superposition à afficher. Saute les sources indisponibles sur le
 * domaine et celles qui ne dessinent plus rien une fois retiré ce que le fond
 * affiche déjà. Un plan `raster` si l'aplat est actif, un plan `vector` si des
 * isolignes ou des flèches le sont.
 */
export const desiredOverlayLayers = (
	overlays: ChartSource[],
	ctx: OverlayPlanContext,
	urlFor: typeof getOverlayOmUrl
): OverlayLayerPlan[] => {
	const plans: OverlayLayerPlan[] = [];
	overlays.forEach((source, index) => {
		if (!isSourceAvailable(source, ctx.metaVariables)) return;
		const flags = effectiveOverlayFlags(source, ctx);
		if (flags.raster) {
			// L'aplat ne dépend pas des drapeaux vecteur : basculer les isolignes
			// d'une superposition ne recharge pas son aplat.
			const url = urlFor(source, { contours: false, arrows: false });
			if (url) {
				plans.push({
					key: `${index}:${source.variable}:raster`,
					kind: 'raster',
					url,
					source,
					flags
				});
			}
		}
		if (flags.contours || flags.arrows) {
			const url = urlFor(source, { contours: flags.contours, arrows: flags.arrows });
			if (url) {
				plans.push({
					key: `${index}:${source.variable}:vector`,
					kind: 'vector',
					url,
					source,
					flags
				});
			}
		}
	});
	return plans;
};

/**
 * Signature de rendu d'un plan : tout ce qui change les couches dessinées.
 * L'URL porte déjà les drapeaux isolignes/flèches du vecteur ; on y ajoute ce
 * qu'elle ne porte pas, seulement s'il diffère du défaut (signature = URL sinon) :
 * opacité pour l'aplat, épaisseur pour le vecteur.
 */
export const overlayRenderSignature = (plan: OverlayLayerPlan): string => {
	const { opacity, lineWidth } = plan.source;
	if (plan.kind === 'raster') {
		return opacity === undefined || opacity === 1 ? plan.url : `${plan.url}|o${opacity}`;
	}
	return lineWidth === undefined || lineWidth === 1 ? plan.url : `${plan.url}|w${lineWidth}`;
};

/**
 * Écart entre les couches actives (`current` : clé → signature de rendu
 * chargée, soit l'URL avec les réglages par défaut) et le plan : recharge les
 * clés nouvelles ou dont la signature a changé (plus les aplats qui suivent un
 * aplat rechargé, pour l'ordre d'empilement), retire les autres.
 */
export const planOverlayUpdates = (
	current: ReadonlyMap<string, string>,
	desired: OverlayLayerPlan[]
): { update: OverlayLayerPlan[]; remove: string[] } => {
	const desiredKeys = new Set(desired.map((plan) => plan.key));
	const changed = new Set(
		desired.filter((plan) => current.get(plan.key) !== overlayRenderSignature(plan))
	);
	// Ordre d'empilement des aplats : chacun est inséré juste sous la même ancre,
	// donc le dernier rechargé passe au-dessus. Si un aplat se recharge seul, on
	// recharge aussi les aplats actifs qui le suivent dans la liste, dans l'ordre,
	// pour qu'ils restent au-dessus de lui.
	const firstRaster = desired.findIndex((plan) => plan.kind === 'raster' && changed.has(plan));
	return {
		update: desired.filter(
			(plan, i) =>
				changed.has(plan) ||
				(firstRaster >= 0 && i > firstRaster && plan.kind === 'raster' && current.has(plan.key))
		),
		remove: [...current.keys()].filter((key) => !desiredKeys.has(key))
	};
};

export interface OverlayStackHooks {
	/** Tuiles chargées, commit en attente (coordinateur de `layers.ts`). */
	onReady: () => void;
	/** Source en erreur (p. ex. 404 sur un domaine) : la couche est déjà effacée. */
	onError: (mgr: SlotManager) => void;
	/**
	 * Manager détruit (superposition retirée, pile détruite) : il ne sera jamais
	 * prêt ni en erreur, l'appelant doit le sortir du groupe de commit en vol.
	 */
	onDestroy: (mgr: SlotManager) => void;
	/** Point d'insertion des aplats de superposition. */
	rasterBefore: () => string;
	/** Point d'insertion des isolignes/flèches de superposition. */
	vectorBefore: () => string;
	/**
	 * Couches MapLibre d'un plan. Fournies par `layers.ts` (qui possède les
	 * builders partagés avec le pipeline principal) pour éviter un cycle
	 * d'imports. `tag` rend les identifiants de couches uniques.
	 */
	layers: (plan: OverlayLayerPlan, tag: string) => SlotLayer[];
}

interface OverlayEntry {
	manager: SlotManager;
	/** Signature demandée en dernier (déduplication, même si le chargement a échoué). */
	signature: string;
	plan: OverlayLayerPlan;
}

// Compteur au niveau module : une pile recréée (rechargement de style) ne doit
// jamais réutiliser l'identifiant de source d'un manager détruit, dont un
// `removeSlot` différé purgerait sinon la source du nouveau.
let managerSeq = 0;

export class OverlayStack {
	private map: maplibregl.Map;
	private hooks: OverlayStackHooks;
	private entries = new Map<string, OverlayEntry>();

	constructor(map: maplibregl.Map, hooks: OverlayStackHooks) {
		this.map = map;
		this.hooks = hooks;
	}

	/**
	 * Aligne les managers sur le plan : détruit les couches retirées, crée les
	 * manquantes et renvoie les managers à recharger avec leur URL. Ne lance
	 * aucun `update()` : l'appelant doit d'abord les ajouter au groupe de commit
	 * (`beginCommitGroup`), puis appeler `manager.update('om://' + url)`.
	 */
	sync(plans: OverlayLayerPlan[]): { manager: SlotManager; url: string }[] {
		const current = new Map([...this.entries].map(([key, entry]) => [key, entry.signature]));
		const { update, remove } = planOverlayUpdates(current, plans);

		for (const key of remove) {
			const entry = this.entries.get(key);
			if (!entry) continue;
			this.entries.delete(key);
			this.destroyEntry(entry);
		}

		// Plan toujours rafraîchi, même sans rechargement : la layerFactory lit
		// `entry.plan` au prochain `update()` (rechargement de style, d'unités…).
		for (const plan of plans) {
			const entry = this.entries.get(plan.key);
			if (entry) entry.plan = plan;
		}

		// Points d'insertion relus à chaque passage (hillshade, masque océans…).
		for (const entry of this.entries.values()) {
			entry.manager.setBeforeLayer(this.beforeLayerFor(entry.plan.kind));
		}

		const toLoad: { manager: SlotManager; url: string }[] = [];
		for (const plan of update) {
			let entry = this.entries.get(plan.key);
			if (!entry) {
				entry = this.createEntry(plan);
				this.entries.set(plan.key, entry);
			}
			entry.signature = overlayRenderSignature(plan);
			toLoad.push({ manager: entry.manager, url: plan.url });
		}
		return toLoad;
	}

	/** Managers vecteur actifs (rechargés par `reloadVectorStyle`). */
	vectorManagers(): SlotManager[] {
		return [...this.entries.values()]
			.filter((entry) => entry.plan.kind === 'vector')
			.map((entry) => entry.manager);
	}

	/**
	 * Une URL affichée par superposition, dans l'ordre de la liste (lue par
	 * l'infobulle). L'aplat est préféré au vecteur : les deux portent la même
	 * variable, seule compte une frame décodée et affichée.
	 */
	activeSources(): { variable: string; url: string }[] {
		const byIndex = new Map<number, { variable: string; url: string; raster: boolean }>();
		for (const entry of this.entries.values()) {
			const url = entry.manager.getActiveSourceUrl();
			if (!url) continue;
			const index = Number.parseInt(entry.plan.key, 10);
			const raster = entry.plan.kind === 'raster';
			const known = byIndex.get(index);
			if (!known || (raster && !known.raster)) {
				byIndex.set(index, { variable: entry.plan.source.variable, url, raster });
			}
		}
		return [...byIndex.entries()]
			.sort(([a], [b]) => a - b)
			.map(([, { variable, url }]) => ({ variable, url }));
	}

	/** `true` si `mgr` est un manager de cette pile. */
	owns(mgr: SlotManager): boolean {
		for (const entry of this.entries.values()) if (entry.manager === mgr) return true;
		return false;
	}

	destroyAll(): void {
		const entries = [...this.entries.values()];
		this.entries.clear();
		for (const entry of entries) this.destroyEntry(entry);
	}

	private destroyEntry(entry: OverlayEntry): void {
		entry.manager.destroy();
		this.hooks.onDestroy(entry.manager);
	}

	private beforeLayerFor(kind: OverlayLayerPlan['kind']): string {
		return kind === 'raster' ? this.hooks.rasterBefore() : this.hooks.vectorBefore();
	}

	private createEntry(plan: OverlayLayerPlan): OverlayEntry {
		const tag = String(managerSeq++);
		const isRaster = plan.kind === 'raster';
		// `entry` est lu par la layerFactory au moment de chaque `update()` : elle
		// suit donc le plan courant (drapeaux, opacité, épaisseur).
		const entry = { signature: overlayRenderSignature(plan), plan } as OverlayEntry;
		const manager: SlotManager = new SlotManager(this.map, {
			sourceIdPrefix: `omOverlaySource_${tag}`,
			beforeLayer: this.beforeLayerFor(plan.kind),
			layerFactory: () => this.hooks.layers(entry.plan, tag),
			sourceSpec: (sourceUrl) =>
				isRaster
					? { url: sourceUrl, type: 'raster', maxzoom: 14 }
					: { url: sourceUrl, type: 'vector' },
			removeDelayMs: isRaster ? 300 : 250,
			// Variable absente du domaine (404) : on efface la couche plutôt que de
			// laisser celle du modèle précédent figée. Pas de toast (répété à chaque
			// pas de temps) : la superposition disparaît simplement.
			clearOnError: true,
			deferCommit: true,
			retry: OM_SLOT_RETRY,
			onReady: this.hooks.onReady,
			onError: () => this.hooks.onError(manager)
		});
		entry.manager = manager;
		return entry;
	}
}

/**
 * Couche-repère invisible (fond `background` masqué, sans source) servant
 * d'ancre aux aplats de superposition. Ajoutée une fois, juste sous `beforeId`
 * (la plus basse des couches vecteur au moment de l'appel) : les aplats insérés
 * avant elle restent sous TOUTES les couches vecteur (fond et superpositions),
 * qui s'insèrent, elles, au-dessus. Le rechargement de style l'efface : à
 * rappeler après chaque `setStyle` (`addOmFileLayers`).
 */
export const ensureAnchorLayer = (
	map: maplibregl.Map,
	id: string,
	beforeId: string | undefined
): void => {
	if (map.getLayer(id)) return;
	map.addLayer(
		{ id, type: 'background', layout: { visibility: 'none' } },
		beforeId && map.getLayer(beforeId) ? beforeId : undefined
	);
};
