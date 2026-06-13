export type CaptureOrientation = 'landscape' | 'portrait';

export interface CaptureRect {
	/** px depuis le bord gauche du viewport */
	x: number;
	/** px depuis le haut du viewport */
	y: number;
	w: number;
	h: number;
	orientation: CaptureOrientation;
}

const LANDSCAPE_RATIO = 4 / 3; // largeur / hauteur
const PORTRAIT_RATIO = 3 / 4;

/**
 * Plus grand rectangle de ratio 4:3 (viewport paysage) ou 3:4 (viewport
 * portrait) centré dans `vw × vh`. Source de vérité unique de la zone de
 * capture, partagée par l'overlay de cadrage et la détection de clic.
 */
export function computeCaptureRect(vw: number, vh: number): CaptureRect {
	const orientation: CaptureOrientation = vw >= vh ? 'landscape' : 'portrait';
	const targetRatio = orientation === 'landscape' ? LANDSCAPE_RATIO : PORTRAIT_RATIO;

	let w: number;
	let h: number;
	if (vw / vh > targetRatio) {
		// viewport plus large que le ratio cible → borné par la hauteur
		h = vh;
		w = vh * targetRatio;
	} else {
		// borné par la largeur
		w = vw;
		h = vw / targetRatio;
	}

	return { x: (vw - w) / 2, y: (vh - h) / 2, w, h, orientation };
}

export interface SourceCrop {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
}

/**
 * Met à l'échelle un rectangle exprimé en px CSS du viewport vers les px du
 * canvas source (qui couvre tout le viewport). Coordonnées arrondies pour un
 * découpage pixel entier via `drawImage`.
 */
export function computeSourceCrop(
	rect: { x: number; y: number; w: number; h: number },
	viewportW: number,
	viewportH: number,
	sourceW: number,
	sourceH: number
): SourceCrop {
	const scaleX = sourceW / viewportW;
	const scaleY = sourceH / viewportH;
	return {
		sx: Math.round(rect.x * scaleX),
		sy: Math.round(rect.y * scaleY),
		sw: Math.round(rect.w * scaleX),
		sh: Math.round(rect.h * scaleY)
	};
}
