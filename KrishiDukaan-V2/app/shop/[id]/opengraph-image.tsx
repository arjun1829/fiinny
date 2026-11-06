import { ImageResponse } from "next/og";
import { sharePhone } from "../../lib/share-links";
import { getRetailerBrand } from "../../lib/seo/retailer-brand-server";

/**
 * The link preview WhatsApp / Instagram / Facebook show for a shared
 * /shop/{phone} link: the shop's banner, logo, name and place, branded
 * "Online on KrishiDukan". Shops without a brand page get the plain card.
 */

export const revalidate = 300;
export const alt = "Shop on KrishiDukan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#0f391b";

/**
 * The image as a data URL, or null. Satori can only decode PNG and JPEG — a
 * WebP logo would fail the whole preview — so anything else is left out.
 */
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

export default async function Image({ params }: { params: { id: string } }) {
  const phone = sharePhone(decodeURIComponent(params.id));
  const data = phone ? await getRetailerBrand(phone).catch(() => null) : null;
  const name = data?.profile.name || "KrishiDukan";
  const place = data ? [data.profile.city, data.profile.state].filter(Boolean).join(", ") : "";
  const tagline = data?.brand.tagline || "Everything your farm needs";
  const [banner, logo] = await Promise.all([embeddable(data?.profile.banner), embeddable(data?.profile.logo)]);

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
              position: "absolute",
              right: 32,
              top: 28,
              display: "flex",
              background: "white",
              color: GREEN,
              fontSize: 26,
              fontWeight: 800,
              padding: "10px 22px",
              borderRadius: 40,
            }}
          >
            Online on KrishiDukan
          </div>
        </div>
        <div style={{ display: "flex", padding: "0 56px", marginTop: -90, alignItems: "flex-end" }}>
          <div
            style={{
              width: 180,
              height: 180,
              borderRadius: 36,
              border: "8px solid white",
              background: "#184b25",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 72,
              fontWeight: 800,
              overflow: "hidden",
            }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} width={164} height={164} style={{ objectFit: "cover", background: "white" }} alt="" />
            ) : (
              name.slice(0, 1).toUpperCase()
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "18px 56px 0" }}>
          <div style={{ fontSize: 60, fontWeight: 800, color: "#1b1c1b", lineHeight: 1.1 }}>
            {name.length > 40 ? `${name.slice(0, 39)}…` : name}
          </div>
          <div style={{ fontSize: 30, color: "#42493e", marginTop: 10 }}>
            {[tagline.length > 70 ? `${tagline.slice(0, 69)}…` : tagline, place].filter(Boolean).join("  ·  ")}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
