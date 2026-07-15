import { describe, expect, it } from 'vitest';

import { symbolForWmo, weatherSymbolPlacements } from '$lib/meteogram/weather-symbols';

describe('weatherSymbolPlacements', () => {
	// Bande fixe façon yr.no (feedback prod : les icônes suivaient la courbe de
	// T° — bizarre sans la courbe, et elles empiétaient sur les histogrammes de
	// précip). La sélection des pas à illustrer est pure et testée ici ; le
	// composant ne fait plus que le rendu (x = toPixels, y constant).

	it('horizon court : une icône sur deux, codes null écartés', () => {
		const codes = [0, 1, null, 3, 61, 63];
		const days = [1, 1, 1, 1, 1, 1];
		const placements = weatherSymbolPlacements(codes, days);
		// stride 2 → indices pairs 0, 2, 4 ; l'indice 2 (code null) est écarté.
		expect(placements.map((p) => p.index)).toEqual([0, 4]);
		expect(placements[0].icon).toBe('01d');
		expect(placements[1].icon).toBe('46');
	});

	it('horizon long (7 j) : plafonné à ~28 icônes via stride adaptatif', () => {
		const n = 168;
		const codes = Array.from({ length: n }, () => 0);
		const days = Array.from({ length: n }, () => 1);
		const placements = weatherSymbolPlacements(codes, days);
		expect(placements.length).toBeLessThanOrEqual(28);
		expect(placements.length).toBeGreaterThan(20);
	});

	it('nuit : icône de nuit quand is_day vaut 0', () => {
		const placements = weatherSymbolPlacements([0, 0], [0, 0]);
		expect(placements[0].icon).toBe('01n');
	});

	it('is_day absent : icône de jour par défaut', () => {
		const placements = weatherSymbolPlacements([0, 0], []);
		expect(placements[0].icon).toBe('01d');
	});

	it('aucun code : aucune icône', () => {
		expect(weatherSymbolPlacements([], [])).toEqual([]);
	});
});

describe('symbolForWmo', () => {
	it('mappe les codes de base avec variante jour/nuit', () => {
		expect(symbolForWmo(0, true)).toEqual({ icon: '01d', label: 'Ciel clair' });
		expect(symbolForWmo(0, false)).toEqual({ icon: '01n', label: 'Ciel clair' });
		expect(symbolForWmo(2, true).icon).toBe('03d');
	});

	it('les codes sans variante ignorent isDay', () => {
		expect(symbolForWmo(3, true).icon).toBe('04');
		expect(symbolForWmo(3, false).icon).toBe('04');
		expect(symbolForWmo(45, false)).toEqual({ icon: '15', label: 'Brouillard' });
	});

	it('couvre pluie, neige, averses et orage', () => {
		expect(symbolForWmo(61, true).icon).toBe('46');
		expect(symbolForWmo(65, true).icon).toBe('10');
		expect(symbolForWmo(75, true).icon).toBe('50');
		expect(symbolForWmo(80, false).icon).toBe('40n');
		expect(symbolForWmo(95, true)).toEqual({ icon: '22', label: 'Orage' });
	});

	it('code inconnu → fallback couvert', () => {
		expect(symbolForWmo(42, true)).toEqual({ icon: '04', label: 'Couvert' });
	});
});
