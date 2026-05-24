import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { variable2, layer2Enabled } from '$lib/stores/variables';
import { opacity2, url as urlStore } from '$lib/stores/preferences';
import { urlParamsToPreferences } from '$lib/url';

describe('urlParamsToPreferences — 2nd layer', () => {
    beforeEach(() => {
        variable2.set('precipitation');
        layer2Enabled.set(false);
        opacity2.set(70);
    });

    it('hydrates variable2, opacity2, layer2 from URL', () => {
        urlStore.set(new URL(
            'http://localhost/?variable2=cloud_cover_low&opacity2=40&layer2=true'
        ));
        urlParamsToPreferences();
        expect(get(variable2)).toBe('cloud_cover_low');
        expect(get(opacity2)).toBe(40);
        expect(get(layer2Enabled)).toBe(true);
    });

    it('omits layer2 params from URL when at defaults', () => {
        urlStore.set(new URL('http://localhost/'));
        urlParamsToPreferences();
        const u = get(urlStore);
        expect(u.searchParams.get('variable2')).toBeNull();
        expect(u.searchParams.get('opacity2')).toBeNull();
        expect(u.searchParams.get('layer2')).toBeNull();
    });
});
