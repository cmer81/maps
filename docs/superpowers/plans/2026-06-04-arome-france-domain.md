# AROME France (surface) pseudo-domaine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un pseudo-domaine `arome_france` (AROME France surface, 12 variables) servi à 100 % depuis le bucket maison, sans fallback Open-Meteo ni interférence avec les domaines AROME d'Open-Meteo.

**Architecture:** Quasi-clone du pattern `arome_france_convection`. Le domaine est routé vers `getModelsBucketUrl()` via `BUCKET_DOMAINS` (`helpers.ts`), enregistré dans `domainOptions` par un module dédié gated sur le bucket, et regroupé dans le sélecteur sous un groupe partagé « AROME France (Infoclimat) » commun avec `arome_france_convection`. Le resolver par défaut, le format de temps (`getOMUrlFor`) et les colormaps standard suffisent — aucun changement à `om-protocol-settings.ts`, `metadata.ts` ni `url.ts`.

**Tech Stack:** SvelteKit, TypeScript, `@openmeteo/weather-map-layer`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-arome-france-domain-design.md`

---

## File Structure

- `src/lib/constants.ts` — **modify** : nouvelle constante `AROME_FRANCE_DOMAIN`, entrées dans `DOMAIN_ALLOWLIST`, `DOMAIN_DEFAULT_VIEWS`, `DOMAIN_DEFAULT_VARIABLES`, `MODEL_DESCRIPTIONS`.
- `src/lib/helpers.ts` — **modify** : ajout du domaine à `BUCKET_DOMAINS`.
- `src/lib/arome-france-domain.ts` — **create** : groupe partagé `ensureAromeFranceGroup()` + `registerAromeFranceDomain()`.
- `src/lib/arome-france-convection-domain.ts` — **modify** : utilise le groupe partagé au lieu de pousser son propre groupe.
- `src/lib/stores/variables.ts` — **modify** : appel de `registerAromeFranceDomain()` au chargement.
- `src/lib/tests/get-base-uri.test.ts` — **create** : routing bucket.
- `src/lib/tests/arome-france-domain.test.ts` — **create** : enregistrement, grille, groupe partagé, idempotence, gating.
- `src/lib/tests/arome-france-convection-domain.test.ts` — **modify** : attendre le groupe partagé `arome_france`.

---

## Task 1 : Routing bucket + constante de domaine

**Files:**

- Modify: `src/lib/constants.ts`
- Modify: `src/lib/helpers.ts`
- Test: `src/lib/tests/get-base-uri.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/lib/tests/get-base-uri.test.ts` :

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('getBaseUri', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('route arome_france vers le bucket maison', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { getBaseUri } = await import('$lib/helpers');
		expect(getBaseUri('arome_france')).toBe('https://bucket.test');
	});

	it('retire un slash final de la base bucket', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test/');
		const { getBaseUri } = await import('$lib/helpers');
		expect(getBaseUri('arome_france')).toBe('https://bucket.test');
	});

	it('laisse les domaines non-bucket sur open-meteo', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { getBaseUri } = await import('$lib/helpers');
		expect(getBaseUri('ecmwf_ifs')).toBe('https://map-tiles.open-meteo.com');
	});
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run src/lib/tests/get-base-uri.test.ts`
Expected: FAIL — `getBaseUri('arome_france')` retourne `'https://map-tiles.open-meteo.com'` (le domaine n'est pas encore dans `BUCKET_DOMAINS`).

- [ ] **Step 3 : Ajouter la constante de domaine dans `constants.ts`**

Après `export const AROME_FRANCE_CONVECTION_DOMAIN = 'arome_france_convection';` (ligne 17), insérer :

```ts
/** Pseudo-domaine AROME France métropole **surface** (12 variables standard
 *  Open-Meteo), servi depuis le bucket maison par le pipeline `arome-france-forecast`.
 *  Distinct de `arome_france_convection` (orienté convection/orage) et des AROME
 *  d'Open-Meteo (`meteofrance_arome_france*`). */
export const AROME_FRANCE_DOMAIN = 'arome_france';
```

- [ ] **Step 4 : Ajouter le domaine à `BUCKET_DOMAINS` dans `helpers.ts`**

Remplacer le bloc d'import (lignes 3-7) :

```ts
import {
	ANOMALY_DOMAIN,
	AROME_FRANCE_CONVECTION_DOMAIN,
	AROME_OM_REUNION_DOMAIN
} from '$lib/constants';
```

par :

```ts
import {
	ANOMALY_DOMAIN,
	AROME_FRANCE_CONVECTION_DOMAIN,
	AROME_FRANCE_DOMAIN,
	AROME_OM_REUNION_DOMAIN
} from '$lib/constants';
```

puis remplacer le `BUCKET_DOMAINS` (lignes 10-14) :

```ts
const BUCKET_DOMAINS: ReadonlySet<string> = new Set([
	ANOMALY_DOMAIN,
	AROME_OM_REUNION_DOMAIN,
	AROME_FRANCE_CONVECTION_DOMAIN
]);
```

par :

```ts
const BUCKET_DOMAINS: ReadonlySet<string> = new Set([
	ANOMALY_DOMAIN,
	AROME_OM_REUNION_DOMAIN,
	AROME_FRANCE_CONVECTION_DOMAIN,
	AROME_FRANCE_DOMAIN
]);
```

- [ ] **Step 5 : Lancer le test, vérifier qu'il passe**

Run: `npx vitest run src/lib/tests/get-base-uri.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6 : Commit**

```bash
git add src/lib/constants.ts src/lib/helpers.ts src/lib/tests/get-base-uri.test.ts
git commit -m "feat(arome_france): route le domaine arome_france vers le bucket maison"
```

---

## Task 2 : Module de domaine + groupe partagé

**Files:**

- Create: `src/lib/arome-france-domain.ts`
- Test: `src/lib/tests/arome-france-domain.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/lib/tests/arome-france-domain.test.ts` :

```ts
import { domainGroups, domainOptions } from '@openmeteo/weather-map-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerAromeFranceDomain', () => {
	beforeEach(() => {
		const idx = domainOptions.findIndex((d) => d.value === 'arome_france');
		if (idx >= 0) domainOptions.splice(idx, 1);
		const gidx = domainGroups.findIndex((g) => g.value === 'arome_france');
		if (gidx >= 0) domainGroups.splice(gidx, 1);
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('enregistre le groupe partagé « arome_france »', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceDomain } = await import('$lib/arome-france-domain');
		registerAromeFranceDomain();
		expect(domainGroups.filter((g) => g.value === 'arome_france').length).toBe(1);
		expect('arome_france'.startsWith('arome_france')).toBe(true);
	});

	it('pousse arome_france avec la grille producteur', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceDomain } = await import('$lib/arome-france-domain');
		registerAromeFranceDomain();
		const d = domainOptions.find((x) => x.value === 'arome_france');
		expect(d).toBeDefined();
		expect(d?.grid.nx).toBe(1121);
		expect(d?.grid.ny).toBe(717);
		if (d?.grid.type === 'regular') {
			expect(d.grid.dx).toBeCloseTo(0.025, 6);
			expect(d.grid.dy).toBeCloseTo(0.025, 6);
			expect(d.grid.lonMin).toBeCloseTo(-12, 6);
			expect(d.grid.latMin).toBeCloseTo(37.5, 6);
		} else {
			throw new Error('arome_france grid must be of type "regular"');
		}
		expect(d?.time_interval).toBe('hourly');
		expect(d?.model_interval).toBe('3_hourly');
	});

	it('est idempotent (pas de double push)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceDomain } = await import('$lib/arome-france-domain');
		registerAromeFranceDomain();
		registerAromeFranceDomain();
		expect(domainOptions.filter((x) => x.value === 'arome_france').length).toBe(1);
		expect(domainGroups.filter((g) => g.value === 'arome_france').length).toBe(1);
	});

	it('ne pousse rien quand le bucket est vide', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', '');
		const { registerAromeFranceDomain } = await import('$lib/arome-france-domain');
		registerAromeFranceDomain();
		expect(domainOptions.find((x) => x.value === 'arome_france')).toBeUndefined();
	});
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run src/lib/tests/arome-france-domain.test.ts`
Expected: FAIL — `Cannot find module '$lib/arome-france-domain'`.

- [ ] **Step 3 : Créer le module**

Créer `src/lib/arome-france-domain.ts` :

```ts
import { type Domain, domainGroups, domainOptions } from '@openmeteo/weather-map-layer';

import { AROME_FRANCE_DOMAIN } from '$lib/constants';
import { getModelsBucketUrl } from '$lib/runtime-env';

/** Groupe commun aux pseudo-domaines AROME France maison (Infoclimat). Le
 *  sélecteur range un domaine sous un groupe si `domain.value.startsWith(group.value)`
 *  — ce groupe capture donc `arome_france` ET `arome_france_convection`, mais aucun
 *  domaine d'Open-Meteo (préfixés `meteofrance`). */
export const AROME_FRANCE_GROUP = { value: 'arome_france', label: 'AROME France (Infoclimat)' };

/** Garantit (idempotent) la présence du groupe partagé dans `domainGroups`.
 *  Appelé par les modules `arome_france` et `arome_france_convection`. */
export function ensureAromeFranceGroup(): void {
	if (!domainGroups.some((g) => g.value === AROME_FRANCE_GROUP.value)) {
		domainGroups.push(AROME_FRANCE_GROUP);
	}
}

/** Domaine AROME France métropole surface (12 variables), servi depuis le bucket
 *  maison. Grille 1121×717 à 0.025° (métropole, lon −12→16, lat 37.5→55.4),
 *  horizon 51 h horaire, runs toutes les 3 h (8/j). Même grille que
 *  `arome_france_convection` et l'OM `meteofrance_arome_france0025`. */
const aromeFranceDomain: Domain = {
	value: AROME_FRANCE_DOMAIN,
	label: 'AROME France',
	grid: {
		type: 'regular',
		nx: 1121,
		ny: 717,
		latMin: 37.5,
		lonMin: -12,
		dx: 0.025,
		dy: 0.025,
		zoom: 5.2
	},
	time_interval: 'hourly',
	model_interval: '3_hourly'
};

/**
 * Pousse le pseudo-domaine `arome_france` dans `domainOptions` (mutable).
 * Idempotent. No-op si `VITE_MODELS_BUCKET_URL` n'est pas configuré — le domaine
 * reste alors absent du sélecteur (gating analogue à anomaly / arome-om / convection).
 */
export function registerAromeFranceDomain(): void {
	if (!getModelsBucketUrl()) return;
	ensureAromeFranceGroup();
	if (domainOptions.some((d) => d.value === AROME_FRANCE_DOMAIN)) return;
	domainOptions.push(aromeFranceDomain);
}
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

Run: `npx vitest run src/lib/tests/arome-france-domain.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/arome-france-domain.ts src/lib/tests/arome-france-domain.test.ts
git commit -m "feat(arome_france): module d'enregistrement du domaine + groupe partagé"
```

---

## Task 3 : Convection rejoint le groupe partagé

**Files:**

- Modify: `src/lib/arome-france-convection-domain.ts`
- Test: `src/lib/tests/arome-france-convection-domain.test.ts`

- [ ] **Step 1 : Mettre à jour le test pour exprimer le groupe partagé**

Remplacer **intégralement** `src/lib/tests/arome-france-convection-domain.test.ts` par :

```ts
import { domainGroups, domainOptions } from '@openmeteo/weather-map-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerAromeFranceConvectionDomain', () => {
	beforeEach(() => {
		const idx = domainOptions.findIndex((d) => d.value === 'arome_france_convection');
		if (idx >= 0) domainOptions.splice(idx, 1);
		for (const value of ['arome_france', 'arome_france_convection']) {
			const gidx = domainGroups.findIndex((g) => g.value === value);
			if (gidx >= 0) domainGroups.splice(gidx, 1);
		}
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('range la convection sous le groupe partagé « arome_france »', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		registerAromeFranceConvectionDomain();
		expect(domainGroups.filter((g) => g.value === 'arome_france').length).toBe(1);
		// Plus de groupe propre `arome_france_convection` (évite le doublon dans le menu).
		expect(domainGroups.find((g) => g.value === 'arome_france_convection')).toBeUndefined();
		expect('arome_france_convection'.startsWith('arome_france')).toBe(true);
	});

	it('pousse arome_france_convection avec la grille producteur', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		registerAromeFranceConvectionDomain();
		const d = domainOptions.find((x) => x.value === 'arome_france_convection');
		expect(d).toBeDefined();
		expect(d?.grid.nx).toBe(1121);
		expect(d?.grid.ny).toBe(717);
		if (d?.grid.type === 'regular') {
			expect(d.grid.dx).toBeCloseTo(0.025, 6);
			expect(d.grid.dy).toBeCloseTo(0.025, 6);
			expect(d.grid.lonMin).toBeCloseTo(-12, 6);
			expect(d.grid.latMin).toBeCloseTo(37.5, 6);
		} else {
			throw new Error('arome_france_convection grid must be of type "regular"');
		}
		expect(d?.time_interval).toBe('hourly');
		expect(d?.model_interval).toBe('3_hourly');
	});

	it('est idempotent (pas de double push)', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', 'https://bucket.test');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		registerAromeFranceConvectionDomain();
		registerAromeFranceConvectionDomain();
		expect(domainOptions.filter((x) => x.value === 'arome_france_convection').length).toBe(1);
		expect(domainGroups.filter((g) => g.value === 'arome_france').length).toBe(1);
	});

	it('ne pousse rien quand le bucket est vide', async () => {
		vi.stubEnv('VITE_MODELS_BUCKET_URL', '');
		const { registerAromeFranceConvectionDomain } =
			await import('$lib/arome-france-convection-domain');
		registerAromeFranceConvectionDomain();
		expect(domainOptions.find((x) => x.value === 'arome_france_convection')).toBeUndefined();
	});
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run src/lib/tests/arome-france-convection-domain.test.ts`
Expected: FAIL — le module pousse encore `{ value: 'arome_france_convection', ... }` ; le groupe partagé `arome_france` est absent et le groupe `arome_france_convection` est présent.

- [ ] **Step 3 : Refactorer le module convection**

Remplacer **intégralement** `src/lib/arome-france-convection-domain.ts` par :

```ts
import { type Domain, domainOptions } from '@openmeteo/weather-map-layer';

import { ensureAromeFranceGroup } from '$lib/arome-france-domain';
import { AROME_FRANCE_CONVECTION_DOMAIN } from '$lib/constants';
import { getModelsBucketUrl } from '$lib/runtime-env';

/** Domaine AROME France métropole orienté convection / chasse à l'orage.
 *  Grille 1121×717 à 0.025°, métropole (lon −12→16, lat 37.5→55.4).
 *  Runs toutes les 3 h, horizon 51 h. Voir spec
 *  `2026-06-01-arome-france-convection-design.md`. Regroupé dans le sélecteur
 *  sous le groupe partagé « AROME France (Infoclimat) » (voir `arome-france-domain.ts`). */
const aromeFranceConvectionDomain: Domain = {
	value: AROME_FRANCE_CONVECTION_DOMAIN,
	label: 'AROME Convection France',
	grid: {
		type: 'regular',
		nx: 1121,
		ny: 717,
		latMin: 37.5,
		lonMin: -12,
		dx: 0.025,
		dy: 0.025,
		// Même résolution native que AROME France 0.025° → même zoom de référence.
		zoom: 5.2
	},
	time_interval: 'hourly',
	model_interval: '3_hourly'
};

/**
 * Pousse le pseudo-domaine `arome_france_convection` dans `domainOptions` (mutable).
 * Idempotent. Ne fait rien si `VITE_MODELS_BUCKET_URL` n'est pas configuré — le
 * domaine reste alors absent du sélecteur (gating analogue à anomaly / arome-om).
 */
export function registerAromeFranceConvectionDomain(): void {
	if (!getModelsBucketUrl()) return;
	ensureAromeFranceGroup();
	if (domainOptions.some((d) => d.value === AROME_FRANCE_CONVECTION_DOMAIN)) return;
	domainOptions.push(aromeFranceConvectionDomain);
}
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

Run: `npx vitest run src/lib/tests/arome-france-convection-domain.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/arome-france-convection-domain.ts src/lib/tests/arome-france-convection-domain.test.ts
git commit -m "refactor(arome_france): convection rejoint le groupe partagé AROME France"
```

---

## Task 4 : Câblage + constantes d'affichage

**Files:**

- Modify: `src/lib/stores/variables.ts`
- Modify: `src/lib/constants.ts`

- [ ] **Step 1 : Enregistrer le domaine au chargement dans `variables.ts`**

Ajouter l'import à côté des autres `register…Domain` (après la ligne `import { registerAromeFranceConvectionDomain } from '$lib/arome-france-convection-domain';`) :

```ts
import { registerAromeFranceDomain } from '$lib/arome-france-domain';
```

Et ajouter l'appel dans le bloc d'enregistrement (après `registerAromeFranceConvectionDomain();`) :

```ts
registerAromeFranceDomain();
```

Le bloc d'appels doit ressembler à :

```ts
// Doit tourner avant la première évaluation de `selectedDomain`.
registerAnomalyDomain();
registerAromeOmDomain();
registerAromeFranceConvectionDomain();
registerAromeFranceDomain();
```

- [ ] **Step 2 : Ajouter les constantes d'affichage dans `constants.ts`**

Dans `DOMAIN_DEFAULT_VIEWS`, ajouter l'entrée `arome_france` (même vue métropole que la convection) :

```ts
export const DOMAIN_DEFAULT_VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
	[AROME_OM_REUNION_DOMAIN]: { center: [50.2, -15.97], zoom: 4.47 },
	[AROME_FRANCE_CONVECTION_DOMAIN]: { center: [2.3, 46.6], zoom: 5 },
	[AROME_FRANCE_DOMAIN]: { center: [2.3, 46.6], zoom: 5 }
};
```

Dans `DOMAIN_DEFAULT_VARIABLES`, ajouter l'entrée `arome_france` (bascule propre vers une variable publiée chez nous) :

```ts
export const DOMAIN_DEFAULT_VARIABLES: Record<string, string> = {
	[AROME_FRANCE_CONVECTION_DOMAIN]: 'radar_reflectivity',
	[AROME_FRANCE_DOMAIN]: 'temperature_2m'
};
```

Dans `DOMAIN_ALLOWLIST`, ajouter `'arome_france'` dans la section des pseudo-domaines maison (juste après l'entrée convection) :

```ts
	// AROME Convection France (pseudo-domaine, visible seulement si le bucket est configuré)
	'arome_france_convection',

	// AROME France surface (pseudo-domaine, visible seulement si le bucket est configuré)
	'arome_france',
```

Dans `MODEL_DESCRIPTIONS`, ajouter l'entrée `arome_france` (juste après `arome_france_convection`) :

```ts
	arome_france: 'Infoclimat · 0,025° (~2,5 km), France métropole · surface · ~51 h',
```

- [ ] **Step 3 : Formatter (tri des imports)**

Run: `npm run format`
Expected: réécrit `variables.ts` avec l'import trié si besoin ; pas d'erreur.

- [ ] **Step 4 : Typecheck**

Run: `npm run check`
Expected: PASS — 0 erreur svelte-check.

- [ ] **Step 5 : Suite de tests complète**

Run: `npm run test -- --run`
Expected: PASS — tous les fichiers de test, dont `get-base-uri`, `arome-france-domain`, `arome-france-convection-domain`.

- [ ] **Step 6 : Build statique**

Run: `npm run build`
Expected: build réussi (`./build`).

- [ ] **Step 7 : Commit**

```bash
git add src/lib/stores/variables.ts src/lib/constants.ts
git commit -m "feat(arome_france): expose le domaine dans le sélecteur (allowlist, vue, défaut, description)"
```

---

## Task 5 : Vérification manuelle (smoke test dev)

**Files:** aucun (vérification runtime).

- [ ] **Step 1 : Configurer le bucket**

S'assurer que `maps/.env.local` contient `VITE_MODELS_BUCKET_URL=<base-bucket>` pointant vers le bucket qui sert `data_spatial/arome_france/`.

- [ ] **Step 2 : Lancer le dev server**

Run: `npm run dev`

- [ ] **Step 3 : Vérifier dans l'app**

Ouvrir l'app, ouvrir le sélecteur de modèle :

- « AROME France (Infoclimat) » apparaît comme groupe unique, contenant **AROME France** et **AROME Convection France** (chacun une seule fois, pas de doublon).
- Sélectionner **AROME France** : la carte rend `temperature_2m` ; les variables `relative_humidity_2m`, `dew_point_2m`, `wind_u_component_10m` (rendu vitesse + flèches), `wind_gusts_10m`, `pressure_msl`, `cloud_cover_low/mid/high`, `precipitation`, `precipitation_sum` sont sélectionnables ; `wind_v_component_10m` est absent du sélecteur.
- Vérifier dans l'onglet réseau que les requêtes `.om` ciblent `{BASE}/data_spatial/arome_france/{YYYY}/{MM}/{DD}/{HHMM}Z/{valid_time}.om` (format temps `%Y-%m-%dT%H%M`, sans `Z` ni secondes).

- [ ] **Step 4 : Hors-code (ops)** — mesurer la latence avant/après bascule (motif initial : bucket OM lent). Pas de changement de code.

---

## Notes de revue

- **Pas de fallback Open-Meteo** : décision validée — `arome_france` est servi exclusivement par le bucket maison ; les variables hors des 12 publiées n'apparaissent pas (non listées dans le `meta.json`).
- **Aucun changement** à `om-protocol-settings.ts` (resolver par défaut + colormaps standard ; `precipitation_sum` déjà surchargé), `metadata.ts` (`matchVariableOrFirst` générique), `url.ts` (format temps + routing bucket déjà corrects).
- **Groupe partagé** : `arome_france` comme valeur de groupe ne capture aucun domaine OM (préfixés `meteofrance`). La dépendance `arome-france-convection-domain.ts → arome-france-domain.ts` ne crée pas de cycle.
