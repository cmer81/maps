// Câblage MapLibre des superpositions Weather AI (cyclones, trajectoires, zones
// à surveiller, cônes). Sources `geojson` dédiées (pattern de
// `departments-layer.ts`) posées AU-DESSUS de toutes les couches, sur n'importe
// quel fond : elles ne passent pas par le protocole `om://` (documents JSON
// d'une autre API, run propre). L'échéance suit la frise principale
// (`weatherAiTime`, dérivée de `time`). Les champs continus (pression,
// probabilité) ne sont pas rendus ici : ils viendront comme variables d'un
// modèle du sélecteur.
//
// Affichage atomique : chaque état (run × échéance × couches × cônes × thème)
// est préparé hors écran puis commuté d'un bloc par `layer-switcher.ts` — un
// slot neuf par état, jamais de mise à jour en place d'une source affichée.
// `setStyle` (donc `reloadStyles()`) purge les slots : `syncWeatherAiLayers()`
// est rappelé après chaque re-style et à chaque changement d'état.
import { get } from 'svelte/store';

import * as maplibregl from 'maplibre-gl';

import { basemapTheme } from '$lib/stores/basemap-theme';
import { map as mStore } from '$lib/stores/map';
import {
	weatherAiCones,
	weatherAiDisplayed,
	weatherAiLayers,
	weatherAiRun,
	weatherAiStatus,
	weatherAiTime
} from '$lib/stores/weather-ai';

import {
	CONE_REASON_LABELS,
	type ConesProduct,
	type PreviousCones,
	coneAt,
	conesToGeoJson,
	isConeReason,
	shortRunLabel
} from './cones';
import { CATALOG_POLL_MS } from './controller';
import { displayedAfterCommit } from './displayed';
import { createLayerSwitcher } from './layer-switcher';
import { type LoadedRun, leadHours } from './loader';
import { formatLead, formatUtc } from './render';
import { RunScopedCache, renderKey } from './render-cache';
import {
	CANDIDATE_LABEL,
	buildTracks,
	msToKmh,
	tracksToGeoJson,
	windColorExpression
} from './tracks';

import type { WeatherAiLayers } from '$lib/stores/weather-ai';

type Fc = GeoJSON.FeatureCollection;

/** Tout ce qu'un slot affiche, préparé avant d'être monté. */
export interface RenderPlan {
	dark: boolean;
	trackLines?: Fc;
	trackPoints?: Fc;
	cones?: Fc;
	coneCentres?: Fc;
	/** Les cônes sont ceux d'un run antérieur : rendu atténué, contour en pointillés. */
	previousCones?: boolean;
}

// Rendus mémoïsés pour le run affiché (données immuables) ; un rendu terminé
// après une bascule de run est refusé.
const tracksCache = new RunScopedCache<ReturnType<typeof buildTracks>>();
const conesCache = new RunScopedCache<ReturnType<typeof conesToGeoJson>>();

export interface PlanInput {
	run: LoadedRun | undefined;
	vt: string | undefined;
	layers: WeatherAiLayers;
	cones: ConesProduct | null;
	/**
	 * Identité du document des cônes (`sha256` annoncé par le catalogue) : un
	 * document remplacé dans le même run change la signature et la géométrie.
	 */
	conesId?: string;
	/** Cônes du run précédent, gardés tant que `cones` est absent pour le run affiché. */
	previous?: PreviousCones | null;
	dark: boolean;
}

/** Signature de l'état à afficher : deux appels de même signature ne recommutent pas. */
export const planSignature = ({ run, vt, layers, cones, conesId, previous, dark }: PlanInput) =>
	[
		run?.runId ?? '-',
		Object.keys(run?.loaded ?? {})
			.sort()
			.join(','),
		vt ?? '-',
		Object.entries(layers)
			.filter(([, on]) => on)
			.map(([k]) => k)
			.join(','),
		cones
			? `${cones.run_id}:${conesId ?? ''}`
			: previous
				? `prev:${previous.runId}:${previous.sha256 ?? ''}`
				: '-',
		dark ? 'dark' : 'light'
	].join('|');

/** Prépare hors écran tout le contenu d'un slot ; `null` = rien à afficher. */
export async function preparePlan({
	run,
	vt,
	layers,
	cones,
	conesId,
	previous,
	dark
}: PlanInput): Promise<RenderPlan | null> {
	if (!run || !vt) return null;
	const runId = run.runId;
	const plan: RenderPlan = { dark };

	const tracksProduct = Object.values(run.loaded).find((p) => p.kind === 'tracks');
	if (layers.tracks && tracksProduct?.kind === 'tracks') {
		const gen = tracksCache.scope(runId);
		const key = renderKey(runId, tracksProduct.product.productId, '*');
		let tracks = tracksCache.get(key);
		if (!tracks) {
			tracks = buildTracks(
				tracksProduct.frames.map((f) => f.product),
				runId
			);
			tracksCache.set(gen, key, tracks);
		}
		const { lines, points } = tracksToGeoJson(tracks, vt);
		plan.trackLines = lines;
		plan.trackPoints = points;
	}

	// Cônes : seulement ceux du run affiché, déjà validés (mention exacte).
	if (layers.cones && cones && cones.run_id === runId) {
		// Portée run × document : un document remplacé (nouveau sha256) purge l'ancienne géométrie.
		const gen = conesCache.scope(`${runId}#${conesId ?? ''}`);
		const key = renderKey(runId, cones.product_id, conesId ?? '*');
		let geo = conesCache.get(key);
		if (!geo) {
			geo = conesToGeoJson(cones);
			conesCache.set(gen, key, geo);
		}
		plan.cones = geo.envelopes;
		plan.coneCentres = geo.centres;
	} else if (layers.cones && previous && previous.runId !== runId) {
		// Cônes du run précédent (ceux du run affiché en cours de calcul) : rendus à part.
		const id = `prev:${previous.runId}#${previous.sha256 ?? ''}`;
		const gen = conesCache.scope(`${runId}#${id}`);
		const key = renderKey(runId, previous.doc.product_id, id);
		let geo = conesCache.get(key);
		if (!geo) {
			geo = conesToGeoJson(previous.doc);
			conesCache.set(gen, key, geo);
		}
		plan.cones = geo.envelopes;
		plan.coneCentres = geo.centres;
		plan.previousCones = true;
	}

	const empty = !plan.trackLines && !plan.cones && !plan.coneCentres;
	return empty ? null : plan;
}

// ---- Montage d'un slot -----------------------------------------------------

type Part = 'trackLines' | 'trackPoints' | 'cones' | 'coneCentres';

interface LayerDef {
	id: string;
	part: Part;
	/** `previous` : cônes d'un run antérieur (atténués, pointillés). */
	spec: (src: string, dark: boolean, previous: boolean) => maplibregl.LayerSpecification;
	/** Propriétés d'opacité : à 0 au montage, valeur cible à l'affichage. */
	opacity: (dark: boolean, previous: boolean) => Record<string, unknown>;
}

const ink = (dark: boolean) => (dark ? '#e2e8f0' : '#1e293b');
const halo = (dark: boolean) => (dark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.9)');

/** Couches d'un slot, dans l'ordre d'empilement (premier = dessous). */
const LAYER_DEFS: LayerDef[] = [
	{
		id: 'cones90',
		part: 'cones',
		spec: (source) => ({
			id: '',
			type: 'fill',
			source,
			filter: ['==', ['get', 'level'], '0.90'],
			paint: { 'fill-color': '#f8fafc' }
		}),
		opacity: (_dark, previous) => ({ 'fill-opacity': previous ? 0.12 : 0.28 })
	},
	{
		id: 'cones68',
		part: 'cones',
		spec: (source) => ({
			id: '',
			type: 'fill',
			source,
			filter: ['==', ['get', 'level'], '0.68'],
			paint: { 'fill-color': '#f8fafc' }
		}),
		opacity: (_dark, previous) => ({ 'fill-opacity': previous ? 0.22 : 0.5 })
	},
	{
		id: 'conesOutline',
		part: 'cones',
		spec: (source, dark, previous) => ({
			id: '',
			type: 'line',
			source,
			paint: {
				'line-color': ink(dark),
				'line-width': previous ? 1.2 : 0.8,
				...(previous ? { 'line-dasharray': [3, 2] } : {})
			}
		}),
		opacity: (_dark, previous) => ({ 'line-opacity': previous ? 0.8 : 0.6 })
	},
	{
		id: 'coneCentres',
		part: 'coneCentres',
		spec: (source, dark) => ({
			id: '',
			type: 'circle',
			source,
			paint: { 'circle-radius': 3, 'circle-color': ink(dark) }
		}),
		opacity: (_dark, previous) => ({ 'circle-opacity': previous ? 0.3 : 0.5 })
	},
	// Candidats de cyclogenèse : rendu distinct (pointillés, halo), jamais coloré par le vent.
	{
		id: 'candidateLines',
		part: 'trackLines',
		spec: (source) => ({
			id: '',
			type: 'line',
			source,
			filter: ['==', ['get', 'kind'], 'candidate'],
			paint: { 'line-color': '#c4b5fd', 'line-width': 1.5, 'line-dasharray': [2, 2] }
		}),
		opacity: () => ({ 'line-opacity': 1 })
	},
	{
		id: 'candidateHalos',
		part: 'trackPoints',
		spec: (source) => ({
			id: '',
			type: 'circle',
			source,
			filter: ['==', ['get', 'kind'], 'candidate'],
			paint: {
				'circle-radius': ['case', ['get', 'current'], 14, 5],
				'circle-color': '#c4b5fd',
				'circle-stroke-color': '#c4b5fd',
				'circle-stroke-width': 1.2
			}
		}),
		opacity: () => ({
			'circle-opacity': ['case', ['get', 'current'], 0.25, 0.12],
			'circle-stroke-opacity': ['case', ['get', 'current'], 0.9, 0.4]
		})
	},
	{
		id: 'declaredLines',
		part: 'trackLines',
		spec: (source, dark) => ({
			id: '',
			type: 'line',
			source,
			filter: ['==', ['get', 'kind'], 'declared'],
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: { 'line-color': ink(dark), 'line-width': 2 }
		}),
		opacity: () => ({ 'line-opacity': 1 })
	},
	{
		id: 'declaredPoints',
		part: 'trackPoints',
		spec: (source, dark) => ({
			id: '',
			type: 'circle',
			source,
			filter: ['==', ['get', 'kind'], 'declared'],
			paint: {
				'circle-radius': ['case', ['get', 'current'], 8, 4.5],
				'circle-color': windColorExpression() as maplibregl.ExpressionSpecification,
				'circle-stroke-color': ink(dark),
				'circle-stroke-width': ['case', ['get', 'current'], 2, 1]
			}
		}),
		opacity: () => ({ 'circle-opacity': 1, 'circle-stroke-opacity': 1 })
	},
	{
		id: 'trackLabels',
		part: 'trackPoints',
		spec: (source, dark) => ({
			id: '',
			type: 'symbol',
			source,
			filter: ['get', 'current'],
			layout: {
				'text-field': ['get', 'label'],
				'text-font': ['Noto Sans Regular'],
				'text-size': 12,
				'text-offset': [0, -1.6],
				'text-allow-overlap': true
			},
			paint: { 'text-color': ink(dark), 'text-halo-color': halo(dark), 'text-halo-width': 1.5 }
		}),
		opacity: () => ({ 'text-opacity': 1 })
	}
];

const sourceId = (slot: string, part: Part) => `weatherAi_${part}_${slot}`;
const layerId = (slot: string, def: string) => `weatherAi_${def}_${slot}`;

/** Parties présentes dans un plan, et donnée de chacune. */
function planParts(plan: RenderPlan): Partial<Record<Part, Fc>> {
	return {
		trackLines: plan.trackLines,
		trackPoints: plan.trackPoints,
		cones: plan.cones,
		coneCentres: plan.coneCentres
	};
}

// Parties et opacités cibles de chaque slot monté.
const mounted = new Map<string, { parts: Part[]; dark: boolean; previous: boolean }>();

function mapAdapter(map: maplibregl.Map) {
	return {
		mount(slot: string, plan: RenderPlan) {
			const entries = Object.entries(planParts(plan)).filter(([, v]) => v !== undefined) as [
				Part,
				Fc
			][];
			for (const [part, data] of entries) {
				map.addSource(sourceId(slot, part), { type: 'geojson', data });
			}
			const parts = entries.map(([p]) => p);
			for (const def of LAYER_DEFS) {
				if (!parts.includes(def.part)) continue;
				const spec = def.spec(
					sourceId(slot, def.part),
					plan.dark,
					!!plan.previousCones
				) as maplibregl.LayerSpecification & {
					paint?: Record<string, unknown>;
				};
				const hidden = Object.fromEntries(
					Object.keys(def.opacity(plan.dark, !!plan.previousCones)).map((k) => [k, 0])
				);
				map.addLayer({
					...spec,
					id: layerId(slot, def.id),
					paint: { ...(spec.paint ?? {}), ...hidden }
				} as maplibregl.LayerSpecification);
			}
			mounted.set(slot, { parts, dark: plan.dark, previous: !!plan.previousCones });
		},
		loaded(slot: string) {
			const m = mounted.get(slot);
			if (!m) return true;
			return m.parts.every((p) => {
				const id = sourceId(slot, p);
				return !map.getSource(id) || map.isSourceLoaded(id);
			});
		},
		show(slot: string) {
			const m = mounted.get(slot);
			if (!m) return;
			for (const def of LAYER_DEFS) {
				if (!m.parts.includes(def.part)) continue;
				for (const [prop, value] of Object.entries(def.opacity(m.dark, m.previous))) {
					map.setPaintProperty(
						layerId(slot, def.id),
						prop as Parameters<maplibregl.Map['setPaintProperty']>[1],
						value as Parameters<maplibregl.Map['setPaintProperty']>[2]
					);
				}
			}
		},
		unmount(slot: string) {
			for (const def of LAYER_DEFS) {
				const id = layerId(slot, def.id);
				if (map.getLayer(id)) map.removeLayer(id);
			}
			for (const part of mounted.get(slot)?.parts ?? []) {
				const id = sourceId(slot, part);
				if (map.getSource(id)) map.removeSource(id);
			}
			mounted.delete(slot);
		},
		exists(slot: string) {
			const m = mounted.get(slot);
			return !!m && m.parts.some((p) => !!map.getSource(sourceId(slot, p)));
		},
		onChange(cb: () => void) {
			map.on('sourcedata', cb);
			map.on('idle', cb);
			return () => {
				map.off('sourcedata', cb);
				map.off('idle', cb);
			};
		}
	};
}

/** Message d'échec de rendu (distinct des erreurs de chargement du contrôleur). */
export const RENDER_TIMEOUT_MESSAGE =
	"Affichage Weather AI incomplet (délai dépassé) : l'état précédent est conservé, nouvel essai au prochain relevé.";

let retryTimer: ReturnType<typeof setTimeout> | undefined;

let switcherMap: maplibregl.Map | undefined;
let switcher: ReturnType<typeof createLayerSwitcher<RenderPlan>> | undefined;

/**
 * Met la carte en accord avec l'état (run, échéance, couches actives, cônes).
 * Idempotent ; sûr après un re-style. Le nouvel état n'apparaît qu'une fois
 * entièrement prêt, d'un bloc.
 */
export async function syncWeatherAiLayers(): Promise<void> {
	const map = get(mStore);
	if (!map) return;
	if (!map.isStyleLoaded()) {
		map.once('idle', () => void syncWeatherAiLayers());
		return;
	}
	if (switcherMap !== map) {
		switcherMap = map;
		mounted.clear();
		weatherAiDisplayed.set(null);
		switcher = createLayerSwitcher(mapAdapter(map));
	}
	// Un re-style a purgé les slots : on oublie ceux qui n'existent plus, et la
	// carte n'affiche plus rien tant que le nouvel état n'est pas commuté.
	for (const slot of [...mounted.keys()]) {
		if (!mounted.get(slot)!.parts.some((p) => map.getSource(sourceId(slot, p)))) {
			mounted.delete(slot);
		}
	}
	if (!switcher!.activeSlot) weatherAiDisplayed.set(null);

	const cones = get(weatherAiCones);
	const run = get(weatherAiRun);
	const input: PlanInput = {
		run,
		vt: get(weatherAiTime),
		layers: get(weatherAiLayers),
		cones: cones && run && cones.runId === run.runId ? cones.doc : null,
		conesId: cones?.sha256,
		previous: cones && run && cones.runId === run.runId ? (cones.previous ?? null) : null,
		dark: get(basemapTheme) === 'dark'
	};
	clearTimeout(retryTimer);
	retryTimer = undefined;
	try {
		const result = await switcher!.commit(planSignature(input), () => preparePlan(input));
		weatherAiDisplayed.set(
			displayedAfterCommit(result, input, get(weatherAiDisplayed), !!switcher!.activeSlot)
		);
		if (result === 'timeout') {
			// Slot incomplet retiré par le commutateur, état précédent conservé.
			console.warn('[weather-ai] render timeout, previous state kept');
			weatherAiStatus.set({ state: 'error', message: RENDER_TIMEOUT_MESSAGE });
			retryTimer = setTimeout(() => void syncWeatherAiLayers(), CATALOG_POLL_MS);
		} else if (
			(result === 'shown' || result === 'cleared') &&
			get(weatherAiStatus).message === RENDER_TIMEOUT_MESSAGE
		) {
			weatherAiStatus.set({ state: 'ready' });
		}
	} catch (err) {
		console.warn('[weather-ai] render failed', err);
	}
	installTooltips(map);
}

// ---- Infobulle -------------------------------------------------------------

const esc = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);

/** Nombre des documents de l'API pour le HTML de l'infobulle : entier, ou « ? » (jamais de texte brut). */
const int = (v: unknown) => {
	const n = Number(v);
	return Number.isFinite(n) ? String(Math.round(n)) : '?';
};

let tooltipMap: maplibregl.Map | undefined;
let tooltip: maplibregl.Popup | undefined;

function tooltipHtml(feature: maplibregl.MapGeoJSONFeature, coneCentres: boolean): string {
	const run = get(weatherAiRun);
	const p = feature.properties as Record<string, unknown>;
	const time = String(p.time ?? '');
	const when = `${esc(formatLead(leadHours(run?.initTime, time)))} · ${esc(formatUtc(time))}`;
	if (coneCentres) {
		// Cônes d'un run antérieur : échéance comptée depuis LEUR amorce, run nommé.
		const prev = get(weatherAiCones);
		const old = prev && !prev.doc && prev.runId === run?.runId ? prev.previous : undefined;
		const coneWhen = old
			? `${esc(formatLead(leadHours(old.doc.init_time, time)))} du run ${esc(shortRunLabel(old.doc.init_time))} (run précédent) · ${esc(formatUtc(time))}`
			: when;
		return `<strong>Cône ${esc(String(p.storm).split(':').pop() ?? '')}</strong><br>${coneWhen}<br>Membres : ${int(p.members)}/${int(p.memberCount)}<br>Rayon 68 % : ${int(p.r68)} km · 90 % : ${int(p.r90)} km`;
	}
	if (p.kind === 'candidate') {
		return `<strong>${CANDIDATE_LABEL}</strong><br>${when}<br>Candidat de cyclogenèse détecté par le modèle, sans système réel associé. Ce n'est pas un cyclone.`;
	}
	let html = `<strong>${esc(String(p.label))}</strong><br>${when}<br>Pression centrale : ${int(p.mslp)} hPa<br>Vent max : ${int(msToKmh(Number(p.vmax)))} km/h`;
	const cones = get(weatherAiCones);
	if (get(weatherAiLayers).cones && cones?.doc && cones.runId === run?.runId) {
		const cone = coneAt(cones.doc, String(p.id), time);
		if (cone && !cone.available)
			html += `<br>Cône indisponible : ${esc(isConeReason(cone.reason) ? CONE_REASON_LABELS[cone.reason] : 'raison inconnue')}`;
		const storm = cones.doc.storms.find((s) => s.storm_id === p.id);
		if (!cone && storm?.hemisphere === 'south') {
			html += `<br>Pas de cône au-delà de +${int(storm.maximum_lead_hours)} h (hémisphère sud)`;
		}
	}
	return html;
}

/** Infobulle au survol des positions de trajectoire et des centres de cône du slot affiché. */
function installTooltips(map: maplibregl.Map) {
	if (tooltipMap === map) return;
	tooltipMap = map;
	tooltip = new maplibregl.Popup({
		closeButton: false,
		closeOnClick: false,
		className: 'weather-ai-tooltip'
	});
	let hovering = false;
	map.on('mousemove', (e) => {
		const slot = switcher?.activeSlot;
		const ids = slot
			? ['declaredPoints', 'candidateHalos', 'coneCentres']
					.map((d) => layerId(slot, d))
					.filter((id) => map.getLayer(id))
			: [];
		const f = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids })[0] : undefined;
		if (!f) {
			if (hovering) {
				hovering = false;
				tooltip?.remove();
				map.getCanvas().style.cursor = '';
			}
			return;
		}
		hovering = true;
		map.getCanvas().style.cursor = 'pointer';
		const isCone = f.layer.id === layerId(slot!, 'coneCentres');
		tooltip!.setLngLat(e.lngLat).setHTML(tooltipHtml(f, isCone)).addTo(map);
	});
}
