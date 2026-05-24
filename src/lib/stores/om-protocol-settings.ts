import { type Writable, get, writable } from 'svelte/store';

import { BrowserBlockCache } from '@openmeteo/file-reader';
import {
	type WeatherMapLayerFileReader,
	defaultOmProtocolSettings,
	defaultResolveRequest
} from '@openmeteo/weather-map-layer';
import { persisted } from 'svelte-persisted-store';

import { browser } from '$app/environment';

import {
	DEFAULT_CACHE_BLOCK_SIZE_KB,
	DEFAULT_CACHE_MAX_BYTES_MB,
	HTTP_OVERHEAD_BYTES
} from '$lib/constants';
import { getNextOmUrls } from '$lib/url';

import { metaJson } from './time';
import { selectedDomain } from './variables';

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
 * Custom resolver that recognises infoclimat-om-worker URLs (which embed the
 * domain in a `/v1/sum/<domain>/...` path) and falls back to the default
 * resolver for upstream Open-Meteo URLs.
 */
const WORKER_DOMAIN_REGEX = /\/v1\/sum\/(?<domain>[^/]+)\//;
const cumulAwareResolveRequest: typeof defaultResolveRequest = (urlComponents, settings) => {
	const match = urlComponents.baseUrl.match(WORKER_DOMAIN_REGEX);
	if (!match?.groups?.domain) {
		return defaultResolveRequest(urlComponents, settings);
	}
	const domainValue = match.groups.domain;
	const domain = settings.domainOptions.find((d) => d.value === domainValue);
	if (!domain) {
		throw new Error(`Invalid domain in worker URL: ${domainValue}`);
	}
	const variable = urlComponents.params.get('variable');
	if (!variable) {
		throw new Error('Variable is required but not defined');
	}
	// Reuse default render options (color scale, tile size, etc.) by re-running
	// the default resolver against a synthetic baseUrl that the regex accepts.
	const synthetic = {
		...urlComponents,
		baseUrl: urlComponents.baseUrl.replace(WORKER_DOMAIN_REGEX, `/data_spatial/${domainValue}/`)
	};
	const { renderOptions } = defaultResolveRequest(synthetic, settings);
	return { dataOptions: { domain, variable, bounds: undefined }, renderOptions };
};

export const omProtocolSettings: Writable<OmProtocolSettings> = writable({
	...defaultOmProtocolSettings,
	// static
	fileReaderConfig: {
		useSAB: true,
		cache: createBlockCache()
	},
	resolveRequest: cumulAwareResolveRequest,

	// dynamic (can be changed during runtime)
	colorScales: { ...defaultOmProtocolSettings.colorScales, ...initialCustomColorScales },

	postReadCallback: (omFileReader: WeatherMapLayerFileReader, data: Data, state: OmUrlState) => {
		const nextOmUrls = getNextOmUrls(state.omFileUrl, get(selectedDomain), get(metaJson));
		for (const nextOmUrl of nextOmUrls) {
			if (nextOmUrl === undefined) continue;
			omFileReader.setToOmFile(nextOmUrl);
			// This will trigger a request to the tail of the file and cache it
			// Not requesting a real variable ensures that we don't request any additional data.
			omFileReader.prefetchVariable('not_a_real_variable');
		}
		if (
			state.dataOptions.domain.value === 'ecmwf_ifs' &&
			state.dataOptions.variable === 'pressure_msl'
		) {
			if (data.values) {
				data.values = data.values?.map((value) => value / 100);
			}
		}
	}
});
