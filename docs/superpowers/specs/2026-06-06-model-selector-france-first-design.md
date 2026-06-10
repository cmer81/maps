# Sélecteur de modèles — ordre « made in France » d'abord

Issue : [#48](https://github.com/cmer81/maps/issues/48)

## Problème

`src/lib/components/chrome/model-selector.svelte` affiche les groupes et modèles
dans l'ordre du package `@openmeteo/weather-map-layer`, filtrés par
`DOMAIN_ALLOWLIST`. Le regroupement repose sur `domain.value.startsWith(group.value)`.

Deux limites :

1. **Ordre non maîtrisé** — l'ordre suit le package, pas une intention produit.
2. **Regroupement impossible à l'arbitraire** — l'issue veut réunir sous un seul
   groupe « Météo-France Arome » des domaines aux préfixes hétérogènes
   (`meteofrance_arome_france_hd`, `arome_france`, `arome_france_convection`,
   `arome_om_*`) qui vivent aujourd'hui dans 3 groupes distincts. Le mécanisme
   `startsWith` ne sait pas les fusionner.

Par ailleurs les libellés actuels sont hétérogènes (« MF AROME France HD » vs
« AROME France » vs « DWD ICON EU »).

## Objectif

Ordonner, regrouper et renommer le sélecteur exactement comme spécifié dans
l'issue, en privilégiant les modèles français en tête.

### Rendu cible

```
MÉTÉO-FRANCE AROME
  Arome France HD                 meteofrance_arome_france_hd
  Arome France 2.5                arome_france
  Arome France Convection         arome_france_convection
  Arome OM Réunion-Mayotte        arome_om_reunion
  Arome OM Antilles               arome_om_antilles
  Arome OM Guyane                 arome_om_guyane
  Arome OM Polynésie              arome_om_polynesie
  Arome OM Nouvelle-Calédonie     arome_om_ncaledonie
MÉTÉO-FRANCE ARPÈGE
  Arpège Europe                   meteofrance_arpege_europe
  Arpège Monde                    meteofrance_arpege_world025
DWD GERMANY
  DWD ICON EU                     dwd_icon_eu
  DWD ICON D2                     dwd_icon_d2
ECMWF
  ECMWF IFS 0.25                  ecmwf_ifs025
  ECMWF IFS HRES                  ecmwf_ifs
  ECMWF AIFS 0.25                 ecmwf_aifs025_single
NOAA US
  GFS Global 0.25                 ncep_gfs025
ANOMALIE
  Anomalie T°C (Europe ERA/Arpège)  anomaly_europe
```

### Écarts assumés vs. issue

- **« Arome France 2.5 (avec option émagramme) »** → libellé = **« Arome France 2.5 »**
  et la mention « émagramme (sondage) » va dans le sous-texte (`MODEL_DESCRIPTIONS`),
  conçu pour ça. Titre plus propre.
- Le symbole **°** sur les résolutions est omis dans les titres (« ECMWF IFS 0.25 »,
  « GFS Global 0.25 »), conformément à l'issue ; la résolution exacte reste dans le
  sous-texte descriptif.

## Conception

### 1. Source unique : `MODEL_SELECTOR_GROUPS` (dans `constants.ts`)

Tableau ordonné de groupes ; unique déclaration de *quels domaines, dans quel ordre,
sous quel groupe, avec quel libellé*.

```ts
export const MODEL_SELECTOR_GROUPS: readonly {
	label: string;
	domains: readonly { value: string; label: string }[];
}[] = [
	{
		label: 'Météo-France Arome',
		domains: [
			{ value: 'meteofrance_arome_france_hd', label: 'Arome France HD' },
			{ value: AROME_FRANCE_DOMAIN, label: 'Arome France 2.5' },
			{ value: AROME_FRANCE_CONVECTION_DOMAIN, label: 'Arome France Convection' },
			{ value: AROME_OM_REUNION_DOMAIN, label: 'Arome OM Réunion-Mayotte' },
			{ value: AROME_OM_ANTILLES_DOMAIN, label: 'Arome OM Antilles' },
			{ value: AROME_OM_GUYANE_DOMAIN, label: 'Arome OM Guyane' },
			{ value: AROME_OM_POLYNESIE_DOMAIN, label: 'Arome OM Polynésie' },
			{ value: AROME_OM_NCALEDONIE_DOMAIN, label: 'Arome OM Nouvelle-Calédonie' }
		]
	},
	{
		label: 'Météo-France Arpège',
		domains: [
			{ value: 'meteofrance_arpege_europe', label: 'Arpège Europe' },
			{ value: 'meteofrance_arpege_world025', label: 'Arpège Monde' }
		]
	},
	{
		label: 'DWD Germany',
		domains: [
			{ value: 'dwd_icon_eu', label: 'DWD ICON EU' },
			{ value: 'dwd_icon_d2', label: 'DWD ICON D2' }
		]
	},
	{
		label: 'ECMWF',
		domains: [
			{ value: 'ecmwf_ifs025', label: 'ECMWF IFS 0.25' },
			{ value: 'ecmwf_ifs', label: 'ECMWF IFS HRES' },
			{ value: 'ecmwf_aifs025_single', label: 'ECMWF AIFS 0.25' }
		]
	},
	{
		label: 'NOAA US',
		domains: [{ value: 'ncep_gfs025', label: 'GFS Global 0.25' }]
	},
	{
		label: 'Anomalie',
		domains: [{ value: ANOMALY_DOMAIN, label: 'Anomalie T°C (Europe ERA/Arpège)' }]
	}
];
```

### 2. `DOMAIN_ALLOWLIST` dérivé

```ts
export const DOMAIN_ALLOWLIST: readonly string[] = MODEL_SELECTOR_GROUPS.flatMap((g) =>
	g.domains.map((d) => d.value)
);
```

Plus aucune divergence possible entre « visible » et « ordonné ». Reste display-only :
une URL partageant un domaine non listé résout toujours. Les commentaires de gating
(bucket, anomalie) migrent au-dessus de `MODEL_SELECTOR_GROUPS`.

### 3. Application des libellés sur `domainOptions`

Le bouton déclencheur du sélecteur lit `selectedDomain.label`, lui-même issu de
`domainOptions` (`src/lib/stores/variables.ts`). Pour que bouton **et** liste
soient cohérents, les libellés de la table sont appliqués sur `domainOptions`.

Nouvelle fonction (p. ex. `src/lib/model-selector-labels.ts`) :

```ts
export function applyModelSelectorLabels(): void {
	const labelByValue = new Map(
		MODEL_SELECTOR_GROUPS.flatMap((g) => g.domains.map((d) => [d.value, d.label]))
	);
	for (const opt of domainOptions) {
		const label = labelByValue.get(opt.value);
		if (label) opt.label = label;
	}
}
```

Appelée dans `variables.ts` **juste après** les `register*Domain()` et avant la
première évaluation de `selectedDomain`. Les libellés posés par les
`register*Domain()` restent en place comme fallback (override idempotent).

### 4. `model-selector.svelte` simplifié

Itère `MODEL_SELECTOR_GROUPS` au lieu de `domainGroups` + `startsWith` :

```svelte
{#each MODEL_SELECTOR_GROUPS as group (group.label)}
	{@const visible = group.domains.filter((d) =>
		domainOptions.some((o) => o.value === d.value)
	)}
	{#if visible.length}
		<Command.Group heading={group.label}>
			{#each visible as { value, label } (value)}
				<!-- item : label depuis la table, description depuis MODEL_DESCRIPTIONS[value] -->
			{/each}
		</Command.Group>
	{/if}
{/each}
```

Le filtre `domainOptions.some(...)` saute les pseudo-domaines bucket non enregistrés
(gating préservé). Les imports `domainGroups` et `Domain` deviennent inutiles.

### 5. `MODEL_DESCRIPTIONS`

Inchangé, sauf : ajout de la mention émagramme au sous-texte d'`arome_france`
(ex. `… · surface · ~51 h · émagramme (sondage)`).

## Tests

`src/lib/tests/model-selector-groups.test.ts` (Vitest) :

- chaque `value` de `MODEL_SELECTOR_GROUPS` résout dans `domainOptions` après les
  `register*Domain()` ;
- `DOMAIN_ALLOWLIST` dérivé = les 17 domaines attendus, sans doublon ;
- après `applyModelSelectorLabels()`, le `label` de `domainOptions` correspond à
  celui de la table pour chaque domaine listé.

## Hors périmètre

- Pas de changement de routing / `om://` / pseudo-domaines.
- Pas de modification des couleurs, variables, ou du sondage.
- Pas de refonte du composant au-delà de la boucle de rendu.

## Docs à synchroniser

- `.claude/rules/architecture.md` § *Domain allowlist* : `DOMAIN_ALLOWLIST` est
  désormais dérivé de `MODEL_SELECTOR_GROUPS` (ordre + groupes + libellés). Le
  regroupement n'utilise plus `startsWith`.
