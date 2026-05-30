# Sondage vertical (Skew-T) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Au clic sur un point de la carte, ouvrir un panneau présentant un sondage vertical AROME (Skew-T log-P + hodographe + indices convectifs) calculé côté client.

**Architecture:** Trois couches découplées et source-agnostiques — lecture (`column.ts`, lit la colonne via les primitives existantes), calcul (TS pur testé : `thermo`, `parcel`, `indices`, `skewt-coords`), UI (Svelte : popup → store → panneau à onglets + tracés SVG custom). Aucune couche ne nomme « Open-Meteo ».

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Vitest, MapLibre GL, `@openmeteo/weather-map-layer` (`getValueFromLatLong`, `getOMUrlFor`), SVG custom, Tailwind v4.

**Spec de référence :** `docs/superpowers/specs/2026-05-30-sondage-vertical-design.md`

**Conventions repo (rappel) :** tabs, single quotes, pas de trailing commas, 100 col ; Svelte 5 runes (`$state`/`$derived`/`$effect`/`$props`) ; imports auto-triés (`npm run format`) ; alias `$lib/*` ; PR titles sémantiques (`feat:`…) ; tests dans `src/lib/tests/`.

---

## File Structure

**Logique pure (`src/lib/sounding/`)** — testable hors DOM :

- `types.ts` — `LevelDatum`, `ColumnProfile`, `ParcelResult`, `ParcelIndices`, `ShearLayer`, `SoundingIndices`.
- `thermo.ts` — primitives thermodynamiques (fonctions pures).
- `parcel.ts` — ascension de particule SB/MU → LCL/LFC/EL.
- `indices.ts` — CAPE/CIN/LI/LPN/isothermie/cisaillement.
- `skewt-coords.ts` — transformations géométriques log-P + skew (+ inverses).
- `column.ts` — `fetchColumn()` (dépend des primitives de la lib ; source-agnostique).

**État (`src/lib/stores/`)** :

- `sounding.ts` — état du panneau.

**Composants (`src/lib/components/sounding/`)** :

- `sounding-panel.svelte` — conteneur à onglets + états chargement/erreur.
- `skew-t.svelte` — tracé Skew-T.
- `hodograph.svelte` — hodographe.
- `indices-table.svelte` — tableau d'indices.

**Intégration (modifications)** :

- `src/lib/constants.ts` — `SOUNDING_PRESSURE_LEVELS_HPA` + table `domain → niveaux`.
- `src/lib/popup.ts` — bouton « Sondage vertical ».
- `src/routes/+page.svelte` — montage du panneau.

**Tests (`src/lib/tests/`)** : `thermo.test.ts`, `skewt-coords.test.ts`, `parcel.test.ts`, `indices.test.ts`, `column.test.ts`.

**Docs (même PR)** : `.claude/rules/architecture.md`, `.claude/rules/components.md`, `.claude/rules/stores.md`, `README.md`.

---

## Task 0: Lever le risque perf (BLOQUANT — à faire en premier)

But : confirmer que ~125 lectures sur le même `.om` ne re-téléchargent pas le fichier, et figer la stratégie de lecture. **Ne pas coder `column.ts` avant la conclusion de cette tâche.**

**Files:**

- Aucun fichier produit ici (investigation). Notes consignées dans la PR / le commit message.

- [ ] **Step 1: Installer les dépendances**

Run: `npm install`
Expected: `node_modules/@openmeteo/weather-map-layer` présent.

- [ ] **Step 2: Inspecter la signature et le cache de `getValueFromLatLong`**

Run:

```bash
find node_modules/@openmeteo/weather-map-layer -name '*.d.ts' | head
grep -rn "getValueFromLatLong\|FileReader\|cache\|OmFileReader\|fetchOmFile" node_modules/@openmeteo/weather-map-layer/dist 2>/dev/null | head -40
```

Examiner : `getValueFromLatLong` re-télécharge-t-il le `.om` à chaque appel, ou réutilise-t-il un reader/cache ? Existe-t-il une primitive lisant plusieurs variables d'un même fichier (ex. un `OmFileReader` réutilisable) ?

- [ ] **Step 3: Mesurer empiriquement**

Lancer `npm run dev`, ouvrir la console, et chronométrer 125 appels parallèles `getValueFromLatLong(lat, lng, getOMUrlFor('temperature_<L>hPa'))` sur un point métropole (copier le pattern de `popup.ts`). Noter le temps total et le nombre de requêtes réseau (onglet Network).

- [ ] **Step 4: Figer la stratégie et la documenter**

Décision à acter dans le commit message de la Task 8 (column) :

- **Cas A — fichier mis en cache** (attendu) : stratégie = `Promise.all` des lectures par variable (lots de ~16). Aucune adaptation.
- **Cas B — re-téléchargement** : utiliser le reader bas-niveau réutilisable de la lib (à identifier au Step 2) pour décoder le fichier une fois puis échantillonner chaque variable ; sinon, ouvrir un ticket et limiter le MVP aux niveaux essentiels. **Mettre à jour la signature de `fetchColumn` en conséquence (Task 8).**

- [ ] **Step 5: Commit (notes)**

```bash
git commit --allow-empty -m "chore: investigation perf lecture colonne sondage (cache getValueFromLatLong)"
```

---

## Task 1: Types partagés

**Files:**

- Create: `src/lib/sounding/types.ts`

- [ ] **Step 1: Écrire les types**

```ts
// src/lib/sounding/types.ts

/** Une mesure à un niveau de pression (ou la surface). */
export interface LevelDatum {
	pressure: number; // hPa
	temperature: number; // °C
	dewpoint: number; // °C
	height: number; // m (géopotentiel ; surface = altitude terrain)
	u: number; // m/s
	v: number; // m/s
}

/** Colonne reconstruite au point cliqué pour un timestep donné. */
export interface ColumnProfile {
	lat: number;
	lng: number;
	validTime: string;
	surface: LevelDatum;
	/** Triés du sol (forte pression) vers le sommet (faible pression), NaN exclus. */
	levels: LevelDatum[];
}

/** Résultat d'une ascension de particule. */
export interface ParcelResult {
	/** Profil de la particule aux mêmes pressions que l'environnement (°C). */
	temperature: number[];
	lcl: { pressure: number; height: number } | null;
	lfc: { pressure: number; height: number } | null;
	el: { pressure: number; height: number } | null;
}

/** Indices dérivés d'une particule. */
export interface ParcelIndices {
	cape: number; // J/kg
	cin: number; // J/kg (≤ 0)
	li: number; // °C
}

export interface ShearLayer {
	label: '0-1 km' | '0-3 km' | '0-6 km';
	u: number; // m/s
	v: number; // m/s
	magnitude: number; // m/s
}

export interface SoundingIndices {
	sb: ParcelIndices;
	mu: ParcelIndices;
	/** Limite pluie/neige : altitude (m) de l'iso-0 °C et de l'iso-Tw≈1.5 °C. */
	lpn: { iso0: number | null; isoTw: number | null; isothermal: boolean };
	shear: ShearLayer[];
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run check`
Expected: PASS (aucune erreur sur `types.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/sounding/types.ts
git commit -m "feat(sounding): types du profil et des indices"
```

---

## Task 2: Thermodynamique — primitives (`thermo.ts`)

**Files:**

- Create: `src/lib/sounding/thermo.ts`
- Test: `src/lib/tests/thermo.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// src/lib/tests/thermo.test.ts
import { describe, expect, it } from 'vitest';

import {
	dewpointFromRH,
	dryAdiabatTemp,
	mixingRatio,
	moistLapseTemp,
	potentialTemperature,
	saturationMixingRatio,
	saturationVaporPressure,
	wetBulb
} from '$lib/sounding/thermo';

describe('thermo', () => {
	it('saturation vapor pressure (Bolton) ~23.4 hPa à 20°C', () => {
		expect(saturationVaporPressure(20)).toBeCloseTo(23.4, 1);
		expect(saturationVaporPressure(0)).toBeCloseTo(6.11, 1);
	});

	it('dewpoint depuis RH : 20°C / 50% ≈ 9.3°C', () => {
		expect(dewpointFromRH(20, 50)).toBeCloseTo(9.3, 0);
		expect(dewpointFromRH(20, 100)).toBeCloseTo(20, 1);
	});

	it('mixing ratio croît avec la pression de vapeur', () => {
		expect(saturationMixingRatio(20, 1000)).toBeGreaterThan(saturationMixingRatio(10, 1000));
		expect(mixingRatio(23.4, 1000)).toBeCloseTo(14.9, 0); // g/kg
	});

	it('température potentielle = T à 1000 hPa, croît en altitude', () => {
		expect(potentialTemperature(293.15, 1000)).toBeCloseTo(293.15, 1);
		expect(potentialTemperature(273.15, 500)).toBeGreaterThan(273.15);
	});

	it('adiabatique sèche : conserve theta (round-trip)', () => {
		const theta = potentialTemperature(293.15, 1000);
		expect(dryAdiabatTemp(theta, 1000)).toBeCloseTo(293.15, 1);
		expect(dryAdiabatTemp(theta, 700)).toBeLessThan(293.15);
	});

	it('adiabatique saturée : refroidit moins vite que la sèche', () => {
		const dry = dryAdiabatTemp(potentialTemperature(293.15, 1000), 700) - 273.15;
		const moist = moistLapseTemp(20, 1000, 700);
		expect(moist).toBeGreaterThan(dry); // pseudo-adiabatique plus chaude en altitude
	});

	it('wet-bulb entre dewpoint et température', () => {
		const tw = wetBulb(20, 10, 1000);
		expect(tw).toBeLessThan(20);
		expect(tw).toBeGreaterThan(10);
	});
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/lib/tests/thermo.test.ts`
Expected: FAIL (`thermo` introuvable).

- [ ] **Step 3: Implémenter `thermo.ts`**

```ts
// src/lib/sounding/thermo.ts
// Constantes thermodynamiques (SI sauf indication).
const RD = 287.05; // J/(kg·K)
const CP = 1005; // J/(kg·K)
const LV = 2.501e6; // J/kg
const EPS = 0.622;
const KAPPA = RD / CP; // ≈ 0.2854
const MAGNUS_A = 17.625;
const MAGNUS_B = 243.04;

/** Pression de vapeur saturante (Bolton 1980), hPa, T en °C. */
export function saturationVaporPressure(tC: number): number {
	return 6.112 * Math.exp((17.67 * tC) / (tC + 243.5));
}

/** Point de rosée (°C) depuis T (°C) et humidité relative (%). */
export function dewpointFromRH(tC: number, rh: number): number {
	const r = Math.min(Math.max(rh, 0.01), 100) / 100;
	const alpha = Math.log(r) + (MAGNUS_A * tC) / (MAGNUS_B + tC);
	return (MAGNUS_B * alpha) / (MAGNUS_A - alpha);
}

/** Rapport de mélange (g/kg) depuis pression de vapeur e (hPa) et pression p (hPa). */
export function mixingRatio(eHPa: number, pHPa: number): number {
	return (1000 * EPS * eHPa) / (pHPa - eHPa);
}

/** Rapport de mélange saturant (g/kg). */
export function saturationMixingRatio(tC: number, pHPa: number): number {
	return mixingRatio(saturationVaporPressure(tC), pHPa);
}

/** Température potentielle (K) depuis T (K) et p (hPa). */
export function potentialTemperature(tK: number, pHPa: number): number {
	return tK * Math.pow(1000 / pHPa, KAPPA);
}

/** Température (K) sur une adiabatique sèche de température potentielle theta (K) à p (hPa). */
export function dryAdiabatTemp(thetaK: number, pHPa: number): number {
	return thetaK * Math.pow(pHPa / 1000, KAPPA);
}

/**
 * Intègre l'adiabatique pseudo-saturée d'une particule saturée de (startTC, startP)
 * jusqu'à endP. Renvoie la température (°C) à endP. dlnp par pas de ~5 hPa équivalent.
 */
export function moistLapseTemp(startTC: number, startP: number, endP: number): number {
	let tK = startTC + 273.15;
	const steps = Math.max(1, Math.ceil(Math.abs(Math.log(startP / endP)) / 0.01));
	const dlnp = Math.log(endP / startP) / steps; // négatif si on monte
	let lnp = Math.log(startP);
	for (let i = 0; i < steps; i++) {
		const p = Math.exp(lnp);
		const ws = saturationMixingRatio(tK - 273.15, p) / 1000; // kg/kg
		const num = RD * tK + LV * ws;
		const den = CP + (LV * LV * ws * EPS) / (RD * tK * tK);
		tK += (num / den) * dlnp;
		lnp += dlnp;
	}
	return tK - 273.15;
}

/** Température du thermomètre mouillé (°C) par recherche dichotomique (Normand). */
export function wetBulb(tC: number, tdC: number, pHPa: number): number {
	// Tw est entre Td et T ; on cherche la valeur dont l'écart psychrométrique colle.
	let lo = tdC;
	let hi = tC;
	for (let i = 0; i < 40; i++) {
		const mid = (lo + hi) / 2;
		// e implicite via dépression psychrométrique : es(Tw) - A·p·(T - Tw)
		const e = saturationVaporPressure(mid) - 6.6e-4 * (1 + 0.00115 * mid) * pHPa * (tC - mid);
		const eActual = saturationVaporPressure(tdC);
		if (e > eActual) hi = mid;
		else lo = mid;
	}
	return (lo + hi) / 2;
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run src/lib/tests/thermo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sounding/thermo.ts src/lib/tests/thermo.test.ts
git commit -m "feat(sounding): primitives thermodynamiques (Bolton, Magnus, adiabatiques)"
```

---

## Task 3: Géométrie Skew-T (`skewt-coords.ts`)

**Files:**

- Create: `src/lib/sounding/skewt-coords.ts`
- Test: `src/lib/tests/skewt-coords.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// src/lib/tests/skewt-coords.test.ts
import { describe, expect, it } from 'vitest';

import { type SkewTConfig, pressureToY, tempToX, xyToTemp } from '$lib/sounding/skewt-coords';

const cfg: SkewTConfig = { pTop: 100, pBottom: 1050, tMin: -90, tMax: 40, skew: 1 };

describe('skewt-coords', () => {
	it('pressureToY : 0 au sommet, 1 au sol', () => {
		expect(pressureToY(100, cfg)).toBeCloseTo(0, 5);
		expect(pressureToY(1050, cfg)).toBeCloseTo(1, 5);
		expect(pressureToY(500, cfg)).toBeGreaterThan(0);
		expect(pressureToY(500, cfg)).toBeLessThan(1);
	});

	it('tempToX / xyToTemp : round-trip', () => {
		const p = 700;
		const t = -5;
		const x = tempToX(t, p, cfg);
		const y = pressureToY(p, cfg);
		expect(xyToTemp(x, y, cfg)).toBeCloseTo(t, 5);
	});

	it('skew : à pression donnée, T plus chaud → x plus à droite', () => {
		expect(tempToX(10, 700, cfg)).toBeGreaterThan(tempToX(-10, 700, cfg));
	});
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/lib/tests/skewt-coords.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `skewt-coords.ts`**

```ts
// src/lib/sounding/skewt-coords.ts
// Coordonnées normalisées [0,1]×[0,1], origine en haut à gauche (comme SVG).
export interface SkewTConfig {
	pTop: number; // hPa (haut du diagramme, ex. 100)
	pBottom: number; // hPa (bas, ex. 1050)
	tMin: number; // °C bord gauche au sol
	tMax: number; // °C bord droit au sol
	skew: number; // inclinaison : décalage x (en fraction) par unité de y
}

/** y normalisé : 0 au sommet (faible p), 1 au sol (forte p), échelle log-P. */
export function pressureToY(pHPa: number, cfg: SkewTConfig): number {
	return (Math.log(pHPa) - Math.log(cfg.pTop)) / (Math.log(cfg.pBottom) - Math.log(cfg.pTop));
}

/** x normalisé d'une température (°C) à une pression donnée, avec skew. */
export function tempToX(tC: number, pHPa: number, cfg: SkewTConfig): number {
	const base = (tC - cfg.tMin) / (cfg.tMax - cfg.tMin);
	return base + cfg.skew * pressureToY(pHPa, cfg);
}

/** Inverse : température (°C) depuis (x, y) normalisés. */
export function xyToTemp(x: number, y: number, cfg: SkewTConfig): number {
	const base = x - cfg.skew * y;
	return base * (cfg.tMax - cfg.tMin) + cfg.tMin;
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run src/lib/tests/skewt-coords.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sounding/skewt-coords.ts src/lib/tests/skewt-coords.test.ts
git commit -m "feat(sounding): géométrie Skew-T log-P + skew (transformations inverses)"
```

---

## Task 4: Ascension de particule (`parcel.ts`)

**Files:**

- Create: `src/lib/sounding/parcel.ts`
- Test: `src/lib/tests/parcel.test.ts`

Hypothèses : la particule monte sèche jusqu'au LCL (température potentielle conservée, rapport de mélange conservé), puis pseudo-saturée. Le LCL est trouvé en cherchant la pression où la T sèche de la particule rejoint son point de rosée (rapport de mélange conservé). LFC/EL = croisements de flottabilité.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// src/lib/tests/parcel.test.ts
import { describe, expect, it } from 'vitest';

import { liftParcel, mostUnstableLevel } from '$lib/sounding/parcel';
import { type LevelDatum } from '$lib/sounding/types';

// Profil idéalisé instable : surface chaude/humide, décroissance ~7°C/km.
const env: LevelDatum[] = [
	{ pressure: 1000, temperature: 25, dewpoint: 20, height: 100, u: 0, v: 0 },
	{ pressure: 850, temperature: 14, dewpoint: 12, height: 1500, u: 0, v: 0 },
	{ pressure: 700, temperature: 5, dewpoint: 0, height: 3100, u: 0, v: 0 },
	{ pressure: 500, temperature: -12, dewpoint: -20, height: 5800, u: 0, v: 0 },
	{ pressure: 300, temperature: -40, dewpoint: -55, height: 9500, u: 0, v: 0 }
];
const surface = env[0];

describe('parcel', () => {
	it('liftParcel renvoie une T particule par niveau et un LCL', () => {
		const p = liftParcel(surface, env);
		expect(p.temperature).toHaveLength(env.length);
		expect(p.lcl).not.toBeNull();
		expect(p.lcl!.pressure).toBeLessThan(1000);
		expect(p.lcl!.pressure).toBeGreaterThan(700);
	});

	it('profil instable : la particule est plus chaude que l’environnement en altitude', () => {
		const p = liftParcel(surface, env);
		const idx500 = env.findIndex((l) => l.pressure === 500);
		expect(p.temperature[idx500]).toBeGreaterThan(env[idx500].temperature);
		expect(p.lfc).not.toBeNull();
		expect(p.el).not.toBeNull();
	});

	it('mostUnstableLevel renvoie le niveau de θe max (ici la surface)', () => {
		expect(mostUnstableLevel(surface, env).pressure).toBe(1000);
	});
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/lib/tests/parcel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `parcel.ts`**

```ts
// src/lib/sounding/parcel.ts
import {
	dryAdiabatTemp,
	mixingRatio,
	moistLapseTemp,
	potentialTemperature,
	saturationVaporPressure
} from './thermo';
import { type LevelDatum, type ParcelResult } from './types';

const KAPPA = 0.2854;

/** θe approximée (K) pour comparer l'instabilité des niveaux. */
function thetaE(level: LevelDatum): number {
	const tK = level.temperature + 273.15;
	const theta = potentialTemperature(tK, level.pressure);
	const e = saturationVaporPressure(level.dewpoint);
	const r = mixingRatio(e, level.pressure) / 1000; // kg/kg
	return theta * Math.exp((2.501e6 * r) / (1005 * tK));
}

/** Niveau le plus instable (θe max) parmi surface + niveaux bas (≥ 500 hPa). */
export function mostUnstableLevel(surface: LevelDatum, levels: LevelDatum[]): LevelDatum {
	const candidates = [surface, ...levels.filter((l) => l.pressure >= 500)];
	return candidates.reduce((best, l) => (thetaE(l) > thetaE(best) ? l : best), candidates[0]);
}

/** Pression du LCL : on remonte sèche en conservant le rapport de mélange. */
function findLcl(start: LevelDatum): { pressure: number; height: number } {
	const thetaK = potentialTemperature(start.temperature + 273.15, start.pressure);
	const r0 = mixingRatio(saturationVaporPressure(start.dewpoint), start.pressure); // g/kg conservé
	let p = start.pressure;
	let prevP = p;
	for (; p > 100; p -= 2) {
		const tC = dryAdiabatTemp(thetaK, p) - 273.15;
		// Td de la particule à p pour le même rapport de mélange r0 :
		const e = (r0 * p) / (621.97 + r0);
		const tdC = dewpointFromVaporPressure(e);
		if (tC <= tdC) break;
		prevP = p;
	}
	const frac = (start.pressure - prevP) / Math.max(1, start.pressure - p);
	const height = start.height + frac * 200; // approximation locale
	return { pressure: p, height };
}

function dewpointFromVaporPressure(eHPa: number): number {
	const ln = Math.log(Math.max(eHPa, 1e-3) / 6.112);
	return (243.5 * ln) / (17.67 - ln);
}

/** Ascension complète d'une particule depuis `start`, évaluée aux pressions de `levels`. */
export function liftParcel(start: LevelDatum, levels: LevelDatum[]): ParcelResult {
	const thetaK = potentialTemperature(start.temperature + 273.15, start.pressure);
	const lcl = findLcl(start);
	const lclTempC = dryAdiabatTemp(thetaK, lcl.pressure) - 273.15;

	const temperature = levels.map((l) => {
		if (l.pressure >= lcl.pressure) {
			return dryAdiabatTemp(thetaK, l.pressure) - 273.15; // sous le LCL : sèche
		}
		return moistLapseTemp(lclTempC, lcl.pressure, l.pressure); // au-dessus : saturée
	});

	// LFC / EL : croisements de la flottabilité (particule - environnement).
	let lfc: ParcelResult['lfc'] = null;
	let el: ParcelResult['el'] = null;
	for (let i = 1; i < levels.length; i++) {
		const bPrev = temperature[i - 1] - levels[i - 1].temperature;
		const bCur = temperature[i] - levels[i].temperature;
		if (bPrev <= 0 && bCur > 0 && !lfc) {
			lfc = { pressure: levels[i].pressure, height: levels[i].height };
		}
		if (bPrev > 0 && bCur <= 0 && lfc && !el) {
			el = { pressure: levels[i].pressure, height: levels[i].height };
		}
	}
	return { temperature, lcl, lfc, el };
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run src/lib/tests/parcel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sounding/parcel.ts src/lib/tests/parcel.test.ts
git commit -m "feat(sounding): ascension de particule (LCL/LFC/EL, SB & MU)"
```

---

## Task 5: Indices (`indices.ts`)

**Files:**

- Create: `src/lib/sounding/indices.ts`
- Test: `src/lib/tests/indices.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// src/lib/tests/indices.test.ts
import { describe, expect, it } from 'vitest';

import { computeIndices } from '$lib/sounding/indices';
import { type ColumnProfile, type LevelDatum } from '$lib/sounding/types';

const levels: LevelDatum[] = [
	{ pressure: 1000, temperature: 25, dewpoint: 20, height: 100, u: 0, v: 5 },
	{ pressure: 850, temperature: 14, dewpoint: 12, height: 1500, u: 5, v: 8 },
	{ pressure: 700, temperature: 5, dewpoint: 0, height: 3100, u: 10, v: 10 },
	{ pressure: 500, temperature: -12, dewpoint: -20, height: 5800, u: 18, v: 12 },
	{ pressure: 300, temperature: -40, dewpoint: -55, height: 9500, u: 30, v: 15 }
];
const profile: ColumnProfile = {
	lat: 45,
	lng: 2,
	validTime: '2026-05-30T12:00',
	surface: levels[0],
	levels
};

describe('indices', () => {
	it('profil instable : CAPE SB > 0, CIN ≤ 0, LI < 0', () => {
		const idx = computeIndices(profile);
		expect(idx.sb.cape).toBeGreaterThan(0);
		expect(idx.sb.cin).toBeLessThanOrEqual(0);
		expect(idx.sb.li).toBeLessThan(0);
	});

	it('CAPE MU ≥ CAPE SB', () => {
		const idx = computeIndices(profile);
		expect(idx.mu.cape).toBeGreaterThanOrEqual(idx.sb.cape - 1e-6);
	});

	it('cisaillement : 3 couches, modules croissants', () => {
		const idx = computeIndices(profile);
		expect(idx.shear).toHaveLength(3);
		const m = idx.shear.map((s) => s.magnitude);
		expect(m[2]).toBeGreaterThan(m[0]); // 0-6 km > 0-1 km
	});

	it('LPN : iso0 sous l’altitude où T passe 0°C', () => {
		const idx = computeIndices(profile);
		expect(idx.lpn.iso0).not.toBeNull();
		expect(idx.lpn.iso0!).toBeGreaterThan(1500);
		expect(idx.lpn.iso0!).toBeLessThan(3100);
	});
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/lib/tests/indices.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `indices.ts`**

```ts
// src/lib/sounding/indices.ts
import { liftParcel, mostUnstableLevel } from './parcel';
import { wetBulb } from './thermo';
import {
	type ColumnProfile,
	type LevelDatum,
	type ParcelIndices,
	type ParcelResult,
	type ShearLayer,
	type SoundingIndices
} from './types';

const RD = 287.05;
const G = 9.81;

/** Interpole linéairement une grandeur le long de la hauteur. */
function interpAtHeight(levels: LevelDatum[], targetH: number, key: 'u' | 'v'): number {
	for (let i = 1; i < levels.length; i++) {
		if (levels[i].height >= targetH) {
			const f = (targetH - levels[i - 1].height) / (levels[i].height - levels[i - 1].height);
			return levels[i - 1][key] + f * (levels[i][key] - levels[i - 1][key]);
		}
	}
	return levels[levels.length - 1][key];
}

/** CAPE/CIN par intégration de la flottabilité (J/kg) + LI à 500 hPa. */
function parcelIndices(parcel: ParcelResult, levels: LevelDatum[]): ParcelIndices {
	let cape = 0;
	let cin = 0;
	for (let i = 1; i < levels.length; i++) {
		const tParcelK = (parcel.temperature[i] + parcel.temperature[i - 1]) / 2 + 273.15;
		const tEnvK = (levels[i].temperature + levels[i - 1].temperature) / 2 + 273.15;
		const dz = levels[i].height - levels[i - 1].height;
		const b = (G * (tParcelK - tEnvK)) / tEnvK; // flottabilité moyenne sur la couche
		const contrib = b * dz;
		const aboveLfc = parcel.lfc !== null && levels[i].pressure <= parcel.lfc.pressure;
		const belowEl = parcel.el === null || levels[i].pressure >= parcel.el.pressure;
		if (aboveLfc && belowEl && contrib > 0) cape += contrib;
		else if (!aboveLfc && contrib < 0) cin += contrib;
	}
	const i500 = levels.findIndex((l) => l.pressure === 500);
	const li = i500 >= 0 ? levels[i500].temperature - parcel.temperature[i500] : NaN;
	return { cape, cin, li };
}

function computeShear(levels: LevelDatum[]): ShearLayer[] {
	const base = levels[0];
	const layers: Array<{ label: ShearLayer['label']; top: number }> = [
		{ label: '0-1 km', top: base.height + 1000 },
		{ label: '0-3 km', top: base.height + 3000 },
		{ label: '0-6 km', top: base.height + 6000 }
	];
	return layers.map(({ label, top }) => {
		const u = interpAtHeight(levels, top, 'u') - base.u;
		const v = interpAtHeight(levels, top, 'v') - base.v;
		return { label, u, v, magnitude: Math.hypot(u, v) };
	});
}

/** Altitude (m) du premier passage de `valueOf` à `threshold` en montant. */
function crossingHeight(
	levels: LevelDatum[],
	valueOf: (l: LevelDatum) => number,
	threshold: number
): number | null {
	for (let i = 1; i < levels.length; i++) {
		const a = valueOf(levels[i - 1]);
		const b = valueOf(levels[i]);
		if ((a - threshold) * (b - threshold) <= 0 && a !== b) {
			const f = (threshold - a) / (b - a);
			return levels[i - 1].height + f * (levels[i].height - levels[i - 1].height);
		}
	}
	return null;
}

export function computeIndices(profile: ColumnProfile): SoundingIndices {
	const { surface, levels } = profile;
	const sbParcel = liftParcel(surface, levels);
	const muStart = mostUnstableLevel(surface, levels);
	const muParcel = liftParcel(muStart, levels);

	const iso0 = crossingHeight(levels, (l) => l.temperature, 0);
	const isoTw = crossingHeight(levels, (l) => wetBulb(l.temperature, l.dewpoint, l.pressure), 1.5);
	// Isothermie : couche de ≥ 2 niveaux où |dT| < 0.5°C près de 0°C.
	let isothermal = false;
	for (let i = 1; i < levels.length; i++) {
		if (
			Math.abs(levels[i].temperature - levels[i - 1].temperature) < 0.5 &&
			Math.abs(levels[i].temperature) < 2
		) {
			isothermal = true;
			break;
		}
	}

	return {
		sb: parcelIndices(sbParcel, levels),
		mu: parcelIndices(muParcel, levels),
		lpn: { iso0, isoTw, isothermal },
		shear: computeShear(levels)
	};
}
```

> Note : `RD` est importé pour cohérence future (densité) mais non utilisé ici — le retirer si `npm run lint` le signale.

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run src/lib/tests/indices.test.ts`
Expected: PASS. Si `npm run lint` signale `RD` inutilisé, le supprimer puis re-commit.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sounding/indices.ts src/lib/tests/indices.test.ts
git commit -m "feat(sounding): indices CAPE/CIN/LI (SB & MU), LPN, isothermie, cisaillement"
```

---

## Task 6: Constantes — niveaux du sondage

**Files:**

- Modify: `src/lib/constants.ts` (après `VISIBLE_PRESSURE_LEVELS_HPA`, vers la ligne 84)

- [ ] **Step 1: Ajouter les constantes**

```ts
// Niveaux de pression (hPa) lus pour reconstruire une colonne de sondage, du sol
// vers le sommet. Distinct de VISIBLE_PRESSURE_LEVELS_HPA (filtre d'affichage du
// sélecteur). Source-agnostique : voir SOUNDING_LEVELS_BY_DOMAIN pour les domaines
// qui n'exposent qu'un sous-ensemble (ex. futur arome_om_reunion).
export const SOUNDING_PRESSURE_LEVELS_HPA: readonly number[] = [
	1000, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 275, 250, 225,
	200, 175, 150, 125, 100
];

// Niveaux disponibles par domaine. Défaut = liste complète métropole. La Réunion
// (arome_om_reunion) fournira sa propre liste quand les données seront produites.
export const SOUNDING_LEVELS_BY_DOMAIN: Readonly<Record<string, readonly number[]>> = {
	meteofrance_arome_france0025: SOUNDING_PRESSURE_LEVELS_HPA
};

export const soundingLevelsForDomain = (domain: string): readonly number[] =>
	SOUNDING_LEVELS_BY_DOMAIN[domain] ?? SOUNDING_PRESSURE_LEVELS_HPA;
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat(sounding): niveaux de pression du sondage (table par domaine)"
```

---

## Task 7: Store du panneau (`stores/sounding.ts`)

**Files:**

- Create: `src/lib/stores/sounding.ts`

- [ ] **Step 1: Écrire le store**

```ts
// src/lib/stores/sounding.ts
import { writable } from 'svelte/store';

export type SoundingTab = 'skewt' | 'hodograph' | 'indices';

export interface SoundingState {
	open: boolean;
	lat: number | null;
	lng: number | null;
	activeTab: SoundingTab;
}

const initial: SoundingState = { open: false, lat: null, lng: null, activeTab: 'skewt' };

function createSoundingStore() {
	const { subscribe, set, update } = writable<SoundingState>(initial);
	return {
		subscribe,
		open: (lat: number, lng: number) => set({ open: true, lat, lng, activeTab: 'skewt' }),
		setTab: (activeTab: SoundingTab) => update((s) => ({ ...s, activeTab })),
		close: () => set(initial)
	};
}

export const sounding = createSoundingStore();
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/sounding.ts
git commit -m "feat(sounding): store d'état du panneau"
```

---

## Task 8: Couche lecture (`column.ts`)

**Files:**

- Create: `src/lib/sounding/column.ts`
- Test: `src/lib/tests/column.test.ts`

> ⚠️ **Conclusion Task 0 (acquise)** : `getValueFromLatLong` ne lit QUE la variable actuellement rendue (sinon `NaN`) — **inadapté** pour 24 niveaux non affichés. On lit donc via le reader bas-niveau `WeatherMapLayerFileReader` (`setToOmFile` une fois → `readVariable` par variable sur une petite bbox → interpolation). Le `.om` n'est pas re-téléchargé (cache par blocs). La logique pure `assembleColumn` (Step 1-4) est **inchangée** — seule l'implémentation réelle de `read` (Step 5) change. Précédent : `src/lib/prefetch.ts:123-143`. **Tâche de jugement → modèle capable.**

- [ ] **Step 1: Écrire le test qui échoue (mock de la primitive)**

```ts
// src/lib/tests/column.test.ts
import { describe, expect, it, vi } from 'vitest';

import { assembleColumn } from '$lib/sounding/column';

describe('assembleColumn', () => {
	it('dérive le dewpoint, exclut les NaN, trie du sol vers le sommet', () => {
		// reader simulé : renvoie des valeurs déterministes par variable.
		const reader = vi.fn(async (variable: string) => {
			if (variable.includes('150hPa') && variable.startsWith('temperature')) return NaN; // niveau cassé
			if (variable.startsWith('temperature')) return 5;
			if (variable.startsWith('relative_humidity')) return 80;
			if (variable.startsWith('geopotential_height')) return 3000;
			return 4; // u / v
		});
		const surface = { temperature: 20, rh: 60, pressure: 1000, height: 100, u: 1, v: 2 };
		const profile = assembleColumn({
			lat: 45,
			lng: 2,
			validTime: 't',
			levels: [500, 150, 850], // volontairement non triés
			surface,
			read: reader
		});

		return profile.then((p) => {
			expect(p.levels.map((l) => l.pressure)).toEqual([850, 500]); // 150 exclu (NaN), trié desc
			expect(p.levels[0].dewpoint).toBeLessThan(p.levels[0].temperature);
			expect(p.surface.dewpoint).toBeCloseTo(12, 0); // 20°C / 60%
		});
	});
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/lib/tests/column.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `column.ts`**

```ts
// src/lib/sounding/column.ts
import { dewpointFromRH } from './thermo';
import { type ColumnProfile, type LevelDatum } from './types';

/** Lecture brute d'une variable au point ; renvoie NaN si indisponible. */
export type VariableReader = (variable: string) => Promise<number>;

interface SurfaceInput {
	temperature: number;
	rh: number;
	pressure: number;
	height: number;
	u: number;
	v: number;
}

interface AssembleInput {
	lat: number;
	lng: number;
	validTime: string;
	levels: readonly number[];
	surface: SurfaceInput;
	read: VariableReader;
}

/** Logique pure d'assemblage (testable) : lit chaque variable via `read`. */
export async function assembleColumn(input: AssembleInput): Promise<ColumnProfile> {
	const { levels, read } = input;
	const raw = await Promise.all(
		levels.map(async (L) => {
			const [t, rh, h, u, v] = await Promise.all([
				read(`temperature_${L}hPa`),
				read(`relative_humidity_${L}hPa`),
				read(`geopotential_height_${L}hPa`),
				read(`wind_u_component_${L}hPa`),
				read(`wind_v_component_${L}hPa`)
			]);
			return { pressure: L, temperature: t, rh, height: h, u, v };
		})
	);

	const valid: LevelDatum[] = raw
		.filter((r) => [r.temperature, r.rh, r.height, r.u, r.v].every(Number.isFinite))
		.map((r) => ({
			pressure: r.pressure,
			temperature: r.temperature,
			dewpoint: dewpointFromRH(r.temperature, r.rh),
			height: r.height,
			u: r.u,
			v: r.v
		}))
		.sort((a, b) => b.pressure - a.pressure); // sol → sommet

	const s = input.surface;
	const surface: LevelDatum = {
		pressure: s.pressure,
		temperature: s.temperature,
		dewpoint: dewpointFromRH(s.temperature, s.rh),
		height: s.height,
		u: s.u,
		v: s.v
	};

	return { lat: input.lat, lng: input.lng, validTime: input.validTime, surface, levels: valid };
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run src/lib/tests/column.test.ts`
Expected: PASS.

- [ ] **Step 5: Ajouter le wiring réel via `WeatherMapLayerFileReader`**

Ajouter dans `column.ts` la fonction `fetchColumn` qui branche `assembleColumn` sur le reader bas-niveau. Étudier d'abord `src/lib/prefetch.ts:123-143` (précédent : `getProtocolInstance(...).omFileReader.setToOmFile(url)` puis lecture) et l'implémentation de `getValueFromLatLong` dans `node_modules/@openmeteo/weather-map-layer/dist/index.mjs` (pour reproduire l'interpolation : `GridFactory.create(grid, ranges).getLinearInterpolatedValue(values, lat, lonNormalized)`).

Points à respecter (issus de l'investigation Task 0) :

- **Une seule URL `.om`** pour tout le sondage (le `.om` du timestep courant). La variable se sélectionne via `readVariable(variable, ...)`, pas via `?variable=`. Construire l'URL de base avec `getOMUrlFor('temperature_1000hPa')` puis retirer le `?variable=...` (ou exposer un helper d'URL de base) — confirmer la forme attendue par `setToOmFile` en lisant `prefetch.ts`.
- **Reader privé réutilisant le cache partagé** pour ne pas entrer en conflit avec le singleton de rendu : `new WeatherMapLayerFileReader({ useSAB: true, cache: get(omProtocolSettings).fileReaderConfig.cache })` (vérifier le chemin exact de la config cache dans `stores/om-protocol-settings.ts`). À défaut, réutiliser `getProtocolInstance(get(omProtocolSettings)).omFileReader` mais sans interleaver avec une navigation carte.
- **Petite bbox** autour du point (`getRanges(domain.grid, boundsAutourDuPoint)`) — ne PAS lire la grille entière pour 125 variables.
- **Concurrence bornée** (~8, comme `prefetch.ts`) plutôt qu'un `Promise.all` de 125 d'un coup.
- `read(variable)` renvoie le scalaire interpolé, ou `NaN` en cas d'échec/variable absente.

Squelette (les types/chemins exacts d'API sont à confirmer en lisant `prefetch.ts` + la lib) :

```ts
// --- suite de column.ts ---
import { get } from 'svelte/store';

import { GridFactory, WeatherMapLayerFileReader, getRanges } from '@openmeteo/weather-map-layer';

import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { selectedDomain } from '$lib/stores/variables';

import { soundingLevelsForDomain } from '$lib/constants';
import { getOMUrlFor } from '$lib/url';

/** Lit la colonne au point courant pour le domaine/run/temps actifs. */
export async function fetchColumn(
	lat: number,
	lng: number,
	terrainElevation: number,
	signal?: AbortSignal
): Promise<ColumnProfile> {
	const domain = get(selectedDomain);
	const levels = soundingLevelsForDomain(domain);

	// URL de base du .om (sans ?variable=) — confirmer la forme via prefetch.ts.
	const omUrl = baseOmUrl(getOMUrlFor('temperature_1000hPa'));
	if (!omUrl) throw new Error('URL .om indisponible');

	const reader = new WeatherMapLayerFileReader({
		useSAB: true,
		cache: get(omProtocolSettings).fileReaderConfig?.cache
	});
	await reader.setToOmFile(omUrl);
	const grid = /* domain.grid via les métadonnées — voir prefetch.ts/popup.ts */ undefined as never;
	const ranges = getRanges(grid, boundsAround(lat, lng));

	const read: VariableReader = async (variable) => {
		try {
			const values = await reader.readVariable(variable, ranges, signal);
			return GridFactory.create(grid, ranges).getLinearInterpolatedValue(
				values,
				lat,
				normalizeLon(lng)
			);
		} catch {
			return NaN;
		}
	};

	const [t2m, rh2m, psfc, u10, v10] = await Promise.all([
		read('temperature_2m'),
		read('relative_humidity_2m'),
		read('surface_pressure'),
		read('wind_u_component_10m'),
		read('wind_v_component_10m')
	]);

	return assembleColumn({
		lat,
		lng,
		validTime: omUrl,
		levels,
		surface: {
			temperature: t2m,
			rh: rh2m,
			pressure: Number.isFinite(psfc) ? psfc : 1013,
			height: terrainElevation,
			u: u10,
			v: v10
		},
		read
	});
}
```

Implémenter les helpers manquants (`baseOmUrl`, `boundsAround`, `normalizeLon`, obtention de `grid`) en s'alignant **exactement** sur `prefetch.ts`/`popup.ts`. Borner la concurrence des ~125 lectures (lots de 8) si `assembleColumn`'s `Promise.all` interne s'avère trop agressif (sinon laisser : le cache + la dédup inflight absorbent les chevauchements).

- [ ] **Step 6: Confirmer noms de variables surface + API reader en lançant l'app**

Run:

```bash
npm run dev
```

Dans la console navigateur : (a) vérifier que `temperature_2m`, `relative_humidity_2m`, `surface_pressure` (ou `pressure_msl`), `wind_u_component_10m`, `wind_v_component_10m` existent dans le meta JSON du domaine ; (b) cliquer un point et confirmer que `fetchColumn` renvoie des valeurs finies sur plusieurs niveaux (pas que des `NaN`) — c'est LA validation que le reader bas-niveau fonctionne là où `getValueFromLatLong` échouerait. Corriger les noms/API si besoin. Vérifier que `selectedDomain` est bien exporté par `$lib/stores/variables` (cf. `popup.ts`).

- [ ] **Step 7: Typecheck + commit**

Run: `npm run check`
Expected: PASS.

```bash
git add src/lib/sounding/column.ts src/lib/tests/column.test.ts
git commit -m "feat(sounding): lecture de colonne source-agnostique (assemblage + wiring lib)"
```

---

## Task 9: Composant `skew-t.svelte`

**Files:**

- Create: `src/lib/components/sounding/skew-t.svelte`

- [ ] **Step 1: Implémenter le tracé**

```svelte
<!-- src/lib/components/sounding/skew-t.svelte -->
<script lang="ts">
	import { mode } from 'mode-watcher';

	import { type SkewTConfig, pressureToY, tempToX } from '$lib/sounding/skewt-coords';
	import { type ColumnProfile, type ParcelResult } from '$lib/sounding/types';

	let { profile, parcel }: { profile: ColumnProfile; parcel: ParcelResult } = $props();

	const W = 320;
	const H = 420;
	const cfg: SkewTConfig = { pTop: 100, pBottom: 1050, tMin: -90, tMax: 40, skew: 0.9 };

	const isobars = [1000, 850, 700, 500, 400, 300, 200, 150, 100];
	const isotherms = [-80, -60, -40, -20, 0, 20, 40];

	const px = (t: number, p: number) => tempToX(t, p, cfg) * W;
	const py = (p: number) => pressureToY(p, cfg) * H;

	const isDark = $derived(mode.current === 'dark');
	const grid = $derived(isDark ? '#334155' : '#cbd5e1');
	const axis = $derived(isDark ? '#64748b' : '#94a3b8');

	const tempPath = $derived(
		profile.levels
			.map((l, i) => `${i ? 'L' : 'M'}${px(l.temperature, l.pressure)},${py(l.pressure)}`)
			.join(' ')
	);
	const dewPath = $derived(
		profile.levels
			.map((l, i) => `${i ? 'L' : 'M'}${px(l.dewpoint, l.pressure)},${py(l.pressure)}`)
			.join(' ')
	);
	const parcelPath = $derived(
		profile.levels
			.map((l, i) => `${i ? 'L' : 'M'}${px(parcel.temperature[i], l.pressure)},${py(l.pressure)}`)
			.join(' ')
	);
</script>

<svg viewBox="0 0 {W} {H}" class="h-full w-full" role="img" aria-label="Diagramme Skew-T">
	{#each isobars as p}
		<line x1="0" y1={py(p)} x2={W} y2={py(p)} stroke={grid} stroke-width="0.5" />
		<text x="2" y={py(p) - 2} fill={axis} font-size="9">{p}</text>
	{/each}
	{#each isotherms as t}
		<line
			x1={px(t, cfg.pBottom)}
			y1={H}
			x2={px(t, cfg.pTop)}
			y2="0"
			stroke={grid}
			stroke-width="0.4"
		/>
	{/each}
	<path d={dewPath} fill="none" stroke="#22c55e" stroke-width="2" />
	<path d={tempPath} fill="none" stroke="#ef4444" stroke-width="2" />
	<path d={parcelPath} fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3" />
</svg>
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/sounding/skew-t.svelte
git commit -m "feat(sounding): composant Skew-T (SVG, thémé)"
```

---

## Task 10: Composant `hodograph.svelte`

**Files:**

- Create: `src/lib/components/sounding/hodograph.svelte`

- [ ] **Step 1: Implémenter**

```svelte
<!-- src/lib/components/sounding/hodograph.svelte -->
<script lang="ts">
	import { mode } from 'mode-watcher';

	import { type ColumnProfile } from '$lib/sounding/types';

	let { profile }: { profile: ColumnProfile } = $props();

	const S = 280; // taille px
	const c = S / 2;
	const maxWind = 40; // m/s au bord
	const scale = (val: number) => (val / maxWind) * (S / 2);

	const isDark = $derived(mode.current === 'dark');
	const grid = $derived(isDark ? '#334155' : '#cbd5e1');

	// y inversé (vent vers le haut = -v).
	const path = $derived(
		profile.levels.map((l, i) => `${i ? 'L' : 'M'}${c + scale(l.u)},${c - scale(l.v)}`).join(' ')
	);
	const rings = [10, 20, 30, 40];
</script>

<svg viewBox="0 0 {S} {S}" class="h-full w-full" role="img" aria-label="Hodographe">
	{#each rings as r}
		<circle cx={c} cy={c} r={scale(r)} fill="none" stroke={grid} stroke-width="0.5" />
	{/each}
	<line x1="0" y1={c} x2={S} y2={c} stroke={grid} stroke-width="0.5" />
	<line x1={c} y1="0" x2={c} y2={S} stroke={grid} stroke-width="0.5" />
	<path d={path} fill="none" stroke="#38bdf8" stroke-width="2" />
</svg>
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run check`
Expected: PASS.

```bash
git add src/lib/components/sounding/hodograph.svelte
git commit -m "feat(sounding): composant hodographe (SVG)"
```

---

## Task 11: Composant `indices-table.svelte`

**Files:**

- Create: `src/lib/components/sounding/indices-table.svelte`

- [ ] **Step 1: Implémenter**

```svelte
<!-- src/lib/components/sounding/indices-table.svelte -->
<script lang="ts">
	import { type SoundingIndices } from '$lib/sounding/types';

	let { indices }: { indices: SoundingIndices } = $props();
	const r0 = (n: number | null) => (n === null || !Number.isFinite(n) ? '—' : Math.round(n));
</script>

<div class="space-y-2 p-2 text-sm">
	<table class="w-full">
		<thead>
			<tr class="text-left text-xs text-slate-500"
				><th></th><th>Surface</th><th>Plus instable</th></tr
			>
		</thead>
		<tbody class="font-mono">
			<tr><td>CAPE (J/kg)</td><td>{r0(indices.sb.cape)}</td><td>{r0(indices.mu.cape)}</td></tr>
			<tr><td>CIN (J/kg)</td><td>{r0(indices.sb.cin)}</td><td>{r0(indices.mu.cin)}</td></tr>
			<tr><td>LI (°C)</td><td>{r0(indices.sb.li)}</td><td>{r0(indices.mu.li)}</td></tr>
		</tbody>
	</table>
	<div class="border-t pt-2">
		<div>Iso 0 °C : <b>{r0(indices.lpn.iso0)} m</b></div>
		<div>Iso Tw 1,5 °C : <b>{r0(indices.lpn.isoTw)} m</b></div>
		{#if indices.lpn.isothermal}<div class="text-amber-500">⚠ Isothermie détectée</div>{/if}
	</div>
	<div class="border-t pt-2">
		{#each indices.shear as s}
			<div>Cisaillement {s.label} : <b>{r0(s.magnitude)} m/s</b></div>
		{/each}
	</div>
</div>
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run check`
Expected: PASS.

```bash
git add src/lib/components/sounding/indices-table.svelte
git commit -m "feat(sounding): tableau d'indices"
```

---

## Task 12: Panneau conteneur (`sounding-panel.svelte`)

Orchestration : lecture (debounce sur le temps), calcul, états, onglets, fermeture.

**Files:**

- Create: `src/lib/components/sounding/sounding-panel.svelte`

- [ ] **Step 1: Implémenter**

```svelte
<!-- src/lib/components/sounding/sounding-panel.svelte -->
<script lang="ts">
	import { get } from 'svelte/store';

	import { map as mapStore } from '$lib/stores/map';
	import { sounding } from '$lib/stores/sounding';
	import { time } from '$lib/stores/time';

	import { fetchColumn } from '$lib/sounding/column';
	import { computeIndices } from '$lib/sounding/indices';
	import { liftParcel, mostUnstableLevel } from '$lib/sounding/parcel';
	import { type ColumnProfile, type ParcelResult, type SoundingIndices } from '$lib/sounding/types';

	import Hodograph from './hodograph.svelte';
	import IndicesTable from './indices-table.svelte';
	import SkewT from './skew-t.svelte';

	let profile = $state<ColumnProfile | null>(null);
	let parcel = $state<ParcelResult | null>(null);
	let indices = $state<SoundingIndices | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	let generation = 0;

	async function load(lat: number, lng: number) {
		const myGen = ++generation;
		loading = true;
		error = null;
		try {
			const map = get(mapStore);
			const elev = map?.queryTerrainElevation({ lat, lng } as never) ?? 0;
			const col = await fetchColumn(lat, lng, typeof elev === 'number' ? elev : 0);
			if (myGen !== generation) return; // résultat périmé
			if (col.levels.length < 3) {
				error = 'Pas assez de données à ce point.';
				profile = null;
				return;
			}
			profile = col;
			parcel = liftParcel(col.surface, col.levels);
			indices = computeIndices(col);
		} catch {
			if (myGen === generation) error = 'Échec du chargement du sondage.';
		} finally {
			if (myGen === generation) loading = false;
		}
	}

	// (Re)charge quand le point ou le temps change (debounce sur le temps).
	let debounce: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const s = $sounding;
		const _t = $time; // dépendance : recalcul live au scrub
		if (!s.open || s.lat === null || s.lng === null) return;
		clearTimeout(debounce);
		const { lat, lng } = s;
		debounce = setTimeout(() => load(lat, lng), 300);
	});
</script>

{#if $sounding.open}
	<div
		class="sounding-panel fixed bottom-4 right-4 z-40 w-[340px] rounded-lg border bg-background shadow-lg"
	>
		<div class="flex items-center justify-between border-b p-2">
			<div class="flex gap-1">
				<button
					class:font-bold={$sounding.activeTab === 'skewt'}
					onclick={() => sounding.setTab('skewt')}>Skew-T</button
				>
				<button
					class:font-bold={$sounding.activeTab === 'hodograph'}
					onclick={() => sounding.setTab('hodograph')}>Hodographe</button
				>
				<button
					class:font-bold={$sounding.activeTab === 'indices'}
					onclick={() => sounding.setTab('indices')}>Indices</button
				>
			</div>
			<button aria-label="Fermer" onclick={() => sounding.close()}>✕</button>
		</div>
		<div class="h-[420px] p-2">
			{#if loading}
				<p class="p-4 text-sm text-slate-500">Chargement du sondage…</p>
			{:else if error}
				<p class="p-4 text-sm text-red-500">
					{error}
					<button
						class="underline"
						onclick={() => $sounding.lat !== null && load($sounding.lat, $sounding.lng!)}
						>Recharger</button
					>
				</p>
			{:else if profile && parcel && indices}
				{#if $sounding.activeTab === 'skewt'}<SkewT {profile} {parcel} />{/if}
				{#if $sounding.activeTab === 'hodograph'}<Hodograph {profile} />{/if}
				{#if $sounding.activeTab === 'indices'}<IndicesTable {indices} />{/if}
			{/if}
		</div>
	</div>
{/if}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run check`
Expected: PASS. Si `queryTerrainElevation` exige un `LngLat`, importer `maplibregl` et construire `new maplibregl.LngLat(lng, lat)` comme dans `popup.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/sounding/sounding-panel.svelte
git commit -m "feat(sounding): panneau à onglets (lecture live, états, debounce)"
```

---

## Task 13: Bouton dans le popup

**Files:**

- Modify: `src/lib/popup.ts`

- [ ] **Step 1: Repérer le point d'insertion**

Run: `grep -n "contentDiv.append\|coordinates\|updatePopupContent" src/lib/popup.ts`
Identifier l'endroit où le contenu du popup est construit (`initPopupDiv`) et où les coordonnées courantes sont connues (`updatePopupContent(coordinates)`).

- [ ] **Step 2: Ajouter le bouton et le câblage**

Dans `initPopupDiv`, après l'ajout de `contentDiv`, créer un bouton :

```ts
// en tête du fichier
import { sounding } from '$lib/stores/sounding';

// variable module
let soundingBtn: HTMLButtonElement | undefined;
let lastCoords: maplibregl.LngLat | undefined;
```

```ts
// dans initPopupDiv(), après wrapperDiv.append(contentDiv);
soundingBtn = document.createElement('button');
soundingBtn.className = 'popup-sounding-btn';
soundingBtn.innerText = 'Sondage vertical';
soundingBtn.addEventListener('click', () => {
	if (lastCoords) sounding.open(lastCoords.lat, lastCoords.lng);
});
wrapperDiv.append(soundingBtn);
```

Dans `updatePopupContent(coordinates)`, mémoriser les coords en début de fonction :

```ts
lastCoords = coordinates;
```

- [ ] **Step 3: Style minimal du bouton (`src/styles.css`)**

```css
.popup-sounding-btn {
	margin-top: 4px;
	width: 100%;
	border-radius: 4px;
	padding: 2px 6px;
	font-size: 12px;
	cursor: pointer;
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run check`
Expected: PASS.

```bash
git add src/lib/popup.ts src/styles.css
git commit -m "feat(sounding): bouton d'ouverture du sondage dans le popup valeur"
```

---

## Task 14: Montage du panneau + format

**Files:**

- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Monter le panneau**

Run: `grep -n "SoundingPanel\|<script\|components" src/routes/+page.svelte | head`
Ajouter l'import (laisser `npm run format` trier) et le composant dans le markup, au même niveau que les autres overlays/contrôles :

```svelte
import SoundingPanel from '$lib/components/sounding/sounding-panel.svelte';
```

```svelte
<SoundingPanel />
```

- [ ] **Step 2: Formater**

Run: `npm run format`
Expected: imports triés, aucune erreur.

- [ ] **Step 3: Vérifier check + lint + tests**

Run: `npm run check && npm run lint && npx vitest run`
Expected: tout PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(sounding): montage du panneau de sondage dans la page"
```

---

## Task 15: Vérification manuelle (skill `verify` / `run`)

**Files:** aucun.

- [ ] **Step 1: Lancer l'app**

Run: `npm run dev`

- [ ] **Step 2: Parcours**

1. Cliquer un point en métropole → popup valeur → bouton « Sondage vertical ».
2. Le panneau s'ouvre, spinner, puis Skew-T (T rouge, Td vert, particule ambre).
3. Onglets Hodographe et Indices affichent des valeurs plausibles (CAPE ≥ 0, cisaillements croissants, iso-0 cohérent).
4. Déplacer le curseur de temps → le sondage se recalcule (debounce).
5. Cliquer un point hors domaine → message « Pas assez de données ».
6. Basculer thème clair/sombre → couleurs du tracé adaptées.

- [ ] **Step 3: Comparer à une référence**

Comparer 1–2 sondages (CAPE, iso-0, cisaillement) à Meteociel pour le même point/échéance. Écarts attendus (modèles/méthodes différents) mais ordres de grandeur cohérents. Si CAPE manifestement faux, déboguer `parcel.ts`/`indices.ts` avec la skill `systematic-debugging`.

---

## Task 16: Mise à jour de la documentation (même PR)

**Files:**

- Modify: `.claude/rules/architecture.md`, `.claude/rules/components.md`, `.claude/rules/stores.md`, `README.md`

- [ ] **Step 1: Documenter**

- `architecture.md` : ajouter une section « Sondage vertical » décrivant les 3 couches (`src/lib/sounding/`), la lecture source-agnostique via `getOMUrlFor`/`getValueFromLatLong`, et la table `domain → niveaux`.
- `components.md` : mentionner `components/sounding/` (panneau à onglets + tracés SVG).
- `stores.md` : documenter le store `sounding`.
- `README.md` `## Architecture` : une phrase sur le sondage vertical client-side.

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/ README.md
git commit -m "docs: documenter la couche sondage vertical"
```

- [ ] **Step 3: Ouvrir la PR**

```bash
git push -u origin feat/sondage-vertical
gh pr create --title "feat: sondage vertical (Skew-T) au clic sur la carte" --body "Implémente le sondage vertical AROME (Skew-T + hodographe + indices) selon docs/superpowers/specs/2026-05-30-sondage-vertical-design.md"
```

---

## Self-Review (effectuée)

**Couverture spec :** déclenchement popup (T13), rendu SVG custom (T9–T11), thermo custom TDD (T2,T4,T5), particules SB+MU (T4,T5), onglets (T12), lien live au temps + debounce + annulation (T12), hodographe cisaillement (T10,T5), perf/risque cache (T0), niveaux 24 + table domaine (T6), surface (T8), source-agnostique (T8 `read`/`getOMUrlFor`), thème (T9,T10), i18n FR en dur (composants), erreurs (T12), tests (T2,T3,T4,T5,T8), Réunion anticipée (T6), docs (T16). ✅

**Placeholders :** aucun « TBD/TODO » ; les deux points « à confirmer » (cache lib T0, noms variables surface T8 Step 6) sont des **étapes de vérification exécutables**, pas des trous.

**Cohérence des types :** `ColumnProfile`/`LevelDatum`/`ParcelResult`/`SoundingIndices` définis en T1 et utilisés à l'identique partout ; `fetchColumn(lat,lng,terrainElevation)`, `liftParcel(start,levels)`, `computeIndices(profile)`, `mostUnstableLevel(surface,levels)`, `assembleColumn({...})` cohérents entre tâches et tests.

**Réserve connue :** les valeurs de référence des tests CAPE/parcel sont des **propriétés de cohérence** (signes, monotonies, fourchettes), pas des constantes au J/kg près — choix assumé faute de sondage de référence chiffré dans le repo ; la Task 15 ajoute la comparaison externe.
