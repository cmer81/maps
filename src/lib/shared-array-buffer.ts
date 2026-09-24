/**
 * Indique si les lectures OMfile peuvent passer par des `SharedArrayBuffer`.
 *
 * Le constructeur peut exister sans être utilisable : la WebView Android expose
 * `SharedArrayBuffer` mais ne rend jamais la page cross-origin isolée (COOP/COEP
 * sans effet), et `@openmeteo/file-reader` refuse alors d'allouer
 * (« SharedArrayBuffer is not available in this environment ») → aucun calque
 * météo. Dans ce cas on lit dans des `ArrayBuffer` classiques, copiés vers les
 * workers au lieu d'être partagés : plus lent, mais fonctionnel.
 *
 * Hors navigateur (Node, tests), `crossOriginIsolated` est indéfini et la
 * présence du constructeur suffit.
 */
export function canUseSharedArrayBuffer(): boolean {
	if (typeof SharedArrayBuffer === 'undefined') return false;
	return typeof crossOriginIsolated === 'undefined' || crossOriginIsolated;
}
