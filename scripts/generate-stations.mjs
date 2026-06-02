// Génère static/infoclimat-stations.geojson à partir de l'open-data Infoclimat.
// Lancé à la demande (pas dans le build CI) : `node scripts/generate-stations.mjs`
// Filtre les stations actives depuis moins de 30 jours.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SOURCE_URL = 'https://www.infoclimat.fr/opendata/stations_xhr.php';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Parse "YYYY-MM-DD HH:MM:SS" (traité comme UTC ; la précision jour suffit). */
const parseSqlDate = (/** @type {unknown} */ sql) => {
	if (typeof sql !== 'string') return null;
	const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(sql);
	if (!m || m[1] === '0000') return null;
	const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
	return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * @param {unknown} derniereActivite
 * @param {Date} now
 */
export const isRecentlyActive = (derniereActivite, now) => {
	const d = parseSqlDate(derniereActivite);
	if (!d) return false;
	return now.getTime() - d.getTime() <= MAX_AGE_MS;
};

/** @param {number} n */
const round5 = (n) => Math.round(n * 1e5) / 1e5;

/** @param {Record<string, unknown>} row */
export const stationToFeature = (row) => ({
	type: 'Feature',
	geometry: {
		type: 'Point',
		coordinates: [round5(Number(row.longitude)), round5(Number(row.latitude))]
	},
	properties: {
		id: String(row.id),
		name: String(row.libelle),
		dept: String(row.departement),
		alt: Number(row.altitude),
		last: String(row.derniere_activite)
	}
});

/**
 * @param {Record<string, unknown>[]} rows
 * @param {Date} now
 */
export const buildFeatureCollection = (rows, now) => ({
	type: 'FeatureCollection',
	features: rows.filter((r) => isRecentlyActive(r.derniere_activite, now)).map(stationToFeature)
});

const main = async () => {
	const res = await fetch(SOURCE_URL);
	if (!res.ok) throw new Error(`Infoclimat HTTP ${res.status}`);
	const rows = await res.json();
	const fc = buildFeatureCollection(rows, new Date());
	const out = join(
		dirname(fileURLToPath(import.meta.url)),
		'..',
		'static',
		'infoclimat-stations.geojson'
	);
	writeFileSync(out, JSON.stringify(fc));
	console.log(`Écrit ${fc.features.length} stations actives → ${out}`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
