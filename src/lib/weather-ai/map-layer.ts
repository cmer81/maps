import { Popup } from 'maplibre-gl';

import { BEFORE_LAYER_RASTER } from '$lib/constants';

import { MERCATOR_LATITUDE, gridCanvas, gridDisplayValue, sampleGrid } from './grid';
import {
	type GridProduct,
	type TrackPoint,
	formatForecastDate,
	isTracks,
	trackFeatures
} from './products';

import type { ForecastState } from './state';
import type { Map, MapMouseEvent } from 'maplibre-gl';

const SOURCE = 'weather-ai-candidates',
	GRID = 'weather-ai-grid';
const LAYERS = [
	'weather-ai-future',
	'weather-ai-path',
	'weather-ai-points',
	'weather-ai-active',
	'weather-ai-selection'
];
export class WeatherAiMapLayer {
	private rendered?: ForecastState;
	private grid?: GridProduct;
	private canvasCache = new WeakMap<GridProduct, HTMLCanvasElement>();
	private popup?: Popup;
	private opacity = 0.8;
	constructor(
		private map: Map,
		private onPoint: (key: string, validTime: string) => void,
		private onError: (message: string) => void
	) {
		map.on('style.load', this.restore);
		map.on('click', this.click);
		map.on('mousemove', this.hover);
	}
	private restore = () => {
		if (this.rendered) this.update(this.rendered, this.opacity);
	};
	private hover = (e: MapMouseEvent) => {
		if (!this.map.getLayer('weather-ai-points')) return;
		this.map.getCanvas().style.cursor = this.map.queryRenderedFeatures(e.point, {
			layers: ['weather-ai-points']
		}).length
			? 'pointer'
			: '';
	};
	private click = (e: MapMouseEvent) => {
		if (this.map.getLayer('weather-ai-points')) {
			const feature = this.map.queryRenderedFeatures(e.point, { layers: ['weather-ai-points'] })[0];
			if (feature?.properties) {
				this.onPoint(feature.properties.key, feature.properties.valid_time);
				return;
			}
		}
		if (this.grid) {
			const value = gridDisplayValue(this.grid, sampleGrid(this.grid, e.lngLat.lng, e.lngLat.lat));
			const content = document.createElement('div');
			content.className = 'p-2 text-sm';
			content.textContent = `${this.grid.variable.unit === 'Pa' ? 'Pression' : 'Signal cyclonique'} : ${value.toFixed(this.grid.variable.unit === 'Pa' ? 1 : 3)}${this.grid.variable.unit === 'Pa' ? ' hPa' : ''} · ${formatForecastDate(this.grid.valid_time)}`;
			this.popup?.remove();
			this.popup = new Popup({ className: 'weather-ai-popup' })
				.setLngLat(e.lngLat)
				.setDOMContent(content)
				.addTo(this.map);
		}
	};
	clear() {
		this.popup?.remove();
		this.grid = undefined;
		for (const id of [...LAYERS, GRID]) if (this.map.getLayer(id)) this.map.removeLayer(id);
		for (const id of [SOURCE, GRID]) if (this.map.getSource(id)) this.map.removeSource(id);
	}
	update(state: ForecastState, opacity = 0.8) {
		this.rendered = state;
		this.opacity = opacity;
		if (!this.map.getStyle()?.layers?.length) return;
		this.clear();
		if (state.status !== 'ready' || !state.data.length) return;
		try {
			const first = state.data[0].product;
			if (isTracks(first)) {
				const points: TrackPoint[] = state.data.flatMap((d) =>
					isTracks(d.product) ? d.product.tracks : []
				);
				const valid = state.steps.find((s) => s.leadHours === state.leadHours)?.validTime ?? '';
				const data = trackFeatures(points, valid, state.member);
				this.map.addSource(SOURCE, { type: 'geojson', data });
				const color: ['get', string] = ['get', 'color'];
				this.map.addLayer({
					id: LAYERS[0],
					type: 'line',
					source: SOURCE,
					filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'future'], true]],
					paint: {
						'line-color': color,
						'line-width': 2,
						'line-opacity': 0.55,
						'line-dasharray': [2, 2]
					}
				});
				this.map.addLayer({
					id: LAYERS[1],
					type: 'line',
					source: SOURCE,
					filter: [
						'all',
						['==', ['geometry-type'], 'LineString'],
						['==', ['get', 'future'], false]
					],
					paint: { 'line-color': color, 'line-width': 2.5 },
					layout: { 'line-cap': 'round' }
				});
				this.map.addLayer({
					id: LAYERS[2],
					type: 'circle',
					source: SOURCE,
					filter: ['==', ['geometry-type'], 'Point'],
					paint: {
						'circle-color': color,
						'circle-radius': 4,
						'circle-stroke-color': '#13253d',
						'circle-stroke-width': 1.2
					}
				});
				this.map.addLayer({
					id: LAYERS[3],
					type: 'circle',
					source: SOURCE,
					filter: ['==', ['get', 'active'], true],
					paint: {
						'circle-color': color,
						'circle-radius': 7,
						'circle-stroke-color': '#ffffff',
						'circle-stroke-width': 2
					}
				});
				this.map.addLayer({
					id: LAYERS[4],
					type: 'circle',
					source: SOURCE,
					filter: [
						'all',
						['==', ['geometry-type'], 'Point'],
						['==', ['get', 'key'], state.selectedTrack ?? ''],
						['==', ['get', 'active'], true]
					],
					paint: {
						'circle-color': 'transparent',
						'circle-radius': 11,
						'circle-stroke-color': '#ffffff',
						'circle-stroke-width': 2
					}
				});
			} else {
				this.grid = first;
				let canvas = this.canvasCache.get(first);
				if (!canvas) {
					canvas = gridCanvas(first);
					this.canvasCache.set(first, canvas);
				}
				this.map.addSource(GRID, {
					type: 'canvas',
					canvas,
					animate: false,
					coordinates: [
						[-180, MERCATOR_LATITUDE],
						[180, MERCATOR_LATITUDE],
						[180, -MERCATOR_LATITUDE],
						[-180, -MERCATOR_LATITUDE]
					]
				});
				this.map.addLayer(
					{
						id: GRID,
						type: 'raster',
						source: GRID,
						paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 }
					},
					this.map.getLayer(BEFORE_LAYER_RASTER) ? BEFORE_LAYER_RASTER : undefined
				);
			}
		} catch (e) {
			this.clear();
			this.onError(e instanceof Error ? e.message : 'La couche ne peut pas être affichée.');
		}
	}
	destroy() {
		this.map.off('style.load', this.restore);
		this.map.off('click', this.click);
		this.map.off('mousemove', this.hover);
		this.map.getCanvas().style.cursor = '';
		this.clear();
	}
}
