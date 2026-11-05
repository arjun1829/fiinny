import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { buildInvoiceHtml, type InvoiceSellerInfo } from "./invoice-html";
import type { OrderDoc } from "../../types/order";

/**
 * Server-side invoice PDF rendering via headless Chromium (in-process).
 *
 * jsPDF cannot shape Indic scripts (no OpenType/HarfBuzz), so Marathi/Hindi/
 * Gujarati customer and product names came out broken or blank. Chromium shapes
 * complex scripts correctly and subsets+embeds the bundled Noto fonts (inlined
 * into the HTML by buildInvoiceHtml), so the PDF reads identically on every
 * device/viewer.
 *
 * Environment:
 *   - Production (Linux / Firebase App Hosting → Cloud Run): the Chromium binary
 *     from @sparticuz/chromium. NOTE: Chromium needs ~1 GB per render, so the
 *     App Hosting instance must be sized accordingly (apphosting.yaml).
 *   - Local dev (macOS/Windows): a locally installed Chrome, via
 *     PUPPETEER_EXECUTABLE_PATH / CHROME_PATH or the default path.
 *
 * Chromium is launched per render and always closed in `finally`. A throw is a
 * soft failure: callers (lib/order-invoice.ts) retry via the invoice sweep.
 */

chromium.setGraphicsMode = false;

async function resolveExecutablePath(): Promise<string> {
  const override = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (override) return override;
  if (process.platform === "linux") return chromium.executablePath();
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
}

async function launchBrowser(): Promise<Browser> {
  const isLinux = process.platform === "linux";
  return puppeteer.launch({
    args: isLinux ? chromium.args : ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1240, height: 1754 }, // ~A4 @ 150dpi
    executablePath: await resolveExecutablePath(),
    headless: true,
  });
}

/** Renders the invoice for `order` and returns the PDF bytes. */
export async function renderInvoicePdf(
  order: OrderDoc,
  seller?: InvoiceSellerInfo,
): Promise<Buffer> {
  const html = buildInvoiceHtml(order, seller);
  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    // All assets (fonts) are inlined as data: URLs, so just wait for parse.
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close().catch(() => {/* ignore */});
  }
}
