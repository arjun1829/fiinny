/**
 * Minimal ZIP writer (STORE method, no compression).
 *
 * PDFs are already compressed internally, so deflating them again gains very
 * little — storing keeps this dependency-free and fast. Output opens in
 * Windows Explorer, macOS Archive Utility, WhatsApp/Gmail previews, 7-Zip etc.
 */

export interface ZipEntry {
    /** Path inside the archive, forward slashes for folders ("Sales/INV-1.pdf"). */
    name: string;
    data: Uint8Array;
    date?: Date;
}

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
    if (CRC_TABLE) return CRC_TABLE;
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    CRC_TABLE = t;
    return t;
}

export function crc32(data: Uint8Array): number {
    const t = crcTable();
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
    const year = Math.max(1980, d.getFullYear());
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
        date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
}

/** Builds a .zip archive. Duplicate names are made unique with " (2)", " (3)"… */
export function buildZip(entries: ZipEntry[]): Uint8Array {
    const enc = new TextEncoder();
    const used = new Set<string>();
    const uniq = (name: string) => {
        let candidate = name;
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base} (${i})${ext}`;
        used.add(candidate.toLowerCase());
        return candidate;
    };

    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;

    for (const e of entries) {
        const nameBytes = enc.encode(uniq(e.name));
        const crc = crc32(e.data);
        const size = e.data.length;
        const { time, date } = dosDateTime(e.date ?? new Date());
        const FLAG_UTF8 = 0x0800;

        const local = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);          // version needed
        lv.setUint16(6, FLAG_UTF8, true);
        lv.setUint16(8, 0, true);           // method: store
        lv.setUint16(10, time, true);
        lv.setUint16(12, date, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        local.set(nameBytes, 30);

        const central = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);          // version made by
        cv.setUint16(6, 20, true);          // version needed
        cv.setUint16(8, FLAG_UTF8, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, time, true);
        cv.setUint16(14, date, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);          // extra
        cv.setUint16(32, 0, true);          // comment
        cv.setUint16(34, 0, true);          // disk
        cv.setUint16(36, 0, true);          // internal attrs
        cv.setUint32(38, 0, true);          // external attrs
        cv.setUint32(42, offset, true);
        central.set(nameBytes, 46);

        locals.push(local, e.data);
        centrals.push(central);
        offset += local.length + size;
    }

    const centralSize = centrals.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const out = new Uint8Array(offset + centralSize + end.length);
    let p = 0;
    for (const part of [...locals, ...centrals, end]) { out.set(part, p); p += part.length; }
    return out;
}

/** Triggers a browser download of raw bytes. */
export function downloadBytes(bytes: Uint8Array, fileName: string, mime = 'application/zip'): void {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
