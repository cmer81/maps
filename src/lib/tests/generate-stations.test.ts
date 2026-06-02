import { describe, expect, it } from 'vitest';

import {
	buildFeatureCollection,
	isRecentlyActive,
	stationToFeature
} from '../../../scripts/generate-stations.mjs';

const NOW = new Date('2026-06-02T12:00:00Z');

describe('isRecentlyActive', () => {
	it('accepte une activité de moins de 30 jours', () => {
		expect(isRecentlyActive('2026-06-01 09:00:00', NOW)).toBe(true);
	});
	it('rejette une activité de plus de 30 jours', () => {
		expect(isRecentlyActive('2026-03-01 09:00:00', NOW)).toBe(false);
	});
	it('rejette la date nulle Infoclimat', () => {
		expect(isRecentlyActive('0000-00-00 00:00:00', NOW)).toBe(false);
	});
	it('rejette une valeur vide ou absente', () => {
		expect(isRecentlyActive('', NOW)).toBe(false);
		expect(isRecentlyActive(undefined, NOW)).toBe(false);
	});
});

describe('stationToFeature', () => {
	it('produit un Feature Point [lon, lat] avec props minimales', () => {
		const f = stationToFeature({
			id: '00002',
			libelle: 'Le Vigan',
			departement: '30',
			latitude: 43.98956,
			longitude: 3.60158,
			altitude: 245,
			derniere_activite: '2026-06-02 21:50:00'
		});
		expect(f.type).toBe('Feature');
		expect(f.geometry.type).toBe('Point');
		expect(f.geometry.coordinates).toEqual([3.60158, 43.98956]);
		expect(f.properties).toEqual({
			id: '00002',
			name: 'Le Vigan',
			dept: '30',
			alt: 245,
			last: '2026-06-02 21:50:00'
		});
	});
});

describe('buildFeatureCollection', () => {
	it('filtre les inactives et renvoie une FeatureCollection', () => {
		const fc = buildFeatureCollection(
			[
				{
					id: 'a',
					libelle: 'Active',
					departement: '01',
					latitude: 1,
					longitude: 2,
					altitude: 10,
					derniere_activite: '2026-06-01 00:00:00'
				},
				{
					id: 'b',
					libelle: 'Morte',
					departement: '02',
					latitude: 3,
					longitude: 4,
					altitude: 20,
					derniere_activite: '2007-09-02 09:10:00'
				}
			],
			NOW
		);
		expect(fc.type).toBe('FeatureCollection');
		expect(fc.features).toHaveLength(1);
		expect(fc.features[0].properties.id).toBe('a');
	});
});
