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

export interface SymbolPlacement {
	/** Indice du pas de temps à illustrer (dans l'axe temps du meteogram). */
	index: number;
	/** Nom de fichier de l'icône (sans extension) dans static/weather-symbols/. */
	icon: string;
}

/**
 * Sélection des pas de temps à illustrer par une icône météo — logique pure de
 * la « bande de symboles » du meteogram (le composant ne fait que le rendu :
 * x = toPixels(times[index]), y constant en haut de la zone de tracé).
 * Stride adaptatif : 1 pas sur 2 sur horizon court, plafonné à ~28 icônes sur
 * horizon long (l'API renvoie jusqu'à 7 jours — sinon elles se chevauchent).
 * `is_day` absent → variante jour.
 */
export function weatherSymbolPlacements(
	codes: readonly (number | null | undefined)[],
	days: readonly (number | null | undefined)[]
): SymbolPlacement[] {
	const stride = Math.max(2, Math.ceil(codes.length / 28));
	const placements: SymbolPlacement[] = [];
	for (let i = 0; i < codes.length; i += stride) {
		const code = codes[i];
		if (code === null || code === undefined) continue;
		placements.push({ index: i, icon: symbolForWmo(code, (days[i] ?? 1) === 1).icon });
	}
	return placements;
}
