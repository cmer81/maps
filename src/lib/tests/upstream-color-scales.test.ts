import { defaultOmProtocolSettings, getColor, getColorScale } from '@openmeteo/weather-map-layer';
import { describe, expect, it } from 'vitest';

import { standardColorScales } from '$lib/stores/om-protocol-settings';

import { convectiveInhibitionScale } from '$lib/color-scales/convective-inhibition';
import { heatFluxScale } from '$lib/color-scales/heat-flux';
import { categoricalLegendEntries, isCategorical } from '$lib/color-scales/legend';
import { lightningPotentialScale } from '$lib/color-scales/lightning-potential';
import { precipitationScale } from '$lib/color-scales/precipitation';
import { soilMoistureScale } from '$lib/color-scales/soil-moisture';
import { updraftScale } from '$lib/color-scales/updraft';
import { weatherCodeScale } from '$lib/color-scales/weather-code';
import { CATEGORICAL_VARIABLES } from '$lib/constants';

import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

/** Variables « Autres » des domaines upstream qui retombaient sur le fallback
 *  `temperature` (°C) du package, ou sur une échelle du package inadaptée aux
 *  valeurs réelles. Bornes mesurées sur les `.om` réels (cf. commentaires). */
const upstream: [string, BreakpointColorScale][] = [
	['weather_code', weatherCodeScale],
	['lightning_potential', lightningPotentialScale],
	['updraft', updraftScale],
	['heat_flux', heatFluxScale],
	['convective_inhibition', convectiveInhibitionScale],
	['soil_moisture', soilMoistureScale]
];

describe('upstream color scales', () => {
	it.each(upstream)('%s has aligned, ascending breakpoints', (_name, scale) => {
		expect(scale.type).toBe('breakpoint');
		const colors = scale.colors as number[][];
		expect(Array.isArray(colors)).toBe(true);
		expect(colors.length).toBe(scale.breakpoints.length);
		for (let i = 1; i < scale.breakpoints.length; i++) {
			expect(scale.breakpoints[i]).toBeGreaterThan(scale.breakpoints[i - 1]);
		}
		for (const c of colors) {
			expect(c.length).toBe(4);
			expect(c[3]).toBeGreaterThanOrEqual(0);
			expect(c[3]).toBeLessThanOrEqual(1);
		}
	});

	it.each(upstream)('%s declares a non-temperature unit', (_name, scale) => {
		expect(scale.unit).not.toBe('°C');
	});
});

/** Le cœur du bug : `getColorScale` retombe sur `colorScales.temperature` pour
 *  toute variable sans clé exacte ni famille — couleurs ET unité (°C) affichées
 *  dans la légende et le popup. Chaque variable listée ici doit désormais
 *  résoudre vers sa propre échelle, jamais vers le fallback. */
describe('no variable silently falls back to the temperature scale', () => {
	const fallbackUnit = defaultOmProtocolSettings.colorScales.temperature.unit;

	it.each([
		['weather_code', ''],
		['lightning_potential', 'J/kg'],
		['updraft', 'm/s'],
		['sensible_heat_flux', 'W/m²'],
		['latent_heat_flux', 'W/m²'],
		['convective_inhibition', 'J/kg'],
		['soil_moisture_0_to_1cm', 'm³/m³'],
		['soil_moisture_27_to_81cm', 'm³/m³'],
		['freezing_level_height', 'm'],
		['snowfall_height', 'm']
	])('%s resolves to unit %s, not the °C fallback', (variable, unit) => {
		const scale = getColorScale(variable, false, standardColorScales);
		expect(scale.unit).toBe(unit);
		expect(scale.unit).not.toBe(fallbackUnit);
	});
});

describe('weather_code categorical scale', () => {
	it('is detected as categorical so the legend renders category labels', () => {
		expect(isCategorical(weatherCodeScale)).toBe(true);
		expect(categoricalLegendEntries(weatherCodeScale).length).toBe(
			weatherCodeScale.breakpoints.length
		);
	});

	it('covers every WMO 4677 code emitted by the ICON domains', () => {
		// Codes relevés dans le `.om` dwd_icon_d2 (run 2026-09-14 09Z) :
		// 0,1,2,3,45,51,53,55,61,63,80,81,95,96,99 — plus le reste de la table WMO.
		for (const code of [0, 1, 2, 3, 45, 51, 53, 55, 61, 63, 80, 81, 95, 96, 99]) {
			expect(weatherCodeScale.breakpoints).toContain(code);
		}
	});

	it('maps each code to its own colour (exact breakpoint hit)', () => {
		const colors = weatherCodeScale.colors;
		weatherCodeScale.breakpoints.forEach((code, i) => {
			expect(getColor(weatherCodeScale, code)).toEqual(colors[i]);
		});
	});

	it('renders a clear sky transparent so the basemap stays readable', () => {
		expect(weatherCodeScale.colors[0][3]).toBe(0);
		expect(weatherCodeScale.categories[0].code).toBe(0);
	});

	it('is flagged categorical so the om:// URL requests nearest-neighbour sampling', () => {
		expect(CATEGORICAL_VARIABLES).toContain('weather_code');
	});
});

describe('convective_inhibition is rendered on both sign conventions', () => {
	// `arome_france_convection` publie le CIN négatif (mesuré : −267…+10),
	// `dwd_icon_d2` le publie positif (mesuré : 0…295). `postReadCallback`
	// normalise en magnitude positive ; l'échelle doit donc être positive.
	it('uses a positive magnitude scale', () => {
		expect(convectiveInhibitionScale.breakpoints[0]).toBe(0);
		expect(
			convectiveInhibitionScale.breakpoints[convectiveInhibitionScale.breakpoints.length - 1]
		).toBeGreaterThan(0);
	});

	it('is transparent where there is no inhibition', () => {
		expect((convectiveInhibitionScale.colors as number[][])[0][3]).toBe(0);
	});

	it('colours a strong lid opaquely on both domains after normalisation', () => {
		// Bornes mesurées : arome_france_convection −267 J/kg, dwd_icon_d2 +295 J/kg.
		// `postReadCallback` applique `Math.abs` avant le LUT couleur.
		const resolved = getColorScale('convective_inhibition', false, standardColorScales);
		const norm = (v: number) => Math.abs(v);
		expect(getColor(resolved, norm(-267))[3]).toBeGreaterThan(0.5);
		expect(getColor(resolved, norm(295))[3]).toBeGreaterThan(0.5);
	});
});

describe('scales span the values actually present in the .om files', () => {
	// Bornes mesurées sur dwd_icon_d2, run 2026-09-14 09Z, échéance 14:00 (746×1215).
	const measured: [string, BreakpointColorScale, number, number][] = [
		['lightning_potential', lightningPotentialScale, 0, 22.6],
		['updraft', updraftScale, 0, 11.08],
		['sensible_heat_flux', heatFluxScale, -416.7, 118.1],
		['latent_heat_flux', heatFluxScale, -409.7, 20.8],
		['soil_moisture', soilMoistureScale, 0, 0.761]
	];

	it.each(measured)('%s does not saturate at its real extremes', (_n, scale, min, max) => {
		const bp = scale.breakpoints;
		expect(bp[0]).toBeLessThanOrEqual(min);
		expect(bp[bp.length - 1]).toBeGreaterThanOrEqual(max);
	});
});

/** `freezing_level_height` et `snowfall_height` gardent le défaut du package.
 *  Ses bornes −5200…5200 m invitent à le resserrer, mais ses breakpoints ne sont
 *  pas équirépartis : la bande 0…5200 m est déjà échantillonnée tous les
 *  160-200 m et aucun pixel mesuré ne sature. Une échelle « resserrée » mais plus
 *  grossière dégraderait le rendu — ce garde-fou verrouille la résolution. */
describe('the altitude levels keep the package default', () => {
	it.each(['freezing_level_height', 'snowfall_height'])(
		'%s samples the useful band at least every 250 m',
		(variable) => {
			const scale = getColorScale(variable, false, standardColorScales);
			if (scale.type !== 'breakpoint') throw new Error('expected a breakpoint scale');
			const positive = scale.breakpoints.filter((b) => b >= 0);
			const gaps = positive.slice(1).map((b, i) => b - positive[i]);
			expect(Math.max(...gaps)).toBeLessThanOrEqual(250);
			expect(positive[positive.length - 1]).toBeGreaterThanOrEqual(5080);
		}
	);

	it('spans the measured snow line range without saturating', () => {
		// Mesuré sur dwd_icon_d2 (run 2026-09-14 09Z, 14:00) : −170…4030 m.
		const scale = getColorScale('snowfall_height', false, standardColorScales);
		if (scale.type !== 'breakpoint') throw new Error('expected a breakpoint scale');
		expect(scale.breakpoints[0]).toBeLessThanOrEqual(-170);
		expect(scale.breakpoints[scale.breakpoints.length - 1]).toBeGreaterThanOrEqual(4030);
	});
});

/** Non-régression de l'échelle de précipitations 0,5 → 800 mm (spec US5, FR-015) :
 *  seules precipitation / rain / showers / precipitation_sum changent d'échelle. */
describe('échelle de précipitations — les autres variables ne bougent pas', () => {
	it.each(['precipitation', 'rain', 'showers', 'precipitation_sum'])(
		'%s utilise l’échelle 0,5 → 800 mm',
		(v) => {
			expect(getColorScale(v, false, standardColorScales)).toEqual(precipitationScale);
		}
	);

	it.each([
		'wind_speed_10m',
		'pressure_msl',
		'cloud_cover',
		'precipitation_probability',
		'snowfall_water_equivalent'
	])('%s garde l’échelle du package', (v) => {
		for (const dark of [false, true]) {
			expect(getColorScale(v, dark, standardColorScales)).toEqual(
				getColorScale(v, dark, defaultOmProtocolSettings.colorScales)
			);
		}
	});

	it.each([
		'temperature_2m',
		'snowfall_sum',
		'graupel_sum',
		'snow_graupel_sum',
		'snowfall_water_equivalent_sum',
		'precipitation_type',
		'radar_reflectivity'
	])('%s n’utilise pas l’échelle de précipitations', (v) => {
		expect(getColorScale(v, false, standardColorScales)).not.toEqual(precipitationScale);
	});
});
