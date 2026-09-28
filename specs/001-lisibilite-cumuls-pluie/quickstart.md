# Quickstart : validation de bout en bout

**Plan** : [plan.md](./plan.md)
**Contrats** : [contracts/](./contracts/)
**Modèle** : [data-model.md](./data-model.md)

## Prérequis

```bash
npm install
npm run check && npm run test -- --run && npm run build   # identique à la CI
npm run dev                                               # http://localhost:5173
```

Mesures de palette, indépendantes de l'app (Python 3, bibliothèque standard seule) :

```bash
cd specs/001-lisibilite-cumuls-pluie
python3 references/delta-e.py                                   # palette Infoclimat : L* et ΔE00 entre voisins
CLOSEST2_T=10 LMIN_LOW=70 NCAND=60 python3 research/palette_search.py 8 0 25 11 2,3,4   # régénère la candidate
```

## Q0 : vérification préalable V2 (bloquante)

Objectif : savoir si la valeur `precipitation` d'un fichier spatial à pas de 3 h est un cumul sur 3 h (research R5).

1. Choisir un run `dwd_icon` et une échéance 3-horaire (au-delà de la partie horaire), ainsi qu'un point où il pleut.
2. Lire la valeur spatiale en ce point (popup de l'app, variable `precipitation`).
3. Interroger l'API Open-Meteo (modèle `icon_global`, `hourly=precipitation`) au même point et pour le même run. Sommer les 3 heures qui précèdent l'échéance.
4. **Attendu** : les deux valeurs sont égales, à l'interpolation près. Sinon, appliquer le repli de R5 (palier 1 h pour toutes les variables par pas) et le noter dans `research.md`.

## Q1 : tests automatisés

```bash
npx vitest run src/lib/tests/precipitation-infoclimat.test.ts   # C1 : bornes, tiers, invariants de palette
npx vitest run src/lib/tests/vector-styles.test.ts              # C4 : format et masquage des vignettes, espacement
npx vitest run src/lib/tests/url-builder.test.ts                # C3 : precip_tier, déterminisme timeOverride
npx vitest run src/lib/tests/upstream-color-scales.test.ts      # non-régression des autres échelles
```

**Attendu** : tout vert. Les invariants ΔE00 et L* sont recalculés en test (SC-002 reformulé).

## Q2 : cohérence avec Infoclimat (SC-001)

1. `maps` : domaine AROME France HD, variable Précipitations, échéance horaire pluvieuse.
2. Ouvrir la légende. **Attendu** : 17 cases, « Cumul 1 h », bornes 1,5 · 2 · 2,5 · 3,5 · 4,5 · 6 · 8,5 · 10 · 15 · 20 · 30 · 40 · 50 · 70 · 95 · 125 · 150 mm.
3. Comparer avec l'échelle `radar1h.cpt` (diagnostic §2).
   - **Attendu** : bornes identiques.
   - **Attendu** : couleurs identiques, sauf pour les rangs 2, 3, 6, 7, 8, 9 et 11, qui sont documentés dans research R2.
4. Survoler un pixel à 4 mm, puis un pixel à 1 mm. **Attendu** : le pixel à 4 mm est dans la classe « ≥ 3,5 », et le pixel à 1 mm est transparent.

## Q3 : paliers du cumul du run (Q1 = A)

1. Choisir un domaine exposant `precipitation_sum` (AROME OM Réunion), puis lancer la lecture du run complet.
2. **Attendu** : l'en-tête de légende passe par « Cumul 1 h » → 3 h → 6 h → 12 h → 24 h → 48 h, aux échéances H+1, 3, 6, 12, 24 et 48.
   - Les bornes changent dans la même frame que la carte.
   - À H0, la carte est entièrement transparente (research R3, corrige le voile bleu actuel).
3. À H+18, **attendu** : « Cumul 24 h » (palier supérieur, A6).

## Q4 : variables par pas de temps

1. ECMWF IFS 0,25°, `precipitation` : **attendu** « Cumul 3 h » (si V2 est confirmée).
2. ICON : « Cumul 1 h » sur la partie horaire, puis « Cumul 3 h ». Vérifier aussi que `rain` et `showers` suivent la même échelle.
3. AROME HD 15 min : **attendu** « Cumul 1 h » (A2).
4. Neige en cm, `snowfall_water_equivalent`, `graupel_sum` : **attendu** une échelle inchangée par rapport à aujourd'hui.

## Q5 : lisibilité (SC-002, SC-003, SC-004)

1. Ouvrir `research/palette-candidate.html`, puis la carte d'un épisode intense, en thème clair et en thème sombre.
2. **Attendu**
   - Les faibles cumuls (rangs 1 à 4) ne paraissent pas plus « forts » que les rangs 12 à 17.
   - Deux classes voisines se distinguent à l'œil.
   - Le rang 2 est perçu comme « bleu » et non « violet » (V1).
3. Test utilisateur : panel d'au moins 5 personnes, 10 points par personne (SC-003).

## Q6 : vignettes « Valeurs » (US4, SC-005, SC-006)

1. Activer Réglages → Grille → Valeurs, sur un épisode pluvieux. Tester les zooms 5, 7, 9 et 11.
2. **Attendu**
   - Aucune vignette dans les zones sèches, ni pour les valeurs < 0,05 mm.
   - Valeurs < 10 au dixième, avec une virgule.
   - Valeurs ≥ 10 en entier.
   - Aucune vignette qui se chevauche.
   - Texte lisible sur les 17 couleurs, dans les deux thèmes.
3. Passer à Température. **Attendu** : les vignettes sont identiques à avant (entiers, densité inchangée).

## Q7 : non-régression (SC-008) et personnalisation (FR-016)

1. Captures avant/après de température à 2 m, vent, pression et nébulosité, sur 3 runs fixés. **Attendu** : identiques.
2. Personnaliser une couleur de la palette Précipitations. **Attendu** : la palette personnalisée s'applique à toutes les échéances, sans en-tête de palier.
3. Cliquer « Réinitialiser aux couleurs standard ». **Attendu** : retour à l'échelle Infoclimat par palier.
4. Export PNG. **Attendu** : la légende exportée montre la même échelle et le même palier que l'écran.
5. Couche secondaire (layer 2) réglée sur `precipitation`. **Attendu** : elle suit aussi les paliers.

---

## Résultats de validation (2026-09-28, branche `001-lisibilite-cumuls-pluie`)

| Scénario                                        | Résultat   | Détail                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prérequis (CI)                                  | ✅         | `npm run check` 0 erreur · `npx vitest run` 617/617 · `npm run build` OK · `eslint .` propre. `prettier --check` signale 3 fichiers **non modifiés par la feature** et déjà non conformes sur `main` (`src/lib/stores/units.ts`, `src/lib/variable-categories.ts`, `docs/superpowers/plans/…`), ainsi que l'outillage speckit non suivi (`.specify/`, `.claude/skills/speckit-*`). |
| Q0 : V2                                         | ✅         | Pas de 3 h = cumul sur 3 h (moyenne globale ×3,03 au passage 1 h → 3 h, ICON et ECMWF). Voir research « V2 — résultat ».                                                                                                                                                                                                                                                           |
| Q1 : tests                                      | ✅         | Module pur, resolver, URL, vignettes, non-régression.                                                                                                                                                                                                                                                                                                                              |
| Q2 : cohérence 1 h                              | ✅         | ICON 18Z : « Cumul 1 h », bornes 1,5 · 2 · 2,5 · 3,5 … 150 identiques à `radar1h.cpt`.                                                                                                                                                                                                                                                                                             |
| Q3 : paliers du cumul du run                    | ⚠️ partiel | Couvert par les tests (H+18 → 24h, H0, H96). **Non vérifié en lecture animée** : `precipitation_sum` (AROME OM, bucket Infoclimat) n'est pas accessible dans l'environnement local.                                                                                                                                                                                                |
| Q4 : variables par pas                          | ✅ / ⚠️    | ICON 21Z → `precip_tier=3h`, légende 2 → 250 mm ; AROME HD 15 min → 1h. ECMWF : non ouvert dans l'app (run par défaut en 404 en local, sans lien avec la feature), 3 h confirmé par V2.                                                                                                                                                                                            |
| Q5 : lisibilité                                 | ⚠️ partiel | Fond clair : faibles cumuls clairs, rang 2 perçu bleu. **Non vérifiés** : fond sombre, et épisode à très forts cumuls (rangs 12 à 17).                                                                                                                                                                                                                                             |
| Q6 : vignettes                                  | ✅ / ⚠️    | ICON z7 : dixièmes (« 0,1 » … « 9,8 »), entiers ≥ 10, zones sèches sans vignette, aucun chevauchement. Mesure pixel : sous la 1re borne, transparent. **Non vérifiés** : zooms 5, 9 et 11, fond sombre.                                                                                                                                                                            |
| Q7 : non-régression / perso / export / couche 2 | ✅ / ⚠️    | Température inchangée (vignettes entières, légende, pas d'en-tête, URL sans `precip_tier`), contrôle visuel sans diff pixel ; export PNG = même échelle que l'écran ; couche 2 : même `getOMUrlFor`, donc mêmes paliers. **Non cliqués** : personnalisation d'une couleur et « réinitialiser », couverts par les tests du resolver.                                                |

**Constat hors périmètre** (déjà présent avant la feature) : sur ordinateur, le bas de la légende dépliée passe sous la frise temporelle. Avec 18 cases, les libellés des deux premières bornes (« 1,5 », « 2 ») peuvent être masqués. Suivi à ouvrir.
