import { persisted } from 'svelte-persisted-store';

// Modèles météo favoris de l'utilisateur, dans l'ordre d'ajout. Persisté pour
// survivre au rechargement ; affichés en tête du sélecteur de modèles pour un
// accès rapide. L'utilisateur les gère manuellement via une étoile dans le
// sélecteur.
export const favoriteDomains = persisted<string[]>('favorite_domains', []);

// Calcule la liste des favoris après bascule de `value`. Si `value` est déjà
// favori, il est retiré ; sinon il est ajouté en tête. Pure — testable sans
// localStorage.
export function withFavoriteDomain(list: string[], value: string): string[] {
	const exists = list.includes(value);
	return exists ? list.filter((v) => v !== value) : [value, ...list];
}

// Bascule l'état favori de `value`.
export function toggleFavoriteDomain(value: string) {
	favoriteDomains.update((list) => withFavoriteDomain(list, value));
}
