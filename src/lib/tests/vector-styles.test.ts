import {
	type Feature,
	type FilterSpecification,
	featureFilter
} from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';

import {
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildContourColorExpr,
	buildContourLabelExpr,
	buildContourWidthExpr,
	buildGridDecimationFilter,
	buildGridValueLabelExpr,
	computeStride,
	defaultArrowStyle,
	defaultContourStyle,
	deriveDisplayedWindLevel,
	hexToRgbaString,
	isWindVariable,
	parseRgbaOpacity,
	pxPerDegLon,
	rgbaStringToHex
} from '$lib/vector-styles';

/**
 * Minimal evaluator for the subset of MapLibre expressions our builders emit.
 * `value` is the feature property read by `['get', 'value']`.
 */
function evalExpr(expr: unknown, value: number): unknown {
	if (!Array.isArray(expr)) return expr;
	const [op, ...args] = expr as [string, ...unknown[]];
	switch (op) {
		case 'get':
			return value;
		case 'to-number':
			return Number(evalExpr(args[0], value));
		case 'literal':
			return args[0];
		case '%':
			return (evalExpr(args[0], value) as number) % (evalExpr(args[1], value) as number);
		case '==':
			return evalExpr(args[0], value) === evalExpr(args[1], value);
		case '>':
			return (evalExpr(args[0], value) as number) > (evalExpr(args[1], value) as number);
		case 'boolean':
			return Boolean(evalExpr(args[0], value));
		case 'case': {
			for (let i = 0; i + 1 < args.length; i += 2) {
				if (evalExpr(args[i], value)) return evalExpr(args[i + 1], value);
			}
			return evalExpr(args[args.length - 1], value);
		}
		default:
			throw new Error(`Unsupported op: ${op}`);
	}
}

describe('buildContourColorExpr (default, light)', () => {
	const expr = buildContourColorExpr(defaultContourStyle, false);
	it('×100 → 0.6', () => expect(evalExpr(expr, 100)).toBe('rgba(0,0,0, 0.6)'));
	it('×50 → 0.5', () => expect(evalExpr(expr, 50)).toBe('rgba(0,0,0, 0.5)'));
	it('×10 → 0.4', () => expect(evalExpr(expr, 10)).toBe('rgba(0,0,0, 0.4)'));
	it('other → fallback 0.3', () => expect(evalExpr(expr, 7)).toBe('rgba(0,0,0, 0.3)'));
});

describe('buildContourColorExpr (default, dark)', () => {
	const expr = buildContourColorExpr(defaultContourStyle, true);
	it('×100 → 0.8 white', () => expect(evalExpr(expr, 100)).toBe('rgba(255,255,255, 0.8)'));
	it('other → fallback 0.5 white', () => expect(evalExpr(expr, 7)).toBe('rgba(255,255,255, 0.5)'));
});

describe('buildContourWidthExpr (default)', () => {
	const expr = buildContourWidthExpr(defaultContourStyle);
	it('×100 → 3', () => expect(evalExpr(expr, 100)).toBe(3));
	it('×50 → 2.5', () => expect(evalExpr(expr, 50)).toBe(2.5));
	it('×10 → 2', () => expect(evalExpr(expr, 20)).toBe(2));
	it('other → 1', () => expect(evalExpr(expr, 7)).toBe(1));
});

describe('buildArrowColorExpr (default, light)', () => {
	const expr = buildArrowColorExpr(defaultArrowStyle, false);
	it('≤2 → base 0.2', () => expect(evalExpr(expr, 1)).toBe('rgba(0,0,0, 0.2)'));
	it('>2 → 0.3', () => expect(evalExpr(expr, 2.5)).toBe('rgba(0,0,0, 0.3)'));
	it('>3 → 0.4', () => expect(evalExpr(expr, 3.5)).toBe('rgba(0,0,0, 0.4)'));
	it('>4 → 0.5', () => expect(evalExpr(expr, 4.5)).toBe('rgba(0,0,0, 0.5)'));
	it('>5 → 0.6', () => expect(evalExpr(expr, 7)).toBe('rgba(0,0,0, 0.6)'));
	it('>10 → 0.7', () => expect(evalExpr(expr, 15)).toBe('rgba(0,0,0, 0.7)'));
	it('>20 → still 0.7', () => expect(evalExpr(expr, 25)).toBe('rgba(0,0,0, 0.7)'));
});

describe('buildArrowColorExpr (default, dark)', () => {
	const expr = buildArrowColorExpr(defaultArrowStyle, true);
	it('≤2 → base 0.2 white', () => expect(evalExpr(expr, 1)).toBe('rgba(255,255,255, 0.2)'));
	it('>10 → 0.7 white', () => expect(evalExpr(expr, 15)).toBe('rgba(255,255,255, 0.7)'));
});

describe('buildArrowWidthExpr (default)', () => {
	const expr = buildArrowWidthExpr(defaultArrowStyle);
	it('≤2 → 1.5', () => expect(evalExpr(expr, 1)).toBe(1.5));
	it('>2 → 1.6', () => expect(evalExpr(expr, 2.5)).toBe(1.6));
	it('>3 → 1.8', () => expect(evalExpr(expr, 3.5)).toBe(1.8));
	it('>4 → 1.8 (unchanged)', () => expect(evalExpr(expr, 4.5)).toBe(1.8));
	it('>5 → 2', () => expect(evalExpr(expr, 7)).toBe(2));
	it('>10 → 2.2', () => expect(evalExpr(expr, 15)).toBe(2.2));
	it('>20 → 2.8', () => expect(evalExpr(expr, 25)).toBe(2.8));
});

describe('buildContourLabelExpr', () => {
	const units = {
		temperature: '°C',
		precipitation: 'mm',
		windSpeed: 'km/h',
		distance: 'm',
		geopotential: 'gpm'
	} as const;

	it('géopotentiel + gpdam → number-format ×0,1', () => {
		const expr = buildContourLabelExpr('geopotential_height_500hPa', 'gpm', {
			...units,
			geopotential: 'gpdam'
		});
		expect(expr).toEqual([
			'number-format',
			['*', ['to-number', ['get', 'value']], 0.1],
			{ 'max-fraction-digits': 1 }
		]);
	});

	it('géopotentiel + gpm → valeur brute', () => {
		expect(buildContourLabelExpr('geopotential_height_500hPa', 'gpm', units)).toEqual([
			'to-string',
			['get', 'value']
		]);
	});

	it('vent m/s → km/h : number-format ×3,6', () => {
		const expr = buildContourLabelExpr('wind_speed_10m', 'm/s', { ...units, windSpeed: 'km/h' });
		expect(expr).toEqual([
			'number-format',
			['*', ['to-number', ['get', 'value']], 3.6],
			{ 'max-fraction-digits': 1 }
		]);
	});

	it('vent m/s → m/s : valeur brute (pas de conversion)', () => {
		expect(buildContourLabelExpr('wind_speed_10m', 'm/s', { ...units, windSpeed: 'm/s' })).toEqual([
			'to-string',
			['get', 'value']
		]);
	});

	it('température °C → °F : affine ×1,8 + 32', () => {
		const expr = buildContourLabelExpr('temperature_2m', '°C', { ...units, temperature: '°F' });
		expect(expr).toEqual([
			'number-format',
			['+', ['*', ['to-number', ['get', 'value']], 1.8], 32],
			{ 'max-fraction-digits': 1 }
		]);
	});

	it('température °C → °C : valeur brute', () => {
		expect(buildContourLabelExpr('temperature_2m', '°C', units)).toEqual([
			'to-string',
			['get', 'value']
		]);
	});
});

describe('rgba helpers', () => {
	it('parses opacity', () => expect(parseRgbaOpacity('rgba(0,0,0, 0.4)')).toBe(0.4));
	it('defaults to 1 when no alpha', () => expect(parseRgbaOpacity('rgb(0,0,0)')).toBe(1));
	it('rgba string → hex', () => expect(rgbaStringToHex('rgba(10, 20, 30, 0.4)')).toBe('#0a141e'));
	it('rgba string → hex (no alpha)', () =>
		expect(rgbaStringToHex('rgb(255, 0, 128)')).toBe('#ff0080'));
	it('hex + alpha → rgba string', () =>
		expect(hexToRgbaString('#0a141e', 0.4)).toBe('rgba(10, 20, 30, 0.4)'));
	it('round-trips', () => {
		const hex = rgbaStringToHex('rgba(0,0,0, 0.3)');
		const a = parseRgbaOpacity('rgba(0,0,0, 0.3)');
		expect(hexToRgbaString(hex, a)).toBe('rgba(0, 0, 0, 0.3)');
	});
});

describe('isWindVariable', () => {
	it('reconnaît les composantes u/v et speed/direction comme vent', () => {
		expect(isWindVariable('wind_u_component_10m')).toBe(true);
		expect(isWindVariable('wind_v_component_850hPa')).toBe(true);
		expect(isWindVariable('wind_speed_10m')).toBe(true);
		expect(isWindVariable('wind_direction_100m')).toBe(true);
	});

	it('exclut les rafales (pas de direction) et les non-vent', () => {
		expect(isWindVariable('wind_gusts_10m')).toBe(false);
		expect(isWindVariable('temperature_2m')).toBe(false);
		expect(isWindVariable('precipitation')).toBe(false);
	});
});

describe('deriveDisplayedWindLevel', () => {
	const WIND = ['wind_u_component_10m', 'wind_u_component_100m', 'wind_u_component_850hPa'];

	it('retombe sur 10 m pour une variable de surface 2 m', () => {
		expect(deriveDisplayedWindLevel('temperature_2m', WIND)).toBe('10m');
	});

	it('retombe sur 10 m pour une variable de surface sans niveau', () => {
		expect(deriveDisplayedWindLevel('precipitation', WIND)).toBe('10m');
	});

	it('utilise le niveau de pression de la variable quand le vent y est publié', () => {
		expect(deriveDisplayedWindLevel('temperature_850hPa', WIND)).toBe('850hPa');
	});

	it("retombe sur 10 m quand le vent du niveau de pression n'est pas publié", () => {
		expect(deriveDisplayedWindLevel('temperature_500hPa', WIND)).toBe('10m');
	});

	it('renvoie null quand le modèle ne publie aucun vent', () => {
		expect(deriveDisplayedWindLevel('temperature_2m', ['cape', 'precipitation'])).toBe(null);
	});
});

/** Évaluateur minimal du sous-ensemble d'expressions émis par le filtre de
 *  décimation. `ctx` fournit `id` (id du point) et `zoom` (niveau MapLibre). */
function evalFilter(expr: unknown, ctx: { id: number; zoom: number }): unknown {
	if (!Array.isArray(expr)) return expr;
	const [op, ...args] = expr as [string, ...unknown[]];
	switch (op) {
		case 'id':
			return ctx.id;
		case 'zoom':
			return ctx.zoom;
		case '%':
			return (evalFilter(args[0], ctx) as number) % (evalFilter(args[1], ctx) as number);
		case '/':
			return (evalFilter(args[0], ctx) as number) / (evalFilter(args[1], ctx) as number);
		case 'floor':
			return Math.floor(evalFilter(args[0], ctx) as number);
		case '==':
			return evalFilter(args[0], ctx) === evalFilter(args[1], ctx);
		case 'all':
			return args.every((a) => Boolean(evalFilter(a, ctx)));
		case 'step': {
			const input = evalFilter(args[0], ctx) as number;
			let result = args[1];
			for (let i = 2; i + 1 < args.length; i += 2) {
				if (input >= (args[i] as number)) result = args[i + 1];
				else break;
			}
			return evalFilter(result, ctx);
		}
		default:
			throw new Error(`Unsupported filter op: ${op}`);
	}
}

describe('computeStride', () => {
	it('grille fine (0,025°) très dézoomée → stride élevé', () => {
		const stride = computeStride(0.025, pxPerDegLon(2), 48);
		expect(stride).toBeGreaterThan(100);
	});
	it('grille fine (0,025°) fortement zoomée → stride 1', () => {
		expect(computeStride(0.025, pxPerDegLon(12), 48)).toBe(1);
	});
	it('grille 0,25° au zoom 5 → 4', () => {
		expect(computeStride(0.25, pxPerDegLon(5), 48)).toBe(4);
	});
	it('jamais inférieur à 1', () => {
		expect(computeStride(10, pxPerDegLon(12), 48)).toBe(1);
	});
});

describe('buildGridValueLabelExpr', () => {
	const units = {
		temperature: '°C',
		precipitation: 'mm',
		windSpeed: 'km/h',
		distance: 'm',
		geopotential: 'gpm'
	} as const;

	it('°C → °C (identité) → to-string(round(value))', () => {
		const expr = buildGridValueLabelExpr('temperature_2m', '°C', units);
		expect(expr).toEqual(['to-string', ['round', ['to-number', ['get', 'value']]]]);
	});

	it('°C → °F → number-format affine, 0 décimale', () => {
		const expr = buildGridValueLabelExpr('temperature_2m', '°C', {
			...units,
			temperature: '°F'
		});
		expect(expr).toEqual([
			'number-format',
			['+', ['*', ['to-number', ['get', 'value']], 1.8], 32],
			{ 'max-fraction-digits': 0 }
		]);
	});

	it('vent m/s → km/h → number-format ×3,6, 0 décimale', () => {
		const expr = buildGridValueLabelExpr('wind_speed_10m', 'm/s', { ...units, windSpeed: 'km/h' });
		expect(expr).toEqual([
			'number-format',
			['*', ['to-number', ['get', 'value']], 3.6],
			{ 'max-fraction-digits': 0 }
		]);
	});
});

describe('buildGridDecimationFilter (grille régulière)', () => {
	const geom = { nx: 1121, ny: 717, dxDeg: 0.025, dyDeg: 0.025, refLat: 46, gaussian: false };
	const filter = buildGridDecimationFilter(geom, [2, 12], 48);

	it('a la forme step(zoom)', () => {
		expect((filter as unknown[])[0]).toBe('step');
		expect((filter as unknown[])[1]).toEqual(['zoom']);
	});

	it('au zoom 12, garde le nœud id=1 (stride 1)', () => {
		expect(evalFilter(filter, { id: 1, zoom: 12 })).toBe(true);
	});

	it('au zoom 2, élague la grande majorité des nœuds', () => {
		let kept = 0;
		for (let id = 0; id < 5000; id++) {
			if (evalFilter(filter, { id, zoom: 2 })) kept++;
		}
		expect(kept).toBeLessThan(200);
	});

	it("élague l'axe latitude (2D AND) — id=1121 (ligne 1, col 0) rejeté au zoom 2", () => {
		// i = 1121 % 1121 = 0 (multiple de strideX) ; j = 1 (non-multiple de strideY > 1).
		expect(evalFilter(filter, { id: 1121, zoom: 2 })).toBe(false);
	});
});

describe('buildGridDecimationFilter (grille gaussienne → repli 1D)', () => {
	const geom = { nx: 1440, ny: 721, dxDeg: 0.25, dyDeg: 0.25, refLat: 0, gaussian: true };
	const filter = buildGridDecimationFilter(geom, [2, 12], 48);

	it("décime sur l'id seul (pas de garde lattice 2D)", () => {
		expect(evalFilter(filter, { id: 0, zoom: 5 })).toBe(true);
	});

	it('rejette un id non-multiple du stride à bas zoom', () => {
		// zoom 5 : stride 1D = 4 (cf. computeStride(0.25, pxPerDegLon(5), 48)).
		expect(evalFilter(filter, { id: 1, zoom: 5 })).toBe(false);
	});

	it('garde un id multiple du stride', () => {
		expect(evalFilter(filter, { id: 4, zoom: 5 })).toBe(true);
	});
});

/**
 * Garde-fou runtime : on compile le filtre avec le VRAI moteur d'expressions de
 * MapLibre (`featureFilter` du style-spec, le même que le rendu utilise) pour
 * verrouiller le seul point que `evalFilter` ne peut pas garantir — que MapLibre
 * accepte `['step', ['zoom'], …]` + `['id']` dans un filtre — et qu'il évalue
 * comme prévu. Sans ça, la décimation par zoom resterait une hypothèse non testée.
 */
describe('buildGridDecimationFilter — compatibilité moteur MapLibre (featureFilter)', () => {
	const geom = { nx: 1121, ny: 717, dxDeg: 0.025, dyDeg: 0.025, refLat: 46, gaussian: false };
	const filter = buildGridDecimationFilter(geom, [2, 12], 48);
	const compiled = featureFilter(filter as FilterSpecification);
	const feat = (id: number): Feature => ({ id, type: 1, properties: {} });

	it('MapLibre accepte le filtre (compile sans géométrie requise)', () => {
		expect(compiled.needGeometry).toBe(false);
	});

	it('évalue comme evalFilter (zoom 2 : id0 gardé, id1 et id1121 rejetés)', () => {
		expect(compiled.filter({ zoom: 2 }, feat(0))).toBe(true);
		expect(compiled.filter({ zoom: 2 }, feat(1))).toBe(false);
		expect(compiled.filter({ zoom: 2 }, feat(1121))).toBe(false);
	});

	it('densifie au zoom (zoom 12 : tous gardés, stride 1)', () => {
		expect(compiled.filter({ zoom: 12 }, feat(1))).toBe(true);
		expect(compiled.filter({ zoom: 12 }, feat(1121))).toBe(true);
	});
});

/**
 * Continuité de densité : la décimation doit s'adapter à des fractions de zoom,
 * pas seulement aux zooms entiers. Avec des paliers entiers, le stride reste figé
 * sur tout `[z, z+1)` → en zoomant dans le palier les étiquettes s'écartent (~×2
 * d'espacement écran) puis se redensifient d'un coup au palier suivant (effet
 * « pop »). Des paliers fins resserrent le stride dès le sous-palier → densité
 * quasi constante en zoom continu.
 */
describe('buildGridDecimationFilter — continuité de densité (paliers fins)', () => {
	const geom = { nx: 1121, ny: 717, dxDeg: 0.025, dyDeg: 0.025, refLat: 46, gaussian: false };
	const compiled = featureFilter(buildGridDecimationFilter(geom) as FilterSpecification);
	const countKept = (zoom: number): number => {
		let n = 0;
		for (let id = 0; id < 1121 * 16; id++) {
			if (compiled.filter({ zoom }, { id, type: 1, properties: {} } as Feature)) n++;
		}
		return n;
	};

	it('la densité se resserre DANS le palier de zoom entier (zoom 8,75 > zoom 8)', () => {
		// Paliers entiers : zoom 8 et 8,75 utiliseraient le même stride → même compte
		// (densité figée qui s'éclaircit en zoomant). Paliers fins : 8,75 garde
		// strictement plus de points.
		expect(countKept(8.75)).toBeGreaterThan(countKept(8));
	});
});
