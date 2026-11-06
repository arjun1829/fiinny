/**
 * The "Share my stats" image: a 1080×1920 card (Instagram / WhatsApp story
 * size) with the seller's numbers for the chosen period, drawn on a canvas so
 * it needs no extra library. Same layout and choices as the app's
 * mobile/lib/features/dashboard/widgets/stats_share_card.dart.
 */

export type StatsShareData = {
  shopName: string;
  logoUrl?: string | null;
  /** e.g. "Last 7 days" or "12 Sep – 18 Sep". */
  periodLabel: string;
  /** krishidukan.com/shop/+91… (shown without https://), or null. */
  link: string | null;
  orders: number;
  revenue: number;
  productViews: number;
  calls: number;
  followers: number;
  reelViews: number;
  bestSeller: string | null;
  /** Orders per day (or per bucket) across the period, oldest first. */
  trend: { label: string; value: number }[];
};

export type StatsShareMetric =
  | "orders"
  | "revenue"
  | "productViews"
  | "calls"
  | "followers"
  | "reelViews"
  | "bestSeller"
  | "trend"
  | "link";

export const STATS_SHARE_METRICS: { key: StatsShareMetric; label: string }[] = [
  { key: "orders", label: "Orders" },
  { key: "revenue", label: "Sales (₹)" },
  { key: "productViews", label: "Product views" },
  { key: "calls", label: "Calls" },
  { key: "followers", label: "Followers" },
  { key: "reelViews", label: "Reel views" },
  { key: "bestSeller", label: "Best seller" },
  { key: "trend", label: "Orders chart" },
  { key: "link", label: "Shop link" },
];

/** Sales are off until the seller turns them on: it's their business figure. */
export const DEFAULT_STATS_SHARE: Record<StatsShareMetric, boolean> = {
  orders: true,
  revenue: false,
  productViews: true,
  calls: true,
  followers: true,
  reelViews: true,
  bestSeller: true,
  trend: true,
  link: true,
};

export const CARD_W = 1080;
export const CARD_H = 1920;

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`;

/** 1,234 · 12.3K · 1.2L · 1.1Cr (Indian units above a lakh). */
export function compactNumber(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1e7) return `${trim(v / 1e7)}Cr`;
  if (v >= 1e5) return `${trim(v / 1e5)}L`;
  if (v >= 1e4) return `${trim(v / 1e3)}K`;
  return v.toLocaleString("en-IN");
}

function trim(x: number): string {
  return x >= 100 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, "");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "K").slice(0, 2)).toUpperCase();
}

/** Loads the logo for drawing; null when it can't be used (e.g. no CORS). */
export function loadLogo(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 4000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
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

/** Shrinks the font until the text fits [maxWidth]; returns the size used. */
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number, min = 28): number {
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

export function statTiles(
  data: StatsShareData,
  show: Record<StatsShareMetric, boolean>,
): { label: string; value: string }[] {
  const all: { key: StatsShareMetric; label: string; n: number; value: string }[] = [
    { key: "orders", label: "Orders", n: data.orders, value: compactNumber(data.orders) },
    { key: "revenue", label: "Sales", n: data.revenue, value: `₹${compactNumber(data.revenue)}` },
    { key: "productViews", label: "Product views", n: data.productViews, value: compactNumber(data.productViews) },
    { key: "calls", label: "Calls from farmers", n: data.calls, value: compactNumber(data.calls) },
    { key: "followers", label: "Followers", n: data.followers, value: compactNumber(data.followers) },
    { key: "reelViews", label: "Reel views", n: data.reelViews, value: compactNumber(data.reelViews) },
  ];
  const chosen = all.filter((t) => show[t.key]);
  const nonZero = chosen.filter((t) => Math.round(t.n) > 0);
  const tiles = nonZero.length ? nonZero : chosen.filter((t) => t.key === "orders");
  return tiles.map(({ label, value }) => ({ label, value }));
}

export function drawStatsCard(
  canvas: HTMLCanvasElement,
  data: StatsShareData,
  show: Record<StatsShareMetric, boolean>,
  logo: HTMLImageElement | null,
): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = CARD_W;
  const PAD = 80;

  // Background: deep green, with two soft circles for depth.
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, "#0A1F08");
  bg.addColorStop(0.55, "#12401A");
  bg.addColorStop(1, "#1B5E20");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, CARD_H);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.arc(W - 40, 260, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(60, CARD_H - 300, 260, 0, Math.PI * 2);
  ctx.fill();

  // Wordmark.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText("KrishiDukan", PAD, 140);
  ctx.fillStyle = "#F9A825";
  ctx.font = `700 30px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("SELLER STATS", W - PAD, 138);

  // Logo or initials.
  const cx = W / 2;
  const cy = 330;
  const r = 105;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.fillStyle = "#F9A825";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (logo) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const scale = Math.max((r * 2) / logo.width, (r * 2) / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = "#2E7D32";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 84px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(data.shopName), cx, cy + 4);
  }
  ctx.restore();

  // Shop name and period.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  fitText(ctx, data.shopName, 800, 68, W - PAD * 2, 40);
  ctx.fillText(ellipsize(ctx, data.shopName, W - PAD * 2), cx, 540);
  ctx.font = `600 34px ${FONT}`;
  const pill = data.periodLabel;
  const pw = ctx.measureText(pill).width + 64;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  roundRect(ctx, cx - pw / 2, 580, pw, 64, 32);
  ctx.fill();
  ctx.fillStyle = "#E8F5E9";
  ctx.fillText(pill, cx, 624);

  // Stat tiles, two per row.
  // Zeroes are left out (nothing to show off); orders stay if nothing else is left.
  const tiles = statTiles(data, show);

  let y = 700;
  const gap = 28;
  const tw = (W - PAD * 2 - gap) / 2;
  const th = 210;
  tiles.forEach((t, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    // A lone last tile spans the row.
    const wide = i === tiles.length - 1 && col === 0;
    const x = PAD + col * (tw + gap);
    const ty = y + row * (th + gap);
    const w = wide ? W - PAD * 2 : tw;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(ctx, x, ty, w, th, 36);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#FFFFFF";
    fitText(ctx, t.value, 800, 92, w - 72, 48);
    ctx.fillText(t.value, x + 36, ty + 118);
    ctx.fillStyle = "#C8E6C9";
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(ellipsize(ctx, t.label, w - 72), x + 36, ty + 172);
  });
  y += Math.ceil(tiles.length / 2) * (th + gap);

  // Best seller.
  if (show.bestSeller && data.bestSeller) {
    ctx.fillStyle = "#F9A825";
    roundRect(ctx, PAD, y, W - PAD * 2, 130, 36);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#3E2723";
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText("BEST SELLER", PAD + 36, y + 50);
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(ellipsize(ctx, data.bestSeller, W - PAD * 2 - 72), PAD + 36, y + 100);
    y += 130 + gap;
  }

  // Orders chart.
  const footerTop = CARD_H - (show.link && data.link ? 250 : 170);
  const points = data.trend.slice(-14);
  if (show.trend && points.length > 1 && points.some((p) => p.value > 0) && footerTop - y > 240) {
    const top = y + 20;
    const chartH = Math.min(320, footerTop - top - 90);
    ctx.textAlign = "left";
    ctx.fillStyle = "#C8E6C9";
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText("Orders", PAD, top + 30);
    const max = Math.max(...points.map((p) => p.value), 1);
    const slot = (W - PAD * 2) / points.length;
    const bw = Math.min(56, slot * 0.6);
    const base = top + 50 + chartH;
    points.forEach((p, i) => {
      const x = PAD + slot * i + (slot - bw) / 2;
      if (p.value > 0) {
        const h = Math.max(16, (p.value / max) * chartH);
        ctx.fillStyle = "#81C784";
        roundRect(ctx, x, base - h, bw, h, Math.min(12, bw / 2, h / 2));
        ctx.fill();
      } else {
        // An empty day: a flat mark on the baseline.
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(x, base - 4, bw, 4);
      }
      if (points.length <= 8) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = `600 24px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(p.label, x + bw / 2, base + 36);
      }
    });
  }

  // Footer.
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText("Find us on KrishiDukan", cx, CARD_H - (show.link && data.link ? 170 : 100));
  if (show.link && data.link) {
    ctx.fillStyle = "#C8E6C9";
    fitText(ctx, data.link, 600, 34, W - PAD * 2, 24);
    ctx.fillText(data.link, cx, CARD_H - 110);
  }
}

/** The card as a PNG file, for sharing or downloading. */
export function cardToFile(canvas: HTMLCanvasElement): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], "krishidukan-stats.png", { type: "image/png" }) : null);
      }, "image/png");
    } catch {
      resolve(null);
    }
  });
}
