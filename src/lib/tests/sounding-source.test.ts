import { describe, expect, it } from 'vitest';

import {
	DOMAIN_ALLOWLIST,
	SOUNDING_PRESSURE_LEVELS_HPA,
	isSoundingDomain,
	soundingLevelsForDomain,
	soundingSourceDomain
} from '$lib/constants';
import { buildSoundingOmUrl } from '$lib/helpers';

describe('soundingSourceDomain', () => {
	it("redirige le pseudo-domaine surface arome_france vers l'AROME 0025 d'Open-Meteo", () => {
		expect(soundingSourceDomain('arome_france')).toBe('meteofrance_arome_france0025');
	});

	it('est l’identité pour un domaine qui porte déjà ses niveaux de pression', () => {
		expect(soundingSourceDomain('meteofrance_arome_france0025')).toBe(
			'meteofrance_arome_france0025'
		);
	});

	it("est l'identité pour un domaine quelconque", () => {
		expect(soundingSourceDomain('meteofrance_arpege_europe')).toBe('meteofrance_arpege_europe');
	});
});

describe('isSoundingDomain', () => {
	it('vrai pour arome_france (résolu via sa source 0025 qui porte les niveaux)', () => {
		expect(isSoundingDomain('arome_france')).toBe(true);
	});

	it("vrai pour l'AROME 0025 directement", () => {
		expect(isSoundingDomain('meteofrance_arome_france0025')).toBe(true);
	});

	it('faux pour un domaine sans niveaux de pression', () => {
		expect(isSoundingDomain('meteofrance_arpege_europe')).toBe(false);
	});

	it("faux pour l'AROME HD (surface-only côté Open-Meteo, aucun niveau iso-pression)", () => {
		expect(isSoundingDomain('meteofrance_arome_france_hd')).toBe(false);
	});
});

describe('DOMAIN_ALLOWLIST', () => {
	it("expose l'AROME HD dans le sélecteur (réintroduit à la demande d'utilisateurs)", () => {
		expect(DOMAIN_ALLOWLIST).toContain('meteofrance_arome_france_hd');
	});

	it("garde l'AROME 0025 hors du sélecteur (source de sondage uniquement)", () => {
		expect(DOMAIN_ALLOWLIST).not.toContain('meteofrance_arome_france0025');
	});
});

describe('soundingLevelsForDomain', () => {
	it('renvoie les niveaux complets pour arome_france via sa source', () => {
		expect(soundingLevelsForDomain('arome_france')).toEqual(SOUNDING_PRESSURE_LEVELS_HPA);
	});
});

describe('buildSoundingOmUrl', () => {
	it("construit l'URL .om path-style pour le domaine/run/temps de sondage", () => {
		const run = new Date('2026-06-04T12:00:00Z');
		const validTime = new Date('2026-06-05T03:00:00Z');
		expect(buildSoundingOmUrl('meteofrance_arome_france0025', run, validTime)).toBe(
			'https://map-tiles.open-meteo.com/data_spatial/meteofrance_arome_france0025/2026/06/04/1200Z/2026-06-05T0300.om'
		);
	});
});
