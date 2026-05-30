// src/lib/sounding/indices.ts
import { liftParcel, mostUnstableLevel } from './parcel';
import { wetBulb } from './thermo';
import {
	type ColumnProfile,
	type LevelDatum,
	type ParcelIndices,
	type ParcelResult,
	type ShearLayer,
	type SoundingIndices
} from './types';

const G = 9.81;

/** Interpole linéairement une grandeur le long de la hauteur. */
function interpAtHeight(levels: LevelDatum[], targetH: number, key: 'u' | 'v'): number {
	for (let i = 1; i < levels.length; i++) {
		const dh = levels[i].height - levels[i - 1].height;
		if (dh === 0) continue; // skip degenerate adjacent pair to avoid divide-by-zero
		if (levels[i].height >= targetH) {
			const f = (targetH - levels[i - 1].height) / dh;
			return levels[i - 1][key] + f * (levels[i][key] - levels[i - 1][key]);
		}
	}
	return levels[levels.length - 1][key];
}

/** CAPE/CIN par intégration de la flottabilité (J/kg) + LI à 500 hPa. */
function parcelIndices(parcel: ParcelResult, levels: LevelDatum[]): ParcelIndices {
	let cape = 0;
	let cin = 0;
	for (let i = 1; i < levels.length; i++) {
		const tParcelK = (parcel.temperature[i] + parcel.temperature[i - 1]) / 2 + 273.15;
		const tEnvK = (levels[i].temperature + levels[i - 1].temperature) / 2 + 273.15;
		const dz = levels[i].height - levels[i - 1].height;
		const b = (G * (tParcelK - tEnvK)) / tEnvK; // flottabilité moyenne sur la couche
		const contrib = b * dz;
		const aboveLfc = parcel.lfc !== null && levels[i].pressure <= parcel.lfc.pressure;
		const belowEl = parcel.el === null || levels[i].pressure >= parcel.el.pressure;
		if (aboveLfc && belowEl && contrib > 0) cape += contrib;
		else if (!aboveLfc && contrib < 0) cin += contrib;
	}
	const i500 = levels.findIndex((l) => l.pressure === 500);
	const li = i500 >= 0 ? levels[i500].temperature - parcel.temperature[i500] : NaN;
	return { cape, cin, li };
}

function computeShear(levels: LevelDatum[]): ShearLayer[] {
	const base = levels[0];
	const layers: Array<{ label: ShearLayer['label']; top: number }> = [
		{ label: '0-1 km', top: base.height + 1000 },
		{ label: '0-3 km', top: base.height + 3000 },
		{ label: '0-6 km', top: base.height + 6000 }
	];
	return layers.map(({ label, top }) => {
		const u = interpAtHeight(levels, top, 'u') - base.u;
		const v = interpAtHeight(levels, top, 'v') - base.v;
		return { label, u, v, magnitude: Math.hypot(u, v) };
	});
}

/** Altitude (m) du premier passage de `valueOf` à `threshold` en montant. */
function crossingHeight(
	levels: LevelDatum[],
	valueOf: (l: LevelDatum) => number,
	threshold: number
): number | null {
	for (let i = 1; i < levels.length; i++) {
		const a = valueOf(levels[i - 1]);
		const b = valueOf(levels[i]);
		if ((a - threshold) * (b - threshold) <= 0 && a !== b) {
			const f = (threshold - a) / (b - a);
			return levels[i - 1].height + f * (levels[i].height - levels[i - 1].height);
		}
	}
	return null;
}

export function computeIndices(profile: ColumnProfile): SoundingIndices {
	const { surface, levels } = profile;
	if (levels.length < 2) {
		return {
			sb: { cape: 0, cin: 0, li: NaN },
			mu: { cape: 0, cin: 0, li: NaN },
			lpn: { iso0: null, isoTw: null, isothermal: false },
			shear: []
		};
	}
	const sbParcel = liftParcel(surface, levels);
	const muStart = mostUnstableLevel(surface, levels);
	const muParcel = liftParcel(muStart, levels);

	const iso0 = crossingHeight(levels, (l) => l.temperature, 0);
	const isoTw = crossingHeight(levels, (l) => wetBulb(l.temperature, l.dewpoint, l.pressure), 1.5);
	let isothermal = false;
	for (let i = 1; i < levels.length; i++) {
		if (
			Math.abs(levels[i].temperature - levels[i - 1].temperature) < 0.5 &&
			Math.abs(levels[i].temperature) < 2
		) {
			isothermal = true;
			break;
		}
	}

	return {
		sb: parcelIndices(sbParcel, levels),
		mu: parcelIndices(muParcel, levels),
		lpn: { iso0, isoTw, isothermal },
		shear: computeShear(levels)
	};
}
