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
import { registerAromeOmDomain } from '$lib/arome-om-domain';
import { CUMUL_GROUP_PREFIX, DEFAULT_DOMAIN, DEFAULT_VARIABLE } from '$lib/constants';

// Doit tourner avant la première évaluation de `selectedDomain`.
registerAnomalyDomain();
registerAromeOmDomain();

const CUMUL_VARIABLE_REGEX = /^(?<base>.+)_sum_(?<hours>\d+)h$/;

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

const deriveCumulGroup = (value: string) => {
	const match = value.match(CUMUL_VARIABLE_REGEX);
	if (!match?.groups) return undefined;
	const base = match.groups.base;
	return { value: CUMUL_GROUP_PREFIX + base, label: base };
};

export const cumulGroupSelected: Writable<{ value: string; label: string } | undefined> = writable(
	deriveCumulGroup(get(selectedVariable).value)
);
selectedVariable.subscribe((newVariable) => {
	cumulGroupSelected.set(deriveCumulGroup(newVariable.value));
});

export const domainSelectionOpen = writable(false);
export const variableSelectionOpen = writable(false);
export const pressureLevelsSelectionOpen = writable(false);
export const cumulSelectionOpen = writable(false);
export const variableSelectionExtended: Persisted<boolean | undefined> = persisted(
	'variables_open',
	undefined
); // undefined so it can be set to true on desktop on first load

export const variable2 = persisted('variable2', 'precipitation');
export const layer2Enabled = persisted('layer2Enabled', false);
