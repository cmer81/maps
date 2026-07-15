<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { get } from 'svelte/store';

	import XIcon from '@lucide/svelte/icons/x';

	import { desktop } from '$lib/stores/preferences';
	import { metaJson, time } from '$lib/stores/time';
	import { convertValue, getDisplayUnit, unitPreferences } from '$lib/stores/units';
	import { selectedDomain } from '$lib/stores/variables';

	import { fetchMeteogram } from '$lib/meteogram/api';
	import { type ExportableChart, renderMeteogramExport } from '$lib/meteogram/export-image';
	import { INFOCLIMAT_LOGO_DATA_URI } from '$lib/meteogram/infoclimat-logo';
	import { BEAUFORT_FR, buildChartOptions } from '$lib/meteogram/meteogram-chart';
	import { resolveApiModel } from '$lib/meteogram/model-map';
	import { nearestValidTime } from '$lib/meteogram/snap';
	import { symbolForWmo, weatherSymbolPlacements } from '$lib/meteogram/weather-symbols';
	import { goToValidTime } from '$lib/time-navigation';

	import type { MeteogramData, MeteogramKey } from '$lib/meteogram/types';
	import type Highcharts from 'highcharts';
	import type { Chart } from 'highcharts';

	// `elevation` (bindable) : altitude du point selon le modèle, publiée vers le
	// tiroir (affichée dans l'en-tête). L'API terrain de la carte n'étant pas
	// fiable sans DEM chargé, on prend l'altitude fournie par l'API forecast.
	let {
		lat,
		lng,
		elevation = $bindable(null)
	}: { lat: number; lng: number; elevation?: number | null } = $props();

	let data = $state<MeteogramData | null>(null);
	let loading = $state(false);
	let error = $state<'rate-limit' | 'network' | 'empty' | null>(null);
	let chartEl = $state<HTMLDivElement>();
	let chart: Chart | undefined;

	// ——— chargement : identique à l'implémentation précédente ———
	const cache = new SvelteMap<string, MeteogramData>();
	let controller: AbortController | undefined;
	const model = $derived(resolveApiModel($selectedDomain.value));

	async function load() {
		const currentModel = model;
		controller?.abort();
		controller = undefined;
		if (!currentModel) {
			data = null;
			error = null;
			loading = false;
			return;
		}
		const key = `${lat.toFixed(3)},${lng.toFixed(3)},${currentModel}`;
		const cached = cache.get(key);
		if (cached) {
			data = cached;
			error = null;
			loading = false;
			return;
		}
		const ac = new AbortController();
		controller = ac;
		loading = true;
		error = null;
		data = null;
		try {
			const d = await fetchMeteogram(lat, lng, currentModel, ac.signal);
			if (controller !== ac) return;
			if (d.times.length === 0) {
				error = 'empty';
			} else {
				cache.set(key, d);
				data = d;
			}
		} catch (e) {
			if ((e as Error).name === 'AbortError') return;
			if (controller !== ac) return;
			error = (e as Error).message === 'rate-limit' ? 'rate-limit' : 'network';
		} finally {
			if (controller === ac) loading = false;
		}
	}

	$effect(() => {
		void lat;
		void lng;
		void model;
		load();
	});

	// Publie l'altitude (modèle) vers le tiroir dès que les données arrivent.
	$effect(() => {
		elevation = data?.elevation ?? null;
	});

	// ——— séries converties dans l'unité d'affichage ———
	function seriesValues(key: MeteogramKey): (number | null)[] {
		const raw = data?.series[key] ?? [];
		return (data?.times ?? []).map((_, i) => raw[i] ?? null);
	}
	function convertSeries(key: MeteogramKey, baseUnit: string): (number | null)[] {
		return seriesValues(key).map((v) =>
			v === null || !Number.isFinite(v) ? null : convertValue(v, baseUnit, $unitPreferences, key)
		);
	}

	// ——— Encart de valeurs du pas sélectionné (playhead) ———
	// Remplace le tooltip de survol Highcharts, inutilisable au tactile : sur
	// mobile/tablette il ne s'affichait pas de façon fiable (piloté par le hover,
	// tué par le touchend/reflow). Ici on lit nous-mêmes les valeurs au pas le plus
	// proche du temps courant et on les rend dans un encart TOUJOURS visible,
	// déterministe sur tous les appareils. Le tooltip de survol reste dispo desktop.
	type ReadoutRow = { label: string; value: string; color: string };
	// Stores lus au top level (les runes interdisent `$store` dans un callback imbriqué).
	const currentTime = $derived($time);
	const currentUnits = $derived($unitPreferences);

	// Survol d'un pas (desktop) : timestamp ms du point sous la souris, `null` hors
	// survol. Sur mobile/tactile il n'y a pas de survol → reste `null`.
	let hoveredX = $state<number | null>(null);

	function nearestIdx(times: Date[], tx: number): number {
		let idx = 0;
		let best = Infinity;
		for (let i = 0; i < times.length; i++) {
			const diff = Math.abs(times[i].getTime() - tx);
			if (diff < best) {
				best = diff;
				idx = i;
			}
		}
		return idx;
	}

	// Pas « actif » de l'encart : celui SOUS LA SOURIS si on survole (desktop → la
	// boîte suit le curseur comme un tooltip), sinon le pas sélectionné (playhead /
	// tactile). C'est ce qui restaure le comportement de prod sur desktop.
	const activeIdx = $derived.by(() => {
		const d = data;
		if (!d || !d.times.length) return 0;
		const tx = hoveredX ?? (currentTime ? new Date(currentTime).getTime() : d.times[0].getTime());
		return nearestIdx(d.times, tx);
	});

	// Échelle de Beaufort : vitesse m/s → indice 0-12 (pour la description FR du vent).
	function beaufortFromMs(ms: number): number {
		const thresholds = [0.5, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
		let lvl = 0;
		for (let i = 0; i < thresholds.length; i++) if (ms >= thresholds[i]) lvl = i + 1;
		return lvl;
	}

	// Encart masquable : le ✕ le cache (utile au tactile où il n'y a pas de « fin de
	// survol ») ; il réapparaît dès qu'on sélectionne un nouveau pas (changement de
	// temps → reset). Le ✕ lui-même ne change pas le temps, donc le masquage tient.
	let dismissed = $state(false);
	$effect(() => {
		void $time;
		dismissed = false;
	});
	// Survoler ramène l'encart s'il avait été masqué (intention de lire les valeurs).
	$effect(() => {
		if (hoveredX !== null) dismissed = false;
	});
	const readout = $derived.by(
		(): { time: string; weather: string | null; rows: ReadoutRow[] } | null => {
			const d = data;
			if (!d || !d.times.length) return null;
			const idx = activeIdx;
			const u = currentUnits;
			const at = (arr: (number | null)[]): number | null => arr[idx] ?? null;
			const fmt = (v: number | null, digits: number, unit: string): string | null =>
				v === null || !Number.isFinite(v) ? null : `${v.toFixed(digits).replace('.', ',')} ${unit}`;
			const windRaw = at(seriesValues('wind_speed_10m'));
			const windDisp = windRaw === null ? null : windRaw * convertValue(1, 'm/s', u);
			// Vent : valeur convertie + description Beaufort FR (comme l'ancien tooltip).
			const windValue =
				windDisp === null
					? null
					: `${Math.round(windDisp)} ${getDisplayUnit('m/s', u)} (${BEAUFORT_FR[beaufortFromMs(windRaw as number)]})`;
			const code = d.series.weather_code?.[idx];
			const isDay = (d.series.is_day?.[idx] ?? 1) === 1;
			const candidates: { label: string; value: string | null; color: string }[] = [
				{
					label: 'Température',
					value: fmt(
						at(convertSeries('temperature_2m', '°C')),
						1,
						getDisplayUnit('°C', u, 'temperature_2m')
					),
					color: '#ff4d4d'
				},
				{
					label: 'Point de rosée',
					value: fmt(
						at(convertSeries('dew_point_2m', '°C')),
						1,
						getDisplayUnit('°C', u, 'dew_point_2m')
					),
					color: '#34d399'
				},
				{
					label: 'Humidité',
					value: fmt(at(seriesValues('relative_humidity_2m')), 0, '%'),
					color: '#c084fc'
				},
				{
					label: 'Précipitations',
					value: fmt(
						at(convertSeries('precipitation', 'mm')),
						1,
						getDisplayUnit('mm', u, 'precipitation')
					),
					color: '#68cfe8'
				},
				{
					label: 'Pression',
					value: fmt(
						at(convertSeries('pressure_msl', 'hPa')),
						1,
						getDisplayUnit('hPa', u, 'pressure_msl')
					),
					color: '#fbbf24'
				},
				{ label: 'Vent', value: windValue, color: '#7dd3fc' }
			];
			const rows = candidates.filter((r): r is ReadoutRow => r.value !== null);
			const time = new Intl.DateTimeFormat('fr-FR', {
				timeZone: d.timezone,
				weekday: 'short',
				day: 'numeric',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit'
			}).format(new Date(d.times[idx]));
			const weather = code === null || code === undefined ? null : symbolForWmo(code, isDay).label;
			return { time, weather, rows };
		}
	);

	function seek(t: Date) {
		const validTimes = get(metaJson)?.valid_times?.map((v) => new Date(v)) ?? [];
		goToValidTime(nearestValidTime(t, validTimes) ?? t);
	}

	// ——— Highcharts : chargé paresseusement au premier rendu de données ———
	// Modules v12 en side-effect : ils s'appliquent au default export du paquet.
	// Écart brief : les typings v12.6.0 ne déclarent pas de `default` sur le
	// namespace de `typeof import('highcharts')` (bug de packaging des .d.ts,
	// le runtime UMD expose bien `.default`) — on nomme donc la forme réelle via
	// un import de type par défaut (`import type Highcharts from 'highcharts'`,
	// ligne 17) et on caste l'objet renvoyé par `import()` en conséquence.
	let hcPromise: Promise<typeof Highcharts> | undefined;
	function loadHighcharts() {
		hcPromise ??= (async () => {
			const mod = (await import('highcharts')) as unknown as { default: typeof Highcharts };
			const hc = mod.default;
			// `windbarb` référence en interne `Highcharts.dataGrouping.approximations`
			// (série héritée d'arearange) : le module `datagrouping` doit être
			// chargé AVANT `windbarb`, sinon `G.dataGrouping` reste `undefined` et
			// l'accès à `.approximations` explose au premier rendu du chart.
			await import('highcharts/modules/datagrouping');
			await import('highcharts/modules/windbarb');
			await import('highcharts/modules/exporting');
			await import('highcharts/modules/offline-exporting');
			// `locale: 'fr'` couvre dates/nombres (Intl) mais pas les libellés d'UI
			// (bouton « Reset zoom » du zoom X) — traduits explicitement.
			hc.setOptions({
				lang: {
					locale: 'fr',
					resetZoom: 'Réinitialiser le zoom',
					resetZoomTitle: 'Revenir à l’échelle initiale'
				}
			});
			return hc;
		})();
		return hcPromise;
	}

	/** Icônes météo en **bande fixe** en haut de la zone de tracé (façon yr.no),
	 *  redessinées à chaque render (zoom, resize, scroll) — le groupe précédent
	 *  est détruit d'abord. Elles suivaient la courbe de T° (démo Highcharts)
	 *  mais retour prod : bizarre quand la courbe est masquée, et par T° basse
	 *  elles empiétaient sur les histogrammes de précip et leurs valeurs.
	 *  Sélection des pas (stride adaptatif, codes null écartés) : logique pure
	 *  `weatherSymbolPlacements` (testée) ; ici seul le rendu. */
	function drawSymbols(c: Chart, d: MeteogramData) {
		type ChartWithSymbols = Chart & { __symbolsGroup?: { destroy(): void } };
		const cc = c as ChartWithSymbols;
		cc.__symbolsGroup?.destroy();
		const group = c.renderer.g('weather-symbols').attr({ zIndex: 5 }).add();
		const axis = c.xAxis[0];
		// Les séries sont en pointPlacement 'between' : on centre l'icône sur la
		// colonne de données (demi-pas à droite du tick), comme les points tracés.
		const halfStep =
			d.times.length > 1
				? (axis.toPixels(d.times[1].getTime(), false) -
						axis.toPixels(d.times[0].getTime(), false)) /
					2
				: 0;
		const y = c.plotTop + 4;
		for (const { index, icon } of weatherSymbolPlacements(
			d.series.weather_code ?? [],
			d.series.is_day ?? []
		)) {
			const t = d.times[index];
			if (!t) continue;
			const xCenter = axis.toPixels(t.getTime(), false) + halfStep;
			// Zoom/scroll : ne pas dessiner hors de la zone de tracé (le groupe du
			// renderer n'est pas clippé par le plot area, contrairement aux séries).
			if (xCenter < c.plotLeft || xCenter > c.plotLeft + c.plotWidth) continue;
			c.renderer.image(`/weather-symbols/${icon}.svg`, xCenter - 15, y, 30, 30).add(group);
		}
		cc.__symbolsGroup = group;
	}

	// (Re)création du chart quand les données — ou les unités — changent.
	$effect(() => {
		const d = data;
		const el = chartEl;
		if (!d || !el) {
			// Détruit tout chart encore vivant hors DOM (ex. rechargement :
			// `data` repasse à null et le conteneur quitte le markup).
			chart?.destroy();
			chart = undefined;
			return;
		}
		// L'entrée du chart (séries converties + unités) est construite de façon
		// SYNCHRONE, avant tout `await` : `$unitPreferences` (lu par
		// convertSeries/getDisplayUnit) reste ainsi dans la fenêtre de tracking
		// de l'effet — un changement d'unité (°C→°F…) re-crée bien le chart.
		const input = {
			times: d.times,
			temperature: convertSeries('temperature_2m', '°C'),
			dewPoint: convertSeries('dew_point_2m', '°C'),
			precipitation: convertSeries('precipitation', 'mm'),
			pressure: convertSeries('pressure_msl', 'hPa'),
			humidity: seriesValues('relative_humidity_2m'),
			windSpeed: seriesValues('wind_speed_10m'),
			windDirection: seriesValues('wind_direction_10m'),
			symbolLabels: (d.series.weather_code ?? []).map((code, i) =>
				code === null || code === undefined
					? null
					: symbolForWmo(code, (d.series.is_day?.[i] ?? 1) === 1).label
			),
			units: {
				temperature: getDisplayUnit('°C', $unitPreferences, 'temperature_2m'),
				precipitation: getDisplayUnit('mm', $unitPreferences, 'precipitation'),
				pressure: getDisplayUnit('hPa', $unitPreferences, 'pressure_msl')
			},
			windDisplay: {
				// Conversions vitesse purement multiplicatives (m/s→km/h ×3,6, →mph, →kn) :
				// le facteur = conversion de 1 m/s dans l'unité choisie.
				factor: convertValue(1, 'm/s', $unitPreferences),
				unit: getDisplayUnit('m/s', $unitPreferences)
			},
			timezone: d.timezone,
			compact: !desktop.current,
			onTimeClick: seek,
			onHover: (x: number | null) => (hoveredX = x)
		};
		let cancelled = false;
		(async () => {
			const hc = await loadHighcharts();
			if (cancelled) return;
			chart?.destroy();
			const options = buildChartOptions(input);
			options.chart = {
				...options.chart,
				renderTo: el,
				events: {
					...options.chart?.events,
					render: function () {
						drawSymbols(this as Chart, d);
						positionEncart();
					}
				}
			};
			chart = new hc.Chart(options);
			syncPlayhead();
		})();
		return () => {
			cancelled = true;
		};
	});

	// Position horizontale (px, relative au conteneur) de l'encart : suit le pas
	// ACTIF (survolé sur desktop, sinon sélectionné). Recalculée au survol, au scrub,
	// au render et au resize (le mapping pixel du chart change à chaque fois).
	let encartX = $state<number | null>(null);
	let encartW = $state(0);
	let containerW = $state(0);
	const encartLeft = $derived.by(() => {
		if (encartX === null) return 4;
		const w = encartW || 150;
		const cw = containerW || 320;
		// Centré sur le pas actif, borné dans le conteneur (pas de débordement).
		return Math.round(Math.max(4, Math.min(encartX - w / 2, cw - w - 4)));
	});

	function positionEncart() {
		const c = chart;
		const d = data;
		if (!c || !c.xAxis?.[0] || !d?.times.length) {
			encartX = null;
			return;
		}
		try {
			encartX = c.xAxis[0].toPixels(d.times[activeIdx].getTime(), false);
		} catch {
			encartX = null;
		}
	}

	// Repositionne l'encart quand le pas actif change (survol souris inclus).
	$effect(() => {
		void activeIdx;
		positionEncart();
	});

	// Playhead : plotLine repositionnée au scrub, sans re-render du chart.
	function syncPlayhead() {
		const c = chart;
		const t = get(time);
		if (!c) return;
		c.xAxis[0].removePlotLine('playhead');
		if (t) {
			c.xAxis[0].addPlotLine({
				id: 'playhead',
				value: new Date(t).getTime(),
				color: '#38bdf8',
				width: 2,
				zIndex: 4
			});
		}
		positionEncart();
	}
	$effect(() => {
		void $time;
		syncPlayhead();
	});

	// Le chart Highcharts ne se recale que sur `resize` de la fenêtre — pas quand
	// le tiroir est redimensionné (drag de la poignée) ni au montage flex. On
	// observe donc le conteneur et on `reflow()` pour que le graphe occupe toute
	// la hauteur disponible et grandisse avec le tiroir.
	$effect(() => {
		const el = chartEl;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(() => {
			chart?.reflow();
			positionEncart();
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	$effect(() => () => {
		chart?.destroy();
		chart = undefined;
	});

	/** Export PNG « carte de visite » — appelé par le tiroir via bind:this.
	 *  Composition canvas (graphe + pied logo/contexte) dans `export-image.ts`. */
	export const exportPng = async (filename: string) => {
		if (!chart) return;
		await renderMeteogramExport({
			chart: chart as unknown as ExportableChart,
			model: get(selectedDomain).label ?? get(selectedDomain).value,
			lat,
			lng,
			date: new Date(),
			logoDataUri: INFOCLIMAT_LOGO_DATA_URI,
			filename
		});
	};

	const SKELETON_ROWS = Array.from({ length: 3 });
</script>

<div class="flex h-full flex-col py-2">
	{#if loading}
		<div class="flex flex-col gap-3" aria-hidden="true">
			{#each SKELETON_ROWS as _, i (i)}
				<div class="h-[110px] w-full animate-pulse rounded bg-white/5"></div>
			{/each}
		</div>
	{:else if error === 'rate-limit'}
		<p class="p-4 text-sm text-rose-300">
			Limite de requêtes atteinte. Réessayez dans un instant.
			<button class="ml-2 underline hover:text-white" onclick={load}>Réessayer</button>
		</p>
	{:else if error === 'network'}
		<p class="p-4 text-sm text-rose-300">
			Échec du chargement du meteogram.
			<button class="ml-2 underline hover:text-white" onclick={load}>Réessayer</button>
		</p>
	{:else if error === 'empty'}
		<p class="p-4 text-sm text-white/60">Aucune donnée à ce point pour ce modèle.</p>
	{:else if data && data.times.length}
		<div class="relative min-h-[300px] w-full flex-1" bind:clientWidth={containerW}>
			<div bind:this={chartEl} class="h-full w-full"></div>
			{#if readout && !dismissed}
				<!-- Encart de valeurs du pas sélectionné : boîte unique (le tooltip de
				     survol Highcharts est désactivé). Suit horizontalement le playhead
				     (`left`), borné dans le conteneur. `pointer-events-none` pour laisser
				     passer les taps vers le graphe ; seul le ✕ est cliquable. -->
				<div
					bind:clientWidth={encartW}
					style="left: {encartLeft}px"
					class="pointer-events-none absolute top-1 z-10 rounded-md bg-[rgba(12,20,32,0.9)] py-1 pr-6 pl-2 text-[11px] leading-tight text-white/90 shadow ring-1 ring-white/10"
				>
					<button
						class="pointer-events-auto absolute top-0.5 right-0.5 rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
						aria-label="Masquer les valeurs"
						title="Masquer"
						onclick={(e) => {
							e.stopPropagation();
							dismissed = true;
						}}
					>
						<XIcon class="size-3.5" aria-hidden="true" />
					</button>
					<div class="font-medium">{readout.time}</div>
					{#if readout.weather}
						<div class="text-white/70">{readout.weather}</div>
					{/if}
					{#each readout.rows as r (r.label)}
						<div class="flex items-center gap-1 tabular-nums">
							<span class="inline-block size-1.5 rounded-full" style="background:{r.color}"></span>
							<span class="text-white/70">{r.label} :</span>
							<span class="font-semibold">{r.value}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
