import { describe, expect, it } from 'vitest';

import { hasMeteogram, resolveApiModel } from '$lib/meteogram/model-map';

describe('resolveApiModel', () => {
	it('mappe un domaine servi par l’API', () => {
		expect(resolveApiModel('meteofrance_arpege_europe')).toBe('meteofrance_arpege_europe');
		expect(resolveApiModel('arome_france_hd')).toBe('meteofrance_arome_france_hd');
		expect(resolveApiModel('ecmwf_ifs025')).toBe('ecmwf_ifs025');
		// IFS 0,1° du bucket maison : météogramme servi par l'IFS HRES de l'API.
		expect(resolveApiModel('ecmwf_ifs_0p1')).toBe('ecmwf_ifs');
		// Le préfixe `ncep_` est la convention du bucket S3, PAS un identifiant
		// `models=` de l'API forecast : `ncep_gfs_seamless` est rejeté par l'enum
		// MultiDomains ("Data corrupted…"). GFS Global 0,25° → `gfs_global`.
		expect(resolveApiModel('ncep_gfs025')).toBe('gfs_global');
	});

	it('mappe les pseudo-domaines maison AROME France (servis par l’API maison)', () => {
		expect(resolveApiModel('arome_france')).toBe('meteofrance_arome_france');
		expect(resolveApiModel('arome_france_convection')).toBe('meteofrance_arome_france');
	});

	it('exclut les domaines non servis', () => {
		expect(resolveApiModel('anomaly_europe')).toBeNull();
		expect(resolveApiModel('domaine_inconnu')).toBeNull();
	});

	it('hasMeteogram reflète la présence dans la table', () => {
		expect(hasMeteogram('ecmwf_ifs025')).toBe(true);
		expect(hasMeteogram('arome_france')).toBe(true);
		expect(hasMeteogram('anomaly_europe')).toBe(false);
	});
});
