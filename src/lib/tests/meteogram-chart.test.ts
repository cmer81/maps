import { describe, expect, it } from 'vitest';

import {
	type MeteogramChartInput,
	buildChartOptions,
	dayBoundaryPlotLines
} from '$lib/meteogram/meteogram-chart';

function input(overrides: Partial<MeteogramChartInput> = {}): MeteogramChartInput {
	const times = [0, 1, 2, 3].map((h) => new Date(Date.UTC(2026, 6, 10, h)));
	const four = (v: number) => [v, v, v, v];
	return {
		times,
		temperature: four(20),
		dewPoint: four(12),
		precipitation: [0, 0.5, 1.2, 0],
		pressure: four(1015),
		windSpeed: four(5),
		windDirection: four(230),
		symbolLabels: ['Ciel clair', 'Ciel clair', 'Pluie faible', null],
		units: { temperature: '°C', precipitation: 'mm', pressure: 'hPa' },
		timezone: 'Europe/Paris',
		onTimeClick: () => {},
		...overrides
	};
}

describe('buildChartOptions', () => {
	it('déclare 5 axes Y (T°, précip, pression, humidité, windbarb)', () => {
		const o = buildChartOptions(input());
		expect(o.yAxis).toHaveLength(5);
	});

	it('windbarb sur un axe Y dédié invisible (sinon ses valeurs écrasent l’échelle des T°)', () => {
		// Bug prod : la série windbarb partageait l'axe 0 (températures) — ses
		// `value` (m/s, seuil 0) entraient dans le calcul des extrêmes → échelle
		// étirée de 0 au max du vent dès que la série était visible.
		const o = buildChartOptions(input());
		const barbs = (o.series as { type?: string; yAxis?: number }[]).find(
			(s) => s.type === 'windbarb'
		)!;
		expect(barbs.yAxis).toBe(4);
		expect((o.yAxis as { visible?: boolean }[])[4].visible).toBe(false);
	});

	it('axe T° ajusté aux données : pas d’arrondi des extrêmes au tick (échelle non écrasée)', () => {
		// Même sans les windbarbs, les défauts startOnTick/endOnTick (true)
		// arrondissent les extrêmes au tick entier : avec un tick de 25, une
		// courbe 25-32 °C donnait un axe 0-50 (courbe tassée sur la moitié).
		const o = buildChartOptions(input());
		const tempAxis = (
			o.yAxis as { startOnTick?: boolean; endOnTick?: boolean; tickPixelInterval?: number }[]
		)[0];
		expect(tempAxis.startOnTick).toBe(false);
		expect(tempAxis.endOnTick).toBe(false);
		// Grille assez dense pour la faible hauteur du tiroir : le défaut (72px)
		// pouvait ne laisser qu'une seule graduation sur le rendu initial.
		expect(tempAxis.tickPixelInterval).toBe(40);
	});

	it('pression : trait lisible — pleine opacité, 1,5px (feedback prod « terne »)', () => {
		const o = buildChartOptions(input());
		const p = (o.series as { name?: string; lineWidth?: number; color?: string }[]).find(
			(s) => s.name === 'Pression'
		)!;
		expect(p.color).toBe('#fbbf24');
		expect(p.lineWidth).toBe(1.5);
	});

	it('6 séries : température, rosée, précip, pression, humidité, windbarb — sur le bon axe', () => {
		const o = buildChartOptions(input());
		const s = o.series as { type?: string; yAxis?: number; name?: string }[];
		expect(s.map((x) => x.type)).toEqual([
			'spline',
			'spline',
			'column',
			'spline',
			'spline',
			'windbarb'
		]);
		expect(s[2].yAxis).toBe(1); // précip
		expect(s[3].yAxis).toBe(2); // pression
		expect(s[4].yAxis).toBe(3); // humidité
	});

	it('température porte x (ms epoch) et symbolName pour le tooltip', () => {
		const o = buildChartOptions(input());
		const temp = (o.series as { data?: { x: number; symbolName?: string | null }[] }[])[0];
		expect(temp.data).toHaveLength(4);
		expect(temp.data![0].x).toBe(Date.UTC(2026, 6, 10, 0));
		expect(temp.data![2].symbolName).toBe('Pluie faible');
	});

	it('windbarbs : 1 point sur 2, {x, value, direction}, null écartés', () => {
		const o = buildChartOptions(input({ windSpeed: [5, 6, null, 8] }));
		const barbs = (o.series as { type?: string; data?: unknown[] }[]).find(
			(s) => s.type === 'windbarb'
		)!;
		// indices pairs 0 et 2 ; 2 est null → écarté ⇒ 1 point
		expect(barbs.data).toHaveLength(1);
		expect(barbs.data![0]).toMatchObject({ value: 5, direction: 230 });
	});

	it('grille horaire : 2 h sur horizon court, 6 h au-delà de 72 points, sans grille mineure', () => {
		const short = buildChartOptions(input());
		expect((short.xAxis as { tickInterval?: number }[])[0].tickInterval).toBe(2 * 36e5);
		// Garde anti-régression « barres blanches » : pas de grille mineure (le
		// défaut Highcharts #f2f2f2 ressort en barres blanches sur fond sombre),
		// et tout élément d'axe posé explicitement (jamais les défauts clairs).
		const shortAxis = (
			short.xAxis as {
				minorTickInterval?: number;
				minorGridLineWidth?: number;
				lineColor?: string;
				tickColor?: string;
			}[]
		)[0];
		expect(shortAxis.minorTickInterval).toBeUndefined();
		expect(shortAxis.minorGridLineWidth).toBe(0);
		expect(shortAxis.lineColor).toBeDefined();
		expect(shortAxis.tickColor).toBeDefined();

		const n = 96;
		const times = Array.from({ length: n }, (_, h) => new Date(Date.UTC(2026, 6, 10) + h * 36e5));
		const flat = (v: number) => Array.from({ length: n }, () => v);
		const long = buildChartOptions(
			input({
				times,
				temperature: flat(20),
				dewPoint: flat(12),
				precipitation: flat(0),
				pressure: flat(1015),
				windSpeed: flat(5),
				windDirection: flat(230),
				symbolLabels: Array.from({ length: n }, () => null)
			})
		);
		expect((long.xAxis as { tickInterval?: number }[])[0].tickInterval).toBe(6 * 36e5);
		expect((long.xAxis as { minorTickInterval?: number }[])[0].minorTickInterval).toBeUndefined();
	});

	it('affiche le chart dans le fuseau du point (heure locale)', () => {
		expect((buildChartOptions(input()).time as { timezone?: string }).timezone).toBe(
			'Europe/Paris'
		);
		expect(
			(buildChartOptions(input({ timezone: 'Indian/Reunion' })).time as { timezone?: string })
				.timezone
		).toBe('Indian/Reunion');
	});

	it('tooltip 100 % français : heure locale (sans UTC/TU) et Beaufort FR sur le vent', () => {
		const o = buildChartOptions(input());
		const header = (o.tooltip as { headerFormat?: string }).headerFormat ?? '';
		expect(header).not.toContain('UTC');
		expect(header).not.toMatch(/\bTU\b/);

		const barbs = (
			o.series as {
				type?: string;
				tooltip?: { pointFormatter?: (this: unknown) => string };
			}[]
		).find((s) => s.type === 'windbarb')!;
		const rendered = barbs.tooltip!.pointFormatter!.call({
			value: 4.2,
			beaufortLevel: 3,
			color: '#7dd3fc',
			series: { name: 'Vent' }
		});
		expect(rendered).toContain('Petite brise');
		// Valeur brute 4,2 m/s convertie à l'affichage (× 3,6) → 15,1 km/h.
		expect(rendered).toContain('15,1 km/h');
		expect(rendered).not.toContain('Light');
	});

	it('désactive le menu contextuel exporting (libellés anglais, redondant)', () => {
		const o = buildChartOptions(input());
		const exporting = (o as { exporting?: { buttons?: { contextButton?: { enabled?: boolean } } } })
			.exporting;
		expect(exporting?.buttons?.contextButton?.enabled).toBe(false);
	});

	it('pression entièrement nulle : axe et série pression masqués', () => {
		const o = buildChartOptions(input({ pressure: [null, null, null, null] }));
		// Cas AROME France HD : l'API ne diffuse pas pressure_msl. Sans donnée,
		// l'axe de droite resterait un titre « hPa » orphelin sans graduations.
		const yAxes = o.yAxis as { visible?: boolean }[];
		expect(yAxes[2].visible).toBe(false);
		const pressureSeries = (o.series as { name?: string; visible?: boolean }[]).find(
			(s) => s.name === 'Pression'
		)!;
		expect(pressureSeries.visible).toBe(false);
	});

	it('pression présente : axe pression visible', () => {
		const o = buildChartOptions(input());
		const yAxes = o.yAxis as { visible?: boolean }[];
		expect(yAxes[2].visible).not.toBe(false);
		const pressureSeries = (o.series as { name?: string; visible?: boolean }[]).find(
			(s) => s.name === 'Pression'
		)!;
		expect(pressureSeries.visible).not.toBe(false);
	});

	it('humidité fournie : série masquée par défaut mais présente en légende', () => {
		const o = buildChartOptions(input({ humidity: [40, 55, 60, 45] }));
		const humAxis = (o.yAxis as { min?: number; max?: number; showEmpty?: boolean }[])[3];
		expect(humAxis.min).toBe(0);
		expect(humAxis.max).toBe(100);
		expect(humAxis.showEmpty).toBe(false);
		const hum = (o.series as { name?: string; visible?: boolean; showInLegend?: boolean }[]).find(
			(x) => x.name === 'Humidité'
		)!;
		expect(hum.visible).toBe(false);
		expect(hum.showInLegend).toBe(true);
	});

	it('humidité absente/nulle : série hors légende, axe masqué', () => {
		const o = buildChartOptions(input());
		expect((o.yAxis as { visible?: boolean }[])[3].visible).toBe(false);
		const hum = (o.series as { name?: string; visible?: boolean; showInLegend?: boolean }[]).find(
			(x) => x.name === 'Humidité'
		)!;
		expect(hum.visible).toBe(false);
		expect(hum.showInLegend).toBe(false);
	});

	it('unités injectées dans tooltips/axes', () => {
		const o = buildChartOptions(
			input({ units: { temperature: '°F', precipitation: 'inch', pressure: 'hPa' } })
		);
		const json = JSON.stringify(o);
		expect(json).toContain('°F');
		expect(json).toContain('inch');
	});

	it('vent : pas de nombres sur les barbules (dataLabels non activés)', () => {
		const o = buildChartOptions(input());
		const barbs = (o.series as { type?: string; dataLabels?: { enabled?: boolean } }[]).find(
			(s) => s.type === 'windbarb'
		)!;
		expect(barbs.dataLabels?.enabled).not.toBe(true);
	});

	it('vent : tooltip à l’unité de préférence (windDisplay)', () => {
		const o = buildChartOptions(input({ windDisplay: { factor: 1, unit: 'm/s' } }));
		const barbs = (
			o.series as { type?: string; tooltip?: { pointFormatter?: (this: unknown) => string } }[]
		).find((s) => s.type === 'windbarb')!;
		const rendered = barbs.tooltip!.pointFormatter!.call({
			value: 4.2,
			beaufortLevel: 3,
			color: '#7dd3fc',
			series: { name: 'Vent' }
		});
		expect(rendered).toContain('4,2 m/s');
	});

	it('légende activée (identifie les courbes)', () => {
		const o = buildChartOptions(input());
		expect((o.legend as { enabled?: boolean }).enabled).toBe(true);
	});

	it('étiquettes de précipitations à 10px (lisibilité)', () => {
		const o = buildChartOptions(input());
		const precip = (
			o.series as { name?: string; dataLabels?: { style?: { fontSize?: string } } }[]
		).find((s) => s.name === 'Précipitations')!;
		expect(precip.dataLabels?.style?.fontSize).toBe('10px');
	});

	it('axe T° auto-adaptable : pas de tickInterval forcé, minRange conservé', () => {
		const o = buildChartOptions(input());
		const tempAxis = (o.yAxis as { tickInterval?: number; minRange?: number }[])[0];
		expect(tempAxis.tickInterval).toBeUndefined();
		expect(tempAxis.minRange).toBe(8);
	});

	it('date de minuit courte (« mer. 15 », sans mois) — les dates longues faisaient pivoter tous les labels', () => {
		// Feedback prod : « mer. 15 juil. » débordait de son créneau de tick →
		// Highcharts passait TOUS les labels de l'axe X en biais, premier label
		// tronqué (« mer. 15 juil.me… »). La date courte tient horizontale.
		const o = buildChartOptions(input());
		const labels = (o.xAxis as { labels?: { formatter?: (this: unknown) => string } }[])[0].labels!;
		const time = {
			// Renvoie '00' pour %H (déclenche la branche date) et échoïse le format
			// sinon — permet d'asserter le gabarit de date sans runtime Highcharts.
			dateFormat: (f: string) => (f === '%H' ? '00' : f)
		};
		const rendered = labels.formatter!.call({ value: 0, axis: { chart: { time } } });
		expect(rendered).toContain('%a %e');
		expect(rendered).not.toContain('%b');
		expect(rendered).toContain('font-weight: bold');
	});

	it('un seul axe X, avec séparateurs de jour (plotLines)', () => {
		const o = buildChartOptions(input());
		expect(o.xAxis).toHaveLength(1);
		const axis = (o.xAxis as { plotLines?: unknown[] }[])[0];
		expect(Array.isArray(axis.plotLines)).toBe(true);
	});

	it('dayBoundaryPlotLines : un trait à chaque minuit local (premier point exclu)', () => {
		// 50 h horaires depuis minuit UTC, fuseau UTC → minuits à h=24 et h=48.
		const times = Array.from({ length: 50 }, (_, h) => new Date(Date.UTC(2026, 6, 10) + h * 36e5));
		const lines = dayBoundaryPlotLines(times, 'UTC');
		expect(lines.map((l) => l.value)).toEqual([Date.UTC(2026, 6, 11), Date.UTC(2026, 6, 12)]);
	});
});
