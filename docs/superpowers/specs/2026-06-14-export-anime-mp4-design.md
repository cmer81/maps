# Export vidéo animé (MP4) — design

**Date** : 2026-06-14
**Statut** : design validé, en attente de relecture utilisateur avant plan d'implémentation

## Problème

Des utilisateurs demandent un export **animé** pour partager une séquence météo sur les
réseaux sociaux. Aujourd'hui l'app sait exporter une **photo** (capture PNG 4:3/3:4 avec
watermark) et **animer** les pas de temps à l'écran (playback), mais ne sait pas produire
un fichier vidéo partageable.

Contrainte explicite : rester acceptable en performance côté utilisateur. Un temps de
préparation visible (barre de progression / overlay) est acceptable ; une dégradation de
qualité dépendante de la machine ne l'est pas.

## Décisions (arbitrages validés)

| Sujet                  | Décision                                                            | Raison                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Méthode de capture     | **Frame-par-frame déterministe** (pas MediaRecorder temps réel)     | Qualité identique sur toutes machines, zéro frame sautée ; le coût (temps de préparation) est rendu visible via un overlay |
| Plage exportée         | **Plage de lecture courante** (`prefetchMode`)                      | Cohérent avec le playback ; pas de nouvelle UI de bornes                                                                   |
| Format de sortie       | **MP4 H.264 (avc)**                                                 | Universel, accepté par X/Twitter, Instagram, WhatsApp                                                                      |
| Encodage               | **mediabunny** (au-dessus de WebCodecs)                             | `mp4-muxer` est déprécié ; mediabunny fait encodage + muxing, zéro dépendance, pas de ffmpeg.wasm 25 Mo                    |
| Cadrage                | **Réutiliser 4:3 / 3:4 existant** (`computeCaptureRect`, watermark) | Code déjà testé, cohérence visuelle avec la photo                                                                          |
| Cadence                | **Fixe ~10 fps**                                                    | Vidéo punchy (~2,5 s pour 24h), découplée du playback écran (1200 ms/frame)                                                |
| UI                     | **Bouton dédié + overlay de progression bloquant**                  | Isolé du flow photo ; interaction bloquée car la carte sert au rendu                                                       |
| Garde-fou plage longue | **Avertir, laisser passer**                                         | Liberté maximale ; l'utilisateur confirme si la vidéo est longue                                                           |
| Fallback codec         | **Aucun (pas de WebM)**                                             | WebM refusé par X/IG ; si H.264 indisponible → bouton désactivé + explication                                              |

## Vue d'ensemble

On rend hors-temps-réel chaque pas de temps de la plage courante, on compose chaque frame
(crop 4:3 + watermark daté) sur un canvas d'export, on la pousse dans mediabunny, puis on
finalise en MP4 partagé via le `share.ts` existant.

## Flux par frame

1. **Pré-chauffe** : `prefetchData()` sur toute la plage (réutilise l'existant, 8 workers
   concurrents) avant de démarrer la boucle → réduit l'attente d'idle par frame.
2. Pour chaque pas `date` de la plage (bornes dérivées de `prefetchMode`, comme le
   playback) :
   - `engine.advance(date)` (réutilise le moteur playback) → met à jour le store `time`,
     recharge les couches.
   - **Attendre le commit** du `SlotManager` (via `slotEvents` / `waitForIdle`) → la frame
     est réellement rendue dans le canvas MapLibre.
   - **Composer** sur le canvas d'export (1440×1080 paysage ou 1080×1440 portrait) :
     `computeSourceCrop` + `drawImage(mapCanvas, …)`, puis `drawWatermark(ctx, details,
dims)` avec des `details` **reconstruits pour cette `date`** → l'horodatage défile.
   - `await canvasSource.add(i / fps, 1 / fps)` (fps = 10).
   - `onProgress(i, total)`.
3. `await output.finalize()` → `output.target.buffer` → `Blob('video/mp4')` → `share.ts`
   (Web Share fichiers si dispo, sinon download).
4. **Restaurer le `time` initial** de l'utilisateur (la boucle a modifié le store).

## API mediabunny (ancrage)

```ts
import {
	BufferTarget,
	CanvasSource,
	Mp4OutputFormat,
	Output,
	QUALITY_HIGH,
	getFirstEncodableVideoCodec
} from 'mediabunny';

// Détection au montage du bouton :
const fmt = new Mp4OutputFormat();
const codec = await getFirstEncodableVideoCodec(fmt.getSupportedVideoCodecs(), {
	width,
	height
});
// codec === null → H.264 indisponible → bouton désactivé.

// Export :
const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
const source = new CanvasSource(exportCanvas, { codec: 'avc', bitrate: QUALITY_HIGH });
output.addVideoTrack(source);
await output.start();
// pour chaque frame : redessiner exportCanvas, puis :
await source.add(i / fps, 1 / fps);
await output.finalize();
const blob = new Blob([output.target.buffer], { type: 'video/mp4' });
```

## Découpage en modules

- **`src/lib/video-export.ts`** _(nouveau)_ — orchestrateur. Fonction
  `exportAnimation({ map, range, fps, onProgress, signal })` : boucle frames, gère
  `Output`/`CanvasSource`, propage `onProgress`, respecte `AbortSignal`, restaure le `time`
  initial dans un `finally`. Renvoie un `Blob`.
- **`src/lib/png-export.ts`** _(refactor léger)_ — extraire le dessin du watermark en
  `drawWatermark(ctx, details, dims)` réutilisable (sans `toBlob`). Le PNG existant et la
  vidéo le partagent → un seul rendu de watermark à maintenir. La sortie PNG actuelle ne
  doit pas changer.
- **`src/lib/capture-geometry.ts`** — réutilisé tel quel (`computeCaptureRect`,
  `computeSourceCrop`).
- **`src/lib/playback-renderer.ts`** — étendu : `renderFrameAt(date)` = avance + attend le
  commit (réutilise `waitForIdle` / `slotEvents`).
- **`src/lib/components/capture/video-export-flow.svelte`** _(nouveau)_ — bouton dédié +
  overlay modal bloquant (barre `frame N / total`, bouton **Annuler**, avertissement si
  `total` dépasse le seuil). Détection de support au montage → état désactivé + tooltip si
  `codec === null`.
- **`src/lib/share.ts`** — réutilisé tel quel (Web Share fichiers + fallback download).

## Garde-fous

- **Plage longue (« Run complet », 240+ frames)** : si `total > SEUIL` (ex. 60), l'overlay
  affiche un avertissement (« vidéo longue, ~Xs de préparation ») avant lancement.
  L'utilisateur peut confirmer et exporter quand même (**avertir, laisser passer**).
- **Annulation** : `AbortController` stoppe la boucle de frames, annule le `prefetch`, et
  libère l'`Output` mediabunny.
- **Restauration d'état** : `try/finally` restaure le `time` initial à la fin **et** en cas
  d'annulation/erreur.
- **Idle timeout par frame** : réutiliser le timeout existant (`PRERENDER_FRAME_TIMEOUT_MS`,
  10 s) comme filet de sécurité par frame, pour ne pas bloquer indéfiniment sur réseau lent.

## Tests (Vitest)

- **`video-export`** : la boucle appelle `source.add` `N` fois avec les bons timestamps
  (`i / fps`) ; respecte `abort` (s'arrête, ne finalise pas) ; restaure le `time` initial
  dans tous les cas (succès, annulation, erreur).
- **`drawWatermark`** : non-régression du rendu partagé — la sortie PNG existante reste
  identique après extraction de la fonction.
- **Détection de support** : branche `codec === null` → état désactivé du bouton.

## Hors périmètre (YAGNI)

- Ratios sociaux dédiés (1:1, 9:16) — réutilisation du 4:3/3:4 seulement.
- Cadence réglable par l'utilisateur — valeur fixe 10 fps.
- Sélecteur de bornes début/fin — la plage suit `prefetchMode`.
- Piste audio, fallback WebM, encodage GIF.

## Points à trancher dans le plan

- Valeur exacte du seuil d'avertissement (`SEUIL`) et du bitrate (au-delà de `QUALITY_HIGH`).
- Faut-il afficher une estimation de durée de préparation, et comment l'estimer.
- Placement précis du bouton dédié dans le chrome bas vs à côté du bouton capture photo.
