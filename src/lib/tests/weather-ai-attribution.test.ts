import { render } from 'svelte/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { domain } from '$lib/stores/variables';

import PanelContent from '$lib/components/chrome/panel-content.svelte';

import { WEATHER_AI_DOMAIN } from '$lib/constants';
import { SlotManager } from '$lib/slot-manager';
import {
	WEATHER_AI_ATTRIBUTION,
	WEATHER_AI_SOURCES_LINK_ATTR,
	omSourceAttribution,
	registerWeatherAiDomain
} from '$lib/weather-ai-domain';

// Retour de Pam sur #142 : pas de bandeau jaune sous le sélecteur pour le modèle
// Weather AI (réservé aux trajectoires, onglet Cyclones IA) ; l'attribution
// obligatoire passe par la notice « i » de la carte, tant que la couche est affichée.

const BUCKET = 'https://weather-ai-om.test';
const WEATHER_AI_URL = `om://${BUCKET}/data_spatial/${WEATHER_AI_DOMAIN}/2026/10/22/0600Z/2026-10-22T1800.om?variable=pressure_msl`;
const ECMWF_URL =
	'om://https://openmeteo.s3.amazonaws.com/data_spatial/ecmwf_ifs025/2026/10/22/0600Z/2026-10-22T1800.om?variable=pressure_msl';

const WARNING = 'Prévision expérimentale — ne remplace aucune alerte';

/** Faux MapLibre minimal : retient la spec de chaque source ajoutée. */
class FakeMap {
	sources = new Map<string, { spec: { attribution?: string }; loaded(): boolean }>();
	layers = new Set<string>();
	style = { getSource: (id: string) => this.sources.get(id) };
	getStyle = () => ({ layers: [] });
	getSource = (id: string) => this.sources.get(id);
	addSource = (id: string, spec: { attribution?: string }) =>
		this.sources.set(id, { spec, loaded: () => true });
	removeSource = (id: string) => this.sources.delete(id);
	addLayer = ({ id }: { id: string }) => this.layers.add(id);
	getLayer = (id: string) => (this.layers.has(id) ? {} : undefined);
	removeLayer = (id: string) => this.layers.delete(id);
	setPaintProperty = () => {};
	on = () => {};
	off = () => {};
	/** Attributions des sources présentes, comme la notice MapLibre les agrège. */
	attributions = () => [...this.sources.values()].map((s) => s.spec.attribution).filter(Boolean);
}

const rasterManager = (map: FakeMap) =>
	new SlotManager(map as never, {
		sourceIdPrefix: 'omRasterSource',
		beforeLayer: 'before',
		removeDelayMs: 0,
		sourceSpec: (url) => ({ url, type: 'raster', maxzoom: 14 }),
		layerFactory: () => [
			{
				id: 'raster',
				opacityProp: 'raster-opacity',
				commitOpacity: 1,
				add: (m, sourceId, layerId) =>
					(m as unknown as FakeMap).addLayer({ id: layerId, source: sourceId } as never)
			}
		]
	});

describe('attribution Weather AI dans la notice « i » de la carte', () => {
	it('source Weather AI : attribution du producteur à l’identique, puis lien vers les mentions', () => {
		const { attribution } = omSourceAttribution(WEATHER_AI_URL);
		expect(attribution).toContain(WEATHER_AI_ATTRIBUTION);
		expect(attribution).toMatch(
			new RegExp(`<a href="#" ${WEATHER_AI_SOURCES_LINK_ATTR}>Sources et licence</a>$`)
		);
	});

	it('source d’un autre modèle : aucune attribution Weather AI', () => {
		expect(omSourceAttribution(ECMWF_URL)).toEqual({});
	});

	describe('SlotManager', () => {
		beforeEach(() => vi.useFakeTimers());
		afterEach(() => vi.useRealTimers());

		it('déclare l’attribution sur la source Weather AI, puis la retire au changement de modèle', () => {
			const map = new FakeMap();
			const mgr = rasterManager(map);
			mgr.update(WEATHER_AI_URL);
			expect(map.attributions()).toEqual([omSourceAttribution(WEATHER_AI_URL).attribution]);
			// La spec propre au manager est conservée.
			expect(map.sources.get('omRasterSource_A')?.spec).toMatchObject({
				url: WEATHER_AI_URL,
				type: 'raster',
				maxzoom: 14
			});

			mgr.update(ECMWF_URL); // autre modèle sélectionné
			vi.runAllTimers(); // retrait différé de l'ancien slot
			expect(map.sources.has('omRasterSource_A')).toBe(false);
			expect(map.attributions()).toEqual([]);
		});
	});
});

describe('onglets du panneau', () => {
	beforeEach(() => {
		vi.stubEnv('VITE_WEATHER_AI_OM_BUCKET_URL', BUCKET + '/');
		registerWeatherAiDomain();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		domain.set('arome_france');
	});

	it('Données avec Weather AI sélectionné : pas de bandeau expérimental', () => {
		domain.set(WEATHER_AI_DOMAIN);
		const { body } = render(PanelContent, { props: { tab: 'layers' } });
		expect(body).toContain('Weather AI (WeatherNext)'); // bien le modèle sélectionné
		expect(body).not.toContain(WARNING);
		expect(body).not.toContain('Modèle IA expérimental');
	});

	it('Cyclones IA : l’avertissement des trajectoires reste affiché', () => {
		domain.set(WEATHER_AI_DOMAIN);
		const { body } = render(PanelContent, { props: { tab: 'cyclones' } });
		expect(body).toContain(WARNING);
	});
});
