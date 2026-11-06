/**
 * The shop's brand poster: a 1080×1350 image (Instagram portrait / WhatsApp
 * status friendly) a retailer can post to say "my shop is online on
 * KrishiDukan" — no app or link needed to read it. Drawn on a canvas, so no
 * extra library; same layout as the app's brand_poster.dart.
 *
 * Images go through /api/img (same origin) so the canvas is never tainted by
 * Firebase Storage's missing CORS headers and can still be exported.
 */

export type BrandPosterData = {
  shopName: string;
  tagline: string;
  place: string;
  phone: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  photos: string[];
  highlights: string[];
  /** Up to three numbers to flex, e.g. { value: "145", label: "Products" }. */
  stats?: BrandPosterStat[];
  /** e.g. krishidukan.com/shop/+91… (shown without https://). */
  link: string;
};

export type BrandPosterStat = { value: string; label: string };

/** Compact count for the stats row: 145, 1.2K, 12K. */
export function posterCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
}

export const POSTER_W = 1080;
export const POSTER_H = 1350;

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif`;
const GREEN = "#0f391b";
const GREEN_2 = "#184b25";
const CREAM = "#fbf9f7";

function viaProxy(url: string): string {
  return `/api/img?url=${encodeURIComponent(url)}`;
}

function loadImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 6000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = viaProxy(url);
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws [img] to fill the box, cropping the overflow (CSS object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number, min = 30): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > min && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "K").slice(0, 2)).toUpperCase();
}

/** Draws the poster into [canvas] (resized to POSTER_W × POSTER_H). */
export async function drawBrandPoster(canvas: HTMLCanvasElement, data: BrandPosterData): Promise<void> {
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const photos = data.photos.slice(0, 3);
  const [banner, logo, ...photoImgs] = await Promise.all([
    loadImage(data.bannerUrl),
    loadImage(data.logoUrl),
    ...photos.map(loadImage),
  ]);
  const W = POSTER_W;
  const cx = W / 2;
  const PAD = 64;

  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, POSTER_H);

  // ── Banner ──
  const BANNER_H = 470;
  if (banner) {
    drawCover(ctx, banner, 0, 0, W, BANNER_H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, BANNER_H);
    g.addColorStop(0, GREEN_2);
    g.addColorStop(1, GREEN);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, BANNER_H);
  }
  const shade = ctx.createLinearGradient(0, BANNER_H * 0.45, 0, BANNER_H);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, BANNER_H);

  // "Now online" pill
  ctx.font = `800 34px ${FONT}`;
  const pill = "●  NOW ONLINE ON KRISHIDUKAN";
  const pw = ctx.measureText(pill).width + 56;
  roundRect(ctx, cx - pw / 2, 44, pw, 70, 35);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.fillStyle = GREEN;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pill, cx, 80);

  // ── Logo ──
  const L = 250;
  const ly = BANNER_H - L / 2 - 20;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 30;
  roundRect(ctx, cx - L / 2, ly, L, L, 56);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, cx - L / 2 + 10, ly + 10, L - 20, L - 20, 48);
  ctx.clip();
  if (logo) {
    drawCover(ctx, logo, cx - L / 2 + 10, ly + 10, L - 20, L - 20);
  } else {
    ctx.fillStyle = GREEN_2;
    ctx.fillRect(cx - L / 2, ly, L, L);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 96px ${FONT}`;
    ctx.fillText(initials(data.shopName), cx, ly + L / 2);
  }
  ctx.restore();

  // ── Name, tagline, place ──
  let y = ly + L + 70;
  ctx.fillStyle = "#1b1c1b";
  fitFont(ctx, data.shopName, 800, 76, W - PAD * 2, 40);
  ctx.fillText(ellipsize(ctx, data.shopName, W - PAD * 2), cx, y);
  y += 72;
  if (data.tagline) {
    ctx.fillStyle = "#42493e";
    ctx.font = `500 36px ${FONT}`;
    ctx.fillText(ellipsize(ctx, data.tagline, W - PAD * 2), cx, y);
    y += 56;
  }
  if (data.place) {
    ctx.fillStyle = GREEN;
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText(ellipsize(ctx, `📍 ${data.place}`, W - PAD * 2), cx, y);
    y += 50;
  }

  // ── Stats (e.g. 145 Products · 40 Dealers) ──
  const stats = (data.stats ?? []).slice(0, 3);
  if (stats.length) {
    y += 24;
    const colW = Math.min(280, (W - PAD * 2) / stats.length);
    const startX = cx - (colW * stats.length) / 2;
    stats.forEach((s, i) => {
      const x = startX + colW * i + colW / 2;
      if (i > 0) {
        ctx.fillStyle = "#d5ddd2";
        ctx.fillRect(startX + colW * i - 1, y - 24, 2, 72);
      }
      ctx.fillStyle = GREEN;
      ctx.font = `800 52px ${FONT}`;
      ctx.fillText(s.value, x, y);
      ctx.fillStyle = "#42493e";
      ctx.font = `600 26px ${FONT}`;
      ctx.fillText(ellipsize(ctx, s.label, colW - 20), x, y + 42);
    });
    y += 84;
  }

  // ── Highlights (one centered row of up to 3 chips) ──
  const chips = data.highlights.slice(0, 3);
  if (chips.length) {
    y += 20;
    ctx.font = `700 30px ${FONT}`;
    const widths = chips.map((c) => Math.min(ctx.measureText(c).width + 48, 320));
    const total = widths.reduce((a, b) => a + b, 0) + (chips.length - 1) * 16;
    let x = cx - total / 2;
    chips.forEach((c, i) => {
      roundRect(ctx, x, y - 30, widths[i], 60, 30);
      ctx.fillStyle = "#e6f0e3";
      ctx.fill();
      ctx.fillStyle = GREEN;
      ctx.fillText(ellipsize(ctx, c, widths[i] - 40), x + widths[i] / 2, y);
      x += widths[i] + 16;
    });
    y += 50;
  }

  // ── Photo strip ──
  const FOOTER_Y = POSTER_H - 220;
  const imgs = photoImgs.filter((p): p is HTMLImageElement => !!p);
  if (imgs.length) {
    const gap = 16;
    const size = Math.min(220, FOOTER_Y - y - 40, (W - PAD * 2 - gap * (imgs.length - 1)) / imgs.length);
    if (size >= 90) {
      const total = imgs.length * size + (imgs.length - 1) * gap;
      let x = cx - total / 2;
      const top = y + 20;
      for (const img of imgs) {
        ctx.save();
        roundRect(ctx, x, top, size, size, 28);
        ctx.clip();
        drawCover(ctx, img, x, top, size, size);
        ctx.restore();
        x += size + gap;
      }
    }
  }

  // ── Footer ──
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, FOOTER_Y, W, POSTER_H - FOOTER_Y);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText("Order on the KrishiDukan app", cx, FOOTER_Y + 62);
  ctx.font = `600 32px ${FONT}`;
  ctx.fillStyle = "#bce6c1";
  ctx.fillText(ellipsize(ctx, `Call / WhatsApp ${data.phone}`, W - PAD * 2), cx, FOOTER_Y + 118);
  ctx.fillStyle = "#ffffff";
  fitFont(ctx, data.link, 700, 32, W - PAD * 2, 22);
  ctx.fillText(data.link, cx, FOOTER_Y + 172);
}

export function posterToFile(canvas: HTMLCanvasElement, shopName: string): Promise<File | null> {
  const safe = shopName.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "shop";
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], `${safe}-krishidukan.png`, { type: "image/png" }) : null);
      }, "image/png");
    } catch {
      resolve(null);
    }
  });
}
