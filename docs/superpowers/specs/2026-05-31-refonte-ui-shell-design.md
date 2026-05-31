# Refonte du shell UI — Open-Meteo Maps (Infoclimat)

**Date :** 2026-05-31
**Branche :** `feat/refonte-ui-shell`
**Périmètre :** refonte de la couche de présentation, moteur préservé (retouches opportunistes autorisées)

## Objectif

Rendre l'interface fluide et élégante pour **deux publics dans une même app** :

- **l'amateur** — veut du simple : une carte, une variable météo, le temps qui défile ;
- **le passionné Infoclimat** — veut tout : modèles, niveaux de pression, sondage, overlays, export.

Contraintes : diffusion à grande échelle, usage **mobile et desktop**, design **moderne et élégant** tout en gardant l'**esprit Infoclimat** (bleu `#0d47a1`). Aucune fonctionnalité existante ne doit être perdue.

## Décisions de conception (validées en brainstorming)

| Décision                              | Choix retenu                                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modèle d'usage                        | **Interface adaptative (progressive disclosure)** — une seule UI, épurée par défaut, qui déplie la complexité à la demande. Pas de switch « simple/expert ».         |
| Couche essentielle (toujours visible) | Variable · Temps + lecture · Légende · Modèle                                                                                                                        |
| Ossature desktop                      | **Barre haute** (type Windy) : modèle + onglets variables imagés + capture + accès avancé ; **rail droit** pour l'avancé ; **barre de temps** en bas.                |
| Ossature mobile                       | **« Tout en bas »** : modèle en pastille haute ; dock bas (variables défilantes + temps) atteignable au pouce ; `•••` → feuille avancée ; FAB capture.               |
| Direction visuelle                    | **Verre dépoli raffiné** (panneaux translucides + flou), bleu Infoclimat socle, **scrim de contraste obligatoire**.                                                  |
| Capture (export PNG)                  | **Action de 1er niveau** (desktop : bouton barre haute ; mobile : FAB), avec **enchaînement partage** (Web Share API mobile / télécharger + copier le lien desktop). |
| Variables                             | **Onglets imagés directs** dans la barre haute + `＋` ouvrant la liste catégorisée complète.                                                                         |
| Taxonomie des catégories              | Température · Précipitations · Vent · Nuages · Pression/altitude · `＋` (autres).                                                                                    |
| Périmètre moteur                      | Shell UI uniquement ; moteur intact ; **retouches moteur opportunistes** autorisées (ex. sortir les `IControl` du `addControl` MapLibre).                            |

## Architecture

### Principe directeur

Le **moteur de rendu et la logique métier restent inchangés**. La refonte remplace la **couche de présentation** : les nouveaux composants lisent/écrivent **les mêmes stores Svelte** que l'UI actuelle. Le flux de données (subscriptions, `changeOMfileURL()`, slot-manager) n'est pas modifié.

**Préservé tel quel :** protocole `om://`, `slot-manager.ts`, `layers.ts`, `playback-renderer.ts`, `png-export.ts`, `popup.ts`, sondage (`src/lib/sounding/`), overlays (`labels-layer.ts`, `departments-layer.ts`), tous les stores, `url.ts`, `metadata.ts`.

### Retouche moteur opportuniste — IControl → composants Svelte

Aujourd'hui 7 boutons sont ajoutés via `$map.addControl(...)` dans `+page.svelte` : `DarkModeButton`, `SettingsButton`, `HelpButton`, `ClippingButton`, `HillshadeButton`, `LabelsButton`, `DepartmentsButton`. Ces boutons ne font (pour la plupart) que basculer un store.

**Changement :** ils sortent du mécanisme `IControl` MapLibre et deviennent des **toggles/boutons Svelte** dans le nouveau chrome (barre haute / rail / feuille), bindés aux **mêmes stores**. La logique de toggle est conservée à l'identique ; seul le point de montage change. Cela supprime l'empilement d'icônes non labellisées et permet de les regrouper sémantiquement.

> Note : si un `IControl` porte de la logique non triviale (ex. `ClippingButton` initialise TerraDraw), cette logique est déplacée dans le composant Svelte correspondant sans la réécrire.

### Nouveaux composants (sous `src/lib/components/`)

| Composant                      | Rôle                                                                                                                                            | Réutilise                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `chrome/app-chrome.svelte`     | Conteneur responsive : choisit barre haute (desktop) vs dock (mobile) selon le store `desktop`. Monte le scrim.                                 | store `desktop`                                                         |
| `chrome/top-bar.svelte`        | Barre haute desktop : logo, modèle, onglets variables, bouton capture, déclencheur avancé.                                                      | logique domaine de `variable-selection.svelte`                          |
| `chrome/mobile-dock.svelte`    | Dock bas mobile : pastille modèle, onglets variables défilants, barre temps, FAB capture, `•••`.                                                | idem                                                                    |
| `chrome/variable-tabs.svelte`  | Onglets imagés par catégorie + `＋` → liste catégorisée complète (popover/sheet). Sous-sélecteur de niveau de pression affiché quand pertinent. | `variableOptions`, `levelGroupsList`, i18n `variables-fr.ts`            |
| `chrome/model-selector.svelte` | Sélecteur de modèle (domaine).                                                                                                                  | popover domaine existant + `DOMAIN_ALLOWLIST`                           |
| `chrome/advanced-panel.svelte` | Rail droit (desktop) / feuille glissable (mobile) avec 3 familles : Calques / Réglages / Outils.                                                | composants `settings/*` + `wind-overlay`, `secondary-layer`, `clipping` |
| `chrome/scrim.svelte`          | Dégradés sombres haut/bas garantissant le contraste du texte verre sur carte claire.                                                            | —                                                                       |
| `capture/capture-flow.svelte`  | Bouton capture → cadrage carré → export PNG → **étape partage**.                                                                                | `png-export.ts`, `exportFrameVisible`                                   |

**Restyle (pas de réécriture logique) :** `scale/scale.svelte` (légende), `time/time-selector.svelte` + `time/playback-panel.svelte` (barre de temps), au style verre.

### Nouveau module pur

`src/lib/variable-categories.ts` — table de correspondance `variable → catégorie` (Température, Précipitations, Vent, Nuages, Pression/altitude, Autres) + fonction `categorize(variable)`. Pur, testable.

### Migration des réglages (12 sections → 3 familles)

| Famille                             | Contenu                                                                                      | Source actuelle                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Calques carte** (toggles rapides) | Vent (overlay), Flèches, Contours, Valeurs, Départements, Relief, Calque secondaire, Opacité | `wind-overlay-panel`, `arrows-settings`, `contour-settings`, `LabelsButton`, `DepartmentsButton`, `HillshadeButton`, `secondary-layer-panel`, `opacity-setting` |
| **Réglages** (préférences)          | Unités, Grille, Popup, Qualité (taille tuiles), Sondage, Mode sombre, Cache, Réinitialiser   | `unit-settings`, `grid-settings`, `popup-settings`, `tile-size-settings`, `sounding-settings`, `DarkModeButton`, `cache-settings`, `state-settings`             |
| **Outils** (actions)                | Découpe pays, Aide                                                                           | `clipping-panel` / `ClippingButton`, `help-dialog` / `HelpButton`                                                                                               |

> La **capture** quitte « Outils » pour devenir une action de 1er niveau (voir ci-dessous).

### Flux capture → partage

1. L'utilisateur clique « 📷 Capturer » (barre haute) ou le FAB (mobile).
2. Ouverture du **cadrage carré** existant (`exportFrameVisible`, overlay déjà dans `+page.svelte`).
3. Export PNG via `png-export.ts` (filigrane Infoclimat conservé).
4. **Nouvelle étape partage :**
   - **Mobile** : `navigator.share({ files: [png] })` (Web Share API niveau 2) si disponible.
   - **Desktop / fallback** : téléchargement du PNG + bouton « Copier le lien » (URL d'état de la carte, déjà encodée par `url.ts`).

## États & accessibilité

- **Contraste (critère d'acceptation)** : scrim adaptatif → texte/contrôles ≥ 4.5:1 sur toute zone de carte (clair comme sombre). À vérifier en mode clair sur fond de carte clair.
- **Chargement** : `Spinner` existant + skeleton pour la légende/onglets si `metaJson` non chargé (équivalent `variable-selection-empty`).
- **Vide** : message si aucune variable/donnée.
- **Capture échouée** : toast d'erreur (svelte-sonner déjà en place) + chemin de récupération.
- **Partage indisponible** : fallback téléchargement silencieux, pas d'erreur bloquante.
- **Touch targets** ≥ 44 px (dock mobile, FAB, onglets).
- **`prefers-reduced-motion`** respecté sur toutes les transitions.
- **Mode sombre** : parité de contraste testée indépendamment du mode clair.
- **Navigation clavier** + `aria-label` sur tous les contrôles (les anciens boutons icône-seule gagnent des libellés).

## Phasage (l'app reste fonctionnelle à chaque étape)

1. **Shell & responsive** — `app-chrome.svelte` + `scrim.svelte`, bascule desktop/mobile via store `desktop`. Monté dans `+page.svelte` à la place du chrome actuel, sans encore tout déplacer.
2. **Couche essentielle** — `top-bar` / `mobile-dock`, `model-selector`, `variable-tabs` (+ `variable-categories.ts`), légende et barre de temps restylées.
3. **Panneau avancé** — `advanced-panel` regroupant Calques / Réglages / Outils ; conversion des 7 `IControl` en toggles Svelte.
4. **Capture → partage** — `capture-flow.svelte` promu en 1er niveau + étape partage.
5. **Polish** — animations 150–300 ms, easing entrée/sortie, `prefers-reduced-motion`, contraste AA, parité mode sombre, revue clavier/lecteur d'écran.

## Tests

Conforme à la convention du repo (`src/lib/tests/**`, Vitest sur logique pure) :

- `variable-categories.ts` — catégorisation correcte, fallback « Autres », niveaux de pression.
- Logique responsive (sélection desktop/mobile) si extraite en helper pur.
- L'UI elle-même : validation visuelle manuelle (desktop 1440/1024, mobile 375 + paysage), conforme à l'absence de tests de composants dans le repo actuel.

## Hors périmètre (YAGNI)

- Pas de mode « simple/expert » explicite (progressive disclosure le rend inutile).
- Pas d'écran d'onboarding/choix de profil.
- Pas de réécriture du moteur de rendu, du sondage, du playback ou de `png-export`.
- Pas de nouvelle route (l'app reste single-page).
- Pas de refactor non lié au shell.

## Risques

- **Contraste verre sur carte claire** — atténué par le scrim ; à valider tôt (phase 1).
- **Densité de la barre haute desktop** si beaucoup de variables — atténué par onglets catégories + `＋`.
- **Conversion des `IControl`** — vérifier les effets de bord (ex. init TerraDraw du clipping, ordre de montage `on('load')`).
- **Parité mobile/desktop** des mêmes stores — un seul jeu de stores, deux présentations ; tester que les toggles restent synchronisés.
