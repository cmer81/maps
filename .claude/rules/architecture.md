---
description: Core rendering engine — om:// protocol, SlotManager, GeoJSON overlays, playback, worker integration
paths:
  - 'src/lib/*.ts'
  - 'src/routes/**'
  - 'vite.config.ts'
---

# Architecture (rendering engine)

## Custom `om://` MapLibre protocol

The app registers a custom protocol with MapLibre in `src/routes/+page.svelte` (`maplibregl.addProtocol('om', ...)`) wired to `omProtocol` from `@openmeteo/weather-map-layer`. All sources use `om://<https-url-with-query-params>` URLs. Source URLs are constructed in `src/lib/url.ts → getOMUrl()`, which encodes the domain, model run, valid time, variable, vector toggles, tile size, dark mode, and stable hashes of clipping/color settings.

The dev/preview server in `vite.config.ts` injects `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers — required for `SharedArrayBuffer` used by `@openmeteo/file-reader` (which is excluded from Vite's `optimizeDeps` along with `@openmeteo/file-format-wasm`).

## SlotManager (double-buffered tiles)

`src/lib/slot-manager.ts` implements an A/B slot system used by `src/lib/layers.ts`. MapLibre's `setUrl`/`setTiles` does not reliably abort in-flight requests, so each data update creates a new source+layers in the pending slot, waits for `source.loaded()`, then cross-fades opacity and removes the old slot after `removeDelayMs`. When changing rendering code, preserve this pattern — there are now four managers: `rasterManager` (couche raster principale), `rasterManager2` (overlay raster secondaire optionnel, conditionné par `layer2Enabled`), `vectorManager` (contours/grille/étiquettes **et** flèches en mode « selon la variable affichée ») et `arrowManager` (flèches de l'**overlay vent**, sur un niveau de vent dédié). Tous sont créés dans `createManagers()` et doivent être mis à jour via `update()`/`setBeforeLayer()`, jamais en mutant sources/layers directement.

**Découplage flèches/contours (overlay vent).** Le `vectorManager` est toujours alimenté par `getOMUrl()` (variable affichée) : ses contours/étiquettes suivent donc la variable affichée. Quand l'overlay vent est actif (`windOverlayEnabled`), `getWindOverlayUrl()` fournit une URL **flèches-seules** (`getOMUrlFor(..., { contours: false, grid: false })`) qui alimente l'`arrowManager` ; sinon l'`arrowManager` est `destroy()`é et d'éventuelles flèches passent par le `vectorManager`. Les deux couches de flèches (`vectorArrowLayer(false)` sur le vectorManager, `vectorArrowLayer(true)` sur l'arrowManager) se gardent mutuellement via `arrowsOnOverlay !== forOverlay` (avec `arrowsOnOverlay = resolveWindArrowLevel() !== null`) pour ne jamais dessiner les flèches en double. **Piège historique** : avant ce découplage, l'overlay basculait toute la source vecteur sur `wind_u_component`, ce qui générait des contours/étiquettes parasites du vent (valeurs en m/s) par-dessus la carte dès que les contours étaient activés. `arrowManager` est mis à jour **avant** `vectorManager` pour que les flèches restent sous les contours/étiquettes (z-order). **Conséquence pour le popup** : `popup.ts` lit la vitesse du vent (mode calque) depuis l'`arrowManager` (`getActiveSourceUrl()`), **pas** le vectorManager — sinon il lirait la valeur de la variable affichée (p. ex. la température) et l'afficherait comme du vent.

**3ᵉ cas — fallback « selon la variable affichée ».** Une seule fonction décide quel niveau l'`arrowManager` rend : `resolveWindArrowLevel()` (`url.ts`). En mode « selon la variable affichée » (`windOverlayEnabled = false`), si la variable affichée n'est **pas** du vent (`isWindVariable`, `vector-styles.ts`), elle dérive un niveau via `deriveDisplayedWindLevel()` (niveau de pression de la variable si le vent y est publié, sinon `10m`) et l'`arrowManager` rend ce vent — sans quoi une `temperature_2m` n'affichait aucune flèche. Le garde de couche (`vectorArrowLayer`) **et** le popup (`popup.ts`) raisonnent désormais sur `resolveWindArrowLevel() !== null` (plus seulement sur `windOverlayEnabled`), si bien que le survol affiche le vent même en mode fallback. La règle « exactement un manager dessine les flèches » est préservée.

**Étiquettes d'isolignes converties dans l'unité d'affichage.** `buildContourLabelExpr(variable, baseUnit, units)` (`vector-styles.ts`) convertit la valeur brute des tuiles (unité de l'échelle de couleurs : `m/s`, `gpm`, `°C`…) vers l'unité choisie via une transformation **affine** (offset + facteur) dérivée de `convertValue` et exprimée en MapLibre (`number-format`). La couleur/largeur restent pilotées par la valeur brute (`modulo`), donc les lignes ne bougent pas. Le `baseUnit` est résolu dans le `layerFactory` via `getColorScale(variable, …).unit`. **Réactivité** : chaque changement d'unité (`unit-settings.svelte`) appelle `reloadVectorStyle()` pour reconstruire les étiquettes — sans ça, seul le géopotentiel se rafraîchissait et le vent restait figé en m/s.

Les managers utilisent un commit **opt-in différé** (`deferCommit: true`) : au lieu de chaque couche faisant un fondu indépendant dès que `source.loaded()`, un coordinateur module-level dans `layers.ts` — `beginCommitGroup`/`addToCommitGroup`/`tryFlushGroup`/`dropFromGroup` — groupe les managers mis à jour dans le même tick pour qu'ils effectuent leur fondu **ensemble**. `loading` est désactivé et `refreshPopup()` s'exécute une seule fois quand tout le groupe est prêt (ou quand les membres en erreur sont retirés via `dropFromGroup`). `addToCommitGroup` fusionne un manager dans le groupe en vol (utilisé par `reloadVectorStyle`) plutôt que d'écraser le groupe, ce qui évite de bloquer des managers raster déjà en attente.

Le style des contours et des flèches n'est plus codé en dur : il est défini dans `src/lib/vector-styles.ts` (builders data-driven) alimentés par les stores persistés `contourStyle`/`arrowStyle` (`src/lib/stores/vector-styles.ts`), éditables dans le drawer réglages. `reloadVectorStyle()` reconstruit les couches vectorielles en place après une modification de style (tuiles en cache → coût réseau quasi nul).

`changeOMfileURL()` ne recharge le **primaire** (raster + vecteur) que si `getOMUrl()` diffère de `currentOmUrl` ; la **couche 2** a sa propre déduplication (`currentOmUrl2 !== omUrl2`) et se rafraîchit indépendamment, même quand le primaire n'a pas bougé (changement de variable/activation de l'overlay). Pour forcer un rechargement primaire, invalider `currentOmUrl` (le mettre à `''`) ou changer un paramètre qui alimente `getOMUrl()`.

## Routes

Single page app: `src/routes/+page.svelte` is the entry; `+layout.ts` opts out of SSR (`export const prerender = true` / no server logic). Adding new routes is unusual — most features become components under `src/lib/components/`.

## GeoJSON overlays (départements)

`src/lib/departments-layer.ts` (contours des départements français) suit ce pattern : une source `geojson` dédiée (`omDepartmentsSource`) + un layer `line` (`omDepartmentsLayer`) placé sous `BEFORE_LAYER_VECTOR`, togglé par le store persisté `showDepartments`. Il expose `buildDepartmentsLineLayer(isDark, visible)` (builder pur du `LineLayerSpecification`, testé sans carte ; couleur figée selon `basemapTheme`), `ensureDepartmentsLayer()` (ajoute source vide + layer une fois, idempotent) et `refreshDepartments(visible = get(showDepartments))` (bascule la `visibility` via `setLayoutProperty` ; au 1er affichage, fetch **paresseux** du GeoJSON puis `setData`, données ensuite cachées en portée module — pas de re-fetch). **Piège re-style** : `setStyle` (donc `reloadStyles()`) purge sources/layers custom → `refreshDepartments()` est rappelé après chaque re-style (`map-controls.ts`) pour recréer source+layer (couleur du thème courant) et réinjecter les données cachées.

`buildDepartmentsLineLayer` pose **`maxzoom: 9`** sur le layer : l'overlay est masqué dès z≥9, là où le fond OpenFreeMap porte lui-même `admin_level=6` (géométrie fine) — on bascule sur ce tracé natif au lieu de superposer notre GeoJSON simplifié (évite le double trait à fort zoom). L'overlay ne couvre donc que z5-8 (l'échelle France où le fond est muet).

Le fichier `static/departements.geojson` est **bundlé** (évite le CORS). Il est **dérivé d'OpenStreetMap** (`admin_level=6`, même famille de données que le fond OpenFreeMap → bon raccord avec les côtes/régions/frontières du fond), simplifié (mapshaper Visvalingam ~0,4 %) et arrondi à 5 décimales : ~200 KB / ~70 KB gzip, 100 features (métropole + Corse 2A/2B + Rhône/Métropole de Lyon 69D/69M + DOM 971/974/976). **Pourquoi pas la couche `boundary` du fond** : OpenFreeMap ne porte `admin_level=6` qu'à partir du **zoom 9** (vérifié en décodant les tuiles MVT) — invisible à l'échelle France (z5-8, zoom par défaut ~5,2). Régénération : voir l'en-tête de `DEPARTMENTS_GEOJSON_URL` dans `constants.ts` (Overpass `area FR` + `admin_level=6` → `osmtogeojson` → `mapshaper -simplify -o precision`). Réutiliser ce pattern (source geojson dédiée) pour tout nouvel overlay autonome (régions, communes…).

## Labels villes/pays du basemap (toggle)

`src/lib/labels-layer.ts` masque/affiche les noms de villes et de pays — ce sont des
symbol-layers **du basemap** (`place_label_other`, `place_label_city`, `country_label-other`,
`country_label` dans `src/lib/basemap/minimal-*.json`), pas un overlay GeoJSON. `applyLabelsVisibility()`
bascule leur `visibility` via `setLayoutProperty` (défensif : couche absente ignorée). Piloté par le
store persisté `showLabels` (`src/lib/stores/labels.ts`, défaut `true`) + param URL `labels`, toggle
« Villes & pays » dans `advanced-panel.svelte`. **Piège** : `setStyle` (donc `reloadStyles()` au
changement de thème) recrée les couches du basemap en `visible` → `applyLabelsVisibility()` doit être
rappelé après chaque re-style (fait dans `reloadStyles()` et au `load` initial dans `+page.svelte`,
plus un `$effect` sur `$showLabels`). Même schéma que `showDepartments`.

## Playback (lecture en direct)

Le bouton play/pause de la barre de run (`src/lib/components/time/playback-button.svelte`, monté
dans `time-selector.svelte` à côté du bouton de préchargement) anime les échéances **en direct** —
pas de pré-rendu. Le moteur `src/lib/playback-engine.ts` (`createPlaybackEngine`, dépendances
injectées, testé dans `tests/playback-engine.test.ts`) avance le store `time` d'un pas via le
callback `playbackAdvance` de `time-selector.svelte` (store + URL + `changeOMfileURL()` + centrage,
**sans** `checkClosestModelRun` : les échéances sortent des `valid_times` du run courant), attend
que la frame soit réellement rendue (événement `commit` de `slot-events.ts` ; les commits
surnuméraires des managers raster/vecteur sont ignorés pendant qu'une avancée est programmée) puis
programme la suivante avec un plancher de 1,2 s/frame (`PLAYBACK_MIN_FRAME_MS`) et une garde de
10 s sans commit (`PLAYBACK_MAX_WAIT_MS` — on avance quand même). La **plage lue** est celle du
sélecteur de mode partagé avec le préchargement (store persisté `prefetchMode`,
`src/lib/stores/prefetch.ts`, défaut « Run complet ») : bornes injectées au start via `getBounds`,
boucle dans la plage (`nextPlaybackFrame`, `src/lib/playback.ts`) jusqu'à pause, saut au début de
plage si l'échéance courante est dehors. Changer de plage en cours de lecture redémarre le moteur
sur les nouvelles bornes (`$effect` untracked — `start()` lit `$time`/`$metaJson`, ne pas
re-déclencher sur chaque frame). Arrêt automatique sur `error` de slot et sur changement de
domaine/run. Au play, le bouton lance aussi un `prefetchData()` **en arrière-plan** sur la même
plage (variable affichée), fire-and-forget et annulé à la pause (`AbortController`) : la lecture
démarre sans attendre et se lisse à mesure que le cache rattrape, en plus de `neighbor-prefetch.ts`
et du préchargement manuel.

L'ancien player **pré-rendu** (diaporama : capture canvas, overlay, gel de la carte) reste retiré.
Vestige : `src/lib/playback-renderer.ts` ne contient plus que `waitForIdle(map, timeoutMs, signal?)`,
utilisé par `capture-flow.svelte` pour attendre la mise au repos de la carte avant la capture PNG du
canvas (`preserveDrawingBuffer` reste activé sur la map — voir `+page.svelte`).

**Préchargement (prefetch) — réintroduit seul.** `src/lib/prefetch.ts` + `src/lib/components/time/prefetch-button.svelte` ont été restaurés (sans le player d'animation). Le bouton vit dans la barre de run (`time-selector.svelte`, dans le `<div>` `-top-4.5` à côté du sélecteur de run) : un `Select` de mode (Aujourd'hui / 24 h suivantes / 24 h précédentes / Run complet — store persisté `prefetchMode`, partagé avec la lecture, libellés dans `PREFETCH_MODE_LABELS` de `prefetch.ts`) + un bouton télécharger qui appelle `prefetchData()`. `getDateRangeForMode()` traduit le mode en plage `[startDate, endDate]`, `prefetchData()` filtre les `valid_times` du `metaJson` dans cette plage et précharge chaque pas via `omFileReader.prefetchVariable()` (8 workers concurrents, annulable via `AbortController`). Sans `metaJson`/`modelRun` chargés, un toast d'avertissement s'affiche.

**Préchargement automatique des échéances voisines (#46).** `src/lib/neighbor-prefetch.ts`
s'abonne au store `time` (initialisé dans `+page.svelte`), debounce
`NEIGHBOR_PREFETCH_DEBOUNCE_MS` (400 ms), détecte le sens de navigation via les index
`valid_times` et précharge une fenêtre asymétrique (`computeNeighborWindow` : 3 devant /
1 derrière dans le sens, ±1 sur saut/premier chargement) de la variable affichée — et de
`variable2` si `layer2Enabled` — via `prefetchData()`. Un seul préchargement en vol
(`AbortController`, annulé à chaque nouveau changement). Les contours/flèches partagent la
variable principale → couverts sans requête dédiée. Remplace l'ancien préchargement
header-only du `postReadCallback` (`getNextOmUrls`, retiré).

**Décode anticipé des voisins (action 1, perf scrubbing).** Au-delà des octets chauffés par
`prefetchData()`, `triggerPrefetch` **décode** ensuite chaque échéance voisine via
`omProtocol({ url: 'om://' + getOMUrlFor(variable, neighborTime), type: 'json' }, …)` →
peuple `state.data` dans le `stateByKey` de l'instance partagée (`getProtocolInstance`,
rétention `MAX_STATES_WITH_DATA = 24`). Un saut ultérieur vers ce voisin réutilise la frame
décodée au lieu de refaire `setToOmFile` + décode. **L'URL est bâtie via le même
`getOMUrlFor(variable, timeOverride)` que la source MapLibre** (`'om://' + getOMUrl()`) : c'est
la condition pour que la clé du `stateByKey` matche — toute divergence de suffixe (dark,
vector, tile_size, hashes) ferait silencieusement échouer la réutilisation. `getOMUrlFor`
accepte un `timeOverride?: Date` (défaut = `get(time)`) pour construire l'URL d'une autre
échéance sans toucher au store. Quelles échéances décoder : `neighborTimesToDecode()` (fenêtre,
courante exclue, plus proche d'abord). Décode séquentiel, abortable, erreurs silencieuses.
**Impact mesuré** (Chrome réel, AROME France) : saut vers voisin décodé **~175 ms** vs frame
froide même fichier **~900-1700 ms**, 0 requête réseau. **Limite** : le décode anticipé
s'abonne à `time` seulement → un **changement de variable** ne le re-déclenche pas, donc le
1ᵉʳ pas d'heure après un changement de variable reste froid (puis se réchauffe).

## Domain allowlist (Infoclimat preset)

`MODEL_SELECTOR_GROUPS` in `src/lib/constants.ts` is the single source of truth for the
domain selector (`model-selector.svelte`): it declares the visible domains, their order,
their group, and their display label — French models first (issue #48). `DOMAIN_ALLOWLIST`
is **derived** from it (flattened domain values). The selector iterates this table directly;
it no longer relies on the package's `domainGroups` + `startsWith(group.value)` grouping
(which could not merge AROME HD / France / OM under one group). Labels are aligned onto
`domainOptions` via `applyModelSelectorLabels()` (`src/lib/model-selector-labels.ts`, called
in `stores/variables.ts`) so the trigger button and the dropdown agree. This is still
**display-only**: URLs sharing a non-listed domain resolve correctly. Add/reorder entries in
`MODEL_SELECTOR_GROUPS` to change the UI.

## Pseudo-domaines servis depuis le bucket R2

Certains domaines ne viennent pas d'Open-Meteo mais d'un bucket R2 (`VITE_MODELS_BUCKET_URL`, voir `getModelsBucketUrl()`) : ils sont listés dans `BUCKET_DOMAINS` (`src/lib/helpers.ts → getBaseUri()`) et enregistrés via un module dédié appelé depuis `stores/variables.ts`, **gated** sur la présence du bucket (invisibles dans le sélecteur sinon). Aujourd'hui : `anomaly_europe` (`anomaly-domain.ts`, layout `/anomaly/…` → resolver custom dans `om-protocol-settings.ts`), les cinq AROME-OM `arome_om_{reunion,antilles,guyane,ncaledonie,polynesie}` (`arome-om-domain.ts`, table data-driven `AROME_OM_TERRITORIES` — même modèle 0,025° et mêmes 12 variables de surface, ne diffèrent que par l'emprise ; grilles tirées de `infoclimat-pipelines/crates/core/src/grid.rs`), `arome_france_convection` (`arome-france-convection-domain.ts`) et `arome_france` (`arome-france-domain.ts`). Tous sauf l'anomalie utilisent le layout `data_spatial/{domain}/…` standard → resolver par défaut, aucune modif du protocole.

`arome_france_convection` (AROME France métropole, convection/orage) expose 9 variables avec colormaps dédiées dans `src/lib/color-scales/` (7 continues + 1 catégorielle partagée par `precipitation_type`/`precipitation_type_severe`, type `CategoricalColorScale` rendu par `components/scale/categorical-legend.svelte`). La variable affichée par défaut sur bascule de domaine est pilotée par `DOMAIN_DEFAULT_VARIABLES` (`constants.ts`), consultée par `matchVariableOrFirst()` (`metadata.ts`).

`arome_france` (AROME France métropole, **surface**) expose 12 variables standard Open-Meteo (`temperature_2m`, `relative_humidity_2m`, `dew_point_2m`, `wind_u_component_10m`, `wind_v_component_10m`, `wind_gusts_10m`, `pressure_msl`, `cloud_cover_low/mid/high`, `precipitation`, `precipitation_sum`) servies depuis le bucket maison — **pas de fallback Open-Meteo**. Même grille que `arome_france_convection` (1121×717 à 0,025°). Colormaps par défaut du package (`precipitation_sum` surchargé dans `standardColorScales`) ; le vent u/v est dérivé en vitesse/direction par le package (le `_v_component` est masqué par `variable-tabs.svelte`), donc aucune dérivation côté client. Dans le sélecteur, `arome_france` et `arome_france_convection` apparaissent sous le groupe « Météo-France Arome » défini par `MODEL_SELECTOR_GROUPS` (`constants.ts`) — voir le § _Domain allowlist_. Le groupe partagé `AROME_FRANCE_GROUP` (« AROME France (Infoclimat) ») poussé dans `domainGroups` par `ensureAromeFranceGroup()` (`arome-france-domain.ts`) n'est **plus consommé pour l'affichage** (vestige conservé, couvert par tests).

**`precipitation_type` / `precipitation_type_severe` masquées (à refactorer).** Ces deux variables sont **catégorielles** (codes producteur entiers) mais `@openmeteo/weather-map-layer@0.0.19` n'a pas de rendu catégoriel : le rasterizer échantillonne les données en **bilinéaire** (`grid.getLinearInterpolatedValue`) avant le LUT couleur, à la fois pour les tuiles et pour `getValueFromLatLong` (popup), et aucune option nearest-neighbor n'est exposée (`RenderOptions` n'a pas de type d'échelle `categorical`). Résultat : halos de catégorie parasite en lisière (une valeur interpolée entre deux codes éloignés tombe sur un code intermédiaire) et valeurs non entières au survol. En attendant une refacto / un correctif amont du package (échantillonnage NN + correspondance exacte → hors-code transparent, à porter dans le rasterizer worker **et** `getValueFromLatLong`), elles sont **masquées du sélecteur** via `HIDDEN_VARIABLES` (`constants.ts`), filtré dans `variable-tabs.svelte`. Masquage display-only : une URL partagée ciblant ces variables résout toujours (rendu avec l'artefact). La `precipitationTypeScale` (`color-scales/precipitation-type.ts`) et la légende catégorielle restent en place pour la reprise. Suivi : [issue #35](https://github.com/cmer81/maps/issues/35).

## Sondage vertical (Skew-T)

`src/lib/sounding/` implémente un sondage atmosphérique client-side en trois couches indépendantes :

1. **Lecture** (`column.ts`) — `fetchColumn()` instancie un `WeatherMapLayerFileReader`, appelle `setToOmFile()` une seule fois puis `readSimpleVariable()` pour chaque variable (température, humidité, vent U/V) sur une petite bbox autour du point cliqué, avec interpolation bilinéaire. On utilise `readSimpleVariable` (et non `readVariable`) pour récupérer les champs **bruts** : `readVariable` applique des règles de dérivation qui transforment les composantes de vent en vitesse+direction, alors que le sondage a besoin des U/V séparés. Le choix de `WeatherMapLayerFileReader` est délibéré : `getValueFromLatLong()` ne retourne la valeur que pour la variable actuellement rendue ; ici on lit les niveaux de pression indépendamment. Le cache bloc-byte du reader évite un re-téléchargement du `.om` (même mécanique que `src/lib/prefetch.ts`).
2. **Calcul** (`thermo.ts`, `parcel.ts`, `indices.ts`, `skewt-coords.ts`) — fonctions pures TypeScript sans dépendance au domaine : primitives Bolton/Magnus, adiabates, bulbe humide, parcelle SB & MU (LCL/LFC/EL), CAPE/CIN/LI, LPN/isothermie, cisaillement 0-1/0-3/0-6 km, et la transformation log-P + inclinaison du Skew-T.
3. **UI** (`src/lib/components/sounding/`) — panel tabulé réactif sur le scrubber de temps (debounce + jeton de génération pour annuler les fetch obsolètes).

La couche lecture est source-agnostique : `SOUNDING_LEVELS_BY_DOMAIN` dans `src/lib/constants.ts` mappe chaque domaine **source** vers ses niveaux de pression disponibles ; le domaine `arome_om_reunion` (Réunion) est anticipé dans la table mais pas encore exposé dans l'UI.

**Domaine affiché ≠ domaine source du sondage.** Certains domaines affichés ne diffusent pas eux-mêmes les niveaux de pression : `SOUNDING_SOURCE_BY_DOMAIN` redirige alors le sondage vers un autre domaine sur **la même grille**. Aujourd'hui `arome_france` (pseudo-domaine surface, bucket maison Infoclimat, 12 variables surface uniquement) → `meteofrance_arome_france0025` (AROME 0,025° d'Open-Meteo, grille identique 1121×717 @ 0,025°, 24 niveaux iso-pression). `soundingSourceDomain()` résout la redirection (identité par défaut) ; `isSoundingDomain()` et `soundingLevelsForDomain()` raisonnent sur la source. Quand la source diffère de l'affiché, `column.ts → doFetchColumn()` lit le run de la source via son propre `latest.json` (`fetchSoundingSourceRun()` — le store `modelRun` ne porte que le run de l'affiché) et bâtit l'URL `.om` avec `buildSoundingOmUrl()` (`helpers.ts`) sur la grille de la source. Ajouter un nouveau domaine : éditer `SOUNDING_LEVELS_BY_DOMAIN` (s'il porte ses niveaux) ou `SOUNDING_SOURCE_BY_DOMAIN` (s'il faut rediriger), rien d'autre.

Le bouton « Sondage vertical » du popup n'est affiché que si `isSoundingDomain(domaine)` (domaine dont la **source** est listée dans `SOUNDING_LEVELS_BY_DOMAIN` — AROME 0,025° en direct, ou `arome_france` via sa redirection) **et** si le toggle persisté `soundingButtonEnabled` (réglages → `sounding-settings.svelte`) est activé. Sur les autres modèles le bouton est masqué (`display:none` dans `updatePopupContent`).

## infoclimat-om-worker integration

The worker URL (`getOmWorkerUrl()`, read from `VITE_OM_WORKER_URL` at build time or `/runtime-config.js` for Docker runtime templating) backs the basemap tile-proxy (`map-controls.ts`). When the URL is unset, that feature is disabled.
