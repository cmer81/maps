import { describe, expect, it, vi } from 'vitest';

import { createFrameTimer } from '$lib/frame-timing';

const context = { kind: 'change' as const, domain: 'arome_france', variable: 'temperature_2m' };

const makeTimer = () => {
	const clock = { mono: 1000, wall: 1_700_000_000_000 };
	const report = vi.fn();
	const timer = createFrameTimer(
		report,
		() => clock.mono,
		() => clock.wall
	);
	return { timer, report, clock };
};

describe('createFrameTimer', () => {
	it('rapporte la durée entre start et commit, avec le contexte', () => {
		const { timer, report, clock } = makeTimer();
		timer.start(context);
		clock.mono += 420;
		timer.commit();
		expect(report).toHaveBeenCalledExactlyOnceWith({
			...context,
			startTime: 1_700_000_000_000,
			duration: 420,
			outcome: 'ok'
		});
	});

	it("rapporte un échec avec l'issue error", () => {
		const { timer, report, clock } = makeTimer();
		timer.start(context);
		clock.mono += 50;
		timer.fail();
		expect(report).toHaveBeenCalledWith(
			expect.objectContaining({ duration: 50, outcome: 'error' })
		);
	});

	it('remplace une mesure en vol sans la rapporter (scrubbing)', () => {
		const { timer, report, clock } = makeTimer();
		timer.start(context);
		clock.mono += 100;
		timer.start({ ...context, variable: 'precipitation' });
		clock.mono += 30;
		timer.commit();
		expect(report).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ variable: 'precipitation', duration: 30 })
		);
	});

	it('ignore un commit sans mesure en vol (superpositions seules, second commit)', () => {
		const { timer, report } = makeTimer();
		timer.commit();
		timer.start(context);
		timer.commit();
		timer.commit();
		timer.fail();
		expect(report).toHaveBeenCalledTimes(1);
	});
});
