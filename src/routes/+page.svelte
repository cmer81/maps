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
	import { showLabels } from '$lib/stores/labels';
	import { map } from '$lib/stores/map';
	import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import { currentOmUrl } from '$lib/stores/om-url';
	import {
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

	import {
		ClippingButton,
		DarkModeButton,
		DepartmentsButton,
		HelpButton,
		HillshadeButton,
		LabelsButton,
		SettingsButton
	} from '$lib/components/buttons';
	import ClippingPanel from '$lib/components/clipping/clipping-panel.svelte';
	import Dropzone from '$lib/components/dropzone/dropzone.svelte';
	import HelpDialog from '$lib/components/help/help-dialog.svelte';
	import KeyboardHandler from '$lib/components/keyboard/keyboard-handler.svelte';
	import Spinner from '$lib/components/loading/spinner.svelte';
	import Scale from '$lib/components/scale/scale.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import Settings from '$lib/components/settings/settings.svelte';
	import SiteHeader from '$lib/components/site-header/site-header.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';

	import { ensureDepartmentsLayer, refreshDepartments } from '$lib/departments-layer';
	import { checkHighDefinition } from '$lib/helpers';
	import { ensureLabelsLayer, refreshLabels } from '$lib/labels-layer';
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
			// Required for canvas.toBlob() during playback pre-rendering — see playback-renderer.ts
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
			$map.addControl(new DarkModeButton());
			$map.addControl(new SettingsButton());
			$map.addControl(new HelpButton());
			$map.addControl(new ClippingButton());

			if (getInitialMetaDataPromise) await getInitialMetaDataPromise;

			addTerrainSource($map);
			addTerrainSource($map, 'terrainSource2');
			$map.addControl(new HillshadeButton());
			$map.addControl(new LabelsButton());
			$map.addControl(new DepartmentsButton());
			clippingPanel?.initTerraDraw();

			addOmFileLayers();
			addPopup();
			changeOMfileURL();

			ensureLabelsLayer();
			ensureDepartmentsLayer();
			$map.on('moveend', () => {
				if (get(showLabels)) refreshLabels();
			});
			refreshLabels();
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
		// Pass deps so the effect re-runs whenever any of them changes —
		// refreshLabels itself reads the current store values via get().
		refreshLabels([$showLabels, $variable, $time, $domain, $modelRun]);
	});

	$effect(() => {
		refreshDepartments([$showDepartments]);
	});

	onDestroy(() => {
		if ($map) {
			$map.remove();
		}
		domainSubscription(); // unsubscribe
		variableSubscription(); // unsubscribe
	});
</script>

<svelte:head>
	<title>Infoclimat - Modèles</title>
</svelte:head>

{#if $loading}
	<Spinner />
{/if}

<div class="map maplibregl-map" id="#map_container" bind:this={mapContainer}></div>

{#if $exportFrameVisible}
	<div
		class="pointer-events-none fixed left-1/2 top-1/2 z-50 aspect-square w-[min(100vw,100vh)] -translate-x-1/2 -translate-y-1/2 border-2 border-white/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.24),0_0_18px_rgba(0,0,0,0.45)]"
		aria-hidden="true"
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
{/if}

<SiteHeader />
<Scale />
<VariableSelection />
<ClippingPanel bind:this={clippingPanel} />
<TimeSelector />
<Settings />
<HelpDialog />
<KeyboardHandler />
<Dropzone
	ondrop={(features) => {
		clippingPanel?.addImportedFeatures(features);
	}}
/>
