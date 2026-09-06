import { type Writable, derived, get, writable } from 'svelte/store';

import {
	LEVEL_PREFIX,
	LEVEL_REGEX,
	LEVEL_UNIT_REGEX,
	domainOptions,
	variableOptions
} from '@openmeteo/weather-map-layer';
import { persisted } from 'svelte-persisted-store';

import { registerAnomalyDomain } from '$lib/anomaly-domain';
import { registerAromeFranceConvectionDomain } from '$lib/arome-france-convection-domain';
import { registerAromeFranceDomain } from '$lib/arome-france-domain';
import { registerAromeFranceHdDomain } from '$lib/arome-france-hd-domain';
import { registerAromeOmDomain } from '$lib/arome-om-domain';
import { DEFAULT_DOMAIN, DEFAULT_VARIABLE, NON_LEVEL_GROUP_VARIABLES } from '$lib/constants';
import { applyModelSelectorLabels } from '$lib/model-selector-labels';
import { registerWeatherAiGlobalDomain } from '$lib/weather-ai-global-domain';

// Doit tourner avant la première évaluation de `selectedDomain`.
registerAnomalyDomain();
registerAromeOmDomain();
registerAromeFranceConvectionDomain();
registerAromeFranceDomain();
registerAromeFranceHdDomain();
registerWeatherAiGlobalDomain();
applyModelSelectorLabels();

export const defaultDomain = DEFAULT_DOMAIN;
export const domain = persisted('domain', defaultDomain);

export const defaultVariable = DEFAULT_VARIABLE;
export const variable = persisted('variable', defaultVariable);

export const selectedDomain = derived(domain, ($domain) => {
	const object = domainOptions.find(({ value }) => value === $domain);
	if (object) return object;
	// Domaine inconnu (ex. URL partagée d'un domaine non enregistré comme
	// anomaly_europe sans bucket configuré) : fallback au domaine par défaut
	// plutôt que de crasher l'app.
	const fallback = domainOptions.find(({ value }) => value === DEFAULT_DOMAIN);
	if (fallback) return fallback;
	throw new Error('Domain not found');
});

export const selectedVariable = derived(variable, ($variable) => {
	const object = variableOptions.find(({ value }) => value === $variable);
	if (object) return object;
	if ($variable === 'temperature_2m_anomaly') {
		return { value: $variable, label: 'Anomalie T° 2m vs. normale 1991–2020' };
	}
	return { value: $variable, label: $variable };
});

/**
 * Résout le groupe de niveaux d'une variable (ou `undefined` si elle n'en fait pas
 * partie). Les variables de `NON_LEVEL_GROUP_VARIABLES` sont exclues : le `LEVEL_PREFIX`
 * du package les replie à tort (ex. `wind_chill_2m` → préfixe « wind »), ce qui
 * sélectionnait le groupe de niveaux « wind » et faisait basculer le sélecteur sur
 * « Vent » à la sélection du refroidissement éolien. Doit rester alignée sur le
 * repliage de `buildVariableList()`/`buildLevelGroups()` (`src/lib/layer-list.ts`).
 */
export function resolveLevelGroup(value: string): { value: string; label: string } | undefined {
	if (NON_LEVEL_GROUP_VARIABLES.includes(value)) return undefined;
	if (!value.match(LEVEL_REGEX)) return undefined;
	const prefix = value.match(LEVEL_PREFIX)?.groups?.prefix;
	return variableOptions.find(({ value: v }) => v === prefix) ?? undefined;
}

export const levelGroupSelected: Writable<{ value: string; label: string } | undefined> = writable(
	resolveLevelGroup(get(selectedVariable).value)
);
selectedVariable.subscribe((newVariable) => {
	levelGroupSelected.set(resolveLevelGroup(newVariable.value));
});

export const level = derived(selectedVariable, (sV) => {
	const match = sV.value.match(LEVEL_UNIT_REGEX);
	if (match && match.groups) {
		return match.groups.level;
	} else {
		return undefined;
	}
});

export const unit = derived(selectedVariable, (sV) => {
	const match = sV.value.match(LEVEL_UNIT_REGEX);
	if (match && match.groups) {
		return match.groups.unit;
	} else {
		return undefined;
	}
});

export const domainSelectionOpen = writable(false);

export const variable2 = persisted('variable2', 'precipitation');
export const layer2Enabled = persisted('layer2Enabled', false);
