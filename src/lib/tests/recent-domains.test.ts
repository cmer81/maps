import { describe, expect, it } from 'vitest';

import { MAX_RECENT_DOMAINS, withRecentDomain } from '$lib/stores/recent-domains';

describe('withRecentDomain', () => {
	it('place le modèle sélectionné en tête', () => {
		expect(withRecentDomain(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
	});

	it('dédoublonne : un modèle déjà présent remonte en tête sans doublon', () => {
		expect(withRecentDomain(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
	});

	it('plafonne la liste à MAX_RECENT_DOMAINS', () => {
		const full = Array.from({ length: MAX_RECENT_DOMAINS }, (_, i) => `m${i}`);
		const next = withRecentDomain(full, 'nouveau');
		expect(next.length).toBe(MAX_RECENT_DOMAINS);
		expect(next[0]).toBe('nouveau');
		// Le plus ancien (dernier) est évincé.
		expect(next).not.toContain(`m${MAX_RECENT_DOMAINS - 1}`);
	});

	it('ne mute pas la liste source', () => {
		const src = ['a', 'b'];
		withRecentDomain(src, 'c');
		expect(src).toEqual(['a', 'b']);
	});
});
