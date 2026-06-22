import { describe, expect, it, vi } from 'vitest';

import { canShareFiles, prefersNativeShare, shareOrDownload } from '$lib/share';

function pngFile() {
	return new File([new Uint8Array([1, 2, 3])], 'carte.png', { type: 'image/png' });
}

describe('canShareFiles', () => {
	it('faux quand navigator.canShare absent', () => {
		expect(canShareFiles({} as Navigator, pngFile())).toBe(false);
	});

	it('vrai quand canShare accepte le fichier', () => {
		const nav = { canShare: () => true, share: vi.fn() } as unknown as Navigator;
		expect(canShareFiles(nav, pngFile())).toBe(true);
	});
});

describe('prefersNativeShare', () => {
	it('faux sur desktop (maxTouchPoints absent ou 0)', () => {
		expect(prefersNativeShare({} as Navigator)).toBe(false);
		expect(prefersNativeShare({ maxTouchPoints: 0 } as Navigator)).toBe(false);
	});

	it('vrai sur appareil tactile (maxTouchPoints > 0)', () => {
		expect(prefersNativeShare({ maxTouchPoints: 5 } as Navigator)).toBe(true);
	});
});

describe('shareOrDownload', () => {
	it('utilise navigator.share sur appareil tactile quand disponible', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		const nav = { maxTouchPoints: 5, canShare: () => true, share } as unknown as Navigator;
		const download = vi.fn();
		const result = await shareOrDownload(nav, pngFile(), download);
		expect(share).toHaveBeenCalledOnce();
		expect(download).not.toHaveBeenCalled();
		expect(result).toBe('shared');
	});

	it('télécharge sur desktop même si navigator.share est disponible (macOS/Safari)', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		const nav = { maxTouchPoints: 0, canShare: () => true, share } as unknown as Navigator;
		const download = vi.fn();
		const result = await shareOrDownload(nav, pngFile(), download);
		expect(share).not.toHaveBeenCalled();
		expect(download).toHaveBeenCalledOnce();
		expect(result).toBe('downloaded');
	});

	it('retombe sur le téléchargement sinon', async () => {
		const nav = {} as Navigator;
		const download = vi.fn();
		const result = await shareOrDownload(nav, pngFile(), download);
		expect(download).toHaveBeenCalledOnce();
		expect(result).toBe('downloaded');
	});

	it("retombe sur le téléchargement si l'utilisateur annule le partage", async () => {
		const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'));
		const nav = { maxTouchPoints: 5, canShare: () => true, share } as unknown as Navigator;
		const download = vi.fn();
		const result = await shareOrDownload(nav, pngFile(), download);
		expect(download).not.toHaveBeenCalled();
		expect(result).toBe('cancelled');
	});

	it('retombe sur le téléchargement si navigator.share lève une erreur inattendue', async () => {
		const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
		const nav = { maxTouchPoints: 5, canShare: () => true, share } as unknown as Navigator;
		const download = vi.fn();
		const result = await shareOrDownload(nav, pngFile(), download);
		expect(download).toHaveBeenCalledOnce();
		expect(result).toBe('downloaded');
	});
});
