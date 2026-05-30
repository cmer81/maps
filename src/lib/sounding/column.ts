// src/lib/sounding/column.ts
import { dewpointFromRH } from './thermo';
import { type ColumnProfile, type LevelDatum } from './types';

/** Lecture brute d'une variable au point ; renvoie NaN si indisponible. */
export type VariableReader = (variable: string) => Promise<number>;

interface SurfaceInput {
	temperature: number;
	rh: number;
	pressure: number;
	height: number;
	u: number;
	v: number;
}

interface AssembleInput {
	lat: number;
	lng: number;
	validTime: string;
	levels: readonly number[];
	surface: SurfaceInput;
	read: VariableReader;
}

/** Logique pure d'assemblage (testable) : lit chaque variable via `read`. */
export async function assembleColumn(input: AssembleInput): Promise<ColumnProfile> {
	const { levels, read } = input;
	const raw = await Promise.all(
		levels.map(async (L) => {
			const [t, rh, h, u, v] = await Promise.all([
				read(`temperature_${L}hPa`),
				read(`relative_humidity_${L}hPa`),
				read(`geopotential_height_${L}hPa`),
				read(`wind_u_component_${L}hPa`),
				read(`wind_v_component_${L}hPa`)
			]);
			return { pressure: L, temperature: t, rh, height: h, u, v };
		})
	);

	const valid: LevelDatum[] = raw
		.filter((r) => [r.temperature, r.rh, r.height, r.u, r.v].every(Number.isFinite))
		.map((r) => ({
			pressure: r.pressure,
			temperature: r.temperature,
			dewpoint: dewpointFromRH(r.temperature, r.rh),
			height: r.height,
			u: r.u,
			v: r.v
		}))
		.sort((a, b) => b.pressure - a.pressure);

	const s = input.surface;
	const surface: LevelDatum = {
		pressure: s.pressure,
		temperature: s.temperature,
		dewpoint: dewpointFromRH(s.temperature, s.rh),
		height: s.height,
		u: s.u,
		v: s.v
	};

	return { lat: input.lat, lng: input.lng, validTime: input.validTime, surface, levels: valid };
}
