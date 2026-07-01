import { type Writable, get, writable } from 'svelte/store';

import { BrowserBlockCache } from '@openmeteo/file-reader';
import {
	type WeatherMapLayerFileReader,
	defaultOmProtocolSettings,
	defaultResolveRequest
} from '@openmeteo/weather-map-layer';
import { persisted } from 'svelte-persisted-store';

import { browser } from '$app/environment';

import { absoluteVorticityScale } from '$lib/color-scales/absolute-vorticity';
import { brightnessTemperatureScale } from '$lib/color-scales/brightness-temperature';
import { brightnessTemperatureWvScale } from '$lib/color-scales/brightness-temperature-wv';
import { capeScale } from '$lib/color-scales/cape';
import { convectiveInhibitionScale } from '$lib/color-scales/convective-inhibition';
import { geopotentialPv1500Scale } from '$lib/color-scales/geopotential-pv1500';
import { infoclimatTemperatureScale } from '$lib/color-scales/infoclimat-temperature';
import { lightningDensityScale } from '$lib/color-scales/lightning-density';
import { precipitableWaterScale } from '$lib/color-scales/precipitable-water';
import { precipitationSumScale } from '$lib/color-scales/precipitation-sum';
import { precipitationTypeScale } from '$lib/color-scales/precipitation-type';
import { radarReflectivityScale } from '$lib/color-scales/radar-reflectivity';
import { snowfallSumScale } from '$lib/color-scales/snowfall-sum';
import { temperatureAnomalyScale } from '$lib/color-scales/temperature-anomaly';
import { thetaEScale } from '$lib/color-scales/theta-e';
import { thetaWScale } from '$lib/color-scales/theta-w';
import { thicknessScale } from '$lib/color-scales/thickness';
import { visibilityScale } from '$lib/color-scales/visibility';
import {
	ANOMALY_DOMAIN,
	ANOMALY_VARIABLE,
	DEFAULT_CACHE_BLOCK_SIZE_KB,
	DEFAULT_CACHE_MAX_BYTES_MB,
	HTTP_OVERHEAD_BYTES
} from '$lib/constants';

import type {
	Data,
	OmProtocolSettings,
	OmUrlState,
	RenderableColorScale
} from '@openmeteo/weather-map-layer';

export const customColorScales = persisted<Record<string, RenderableColorScale>>(
	'custom-color-scales',
	{}
);

export const cacheBlockSizeKb = persisted('cache-block-size-kb', DEFAULT_CACHE_BLOCK_SIZE_KB);
export const cacheMaxBytesMb = persisted('cache-max-bytes-mb', DEFAULT_CACHE_MAX_BYTES_MB);

const initialCustomColorScales = get(customColorScales);

function createBlockCache() {
	if (!browser) return undefined;
	return new BrowserBlockCache({
		blockSize: get(cacheBlockSizeKb) * 1024 - HTTP_OVERHEAD_BYTES,
		cacheName: 'open-meteo-maps-cache-v1',
		memCacheTtlMs: 1000,
		maxBytes: get(cacheMaxBytesMb) * 1024 * 1024
	});
}

/**
 * Custom resolver that recognises anomaly URLs (which embed the domain in a
 * `/anomaly/temperature_2m/...` path) and falls back to the default resolver
 * for upstream Open-Meteo URLs.
 */
const ANOMALY_PATH_REGEX = /\/anomaly\/temperature_2m\//;
const customResolveRequest: typeof defaultResolveRequest = (urlComponents, settings) => {
	if (ANOMALY_PATH_REGEX.test(urlComponents.baseUrl)) {
		const domain = settings.domainOptions.find((d) => d.value === ANOMALY_DOMAIN);
		if (!domain) {
			throw new Error(`Anomaly domain not registered: ${ANOMALY_DOMAIN}`);
		}
		// Réutilise les renderOptions par défaut (tileSize, color scale, etc.) via
		// un baseUrl synthétique. La color scale divergente est imposée en
		// surchargeant la clé `temperature_2m_anomaly` dans `settings.colorScales`
		// (voir plus bas), que le resolver par défaut résout pour cette variable.
		const synthetic = {
			...urlComponents,
			baseUrl: urlComponents.baseUrl.replace(ANOMALY_PATH_REGEX, `/data_spatial/${ANOMALY_DOMAIN}/`)
		};
		const { renderOptions } = defaultResolveRequest(synthetic, settings);
		return {
			dataOptions: { domain, variable: ANOMALY_VARIABLE, bounds: undefined },
			renderOptions
		};
	}
	return defaultResolveRequest(urlComponents, settings);
};

/** Échelles de couleur « standard » de l'app (défaut du package + nos palettes
 *  infoclimat / anomalie), AVANT toute personnalisation utilisateur. Sert de
 *  référence pour le bouton « réinitialiser aux couleurs standard ». */
export const standardColorScales = {
	...defaultOmProtocolSettings.colorScales,
	temperature: infoclimatTemperatureScale,
	temperature_2m_anomaly: temperatureAnomalyScale,
	// Clé exacte `precipitation_sum` : prioritaire sur la résolution par famille
	// du package (qui mapperait sinon vers l'échelle `precipitation` saturant à
	// 30 mm). Voir color-scales/precipitation-sum.ts.
	precipitation_sum: precipitationSumScale,

	// Domaine arome_france_convection — clés exactes (priment sur les défauts package
	// et la résolution par préfixe). `precipitation_type` et `precipitation_type_severe`
	// partagent la même colormap catégorielle.
	radar_reflectivity: radarReflectivityScale,
	brightness_temperature: brightnessTemperatureScale,
	brightness_temperature_wv: brightnessTemperatureWvScale,
	cape: capeScale,
	convective_inhibition: convectiveInhibitionScale,
	visibility: visibilityScale,
	lightning_density: lightningDensityScale,
	// `precipitable_water` (colonne de vapeur d'eau, kg/m² ≈ mm) : sans clé exacte,
	// le package retombe sur le fallback `temperature` (°C, bornes −80→50) — la
	// légende affichait des températures. Échelle « humidité » dédiée en mm.
	precipitable_water: precipitableWaterScale,
	precipitation_type: precipitationTypeScale,
	precipitation_type_severe: precipitationTypeScale,

	// Domaine arome_france_hd (Infoclimat) — clés exactes. Sans elles, la résolution
	// par famille/fallback du package les mappe sur une échelle absurde :
	//   - `*_sum` n'est PAS strippé → graupel_sum / snow_graupel_sum /
	//     snowfall_water_equivalent_sum tombent sur le fallback `temperature` (°C) alors
	//     que ce sont des cumuls en mm. → échelle `precipitation` (mm).
	//   - `reflectivity_max` → fallback `temperature` (°C) au lieu de dBZ radar.
	//   - `wind_chill_2m` → famille `wind` (m/s) alors que c'est une température
	//     ressentie (°C). → échelle température infoclimat.
	// (`humidex` tombe déjà sur le fallback `temperature` = infoclimat °C, ce qui est
	//  correct pour un indice en °C ; on le fige ici pour ne pas dépendre du fallback.)
	reflectivity_max: radarReflectivityScale,
	graupel_sum: defaultOmProtocolSettings.colorScales.precipitation,
	snow_graupel_sum: defaultOmProtocolSettings.colorScales.precipitation,
	snowfall_water_equivalent_sum: defaultOmProtocolSettings.colorScales.precipitation,
	wind_chill_2m: infoclimatTemperatureScale,
	humidex: infoclimatTemperatureScale,

	// Domaine arome_france (Infoclimat) — variables d'altitude/dérivées ajoutées
	// au-delà des 12 surfaces historiques. Clés exactes : sans elles, la
	// résolution par famille du package retombe sur `temperature` (°C), absurde
	// pour ces champs.
	//   - `snowfall_sum` : cumul de neige (`*_sum` non strippé) → échelle cm.
	//   - `theta_e_850hPa` (K) / `theta_w_850hPa` (°C) : températures potentielles.
	//   - `thickness_500_1000hPa` (gpm) : épaisseur de couche.
	//   - `absolute_vorticity_500hPa` : valeurs ×1e5 dans postReadCallback → ×10⁻⁵ s⁻¹.
	//   - `geopotential_height_pv1500` (m) : altitude tropopause dynamique — la
	//     sous-chaîne `geopotential_height` fait retomber le package sur les
	//     bornes 500 hPa (4600-6000 m), bien trop étroites.
	snowfall_sum: snowfallSumScale,
	theta_e_850hPa: thetaEScale,
	theta_w_850hPa: thetaWScale,
	thickness_500_1000hPa: thicknessScale,
	absolute_vorticity_500hPa: absoluteVorticityScale,
	geopotential_height_pv1500: geopotentialPv1500Scale
};

export const omProtocolSettings: Writable<OmProtocolSettings> = writable({
	...defaultOmProtocolSettings,
	// static
	fileReaderConfig: {
		useSAB: true,
		cache: createBlockCache()
	},
	resolveRequest: customResolveRequest,

	// dynamic (can be changed during runtime)
	// `standardColorScales` (défaut + palettes infoclimat/anomalie) surchargé par
	// les customisations persistées de l'utilisateur.
	colorScales: {
		...standardColorScales,
		...initialCustomColorScales
	},

	postReadCallback: (_omFileReader: WeatherMapLayerFileReader, data: Data, state: OmUrlState) => {
		if (
			state.dataOptions.domain.value === 'ecmwf_ifs' &&
			state.dataOptions.variable === 'pressure_msl'
		) {
			if (data.values) {
				data.values = data.values?.map((value) => value / 100);
			}
		}
		// Tourbillon absolu AROME France : valeurs brutes en s⁻¹ (~1e-4),
		// mises à l'échelle ×1e5 pour être lisibles (×10⁻⁵ s⁻¹) — la colormap
		// `absoluteVorticityScale` et la légende raisonnent dans cette unité.
		if (
			state.dataOptions.domain.value === 'arome_france' &&
			state.dataOptions.variable === 'absolute_vorticity_500hPa'
		) {
			if (data.values) {
				data.values = data.values?.map((value) => value * 1e5);
			}
		}
	}
});
