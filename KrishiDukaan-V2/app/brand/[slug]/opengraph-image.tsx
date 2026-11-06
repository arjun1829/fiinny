import { ImageResponse } from "next/og";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore/lite";
import { getClientDb } from "../../lib/firebase-client-server";
import { sharePhone } from "../../lib/share-links";
import { countBrandProducts } from "../../lib/brand-products";

/**
 * The link preview WhatsApp / Instagram / Facebook show for a shared
 * /brand/{slug} link — the brand's banner, logo, name, place and product
 * count, like app/shop/[id]/opengraph-image.tsx does for shops. Rendered on a
 * crawler's first hit and cached, so normal page views never pay for it.
 */

export const revalidate = 300;
export const alt = "Brand on KrishiDukan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#0f391b";

/** Satori decodes only PNG/JPEG — anything else is left out, not fatal. */
async function embeddable(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok || !/^image\/(png|jpe?g)/i.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 4 * 1024 * 1024) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

async function loadBrand(slug: string) {
  const db = getClientDb();
  let phone = sharePhone(decodeURIComponent(slug));
  if (!phone) {
    const snap = await getDocs(query(collection(db, "manufacturers"), where("slug", "==", slug), limit(1)));
    phone = snap.empty ? null : snap.docs[0].id;
  }
  if (!phone) return null;
  const [mfr, page, products] = await Promise.all([
    getDoc(doc(db, "manufacturers", phone)),
    getDoc(doc(db, "brandPages", phone)),
    countBrandProducts(phone).catch(() => 0),
  ]);
  if (!mfr.exists()) return null;
  const m = mfr.data() as Record<string, unknown>;
  const p = (page.exists() ? page.data() : {}) as Record<string, unknown>;
  const addr = (m.address ?? {}) as Record<string, unknown>;
  return {
    name: String(m.businessName ?? m.ownerName ?? "KrishiDukan"),
    tagline: String(p.tagline ?? ""),
    place: [addr.city, addr.state].map((v) => String(v ?? "").trim()).filter(Boolean).join(", "),
    logo: String(p.logo || m.logo || "") || undefined,
    banner: String(p.banner || m.banner || "") || undefined,
    products,
  };
}

export default async function Image({ params }: { params: { slug: string } }) {
  const data = await loadBrand(params.slug).catch(() => null);
  const name = data?.name || "KrishiDukan";
  const tagline = data?.tagline || "Verified manufacturer on KrishiDukan";
  const [banner, logo] = await Promise.all([embeddable(data?.banner), embeddable(data?.logo)]);
  const products = data?.products ?? 0;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fbf9f7" }}>
        <div style={{ height: 300, display: "flex", position: "relative", background: GREEN }}>
          {banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner} width={1200} height={300} style={{ objectFit: "cover", width: 1200, height: 300 }} alt="" />
          ) : null}
          <div
            style={{
              position: "absolute", right: 32, top: 28, display: "flex", background: "white", color: GREEN,
              fontSize: 26, fontWeight: 800, padding: "10px 22px", borderRadius: 40,
            }}
          >
            ✓ Verified brand on KrishiDukan
          </div>
        </div>
        <div style={{ display: "flex", padding: "0 56px", marginTop: -90, alignItems: "flex-end", justifyContent: "space-between" }}>
          <div
            style={{
              width: 180, height: 180, borderRadius: 36, border: "8px solid white", background: "#184b25",
              display: "flex", alignItems: "center", justifyContent: "center", color: "white",
              fontSize: 72, fontWeight: 800, overflow: "hidden",
            }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} width={164} height={164} style={{ objectFit: "contain", background: "white" }} alt="" />
            ) : (
              name.slice(0, 1).toUpperCase()
            )}
          </div>
          {products > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 64, fontWeight: 800, color: GREEN, lineHeight: 1 }}>{products}</div>
              <div style={{ fontSize: 26, color: "#42493e" }}>{products === 1 ? "Product" : "Products"}</div>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "18px 56px 0" }}>
          <div style={{ fontSize: 60, fontWeight: 800, color: "#1b1c1b", lineHeight: 1.1 }}>
            {name.length > 40 ? `${name.slice(0, 39)}…` : name}
          </div>
          <div style={{ fontSize: 30, color: "#42493e", marginTop: 10 }}>
            {[tagline.length > 70 ? `${tagline.slice(0, 69)}…` : tagline, data?.place].filter(Boolean).join("  ·  ")}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
