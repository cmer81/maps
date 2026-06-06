import { type Writable, derived, get, writable } from 'svelte/store';

import {
	LEVEL_PREFIX,
	LEVEL_REGEX,
	LEVEL_UNIT_REGEX,
	domainOptions,
	variableOptions
} from '@openmeteo/weather-map-layer';
import { type Persisted, persisted } from 'svelte-persisted-store';

import { registerAnomalyDomain } from '$lib/anomaly-domain';
import { registerAromeFranceConvectionDomain } from '$lib/arome-france-convection-domain';
import { registerAromeFranceDomain } from '$lib/arome-france-domain';
import { registerAromeOmDomain } from '$lib/arome-om-domain';
import { DEFAULT_DOMAIN, DEFAULT_VARIABLE } from '$lib/constants';
import { applyModelSelectorLabels } from '$lib/model-selector-labels';

// Doit tourner avant la première évaluation de `selectedDomain`.
registerAnomalyDomain();
registerAromeOmDomain();
registerAromeFranceConvectionDomain();
registerAromeFranceDomain();
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

export const levelGroupSelected: Writable<{ value: string; label: string } | undefined> = writable(
	get(selectedVariable).value.match(LEVEL_REGEX)
		? (variableOptions.find(
				({ value }) => value === get(selectedVariable).value.match(LEVEL_PREFIX)?.groups?.prefix
			) ?? undefined)
		: undefined
);
selectedVariable.subscribe((newVariable) => {
	levelGroupSelected.set(
		newVariable.value.match(LEVEL_REGEX)
			? (variableOptions.find(
					({ value }) => value === newVariable.value.match(LEVEL_PREFIX)?.groups?.prefix
				) ?? undefined)
			: undefined
	);
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
export const variableSelectionOpen = writable(false);
export const pressureLevelsSelectionOpen = writable(false);
export const variableSelectionExtended: Persisted<boolean | undefined> = persisted(
	'variables_open',
	undefined, // undefined so it can be set to true on desktop on first load
	{
		// `JSON.stringify(undefined)` renvoie la valeur `undefined`, que
		// `localStorage.setItem` coerce en chaîne littérale "undefined" — illisible
		// par `JSON.parse` au rechargement (cf. `resetStates()` qui set `undefined`).
		// On sérialise donc l'état "non décidé" en `null` (JSON valide) et on le
		// re-mappe vers `undefined` à la lecture.
		serializer: {
			stringify: (value) => JSON.stringify(value ?? null),
			parse: (text) => {
				// Tolère les "undefined" déjà persistés par les versions antérieures.
				if (text === 'undefined') return undefined;
				const parsed = JSON.parse(text);
				return parsed === null ? undefined : parsed;
			}
		}
	}
);

export const variable2 = persisted('variable2', 'precipitation');
export const layer2Enabled = persisted('layer2Enabled', false);
