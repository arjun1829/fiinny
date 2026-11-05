/**
 * Turns one of our existing print HTML documents into a PDF file, so the PDF
 * looks exactly like the printed bill the customer gets.
 *
 * The HTML is loaded into an off-screen iframe (isolated from the app's CSS
 * and dark mode), photographed with html2canvas and placed on PDF pages.
 * Bills longer than one page are split across pages.
 */
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface HtmlToPdfOptions {
    /** CSS width the document is laid out at (px). */
    widthPx: number;
    format: 'a4' | 'a3';
    orientation: 'portrait' | 'landscape';
    /** Page margin in mm. */
    marginMm?: number;
}

/** Sharp enough for small invoice text at 2× scale while keeping a bill ~150–250 KB. */
const JPEG_QUALITY = 0.72;

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Waits for images (logo, signature) to load or fail — never longer than `ms`. */
async function imagesSettled(doc: Document, ms: number) {
    const imgs = Array.from(doc.images).filter(i => !i.complete);
    if (!imgs.length) return;
    await Promise.race([
        Promise.all(imgs.map(i => new Promise<void>(res => { i.onload = i.onerror = () => res(); }))),
        wait(ms),
    ]);
}

export async function htmlToPdf(html: string, opts: HtmlToPdfOptions): Promise<Uint8Array> {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    // Tiny viewport height so scrollHeight measures the bill itself, not the viewport.
    iframe.style.cssText = `position:fixed;left:-20000px;top:0;width:${opts.widthPx}px;height:10px;border:0;visibility:hidden;`;
    document.body.appendChild(iframe);
    try {
        const doc = iframe.contentDocument!;
        doc.open();
        // Images in our bills are remote (logo, signature); request them with CORS so
        // they can be drawn. If the host refuses, the bill still renders without them.
        doc.write(html.replace(/<img(?![^>]*crossorigin)/gi, '<img crossorigin="anonymous"'));
        doc.close();
        await imagesSettled(doc, 4000);
        if (doc.fonts?.ready) await Promise.race([doc.fonts.ready, wait(2000)]);

        const body = doc.body;
        const height = Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height, 100));
        iframe.style.height = `${height}px`;

        const canvas = await html2canvas(doc.documentElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: opts.widthPx,
            height,
            windowWidth: opts.widthPx,
            windowHeight: height,
        });

        const pdf = new jsPDF({ orientation: opts.orientation, unit: 'mm', format: opts.format, compress: true });
        const margin = opts.marginMm ?? 8;
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const usableW = pageW - 2 * margin;
        const usableH = pageH - 2 * margin;
        const mmPerPx = usableW / canvas.width;
        const sliceHpx = Math.floor(usableH / mmPerPx);

        // Cut the tall image into page-sized slices, nudging each cut up to a
        // blank-ish pixel row so no line of text is split across pages.
        const src = canvas.getContext('2d', { willReadFrequently: true })!;
        const inkAt = (row: number) => {
            const px = src.getImageData(0, row, canvas.width, 1).data;
            let dark = 0;
            for (let i = 0; i < px.length; i += 8) if (px[i] + px[i + 1] + px[i + 2] < 600) dark++;
            return dark;
        };
        const bestCut = (from: number, ideal: number) => {
            if (ideal >= canvas.height) return canvas.height;
            const floor = Math.max(from + 1, ideal - Math.floor(sliceHpx * 0.2));
            let best = ideal, bestInk = Infinity;
            for (let r = ideal; r >= floor; r--) {
                const ink = inkAt(r);
                if (ink < bestInk) { best = r; bestInk = ink; if (ink === 0) break; }
            }
            return best;
        };
        for (let y = 0, page = 0; y < canvas.height; page++) {
            const cut = bestCut(y, y + sliceHpx);
            const h = cut - y;
            const slice = document.createElement('canvas');
            slice.width = canvas.width;
            slice.height = h;
            const ctx = slice.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, slice.width, h);
            ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
            if (page > 0) pdf.addPage();
            pdf.addImage(slice.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', margin, margin, usableW, h * mmPerPx, undefined, 'FAST');
            y = cut;
        }
        return new Uint8Array(pdf.output('arraybuffer'));
    } finally {
        iframe.remove();
    }
}
