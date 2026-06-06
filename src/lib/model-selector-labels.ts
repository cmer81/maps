import { domainOptions } from '@openmeteo/weather-map-layer';

import { MODEL_SELECTOR_GROUPS } from '$lib/constants';

/** Aligne le `label` des entrées `domainOptions` sur la source unique
 *  `MODEL_SELECTOR_GROUPS`, pour que le bouton déclencheur du sélecteur
 *  (qui lit `selectedDomain.label` depuis `domainOptions`) et la liste déroulante
 *  affichent le même nom. Idempotent ; à appeler après les `register*Domain()`
 *  et avant la première évaluation de `selectedDomain`.
 *  Mute directement le `label` des objets de `domainOptions` (tableau partagé du package). */
export function applyModelSelectorLabels(): void {
	const labelByValue = new Map<string, string>(
		MODEL_SELECTOR_GROUPS.flatMap((g) => g.domains.map((d) => [d.value, d.label]))
	);
	for (const opt of domainOptions) {
		const label = labelByValue.get(opt.value);
		if (label !== undefined) opt.label = label;
	}
}
