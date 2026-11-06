import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SITE_URL, sharePhone } from "../../lib/share-links";
import { storePathForPhone } from "../../lib/seo/stores-server";
import { getRetailerBrand, getRetailerBrandProducts } from "../../lib/seo/retailer-brand-server";
import RetailerBrandView from "../_components/retailer-brand-view";

/**
 * Shared shop link: /shop/{phone} (app/lib/share-links.ts). Phones with the
 * app installed open it in the app (App Links / Universal Links). Everyone
 * else sees the shop's brand page when the retailer has switched one on
 * (Dashboard → Brand page); otherwise they're sent to the shop's store page,
 * or to the shop on the store map when it has no store page yet.
 *
 * Revalidated every 5 minutes rather than rendered per request: a shared
 * link can get a burst of visits, and each render is several reads. Turning
 * the page on or off therefore shows within 5 minutes.
 */

export const revalidate = 300;

interface PageProps {
  params: Promise<{ id: string }>;
}

async function load(id: string) {
  const phone = sharePhone(decodeURIComponent(id));
  if (!phone) return { phone: null, data: null };
  return { phone, data: await getRetailerBrand(phone) };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { phone, data } = await load(id);
  if (!phone || !data) return { robots: { index: false, follow: true } };
  const name = data.profile.name || "KrishiDukan shop";
  const place = [data.profile.city, data.profile.state].filter(Boolean).join(", ");
  const title = place ? `${name}, ${place}` : name;
  const description =
    data.brand.tagline ||
    `${name}${place ? ` in ${place}` : ""} — agri products, prices and offers on KrishiDukan. Call, WhatsApp or order online.`;
  const url = `${SITE_URL}/shop/${phone}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "KrishiDukan" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ShopLinkPage({ params }: PageProps) {
  const { id } = await params;
  const { phone, data } = await load(id);
  if (!phone) notFound();
  if (data) {
    const products = await getRetailerBrandProducts(phone);
    return <RetailerBrandView data={data} products={products} />;
  }
  const path = await storePathForPhone(phone);
  redirect(path ?? `/?view=map&store=${encodeURIComponent(phone)}`);
}
