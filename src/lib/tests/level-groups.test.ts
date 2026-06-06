import { describe, expect, it } from 'vitest';

import { pickDefaultLevel, sortLevels } from '$lib/level-groups';

const opt = (value: string) => ({ value, label: value });

describe('sortLevels', () => {
	it('trie les niveaux en mètres par ordre croissant (issue #47 : 10/20/50/100)', () => {
		const levels = ['wind_speed_100m', 'wind_speed_10m', 'wind_speed_20m', 'wind_speed_50m'].map(
			opt
		);
		expect(sortLevels(levels).map((l) => l.value)).toEqual([
			'wind_speed_10m',
			'wind_speed_20m',
			'wind_speed_50m',
			'wind_speed_100m'
		]);
	});

	it('place les hauteurs (m) avant les niveaux de pression (hPa)', () => {
		const levels = ['temperature_850hPa', 'temperature_2m', 'temperature_1000hPa'].map(opt);
		expect(sortLevels(levels).map((l) => l.value)).toEqual([
			'temperature_2m',
			'temperature_1000hPa',
			'temperature_850hPa'
		]);
	});

	it('trie les niveaux de pression par altitude croissante (hPa décroissant)', () => {
		const levels = ['temperature_500hPa', 'temperature_1000hPa', 'temperature_850hPa'].map(opt);
		expect(sortLevels(levels).map((l) => l.value)).toEqual([
			'temperature_1000hPa',
			'temperature_850hPa',
			'temperature_500hPa'
		]);
	});

	it('ne mute pas le tableau source', () => {
		const levels = ['wind_speed_100m', 'wind_speed_10m'].map(opt);
		const snapshot = levels.map((l) => l.value);
		sortLevels(levels);
		expect(levels.map((l) => l.value)).toEqual(snapshot);
	});

	it('est stable pour les variables d’un même niveau', () => {
		const levels = ['wind_speed_10m', 'wind_direction_10m', 'wind_u_component_10m'].map(opt);
		expect(sortLevels(levels).map((l) => l.value)).toEqual([
			'wind_speed_10m',
			'wind_direction_10m',
			'wind_u_component_10m'
		]);
	});
});

describe('pickDefaultLevel', () => {
	it('choisit 10 m par défaut pour le vent, quel que soit l’ordre (issue #47)', () => {
		const levels = ['wind_speed_100m', 'wind_speed_10m', 'wind_speed_20m', 'wind_speed_50m'].map(
			opt
		);
		expect(pickDefaultLevel(levels)).toBe('wind_speed_10m');
	});

	it('préfère 2 m quand il existe (température de surface)', () => {
		const levels = ['temperature_2m', 'temperature_1000hPa', 'temperature_850hPa'].map(opt);
		expect(pickDefaultLevel(levels)).toBe('temperature_2m');
	});

	it('ne confond pas 100 m avec 10 m (faux positif includes)', () => {
		const levels = ['wind_speed_100m', 'wind_speed_50m'].map(opt);
		// Ni 2 m ni 10 m disponibles → fallback sur le plus bas trié (50 m).
		expect(pickDefaultLevel(levels)).toBe('wind_speed_50m');
	});

	it('retombe sur le niveau le plus bas trié sans 2 m / 10 m', () => {
		const levels = ['temperature_500hPa', 'temperature_1000hPa', 'temperature_850hPa'].map(opt);
		expect(pickDefaultLevel(levels)).toBe('temperature_1000hPa');
	});

	it('renvoie undefined pour un groupe vide', () => {
		expect(pickDefaultLevel([])).toBeUndefined();
	});
});
