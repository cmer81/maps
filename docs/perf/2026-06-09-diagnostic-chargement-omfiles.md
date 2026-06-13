# Diagnostic — chargement & fluidité des OMfiles

> Mesures réalisées le 2026-06-09 sur build de production, avant toute optimisation.
> Aucun code modifié : ce document est le livrable de la phase de diagnostic.

## TL;DR

Le réseau n'est **pas** le goulot en usage courant : un changement d'heure coûte ~750 ms
**même avec 0 requête réseau et tous les octets en cache**. Le coût dominant est
`setToOmFile` (~450 ms) dans `@openmeteo/file-reader` : les **métadonnées du fichier
(HEAD + trailer + arbre de variables) sont relues séquentiellement à chaque pas de temps**
et ne sont jamais cachées. Le décode WASM, suspect habituel, ne coûte que **20-30 ms**.
Le réseau ne domine que le **chargement initial à froid** (10,2 s en 4G, dont ~3,5 s de
lectures de blocs sérialisées RTT par RTT).

## Méthodologie

- Build de **prod** (`npm run build` + `vite preview`, COOP/COEP actifs), Chrome headless
  piloté par CDP (Puppeteer), profil navigateur vierge par run.
- Instrumentation temporaire (entièrement annulée depuis) :
  - timing par requête du protocole `om://` (wrapper autour de `omProtocol` dans `+page.svelte`) ;
  - journal du store `loading` (true au `update()` → false au commit du groupe = donnée visible,
    fade raster 2 ms donc commit ≈ visible) ;
  - marqueurs de phase injectés dans les bundles `weather-map-layer`/`file-reader`
    (`ensureData`, `setToOmFile`, `OmFileReader.create`, `count()`, `readInto`, boucle de décode) ;
  - capture réseau CDP (toutes requêtes, y compris workers), profil CPU V8 main-thread,
    micro-bench CacheStorage in-page.
- Domaine mesuré : `arome_france` (défaut de l'app, bucket R2 `s3.cmer.fr`, grille 1121×717,
  ~800 K floats par frame). Deux conditions réseau : fibre locale et 4G émulée
  (10 Mbps down / 80 ms RTT via `Network.emulateNetworkConditions`).

### Caveats

- Rendu logiciel SwiftShader en headless (upload GPU non représentatif — mais le goulot
  mesuré est ailleurs, en amont du GPU).
- DPR=1 donc `tileSize` 512 ; un écran retina passe à 1024 → rasterisation ×4 par tuile,
  non mesurée ici.
- Machine 32 cœurs ; variante émulée 8 cœurs testée : résultats identiques.

## Mesures

### Scénario (a) — chargement initial à froid

| Condition                      | Première donnée affichée | Décomposition                                                                                                                                                                                               |
| ------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fibre                          | **2,6 s**                | ~1,0 s boot (JS + MapLibre + WASM, _aucune_ requête `.om` avant) + ~1,45 s `ensureData` (méta + ~30 blocs de 64 KB) + 0,15 s rasterisation                                                                  |
| 4G (10 Mbps / 80 ms)           | **10,2 s**               | 1ʳᵉ requête `.om` à **+6,7 s** (assets app + basemap d'abord) puis ~3,5 s de blocs en **~16 vagues séquentielles de ~3 requêtes** (RTT-bound), 49 req / 2,8 MB au total (frame affichée + prefetch voisins) |
| Reload à chaud (caches pleins) | **1,6 s**                | boot incompressible + pipeline                                                                                                                                                                              |

### Scénario (b) — changement unitaire (heure / variable)

| Action                                             | e2e (fibre) | e2e (4G)   | Réseau           |
| -------------------------------------------------- | ----------- | ---------- | ---------------- |
| Heure +1 (octets préchargés par neighbor-prefetch) | 720-760 ms  | 720-760 ms | 1-3 req (~63 KB) |
| Variable → precipitation (même fichier `.om`)      | 822 ms      | 795 ms     | **0 requête**    |

→ **Identique fibre vs 4G** : le neighbor-prefetch sort le réseau du chemin critique ;
les ~750 ms sont du pipeline pur.

### Scénario (c) — scrubbing

| Cas                                                 | ms/frame                                                 |
| --------------------------------------------------- | -------------------------------------------------------- |
| Avant (octets en cache, données à décoder)          | 580-750 (moy. ~583 ; min 275 quand l'état décodé survit) |
| Arrière (données décodées en mémoire, `stateByKey`) | **265-307** — plancher du pipeline actuel                |

### Décomposition d'un pas de temps (~750 ms, octets 100 % en cache)

| Phase                                  | Durée           | Détail                                                                                                                                                                                                                                                |
| -------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`setToOmFile`**                      | **~420-460 ms** | HEAD (`count()`/`fetchMetadata`) ≈ 70-220 ms — jamais caché, refait pour chaque fichier (nouveau `OmHttpBackend` par pas, le block cache ne couvre pas les HEAD) ; puis lectures **séquentielles** trailer → arbre de variables ; + délais event-loop |
| `readVariable` (décode)                | **20-30 ms**    | 674 itérations de chunks, WASM cumulé ≈ 0 ms, prefetch interne 4-6 ms                                                                                                                                                                                 |
| Ordonnancement MapLibre + slot-manager | ~155 ms         | TileJSON → couverture → dispatch des tuiles aux workers                                                                                                                                                                                               |
| Rasterisation (12 tuiles, WorkerPool)  | ~130 ms (span)  | insensible à 8 vs 32 cœurs                                                                                                                                                                                                                            |

## Goulot dominant par scénario

- **(a) froid** : le réseau — surtout en mobile : assets de l'app d'abord, puis la
  **sérialisation des lectures de blocs 64 KB** (un aller-retour par vague).
- **(b) unitaire** : `setToOmFile` — métadonnées par fichier refaites à chaque pas
  (~60 % du coût), puis pipeline tuiles MapLibre (~280 ms incompressibles aujourd'hui).
- **(c) scrub** : idem (b) pour les frames jamais décodées ; pour les frames déjà
  décodées, le pipeline tuiles (~280 ms) est le plancher.

## Fausses pistes écartées par la mesure

- **Décode WASM** : 20-30 ms wall. (La mesure précédente de ~15 ms de _blocage_
  main-thread reste vraie, mais mesurait autre chose ; le wall time s'avère lui aussi
  négligeable.)
- **IO CacheStorage** : 30 blocs lus en 21 ms séquentiel / 10 ms parallèle.
- **Taille de bloc du cache** (64 → 256 → 1024 KB) : aucun effet sur le scénario (b).
  (Effet attendu uniquement sur le cold load réseau lent — non re-testé.)
- **Latence S3/R2** : GET range ≈ 25-90 ms, parallélisme correct — sain.
- **Nombre de cœurs** (8 vs 32) : aucun effet.
- **Cross-fade raster** : déjà établi à 2 ms (cf. diagnostic précédent), non re-testé.

## Plan d'action priorisé (impact/effort)

1. ~~**Décode anticipé des voisins** — `src/lib/neighbor-prefetch.ts`.~~ **✅ FAIT (2026-06-10).**
   Le prefetch ne chauffait que les _octets_ ; `triggerPrefetch` appelle désormais en plus
   `omProtocol({url: 'om://…', type: 'json'}, abortController, get(omProtocolSettings))`
   pour les URLs voisines, ce qui peuple `state.data` dans le `stateByKey` du protocole (même
   identité de `settings` → même instance ; rétention `MAX_STATES_WITH_DATA = 24`). L'URL
   voisine est bâtie via `getOMUrlFor(variable, timeOverride)` — **même chemin que la source
   MapLibre** → clé `stateByKey` identique (condition de la réutilisation).
   **Impact mesuré (Chrome réel, AROME France, `terrain=true`)** : saut vers voisin décodé
   **~172-175 ms** (reproductible sur 2 variables), 0 requête réseau ; vs frame froide même
   fichier **~900-1700 ms**. Mieux que la cible ~280 ms. **Limite** : le décode anticipé
   s'abonne à `time` seulement → un changement de **variable** ne le re-déclenche pas (le 1ᵉʳ
   pas d'heure après un changement de variable reste froid, puis se réchauffe) — recoupe
   l'action 2.

2. ~~**Supprimer les métadonnées par pas** — upstream `file-reader`.~~ **✅ FAIT (2026-06-10).**
   Le HEAD par pas vit dans `@openmeteo/file-reader` (`OmHttpBackend.fetchMetadata`),
   **pas** dans `weather-map-layer`. Forké → `cmer81/typescript-omfiles`, branche
   `perf/cache-head-metadata` (2 commits). Deux leviers, tous deux livrés :
   - **(a) Cache HEAD par URL** (`fda6f50`) : un cache statique borné mémorise
     fileSize/lastModified/eTag par URL → plus de HEAD sur une URL déjà vue.
   - **(b) Trailer en suffix-range** (`66003be`) : `getTrailer()` lit les N derniers
     octets via `Range: bytes=-N` et déduit fileSize du `Content-Range` → trailer + taille
     en **une** requête, sans HEAD, dès la 1ʳᵉ lecture. Repli HEAD si le serveur n'envoie
     pas `Content-Range`.
     **Mesuré (Chrome réel, cache vidé)** : changement de variable → **0 HEAD** (a) ;
     1ʳᵉ lecture d'un fichier neuf → **0 HEAD + 1 suffix-range** au lieu de HEAD + lecture
     trailer (b) ; re-visite / 2ᵉ accès → 0 requête de métadonnée. **Le HEAD est éliminé sur
     tous les chemins.** R2/S3 confirmé : `206` + `Content-Range … /total` + `accept-ranges`.
     **Consommation maps** : `overrides` `@openmeteo/file-reader` → `file:` local (force aussi
     weather-map-layer). ⚠️ **Local uniquement, non committé** : la CI de maps ne résout pas
     ce chemin — stratégie de publication (npm / gitpkg / vendor) à trancher avant merge.

3. **Cold load mobile** : (i) lancer la 1ʳᵉ requête `.om` plus tôt (elle part aujourd'hui
   après tout le boot : +1,4 s fibre, +6,7 s 4G) — préconnect + déclenchement dès
   `latest.json` connu ; (ii) réduire les allers-retours de blocs (lectures contiguës
   plus grosses côté reader, upstream).
   **Impact : 4G ~10 s → ~5-6 s. Effort : moyen. Risque : modéré (ordre d'init).**

4. **Plancher ~280 ms du pipeline tuiles** : coût structurel TileJSON → tuiles →
   `sourcedata` → commit. Le vrai levier est le **POC WebGL CustomLayer déjà spécé**
   (`docs/superpowers/specs/2026-06-08-rendu-shader-webgl-poc-design.md`) : une frame
   décodée devient un upload de texture + draw (~quelques ms) au lieu de 12
   rasterisations + cycle source MapLibre. À prioriser après 1+2 si l'objectif « Windy »
   est confirmé.

Les actions 1 et 2 combinées ramèneraient le scrub avant à ~280 ms/frame et un saut
direct à ~300-400 ms, sans toucher au rendu.
