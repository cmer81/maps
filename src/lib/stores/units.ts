import { derived } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

export type TemperatureUnit = '°C' | '°F';
export type PrecipitationUnit = 'mm' | 'inch';
export type WindSpeedUnit = 'm/s' | 'km/h' | 'mph' | 'knots';
export type DistanceUnit = 'm' | 'ft';
export type GeopotentialUnit = 'gpm' | 'gpdam';

export const DEFAULT_TEMPERATURE_UNIT: TemperatureUnit = '°C';
export const DEFAULT_PRECIPITATION_UNIT: PrecipitationUnit = 'mm';
export const DEFAULT_WIND_SPEED_UNIT: WindSpeedUnit = 'km/h';
export const DEFAULT_DISTANCE_UNIT: DistanceUnit = 'm';
export const DEFAULT_GEOPOTENTIAL_UNIT: GeopotentialUnit = 'gpm';

export const temperatureUnit = persisted<TemperatureUnit>(
	'temperature_unit',
	DEFAULT_TEMPERATURE_UNIT
);
export const precipitationUnit = persisted<PrecipitationUnit>(
	'precipitation_unit',
	DEFAULT_PRECIPITATION_UNIT
);
export const windSpeedUnit = persisted<WindSpeedUnit>('wind_speed_unit', DEFAULT_WIND_SPEED_UNIT);
export const distanceUnit = persisted<DistanceUnit>('distance_unit', DEFAULT_DISTANCE_UNIT);
export const geopotentialUnit = persisted<GeopotentialUnit>(
	'geopotential_unit',
	DEFAULT_GEOPOTENTIAL_UNIT
);

// --- Conversion functions (from base SI unit to selected unit) ---

export function convertTemperature(value: number, unit: TemperatureUnit): number {
	if (unit === '°F') return value * 1.8 + 32;
	return value;
}

export function convertPrecipitation(value: number, unit: PrecipitationUnit): number {
	if (unit === 'inch') return value / 25.4;
	return value;
}

export function convertWindSpeed(value: number, unit: WindSpeedUnit): number {
	switch (unit) {
		case 'km/h':
			return value * 3.6;
		case 'mph':
			return value * 2.23694;
		case 'knots':
			return value * 1.94384;
		default:
			return value;
	}
}

export function convertDistance(value: number, unit: DistanceUnit): number {
	if (unit === 'ft') return value * 3.28084;
	return value;
}

export function convertGeopotential(value: number, unit: GeopotentialUnit): number {
	// gpdam (décamètres géopotentiels) = gpm / 10.
	if (unit === 'gpdam') return value / 10;
	return value;
}

export type UnitCategory =
	| 'temperature'
	| 'precipitation'
	| 'wind_speed'
	| 'distance'
	| 'geopotential';

/** Vrai pour les variables de hauteur géopotentielle (`geopotential_height_*`). */
export function isGeopotentialVariable(variable: string): boolean {
	return /geopotential/i.test(variable);
}

/**
 * Map a value's unit category from the color-scale base unit, optionally
 * disambiguated by the variable name.
 *
 * Le géopotentiel partage la chaîne d'unité de base `'m'` avec la distance ;
 * seul le nom de la variable permet de les distinguer. Quand `variable`
 * désigne un géopotentiel, la catégorie `geopotential` est prioritaire.
 */
export function getUnitCategory(baseUnit: string, variable?: string): UnitCategory | undefined {
	if (variable && isGeopotentialVariable(variable)) return 'geopotential';
	switch (baseUnit) {
		case '°C':
		case 'K':
			return 'temperature';
		case 'mm':
			return 'precipitation';
		case 'm/s':
			return 'wind_speed';
		case 'm':
			return 'distance';
		default:
			return undefined;
	}
}

export interface UnitPreferences {
	temperature: TemperatureUnit;
	precipitation: PrecipitationUnit;
	windSpeed: WindSpeedUnit;
	distance: DistanceUnit;
	geopotential: GeopotentialUnit;
}

/** Convert a value from its base unit to the user's selected unit. */
export function convertValue(
	value: number,
	baseUnit: string,
	units: UnitPreferences,
	variable?: string
): number {
	const category = getUnitCategory(baseUnit, variable);
	switch (category) {
		case 'temperature':
			return convertTemperature(value, units.temperature);
		case 'precipitation':
			return convertPrecipitation(value, units.precipitation);
		case 'wind_speed':
			return convertWindSpeed(value, units.windSpeed);
		case 'distance':
			return convertDistance(value, units.distance);
		case 'geopotential':
			return convertGeopotential(value, units.geopotential);
		default:
			return value;
	}
}

/** Get the display unit string for a base unit given user preferences. */
export function getDisplayUnit(
	baseUnit: string,
	units: UnitPreferences,
	variable?: string
): string {
	const category = getUnitCategory(baseUnit, variable);
	switch (category) {
		case 'temperature':
			return units.temperature;
		case 'precipitation':
			return units.precipitation;
		case 'wind_speed':
			return units.windSpeed;
		case 'distance':
			return units.distance;
		case 'geopotential':
			return units.geopotential;
		default:
			return baseUnit;
	}
}

/** Option arrays for each unit category. */
export const temperatureOptions: { value: TemperatureUnit; label: string }[] = [
	{ value: '°C', label: '°C' },
	{ value: '°F', label: '°F' }
];

export const precipitationOptions: { value: PrecipitationUnit; label: string }[] = [
	{ value: 'mm', label: 'mm' },
	{ value: 'inch', label: 'inch' }
];

export const windSpeedOptions: { value: WindSpeedUnit; label: string }[] = [
	{ value: 'm/s', label: 'm/s' },
	{ value: 'km/h', label: 'km/h' },
	{ value: 'mph', label: 'mph' },
	{ value: 'knots', label: 'knots' }
];

export const distanceOptions: { value: DistanceUnit; label: string }[] = [
	{ value: 'm', label: 'm' },
	{ value: 'ft', label: 'ft' }
];

export const geopotentialOptions: { value: GeopotentialUnit; label: string }[] = [
	{ value: 'gpm', label: 'gpm' },
	{ value: 'gpdam', label: 'gpdam' }
];

/** Get the unit options for a given base unit string. Returns undefined if the unit has no alternatives. */
export function getUnitOptions(
	baseUnit: string,
	variable?: string
): { value: string; label: string }[] | undefined {
	const category = getUnitCategory(baseUnit, variable);
	switch (category) {
		case 'temperature':
			return temperatureOptions;
		case 'precipitation':
			return precipitationOptions;
		case 'wind_speed':
			return windSpeedOptions;
		case 'distance':
			return distanceOptions;
		case 'geopotential':
			return geopotentialOptions;
		default:
			return undefined;
	}
}

/** Set the unit for a given base unit category. */
export function setUnitForCategory(baseUnit: string, newUnit: string, variable?: string): void {
	const category = getUnitCategory(baseUnit, variable);
	switch (category) {
		case 'temperature':
			temperatureUnit.set(newUnit as TemperatureUnit);
			break;
		case 'precipitation':
			precipitationUnit.set(newUnit as PrecipitationUnit);
			break;
		case 'wind_speed':
			windSpeedUnit.set(newUnit as WindSpeedUnit);
			break;
		case 'distance':
			distanceUnit.set(newUnit as DistanceUnit);
			break;
		case 'geopotential':
			geopotentialUnit.set(newUnit as GeopotentialUnit);
			break;
	}
}

/** Derived store combining all unit preferences into a single object. */
export const unitPreferences = derived(
	[temperatureUnit, precipitationUnit, windSpeedUnit, distanceUnit, geopotentialUnit],
	([$t, $p, $w, $d, $g]): UnitPreferences => ({
		temperature: $t,
		precipitation: $p,
		windSpeed: $w,
		distance: $d,
		geopotential: $g
	})
);
