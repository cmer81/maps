export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export function canShareFiles(nav: Navigator, file: File): boolean {
	return typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
}

/**
 * Le partage natif n'a de sens que sur appareil tactile (mobile/tablette), où il
 * ouvre la feuille de partage système. Sur desktop — y compris macOS/Safari, qui
 * supporte pourtant la Web Share API — on veut un téléchargement direct du fichier,
 * sinon le clic « Exporter » ouvre un menu de partage au lieu de télécharger l'image.
 * `maxTouchPoints` vaut 0 sur les Mac (même avec trackpad) et > 0 sur iOS/iPadOS/Android.
 */
export function prefersNativeShare(nav: Navigator): boolean {
	return typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0;
}

/**
 * Partage natif si possible (et pertinent : appareil tactile), sinon téléchargement
 * via le callback fourni. Une annulation utilisateur (AbortError) ne déclenche aucun fallback.
 */
export async function shareOrDownload(
	nav: Navigator,
	file: File,
	download: (file: File) => void
): Promise<ShareResult> {
	if (prefersNativeShare(nav) && canShareFiles(nav, file)) {
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
