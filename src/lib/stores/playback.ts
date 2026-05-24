import { type Writable, writable } from 'svelte/store';

import type { PrefetchMode } from '$lib/prefetch';

export type PlaybackStatus = 'idle' | 'prefetching' | 'playing' | 'paused';

export const playbackStatus: Writable<PlaybackStatus> = writable('idle');

// User-selected range mode for the next Play action.
export const playbackMode: Writable<PrefetchMode> = writable('next24h');

// Active playback range — set internally when Play is committed.
export const playbackStart: Writable<Date | undefined> = writable(undefined);
export const playbackEnd: Writable<Date | undefined> = writable(undefined);

export const playbackPrefetchProgress: Writable<{ current: number; total: number } | null> =
	writable(null);
