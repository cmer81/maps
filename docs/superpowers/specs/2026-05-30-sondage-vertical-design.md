# Sondage vertical (Skew-T log-P) sur la carte — Design

**Date** : 2026-05-30
**Statut** : design validé, prêt pour plan d'implémentation
**Scope** : MVP métropole, source Open-Meteo (AROME). La Réunion (bucket R2 maison) viendra
dans un 2e temps — l'architecture l'anticipe sans l'implémenter.

## Objectif

Au clic sur un point de la carte, ouvrir une fenêtre présentant un **sondage vertical simulé**
à partir des sorties du modèle AROME : tracé **Skew-T log-P**, **hodographe** et **indices
convectifs**. Équivalent du « sondage AROME » de Meteociel, intégré à notre carte MapLibre.

Le sondage sert trois usages, tous attendus dès le MVP :

- **Risque convectif / orages** — ascension d'une particule → CAPE, CIN, LI.
- **Hiver** — limite pluie/neige (LPN) + isothermie → profil de T + altitudes.
- **Risque supercellulaire** — cisaillement → hodographe (vent par niveau).

Le livrable est le **sondage complet** ; les indices en sont des lectures.

## Faits établis (validés en amont, ne pas re-chercher)

- Domaine `meteofrance_arome_france0025` (0,025°) diffuse **24 niveaux de pression** :
  1000, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 275, 250,
  225, 200, 175, 150, 125, 100 hPa. Le 1,3 km `meteofrance_arome_france_hd` ne diffuse **pas**
  les niveaux pression → on utilise le `0025` (sans impact visible sur un profil vertical).
- À chaque niveau `<L>` : `temperature_<L>hPa`, `relative_humidity_<L>hPa`,
  `geopotential_height_<L>hPa`, `wind_u_component_<L>hPa`, `wind_v_component_<L>hPa`.
  → de quoi calculer T, Td, CAPE/CIN/LI, LPN et l'hodographe.
- Les données sont déjà fetchées via le protocole `om://`. Un `.om` par timestep contient
  **toutes** les variables (donc tous les niveaux). URL :
  `{base}/data_spatial/{domain}/{run}/{validtime}.om` — `base` résolu par `getBaseUri()`
  (`helpers.ts`), URL construite par `getOMUrlFor(variable)` (`url.ts:269`).
- Primitive de lecture ponctuelle existante : `getValueFromLatLong(lat, lng, omUrl)`
  (`@openmeteo/weather-map-layer`), déjà utilisée dans `src/lib/popup.ts`. Elle lit **une seule**
  variable par appel (celle encodée dans `?variable=`) et renvoie `{ value }`.
- Pas de lib de charting ni de thermodynamique dans `package.json`.
- Infra niveaux de pression déjà présente (`VISIBLE_PRESSURE_LEVELS_HPA`, sélecteur de niveaux,
  wind-overlay multi-niveaux). Composants rangés par dossier (`src/lib/components/wind-overlay/`…).
- **Pas de système i18n actif** dans le repo : les chaînes UI sont en français en dur
  (`variables-fr.ts` n'est qu'une table de libellés).

## Décisions de conception (arbitrées en brainstorming)

| Sujet                     | Décision                                                                           | Raison                                                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Déclenchement             | **Bouton « Sondage vertical » dans le popup valeur existant**                      | Discoverable, pas de mode, ne lance les ~125 lectures que sur action explicite, cohabite avec l'existant.                                                                                                                            |
| Rendu Skew-T / hodographe | **SVG custom en composant Svelte 5**                                               | Zéro dépendance, thémable clair/sombre, interactif (survol), géométrie testable. Sert le contrat source-agnostique.                                                                                                                  |
| Thermodynamique           | **Module TS 100 % custom, fonctions pures, TDD**                                   | Aucune lib JS ne calcule CAPE/CIN/LI clé en main (meteoJS ne fournit que des primitives et ne calcule pas l'ascension/CAPE). La couche dure est à notre charge de toute façon ; colle à la culture zéro-dépendance + Vitest du repo. |
| Particules                | **Surface (SB) + Most-Unstable (MU)**                                              | Couvre la prévi convective (instabilité élevée/nocturne) sans exploser le scope. ML en V1.1.                                                                                                                                         |
| Agencement panneau        | **Onglets compacts** : Skew-T / Hodographe / Indices, une vue à la fois            | Tracé plein cadre, cohérent desktop + mobile.                                                                                                                                                                                        |
| Lien au temps             | **Live** : suit le curseur de temps (debounce + annulation des lectures obsolètes) | Permet le balayage temporel de l'évolution convective.                                                                                                                                                                               |
| Hodographe                | **Cisaillement 0-1 / 0-3 / 0-6 km seul** (MVP)                                     | Couvre l'essentiel du risque supercellulaire. SRH / Bunkers en V1.1.                                                                                                                                                                 |

## Architecture — 3 couches découplées

Aucune couche ne nomme « Open-Meteo ». La frontière entre couches est une donnée pure.

```
┌─ UI (Svelte) ──────────────────────────────────────────────┐
│  popup.ts (bouton) → store sounding → SoundingPanel.svelte  │
│  SkewT.svelte · Hodograph.svelte · Indices.svelte           │
└──────────────┬──────────────────────────────────────────────┘
               │ profil { levels[], surface } (données pures)
┌──────────────▼─ Calcul (TS pur, testé) ─────────────────────┐
│  thermo.ts · parcel.ts · indices.ts · skewt-coords.ts       │
└──────────────▲──────────────────────────────────────────────┘
               │ ColumnProfile (tableaux de nombres)
┌──────────────┴─ Lecture (source-agnostique) ───────────────┐
│  column.ts → fetchColumn(lat,lng,{ levels, urlFor, signal })│
│  s'appuie sur getValueFromLatLong + getOMUrlFor (existants) │
└─────────────────────────────────────────────────────────────┘
```

Arborescence :

- `src/lib/sounding/` — logique pure (lecture + calcul + géométrie), testable hors DOM.
- `src/lib/components/sounding/` — composants Svelte (panneau, tracés), comme `wind-overlay/`.
- `src/lib/stores/sounding.ts` — état du panneau.

### Modèle de données (frontière inter-couches)

```ts
// Une mesure à un niveau de pression (ou la surface)
interface LevelDatum {
	pressure: number; // hPa
	temperature: number; // °C
	dewpoint: number; // °C (dérivé de RH)
	height: number; // m (géopotentiel ; surface = altitude terrain)
	u: number; // m/s
	v: number; // m/s
}

interface ColumnProfile {
	lat: number;
	lng: number;
	validTime: string; // timestep
	surface: LevelDatum; // base de la particule SB
	levels: LevelDatum[]; // triés du sol vers le sommet, NaN exclus
}
```

## Couche 1 — Lecture (`src/lib/sounding/column.ts`), source-agnostique

`fetchColumn(lat, lng, opts)` où `opts = { levels: number[], urlFor: (variable) => string|undefined, signal }` :

- `urlFor` est injecté — en métropole c'est `getOMUrlFor` (qui route déjà vers Open-Meteo **ou**
  le bucket R2 via `getBaseUri`/`BUCKET_DOMAINS`). Le module ne nomme aucune source.
- Pour chaque niveau `L` : lit `temperature_<L>hPa`, `relative_humidity_<L>hPa`,
  `geopotential_height_<L>hPa`, `wind_u_component_<L>hPa`, `wind_v_component_<L>hPa` via
  `getValueFromLatLong(lat, lng, urlFor(variable))`.
- **Surface** : lit `temperature_2m`, l'humidité 2 m, la pression de surface et le vent 10 m.
  → _Point de vérification implémentation_ : confirmer les noms exacts des variables surface
  dans le meta JSON live (`temperature_2m`, `relative_humidity_2m` vs `dewpoint_2m`,
  `surface_pressure` vs `pressure_msl`, `wind_u_component_10m`…). L'altitude terrain peut venir
  de `map.queryTerrainElevation` (déjà utilisé dans `popup.ts`).
- Calcule `dewpoint` à partir de (T, RH) via `thermo.dewpointFromRH`.
- Exclut les niveaux à valeur non finie (NaN) ; trie du sol vers le sommet.
- Renvoie un `ColumnProfile`.

### Performance — point critique à lever EN PREMIER

- ~125 lectures (5 × 24 niveaux + ~4 surface), **toutes sur le même `.om`** (même `validtime`),
  seul le `?variable=` change.
- **Risque** : si `getValueFromLatLong` re-télécharge le fichier à chaque appel, ~125 lectures
  est inacceptable. **Avant de coder le reste, vérifier que le protocole `om://` /
  `@openmeteo/file-reader` met le `.om` en cache après le 1er accès** (le coût résiduel n'est
  alors que le décodage par variable).
- Si le cache n'existe pas : prévoir une primitive « lire N variables d'un même fichier en une
  passe » (à chercher dans l'API de `@openmeteo/weather-map-layer`, sinon décoder le fichier une
  fois soi-même). **Cette vérification peut modifier la couche lecture** → elle est la 1re étape
  du plan.
- Lectures parallélisées (`Promise.all`, éventuellement par lots pour ne pas saturer).
- **Spinner + progression** pendant le chargement.
- **Annulation** : jeton de génération (compteur) ou `AbortController` → les résultats d'un clic
  ou d'un timestep périmé sont ignorés.

## Couche 2 — Calcul (TS pur, TDD)

### `thermo.ts`

- `dewpointFromRH(T, RH)` ;
- pression de vapeur saturante (Bolton 1980) ;
- rapport de mélange / rapport de mélange saturant ;
- adiabatique sèche ; adiabatique saturée (intégration pas-à-pas) ;
- température du thermomètre mouillé (wet-bulb).

### `parcel.ts`

- Ascension d'une particule → niveaux **LCL**, **LFC**, **EL**.
- **Deux particules** :
  - **SB** (surface-based) : initiée depuis `surface` (2 m).
  - **MU** (most-unstable) : niveau de θe maximal sur la colonne.

### `indices.ts`

- **CAPE**, **CIN**, **LI** pour SB et MU (intégration de la flottabilité entre LFC et EL / CIN
  sous le LFC ; LI = T(env, 500 hPa) − T(particule, 500 hPa)).
- **LPN** (limite pluie/neige) : altitude de l'iso-0 °C et de l'iso-Tw ≈ 1,5 °C ; détection
  d'**isothermie** (couche quasi-isotherme près de 0 °C).
- **Cisaillement** 0-1 / 0-3 / 0-6 km : vecteurs et modules à partir des vents par niveau
  (interpolés sur la hauteur géopotentielle).

### `skewt-coords.ts`

- Transformations pures `(T, P) → (x, y)` : Y en **log-P**, X **incliné** (~45°).
- Fonctions **inverses** `(x, y) → (T, P)` pour la lecture au survol.
- Générateurs des lignes de fond (isobares, isothermes, adiabatiques, rapport de mélange).

Toutes ces fonctions sont **pures** et validées Vitest contre des sondages de référence
(valeurs attendues codées en dur).

## Couche 3 — UI

### Déclenchement

- `popup.ts` : ajouter un bouton « Sondage vertical » au contenu du popup valeur. Au clic →
  `sounding.open(lat, lng)` (coordonnées courantes du popup). Pas de mode dédié, pas de fetch
  involontaire au simple clic carte.

### Panneau — `SoundingPanel.svelte` (monté dans `+page.svelte`)

- **Onglets compacts** : `Skew-T` / `Hodographe` / `Indices`, une vue à la fois.
- **Desktop** : panneau flottant dismissable. **Mobile** : feuille basse. Réutilise le store
  `desktop` (`stores/preferences`) et shadcn-svelte (déjà présents).
- États : chargement (spinner + progression), erreur (message + recharger), succès.

### Composants de tracé

- `SkewT.svelte` — SVG : fond (isobares, isothermes inclinées, adiabatiques sèches/saturées,
  lignes de rapport de mélange) ; profils **T (rouge)**, **Td (vert)**, **particule (pointillés
  ambre)** ; zones **CAPE/CIN** ombrées. Survol → lecture T/P/altitude.
- `Hodograph.svelte` — cercles d'iso-vitesse, tracé du vent par niveau, repères de cisaillement
  0-1 / 0-3 / 0-6 km.
- `Indices.svelte` — tableau lisible : CAPE/CIN/LI (SB & MU), LPN, isothermie, cisaillements.

### Thème & i18n

- Couleurs SVG dérivées de `mode` (mode-watcher) + tokens `styles.css` (cf. color-scales).
- Chaînes **en français en dur**, conformément à la convention du repo.

## État & lien au temps — `src/lib/stores/sounding.ts`

```ts
interface SoundingState {
	open: boolean;
	lat: number | null;
	lng: number | null;
	activeTab: 'skewt' | 'hodograph' | 'indices';
}
```

- **Live sur le temps** : abonnement au store `time` ; à chaque changement (debounce ~300 ms),
  si `open`, recalcul pour `(lat, lng)` mémorisés. Jeton de génération pour ignorer les résultats
  périmés.
- MVP : **pas** de persistance URL du sondage (partage de lien possible en V1.1).

## Constantes

- Nouvelle `SOUNDING_PRESSURE_LEVELS_HPA` dans `constants.ts` = les 24 niveaux validés.
- `VISIBLE_PRESSURE_LEVELS_HPA` (7 niveaux, filtre d'affichage du sélecteur) **inchangée**.

## Contrat futur (Réunion) — anticipé, pas implémenté

Les couches lecture/calcul étant agnostiques, activer la Réunion = fournir la **liste de niveaux**
disponible pour `arome_om_reunion` (probablement un sous-ensemble) via une petite table
`domain → niveaux`. `getOMUrlFor` route déjà vers le bucket R2. Aucune logique de sondage ne
hardcode la source.

## Tests (Vitest, `src/lib/tests/`)

- `thermo` — Td, adiabatiques, Tw contre valeurs de référence.
- `parcel` — LCL/LFC/EL + ascension SB & MU sur sondages connus.
- `indices` — CAPE/CIN/LI/LPN/cisaillement contre sondages de référence.
- `skewt-coords` — transformations directes/inverses (round-trip).
- `column` — assemblage du `ColumnProfile` avec un `getValueFromLatLong` mocké (exclusion NaN,
  tri, dérivation du dewpoint).
- Composants : tests légers (rendu sans erreur, états chargement/erreur).

## Gestion des erreurs

- Niveaux manquants (NaN) → trous dans le tracé.
- Trop peu de niveaux valides → message explicite.
- Clic hors domaine / clipping → « Pas de données ici » (réutilise la logique de clipping du popup).
- Échec réseau → état d'erreur + bouton recharger.

## Hors scope MVP (V1.1+)

- Particule Mixed-Layer (ML), SRH / mouvement d'orage (Bunkers).
- Persistance/partage du sondage via l'URL.
- La Réunion (données pas encore produites) — seulement anticipée architecturalement.

## Ordre d'implémentation suggéré

1. **Lever le risque perf** : vérifier le cache de `getValueFromLatLong` ; figer la stratégie de
   lecture (par-variable parallélisé, ou primitive multi-variables).
2. Couche calcul pure + tests (thermo → parcel → indices → skewt-coords).
3. Couche lecture `column.ts` + tests (mock).
4. Store `sounding.ts` + bouton dans `popup.ts`.
5. `SoundingPanel.svelte` (onglets, états) + montage dans `+page.svelte`.
6. `SkewT.svelte`, `Hodograph.svelte`, `Indices.svelte`.
7. Lien au temps (debounce + annulation), thème clair/sombre, finitions.

## Mise à jour de la doc (à faire dans le même changement)

- `.claude/rules/architecture.md` — décrire la couche sondage (lecture source-agnostique, calcul).
- `.claude/rules/components.md` — nouveau dossier `components/sounding/`.
- `.claude/rules/stores.md` — store `sounding`.
- `README.md` `## Architecture` — mention du sondage vertical.
