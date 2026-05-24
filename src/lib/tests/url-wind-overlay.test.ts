import { get } from 'svelte/store';

import { beforeEach, describe, expect, it } from 'vitest';

import { url as urlStore } from '$lib/stores/preferences';
import { windOverlayEnabled, windOverlayLevel } from '$lib/stores/vector';

import { urlParamsToPreferences } from '$lib/url';

describe('urlParamsToPreferences — wind overlay', () => {
	beforeEach(() => {
		windOverlayEnabled.set(false);
		windOverlayLevel.set('10m');
	});

	it('hydrates wind_overlay and level from URL', () => {
		urlStore.set(new URL('http://localhost/?wind_overlay=true&wind_overlay_level=850hPa'));
		urlParamsToPreferences();
		expect(get(windOverlayEnabled)).toBe(true);
		expect(get(windOverlayLevel)).toBe('850hPa');
	});

	it('omits params from URL when at defaults', () => {
		urlStore.set(new URL('http://localhost/'));
		urlParamsToPreferences();
		const u = get(urlStore);
		expect(u.searchParams.get('wind_overlay')).toBeNull();
		expect(u.searchParams.get('wind_overlay_level')).toBeNull();
	});
});
