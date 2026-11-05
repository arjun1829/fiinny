import fs from "fs";
import path from "path";

/**
 * Noto fonts bundled with the app and embedded (base64 @font-face) into the
 * invoice HTML before it is rendered to PDF.
 *
 * Why bundle rather than rely on the host: the headless Chromium used in
 * production (@sparticuz/chromium) ships with NO system fonts at all, so even
 * Latin text and the ₹ sign would be blank unless we supply the glyphs. The
 * three Noto families together cover Latin + the rupee sign (Noto Sans) plus
 * Devanagari (Marathi/Hindi) and Gujarati with correct OpenType shaping.
 *
 * Read once and cached per process. The files are kept inside the serverless
 * bundle via `outputFileTracingIncludes` in next.config.js.
 */

const FONT_DIR = path.join(process.cwd(), "app/lib/invoice-fonts");

export const FONT_FILES = {
  sansRegular: "NotoSans-Regular.ttf",
  sansBold: "NotoSans-Bold.ttf",
  devRegular: "NotoSansDevanagari-Regular.ttf",
  devBold: "NotoSansDevanagari-Bold.ttf",
  gujRegular: "NotoSansGujarati-Regular.ttf",
  gujBold: "NotoSansGujarati-Bold.ttf",
} as const;

export type InvoiceFontKey = keyof typeof FONT_FILES;

let cache: Record<InvoiceFontKey, string> | null = null;

/** Base64 of each bundled font, cached for the life of the process. */
export function loadInvoiceFontsBase64(): Record<InvoiceFontKey, string> {
  if (cache) return cache;
  const out = {} as Record<InvoiceFontKey, string>;
  for (const key of Object.keys(FONT_FILES) as InvoiceFontKey[]) {
    out[key] = fs.readFileSync(path.join(FONT_DIR, FONT_FILES[key])).toString("base64");
  }
  cache = out;
  return out;
}
