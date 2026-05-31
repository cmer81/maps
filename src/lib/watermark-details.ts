import { get } from 'svelte/store';

import { type RenderableColorScale, getColor, getColorScale } from '@openmeteo/weather-map-layer';
import { mode } from 'mode-watcher';

import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { opacity } from '$lib/stores/preferences';
import { convertValue, getDisplayUnit, unitPreferences } from '$lib/stores/units';
import { variable as variableStore } from '$lib/stores/variables';

import type { PngWatermarkDetails } from '$lib/png-export';

const formatLegendValue = (value: number, colorScale: RenderableColorScale): string => {
	const converted = convertValue(value, colorScale.unit, get(unitPreferences));
	if (Math.abs(converted) >= 1) return converted.toFixed(0);
	if (Math.abs(converted) >= 0.1) return converted.toFixed(1);
	return converted.toFixed(2);
};

const getLegendEntries = (colorScale: RenderableColorScale) => {
	if (colorScale.type === 'rgba') {
		const steps = 25;
		const stepSize = (colorScale.max - colorScale.min) / steps;
		return Array.from({ length: steps + 1 }, (_, i) => {
			const value = colorScale.min + i * stepSize;
			return {
				value: formatLegendValue(value, colorScale),
				color: getColor(colorScale, value)
			};
		});
	}

	return colorScale.breakpoints.map((value) => ({
		value: formatLegendValue(value, colorScale),
		color: getColor(colorScale, value)
	}));
};

/** Légende du filigrane PNG, dérivée du barème de couleurs de la variable courante. */
export const buildWatermarkLegend = (): NonNullable<PngWatermarkDetails['legend']> => {
	const variable = get(variableStore);
	const colorScale = getColorScale(
		variable,
		mode.current === 'dark',
		get(omProtocolSettings).colorScales
	);
	return {
		unit: getDisplayUnit(colorScale.unit, get(unitPreferences)),
		opacity: get(opacity) / 100,
		entries: getLegendEntries(colorScale)
	};
};

/** Libellé d'échéance lisible (ex. `H+12`, `H+01:30`). */
export const formatLeadTimeLabel = (run: Date, validTime: Date): string => {
	const totalMinutes = Math.round((validTime.getTime() - run.getTime()) / 60_000);
	const sign = totalMinutes < 0 ? '-' : '+';
	const absMinutes = Math.abs(totalMinutes);
	const hours = Math.floor(absMinutes / 60);
	const minutes = absMinutes % 60;
	if (minutes === 0) return `H${sign}${hours}`;
	return `H${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/** Échéance compacte pour nom de fichier (ex. `h012`, `h01230`, `m030`). */
export const formatLeadTimeForFilename = (run: Date, validTime: Date): string => {
	const totalMinutes = Math.round((validTime.getTime() - run.getTime()) / 60_000);
	const sign = totalMinutes < 0 ? 'm' : 'h';
	const absMinutes = Math.abs(totalMinutes);
	if (absMinutes % 60 === 0) return `${sign}${String(absMinutes / 60).padStart(3, '0')}`;
	return `${sign}${String(Math.floor(absMinutes / 60)).padStart(3, '0')}${String(
		absMinutes % 60
	).padStart(2, '0')}`;
};

/**
 * Construit les `PngWatermarkDetails` pour une frame unique : champs communs au
 * PNG unitaire (capture), au PNG carré et à l'export de série.
 */
export const buildWatermarkDetails = (
	run: Date,
	validTime: Date,
	frameIndex: number,
	frameCount: number,
	domainLabel: string,
	variableLabel: string
): PngWatermarkDetails => ({
	title: variableLabel,
	leadTimeLabel: formatLeadTimeLabel(run, validTime),
	domainLabel,
	variableLabel,
	modelRun: run,
	validTime,
	frameIndex,
	frameCount,
	legend: buildWatermarkLegend()
});
