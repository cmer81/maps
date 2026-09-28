# Implementation Plan : couleurs de précipitations alignées sur l'échelle Infoclimat

**Branch** : `001-lisibilite-cumuls-pluie` (nom attendu par les scripts speckit ; la branche git n'est pas encore créée, le travail se fait sur `main`)
**Date** : 2026-09-28
**Spec** : [spec.md](./spec.md)

**Input** : spécification de `specs/001-lisibilite-cumuls-pluie/spec.md` (Q1 = A, Q2 = B, Q3 = B).

> **Révision 3 (2026-09-28), changement de cap décidé après essai en local.** L'utilisateur trouve la palette dérivée d'Infoclimat moins jolie que l'ancienne rampe `maps`. Le besoin réel est de **différencier les paliers jusqu'à 600 mm**. Décisions :
>
> - une **seule échelle fixe**, de 0,2 à 600 mm (18 paliers), pour `precipitation`, `rain`, `showers` et `precipitation_sum` ;
> - la **rampe de l'ancienne échelle `maps`**, prolongée par magenta et violets, puis **lilas et blanc rosé** pour 500 et 600 mm (variante B). La variante A, qui finissait en violets foncés, avait ses trois derniers paliers indiscernables (ΔE00 6-8).
>
> **Abandonnés** : les paliers de bornes par durée (Q1), l'alignement sur les bornes et couleurs Infoclimat (Q3), le critère SC-002 reformulé et l'en-tête « Cumul N h ». **Conservés** : la classe 0 transparente (voile à H0 corrigé), les vignettes au dixième sans « 0 » en zone sèche (US4), la non-régression des autres couches (US5). Les sections ci-dessous sont gardées pour l'historique de la décision.

## Summary

On remplace les échelles de couleur de `precipitation`, `rain`, `showers` et `precipitation_sum` par une **palette dérivée de l'échelle de cumuls Infoclimat**.

**Palette**

- 17 classes, avec les bornes Infoclimat pour chaque durée (1, 3, 6, 12, 24, 48 et 72 h), en aplats opaques.
- Une classe 0 transparente, qui corrige le voile actuel à H0.
- 9 couleurs sur 17 sont identiques à Infoclimat, 6 sont légèrement retouchées (ΔE00 ≤ 3,6), et 2 sont franchement modifiées : les rangs 2 et 3, pour supprimer l'inversion aux faibles cumuls.

**Choix de l'échelle**

- L'échelle suit l'échéance pour le cumul du run, et le pas de temps pour les variables par pas.
- Le palier est transmis par un paramètre de rendu `precip_tier` dans l'URL `om://`, que lit `customResolveRequest`.
- **Aucune modification du fork.**

**Légende et vignettes**

- La légende affiche le palier courant.
- Les vignettes « Valeurs » des précipitations passent au dixième de mm sous 10 mm, et les valeurs < 0,05 mm sont masquées.

**Constat de la Phase 0.** Le critère « clarté monotone » de la spec est **infaisable** avec les familles de teinte Infoclimat (research R1). Un critère reformulé est reporté dans la spec. **Il a été validé le 2026-09-28.**

## Technical Context

- **Language/Version** : TypeScript 5 / Svelte 5 (runes), SvelteKit en export statique (`adapter-static`).
- **Primary Dependencies** : MapLibre GL, `@openmeteo/weather-map-layer` (fork `@cm3r/weather-map-layer@0.2.0`, **non modifié**), `svelte-persisted-store`, Tailwind v4 / shadcn-svelte.
- **Storage** : aucun nouveau. `customColorScales` (localStorage) est inchangé dans sa forme.
- **Testing** : Vitest (environnement `node`, `src/lib/tests/**`), logique pure et expressions MapLibre évaluées hors carte. La validation visuelle suit le guide [quickstart.md](./quickstart.md).
- **Target Platform** : navigateurs modernes, ordinateur et mobile, plus la WebView Android (pas de SharedArrayBuffer ; aucun impact ici).
- **Project Type** : application web statique côté client.
- **Performance Goals** : aucun surcoût mesurable. Le choix du palier est O(1) par requête (recherche dans `valid_times` : O(n), avec n ≤ 250). Aucune requête réseau supplémentaire, et le cache de décode est inchangé (`precip_tier` n'est pas un paramètre « data »).
- **Constraints** :
  - pas de modification du fork ;
  - rendu identique pour les variables hors périmètre ;
  - aucun paramètre d'URL public ajouté ni cassé.
- **Scale/Scope** :
  - 4 variables, 7 paliers, 1 palette ;
  - environ 8 fichiers modifiés et 1 à 2 fichiers nouveaux dans `src/lib`, plus les tests et la documentation.

**Vérifications résiduelles** (ce ne sont pas des NEEDS CLARIFICATION : chacune a un repli défini)

- **V1** : ✅ critère validé et rang 2 pervenche retenu (2026-09-28). Il reste un contrôle visuel sur la carte réelle (quickstart Q5).
- **V2** : une valeur `precipitation` à pas de 3 h est-elle un cumul sur 3 h ? Repli : palier 1 h pour les variables par pas (research R5). À traiter en **première tâche**.

## Constitution Check

_GATE : à passer avant la Phase 0, et à revérifier après la Phase 1._

La constitution du projet (`.specify/memory/constitution.md`) n'est **pas renseignée** (gabarit). Les points de contrôle appliqués sont les règles durables du `CLAUDE.md` (research R10).

| Règle (`CLAUDE.md`)                                                                       | Avant Phase 0 | Après Phase 1                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fork : passer par `omProtocolSettings` avant de toucher à la lib                          | ✅ prévu      | ✅ `resolveRequest` + `colorScales` ; aucun changement du fork (R6)                                                                                 |
| Docs synchronisées dans la même livraison                                                 | ✅ prévu      | ✅ `architecture.md` (vignettes, obsolète), `stores.md` (nouveau store dérivé), `components.md` (légende), section Architecture du README si besoin |
| Runes Svelte 5 ; édition `.svelte` via l'agent `svelte-file-editor` et `svelte-autofixer` | ✅            | ✅ `scale.svelte` et `context-strip.svelte` seulement                                                                                               |
| Tests Vitest sur la logique pure                                                          | ✅            | ✅ C1, C3 et C4 testables en `node`                                                                                                                 |
| CI : `check`, `test`, `build`                                                             | ✅            | ✅ quickstart, étape Prérequis                                                                                                                      |
| Prettier (tabs, single quotes, tri des imports)                                           | ✅            | ✅ `npm run format`                                                                                                                                 |
| Titres de PR sémantiques                                                                  | ✅            | ✅ `feat(color-scales): …`                                                                                                                          |
| Autres couches préservées (spec FR-015)                                                   | ✅            | ✅ `resolveAppColorScale`, règle 3 = code actuel ; test de non-régression                                                                           |

**Résultat** : PASS. Aucune violation, donc pas de Complexity Tracking.

**Point d'attention (pas une violation)**

- La spec change sur un critère mesurable (SC-002, FR-006, A8), à cause de l'infaisabilité démontrée en R1.
- Le changement est tracé dans la spec et a été **validé par l'utilisateur** le 2026-09-28.

## Project Structure

### Documentation (this feature)

```text
specs/001-lisibilite-cumuls-pluie/
├── spec.md                 # spécification (amendée : SC-002 / FR-006 / A8)
├── diagnostic.md           # état des lieux maps + référence Infoclimat
├── plan.md                 # ce fichier
├── research.md             # Phase 0 : R1…R10
├── data-model.md           # Phase 1 : E1…E9
├── quickstart.md           # Phase 1 : scénarios Q0…Q7
├── contracts/
│   ├── precipitation-color-scale.md   # C1 module pur, C2 helper, C3 param om://, C4 vignettes
│   └── legend-ui.md                   # contrat d'affichage de la légende
├── research/
│   ├── palette_search.py              # recherche / optimisation de palette (stdlib)
│   ├── palette-candidate.json         # palette retenue + bornes par palier (source de vérité)
│   ├── palette-candidate.html         # nuancier clair / sombre
│   └── palette-candidate.txt
├── references/             # captures Infoclimat + delta-e.py
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/lib/
├── color-scales/
│   ├── precipitation-infoclimat.ts   # NOUVEAU : palette, bornes, tiers, accumulationHours, scale builder (C1)
│   ├── resolve.ts                    # NOUVEAU : resolveAppColorScale (C2)
│   └── precipitation-sum.ts          # SUPPRIMÉ (remplacé ; son commentaire « transparent » était faux, R3)
├── stores/
│   ├── om-protocol-settings.ts       # standardColorScales (paliers de référence E8) + customResolveRequest lit precip_tier
│   └── precipitation-tier.ts         # NOUVEAU : store dérivé precipitationTier (E7)
├── url.ts                            # getOMUrlFor ajoute &precip_tier (C3)
├── vector-styles.ts                  # format + filtre de visibilité des vignettes précipitations (C4)
├── layers.ts                         # vectorGridValuesLayer utilise les builders C4
├── popup.ts                          # resolveAppColorScale
├── watermark-details.ts              # resolveAppColorScale (légende d'export)
├── components/scale/scale.svelte     # légende : palier courant, en-tête « Cumul N h », entrée 0 masquée
├── components/chrome/context-strip.svelte  # resolveAppColorScale
└── tests/
    ├── precipitation-infoclimat.test.ts   # NOUVEAU : C1 (bornes, tiers, invariants ΔE00/L*, getColor)
    ├── vector-styles.test.ts              # + C4 (format, masquage, invariant d'espacement)
    ├── url-builder.test.ts                # + C3 (precip_tier, déterminisme timeOverride, perso → pas de param)
    ├── upstream-color-scales.test.ts      # + non-régression des échelles hors périmètre
    └── arome-france-color-scales.test.ts  # vérifier graupel_sum / snowfall_* inchangés

.claude/rules/architecture.md   # corriger la description obsolète des vignettes (décimation 2D, overlap) + precip_tier
.claude/rules/stores.md         # store precipitationTier
.claude/rules/components.md     # légende à paliers
```

**Structure Decision** : projet unique (SPA SvelteKit). Tout le code nouveau vit dans `src/lib/color-scales/` et `src/lib/stores/`, selon les conventions existantes (une échelle par fichier dans `color-scales/`, stores dérivés dans `stores/`). Aucune nouvelle route ni nouveau composant.

## Séquencement proposé (pour `/speckit-tasks`)

1. **V2** (quickstart Q0) : fixe la règle « par pas ».
2. **C1**, module pur et tests : palette tirée de `palette-candidate.json`, bornes, `tierForDuration`, `accumulationHours`, invariants.
3. **C3 + resolver**, puis `standardColorScales`, avec les tests d'URL. Suppression de `precipitation-sum.ts`.
4. **C2 + store `precipitationTier`**, puis migration des 4 sites d'appel. La légende affiche l'en-tête de palier.
5. **C4**, vignettes, avec les tests.
6. **Docs** `.claude/rules/*` et README.
7. **Validation** quickstart Q2 à Q7, puis test utilisateur (SC-003, SC-009).

Les étapes 2 à 4 livrent US1 à US3 (P1). L'étape 5 livre US4 (P2). US5 (P3) est couverte par les tests de non-régression de chaque étape.

## Complexity Tracking

Sans objet : aucune violation des règles du projet.
