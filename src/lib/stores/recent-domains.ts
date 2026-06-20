import { persisted } from 'svelte-persisted-store';

// Nombre de modèles récents conservés et affichés en tête du sélecteur.
export const MAX_RECENT_DOMAINS = 4;

// Derniers modèles sélectionnés, du plus récent au plus ancien (valeurs de
// domaine). Persisté pour survivre au rechargement ; alimente le groupe
// « Récents » du sélecteur de modèles, sans curation manuelle de l'utilisateur.
export const recentDomains = persisted<string[]>('recent_domains', []);

// Calcule la liste des récents après sélection de `value` : le place en tête,
// dédoublonne (retire son ancienne position) et plafonne à `max`. Pure — testable
// sans localStorage.
export function withRecentDomain(
	list: string[],
	value: string,
	max = MAX_RECENT_DOMAINS
): string[] {
	return [value, ...list.filter((v) => v !== value)].slice(0, max);
}

// Enregistre `value` comme modèle le plus récemment utilisé.
export function recordRecentDomain(value: string) {
	recentDomains.update((list) => withRecentDomain(list, value));
}
