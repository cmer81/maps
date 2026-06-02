# Calque « Stations Infoclimat » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher le réseau de stations Infoclimat sur la carte MapLibre comme un calque de repérage discret (opt-in), avec popup métadonnées + lien vers la fiche Infoclimat.

**Architecture:** Snapshot GeoJSON statique bundlé (généré par un script Node, comme `departements.geojson`) → un module de rendu `stations-layer.ts` calqué sur `departments-layer.ts` (source `geojson` + layer `circle`, fetch paresseux, cache module-scope, idempotent) → toggle persisté `showStations` (OFF par défaut) câblé dans `+page.svelte` et exposé dans `advanced-panel.svelte`. Densité gérée par interpolation d'opacité sur le zoom (apparition progressive).

**Tech Stack:** SvelteKit (Svelte 5 runes), MapLibre GL, TypeScript, Vitest, `svelte-persisted-store`. Node ESM pour le script de génération.

**Spec :** `docs/superpowers/specs/2026-06-03-stations-infoclimat-overlay-design.md`

**Préambule :** travailler sur la branche `feat/stations-infoclimat` (déjà créée, contient la spec). Tous les `npm`/`npx` se lancent depuis `maps/`.

---

## File Structure

| Fichier | Rôle | Statut |
| --- | --- | --- |
| `src/lib/stations.ts` | Helpers purs runtime : `slugify`, `buildStationUrl`, `formatLastReport`, `buildStationPopupHtml`, types | Créer |
| `scripts/generate-stations.mjs` | Génération du snapshot : fetch + filtre actifs<30j + conversion GeoJSON. Helpers purs exportés. | Créer |
| `static/infoclimat-stations.geojson` | Snapshot bundlé (généré, commité) | Créer (généré) |
| `src/lib/stores/stations.ts` | Store persisté `showStations` (OFF par défaut) | Créer |
| `src/lib/stations-layer.ts` | Source/layer MapLibre + popup au clic + curseur. Pattern `departments-layer.ts`. | Créer |
| `src/lib/tests/stations.test.ts` | Tests des helpers purs runtime | Créer |
| `src/lib/tests/generate-stations.test.ts` | Tests des helpers purs du générateur | Créer |
| `src/lib/constants.ts` | Constantes : URLs, IDs source/layer, seuils de zoom | Modifier |
| `src/lib/popup.ts` | Garde « clic sur station » dans le handler global | Modifier |
| `src/lib/components/chrome/advanced-panel.svelte` | Toggle « Stations » | Modifier |
| `src/lib/url.ts` | Sync URL ↔ store (param `stations`) | Modifier |
| `src/routes/+page.svelte` | Câblage `ensureStationsLayer` / `refreshStations` + `$effect` | Modifier |
| `.claude/rules/architecture.md` | Doc overlay + commande de régénération | Modifier |

---

## Task 1 : Helpers purs runtime (`stations.ts`)

**Files:**
- Create: `src/lib/stations.ts`
- Create: `src/lib/tests/stations.test.ts`
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Ajouter les constantes**

Dans `src/lib/constants.ts`, après la ligne `export const DEPARTMENTS_GEOJSON_URL = '/departements.geojson';` (ligne ~103), ajouter :

```ts
// --- Stations Infoclimat (calque de repérage) ---
export const STATIONS_GEOJSON_URL = '/infoclimat-stations.geojson';
export const STATIONS_SOURCE_ID = 'omStationsSource';
export const STATIONS_LAYER_ID = 'omStationsLayer';
// Base d'URL des fiches station (le slug est cosmétique, Infoclimat résout par id).
export const STATION_FICHE_BASE = 'https://www.infoclimat.fr/observations-meteo/temps-reel';
// Apparition progressive : opacité 0 sous MIN, plein à partir de MAX.
export const STATIONS_FADE_MIN_ZOOM = 6;
export const STATIONS_FADE_MAX_ZOOM = 7.5;
```

- [ ] **Step 2: Écrire le test (échec attendu)**

Create `src/lib/tests/stations.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import {
	buildStationPopupHtml,
	buildStationUrl,
	formatLastReport,
	slugify
} from '$lib/stations';

describe('slugify', () => {
	it('met en minuscules, retire les accents, remplace les espaces', () => {
		expect(slugify('Granges lès Beaumont')).toBe('granges-les-beaumont');
	});
	it('gère apostrophes et caractères spéciaux', () => {
		expect(slugify("Saint-Martin-d'Hères")).toBe('saint-martin-d-heres');
	});
	it('renvoie une chaîne vide pour une entrée vide', () => {
		expect(slugify('')).toBe('');
	});
});

describe('buildStationUrl', () => {
	it("inclut l'id et le slug dans une URL bien formée", () => {
		expect(buildStationUrl('00002', 'Le Vigan')).toBe(
			'https://www.infoclimat.fr/observations-meteo/temps-reel/le-vigan/00002.html'
		);
	});
});

describe('formatLastReport', () => {
	it('formate une date SQL en JJ/MM/AAAA HH:MM', () => {
		expect(formatLastReport('2026-06-02 21:50:00')).toBe('02/06/2026 21:50');
	});
	it('renvoie une chaîne vide pour la date nulle Infoclimat', () => {
		expect(formatLastReport('0000-00-00 00:00:00')).toBe('');
	});
});

describe('buildStationPopupHtml', () => {
	const html = buildStationPopupHtml({
		id: '00002',
		name: 'Le Vigan',
		dept: '30',
		alt: 245,
		last: '2026-06-02 21:50:00'
	});
	it('affiche le nom, altitude et département', () => {
		expect(html).toContain('Le Vigan');
		expect(html).toContain('245');
		expect(html).toContain('30');
	});
	it('contient le lien Infoclimat en nouvelle fenêtre', () => {
		expect(html).toContain(buildStationUrl('00002', 'Le Vigan'));
		expect(html).toContain('rel="noopener"');
	});
	it('échappe le HTML du nom', () => {
		const evil = buildStationPopupHtml({
			id: 'x',
			name: '<img src=x>',
			dept: '00',
			alt: 0,
			last: ''
		});
		expect(evil).not.toContain('<img src=x>');
		expect(evil).toContain('&lt;img');
	});
});
```

- [ ] **Step 3: Lancer le test (échec attendu)**

Run: `npx vitest run src/lib/tests/stations.test.ts`
Expected: FAIL — `Failed to resolve import "$lib/stations"`.

- [ ] **Step 4: Implémenter `stations.ts`**

Create `src/lib/stations.ts` :

```ts
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
```

- [ ] **Step 5: Lancer le test (succès attendu)**

Run: `npx vitest run src/lib/tests/stations.test.ts`
Expected: PASS (10 assertions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/stations.ts src/lib/tests/stations.test.ts src/lib/constants.ts
git commit -m "feat(stations): helpers purs (slug, url fiche, popup HTML) + constantes"
```

---

## Task 2 : Générateur de snapshot + GeoJSON bundlé

**Files:**
- Create: `scripts/generate-stations.mjs`
- Create: `src/lib/tests/generate-stations.test.ts`
- Create (généré): `static/infoclimat-stations.geojson`

- [ ] **Step 1: Écrire le test (échec attendu)**

Create `src/lib/tests/generate-stations.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import {
	buildFeatureCollection,
	isRecentlyActive,
	stationToFeature
} from '../../../scripts/generate-stations.mjs';

const NOW = new Date('2026-06-02T12:00:00Z');

describe('isRecentlyActive', () => {
	it('accepte une activité de moins de 30 jours', () => {
		expect(isRecentlyActive('2026-06-01 09:00:00', NOW)).toBe(true);
	});
	it('rejette une activité de plus de 30 jours', () => {
		expect(isRecentlyActive('2026-03-01 09:00:00', NOW)).toBe(false);
	});
	it('rejette la date nulle Infoclimat', () => {
		expect(isRecentlyActive('0000-00-00 00:00:00', NOW)).toBe(false);
	});
	it('rejette une valeur vide ou absente', () => {
		expect(isRecentlyActive('', NOW)).toBe(false);
		expect(isRecentlyActive(undefined, NOW)).toBe(false);
	});
});

describe('stationToFeature', () => {
	it('produit un Feature Point [lon, lat] avec props minimales', () => {
		const f = stationToFeature({
			id: '00002',
			libelle: 'Le Vigan',
			departement: '30',
			latitude: 43.98956,
			longitude: 3.60158,
			altitude: 245,
			derniere_activite: '2026-06-02 21:50:00'
		});
		expect(f.type).toBe('Feature');
		expect(f.geometry.type).toBe('Point');
		expect(f.geometry.coordinates).toEqual([3.60158, 43.98956]);
		expect(f.properties).toEqual({
			id: '00002',
			name: 'Le Vigan',
			dept: '30',
			alt: 245,
			last: '2026-06-02 21:50:00'
		});
	});
});

describe('buildFeatureCollection', () => {
	it('filtre les inactives et renvoie une FeatureCollection', () => {
		const fc = buildFeatureCollection(
			[
				{ id: 'a', libelle: 'Active', departement: '01', latitude: 1, longitude: 2, altitude: 10, derniere_activite: '2026-06-01 00:00:00' },
				{ id: 'b', libelle: 'Morte', departement: '02', latitude: 3, longitude: 4, altitude: 20, derniere_activite: '2007-09-02 09:10:00' }
			],
			NOW
		);
		expect(fc.type).toBe('FeatureCollection');
		expect(fc.features).toHaveLength(1);
		expect(fc.features[0].properties.id).toBe('a');
	});
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/lib/tests/generate-stations.test.ts`
Expected: FAIL — module `scripts/generate-stations.mjs` introuvable.

- [ ] **Step 3: Implémenter le générateur**

Create `scripts/generate-stations.mjs` :

```js
// Génère static/infoclimat-stations.geojson à partir de l'open-data Infoclimat.
// Lancé à la demande (pas dans le build CI) : `node scripts/generate-stations.mjs`
// Filtre les stations actives depuis moins de 30 jours.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SOURCE_URL = 'https://www.infoclimat.fr/opendata/stations_xhr.php';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Parse "YYYY-MM-DD HH:MM:SS" (traité comme UTC ; la précision jour suffit). */
const parseSqlDate = (sql) => {
	if (typeof sql !== 'string') return null;
	const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(sql);
	if (!m || m[1] === '0000') return null;
	const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
	return Number.isNaN(d.getTime()) ? null : d;
};

export const isRecentlyActive = (derniereActivite, now) => {
	const d = parseSqlDate(derniereActivite);
	if (!d) return false;
	return now.getTime() - d.getTime() <= MAX_AGE_MS;
};

const round5 = (n) => Math.round(n * 1e5) / 1e5;

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

export const buildFeatureCollection = (rows, now) => ({
	type: 'FeatureCollection',
	features: rows.filter((r) => isRecentlyActive(r.derniere_activite, now)).map(stationToFeature)
});

const main = async () => {
	const res = await fetch(SOURCE_URL);
	if (!res.ok) throw new Error(`Infoclimat HTTP ${res.status}`);
	const rows = await res.json();
	const fc = buildFeatureCollection(rows, new Date());
	const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'infoclimat-stations.geojson');
	writeFileSync(out, JSON.stringify(fc));
	console.log(`Écrit ${fc.features.length} stations actives → ${out}`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run src/lib/tests/generate-stations.test.ts`
Expected: PASS (7 assertions).

- [ ] **Step 5: Générer le snapshot réel**

Run: `node scripts/generate-stations.mjs`
Expected: affiche `Écrit <N> stations actives → …/static/infoclimat-stations.geojson` (N ≈ 850–920).

- [ ] **Step 6: Vérifier le fichier généré**

Run: `node -e "const f=require('./static/infoclimat-stations.geojson'); console.log(f.type, f.features.length, JSON.stringify(f.features[0].properties))"`
Expected: `FeatureCollection <N> {"id":...,"name":...,"dept":...,"alt":...,"last":...}`

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-stations.mjs src/lib/tests/generate-stations.test.ts static/infoclimat-stations.geojson
git commit -m "feat(stations): générateur de snapshot + GeoJSON bundlé"
```

---

## Task 3 : Store persisté `showStations`

**Files:**
- Create: `src/lib/stores/stations.ts`

- [ ] **Step 1: Implémenter le store**

Create `src/lib/stores/stations.ts` :

```ts
import { persisted } from 'svelte-persisted-store';

export const DEFAULT_SHOW_STATIONS = false;

export const showStations = persisted('show_stations', DEFAULT_SHOW_STATIONS);
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run check`
Expected: aucune erreur introduite par ce fichier.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/stations.ts
git commit -m "feat(stations): store persisté showStations (OFF par défaut)"
```

---

## Task 4 : Module de rendu `stations-layer.ts`

**Files:**
- Create: `src/lib/stations-layer.ts`

> Note : pas de test unitaire ici — le rendu MapLibre (canvas) et les handlers d'évènement ne sont pas couverts par Vitest, cohérent avec `departments-layer.ts` (sans test). La logique pure (popup HTML, URL) est déjà testée en Task 1. Vérification manuelle en Task 8.

- [ ] **Step 1: Implémenter le module**

Create `src/lib/stations-layer.ts` :

```ts
// MapLibre wiring du calque de stations Infoclimat.
// Owns: une geojson source + un layer `circle` placé AU-DESSUS du raster/vecteur
// (cliquable). Fetch paresseux du snapshot au premier affichage, caché en
// module-scope. Popup métadonnées au clic. Pattern : departments-layer.ts.
import { get } from 'svelte/store';

import maplibregl from 'maplibre-gl';

import { showStations } from '$lib/stores/stations';
import { map as mStore } from '$lib/stores/map';

import {
	STATIONS_FADE_MAX_ZOOM,
	STATIONS_FADE_MIN_ZOOM,
	STATIONS_GEOJSON_URL,
	STATIONS_LAYER_ID,
	STATIONS_SOURCE_ID
} from './constants';
import { buildStationPopupHtml, type StationProps } from './stations';

type StationsFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point>;

const emptyFc = (): StationsFeatureCollection => ({ type: 'FeatureCollection', features: [] });

let cachedData: StationsFeatureCollection | undefined;
let inflight: Promise<StationsFeatureCollection> | undefined;
let handlersWired = false;
let popup: maplibregl.Popup | undefined;

const fetchStations = async (): Promise<StationsFeatureCollection> => {
	if (cachedData) return cachedData;
	if (inflight) return inflight;
	inflight = (async () => {
		const res = await fetch(STATIONS_GEOJSON_URL);
		if (!res.ok) throw new Error(`stations GeoJSON HTTP ${res.status}`);
		const data = (await res.json()) as StationsFeatureCollection;
		cachedData = data;
		return data;
	})();
	try {
		return await inflight;
	} finally {
		inflight = undefined;
	}
};

const wireHandlers = (map: maplibregl.Map): void => {
	if (handlersWired) return;
	handlersWired = true;

	map.on('mouseenter', STATIONS_LAYER_ID, () => {
		map.getCanvas().style.cursor = 'pointer';
	});
	map.on('mouseleave', STATIONS_LAYER_ID, () => {
		map.getCanvas().style.cursor = '';
	});
	map.on('click', STATIONS_LAYER_ID, (e) => {
		const feature = e.features?.[0];
		if (!feature) return;
		const props = feature.properties as StationProps;
		const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
		popup ??= new maplibregl.Popup({ closeButton: true, offset: 8, maxWidth: '240px' });
		popup.setLngLat([lng, lat]).setHTML(buildStationPopupHtml(props)).addTo(map);
	});
};

/** Idempotent : enregistre source + layer une seule fois. */
export const ensureStationsLayer = (): void => {
	const map = get(mStore);
	if (!map) return;

	if (!map.getSource(STATIONS_SOURCE_ID)) {
		map.addSource(STATIONS_SOURCE_ID, { type: 'geojson', data: emptyFc() });
	}
	if (!map.getLayer(STATIONS_LAYER_ID)) {
		// Pas de beforeId → au sommet (visible et cliquable au-dessus du raster).
		map.addLayer({
			id: STATIONS_LAYER_ID,
			type: 'circle',
			source: STATIONS_SOURCE_ID,
			paint: {
				'circle-color': '#1e293b',
				'circle-stroke-color': '#ffffff',
				'circle-stroke-width': 1.5,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3, 10, 5],
				'circle-opacity': [
					'interpolate',
					['linear'],
					['zoom'],
					STATIONS_FADE_MIN_ZOOM,
					0,
					STATIONS_FADE_MAX_ZOOM,
					1
				],
				'circle-stroke-opacity': [
					'interpolate',
					['linear'],
					['zoom'],
					STATIONS_FADE_MIN_ZOOM,
					0,
					STATIONS_FADE_MAX_ZOOM,
					1
				]
			}
		});
	}
	wireHandlers(map);
};

const setData = (data: StationsFeatureCollection): void => {
	const map = get(mStore);
	const src = map?.getSource(STATIONS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
	src?.setData(data);
};

export const refreshStations = async (_deps?: unknown): Promise<void> => {
	const map = get(mStore);
	if (!map) return;

	ensureStationsLayer();

	if (!get(showStations)) {
		setData(emptyFc());
		popup?.remove();
		return;
	}

	try {
		const data = await fetchStations();
		if (!get(showStations)) return;
		setData(data);
	} catch (err) {
		console.warn('[stations] fetch failed', err);
	}
};
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run check`
Expected: aucune erreur (vérifie notamment les types MapLibre des expressions paint et `e.features`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/stations-layer.ts
git commit -m "feat(stations): module de rendu MapLibre (circle + popup au clic)"
```

---

## Task 5 : Garde « clic sur station » dans `popup.ts`

**Files:**
- Modify: `src/lib/popup.ts` (handler `map.on('click', …)` dans `addPopup`, ~ligne 244)

- [ ] **Step 1: Ajouter l'import de la constante**

Dans `src/lib/popup.ts`, ajouter `STATIONS_LAYER_ID` à l'import existant depuis `./constants` (ou créer l'import s'il n'existe pas). Exemple si un import constants existe déjà :

```ts
import { STATIONS_LAYER_ID } from './constants';
```

(Le placer dans le bloc d'imports `$lib`/relatifs ; `npm run format` réordonnera.)

- [ ] **Step 2: Ajouter la garde dans le handler de clic**

Dans `src/lib/popup.ts`, au début du callback de `map.on('click', async (e) => { … })`, juste après la ligne `if (!map || get(terraDrawActive)) return;`, ajouter :

```ts
		// Un clic sur un marqueur de station ouvre le popup station (stations-layer),
		// pas le popup de valeur du modèle.
		if (
			map.getLayer(STATIONS_LAYER_ID) &&
			map.queryRenderedFeatures(e.point, { layers: [STATIONS_LAYER_ID] }).length > 0
		) {
			return;
		}
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npm run check`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/lib/popup.ts
git commit -m "fix(stations): le clic sur une station n'ouvre pas le popup de valeur modèle"
```

---

## Task 6 : Toggle UI + sync URL

**Files:**
- Modify: `src/lib/components/chrome/advanced-panel.svelte`
- Modify: `src/lib/url.ts` (après le bloc `departments`, ~ligne 188)

- [ ] **Step 1: Sync URL ↔ store dans `url.ts`**

Dans `src/lib/url.ts`, juste après le bloc `departments` (qui se termine ligne ~188), ajouter :

```ts
	const stationsRaw = params.get('stations');
	if (stationsRaw !== null) {
		showStations.set(stationsRaw === 'true');
	} else if (get(showStations) !== DEFAULT_SHOW_STATIONS) {
		url.searchParams.set('stations', String(get(showStations)));
	}
```

Et ajouter l'import en tête de `url.ts` :

```ts
import { DEFAULT_SHOW_STATIONS, showStations } from '$lib/stores/stations';
```

- [ ] **Step 2: Ajouter le toggle dans `advanced-panel.svelte`**

Dans `src/lib/components/chrome/advanced-panel.svelte` :

a) Ajouter l'import (près de l'import `departments`) :

```ts
	import { DEFAULT_SHOW_STATIONS, showStations } from '$lib/stores/stations';
```

b) Après `const departmentsOn = $derived($showDepartments);`, ajouter :

```ts
	const stationsOn = $derived($showStations);
```

c) Après la fonction `toggleDepartments`, ajouter :

```ts
	function toggleStations(next: boolean) {
		showStations.set(next);
		updateUrl('stations', String(next), String(DEFAULT_SHOW_STATIONS));
	}
```

d) Dans le `{#snippet body()}`, sous la ligne `<LayerToggle label="Départements" … />`, ajouter :

```svelte
		<LayerToggle label="Stations" checked={stationsOn} onCheckedChange={toggleStations} />
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npm run check`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/lib/url.ts src/lib/components/chrome/advanced-panel.svelte
git commit -m "feat(stations): toggle Stations dans les réglages + sync URL"
```

---

## Task 7 : Câblage dans `+page.svelte`

**Files:**
- Modify: `src/routes/+page.svelte` (imports ~ligne 48 ; init ~ligne 136-137 ; `$effect` ~ligne 205-207)

- [ ] **Step 1: Ajouter les imports**

Dans `src/routes/+page.svelte`, près de l'import `departments-layer` (ligne ~48) et du store `showDepartments` (ligne ~18) :

```ts
import { ensureStationsLayer, refreshStations } from '$lib/stations-layer';
```
```ts
import { showStations } from '$lib/stores/stations';
```

- [ ] **Step 2: Initialiser le calque**

Dans le bloc d'init de la carte, juste après les lignes :

```ts
			ensureDepartmentsLayer();
			refreshDepartments();
```

ajouter :

```ts
			ensureStationsLayer();
			refreshStations();
```

- [ ] **Step 3: Ajouter le `$effect` réactif**

Juste après le bloc :

```ts
	$effect(() => {
		refreshDepartments([$showDepartments]);
	});
```

ajouter :

```ts
	$effect(() => {
		refreshStations([$showStations]);
	});
```

- [ ] **Step 4: Vérifier le typecheck**

Run: `npm run check`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(stations): câblage du calque stations dans la page carte"
```

---

## Task 8 : Documentation + vérification finale

**Files:**
- Modify: `.claude/rules/architecture.md`

- [ ] **Step 1: Documenter dans `architecture.md`**

Dans `.claude/rules/architecture.md`, à la fin de la section `## GeoJSON overlays`, ajouter :

```markdown
Le calque **Stations Infoclimat** suit le même pattern dans `src/lib/stations-layer.ts` : un `geojson` source + un layer `circle` placé **au-dessus** du raster (cliquable, contrairement aux départements qui passent sous `BEFORE_LAYER_VECTOR`), togglé par le store persisté `showStations` (OFF par défaut). Les marqueurs apparaissent progressivement au zoom (`circle-opacity` interpolée, `STATIONS_FADE_MIN/MAX_ZOOM`). Au clic, un popup affiche les métadonnées + un lien vers la fiche Infoclimat (`buildStationPopupHtml` dans `stations.ts`). Le handler global de `popup.ts` ignore les clics tombant sur une station (garde `queryRenderedFeatures`).

Le snapshot `static/infoclimat-stations.geojson` est **généré** (stations actives < 30 j) par `node scripts/generate-stations.mjs` puis commité — bundlé pour éviter le CORS de `infoclimat.fr` (l'endpoint `stations_xhr.php` n'expose pas `Access-Control-Allow-Origin`). Régénérer ce fichier pour rafraîchir la liste.
```

- [ ] **Step 2: Suite de tests complète**

Run: `npm run test -- --run`
Expected: tous les tests passent, dont `stations.test.ts` et `generate-stations.test.ts`.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run check && npm run lint`
Expected: aucune erreur. Si `prettier --check` échoue, lancer `npm run format` puis re-commit.

- [ ] **Step 4: Vérification manuelle (navigateur)**

Run: `npm run dev` puis ouvrir l'app.
Vérifier :
1. Réglages → toggle **« Stations »** présent, **OFF** par défaut, carte épurée à l'échelle France.
2. Activer le toggle puis **zoomer** sur une région → les marqueurs (point slate + liseré blanc) **apparaissent en fondu** au-delà du zoom ~6–7.5, lisibles sur raster coloré clair ET en dark mode.
3. **Cliquer** une station → popup nom · altitude · dép. · dernière donnée + lien « Voir sur Infoclimat ↗ » (ouvre la fiche dans un nouvel onglet). Le popup de valeur modèle **ne s'ouvre pas** en même temps.
4. Cliquer **hors** d'une station → le popup de valeur modèle fonctionne toujours normalement.
5. Désactiver le toggle → marqueurs disparaissent, popup station fermé.
6. Le param `?stations=true` apparaît dans l'URL quand activé ; recharger la page conserve l'état.

- [ ] **Step 5: Commit**

```bash
git add .claude/rules/architecture.md
git commit -m "docs(stations): documente le calque stations dans architecture.md"
```

---

## Self-Review (effectuée à l'écriture)

- **Couverture spec :** snapshot+filtre (T2), rendu style C + apparition progressive (T4), store OFF (T3), popup+lien (T1/T4), garde popup (T5), toggle+URL (T6), câblage (T7), doc (T8). Tests slug/url/filtre/forme GeoJSON (T1/T2). ✔
- **Placeholders :** aucun — code complet à chaque étape. ✔
- **Cohérence des noms :** `ensureStationsLayer` / `refreshStations` / `STATIONS_LAYER_ID` / `STATIONS_SOURCE_ID` / `showStations` / `DEFAULT_SHOW_STATIONS` / `buildStationPopupHtml` / `StationProps` employés de façon identique entre T1, T4, T5, T6, T7. ✔
- **Note d'attention exécution :** vérifier à l'exécution les numéros de ligne exacts (`url.ts:188`, `popup.ts:244`, `+page.svelte:136/205`) — ils peuvent dériver ; se repérer sur le code-ancre cité plutôt que sur le numéro.
