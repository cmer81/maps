import { describe, expect, it } from 'vitest';

import { createStoredZip, formatUtcStamp, sanitizeFilenamePart } from '$lib/png-export';

const u32le = (view: DataView, offset: number) => view.getUint32(offset, true);
const u16le = (view: DataView, offset: number) => view.getUint16(offset, true);

const LOCAL_SIG = 0x04034b50;
const EOCD_SIG = 0x06054b50;

describe('formatUtcStamp', () => {
	it('formats a UTC instant as YYYYMMDD_HHMMZ', () => {
		expect(formatUtcStamp(new Date('2026-05-22T03:00:00Z'))).toBe('20260522_0300Z');
	});

	it('zero-pads month, day, hours and minutes', () => {
		expect(formatUtcStamp(new Date('2026-01-02T04:05:00Z'))).toBe('20260102_0405Z');
	});

	it('reads UTC fields regardless of local timezone offset', () => {
		// 23:30Z must stay the same calendar day in the stamp
		expect(formatUtcStamp(new Date('2026-12-31T23:30:00Z'))).toBe('20261231_2330Z');
	});
});

describe('sanitizeFilenamePart', () => {
	it('strips diacritics and lowercases', () => {
		expect(sanitizeFilenamePart('Précipitation')).toBe('precipitation');
	});

	it('collapses non-alphanumerics into single hyphens', () => {
		expect(sanitizeFilenamePart('temp 2m (°C)')).toBe('temp-2m-c');
	});

	it('trims leading and trailing hyphens', () => {
		expect(sanitizeFilenamePart('  --foo--  ')).toBe('foo');
	});

	it('falls back to "carte" when nothing usable remains', () => {
		expect(sanitizeFilenamePart('***')).toBe('carte');
		expect(sanitizeFilenamePart('')).toBe('carte');
	});

	it('caps the length at 80 characters', () => {
		expect(sanitizeFilenamePart('a'.repeat(200))).toHaveLength(80);
	});
});

describe('createStoredZip', () => {
	it('produces a valid stored ZIP with a standards-correct CRC32', async () => {
		// "123456789" is the canonical CRC-32 check vector → 0xCBF43926.
		const content = new TextEncoder().encode('123456789');
		const zip = await createStoredZip([{ name: 'check.txt', blob: new Blob([content]) }]);
		const buf = new Uint8Array(await zip.arrayBuffer());
		const view = new DataView(buf.buffer);

		expect(u32le(view, 0)).toBe(LOCAL_SIG);
		// CRC field (offset 14) must match the well-known check value.
		expect(u32le(view, 14)).toBe(0xcbf43926);
		// Stored (method 0) → compressed size == uncompressed size == data length.
		expect(u16le(view, 8)).toBe(0); // compression method
		expect(u32le(view, 18)).toBe(content.length); // compressed size
		expect(u32le(view, 22)).toBe(content.length); // uncompressed size
	});

	it('round-trips file names and bytes for multiple entries', async () => {
		const a = new TextEncoder().encode('hello world');
		const b = new Uint8Array([0, 1, 2, 250, 255]);
		const zip = await createStoredZip([
			{ name: 'a.txt', blob: new Blob([a]) },
			{ name: 'b.bin', blob: new Blob([b]) }
		]);
		const buf = new Uint8Array(await zip.arrayBuffer());
		const view = new DataView(buf.buffer);

		// Walk the two local file headers and extract the stored payloads.
		let offset = 0;
		const extracted: { name: string; bytes: Uint8Array }[] = [];
		for (let i = 0; i < 2; i++) {
			expect(u32le(view, offset)).toBe(LOCAL_SIG);
			const size = u32le(view, offset + 18);
			const nameLen = u16le(view, offset + 26);
			const extraLen = u16le(view, offset + 28);
			const nameStart = offset + 30;
			const dataStart = nameStart + nameLen + extraLen;
			extracted.push({
				name: new TextDecoder().decode(buf.subarray(nameStart, nameStart + nameLen)),
				bytes: buf.subarray(dataStart, dataStart + size)
			});
			offset = dataStart + size;
		}

		expect(extracted[0].name).toBe('a.txt');
		expect(extracted[0].bytes).toEqual(a);
		expect(extracted[1].name).toBe('b.bin');
		expect(extracted[1].bytes).toEqual(b);
	});

	it('rejects archives that exceed the 16-bit entry count (would need ZIP64)', async () => {
		const tooMany = Array.from({ length: 0x10000 + 1 }, (_, i) => ({
			name: `${i}.txt`,
			blob: new Blob([new Uint8Array(0)])
		}));
		await expect(createStoredZip(tooMany)).rejects.toThrow(/ZIP64/);
	});

	it('records the entry count in the end-of-central-directory record', async () => {
		const zip = await createStoredZip([
			{ name: 'a.txt', blob: new Blob([new Uint8Array([1])]) },
			{ name: 'b.txt', blob: new Blob([new Uint8Array([2])]) },
			{ name: 'c.txt', blob: new Blob([new Uint8Array([3])]) }
		]);
		const buf = new Uint8Array(await zip.arrayBuffer());
		const view = new DataView(buf.buffer);

		// EOCD is the last 22 bytes (no archive comment).
		const eocd = buf.length - 22;
		expect(u32le(view, eocd)).toBe(EOCD_SIG);
		expect(u16le(view, eocd + 8)).toBe(3); // entries on this disk
		expect(u16le(view, eocd + 10)).toBe(3); // total entries
	});
});
