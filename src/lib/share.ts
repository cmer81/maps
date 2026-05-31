export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export function canShareFiles(nav: Navigator, file: File): boolean {
	return typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
}

/**
 * Partage natif si possible, sinon téléchargement via le callback fourni.
 * Une annulation utilisateur (AbortError) ne déclenche aucun fallback.
 */
export async function shareOrDownload(
	nav: Navigator,
	file: File,
	download: (file: File) => void
): Promise<ShareResult> {
	if (canShareFiles(nav, file)) {
		try {
			await nav.share({ files: [file], title: 'Infoclimat — Modèles' });
			return 'shared';
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
			// autre erreur de partage → fallback download
		}
	}
	download(file);
	return 'downloaded';
}
