import { LEVEL_UNIT_REGEX } from '@openmeteo/weather-map-layer';

export interface ParsedLevel {
	/** Valeur numérique du niveau (ex. 10, 850). */
	level: number;
	/** Unité du niveau : `m` / `cm` (hauteur) ou `hPa` (pression). */
	unit: string;
}

/** Parse le niveau/unité d'une variable via `LEVEL_UNIT_REGEX` (ex. `wind_speed_10m` → `{10, 'm'}`). */
export function parseLevel(value: string): ParsedLevel | null {
	const match = value.match(LEVEL_UNIT_REGEX);
	if (!match?.groups) return null;
	return { level: Number(match.groups.level), unit: match.groups.unit };
}

const isPressure = (unit: string) => unit === 'hPa';

/**
 * Compare deux niveaux par altitude croissante :
 * - les hauteurs (`m`/`cm`) passent avant les pressions (`hPa`) ;
 * - entre hauteurs, valeur croissante (10 m avant 100 m) ;
 * - entre pressions, hPa décroissant (1000 hPa avant 500 hPa = altitude croissante).
 * Les valeurs non parsables sont reléguées en fin.
 */
export function compareLevels(a: string, b: string): number {
	const pa = parseLevel(a);
	const pb = parseLevel(b);
	if (!pa && !pb) return 0;
	if (!pa) return 1;
	if (!pb) return -1;

	const rankA = isPressure(pa.unit) ? 1 : 0;
	const rankB = isPressure(pb.unit) ? 1 : 0;
	if (rankA !== rankB) return rankA - rankB;

	return rankA === 0 ? pa.level - pb.level : pb.level - pa.level;
}

/** Trie une copie des niveaux par altitude croissante (cf. `compareLevels`). Tri stable. */
export function sortLevels<T extends { value: string }>(levels: T[]): T[] {
	return [...levels].sort((a, b) => compareLevels(a.value, b.value));
}

// Priorité du niveau par défaut, indépendante de l'ordre de la liste : 2 m (surface,
// ex. température) puis 10 m (ex. vent). Sinon fallback sur le niveau le plus bas trié.
const DEFAULT_LEVEL_PRIORITY: ParsedLevel[] = [
	{ level: 2, unit: 'm' },
	{ level: 10, unit: 'm' }
];

/**
 * Choisit le niveau par défaut d'un groupe en respectant une vraie priorité (issue #47) :
 * 2 m, puis 10 m, sinon le niveau le plus bas une fois trié. Renvoie `undefined` si vide.
 */
export function pickDefaultLevel<T extends { value: string }>(levels: T[]): string | undefined {
	if (!levels.length) return undefined;
	for (const pref of DEFAULT_LEVEL_PRIORITY) {
		const found = levels.find((l) => {
			const parsed = parseLevel(l.value);
			return parsed?.level === pref.level && parsed.unit === pref.unit;
		});
		if (found) return found.value;
	}
	return sortLevels(levels)[0].value;
}
