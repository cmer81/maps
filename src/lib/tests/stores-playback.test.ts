import { get } from 'svelte/store';

import { beforeEach, describe, expect, it } from 'vitest';

import {
	playbackCurrentIndex,
	playbackFps,
	playbackFrames,
	playbackPrerenderProgress,
	playbackStatus
} from '$lib/stores/playback';

import { PLAYBACK_DEFAULT_FPS, PLAYBACK_FPS_OPTIONS } from '$lib/constants';

describe('playback stores', () => {
	beforeEach(() => {
		playbackFps.set(PLAYBACK_DEFAULT_FPS);
		playbackFrames.set([]);
		playbackCurrentIndex.set(0);
		playbackPrerenderProgress.set(null);
		playbackStatus.set('idle');
	});

	it('playbackFps defaults to PLAYBACK_DEFAULT_FPS', () => {
		expect(get(playbackFps)).toBe(PLAYBACK_DEFAULT_FPS);
	});

	it('playbackFps accepts all PLAYBACK_FPS_OPTIONS values', () => {
		for (const fps of PLAYBACK_FPS_OPTIONS) {
			playbackFps.set(fps);
			expect(get(playbackFps)).toBe(fps);
		}
	});

	it('playbackFrames starts empty', () => {
		expect(get(playbackFrames)).toEqual([]);
	});

	it('playbackCurrentIndex starts at 0', () => {
		expect(get(playbackCurrentIndex)).toBe(0);
	});

	it('playbackPrerenderProgress starts null', () => {
		expect(get(playbackPrerenderProgress)).toBeNull();
	});

	it('playbackStatus accepts prerendering value', () => {
		playbackStatus.set('prerendering');
		expect(get(playbackStatus)).toBe('prerendering');
	});
});
