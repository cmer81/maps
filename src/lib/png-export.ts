import { type CaptureOrientation, computeSourceCrop } from '$lib/capture-geometry';

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

type PngWatermarkRenderDetails = PngWatermarkDetails & {
	logo?: HTMLImageElement;
};

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

export const loadInfoclimatLogo = (): Promise<HTMLImageElement | undefined> => {
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

export interface PngCaptureRegion {
	/** px CSS dans le repère viewport (origine en haut à gauche) */
	x: number;
	y: number;
	w: number;
	h: number;
	orientation: CaptureOrientation;
	/** dimensions CSS du viewport — le canvas MapLibre les couvre entièrement */
	viewportW: number;
	viewportH: number;
}

/** Dimensions du canvas d'export selon l'orientation (4:3 paysage / 3:4 portrait). */
export const getExportDimensions = (
	orientation: CaptureOrientation
): { width: number; height: number } =>
	orientation === 'landscape' ? { width: 1440, height: 1080 } : { width: 1080, height: 1440 };

/**
 * Compose une frame sur un `ctx` existant : crop de la zone visible de la carte
 * (px viewport → px canvas source) puis watermark daté. Partagé par la capture
 * PNG unitaire et l'export vidéo (un seul rendu de filigrane à maintenir).
 */
export const drawCaptureFrame = (
	ctx: CanvasRenderingContext2D,
	source: CanvasImageSource & { width: number; height: number },
	region: PngCaptureRegion,
	details: PngWatermarkDetails,
	logo: HTMLImageElement | undefined,
	destW: number,
	destH: number
): void => {
	const { sx, sy, sw, sh } = computeSourceCrop(
		region,
		region.viewportW,
		region.viewportH,
		source.width,
		source.height
	);
	ctx.drawImage(source, sx, sy, sw, sh, 0, 0, destW, destH);
	drawWatermark(ctx, destW, destH, { ...details, logo });
};

export const captureWatermarkedPng = async (
	map: MaplibreMap,
	details: PngWatermarkDetails,
	region: PngCaptureRegion
): Promise<Blob> => {
	const source = map.getCanvas();
	const { width, height } = getExportDimensions(region.orientation);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D canvas context unavailable');

	drawCaptureFrame(ctx, source, region, details, await loadInfoclimatLogo(), width, height);
	return blobFromCanvas(canvas, 'image/png');
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
