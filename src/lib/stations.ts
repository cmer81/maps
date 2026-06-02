// Helpers purs (runtime) pour le calque de stations Infoclimat.
// Aucune dépendance MapLibre : testables en isolation.
import { STATION_FICHE_BASE } from '$lib/constants';

export interface StationProps {
	id: string;
	name: string;
	dept: string;
	alt: number;
	last: string;
}

/** minuscule + accents retirés + tout non-alphanumérique → tiret (compacté). */
export const slugify = (input: string): string =>
	input
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // retire les diacritiques combinants
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

/** Fiche station Infoclimat. Le slug est cosmétique (résolution par id). */
export const buildStationUrl = (id: string, name: string): string =>
	`${STATION_FICHE_BASE}/${slugify(name) || 'station'}/${id}.html`;

/** "2026-06-02 21:50:00" → "02/06/2026 21:50" ; "" si date nulle/invalide. */
export const formatLastReport = (sql: string): string => {
	const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(sql ?? '');
	if (!m || m[1] === '0000') return '';
	const [, y, mo, d, h, mi] = m;
	return `${d}/${mo}/${y} ${h}:${mi}`;
};

const escapeHtml = (s: string): string =>
	s.replace(/[&<>"']/g, (c) => {
		switch (c) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			default:
				return '&#39;';
		}
	});

/** Contenu HTML du popup d'une station (utilisé avec maplibregl.Popup.setHTML). */
export const buildStationPopupHtml = (p: StationProps): string => {
	const name = escapeHtml(p.name);
	const dept = escapeHtml(p.dept);
	const url = buildStationUrl(p.id, p.name);
	const last = formatLastReport(p.last);
	const lastLine = last ? `<div class="om-station-last">Dernière donnée : ${last}</div>` : '';
	return `<div class="om-station-popup">
	<div class="om-station-name">${name}</div>
	<div class="om-station-meta">${p.alt} m · dép. ${dept}</div>
	${lastLine}
	<a class="om-station-link" href="${url}" target="_blank" rel="noopener">Voir sur Infoclimat ↗</a>
</div>`;
};
