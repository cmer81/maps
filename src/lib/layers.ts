import { get } from 'svelte/store';

import { GridFactory, getColorScale } from '@openmeteo/weather-map-layer';
import * as maplibregl from 'maplibre-gl';
import { toast } from 'svelte-sonner';

import { basemapTheme } from '$lib/stores/basemap-theme';
import { map as m } from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { loading, opacity, opacity2, preferences as p } from '$lib/stores/preferences';
import { metaJson as mJ, time } from '$lib/stores/time';
import { unitPreferences } from '$lib/stores/units';
import {
	domain as d,
	variable as displayedVariable,
	layer2Enabled,
	selectedDomain,
	variable2
} from '$lib/stores/variables';
import { gridValues, vectorOptions as vO } from '$lib/stores/vector';
import { arrowStyle, contourStyle } from '$lib/stores/vector-styles';

import {
	ANOMALY_DOMAIN,
	BEFORE_LAYER_RASTER,
	BEFORE_LAYER_RASTER_SECONDARY,
	BEFORE_LAYER_VECTOR,
	BEFORE_LAYER_VECTOR_WATER_CLIP,
	HILLSHADE_LAYER
} from '$lib/constants';
import { SLOT_EVENT_COMMIT, SLOT_EVENT_ERROR, slotEvents } from '$lib/slot-events';
import { type SlotLayer, SlotManager } from '$lib/slot-manager';
import {
	type ArrowStyle,
	type ContourStyle,
	type GridGeometry,
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildContourColorExpr,
	buildContourLabelExpr,
	buildContourWidthExpr,
	buildGridDecimationFilter,
	buildGridValueLabelExpr
} from '$lib/vector-styles';

import { refreshPopup } from './popup';
import { currentOmUrl, currentOmUrl2 } from './stores/om-url';
import {
	anomalyPhase,
	getOMUrl,
	getOMUrlFor,
	getWindOverlayUrl,
	provisionalDateSet,
	resolveWindArrowLevel
} from './url';

// =============================================================================
// Expression helpers
// =============================================================================

// Couleur des flèches/contours selon le FOND DE CARTE (pas le chrome, toujours sombre).
const isDark = (): boolean => get(basemapTheme) === 'dark';
const lightOrDark = (light: string, dark: string): string => (isDark() ? dark : light);

/** Facteur d'opacité appliqué aux jours d'anomalie provisoires (estimation
 *  ARPEGE en attendant ERA5) : rendu plus pâle pour les distinguer du définitif. */
const PROVISIONAL_OPACITY_FACTOR = 0.45;

const getRasterOpacity = (): number => {
	const opacityValue = get(opacity) / 100;
	const base = isDark() ? Math.max(0, (opacityValue * 100 - 10) / 100) : opacityValue;
	if (get(d) === ANOMALY_DOMAIN) {
		const phase = anomalyPhase(get(time), new Date(), provisionalDateSet(get(mJ)));
		if (phase === 'provisional') return base * PROVISIONAL_OPACITY_FACTOR;
	}
	return base;
};

// Accesseurs de style lisant les stores persistés.
const getArrowStyle = (): ArrowStyle => get(arrowStyle);
const getContourStyle = (): ContourStyle => get(contourStyle);

// =============================================================================
// Layer definitions
// =============================================================================

const rasterLayer = (): SlotLayer => ({
	id: 'omRasterLayer',
	opacityProp: 'raster-opacity',
	commitOpacity: getRasterOpacity(),
	add: (map, sourceId, layerId, beforeLayer) => {
		map.addLayer(
			{
				id: layerId,
				type: 'raster',
				source: sourceId,
				paint: {
					'raster-opacity': 0.0,
					'raster-opacity-transition': { duration: 2, delay: 0 }
				}
			},
			beforeLayer
		);
	}
});

const getRasterOpacity2 = (): number => {
	const opacityValue = get(opacity2) / 100;
	return isDark() ? Math.max(0, (opacityValue * 100 - 10) / 100) : opacityValue;
};

const rasterLayer2 = (): SlotLayer => ({
	id: 'omRasterLayer2',
	opacityProp: 'raster-opacity',
	commitOpacity: getRasterOpacity2(),
	add: (map, sourceId, layerId, beforeLayer) => {
		map.addLayer(
			{
				id: layerId,
				type: 'raster',
				source: sourceId,
				paint: {
					'raster-opacity': 0.0,
					'raster-opacity-transition': { duration: 2, delay: 0 }
				}
			},
			beforeLayer
		);
	}
});

// Les flèches sont rendues par EXACTEMENT un manager à la fois :
//  - `forOverlay = true`  → arrowManager (niveau de vent dédié) quand un niveau est
//    résolu : overlay vent explicite, OU mode « selon la variable affichée » sur une
//    variable non-vent (fallback niveau dérivé, cf. resolveWindArrowLevel) ;
//  - `forOverlay = false` → vectorManager (source = variable affichée) quand la
//    variable affichée est elle-même du vent.
// Le garde `arrowsOnOverlay !== forOverlay` évite de dessiner les
// flèches en double et laisse contours/étiquettes du vectorManager suivre la variable.
const vectorArrowLayer = (forOverlay: boolean): SlotLayer => ({
	id: forOverlay ? 'omWindOverlayArrowLayer' : 'omVectorArrowLayer',
	opacityProp: 'line-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		const vectorOptions = get(vO);
		if (!vectorOptions.arrows) return;
		const arrowsOnOverlay = resolveWindArrowLevel() !== null;
		if (arrowsOnOverlay !== forOverlay) return;
		map.addLayer(
			{
				id: layerId,
				type: 'line',
				source: sourceId,
				'source-layer': 'wind-arrows',
				paint: {
					'line-opacity': 0,
					'line-opacity-transition': { duration: 200, delay: 0 },
					'line-color': buildArrowColorExpr(getArrowStyle(), isDark()),
					'line-width': buildArrowWidthExpr(getArrowStyle())
				},
				layout: { 'line-cap': 'round' }
			},
			beforeLayer
		);
	}
});

const vectorGridLayer = (): SlotLayer => ({
	id: 'omVectorGridLayer',
	opacityProp: 'circle-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		const vectorOptions = get(vO);
		if (!vectorOptions.grid) return;
		map.addLayer(
			{
				id: layerId,
				type: 'circle',
				source: sourceId,
				'source-layer': 'grid',
				paint: {
					'circle-opacity': 0,
					'circle-opacity-transition': { duration: 200, delay: 0 },
					'circle-radius': ['interpolate', ['exponential', 1.5], ['zoom'], 0, 0.1, 12, 10],
					'circle-color': 'orange'
				}
			},
			beforeLayer
		);
	}
});

const vectorContourLayer = (): SlotLayer => ({
	id: 'omVectorContourLayer',
	opacityProp: 'line-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		const vectorOptions = get(vO);
		if (!vectorOptions.contours) return;
		map.addLayer(
			{
				id: layerId,
				type: 'line',
				source: sourceId,
				'source-layer': 'contours',
				paint: {
					'line-opacity': 0,
					'line-opacity-transition': { duration: 200, delay: 0 },
					'line-color': buildContourColorExpr(getContourStyle(), isDark()),
					'line-width': buildContourWidthExpr(getContourStyle())
				}
			},
			beforeLayer
		);
	}
});

const vectorContourLabelsLayer = (): SlotLayer => ({
	id: 'omVectorContourLayerLabels',
	opacityProp: 'text-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		const vectorOptions = get(vO);
		if (!vectorOptions.contours) return;
		map.addLayer(
			{
				id: layerId,
				type: 'symbol',
				source: sourceId,
				'source-layer': 'contours',
				layout: {
					// 'line' (et non 'line-center') : étiquette répétée tous les
					// `symbol-spacing` px écran le long de l'isoligne.
					'symbol-placement': 'line',
					'symbol-spacing': 120,
					// Les contours marching-squares sont en escalier à l'échelle de la
					// maille : le contrôle de courbure de MapLibre (défaut 45°) rejette
					// sinon quasi tous les ancrages au zoom continental. Texte aligné
					// viewport (horizontal) → le rejet n'a plus d'objet, on le désactive.
					'text-rotation-alignment': 'viewport',
					'text-max-angle': 180,
					'text-font': ['Noto Sans Regular'],
					'text-field': buildContourLabelExpr(
						get(displayedVariable),
						getColorScale(get(displayedVariable), isDark(), get(omProtocolSettings).colorScales)
							.unit,
						get(unitPreferences)
					),
					'text-padding': 1
				},
				paint: {
					'text-opacity': 0,
					'text-opacity-transition': { duration: 200, delay: 0 },
					'text-color': lightOrDark('rgba(0,0,0, 0.7)', 'rgba(255,255,255, 0.8)'),
					// Le halo interrompt visuellement la ligne sous l'étiquette.
					'text-halo-color': lightOrDark('rgba(255,255,255, 0.8)', 'rgba(0,0,0, 0.6)'),
					'text-halo-width': 1.5
				}
			},
			beforeLayer
		);
	}
});

/** Géométrie de grille du domaine, dérivée des bornes (agnostique du type :
 *  régulière, projetée ou gaussienne). `nx`/`ny` sont les dimensions **globales**
 *  du domaine (pour décoder l'`id` global stable en `(i, j)`) ; le pas en degrés
 *  vient des bornes / (n − 1), valable même pour une grille projetée. */
const gridGeometryOf = (grid: Parameters<typeof GridFactory.create>[0]): GridGeometry => {
	const [minLon, minLat, maxLon, maxLat] = GridFactory.create(grid).getBounds();
	const nx = grid.nx;
	const ny = grid.ny;
	return {
		nx,
		ny,
		dxDeg: Math.abs(maxLon - minLon) / Math.max(1, nx - 1),
		dyDeg: Math.abs(maxLat - minLat) / Math.max(1, ny - 1),
		refLat: (minLat + maxLat) / 2,
		gaussian: grid.type === 'gaussian'
	};
};

const vectorGridValuesLayer = (): SlotLayer => ({
	id: 'omVectorGridValuesLayer',
	opacityProp: 'text-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		if (!get(gridValues)) return;
		// Décimation **2D** sur l'`id` GLOBAL stable (émis par le fork du package) :
		// `i % sx == 0 && j % sy == 0` → sous-réseau régulier fixe, indépendant du
		// viewport. Avec `text-allow-overlap: true` (aucune collision), les étiquettes
		// sont épinglées aux nœuds : un pan ne fait que les translater → zéro churn,
		// zéro recalcul. (Sans le fork, l'`id` était ré-indexé par sous-grille rognée
		// → `floor(id/nx)` donnait des bandes horizontales + churn au pan.)
		map.addLayer(
			{
				id: layerId,
				type: 'symbol',
				source: sourceId,
				'source-layer': 'grid',
				// Masqué seulement sous z3 (la décimation 2D borne déjà le nombre de
				// nœuds, donc pas de souci de perf à bas zoom). Plus bas, les valeurs
				// seraient illisibles.
				minzoom: 3,
				filter: buildGridDecimationFilter(gridGeometryOf(get(selectedDomain).grid)),
				layout: {
					'symbol-placement': 'point',
					'text-field': buildGridValueLabelExpr(
						get(displayedVariable),
						getColorScale(get(displayedVariable), isDark(), get(omProtocolSettings).colorScales)
							.unit,
						get(unitPreferences)
					),
					'text-font': ['Noto Sans Regular'],
					'text-size': 11,
					// Grille déjà régulière et espacée par la décimation → on désactive la
					// collision : placement déterministe, figé, aucun recalcul au pan/zoom.
					'text-allow-overlap': true,
					'text-ignore-placement': true,
					'text-padding': 2
				},
				paint: {
					'text-opacity': 0,
					'text-opacity-transition': { duration: 200, delay: 0 },
					'text-color': lightOrDark('rgba(0,0,0, 0.85)', 'rgba(255,255,255, 0.9)'),
					'text-halo-color': lightOrDark('rgba(255,255,255, 0.85)', 'rgba(0,0,0, 0.7)'),
					'text-halo-width': 1.5
				}
			},
			beforeLayer
		);
	}
});

// =============================================================================
// Coordinateur de commit : fade-in synchronisé des couches actives
// =============================================================================

/** Managers dont on attend le commit groupé pour le tick courant. */
let commitGroup: Set<SlotManager> | null = null;

/** Démarre un nouveau groupe : appeler AVANT les `update()` correspondants. */
const beginCommitGroup = (managers: SlotManager[]): void => {
	commitGroup = managers.length > 0 ? new Set(managers) : null;
	if (!commitGroup) loading.set(false);
};

/** Appelé par chaque manager (onReady) : committe tout le groupe quand tous sont prêts. */
const tryFlushGroup = (): void => {
	if (!commitGroup) return;
	const members = [...commitGroup];
	if (members.every((mgr) => mgr.isReady())) {
		for (const mgr of members) mgr.commitNow();
		commitGroup = null;
		loading.set(false);
		refreshPopup();
	}
};

/** Ajoute un manager au groupe de commit courant, ou démarre un groupe s'il n'y en a pas. */
const addToCommitGroup = (mgr: SlotManager): void => {
	if (commitGroup) commitGroup.add(mgr);
	else commitGroup = new Set([mgr]);
};

/** Appelé par un manager en erreur : on le retire du groupe pour ne pas bloquer les autres. */
const dropFromGroup = (mgr: SlotManager): void => {
	if (!commitGroup) {
		loading.set(false);
		return;
	}
	commitGroup.delete(mgr);
	if (commitGroup.size === 0) {
		commitGroup = null;
		loading.set(false);
		return;
	}
	tryFlushGroup();
};

// =============================================================================
// Manager instances
// =============================================================================

export let rasterManager: SlotManager | undefined;
export let rasterManager2: SlotManager | undefined;
export let vectorManager: SlotManager | undefined;
// Manager dédié aux flèches de l'overlay vent (niveau de vent indépendant de la
// variable affichée). Séparé du vectorManager pour que les contours/étiquettes
// continuent de suivre la variable affichée quand l'overlay est actif.
export let arrowManager: SlotManager | undefined;

const buildRasterManager2 = (map: maplibregl.Map): SlotManager =>
	new SlotManager(map, {
		sourceIdPrefix: 'omRasterSource2',
		beforeLayer: BEFORE_LAYER_RASTER_SECONDARY,
		layerFactory: () => [rasterLayer2()],
		sourceSpec: (sourceUrl) => ({ url: sourceUrl, type: 'raster', maxzoom: 14 }),
		removeDelayMs: 300,
		// Overlay optionnel : si la variable choisie n'existe pas pour le domaine
		// (ex. arome_france_convection → 404), on efface la couche au lieu de
		// laisser celle du modèle précédent figée. Cf. vectorManager.
		clearOnError: true,
		deferCommit: true,
		onReady: tryFlushGroup,
		onCommit: () => {},
		onError: () => dropFromGroup(rasterManager2!),
		slowLoadWarningMs: 10000,
		onSlowLoad: () => {}
	});

// `clipWater` ("masquer les océans") insère les couches OMfile avant la couche
// `water-clip` du basemap. Le style OpenFreeMap embarqué ne fournit pas cette
// couche : on retombe alors sur BEFORE_LAYER_VECTOR pour éviter un addLayer sur
// un beforeId inexistant (qui ferait planter MapLibre). Fonctionnalité dormante
// tant qu'aucun basemap n'expose `water-clip`.
const resolveVectorBeforeLayer = (map: maplibregl.Map, clipWater: boolean): string =>
	clipWater && map.getLayer(BEFORE_LAYER_VECTOR_WATER_CLIP)
		? BEFORE_LAYER_VECTOR_WATER_CLIP
		: BEFORE_LAYER_VECTOR;

export const createManagers = (): void => {
	const map = get(m);
	if (!map) return;

	const preferences = get(p);

	rasterManager = new SlotManager(map, {
		sourceIdPrefix: 'omRasterSource',
		beforeLayer: preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER,
		layerFactory: () => [rasterLayer()],
		sourceSpec: (sourceUrl) => ({
			url: sourceUrl,
			type: 'raster',
			maxzoom: 14
		}),
		removeDelayMs: 300,
		// Both raster and vector fire commit on slotEvents (bus conservé, sans consommateur actuel).
		deferCommit: true,
		onReady: tryFlushGroup,
		onCommit: () => slotEvents.dispatchEvent(new Event(SLOT_EVENT_COMMIT)),
		onError: () => {
			dropFromGroup(rasterManager!);
			slotEvents.dispatchEvent(new Event(SLOT_EVENT_ERROR));
		},
		slowLoadWarningMs: 10000,
		onSlowLoad: () =>
			toast.warning(
				'Le chargement des données raster peut être limité par votre bande passante ou la vitesse du serveur amont.'
			)
	});

	rasterManager2 = buildRasterManager2(map);

	vectorManager = new SlotManager(map, {
		sourceIdPrefix: 'omVectorSource',
		beforeLayer: resolveVectorBeforeLayer(map, preferences.clipWater),
		layerFactory: () => [
			vectorArrowLayer(false),
			vectorGridLayer(),
			vectorContourLayer(),
			vectorContourLabelsLayer(),
			vectorGridValuesLayer()
		],
		sourceSpec: (sourceUrl) => ({ url: sourceUrl, type: 'vector' }),
		removeDelayMs: 250,
		// Si la source vectorielle échoue (ex. domaine sans `wind_u_component_*`,
		// comme arome_france_convection → 404), on efface les flèches au lieu de
		// laisser celles du modèle précédent figées à l'écran.
		clearOnError: true,
		deferCommit: true,
		onReady: tryFlushGroup,
		onCommit: () => slotEvents.dispatchEvent(new Event(SLOT_EVENT_COMMIT)),
		onError: () => {
			dropFromGroup(vectorManager!);
			slotEvents.dispatchEvent(new Event(SLOT_EVENT_ERROR));
		}
	});

	arrowManager = new SlotManager(map, {
		sourceIdPrefix: 'omWindArrowSource',
		beforeLayer: resolveVectorBeforeLayer(map, preferences.clipWater),
		layerFactory: () => [vectorArrowLayer(true)],
		sourceSpec: (sourceUrl) => ({ url: sourceUrl, type: 'vector' }),
		removeDelayMs: 250,
		// Domaine sans `wind_u_component_*` au niveau demandé → 404 : on efface les
		// flèches au lieu de laisser celles du modèle précédent figées (cf. vectorManager).
		clearOnError: true,
		deferCommit: true,
		onReady: tryFlushGroup,
		onCommit: () => slotEvents.dispatchEvent(new Event(SLOT_EVENT_COMMIT)),
		onError: () => {
			dropFromGroup(arrowManager!);
			slotEvents.dispatchEvent(new Event(SLOT_EVENT_ERROR));
		}
	});
};

// =============================================================================
// Public layer API
// =============================================================================

export const addOmFileLayers = (): void => {
	const map = get(m);
	if (!map) return;
	const omUrl = getOMUrl();
	createManagers();
	if (!omUrl) return;

	const group: SlotManager[] = [];
	if (rasterManager) group.push(rasterManager);
	if (vectorManager) group.push(vectorManager);

	// Overlay vent = flèches sur un manager dédié (niveau de vent). Le vectorManager
	// reste sur la variable affichée (contours/grille/étiquettes). Sans overlay, on
	// efface l'arrowManager : les flèches éventuelles passent par le vectorManager.
	const windUrl = getWindOverlayUrl();
	if (windUrl && arrowManager) group.push(arrowManager);

	let raster2Url: string | undefined;
	if (get(layer2Enabled)) {
		const omUrl2 = getOMUrlFor(get(variable2));
		if (omUrl2) {
			currentOmUrl2.set(omUrl2);
			raster2Url = omUrl2;
			if (rasterManager2) group.push(rasterManager2);
		}
	}

	loading.set(true);
	beginCommitGroup(group);
	rasterManager?.update('om://' + omUrl);
	// arrowManager AVANT vectorManager : insérées d'abord sous BEFORE_LAYER_VECTOR,
	// les flèches restent SOUS les contours/étiquettes (z-order historique préservé).
	if (windUrl) arrowManager?.update('om://' + windUrl);
	else arrowManager?.destroy();
	vectorManager?.update('om://' + omUrl);
	if (raster2Url) rasterManager2?.update('om://' + raster2Url);
};

export const changeOMfileURL = (vectorOnly = false, rasterOnly = false): void => {
	const map = get(m);
	if (!map) return;

	const omUrl = getOMUrl();
	if (!omUrl) return;

	// Le primaire (raster + vecteur) ne se recharge que si SON URL a changé. On ne
	// court-circuite plus toute la fonction ici : la couche 2 a sa propre
	// déduplication (`currentOmUrl2 !== omUrl2`) plus bas et doit pouvoir se
	// rafraîchir même quand seul l'overlay change (variable/activation) — sinon il
	// reste figé sur l'ancienne donnée jusqu'au prochain changement de pas de temps.
	const primaryChanged = get(currentOmUrl) !== omUrl;

	const group: SlotManager[] = [];
	let rasterUrl: string | undefined;
	let vectorUrl: string | undefined;
	let arrowUrl: string | undefined;
	let clearArrows = false;
	let raster2Url: string | undefined;

	if (primaryChanged) {
		currentOmUrl.set(omUrl);

		const preferences = get(p);
		const vectorBefore = resolveVectorBeforeLayer(map, preferences.clipWater);
		vectorManager?.setBeforeLayer(vectorBefore);
		arrowManager?.setBeforeLayer(vectorBefore);
		rasterManager?.setBeforeLayer(preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER);

		if (!vectorOnly && rasterManager) {
			rasterUrl = omUrl;
			group.push(rasterManager);
		}
		if (!rasterOnly && vectorManager) {
			// Contours/grille/étiquettes suivent toujours la variable affichée.
			vectorUrl = omUrl;
			group.push(vectorManager);
		}
		if (!rasterOnly) {
			// Overlay vent → flèches sur arrowManager ; sinon on l'efface (flèches
			// éventuelles rendues par le vectorManager en mode « variable affichée »).
			const windUrl = getWindOverlayUrl();
			if (windUrl && arrowManager) {
				arrowUrl = windUrl;
				group.push(arrowManager);
			} else {
				clearArrows = true;
			}
		}
	}

	if (!vectorOnly) {
		if (get(layer2Enabled)) {
			if (!rasterManager2) rasterManager2 = buildRasterManager2(map);
			const omUrl2 = getOMUrlFor(get(variable2));
			if (omUrl2 && get(currentOmUrl2) !== omUrl2) {
				currentOmUrl2.set(omUrl2);
				raster2Url = omUrl2;
				if (rasterManager2) group.push(rasterManager2);
			}
		} else {
			rasterManager2?.destroy();
			rasterManager2 = undefined;
			currentOmUrl2.set('');
		}
	}

	// Effacer les flèches d'overlay avant l'éventuel early-return : éteindre l'overlay
	// ne doit pas laisser des flèches figées à l'écran, même si rien d'autre ne change.
	if (clearArrows) arrowManager?.destroy();

	// Rien à recharger (ni primaire ni overlay) : on s'arrête sans toucher au spinner.
	if (group.length === 0) return;

	loading.set(true);
	beginCommitGroup(group);
	if (rasterUrl) rasterManager?.update('om://' + rasterUrl);
	// arrowManager AVANT vectorManager (z-order : flèches sous contours/étiquettes).
	if (arrowUrl) arrowManager?.update('om://' + arrowUrl);
	if (vectorUrl) vectorManager?.update('om://' + vectorUrl);
	if (raster2Url) rasterManager2?.update('om://' + raster2Url);
};

/**
 * Réapplique le style vecteur courant en reconstruisant les couches vecteur en
 * place (le layerFactory relit `getContourStyle()`/`getArrowStyle()`). Utilisé
 * par le drawer réglages quand l'utilisateur édite un style. Tuiles en cache →
 * coût réseau quasi nul ; fade-in via le commit différé.
 */
export const reloadVectorStyle = (): void => {
	// Edge connu : pendant un changeOMfileURL en vol, getActiveSourceUrl() renvoie
	// l'URL du slot ACTIF (ancien pas de temps), pas celle en cours de chargement.
	// Éditer un style à cet instant peut faire un fondu vecteur sur l'ancien pas
	// pendant que le raster passe au nouveau (décalage d'une frame, auto-résorbé au
	// tick suivant). Suivi : lire l'URL du slot pending. Cf. issue de suivi.
	const url = vectorManager?.getActiveSourceUrl();
	// L'overlay vent a son propre manager : recharger aussi ses flèches pour qu'une
	// édition du style des flèches (arrowStyle) soit prise en compte quand il est actif.
	const arrowUrl = arrowManager?.getActiveSourceUrl();
	if ((!url || !vectorManager) && !(arrowUrl && arrowManager)) return;
	loading.set(true);
	// Fusionne dans un éventuel groupe en vol (ne pas écraser : sinon raster/raster2
	// resteraient différés indéfiniment, figés sur l'ancienne donnée).
	if (url && vectorManager) {
		addToCommitGroup(vectorManager);
		vectorManager.update(url);
	}
	if (arrowUrl && arrowManager) {
		addToCommitGroup(arrowManager);
		arrowManager.update(arrowUrl);
	}
};
