import { describe, expect, it } from 'vitest';

import { translateVariableLabel } from '$lib/i18n/variables-fr';

describe('translateVariableLabel — convection variables', () => {
	it('translates snake_case keys absent from the package', () => {
		expect(translateVariableLabel('radar_reflectivity')).toBe('Réflectivité radar');
		expect(translateVariableLabel('brightness_temperature')).toBe(
			'Température de brillance (IR fenêtre)'
		);
		expect(translateVariableLabel('brightness_temperature_wv')).toBe(
			"Température de brillance (vapeur d'eau)"
		);
		expect(translateVariableLabel('precipitation_type_severe')).toBe(
			'Type de précip. (le plus sévère)'
		);
		expect(translateVariableLabel('precipitable_water')).toBe('Eau précipitable');
	});

	it('translates the package English labels', () => {
		expect(translateVariableLabel('Lightning Density')).toBe('Densité de foudre (moy. 3 h)');
		expect(translateVariableLabel('Convective Inhibition')).toBe('Inhibition convective (CIN)');
		expect(translateVariableLabel('Visibility')).toBe('Visibilité');
	});

	it('translates arome_france_hd raw variables absent from the package', () => {
		expect(translateVariableLabel('graupel_sum')).toBe('Cumul de grésil (graupel)');
		expect(translateVariableLabel('snow_graupel_sum')).toBe('Cumul de neige + grésil (graupel)');
		expect(translateVariableLabel('snowfall_water_equivalent_sum')).toBe(
			'Équivalent en eau de la neige (cumul)'
		);
		expect(translateVariableLabel('humidex')).toBe('Indice Humidex');
		expect(translateVariableLabel('reflectivity_max')).toBe('Réflectivité radar max.');
		expect(translateVariableLabel('relative_humidity_2m')).toBe('Humidité relative (2 m)');
		expect(translateVariableLabel('wind_chill_2m')).toBe('Refroidissement éolien (2 m)');
		expect(translateVariableLabel('wind_gusts_10m_max')).toBe('Rafales max. (10 m)');
		expect(translateVariableLabel('wind_u_component_10m')).toBe('Vent (10 m)');
	});
});
