import { getColor, getColorScale } from '@openmeteo/weather-map-layer';
import { describe, expect, it } from 'vitest';

import { standardColorScales } from '$lib/stores/om-protocol-settings';

import { cycloneExistenceScale } from '$lib/color-scales/cyclone-existence';

describe('cycloneExistenceScale', () => {
	// Échelle telle que le protocole la résout réellement pour la variable : sans la
	// clé exacte dans `standardColorScales`, `cyclone_existence` ne matche aucune
	// famille du package et retombe sur l'échelle `temperature` (°C, −80→50) — la
	// légende afficherait des degrés pour une probabilité.
	const resolved = getColorScale('cyclone_existence', false, standardColorScales);
	if (resolved.type !== 'breakpoint') throw new Error('expected a breakpoint scale');

	it('est résolue par clé exacte, en pourcentage', () => {
		// La donnée source est une probabilité 0–1, convertie ×100 dans postReadCallback.
		expect(resolved.unit).toBe('%');
		expect(cycloneExistenceScale.unit).toBe('%');
		expect(resolved.breakpoints).toEqual(cycloneExistenceScale.breakpoints);
		expect(resolved.breakpoints[0]).toBe(0);
		expect(resolved.breakpoints.at(-1)).toBeLessThanOrEqual(100);
	});

	it('rend 0 totalement transparent (le champ est nul sur ~98 % du globe)', () => {
		expect(getColor(resolved, 0)[3]).toBe(0);
	});

	it('a un seuil bas : le signal décolle dès 1 %', () => {
		expect(resolved.breakpoints[1]).toBeLessThanOrEqual(1);
		expect(getColor(resolved, 1)[3]).toBeGreaterThan(0);
	});

	it('resserre les paliers dans les premiers pourcents puis les élargit', () => {
		const bp = resolved.breakpoints;
		// Strictement croissante, autant de couleurs que de seuils.
		expect(bp).toEqual([...bp].sort((a, b) => a - b));
		expect(new Set(bp).size).toBe(bp.length);
		expect(resolved.colors.length).toBe(bp.length);
		// Ni linéaire ni régulière : le dernier intervalle est bien plus large que le
		// premier — la dynamique utile est dans les premiers pourcents.
		const first = bp[1] - bp[0];
		const last = bp[bp.length - 1] - bp[bp.length - 2];
		expect(last).toBeGreaterThan(first * 5);
	});

	it("fait monter l'opacité de façon monotone (heatmap douce, pas d'aplat)", () => {
		const alphas = resolved.colors.map((c) => c[3] ?? 1);
		for (let i = 1; i < alphas.length; i++) {
			expect(alphas[i]).toBeGreaterThanOrEqual(alphas[i - 1]);
		}
		expect(alphas.at(-1)).toBe(1);
	});
});

describe('pressure_msl sur weather_ai_global', () => {
	it("réutilise l'échelle hPa existante (aucune surcharge nécessaire)", () => {
		// Même nom/unité/échelle que sur arome_om_* : le package la résout déjà
		// correctement, on ne duplique pas une palette.
		const resolved = getColorScale('pressure_msl', false, standardColorScales);
		expect(resolved.unit).toBe('hPa');
		if (resolved.type !== 'breakpoint') throw new Error('expected a breakpoint scale');
		// Couvre la plage observée sur le run (951–1038 hPa).
		expect(resolved.breakpoints[0]).toBeLessThanOrEqual(951);
		expect(resolved.breakpoints.at(-1)).toBeGreaterThanOrEqual(1038);
	});
});
