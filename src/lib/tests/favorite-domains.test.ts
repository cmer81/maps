import { describe, expect, it } from 'vitest';

import { withFavoriteDomain } from '$lib/stores/favorite-domains';

describe('withFavoriteDomain', () => {
	it('ajoute le modèle en tête de liste quand il n’est pas favori', () => {
		expect(withFavoriteDomain([], 'arome_france')).toEqual(['arome_france']);
		expect(withFavoriteDomain(['ecmwf_ifs025'], 'arome_france')).toEqual([
			'arome_france',
			'ecmwf_ifs025'
		]);
	});

	it('retire le modèle de la liste quand il est déjà favori', () => {
		expect(withFavoriteDomain(['arome_france', 'ecmwf_ifs025'], 'arome_france')).toEqual([
			'ecmwf_ifs025'
		]);
	});

	it('retire le modèle sans toucher aux autres favoris', () => {
		expect(
			withFavoriteDomain(['arome_france', 'ecmwf_ifs025', 'ncep_gfs025'], 'ecmwf_ifs025')
		).toEqual(['arome_france', 'ncep_gfs025']);
	});

	it('est idempotent sur un double basculement (retour à l’état initial)', () => {
		const initial = ['arome_france', 'ecmwf_ifs025'];
		const once = withFavoriteDomain(initial, 'ncep_gfs025');
		expect(withFavoriteDomain(once, 'ncep_gfs025')).toEqual(initial);
	});

	it('n’applique aucun plafond au nombre de favoris', () => {
		const many = Array.from({ length: 50 }, (_, i) => `model_${i}`);
		expect(withFavoriteDomain(many, 'model_new')).toHaveLength(many.length + 1);
	});
});
