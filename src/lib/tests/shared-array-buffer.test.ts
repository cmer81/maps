import { afterEach, describe, expect, it, vi } from 'vitest';

import { canUseSharedArrayBuffer } from '$lib/shared-array-buffer';

describe('canUseSharedArrayBuffer', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('vrai sur une page cross-origin isolée', () => {
		vi.stubGlobal('crossOriginIsolated', true);
		expect(canUseSharedArrayBuffer()).toBe(true);
	});

	it('faux quand SharedArrayBuffer existe mais que la page n’est pas isolée (WebView Android)', () => {
		vi.stubGlobal('crossOriginIsolated', false);
		expect(typeof SharedArrayBuffer).toBe('function');
		expect(canUseSharedArrayBuffer()).toBe(false);
	});

	it('faux quand SharedArrayBuffer est absent', () => {
		vi.stubGlobal('SharedArrayBuffer', undefined);
		expect(canUseSharedArrayBuffer()).toBe(false);
	});

	it('vrai hors navigateur (Node : crossOriginIsolated indéfini)', () => {
		vi.stubGlobal('crossOriginIsolated', undefined);
		expect(canUseSharedArrayBuffer()).toBe(true);
	});
});
