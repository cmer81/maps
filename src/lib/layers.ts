import { get } from 'svelte/store';

import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { map as m } from '$lib/stores/map';
import { loading, opacity, opacity2, preferences as p } from '$lib/stores/preferences';
import { metaJson as mJ, time } from '$lib/stores/time';
import { domain as d, layer2Enabled, variable2 } from '$lib/stores/variables';
import { vectorOptions as vO } from '$lib/stores/vector';
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
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildContourColorExpr,
	buildContourWidthExpr
} from '$lib/vector-styles';

import { refreshPopup } from './popup';
import { currentOmUrl, currentOmUrl2 } from './stores/om-url';
import { anomalyPhase, getOMUrl, getOMUrlFor, getWindOverlayUrl, provisionalDateSet } from './url';

// =============================================================================
// Expression helpers
// =============================================================================

const isDark = (): boolean => mode.current === 'dark';
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

const vectorArrowLayer = (): SlotLayer => ({
	id: 'omVectorArrowLayer',
	opacityProp: 'line-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		const vectorOptions = get(vO);
		if (!vectorOptions.arrows) return;
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
					'symbol-placement': 'line-center',
					'symbol-spacing': 1,
					'text-font': ['Noto Sans Regular'],
					'text-field': ['to-string', ['get', 'value']],
					'text-padding': 1,
					'text-offset': [0, -0.6]
				},
				paint: {
					'text-opacity': 0,
					'text-opacity-transition': { duration: 200, delay: 0 },
					'text-color': lightOrDark('rgba(0,0,0, 0.7)', 'rgba(255,255,255, 0.8)')
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
			vectorArrowLayer(),
			vectorGridLayer(),
			vectorContourLayer(),
			vectorContourLabelsLayer()
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

	const windUrl = getWindOverlayUrl();
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
	vectorManager?.update('om://' + (windUrl ?? omUrl));
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
	let raster2Url: string | undefined;

	if (primaryChanged) {
		currentOmUrl.set(omUrl);

		const preferences = get(p);
		vectorManager?.setBeforeLayer(resolveVectorBeforeLayer(map, preferences.clipWater));
		rasterManager?.setBeforeLayer(preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER);

		if (!vectorOnly && rasterManager) {
			rasterUrl = omUrl;
			group.push(rasterManager);
		}
		if (!rasterOnly && vectorManager) {
			const windUrl = getWindOverlayUrl();
			vectorUrl = windUrl ?? omUrl;
			group.push(vectorManager);
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

	// Rien à recharger (ni primaire ni overlay) : on s'arrête sans toucher au spinner.
	if (group.length === 0) return;

	loading.set(true);
	beginCommitGroup(group);
	if (rasterUrl) rasterManager?.update('om://' + rasterUrl);
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
	if (!url || !vectorManager) return;
	loading.set(true);
	// Fusionne dans un éventuel groupe en vol (ne pas écraser : sinon raster/raster2
	// resteraient différés indéfiniment, figés sur l'ancienne donnée).
	addToCommitGroup(vectorManager);
	vectorManager.update(url);
};
