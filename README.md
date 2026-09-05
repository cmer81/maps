# Modèles météo — fork Infoclimat

Fork de [Open-Meteo Maps](https://github.com/open-meteo/maps) personnalisé pour [Infoclimat](https://www.infoclimat.fr).

Client SvelteKit qui rend des OMfiles via MapLibre GL — l'intégralité du rendu des tuiles météo s'exécute côté navigateur (pas de tile-server). Les fichiers sont récupérés directement depuis [`map-tiles.open-meteo.com`](https://map-tiles.open-meteo.com) ; les cumuls multi-heures transitent par un service Rust dédié ([`infoclimat-om-worker`](../infoclimat-om-worker/)).

![Aperçu](./static/example.png)

## Spécificités du fork

- **Bandeau Infoclimat** — logo + liens (site, forum, adhérer) intégrés en en-tête.
- **Palette de températures « infoclimat-inspired »** — échelle de couleurs adaptée aux conventions visuelles d'Infoclimat (voir `src/lib/color-scales/`).
- **Domaine par défaut** : `meteofrance_arome_france0025` (MF AROME France).
- **Sélecteur de domaine filtré** — préset Infoclimat dans `DOMAIN_ALLOWLIST` (constants.ts) : AROME France HD/15min, AROME France, ARPEGE Europe, ECMWF IFS HRES/0.25°/AIFS, DWD ICON D2/EU. Les autres modèles restent accessibles via URL partagée.
- **Cumuls de précipitations** — variables `precipitation_sum_Nh` (3 / 6 / 12 / 24 / 48 / 72 h) calculées par le worker sur la base des OMfiles horaires Open-Meteo.
- **Labels** — affichage optionnel des valeurs numériques sur la carte (toggle en haut à droite).
- **Contours des départements** — overlay GeoJSON bundlé (`/static/departements.geojson`) toggleable.
- **Wind overlay** — surcouche de vent à 10/80/120/180 m, opacité indépendante de la couche principale.
- **Deuxième couche scalaire** — superposition de deux variables (ex : température + précipitation) avec opacité réglable.
- **Diaporama / playback** — animation pré-rendue avec FPS configurable (4–15 fps), capture côté canvas via `preserveDrawingBuffer`.
- **UI 100 % française.**

### Dépendance forkée

Un seul paquet `@openmeteo/*` est consommé depuis un fork maison (voir `package.json`) :

- **`@openmeteo/weather-map-layer` → `npm:@cm3r/weather-map-layer@0.2.0`** (fork publié npm, source : [`cmer81/weather-map-layer`](https://github.com/cmer81/weather-map-layer), base upstream `37136ba` = 0.1.0 + #301/#303/#306). Le fork est **rebasé sur l'upstream** et ne porte plus que ce qui est impossible à faire côté consommateur :

  - **`globalIndex`** — les points de la source-layer `grid` portent un **`id` global stable** (`globalIndex = rangée_globale·nx + colonne_globale`) au lieu de l'index local de la sous-grille rognée aux tuiles. Sans ça, un même nœud change d'`id` selon les tuiles chargées (`nx` du clip variable) → l'index de symboles inter-tuiles de MapLibre ne l'apparie plus (étiquettes qui se replacent au pan) et tout décodage `(i, j)` côté client produit des bandes horizontales sur les domaines monde. Le fork **découple** l'`id` (global, pour MapLibre) de l'index local (qui sert encore à lire la valeur). C'est ce qui permet la couche « valeurs aux points de grille » figée (voir `## Architecture`) — cf. `src/lib/layers.ts`, `buildGridDecimationFilter`.
  - **`MAX_STATES_WITH_DATA` 2 → 24** — à 2, le look-ahead de décodage évince la frame affichée avant réutilisation (`getValueFromLatLong` lève « State not found »).
  - **`readRawVariable`** — lecture d'une variable telle que stockée, sans règle de dérivation ; le sondage a besoin des composantes `wind_u/v_component_*` brutes, que `readVariable` remplace par vitesse + direction (irrécupérables : interpoler une direction est faux à la couture 0°/360°).
  - **réexports** `defaultResolveRequest` + types `BreakpointColorScale` / `ColorScale` / `RGBA`, nécessaires pour surcharger `resolveRequest` et typer nos color scales.

  Objectif : faire merger `globalIndex` en amont, puis repasser sur `@openmeteo/weather-map-layer` officiel (le reste du patch est mince et upstreamable).

**Plus de fork `@openmeteo/file-reader`** — il existait pour mémoïser le HEAD par URL (le reader officiel le refaisait à chaque fichier). Depuis `file-reader@0.0.18`, l'upstream couvre le besoin avec `OmHttpBackendPool` + `withReader`, que `weather-map-layer` utilise en interne : on consomme donc `@openmeteo/file-reader` **officiel**. (La PR [typescript-omfiles#93](https://github.com/open-meteo/typescript-omfiles/pull/93) a été fermée sans merge, l'upstream ayant implémenté sa propre variante.)

#### Faire évoluer un fork (modification non triviale de la lib)

Quand un correctif/feature ne peut pas se faire côté `maps` et exige de toucher la lib, on **modifie le fork** puis on **monte la version npm** — ne jamais consommer une lib forkée autrement que par une version npm publiée et épinglée (sinon CI et autres devs ne sont pas reproductibles).

1. Dans le repo du fork (`cmer81/weather-map-layer`, branche `main`) : coder la modif (patch **petit et isolé** pour garder un futur rebase upstream gérable), `npm run build && npx vitest run`.
2. `npm version patch` (→ tag git) puis `npm publish` (public, OTP si 2FA) et `git push origin main --tags`.
3. Dans `maps` : `npm install -D @openmeteo/weather-map-layer@npm:@cm3r/weather-map-layer@<nouvelle-version>`, puis `npm run check && npm run test && npm run build`, commit.

Pour itérer **avant** de publier, on peut pointer temporairement `maps` sur un tarball local (`npm pack` dans le fork) ou `github:cmer81/weather-map-layer#<sha>` ; on ne publie sur npm + bump le pin qu'une fois stable.

Avant d'ajouter un patch au fork, vérifier qu'il ne peut pas se faire côté `maps` : les color scales upper-air AROME-France vivaient dans le fork alors que `om-protocol-settings.ts` les surcharge déjà par clé exacte — elles ont été retirées lors du rebase.

## Démarrage

```bash
npm install
npm run dev
```

L'app tourne par défaut sur `http://localhost:5173`.

### Activer les cumuls (worker local)

Les variables `*_sum_Nh` ne s'affichent dans le sélecteur que si le worker est joignable. Démarrer le worker dans un terminal séparé :

```bash
cd ../infoclimat-om-worker && cargo run
```

Puis configurer `maps/.env.local` :

```
VITE_OM_WORKER_URL=http://localhost:8080
```

## Build

```bash
npm run build    # static export → ./build
npm run preview  # servir la build localement
```

### Image Docker (déploiement self-hosted)

Le `Dockerfile` produit une image nginx qui template `VITE_OM_WORKER_URL` au runtime via `docker-entrypoint.d/` (pas besoin de rebuilder pour changer la cible du worker). Headers COOP/COEP/CORP appliqués pour activer `SharedArrayBuffer` (requis par `@openmeteo/file-reader`).

Une image est publiée automatiquement sur GHCR via `.github/workflows/`.

## Qualité

```bash
npm run check     # typecheck (svelte-check)
npm run lint      # prettier + eslint
npm run format    # prettier --write
npm run test      # vitest
npm run coverage  # vitest --coverage (v8)
```

Tests dans `src/lib/tests/**` (logique pure : temps, URLs, stores playback…).

## Architecture

Voir [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) et les règles ciblées dans [`.claude/rules/`](./.claude/rules/) pour les détails internes :

- protocole MapLibre `om://` et résolution d'URL (`src/lib/url.ts`)
- routing des cumuls vers le worker (`getOMUrl()` + `om-protocol-settings.ts`)
- système de slots double-buffered pour les transitions de tuiles (`slot-manager.ts`)
- pipeline playback / pré-rendu (`playback-renderer.ts`)
- synchronisation URL ↔ stores Svelte 5
- sondages verticaux client-side (Skew-T + hodographe + indices convectifs) calculés depuis les OMfiles AROME niveaux de pression au point cliqué (`src/lib/sounding/`)

Le chrome s'organise autour d'un header fin pleine largeur (marque Infoclimat, onglet « Carte », bouton « Réglages » ouvrant le panneau Avancé) et, sur desktop, d'une sidebar gauche repliable (sélecteur de modèle, liste verticale des calques, sections Affichage et Style) ; sur mobile, un bottom-sheet à onglets reprend les mêmes sections. La timeline et la légende se décalent de la largeur de la sidebar ; les contrôles MapLibre natifs sont ancrés en bas-droite au-dessus de la timeline.

## Crédits & licence

- Upstream : [open-meteo/maps](https://github.com/open-meteo/maps) — voir [LICENSE](./LICENSE).
- Layer : [open-meteo/weather-map-layer](https://github.com/open-meteo/weather-map-layer).
- Données :
  - OMfiles météo : [Open-Meteo](https://open-meteo.com) (et indirectement Météo-France, ECMWF, DWD, NOAA…).
  - Contours administratifs FR : [`gregoiredavid/france-geojson`](https://github.com/gregoiredavid/france-geojson) (licence ODbL).

### Licence Highcharts

Le meteogram utilise [Highcharts](https://www.highcharts.com/), gratuit pour un usage
non commercial (licence [CC BY-NC 3.0](https://creativecommons.org/licenses/by-nc/3.0/)) —
ce qui couvre Infoclimat (association à but non lucratif, produit non monétisé). **Tout
déploiement commercial d'un fork de ce dépôt nécessite une licence Highcharts propre.**
Les icônes météo (`static/weather-symbols/`) proviennent de
[nrkno/yr-weather-symbols](https://github.com/nrkno/yr-weather-symbols) (MIT).

Pour les contributions liées au layer ou au protocole `om://` lui-même, ouvrir un ticket sur [open-meteo/weather-map-layer](https://github.com/open-meteo/weather-map-layer/issues) plutôt qu'ici.
