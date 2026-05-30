// src/lib/tests/parcel.test.ts
import { describe, expect, it } from 'vitest';

import { liftParcel, mostUnstableLevel } from '$lib/sounding/parcel';
import { type LevelDatum } from '$lib/sounding/types';

// Profil idéalisé instable : surface chaude/humide, décroissance ~7°C/km.
const env: LevelDatum[] = [
	{ pressure: 1000, temperature: 25, dewpoint: 20, height: 100, u: 0, v: 0 },
	{ pressure: 850, temperature: 14, dewpoint: 12, height: 1500, u: 0, v: 0 },
	{ pressure: 700, temperature: 5, dewpoint: 0, height: 3100, u: 0, v: 0 },
	{ pressure: 500, temperature: -12, dewpoint: -20, height: 5800, u: 0, v: 0 },
	{ pressure: 300, temperature: -40, dewpoint: -55, height: 9500, u: 0, v: 0 }
];
const surface = env[0];

// Profil très sec en surface (Td = 5 °C, T = 30 °C) → LCL très haut.
// La particule doit monter ~3 km avant de saturer, bien au-delà de surface.height + 200.
const envDry: LevelDatum[] = [
	{ pressure: 1000, temperature: 30, dewpoint: 5, height: 100, u: 0, v: 0 },
	{ pressure: 850, temperature: 16, dewpoint: -5, height: 1500, u: 0, v: 0 },
	{ pressure: 700, temperature: 4, dewpoint: -15, height: 3100, u: 0, v: 0 },
	{ pressure: 500, temperature: -14, dewpoint: -30, height: 5800, u: 0, v: 0 },
	{ pressure: 300, temperature: -42, dewpoint: -58, height: 9500, u: 0, v: 0 }
];
const drySurface = envDry[0];

// Profil avec couche humide en altitude : la couche la plus instable (θe max) n'est
// pas la surface mais un niveau surélevé plus chaud/humide.
// Surface sèche (T=20, Td=5) → θe relativement faible.
// Couche à 850 hPa très humide (T=22, Td=20) → θe élevée → niveau le plus instable.
const envMU: LevelDatum[] = [
	{ pressure: 1000, temperature: 20, dewpoint: 5, height: 100, u: 0, v: 0 },
	{ pressure: 850, temperature: 22, dewpoint: 20, height: 1500, u: 0, v: 0 },
	{ pressure: 700, temperature: 6, dewpoint: 0, height: 3100, u: 0, v: 0 },
	{ pressure: 500, temperature: -12, dewpoint: -25, height: 5800, u: 0, v: 0 },
	{ pressure: 300, temperature: -40, dewpoint: -55, height: 9500, u: 0, v: 0 }
];
const surfaceMU = envMU[0];

describe('parcel', () => {
	it('liftParcel renvoie une T particule par niveau et un LCL', () => {
		const p = liftParcel(surface, env);
		expect(p.temperature).toHaveLength(env.length);
		expect(p.lcl).not.toBeNull();
		expect(p.lcl!.pressure).toBeLessThan(1000);
		expect(p.lcl!.pressure).toBeGreaterThan(700);
	});

	it("profil instable : la particule est plus chaude que l'environnement en altitude", () => {
		const p = liftParcel(surface, env);
		const idx500 = env.findIndex((l) => l.pressure === 500);
		expect(p.temperature[idx500]).toBeGreaterThan(env[idx500].temperature);
		expect(p.lfc).not.toBeNull();
		expect(p.el).not.toBeNull();
	});

	it('mostUnstableLevel renvoie le niveau de θe max (ici la surface)', () => {
		expect(mostUnstableLevel(surface, env).pressure).toBe(1000);
	});

	it('lcl.height est interpolé depuis les hauteurs environnement (bien > surface.height + 200)', () => {
		// Surface très sèche (T=30, Td=5) : le LCL se trouve vers ~700 hPa,
		// soit environ 3000 m — très au-dessus de drySurface.height + 200 = 300 m.
		const p = liftParcel(drySurface, envDry);
		expect(p.lcl).not.toBeNull();
		expect(p.lcl!.height).toBeGreaterThan(1000);
		expect(p.lcl!.height).toBeLessThan(envDry[envDry.length - 1].height);
	});

	it('mostUnstableLevel : niveau surélevé humide retourné quand θe y est maximal', () => {
		// La couche à 850 hPa (T=22, Td=20) est plus instable que la surface (T=20, Td=5).
		const mu = mostUnstableLevel(surfaceMU, envMU);
		expect(mu.pressure).not.toBe(surfaceMU.pressure);
		expect(mu.pressure).toBe(850);
	});
});
