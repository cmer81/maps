# Allègement du menu « Flèches de vent » + fallback du mode « selon la variable affichée »

**Date** : 2026-06-12
**Statut** : design validé, en attente de relecture

## Contexte

Suite à la PR de découplage contours/flèches d'overlay vent (`maps#82`), un utilisateur a remonté deux retours sur le calque « Flèches de vent » (`src/lib/components/settings/arrows-settings.svelte`) :

1. Le réglage **« Style des flèches »** (grille de 7 niveaux de vitesse × couleur/opacité/largeur, ~45 lignes de DOM) alourdit le menu pour une utilité réduite.
2. La bascule **« Selon la variable affichée »** ne montre **aucune flèche** quand la variable affichée est une `temperature_2m`.

Deux sujets indépendants traités dans le même changement car ils touchent le même composant.

## Diagnostic

### Sujet 1 — charge visuelle du style

`arrows-settings.svelte` empile, dès que les flèches sont activées : toggle + sélecteur de niveau + **grille de style (7 niveaux)**. La grille est de loin le bloc le plus volumineux. Le style est persisté en **localStorage uniquement** (`arrowStyle`, `stores/vector-styles.ts`) — **jamais partagé par URL** : c'est de la personnalisation cosmétique locale.

### Sujet 2 — mode « selon la variable affichée »

Le mode `'displayed'` (`windOverlayEnabled = false`) rend les flèches via le **`vectorManager`**, qui est toujours alimenté par `getOMUrl()` (= la variable affichée). La lib `@openmeteo/weather-map-layer` ne génère le `source-layer: 'wind-arrows'` que pour une variable de vent (règle de dérivation `_u_/_v_component` → vitesse/direction, `om-file-reader.ts`). Pour **toute** variable non-vent (`temperature_2m`, mais aussi `temperature_850hPa`, précipitations…), aucune composante u/v n'est chargée → **aucune flèche**.

Le label « Selon la variable affichée » est donc trompeur : il sous-entend « le vent suit ce que je regarde » alors qu'il ne fait rien dès que la variable n'est pas du vent. Il n'existe **pas** de `wind_u_component_2m` publié, d'où l'absence de flèches sur la T°C 2 m.

Niveaux de vent réellement publiés : `10m`, `100m`, et niveaux iso-pression (`300hPa`…`925hPa`) — filtrés sur `metaJson.variables` (présence de `wind_u_component_<level>`).

## Décisions produit

- **Sujet 1** → **sous-menu repliable** (progressive disclosure), replié par défaut. Non destructif, conserve la personnalisation, allège le menu.
- **Sujet 2** → **fallback sur un niveau dérivé** de la variable affichée, sinon 10 m :
  - variable de surface / 2 m → vent **10 m**
  - variable d'altitude `…_<N>hPa` → vent **`<N>hPa`** si publié, sinon 10 m
  - variable déjà de vent → comportement historique inchangé (rendu par le `vectorManager`)

## Conception

### Partie A — « Style des flèches » en sous-menu repliable (UI pure)

Fichier : `src/lib/components/settings/arrows-settings.svelte` (bloc actuel lignes 152-197).

- État local éphémère `let styleOpen = $state(false)` — **replié par défaut**, non persisté (se replie à chaque ouverture du panneau). YAGNI : pas de persistance.
- L'en-tête « Style des flèches » devient un **`<button type="button">`** :
  - `aria-expanded={styleOpen}` + `aria-controls="arrow-style-panel"`.
  - hauteur tactile `min-h-11 md:min-h-0` (≥ 44 px sur mobile, cohérent avec le label « Flèches de vent »).
  - le texte « Style des flèches » fournit le nom accessible.
  - `ChevronDown` (lucide) `aria-hidden`, `transition-transform duration-200 motion-reduce:transition-none`, classe `rotate-180` quand ouvert (transform → pas de repaint coûteux).
- Le panneau `<div id="arrow-style-panel">` (grille des 7 niveaux) n'est rendu que si `styleOpen`, avec une transition Svelte **`slide`** (durée 200 ms, ease-out) **désactivée sous `prefers-reduced-motion`** (garde via `matchMedia`/helper, ou `duration: 0`).
- Le bouton **« Réinitialiser »** descend **dans** le panneau déplié (évite un bouton imbriqué dans le bouton toggle et allège le header).
- Aucune nouvelle primitive shadcn (`Collapsible`) : disclosure maison léger, accordé au chrome verre. Réutilise les tokens existants (`text-white/70`…), pas de nouvelle couleur.

Aucune modification du store `arrowStyle`, des builders, ni du moteur : c'est purement présentationnel.

### Partie B — fallback du mode « selon la variable affichée » (moteur)

#### B.1 — Fonctions pures (testables)

À placer dans `src/lib/vector-styles.ts` (ou un helper dédié), sans dépendance aux stores :

```ts
// Variables que le vectorManager rend déjà en flèches (la lib dérive u/v → vitesse/direction).
// wind_gusts exclu : pas de composante directionnelle → traité comme non-vent (fallback).
export const isWindVariable = (v: string): boolean =>
	v.startsWith('wind_') && !v.startsWith('wind_gusts');

// Niveau de vent à afficher en repli quand la variable affichée n'est pas du vent.
// Renvoie null si aucun vent n'est disponible dans le modèle.
export const deriveDisplayedWindLevel = (
	displayedVariable: string,
	modelVariables: Iterable<string>
): string | null => {
	const vars = new Set(modelVariables);
	const m = displayedVariable.match(/_(\d+m|\d+hPa)$/);
	const level = m?.[1];
	if (level && vars.has(`wind_u_component_${level}`)) return level;
	if (vars.has('wind_u_component_10m')) return '10m';
	return null;
};
```

#### B.2 — Décision centralisée (`src/lib/url.ts`)

Une seule fonction décide quel niveau l'`arrowManager` doit rendre — réutilisée par l'URL **et** par le garde de couche, pour éviter toute divergence :

```ts
// Niveau que l'arrowManager doit rendre, ou null s'il ne dessine pas
// (flèches off ; ou mode « selon la variable affichée » avec une variable déjà de vent
//  rendue par le vectorManager ; ou aucun vent publié).
export const resolveWindArrowLevel = (): string | null => {
	if (!get(vectorOptions).arrows) return null;
	if (get(windOverlayEnabled)) return get(windOverlayLevel); // overlay explicite (inchangé)
	const displayed = get(v);
	if (isWindVariable(displayed)) return null; // vectorManager s'en charge
	return deriveDisplayedWindLevel(displayed, get(metaJson)?.variables ?? []);
};

export const getWindOverlayUrl = (): string | undefined => {
	const level = resolveWindArrowLevel();
	if (!level) return undefined;
	// Flèches uniquement : contours/grille suivent la variable affichée (vectorManager).
	return getOMUrlFor(`wind_u_component_${level}`, undefined, { contours: false, grid: false });
};
```

#### B.3 — Garde de couche (`src/lib/layers.ts`)

Dans `vectorArrowLayer`, remplacer :

```ts
if (get(windOverlayEnabled) !== forOverlay) return;
```

par :

```ts
if ((resolveWindArrowLevel() !== null) !== forOverlay) return;
```

→ l'`arrowManager` (`forOverlay = true`) dessine dès qu'un niveau est résolu (overlay **ou** fallback) ; le `vectorManager` (`forOverlay = false`) ne dessine les flèches que si la variable affichée est elle-même du vent. La règle « exactement un manager dessine les flèches » est préservée → **jamais de double**.

Les deux chemins de rechargement (`updateOMfileURL` ~ligne 420 et `changeOMfileURL` ~ligne 497) et `reloadVectorStyle` appellent déjà `getWindOverlayUrl()` / poussent l'`arrowManager` dans le commit group quand l'URL existe → ils héritent automatiquement du comportement. Le changement de variable affichée invalide `currentOmUrl` (`primaryChanged`), ce qui ré-évalue le fallback.

#### B.4 — Popup (`src/lib/popup.ts`)

En mode calque, le popup lit la vitesse du vent depuis l'`arrowManager` (`getActiveSourceUrl()`). **Vérifier** que cette lecture est conditionnée à « `arrowManager` actif » et **non** à `windOverlayEnabled` — sinon le survol en mode fallback afficherait la valeur de la variable affichée (p. ex. la température) au lieu du vent 10 m. Adapter au prédicat `resolveWindArrowLevel() !== null` / présence d'une URL active sur l'`arrowManager` si nécessaire.

## Tests

- **Unitaires** (`tests/vector-styles.test.ts`) sur `deriveDisplayedWindLevel` :
  - `temperature_2m` → `'10m'`
  - `temperature_850hPa` (vent 850 publié) → `'850hPa'`
  - `temperature_850hPa` (vent 850 absent, 10 m publié) → `'10m'`
  - variable de surface sans suffixe de niveau → `'10m'`
  - modèle sans aucun vent → `null`
  - `isWindVariable` : `wind_u_component_10m` → `true`, `wind_gusts_10m` → `false`, `temperature_2m` → `false`.
- **url-builder** (`tests/url-builder.test.ts`) :
  - mode « selon la variable affichée » + variable non-vent → `getWindOverlayUrl()` contient `wind_u_component_<dérivé>` et `contours=false`/`grid=false`.
  - mode « selon la variable affichée » + variable de vent → `getWindOverlayUrl()` renvoie `undefined`.
  - overlay explicite → inchangé (toujours `wind_u_component_<windOverlayLevel>`).

## Hors périmètre (YAGNI)

- Pas de changement du label « Selon la variable affichée » (le fallback reste transparent ; option « (vent 10 m) » écartée).
- Pas de persistance de l'état déplié du sous-menu.
- Pas de refonte du sélecteur de niveau ni de partage du style par URL.

## Docs à mettre à jour avec le code

- `.claude/rules/architecture.md` — section « Découplage flèches/contours » : ajouter le 3ᵉ cas (mode « selon la variable affichée » sur variable non-vent → `arrowManager` au niveau dérivé) et le passage du garde à `resolveWindArrowLevel()`.
- `.claude/rules/components.md` si un pattern de disclosure réutilisable émerge.
