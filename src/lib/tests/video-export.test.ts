import { describe, expect, it, vi } from 'vitest';

import { type VideoSink, exportAnimation, getExportFrames } from '$lib/video-export';

const makeSink = (): VideoSink & { calls: Array<[number, number]> } => {
	const calls: Array<[number, number]> = [];
	return {
		calls,
		add: vi.fn(async (ts: number, dur: number) => {
			calls.push([ts, dur]);
		}),
		finalize: vi.fn(async () => new Blob(['mp4'], { type: 'video/mp4' }))
	};
};

const frames = [
	new Date('2026-06-14T00:00Z'),
	new Date('2026-06-14T01:00Z'),
	new Date('2026-06-14T02:00Z')
];

describe('exportAnimation', () => {
	it('rend chaque frame puis pousse les timestamps à la cadence fps', async () => {
		const sink = makeSink();
		const order: string[] = [];
		const blob = await exportAnimation({
			frames,
			fps: 10,
			sink,
			renderFrame: async (d) => {
				order.push('render:' + d.toISOString());
			},
			drawFrame: (d) => order.push('draw:' + d.toISOString()),
			restore: () => order.push('restore')
		});

		expect(sink.calls).toEqual([
			[0, 0.1],
			[0.1, 0.1],
			[0.2, 0.1]
		]);
		expect(sink.finalize).toHaveBeenCalledOnce();
		expect(blob.type).toBe('video/mp4');
		expect(order[0]).toBe('render:' + frames[0].toISOString());
		expect(order[1]).toBe('draw:' + frames[0].toISOString());
		expect(order.at(-1)).toBe('restore');
	});

	it('rapporte la progression frame par frame', async () => {
		const sink = makeSink();
		const progress: Array<[number, number]> = [];
		await exportAnimation({
			frames,
			fps: 10,
			sink,
			renderFrame: async () => {},
			drawFrame: () => {},
			restore: () => {},
			onProgress: (c, t) => progress.push([c, t])
		});
		expect(progress).toEqual([
			[1, 3],
			[2, 3],
			[3, 3]
		]);
	});

	it('annule proprement, ne finalise pas, et restaure le temps', async () => {
		const sink = makeSink();
		const controller = new AbortController();
		controller.abort();
		const restore = vi.fn();

		await expect(
			exportAnimation({
				frames,
				fps: 10,
				sink,
				renderFrame: async () => {},
				drawFrame: () => {},
				restore,
				signal: controller.signal
			})
		).rejects.toThrow(/abort/i);

		expect(sink.add).not.toHaveBeenCalled();
		expect(sink.finalize).not.toHaveBeenCalled();
		expect(restore).toHaveBeenCalledOnce();
	});

	it('restaure le temps même si une frame échoue', async () => {
		const sink = makeSink();
		const restore = vi.fn();
		await expect(
			exportAnimation({
				frames,
				fps: 10,
				sink,
				renderFrame: async () => {
					throw new Error('render boom');
				},
				drawFrame: () => {},
				restore
			})
		).rejects.toThrow('render boom');
		expect(restore).toHaveBeenCalledOnce();
	});
});

describe('getExportFrames', () => {
	it('filtre les valid_times dans la plage inclusive', () => {
		const meta = {
			valid_times: [
				'2026-06-14T00:00Z',
				'2026-06-14T01:00Z',
				'2026-06-14T02:00Z',
				'2026-06-14T03:00Z'
			]
		} as never;
		const got = getExportFrames(meta, new Date('2026-06-14T01:00Z'), new Date('2026-06-14T02:00Z'));
		expect(got.map((d) => d.toISOString())).toEqual([
			'2026-06-14T01:00:00.000Z',
			'2026-06-14T02:00:00.000Z'
		]);
	});
});
