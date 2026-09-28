# Contrat : module `precipitation-infoclimat` et intégration

**Portée** : interfaces internes que les autres modules de `maps` consomment. Il n'y a pas d'API publique ; le seul contrat externe est le paramètre d'URL `om://`, décrit en C3.

## C1. Module pur `src/lib/color-scales/precipitation-infoclimat.ts`

Pas de dépendance à MapLibre ni aux stores. Testable sous Vitest en environnement `node`.

```ts
export type PrecipitationTier = '1h' | '3h' | '6h' | '12h' | '24h' | '48h' | '72h';

/** Variables concernées (Q2 = B). */
export const PRECIPITATION_STEP_VARIABLES: readonly string[]; // ['precipitation', 'rain', 'showers']
export const PRECIPITATION_RUN_SUM_VARIABLES: readonly string[]; // ['precipitation_sum']
export function isInfoclimatPrecipitationVariable(variable: string): boolean;

/** Palette dérivée (research R2) et référence Infoclimat, 17 × RGB. */
export const PRECIPITATION_COLORS: readonly RGB[];
export const INFOCLIMAT_PRECIPITATION_COLORS: readonly RGB[];

/** Bornes inférieures (mm) des 17 classes par palier (data-model E3). */
export const PRECIPITATION_TIER_BOUNDS: Readonly<Record<PrecipitationTier, readonly number[]>>;

/** Palier pour une durée en heures (data-model E6). */
export function tierForDuration(hours: number): PrecipitationTier;

/** Durée de cumul en heures pour une variable et une échéance. Renvoie null si la variable est
 *  hors périmètre ou si le contexte manque. */
export function accumulationHours(args: {
	variable: string;
	validTime: Date;
	modelRun: Date | undefined;
	validTimes: readonly string[] | undefined; // metaJson.valid_times
}): number | null;

/** Échelle rendue (data-model E4) : breakpoints [0, ...bounds], entrée 0 transparente. */
export function precipitationScaleForTier(tier: PrecipitationTier): BreakpointColorScale;

/** Palier de référence « couleurs standard » (data-model E8). */
export function defaultTierFor(variable: string): PrecipitationTier | null;
```

**Garanties testées**

- `precipitationScaleForTier(t).breakpoints.length === 18`, strictement croissants, avec `breakpoints[0] === 0`.
- `colors[0][3] === 0` et `colors[1..17][3] === 1`.
- `getColor(scale, v)` (package) :
  - transparent pour v ∈ [0, bounds[0]) ;
  - couleur 17 pour v ≥ bounds[16] ;
  - couleur k pour bounds[k−1] ≤ v < bounds[k].
- Invariants de palette E1 (ΔE00, L*), recalculés en test à partir de la palette et non codés en dur.
- `tierForDuration` : table d'exemples E6.
- `accumulationHours` :
  - pas de 1 h, 3 h et 15 min ;
  - 1re échéance ;
  - cumul du run à H0, H18 et H96 ;
  - variable hors périmètre → null.

## C2. Helper d'affichage `resolveAppColorScale`

Emplacement proposé : `src/lib/color-scales/resolve.ts`.

```ts
export function resolveAppColorScale(
	variable: string,
	dark: boolean,
	colorScales: ColorScales, // omProtocolSettings.colorScales
	tier: PrecipitationTier | null, // store `precipitationTier` ou calcul direct
	customScales?: Record<string, RenderableColorScale> // customColorScales
): RenderableColorScale;
```

**Règle**

1. `customScales[variable]` existe → on la renvoie (R7).
2. Sinon, si la variable est concernée → `precipitationScaleForTier(tier ?? defaultTierFor(variable))`.
3. Sinon → `getColorScale(variable, dark, colorScales)`, comportement actuel inchangé.

**Sites d'appel à migrer** : `scale.svelte` (échelle affichée ; la « standard » passe par `defaultTierFor`), `popup.ts`, `watermark-details.ts`, `context-strip.svelte`. `layers.ts` (unité seulement) et `layer-list.svelte` (aperçu) peuvent rester sur `getColorScale`.

## C3. Paramètre d'URL `om://` : `precip_tier`

- **Émis par** : `getOMUrlFor(variable, timeOverride?)` (`src/lib/url.ts`), **seulement** si `isInfoclimatPrecipitationVariable(variable)` et si aucune palette personnalisée n'existe pour cette variable.
- **Valeur** : `tierForDuration(accumulationHours({ variable, validTime: timeOverride ?? get(time), modelRun, validTimes: metaJson?.valid_times }))`. Si la durée est `null` : `defaultTierFor(variable)`.
- **Position** : ajouté après `variable=` et avant les suffixes de hash (`colorHashSuffix`).
- **Nature** : paramètre de **rendu** seulement. Il n'est pas dans `DATA_RELEVANT_PARAMS` du package, donc la clé des données décodées (`fileAndVariableKey`) est inchangée et le décode anticipé reste réutilisable.
- **Consommé par** : `customResolveRequest` (`src/lib/stores/om-protocol-settings.ts`), qui remplace `settings.colorScales[variable]` par `precipitationScaleForTier(tier)` avant `defaultResolveRequest`. Une valeur absente ou invalide laisse le comportement par défaut.
- **Invariant testé** : pour un même `(variable, heure)`, `getOMUrlFor` produit la même URL qu'on l'appelle depuis la source MapLibre ou depuis `neighbor-prefetch` (`timeOverride`).
- **Liens partagés** : `precip_tier` n'apparaît **pas** dans l'URL de la page (store `url`), seulement dans l'URL `om://` interne. Aucun paramètre public ne change.

## C4. Vignettes (`src/lib/vector-styles.ts`, `src/lib/layers.ts`)

```ts
/** Étiquette de valeur : branche précipitations (data-model E9) si la variable est concernée,
 *  sinon comportement actuel `buildGridValueLabelExpr`. */
export function buildGridValueLabelExprFor(
	variable: string,
	baseUnit: string,
	units: UnitPreferences
): ExpressionSpecification;

/** Filtre de masquage des valeurs < 0,05 (unité d'affichage), combiné au filtre de décimation.
 *  Renvoie null si la variable n'est pas concernée. */
export function buildGridValueVisibilityFilter(
	variable: string,
	baseUnit: string,
	units: UnitPreferences
): FilterSpecification | null;
```

**Garanties testées**

- Les expressions sont évaluées par `expression.createExpression` de MapLibre, dans le même style que les tests existants de `vector-styles.test.ts`. Résultats attendus : 0,04 → masqué ; 0,4 → « 0,4 » ; 9,94 → « 9,9 » ; 9,96 → « 10 » ; 152,4 → « 152 ».
- Température (hors périmètre) : sortie identique à celle d'aujourd'hui.
- Invariant d'espacement (research R8) : `minSpacingPx(GRID_VALUE_TARGET_PX) ≥ maxLabelWidthPx('1520', 11)`, avec une estimation documentée de la largeur par caractère.
