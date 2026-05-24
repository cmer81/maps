/**
 * Returns the next playback frame from `current`, looping back to the first
 * step >= start when the next step would exceed end or fall outside the array.
 */
export const nextPlaybackFrame = (
	current: Date,
	start: Date,
	end: Date,
	steps: Date[]
): Date | undefined => {
	if (steps.length === 0) return undefined;
	const idx = steps.findIndex((s) => s.getTime() === current.getTime());
	const nextIdx = idx + 1;
	const overrun = idx === -1 || nextIdx >= steps.length || steps[nextIdx].getTime() > end.getTime();
	if (overrun) {
		return steps.find((s) => s.getTime() >= start.getTime());
	}
	return steps[nextIdx];
};

/**
 * Count of steps falling within [start, end] inclusive. Returns 0 if bounds invalid.
 */
export const timeStepsBetween = (
	start: Date | undefined,
	end: Date | undefined,
	steps: Date[] | undefined
): number => {
	if (!start || !end || !steps) return 0;
	const startMs = start.getTime();
	const endMs = end.getTime();
	return steps.filter((s) => s.getTime() >= startMs && s.getTime() <= endMs).length;
};
