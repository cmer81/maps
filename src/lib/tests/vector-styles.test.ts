import { describe, expect, it } from 'vitest';

import {
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildContourColorExpr,
	buildContourLabelExpr,
	buildContourWidthExpr,
	defaultArrowStyle,
	defaultContourStyle,
	hexToRgbaString,
	parseRgbaOpacity,
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
