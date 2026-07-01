import { defaultOmProtocolSettings, getColor, getColorScale } from '@openmeteo/weather-map-layer';
import { describe, expect, it } from 'vitest';

import { brightnessTemperatureScale } from '$lib/color-scales/brightness-temperature';
import { brightnessTemperatureWvScale } from '$lib/color-scales/brightness-temperature-wv';
import { capeScale } from '$lib/color-scales/cape';
import { convectiveInhibitionScale } from '$lib/color-scales/convective-inhibition';
import { infoclimatTemperatureScale } from '$lib/color-scales/infoclimat-temperature';
import { lightningDensityScale } from '$lib/color-scales/lightning-density';
import { precipitableWaterScale } from '$lib/color-scales/precipitable-water';
import { precipitationTypeScale } from '$lib/color-scales/precipitation-type';
import { radarReflectivityScale } from '$lib/color-scales/radar-reflectivity';
import { visibilityScale } from '$lib/color-scales/visibility';

import type { BreakpointColorScale } from '@openmeteo/weather-map-layer';

const continuous: [string, BreakpointColorScale][] = [
	['radar', radarReflectivityScale],
	['brightness', brightnessTemperatureScale],
	['brightness_wv', brightnessTemperatureWvScale],
	['cape', capeScale],
	['cin', convectiveInhibitionScale],
	['visibility', visibilityScale],
	['lightning', lightningDensityScale],
	['precipitable_water', precipitableWaterScale]
];

describe('continuous convection color scales', () => {
	it.each(continuous)('%s has aligned, ascending breakpoints', (_name, scale) => {
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

	it('radar reflectivity is transparent below the first threshold', () => {
		expect(radarReflectivityScale.breakpoints[0]).toBe(0);
		expect((radarReflectivityScale.colors as number[][])[0][3]).toBe(0);
	});

	it('cape and lightning are transparent at zero', () => {
		expect((capeScale.colors as number[][])[0][3]).toBe(0);
		expect((lightningDensityScale.colors as number[][])[0][3]).toBe(0);
	});

	it('lightning density uses flash-density units and scales to several tens', () => {
		expect(lightningDensityScale.unit).toBe('km⁻² day⁻¹');
		// Cellule orageuse : plusieurs dizaines de km⁻²·jour⁻¹ → la borne haute ≥ 50.
		expect(lightningDensityScale.breakpoints.at(-1)).toBeGreaterThanOrEqual(50);
	});

	it('precipitable water uses a moisture (mm) unit, not the °C fallback', () => {
		expect(precipitableWaterScale.unit).toBe('mm');
		// Colonne d'eau précipitable : couvre au moins jusqu'à ~50 mm (fortes
		// masses d'air humides convectives).
		expect(precipitableWaterScale.breakpoints.at(-1)).toBeGreaterThanOrEqual(50);
	});
});

describe('arome_france_convection color scale resolution', () => {
	// Reproduit le sous-ensemble de `standardColorScales` (om-protocol-settings.ts)
	// pertinent pour arome_france_convection, sans importer le store (deps browser).
	// Une clé EXACTE dans la source prime sur la résolution par famille / fallback
	// (qui mapperait `precipitable_water` sur `temperature` en °C).
	const source = {
		...defaultOmProtocolSettings.colorScales,
		radar_reflectivity: radarReflectivityScale,
		brightness_temperature: brightnessTemperatureScale,
		brightness_temperature_wv: brightnessTemperatureWvScale,
		cape: capeScale,
		convective_inhibition: convectiveInhibitionScale,
		visibility: visibilityScale,
		lightning_density: lightningDensityScale,
		precipitation_type: precipitationTypeScale,
		precipitation_type_severe: precipitationTypeScale,
		precipitable_water: precipitableWaterScale
	};
	const unitOf = (variable: string) => getColorScale(variable, false, source).unit;

	it('résout precipitable_water en mm et non sur le fallback température (°C)', () => {
		expect(unitOf('precipitable_water')).toBe('mm');
	});
});

describe('precipitation_type categorical scale', () => {
	const scale = precipitationTypeScale;
	const colors = scale.colors as number[][];

	it('aligns breakpoints, colors and categories index-by-index', () => {
		expect(colors.length).toBe(scale.breakpoints.length);
		expect(scale.categories.length).toBe(scale.breakpoints.length);
		for (let i = 0; i < scale.breakpoints.length; i++) {
			expect(scale.categories[i].code).toBe(scale.breakpoints[i]);
		}
	});

	it('has ascending breakpoints covering every producer code', () => {
		const codes = [0, 1, 3, 5, 6, 7, 8, 10, 11, 12, 193, 201, 205, 206, 207];
		expect(scale.breakpoints).toEqual(codes);
		for (let i = 1; i < scale.breakpoints.length; i++) {
			expect(scale.breakpoints[i]).toBeGreaterThan(scale.breakpoints[i - 1]);
		}
	});

	it('renders code 0 (aucune) transparent', () => {
		expect(getColor(scale, 0)[3]).toBe(0);
	});

	it('maps each exact code to its own color via findLastIndexLE bucketing', () => {
		const idxHail = scale.breakpoints.indexOf(10);
		const idxSleet = scale.breakpoints.indexOf(193);
		expect(getColor(scale, 10)).toEqual(colors[idxHail]);
		expect(getColor(scale, 193)).toEqual(colors[idxSleet]);
		expect(getColor(scale, 1)).toEqual(colors[scale.breakpoints.indexOf(1)]);
	});

	it('maps a non-existent intermediate integer to the nearest lower code color', () => {
		expect(getColor(scale, 50)).toEqual(colors[scale.breakpoints.indexOf(12)]);
	});

	it('shares base RGB with reduced alpha for intermittent/melting variants', () => {
		// 193 neige fondante & 206 neige humide interm. dérivent de 6 (neige humide).
		// 201 pluie interm. dérive de 1 (pluie). 205 neige sèche interm. dérive de 5.
		// 207 pluie+neige interm. dérive de 7. Même RGB, alpha strictement plus faible.
		const variants: [number, number][] = [
			[201, 1],
			[205, 5],
			[206, 6],
			[207, 7],
			[193, 6]
		];
		for (const [variant, base] of variants) {
			const v = colors[scale.breakpoints.indexOf(variant)];
			const b = colors[scale.breakpoints.indexOf(base)];
			expect(v.slice(0, 3)).toEqual(b.slice(0, 3));
			expect(v[3]).toBeLessThan(b[3]);
		}
	});

	it('labels the key categories correctly', () => {
		const labelOf = (code: number) => scale.categories.find((c) => c.code === code)?.label;
		expect(labelOf(0)).toBe('Aucune');
		expect(labelOf(1)).toBe('Pluie');
		expect(labelOf(3)).toBe('Pluie verglaçante');
		expect(labelOf(5)).toBe('Neige sèche');
		expect(labelOf(10)).toBe('Grêle');
		expect(labelOf(193)).toBe('Neige fondante');
	});
});

describe('arome_france_hd color scale resolution', () => {
	// Reproduit le sous-ensemble de `standardColorScales` (om-protocol-settings.ts)
	// pertinent pour arome_france_hd, sans importer le store (deps browser). Le
	// package résout via `getColorScale(variable, dark, source)` : une clé EXACTE
	// dans la source prime sur la résolution par famille / fallback.
	const source = {
		...defaultOmProtocolSettings.colorScales,
		reflectivity_max: radarReflectivityScale,
		graupel_sum: defaultOmProtocolSettings.colorScales.precipitation,
		snow_graupel_sum: defaultOmProtocolSettings.colorScales.precipitation,
		snowfall_water_equivalent_sum: defaultOmProtocolSettings.colorScales.precipitation,
		wind_chill_2m: infoclimatTemperatureScale,
		humidex: infoclimatTemperatureScale
	};
	const unitOf = (variable: string) => getColorScale(variable, false, source).unit;

	it('évite le fallback température absurde sur les variables non standard', () => {
		// Sans clé exacte, le package mappait ces variables sur `temperature` (°C) ou
		// `wind` (m/s) — cf. l'algo getOptionalColorScale (`_sum` non strippé, etc.).
		expect(unitOf('reflectivity_max')).toBe('dBZ');
		expect(unitOf('graupel_sum')).toBe('mm');
		expect(unitOf('snow_graupel_sum')).toBe('mm');
		expect(unitOf('snowfall_water_equivalent_sum')).toBe('mm');
		expect(unitOf('wind_chill_2m')).toBe('°C');
		expect(unitOf('humidex')).toBe('°C');
	});

	it('laisse intactes les variables déjà bien résolues par le package', () => {
		expect(unitOf('relative_humidity_2m')).toBe('%');
		expect(unitOf('wind_gusts_10m_max')).toBe('m/s');
		expect(unitOf('temperature_2m_max')).toBe('°C');
	});
});
