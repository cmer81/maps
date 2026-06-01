import type { BreakpointColorScale, RGBA } from '@openmeteo/weather-map-layer';

/** Une catégorie discrète (code producteur + libellé FR pour la légende). */
export interface CategoryEntry {
	code: number;
	label: string;
}

/**
 * Colormap discrète : un `BreakpointColorScale` dont les `breakpoints` sont les
 * codes catégoriels triés croissants, augmenté d'un champ `categories` aligné
 * index-par-index sur `breakpoints` / `colors`. Le moteur de rendu ignore
 * `categories` (l'objet est renvoyé tel quel par `getColorScale` / `resolveColorScale`
 * car nos `colors` sont des `RGBA[]` plats sans variantes light/dark), donc le rendu
 * carte reste un breakpoint standard ; `categories` ne sert qu'à la légende.
 *
 * `colors` est restreint à `RGBA[]` (plat, sans variante light/dark) pour rester
 * compatible avec `ResolvedBreakpointColorScale` attendu par `getColor`.
 */
export interface CategoricalColorScale extends Omit<BreakpointColorScale, 'colors'> {
	colors: RGBA[];
	categories: CategoryEntry[];
}
