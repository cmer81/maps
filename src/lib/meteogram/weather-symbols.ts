/**
 * Mapping WMO 4677 (codes `weather_code` de l'API forecast) → icônes du set
 * NRK/yr « yr-weather-symbols » (MIT, bundlé dans static/weather-symbols/) et
 * libellé français pour le tooltip. `day`/`night` distincts uniquement pour
 * les états dépendant du soleil ; `both` sinon.
 */
interface SymbolEntry {
	day: string;
	night: string;
	label: string;
}

const sym = (both: string, label: string): SymbolEntry => ({ day: both, night: both, label });
const dn = (day: string, night: string, label: string): SymbolEntry => ({ day, night, label });

const WMO_SYMBOLS: Record<number, SymbolEntry> = {
	0: dn('01d', '01n', 'Ciel clair'),
	1: dn('02d', '02n', 'Peu nuageux'),
	2: dn('03d', '03n', 'Partiellement nuageux'),
	3: sym('04', 'Couvert'),
	45: sym('15', 'Brouillard'),
	48: sym('15', 'Brouillard givrant'),
	51: sym('46', 'Bruine faible'),
	53: sym('46', 'Bruine'),
	55: sym('09', 'Bruine forte'),
	56: sym('47', 'Bruine verglaçante faible'),
	57: sym('48', 'Bruine verglaçante'),
	61: sym('46', 'Pluie faible'),
	63: sym('09', 'Pluie modérée'),
	65: sym('10', 'Pluie forte'),
	66: sym('47', 'Pluie verglaçante faible'),
	67: sym('48', 'Pluie verglaçante'),
	71: sym('49', 'Neige faible'),
	73: sym('13', 'Neige modérée'),
	75: sym('50', 'Neige forte'),
	77: sym('49', 'Grains de neige'),
	80: dn('40d', '40n', 'Averses faibles'),
	81: dn('05d', '05n', 'Averses'),
	82: dn('41d', '41n', 'Fortes averses'),
	85: dn('44d', '44n', 'Averses de neige faibles'),
	86: dn('45d', '45n', 'Fortes averses de neige'),
	95: sym('22', 'Orage'),
	96: sym('23', 'Orage avec grêle'),
	99: sym('32', 'Orage avec forte grêle')
};

const FALLBACK: SymbolEntry = sym('04', 'Couvert');

export function symbolForWmo(code: number, isDay: boolean): { icon: string; label: string } {
	const entry = WMO_SYMBOLS[code] ?? FALLBACK;
	return { icon: isDay ? entry.day : entry.night, label: entry.label };
}

/** Codes WMO 4677 couverts par la table, triés croissants. Source unique pour
 *  la colormap catégorielle `weather_code` (`color-scales/weather-code.ts`). */
export const WMO_CODES: readonly number[] = Object.keys(WMO_SYMBOLS)
	.map(Number)
	.sort((a, b) => a - b);

/** Libellé FR d'un code WMO 4677 (fallback « Couvert » hors table). */
export function wmoLabel(code: number): string {
	return (WMO_SYMBOLS[code] ?? FALLBACK).label;
}
