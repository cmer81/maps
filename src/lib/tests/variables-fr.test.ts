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
	});

	it('translates the package English labels', () => {
		expect(translateVariableLabel('Lightning Density')).toBe('Densité de foudre');
		expect(translateVariableLabel('Convective Inhibition')).toBe('Inhibition convective (CIN)');
		expect(translateVariableLabel('Visibility')).toBe('Visibilité');
	});
});
