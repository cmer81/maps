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
		expect(withFavoriteDomain(['arome_france', 'ecmwf_ifs025', 'ncep_gfs025'], 'ecmwf_ifs025')).toEqual([
			'arome_france',
			'ncep_gfs025'
		]);
	});
});
