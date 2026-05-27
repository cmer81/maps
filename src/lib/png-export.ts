import type { Map as MaplibreMap } from 'maplibre-gl';

export interface PngLegendEntry {
	value: string;
	color: [number, number, number, number] | [number, number, number];
}

export interface PngWatermarkDetails {
	title: string;
	leadTimeLabel: string;
	domainLabel: string;
	variableLabel: string;
	modelRun: Date;
	validTime: Date;
	frameIndex: number;
	frameCount: number;
	credits?: string;
	legend?: {
		unit?: string;
		opacity: number;
		entries: PngLegendEntry[];
	};
}

export type PngExportFormat = 'current-view' | 'square';

type PngWatermarkRenderDetails = PngWatermarkDetails & {
	logo?: HTMLImageElement;
};

export interface ZipFileEntry {
	name: string;
	blob: Blob;
}

const encoder = new TextEncoder();
const INFOCLIMAT_LOGO_URL = 'https://static.infoclimat.net/images/v5.1/logo_IC_5.1.png';
let logoPromise: Promise<HTMLImageElement | undefined> | undefined;

const pad = (value: number): string => String(value).padStart(2, '0');

export const formatUtcStamp = (date: Date): string =>
	`${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}_${pad(
		date.getUTCHours()
	)}${pad(date.getUTCMinutes())}Z`;

const formatUtcReadable = (date: Date): string =>
	`${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(
		date.getUTCHours()
	)}:${pad(date.getUTCMinutes())} UTC`;

export const sanitizeFilenamePart = (value: string): string =>
	value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80) || 'carte';

const blobFromCanvas = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
	new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error(`Failed to encode canvas as ${type}`));
			},
			type,
			quality
		);
	});

const loadInfoclimatLogo = (): Promise<HTMLImageElement | undefined> => {
	if (logoPromise) return logoPromise;
	logoPromise = new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => resolve(undefined);
		img.src = INFOCLIMAT_LOGO_URL;
	});
	return logoPromise;
};

const colorCss = (
	[colorR, colorG, colorB, colorA]: [number, number, number, number] | [number, number, number],
	opacity = 1
): string => `rgba(${colorR}, ${colorG}, ${colorB}, ${((colorA ?? 1) * opacity).toFixed(3)})`;

const drawColorLegend = (
	ctx: CanvasRenderingContext2D,
	width: number,
	y: number,
	padding: number,
	scale: number,
	details: NonNullable<PngWatermarkDetails['legend']>
) => {
	if (details.entries.length === 0) return;

	const legendHeight = Math.round(18 * scale);
	const labelSize = Math.round(11 * scale);
	const labelGap = Math.round(5 * scale);
	const labelY = y + legendHeight + labelGap;
	const unitWidth = details.unit ? Math.round(46 * scale) : 0;
	const x = padding;
	const w = width - padding * 2 - unitWidth;
	const segmentWidth = w / details.entries.length;

	ctx.save();
	for (let i = 0; i < details.entries.length; i++) {
		ctx.fillStyle = colorCss(details.entries[i].color, details.opacity);
		ctx.fillRect(x + i * segmentWidth, y, Math.ceil(segmentWidth) + 1, legendHeight);
	}

	ctx.strokeStyle = 'rgba(255, 255, 255, 0.36)';
	ctx.lineWidth = Math.max(1, scale);
	ctx.strokeRect(x, y, w, legendHeight);

	const maxLabels = 7;
	const labelIndexes = new Set<number>();
	const labelCount = Math.min(maxLabels, details.entries.length);
	const last = details.entries.length - 1;
	for (let i = 0; i < labelCount; i++) {
		labelIndexes.add(Math.round((i * last) / (labelCount - 1 || 1)));
	}

	ctx.font = `600 ${labelSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
	ctx.textBaseline = 'top';
	for (const i of labelIndexes) {
		const entry = details.entries[i];
		const lx = x + i * segmentWidth + segmentWidth / 2;
		ctx.textAlign = i === 0 ? 'left' : i === last ? 'right' : 'center';
		ctx.fillText(entry.value, i === 0 ? x : i === last ? x + w : lx, labelY);
	}

	if (details.unit) {
		ctx.textAlign = 'right';
		ctx.fillText(details.unit, width - padding, labelY);
	}
	ctx.restore();
};

const drawWatermark = (
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	details: PngWatermarkRenderDetails
) => {
	const scale = Math.max(1, Math.min(width / 1200, 2));
	const hasLegend = Boolean(details.legend?.entries.length);
	const bandHeight = Math.round((hasLegend ? 118 : 76) * scale);
	const padding = Math.round(18 * scale);
	const titleSize = Math.round(16 * scale);
	const metaSize = Math.round(13 * scale);
	const y = height - bandHeight;
	const textTop = hasLegend ? y + Math.round(58 * scale) : y + Math.round(8 * scale);

	ctx.save();
	ctx.fillStyle = 'rgba(8, 12, 20, 0.78)';
	ctx.fillRect(0, y, width, bandHeight);

	if (details.legend) {
		drawColorLegend(ctx, width, y + Math.round(10 * scale), padding, scale, details.legend);
	}

	const logoY = textTop + Math.round(5 * scale);
	const siteLabel = 'infoclimat.fr';
	if (details.logo) {
		const maxLogoWidth = Math.round(170 * scale);
		const maxLogoHeight = Math.round(48 * scale);
		const logoRatio = details.logo.naturalWidth / details.logo.naturalHeight;
		const drawWidth = Math.min(maxLogoWidth, maxLogoHeight * logoRatio);
		const drawHeight = drawWidth / logoRatio;
		ctx.drawImage(details.logo, padding, logoY, drawWidth, drawHeight);
		ctx.font = `700 ${Math.round(14 * scale)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
		ctx.fillText(
			siteLabel,
			padding + drawWidth + Math.round(10 * scale),
			textTop + Math.round(22 * scale)
		);
	} else {
		const markSize = Math.round(34 * scale);
		ctx.fillStyle = '#1d5fa7';
		ctx.fillRect(padding, logoY + Math.round(3 * scale), markSize, markSize);
		ctx.fillStyle = '#ffffff';
		ctx.font = `800 ${Math.round(15 * scale)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('IC', padding + markSize / 2, logoY + Math.round(3 * scale) + markSize / 2);

		const brandX = padding + markSize + Math.round(10 * scale);
		ctx.fillStyle = '#ffffff';
		ctx.font = `700 ${Math.round(17 * scale)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		ctx.fillText('Infoclimat', brandX, textTop + Math.round(8 * scale));

		ctx.font = `500 ${metaSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
		ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
		ctx.fillText(siteLabel, brandX, textTop + Math.round(29 * scale));
	}

	const runLabel = `Run ${formatUtcStamp(details.modelRun)}`;
	const validLabel = `Validité ${formatUtcStamp(details.validTime)}`;
	const validReadableLabel = `Échéance ${formatUtcReadable(details.validTime)}`;
	const frameLabel = `${details.frameIndex + 1}/${details.frameCount}`;
	const rightLine1 = `${details.title} - ${validReadableLabel}`;
	const rightLine2 = `${details.domainLabel} - ${details.leadTimeLabel} - ${runLabel} - ${validLabel} - ${frameLabel}`;

	ctx.textAlign = 'right';
	ctx.textBaseline = 'top';
	ctx.font = `800 ${titleSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
	ctx.fillStyle = '#ffffff';
	ctx.fillText(rightLine1, width - padding, textTop + Math.round(8 * scale));
	ctx.font = `500 ${metaSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
	ctx.fillText(rightLine2, width - padding, textTop + Math.round(31 * scale));

	ctx.restore();
};

export const captureWatermarkedPng = async (
	map: MaplibreMap,
	details: PngWatermarkDetails,
	format: PngExportFormat = 'current-view'
): Promise<Blob> => {
	const source = map.getCanvas();
	const canvas = document.createElement('canvas');
	const sourceWidth = source.width;
	const sourceHeight = source.height;

	if (format === 'square') {
		canvas.width = 1080;
		canvas.height = 1080;
	} else {
		canvas.width = sourceWidth;
		canvas.height = sourceHeight;
	}

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D canvas context unavailable');

	if (format === 'square') {
		const cropSize = Math.min(sourceWidth, sourceHeight);
		const sx = Math.round((sourceWidth - cropSize) / 2);
		const sy = Math.round((sourceHeight - cropSize) / 2);
		ctx.drawImage(source, sx, sy, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
	} else {
		ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
	}
	drawWatermark(ctx, canvas.width, canvas.height, {
		...details,
		logo: await loadInfoclimatLogo()
	});
	return blobFromCanvas(canvas, 'image/png');
};

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	crcTable[n] = c >>> 0;
}

const crc32 = (data: Uint8Array): number => {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date: Date): { date: number; time: number } => ({
	date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
	time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
});

const writeU16 = (view: DataView, offset: number, value: number) => {
	view.setUint16(offset, value, true);
};

const writeU32 = (view: DataView, offset: number, value: number) => {
	view.setUint32(offset, value >>> 0, true);
};

const concat = (chunks: Uint8Array[]): Uint8Array => {
	const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const output = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}
	return output;
};

// Tailles, offsets (32 bits) et nombre d'entrées (16 bits) du format ZIP
// classique. Cette implémentation n'émet PAS d'enregistrements ZIP64 : au-delà
// de ces bornes une archive serait silencieusement corrompue, donc on lève une
// erreur explicite. Suffisant pour l'export PNG (séries courtes, < 4 Go).
const ZIP_MAX_U32 = 0xffffffff;
const ZIP_MAX_ENTRIES = 0xffff;

export const createStoredZip = async (entries: ZipFileEntry[]): Promise<Blob> => {
	if (entries.length > ZIP_MAX_ENTRIES) {
		throw new Error(`ZIP: trop d'entrées (${entries.length} > ${ZIP_MAX_ENTRIES}), ZIP64 requis`);
	}

	const chunks: Uint8Array[] = [];
	const centralChunks: Uint8Array[] = [];
	let offset = 0;
	const now = dosDateTime(new Date());

	for (const entry of entries) {
		const name = encoder.encode(entry.name);
		const data = new Uint8Array(await entry.blob.arrayBuffer());
		if (data.length > ZIP_MAX_U32) {
			throw new Error(`ZIP: fichier "${entry.name}" trop volumineux pour un ZIP non-ZIP64`);
		}
		const crc = crc32(data);

		const local = new Uint8Array(30 + name.length);
		const localView = new DataView(local.buffer);
		writeU32(localView, 0, 0x04034b50);
		writeU16(localView, 4, 20);
		writeU16(localView, 6, 0x0800);
		writeU16(localView, 8, 0);
		writeU16(localView, 10, now.time);
		writeU16(localView, 12, now.date);
		writeU32(localView, 14, crc);
		writeU32(localView, 18, data.length);
		writeU32(localView, 22, data.length);
		writeU16(localView, 26, name.length);
		local.set(name, 30);

		chunks.push(local, data);

		const central = new Uint8Array(46 + name.length);
		const centralView = new DataView(central.buffer);
		writeU32(centralView, 0, 0x02014b50);
		writeU16(centralView, 4, 20);
		writeU16(centralView, 6, 20);
		writeU16(centralView, 8, 0x0800);
		writeU16(centralView, 10, 0);
		writeU16(centralView, 12, now.time);
		writeU16(centralView, 14, now.date);
		writeU32(centralView, 16, crc);
		writeU32(centralView, 20, data.length);
		writeU32(centralView, 24, data.length);
		writeU16(centralView, 28, name.length);
		writeU32(centralView, 42, offset);
		central.set(name, 46);
		centralChunks.push(central);

		offset += local.length + data.length;
	}

	const centralOffset = offset;
	if (centralOffset > ZIP_MAX_U32) {
		throw new Error('ZIP: archive trop volumineuse pour un ZIP non-ZIP64 (> 4 Go)');
	}
	const centralDirectory = concat(centralChunks);
	const end = new Uint8Array(22);
	const endView = new DataView(end.buffer);
	writeU32(endView, 0, 0x06054b50);
	writeU16(endView, 8, entries.length);
	writeU16(endView, 10, entries.length);
	writeU32(endView, 12, centralDirectory.length);
	writeU32(endView, 16, centralOffset);

	const zipData = concat([...chunks, centralDirectory, end]);
	const zipBuffer = zipData.buffer.slice(
		zipData.byteOffset,
		zipData.byteOffset + zipData.byteLength
	) as ArrayBuffer;
	return new Blob([zipBuffer], { type: 'application/zip' });
};

export const downloadBlob = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};
