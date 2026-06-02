import { describe, expect, it } from 'vitest';

import { buildStationPopupHtml, buildStationUrl, formatLastReport, slugify } from '$lib/stations';

describe('slugify', () => {
	it('met en minuscules, retire les accents, remplace les espaces', () => {
		expect(slugify('Granges lès Beaumont')).toBe('granges-les-beaumont');
	});
	it('gère apostrophes et caractères spéciaux', () => {
		expect(slugify("Saint-Martin-d'Hères")).toBe('saint-martin-d-heres');
	});
	it('renvoie une chaîne vide pour une entrée vide', () => {
		expect(slugify('')).toBe('');
	});
});

describe('buildStationUrl', () => {
	it("inclut l'id et le slug dans une URL bien formée", () => {
		expect(buildStationUrl('00002', 'Le Vigan')).toBe(
			'https://www.infoclimat.fr/observations-meteo/temps-reel/le-vigan/00002.html'
		);
	});
});

describe('formatLastReport', () => {
	it('formate une date SQL en JJ/MM/AAAA HH:MM', () => {
		expect(formatLastReport('2026-06-02 21:50:00')).toBe('02/06/2026 21:50');
	});
	it('renvoie une chaîne vide pour la date nulle Infoclimat', () => {
		expect(formatLastReport('0000-00-00 00:00:00')).toBe('');
	});
});

describe('buildStationPopupHtml', () => {
	const html = buildStationPopupHtml({
		id: '00002',
		name: 'Le Vigan',
		dept: '30',
		alt: 245,
		last: '2026-06-02 21:50:00'
	});
	it('affiche le nom, altitude et département', () => {
		expect(html).toContain('Le Vigan');
		expect(html).toContain('245');
		expect(html).toContain('30');
	});
	it('contient le lien Infoclimat en nouvelle fenêtre', () => {
		expect(html).toContain(buildStationUrl('00002', 'Le Vigan'));
		expect(html).toContain('rel="noopener"');
	});
	it('échappe le HTML du nom', () => {
		const evil = buildStationPopupHtml({
			id: 'x',
			name: '<img src=x>',
			dept: '00',
			alt: 0,
			last: ''
		});
		expect(evil).not.toContain('<img src=x>');
		expect(evil).toContain('&lt;img');
	});
	it('échappe le HTML du département', () => {
		const evil = buildStationPopupHtml({
			id: 'x',
			name: 'Station',
			dept: '<b>',
			alt: 0,
			last: ''
		});
		expect(evil).not.toContain('<b>');
		expect(evil).toContain('&lt;b&gt;');
	});
});
