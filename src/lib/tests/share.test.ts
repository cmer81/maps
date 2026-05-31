import { describe, expect, it, vi } from 'vitest';

import { canShareFiles, shareOrDownload } from '$lib/share';

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

describe('shareOrDownload', () => {
	it('utilise navigator.share quand disponible', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		const nav = { canShare: () => true, share } as unknown as Navigator;
		const download = vi.fn();
		const result = await shareOrDownload(nav, pngFile(), download);
		expect(share).toHaveBeenCalledOnce();
		expect(download).not.toHaveBeenCalled();
		expect(result).toBe('shared');
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
		const nav = { canShare: () => true, share } as unknown as Navigator;
		const download = vi.fn();
		const result = await shareOrDownload(nav, pngFile(), download);
		expect(download).not.toHaveBeenCalled();
		expect(result).toBe('cancelled');
	});

	it('retombe sur le téléchargement si navigator.share lève une erreur inattendue', async () => {
		const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
		const nav = { canShare: () => true, share } as unknown as Navigator;
		const download = vi.fn();
		const result = await shareOrDownload(nav, pngFile(), download);
		expect(download).toHaveBeenCalledOnce();
		expect(result).toBe('downloaded');
	});
});
