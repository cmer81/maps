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

Voir [`CLAUDE.md`](./CLAUDE.md) pour les détails internes :

- protocole MapLibre `om://` et résolution d'URL (`src/lib/url.ts`)
- routing des cumuls vers le worker (`getOMUrl()` + `om-protocol-settings.ts`)
- système de slots double-buffered pour les transitions de tuiles (`slot-manager.ts`)
- pipeline playback / pré-rendu (`playback-renderer.ts`)
- synchronisation URL ↔ stores Svelte 5

## Crédits & licence

- Upstream : [open-meteo/maps](https://github.com/open-meteo/maps) — voir [LICENSE](./LICENSE).
- Layer : [open-meteo/weather-map-layer](https://github.com/open-meteo/weather-map-layer).
- Données :
  - OMfiles météo : [Open-Meteo](https://open-meteo.com) (et indirectement Météo-France, ECMWF, DWD, NOAA…).
  - Contours administratifs FR : [`gregoiredavid/france-geojson`](https://github.com/gregoiredavid/france-geojson) (licence ODbL).

Pour les contributions liées au layer ou au protocole `om://` lui-même, ouvrir un ticket sur [open-meteo/weather-map-layer](https://github.com/open-meteo/weather-map-layer/issues) plutôt qu'ici.
