import type { Options, XAxisOptions } from 'highcharts';

export interface MeteogramChartInput {
	times: Date[];
	temperature: (number | null)[];
	dewPoint: (number | null)[];
	precipitation: (number | null)[];
	pressure: (number | null)[];
	/** m/s brut : les barbes suivent la convention nœuds, Highcharts convertit. */
	windSpeed: (number | null)[];
	windDirection: (number | null)[];
	symbolLabels: (string | null)[];
	units: { temperature: string; precipitation: string; pressure: string };
	/** Fuseau IANA du point (ex. « Europe/Paris ») pour l'affichage heure locale. */
	timezone: string;
	onTimeClick: (date: Date) => void;
	/** Survol d'un pas (desktop) : `x` = timestamp ms du point survolé, `null` à la
	 *  sortie. Permet à l'encart de valeurs de suivre la souris comme un tooltip. */
	onHover?: (x: number | null) => void;
	/** Mobile : marges resserrées pour rendre la zone de tracé au graphe. */
	compact?: boolean;
	/** Unité d'affichage du vent (préférence utilisateur). Défaut km/h.
	 *  La valeur du windbarb reste en m/s (tracé des plumes / Beaufort). */
	windDisplay?: { factor: number; unit: string };
	/** Humidité relative (%) — optionnel, visible si présent. */
	humidity?: (number | null)[];
}

// Thème sombre : TOUT élément d'axe/grille doit être stylé explicitement.
// Les défauts Highcharts (grille mineure #f2f2f2, axes #ccd6eb, crosshair
// #cccccc) sont pensés pour fond clair et ressortent en barres blanches sur
// le tiroir sombre — régression corrigée, verrouillée par test.
/**
 * Échelle de Beaufort en français (indices 0-12). Le tooltip par défaut du
 * module windbarb affiche la description anglaise (« Light air »…) via
 * `point.beaufort` — on la remplace par `BEAUFORT_FR[point.beaufortLevel]`.
 */
export const BEAUFORT_FR: readonly string[] = [
	'Calme',
	'Très légère brise',
	'Légère brise',
	'Petite brise',
	'Jolie brise',
	'Bonne brise',
	'Vent frais',
	'Grand frais',
	'Coup de vent',
	'Fort coup de vent',
	'Tempête',
	'Violente tempête',
	'Ouragan'
];

const GRID = 'rgba(255, 255, 255, 0.06)';
const GRID_DAY = 'rgba(255, 255, 255, 0.16)';
const AXIS = 'rgba(255, 255, 255, 0.18)';
const TEXT = 'rgba(255, 255, 255, 0.7)';
const TEXT_STRONG = 'rgba(255, 255, 255, 0.9)';

/**
 * Séparateurs de jour : un trait vertical à chaque **minuit local**. On repère
 * les pas dont l'heure locale (fuseau du point) vaut « 00 » — le premier point
 * est exclu (pas de trait au bord gauche). Offsets entiers (France/Europe) : le
 * pas horaire tombe pile sur minuit local. Edge case fuseaux non-entiers (Inde
 * +5:30) : léger désalignement, accepté (cohérent avec la limite DST connue).
 */
export function dayBoundaryPlotLines(
	times: Date[],
	timezone: string
): { value: number; color: string; width: number; zIndex: number }[] {
	const fmt = new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		hour: '2-digit',
		hour12: false
	});
	const lines: { value: number; color: string; width: number; zIndex: number }[] = [];
	times.forEach((t, i) => {
		if (i === 0) return;
		const hh = fmt.format(t); // '00'..'23' (certaines impl : '24' à minuit)
		if (hh === '00' || hh === '24') {
			lines.push({ value: t.getTime(), color: GRID_DAY, width: 1, zIndex: 1 });
		}
	});
	return lines;
}

/**
 * Construit les options du graphe unique façon yr.no (démo officielle
 * Highcharts « meteogram »), thème sombre accordé au tiroir. Builder pur :
 * données → objet options, aucun accès DOM ni au runtime Highcharts.
 */
export function buildChartOptions(input: MeteogramChartInput): Options {
	const xs = input.times.map((t) => t.getTime());
	const at = <T>(arr: (T | null)[], i: number): T | null => arr[i] ?? null;

	const temperatureData = xs.map((x, i) => ({
		x,
		y: at(input.temperature, i),
		symbolName: at(input.symbolLabels, i)
	}));
	const dewPointData = xs.map((x, i) => [x, at(input.dewPoint, i)]);
	const precipitationData = xs.map((x, i) => [x, at(input.precipitation, i)]);
	const pressureData = xs.map((x, i) => [x, at(input.pressure, i)]);
	// Certains modèles ne diffusent pas la pression (AROME France HD : pressure_msl
	// 100 % null même après tentative d'emprunt) → axe/série masqués pour ne pas
	// laisser un titre « hPa » orphelin sans graduations sur le bord droit.
	const hasPressure = input.pressure.some((v) => v !== null && Number.isFinite(v));

	const humidity = input.humidity ?? [];
	const humidityData = xs.map((x, i) => [x, at(humidity, i)]);
	const hasHumidity = humidity.some((v) => v !== null && Number.isFinite(v));

	// 1 barbe sur 2 (lisibilité, comme le démo) ; points sans vitesse/direction écartés.
	const windData = xs
		.map((x, i) => ({ x, value: at(input.windSpeed, i), direction: at(input.windDirection, i), i }))
		.filter((p) => p.i % 2 === 0 && p.value !== null && p.direction !== null)
		.map(({ x, value, direction }) => ({
			x,
			value: value as number,
			direction: direction as number
		}));

	const onTimeClick = input.onTimeClick;
	const onHover = input.onHover;
	const windDisplay = input.windDisplay ?? { factor: 3.6, unit: 'km/h' };

	// Densité de grille adaptative : au-delà de 72 h, une gridline toutes les
	// 2 h sature le tracé (l'API renvoie jusqu'à 7 jours) — on passe à 6 h.
	// Pas de grille mineure : sur fond sombre elle ne fait que du bruit.
	const longRange = input.times.length > 72;
	const tickInterval = (longRange ? 6 : 2) * 36e5;

	return {
		chart: {
			backgroundColor: 'transparent',
			style: { fontFamily: 'inherit' },
			// Marges resserrées sur mobile (haut/droite) pour gagner de la zone de
			// tracé. marginBottom NON réduit : l'axe des heures (offset 30 + labels)
			// a besoin de ~70px, en-deçà (essai à 56) les chiffres se font rogner par
			// le bord du SVG sur le rendu Safari iOS. On garde donc 72px en bas.
			marginBottom: input.compact ? 72 : 70,
			marginRight: input.compact ? 40 : 44,
			marginTop: input.compact ? 52 : 60,
			plotBorderWidth: 1,
			plotBorderColor: 'rgba(255, 255, 255, 0.14)',
			alignTicks: false,
			zooming: { type: 'x' },
			scrollablePlotArea: { minWidth: 720 },
			events: {
				click: function (e) {
					// Typage large : l'événement porte xAxis[0].value (ms epoch).
					const ev = e as unknown as { xAxis?: { value: number }[] };
					const v = ev.xAxis?.[0]?.value;
					if (v !== undefined) onTimeClick(new Date(v));
				}
			}
		},
		time: { timezone: input.timezone },
		title: { text: undefined },
		credits: { enabled: false },
		accessibility: { enabled: false },
		// Pas de menu contextuel Highcharts (libellés anglais, redondant avec le
		// bouton « Exporter PNG » du tiroir) ; le module exporting reste chargé
		// pour `exportChartLocal`.
		exporting: { buttons: { contextButton: { enabled: false } } },
		tooltip: {
			// Tooltip de survol DÉSACTIVÉ : les valeurs du pas sélectionné sont
			// affichées par l'encart maison (meteogram.svelte), boîte unique et
			// cohérente mobile/desktop. Le tooltip de survol créait une 2ᵉ boîte au
			// comportement incohérent (persistant au tactile, volatil au survol).
			// Config conservée (headerFormat/pointFormatter, testés) mais inerte.
			enabled: false,
			shared: true,
			useHTML: false,
			backgroundColor: 'rgba(12, 20, 32, 0.95)',
			style: { color: TEXT_STRONG },
			// Heure locale du point (Highcharts formate {point.x} selon `time.timezone`).
			headerFormat:
				'<small>{point.x:%A %e %b, %H:%M}</small><br><b>{point.point.symbolName}</b><br>'
		},
		xAxis: [
			{
				type: 'datetime',
				tickInterval,
				minorGridLineWidth: 0,
				tickLength: 0,
				lineColor: AXIS,
				tickColor: AXIS,
				gridLineWidth: 1,
				gridLineColor: GRID,
				startOnTick: false,
				endOnTick: false,
				minPadding: 0,
				maxPadding: 0,
				offset: 30,
				showLastLabel: true,
				crosshair: { width: 1, color: 'rgba(255, 255, 255, 0.25)' },
				// Séparateurs de jour (l'ancien 2ᵉ axe « opposite » est supprimé).
				plotLines: dayBoundaryPlotLines(input.times, input.timezone),
				labels: {
					style: { color: TEXT },
					// Heure (%H) par défaut ; à minuit local, la date en gras — format
					// COURT (« mer. 15 », sans mois) : « mer. 15 juil. » débordait de
					// son créneau et faisait pivoter tous les labels de l'axe (premier
					// tronqué « mer. 15 juil.me… », retour prod). Le mois complet reste
					// lisible dans l'encart de valeurs et l'en-tête du tiroir.
					formatter: function () {
						const ctx = this as unknown as {
							value: number;
							axis: { chart: { time: { dateFormat(f: string, t: number): string } } };
						};
						const time = ctx.axis.chart.time;
						const hh = time.dateFormat('%H', ctx.value);
						return hh === '00'
							? time.dateFormat('<span style="font-weight: bold">%a %e</span>', ctx.value)
							: hh;
					}
				}
			}
		] as XAxisOptions[],
		yAxis: [
			{
				// Température (+ point de rosée)
				title: { text: null },
				labels: {
					format: `{value}°`,
					style: { fontSize: '10px', color: TEXT },
					x: -3
				},
				plotLines: [{ value: 0, color: 'rgba(255,255,255,0.3)', width: 1, zIndex: 2 }],
				maxPadding: 0.3,
				minRange: 8,
				// Extrêmes collés aux données (± padding) : les défauts Highcharts
				// (startOnTick/endOnTick true) arrondissent au tick entier — avec un
				// tick de 25, une courbe 25-32 °C donnait un axe 0-50 (« écrasé »).
				startOnTick: false,
				endOnTick: false,
				// Grille assez dense pour la faible hauteur du tiroir : le défaut
				// (72px) pouvait ne laisser qu'une seule graduation au rendu initial.
				tickPixelInterval: 40,
				gridLineColor: GRID
			},
			{
				// Précipitations
				title: { text: null },
				labels: { enabled: false },
				gridLineWidth: 0,
				tickLength: 0,
				minRange: 10,
				min: 0
			},
			{
				// Pression
				visible: hasPressure,
				allowDecimals: false,
				title: {
					text: input.units.pressure,
					offset: 0,
					align: 'high',
					rotation: 0,
					style: { fontSize: '10px', color: '#fbbf24' },
					textAlign: 'left',
					x: 3
				},
				labels: { style: { fontSize: '8px', color: '#fbbf24' }, y: 2, x: 3 },
				gridLineWidth: 0,
				opposite: true,
				showLastLabel: false
			},
			{
				// Humidité relative (0-100 %)
				visible: hasHumidity,
				showEmpty: false, // axe caché tant que la série humidité (masquée par défaut) n'est pas activée
				min: 0,
				max: 100,
				tickInterval: 50, // 0 / 50 / 100 seulement (limiter l'encombrement à droite)
				title: {
					text: hasHumidity ? '%' : undefined,
					offset: 0,
					align: 'high',
					rotation: 0,
					style: { fontSize: '10px', color: '#c084fc' },
					textAlign: 'right',
					x: -3
				},
				labels: { style: { fontSize: '8px', color: '#c084fc' }, x: -3 },
				gridLineWidth: 0,
				opposite: true,
				showLastLabel: false
			},
			{
				// Axe dédié aux windbarbs, jamais affiché. Sans lui, la série vent
				// partage l'axe 0 (températures) et ses `value` (m/s, seuil 0) entrent
				// dans le calcul des extrêmes → l'échelle des T° s'étire de 0 au max
				// du vent dès que les barbules sont visibles (bug signalé en prod).
				visible: false
			}
		],
		legend: {
			enabled: true,
			align: 'center',
			verticalAlign: 'top',
			padding: 4,
			itemMarginTop: 0,
			itemMarginBottom: 0,
			symbolHeight: 8,
			itemStyle: { color: TEXT_STRONG, fontSize: '11px', fontWeight: 'normal' },
			itemHoverStyle: { color: '#ffffff' },
			itemHiddenStyle: { color: 'rgba(255, 255, 255, 0.3)' }
		},
		plotOptions: {
			series: {
				pointPlacement: 'between',
				// Sortie de série → l'encart revient au pas sélectionné (fin de survol).
				events: {
					mouseOut: function () {
						onHover?.(null);
					}
				},
				point: {
					events: {
						click: function () {
							onTimeClick(new Date(this.x as number));
						},
						// Survol d'un point (desktop) → l'encart suit la souris.
						mouseOver: function () {
							onHover?.(this.x as number);
						}
					}
				}
			}
		},
		series: [
			{
				name: 'Température',
				data: temperatureData,
				type: 'spline',
				marker: { enabled: false, states: { hover: { enabled: true } } },
				tooltip: { valueSuffix: ` ${input.units.temperature}` },
				zIndex: 2,
				lineWidth: 2.5,
				color: '#ff4d4d',
				negativeColor: '#48AFE8'
			},
			{
				name: 'Point de rosée',
				data: dewPointData,
				type: 'spline',
				marker: { enabled: false },
				dashStyle: 'ShortDash',
				tooltip: { valueSuffix: ` ${input.units.temperature}` },
				zIndex: 1,
				lineWidth: 1.5,
				color: '#34d399'
			},
			{
				name: 'Précipitations',
				data: precipitationData,
				type: 'column',
				color: '#68CFE8',
				yAxis: 1,
				groupPadding: 0,
				pointPadding: 0,
				grouping: false,
				dataLabels: {
					enabled: true,
					filter: { operator: '>', property: 'y', value: 0 },
					style: { fontSize: '10px', color: TEXT, textOutline: 'none' }
				},
				tooltip: { valueSuffix: ` ${input.units.precipitation}` }
			},
			{
				// Repère de tendance : le pointillé la distingue de la T°, mais en
				// pleine opacité et 1,5px (retour prod : la version translucide 1px
				// était illisible — « un peu terne »).
				name: 'Pression',
				visible: hasPressure,
				data: pressureData,
				type: 'spline',
				marker: { enabled: false },
				lineWidth: 1.5,
				color: '#fbbf24',
				dashStyle: 'ShortDot',
				yAxis: 2,
				tooltip: { valueSuffix: ` ${input.units.pressure}` }
			},
			{
				name: 'Humidité',
				visible: false, // masquée par défaut : activable via la légende (bonus discret)
				showInLegend: hasHumidity,
				data: humidityData,
				type: 'spline',
				marker: { enabled: false },
				lineWidth: 1,
				color: '#c084fc',
				yAxis: 3,
				tooltip: { valueSuffix: ' %' }
			},
			{
				name: 'Vent',
				type: 'windbarb',
				id: 'windbarbs',
				data: windData,
				color: '#7dd3fc',
				lineWidth: 1.5,
				vectorLength: 18,
				yOffset: -15,
				yAxis: 4,
				tooltip: {
					pointFormatter: function () {
						const p = this as unknown as {
							value: number;
							beaufortLevel?: number;
							color?: string;
							series: { name: string };
						};
						const beaufort =
							p.beaufortLevel !== undefined ? ` (${BEAUFORT_FR[p.beaufortLevel] ?? ''})` : '';
						// p.value reste en m/s ; conversion à l'affichage via windDisplay.
						const speed = (p.value * windDisplay.factor).toFixed(1).replace('.', ',');
						return (
							`<span style="color:${p.color ?? '#7dd3fc'}">●</span> ` +
							`${p.series.name} : <b>${speed} ${windDisplay.unit}</b>${beaufort}<br/>`
						);
					}
				}
			}
		]
	} as Options;
}
