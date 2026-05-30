// src/lib/sounding/parcel.ts
import {
	dryAdiabatTemp,
	mixingRatio,
	moistLapseTemp,
	potentialTemperature,
	saturationVaporPressure
} from './thermo';
import { type LevelDatum, type ParcelResult } from './types';

/** θe approximée (K) pour comparer l'instabilité des niveaux. */
function thetaE(level: LevelDatum): number {
	const tK = level.temperature + 273.15;
	const theta = potentialTemperature(tK, level.pressure);
	const e = saturationVaporPressure(level.dewpoint);
	const r = mixingRatio(e, level.pressure) / 1000; // kg/kg
	return theta * Math.exp((2.501e6 * r) / (1005 * tK));
}

/** Niveau le plus instable (θe max) parmi surface + niveaux bas (≥ 500 hPa). */
export function mostUnstableLevel(surface: LevelDatum, levels: LevelDatum[]): LevelDatum {
	const candidates = [surface, ...levels.filter((l) => l.pressure >= 500)];
	return candidates.reduce((best, l) => (thetaE(l) > thetaE(best) ? l : best), candidates[0]);
}

function dewpointFromVaporPressure(eHPa: number): number {
	const ln = Math.log(Math.max(eHPa, 1e-3) / 6.112);
	return (243.5 * ln) / (17.67 - ln);
}

/** Pression du LCL : on remonte sèche en conservant le rapport de mélange. */
function findLclPressure(start: LevelDatum): number {
	const thetaK = potentialTemperature(start.temperature + 273.15, start.pressure);
	const r0 = mixingRatio(saturationVaporPressure(start.dewpoint), start.pressure); // g/kg conservé
	let p = start.pressure;
	for (; p > 100; p -= 2) {
		const tC = dryAdiabatTemp(thetaK, p) - 273.15;
		// Td de la particule à p pour le même rapport de mélange r0 :
		const e = (r0 * p) / (621.97 + r0);
		const tdC = dewpointFromVaporPressure(e);
		if (tC <= tdC) break;
	}
	return p;
}

/**
 * Interpole la hauteur géopotentielle à `lclPressure` depuis un ensemble de niveaux
 * ancrés (triés par pression décroissante, i.e. altitude croissante).
 * Utilise l'interpolation linéaire en log-pression.
 */
function interpolateHeightAtPressure(anchors: LevelDatum[], lclPressure: number): number {
	// anchors are sorted descending by pressure (ascending by height)
	const lnLcl = Math.log(lclPressure);
	for (let i = 1; i < anchors.length; i++) {
		const a = anchors[i - 1]; // higher pressure, lower altitude
		const b = anchors[i]; // lower pressure, higher altitude
		if (a.pressure >= lclPressure && lclPressure >= b.pressure) {
			const lnA = Math.log(a.pressure);
			const lnB = Math.log(b.pressure);
			const denom = lnB - lnA;
			if (denom === 0) continue; // degenerate pair, skip
			const f = (lnLcl - lnA) / denom;
			return a.height + f * (b.height - a.height);
		}
	}
	// LCL is above the topmost anchor → clamp to top
	const top = anchors[anchors.length - 1];
	if (lclPressure < top.pressure) return top.height;
	// LCL is below the surface anchor → use surface height
	return anchors[0].height;
}

/** Ascension complète d'une particule depuis `start`, évaluée aux pressions de `levels`. */
export function liftParcel(start: LevelDatum, levels: LevelDatum[]): ParcelResult {
	const thetaK = potentialTemperature(start.temperature + 273.15, start.pressure);
	const lclPressure = findLclPressure(start);
	// Interpolate LCL height from environment levels, anchored at `start` for the lowest segment.
	const anchors: LevelDatum[] = [start, ...levels].sort((a, b) => b.pressure - a.pressure);
	const lclHeight = interpolateHeightAtPressure(anchors, lclPressure);
	const lcl = { pressure: lclPressure, height: lclHeight };
	const lclTempC = dryAdiabatTemp(thetaK, lcl.pressure) - 273.15;

	const temperature = levels.map((l) => {
		if (l.pressure >= lcl.pressure) {
			return dryAdiabatTemp(thetaK, l.pressure) - 273.15; // sous le LCL : sèche
		}
		return moistLapseTemp(lclTempC, lcl.pressure, l.pressure); // au-dessus : saturée
	});

	// LFC / EL : croisements de la flottabilité (particule - environnement).
	let lfc: ParcelResult['lfc'] = null;
	let el: ParcelResult['el'] = null;
	for (let i = 1; i < levels.length; i++) {
		const bPrev = temperature[i - 1] - levels[i - 1].temperature;
		const bCur = temperature[i] - levels[i].temperature;
		if (bPrev <= 0 && bCur > 0 && !lfc) {
			lfc = { pressure: levels[i].pressure, height: levels[i].height };
		}
		if (bPrev > 0 && bCur <= 0 && lfc && !el) {
			el = { pressure: levels[i].pressure, height: levels[i].height };
		}
	}
	// Si le profil ne s'étend pas assez haut pour observer la descente de flottabilité,
	// on borne l'EL au dernier niveau disponible (EL ≥ sommet du profil).
	if (lfc && !el) {
		const top = levels[levels.length - 1];
		const topBuoy = temperature[levels.length - 1] - top.temperature;
		if (topBuoy > 0) {
			el = { pressure: top.pressure, height: top.height };
		}
	}
	return { temperature, lcl, lfc, el };
}
