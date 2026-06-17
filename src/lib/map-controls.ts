import { get } from 'svelte/store';

import * as maplibregl from 'maplibre-gl';

import { basemapTheme } from '$lib/stores/basemap-theme';
import { map as m } from '$lib/stores/map';
import { defaultPreferences, preferences as p } from '$lib/stores/preferences';

import minimalDark from '$lib/basemap/minimal-dark.json';
import minimalLight from '$lib/basemap/minimal-light.json';
import { BEFORE_LAYER_RASTER, HILLSHADE_LAYER } from '$lib/constants';

import { refreshDepartments } from './departments-layer';
import { applyLabelsVisibility } from './labels-layer';
import { addOmFileLayers } from './layers';
import { updateUrl } from './url';

export const setMapControlSettings = () => {
	const map = get(m);
	if (!map) return;

	map.touchZoomRotate.disableRotation();
	// Attribution en mode compact (bouton « i », texte au tap) pour ne pas encombrer
	// le chrome ; l'attribution auto est désactivée dans les options de la carte.
	map.addControl(new maplibregl.AttributionControl({ compact: true }));
	// MapLibre ouvre l'attribution compacte dès que les attributions sont chargées
	// (plus tard que la création de la carte) : c'est un <details open> avec la classe
	// `maplibregl-compact-show`. On observe le conteneur et on la replie pile au moment
	// où elle s'ouvre, puis on se débranche pour laisser l'ouverture au tap.
	const attribEl = document.querySelector('.maplibregl-ctrl-attrib');
	if (attribEl) {
		const collapse = (obs?: MutationObserver) => {
			if (attribEl.hasAttribute('open') || attribEl.classList.contains('maplibregl-compact-show')) {
				attribEl.classList.remove('maplibregl-compact-show');
				attribEl.removeAttribute('open');
				obs?.disconnect();
			}
		};
		collapse();
		const observer = new MutationObserver((_, obs) => collapse(obs));
		observer.observe(attribEl, { attributes: true, attributeFilter: ['open', 'class'] });
	}
	map.addControl(
		new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true })
	);
	map.addControl(
		new maplibregl.GeolocateControl({
			fitBoundsOptions: { maxZoom: 13.5 },
			positionOptions: { enableHighAccuracy: true },
			trackUserLocation: true
		})
	);

	const globeControl = new maplibregl.GlobeControl();
	map.addControl(globeControl);
	globeControl._globeButton.addEventListener('click', () => globeHandler());

	map.scrollZoom.setZoomRate(1 / 85);
	map.scrollZoom.setWheelZoomRate(1 / 85);
};

export const addTerrainSource = (map: maplibregl.Map, name: string = 'terrainSource') => {
	map.setSky({
		'sky-color': '#000000',
		'sky-horizon-blend': 0.8,
		'horizon-color': '#80C1FF',
		'horizon-fog-blend': 0.6,
		'fog-color': '#D6EAFF',
		'fog-ground-blend': 0
	});

	map.addSource(name, {
		type: 'raster-dem',
		url: 'https://tiles.mapterhorn.com/tilejson.json'
	});
};

export const addHillshadeLayer = () => {
	const map = get(m);
	if (!map) return;

	map.addLayer(
		{
			source: 'terrainSource',
			id: HILLSHADE_LAYER,
			type: 'hillshade',
			paint: {
				'hillshade-method': 'igor',
				'hillshade-shadow-color': 'rgba(0,0,0,0.4)',
				'hillshade-highlight-color': 'rgba(255,255,255,0.35)'
			}
		},
		BEFORE_LAYER_RASTER
	);
};

export const getStyle = async (): Promise<maplibregl.StyleSpecification> => {
	const preferences = get(p);
	// Le basemap d'origine (tiles.open-meteo.com) ne renvoie pas d'en-têtes CORS,
	// contrairement à map-tiles.* / map-assets.*. On embarque donc deux styles
	// figés (même schéma OpenMapTiles) rebranchés sur les tuiles + glyphs
	// OpenFreeMap, servis en CORS natif — plus aucune dépendance réseau tierce.
	// Labels en français (cf. src/lib/basemap/*.json).
	const style = structuredClone(
		(get(basemapTheme) === 'dark'
			? minimalDark
			: minimalLight) as unknown as maplibregl.StyleSpecification
	);

	return preferences.globe ? { ...style, projection: { type: 'globe' } } : style;
};

export const terrainHandler = () => {
	const preferences = get(p);
	preferences.terrain = !preferences.terrain;
	p.set(preferences);
	updateUrl('terrain', String(preferences.terrain), String(defaultPreferences.terrain));
};

export const globeHandler = () => {
	const preferences = get(p);
	preferences.globe = !preferences.globe;
	p.set(preferences);
	updateUrl('globe', String(preferences.globe), String(defaultPreferences.globe));
};

export const reloadStyles = () => {
	getStyle().then((style) => {
		const map = get(m);
		if (!map) return;
		map.setStyle(style);
		map.once('styledata', () => {
			setTimeout(() => {
				// setStyle a retiré toutes les sources ; on recrée les DEUX sources terrain
				// comme à l'init (+page.svelte). terrainSource2 alimente le TerrainControl
				// (hillshade.ts) — sans elle, le bouton « terrain » lève « no source … terrainSource2 ».
				addTerrainSource(map);
				addTerrainSource(map, 'terrainSource2');
				const preferences = get(p);
				if (preferences.hillshade) {
					addHillshadeLayer();
				}
				// Départements AVANT les couches OMfile : même ancre (BEFORE_LAYER_VECTOR)
				// → le dernier inséré coiffe l'autre. Les ajouter d'abord garde les couches
				// météo vecteur (contours, flèches, points, valeurs) au-dessus de la ligne
				// admin. (setStyle a retiré la couche départements ; refreshDepartments la
				// recrée avec la couleur du nouveau thème de fond si l'overlay est actif.)
				refreshDepartments();
				addOmFileLayers();
				// setStyle a recréé les labels du basemap en `visible` ; on ré-applique
				// le choix de l'utilisateur (toggle « Villes & pays »).
				applyLabelsVisibility();
			}, 50);
		});
	});
};
