<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { get } from 'svelte/store';

	import {
		type Domain,
		GridFactory,
		domainOptions,
		omProtocol,
		updateCurrentBounds
	} from '@openmeteo/weather-map-layer';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { toast } from 'svelte-sonner';

	import { version } from '$app/environment';

	import { showDepartments } from '$lib/stores/departments';
	import { map } from '$lib/stores/map';
	import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import { currentOmUrl } from '$lib/stores/om-url';
	import {
		bottomChromeHeight,
		exportFrameVisible,
		loading,
		localStorageVersion,
		resetStates,
		tileSize,
		tileSizeSet,
		url
	} from '$lib/stores/preferences';
	import { metaJson, modelRun, time } from '$lib/stores/time';
	import { domain, selectedDomain, selectedVariable, variable } from '$lib/stores/variables';
	import { windOverlayEnabled, windOverlayLevel } from '$lib/stores/vector';

	import AppChrome from '$lib/components/chrome/app-chrome.svelte';
	import Scrim from '$lib/components/chrome/scrim.svelte';
	import ClippingPanel from '$lib/components/clipping/clipping-panel.svelte';
	import Dropzone from '$lib/components/dropzone/dropzone.svelte';
	import HelpDialog from '$lib/components/help/help-dialog.svelte';
	import KeyboardHandler from '$lib/components/keyboard/keyboard-handler.svelte';
	import Spinner from '$lib/components/loading/spinner.svelte';
	import Scale from '$lib/components/scale/scale.svelte';
	import SoundingPanel from '$lib/components/sounding/sounding-panel.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';

	import { DOMAIN_DEFAULT_VIEWS } from '$lib/constants';
	import { ensureDepartmentsLayer, refreshDepartments } from '$lib/departments-layer';
	import { checkHighDefinition } from '$lib/helpers';
	import { initHillshadeFromPrefs } from '$lib/hillshade';
	import { initNeighborPrefetch } from '$lib/neighbor-prefetch';
	import { addOmFileLayers, changeOMfileURL } from '$lib/layers';
	import { addTerrainSource, getStyle, setMapControlSettings } from '$lib/map-controls';
	import { getInitialMetaData, getMetaData, matchVariableOrFirst } from '$lib/metadata';
	import { addPopup } from '$lib/popup';
	import { formatISOWithoutTimezone } from '$lib/time-format';
	import { findTimeStep } from '$lib/time-utils';
	import { updateUrl, urlParamsToPreferences } from '$lib/url';

	import '../styles.css';

	import type { RequestParameters } from 'maplibre-gl';

	let clippingPanel: ReturnType<typeof ClippingPanel>;

	let mapContainer: HTMLElement | null;

	let stopNeighborPrefetch: (() => void) | undefined;

	onMount(async () => {
		$url = new URL(document.location.href);
		urlParamsToPreferences();

		// first time on load, check if monitor supports high definition, for increased tile size
		if (!get(tileSizeSet)) {
			if (checkHighDefinition()) {
				tileSize.set(1024);
			}
			tileSizeSet.set(true);
		}

		// resets all the states when a new version is set in 'package.json' and version already set before
		if (version !== $localStorageVersion) {
			if ($localStorageVersion) {
				await resetStates();
			}
			$localStorageVersion = version;
		}

		maplibregl.addProtocol('om', (params: RequestParameters, abortController: AbortController) =>
			omProtocol(params, abortController, $omProtocolSettings)
		);

		const style = await getStyle();

		const domainObject = domainOptions.find(({ value }: Domain) => value === $domain);
		if (!domainObject) {
			throw new Error('Domain not found');
		}
		const grid = GridFactory.create(domainObject.grid);

		$map = new maplibregl.Map({
			container: mapContainer as HTMLElement,
			style: style,
			center: grid.getCenter(),
			zoom: domainObject.grid.zoom,
			keyboard: false,
			hash: true,
			maxPitch: 85,
			// Attribution gérée manuellement en mode compact (voir setMapControlSettings),
			// pour qu'elle reste un petit bouton « i » et ne passe pas derrière le chrome.
			attributionControl: false,
			// Required for canvas.toBlob() during PNG capture — see capture-flow.svelte
			canvasContextAttributes: { preserveDrawingBuffer: true }
		});

		setMapControlSettings();

		// update bounds when new tiles are requested, to trigger new data ranges loading if necessary
		$map.on('dataloading', () => {
			const bounds = $map.getBounds();
			const [minLng, minLat] = bounds.getSouthWest().toArray();
			const [maxLng, maxLat] = bounds.getNorthEast().toArray();
			updateCurrentBounds([minLng, minLat, maxLng, maxLat]);
		});

		$map.on('load', async () => {
			if (getInitialMetaDataPromise) await getInitialMetaDataPromise;

			addTerrainSource($map);
			addTerrainSource($map, 'terrainSource2');
			initHillshadeFromPrefs();
			stopNeighborPrefetch = initNeighborPrefetch();
			clippingPanel?.initTerraDraw();

			addOmFileLayers();
			addPopup();
			changeOMfileURL();

			ensureDepartmentsLayer();
			refreshDepartments();
		});
	});

	let getInitialMetaDataPromise: Promise<void> | undefined;
	const domainSubscription = domain.subscribe(async (newDomain) => {
		if ($domain !== newDomain) {
			await tick(); // await the selectedDomain to be set
			updateUrl('domain', newDomain);
			$modelRun = undefined;
			toast('Modèle : ' + $selectedDomain.label);

			const view = DOMAIN_DEFAULT_VIEWS[newDomain];
			if (view && $map) {
				const mapInstance = $map;
				mapInstance.flyTo(view);
				// flyTo anime ~2s ; pendant l'animation, MapLibre ne déclenche pas
				// le tile-loading. Si changeOMfileURL fire avant moveend, le slot
				// commit prématurément (source.loaded() = true sans tuiles à charger),
				// et les tuiles de la zone d'arrivée ne sont jamais redemandées.
				// Re-trigger changeOMfileURL une fois la caméra stable.
				mapInstance.once('moveend', () => {
					currentOmUrl.set('');
					changeOMfileURL();
				});
			}
		}

		getInitialMetaDataPromise = (async () => {
			await getInitialMetaData();
			$metaJson = await getMetaData();

			const timeSteps = $metaJson?.valid_times.map((validTime: string) => new Date(validTime));
			const timeStep = findTimeStep($time, timeSteps);
			// clamp time to valid times in meta data
			if (timeStep) {
				$time = timeStep;
				updateUrl('time', formatISOWithoutTimezone($time));
			} else {
				// otherwise use first valid time
				$time = timeSteps[0];
				updateUrl('time', formatISOWithoutTimezone($time));
			}

			matchVariableOrFirst();
		})();
		await getInitialMetaDataPromise;
		changeOMfileURL();
	});

	const variableSubscription = variable.subscribe(async (newVar) => {
		if ($variable !== newVar) {
			await tick(); // await the selectedVariable to be set
			updateUrl('variable', newVar);
			toast('Variable : ' + $selectedVariable.label);
		}

		changeOMfileURL();
	});

	$effect(() => {
		// Read the stores so the effect re-runs on wind overlay state changes
		const _deps = [$windOverlayEnabled, $windOverlayLevel];
		// Invalidate cached URL so changeOMfileURL recomputes
		currentOmUrl.set('');
		changeOMfileURL();
	});

	$effect(() => {
		refreshDepartments([$showDepartments]);
	});

	// Ferme le cadre d'export quand l'utilisateur clique hors du carré sur la carte.
	// On s'abonne à l'évènement `click` de MapLibre — qui filtre déjà les drags (pan)
	// et le wheel (zoom), donc le cadrage reste libre tant qu'on ne fait pas un clic
	// franc dans la zone sombre.
	$effect(() => {
		const mapInstance = $map;
		if (!mapInstance) return;
		const handleClick = (e: maplibregl.MapMouseEvent) => {
			if (!get(exportFrameVisible)) return;
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const side = Math.min(vw, vh);
			const halfSide = side / 2;
			const cx = vw / 2;
			const cy = vh / 2;
			const { x, y } = e.point;
			const insideSquare =
				x >= cx - halfSide && x <= cx + halfSide && y >= cy - halfSide && y <= cy + halfSide;
			if (!insideSquare) exportFrameVisible.set(false);
		};
		mapInstance.on('click', handleClick);
		return () => {
			mapInstance.off('click', handleClick);
		};
	});

	onDestroy(() => {
		if ($map) {
			$map.remove();
		}
		domainSubscription(); // unsubscribe
		variableSubscription(); // unsubscribe
		stopNeighborPrefetch?.();
	});
</script>

<svelte:head>
	<title>Infoclimat - Modèles</title>
</svelte:head>

{#if $loading}
	<Spinner />
{/if}

<div class="map maplibregl-map" id="#map_container" bind:this={mapContainer}></div>
<Scrim />

{#if $exportFrameVisible}
	<!--
		Wrapper clippé : s'arrête juste au-dessus du TimeSelector pour que ni le voile
		sombre ni la bande FILIGRANE ne débordent sur la barre du temps. Le carré reste
		positionné par rapport au viewport (calc avec 50vh / min(50vw,50vh)) pour que la
		zone capturée ne bouge pas — seul le rendu visuel est tronqué.

		`pointer-events-none` sur tout le wrapper : les drags (pan), molette (zoom) et
		clics passent intégralement à MapLibre dessous, donc on peut recadrer la carte
		avec le cadre ouvert. La fermeture par clic-hors-carré est gérée via l'évènement
		`click` du map (cf. $effect plus haut) — il ne se déclenche pas sur un drag.
	-->
	<div
		class="pointer-events-none fixed inset-x-0 top-0 z-50 overflow-hidden"
		style="bottom: {$bottomChromeHeight}px"
		aria-hidden="true"
	>
		<!-- Bande au-dessus du carré (portrait uniquement) -->
		<div
			class="absolute bg-black/24"
			style="top: 0; left: 0; right: 0; height: calc(50vh - min(50vw, 50vh))"
		></div>
		<!-- Bande à gauche du carré (paysage uniquement) -->
		<div
			class="absolute bg-black/24"
			style="top: calc(50vh - min(50vw, 50vh)); height: min(100vw, 100vh); left: 0; width: calc(50vw - min(50vw, 50vh))"
		></div>
		<!-- Bande à droite du carré (paysage uniquement) -->
		<div
			class="absolute bg-black/24"
			style="top: calc(50vh - min(50vw, 50vh)); height: min(100vw, 100vh); right: 0; width: calc(50vw - min(50vw, 50vh))"
		></div>
		<!-- Bande sous le carré (portrait uniquement) -->
		<div
			class="absolute bg-black/24"
			style="top: calc(50vh + min(50vw, 50vh)); bottom: 0; left: 0; right: 0"
		></div>

		<!-- Le cadre carré : visuel uniquement -->
		<div
			class="absolute left-1/2 aspect-square w-[min(100vw,100vh)] -translate-x-1/2 border-2 border-white/95 shadow-[0_0_18px_rgba(0,0,0,0.45)]"
			style="top: calc(50vh - min(50vw, 50vh))"
		>
			<div class="absolute inset-0 border border-black/60"></div>
			<div
				class="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-xs font-bold text-white shadow"
			>
				PNG carré
			</div>
			<!-- Bande recouverte par le filigrane Infoclimat dans le PNG final (~118/1080 px). -->
			<div
				class="absolute inset-x-0 bottom-0 flex h-[10.9%] items-center justify-center border-t border-white/60 bg-black/45 text-[10px] font-semibold uppercase tracking-wide text-white/80"
			>
				filigrane
			</div>
		</div>
	</div>
{/if}

<AppChrome />
<Scale />
<ClippingPanel bind:this={clippingPanel} />
<TimeSelector />
<HelpDialog />
<SoundingPanel />
<KeyboardHandler />
<Dropzone
	ondrop={(features) => {
		clippingPanel?.addImportedFeatures(features);
	}}
/>
