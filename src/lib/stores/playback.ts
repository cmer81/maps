import { type Writable, writable } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

import { PLAYBACK_DEFAULT_FPS, type PlaybackFps } from '$lib/constants';

import type { PrefetchMode } from '$lib/prefetch';

export type PlaybackStatus = 'idle' | 'prefetching' | 'prerendering' | 'playing' | 'paused';

export const playbackStatus: Writable<PlaybackStatus> = writable('idle');

// User-selected range mode for the next Play action.
export const playbackMode: Writable<PrefetchMode> = writable('next24h');

// Active playback range — set internally when Play is committed.
export const playbackStart: Writable<Date | undefined> = writable(undefined);
export const playbackEnd: Writable<Date | undefined> = writable(undefined);

export const playbackPrefetchProgress: Writable<{ current: number; total: number } | null> =
	writable(null);

// Progress for the new prerender phase (status === 'prerendering').
export const playbackPrerenderProgress: Writable<{ current: number; total: number } | null> =
	writable(null);

// Frames-per-second for diaporama playback. Persisted across sessions.
export const playbackFps = persisted<PlaybackFps>('playbackFps', PLAYBACK_DEFAULT_FPS);

// Pre-rendered + decoded frames. Cleared on stop. Not persisted.
export const playbackFrames: Writable<ImageBitmap[]> = writable([]);

// Index of the currently displayed frame in playbackFrames.
export const playbackCurrentIndex: Writable<number> = writable(0);
