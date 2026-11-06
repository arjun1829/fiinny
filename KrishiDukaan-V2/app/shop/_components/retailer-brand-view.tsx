import Link from "next/link";
import { BadgeCheck, Clock, Facebook, Instagram, MapPin, MessageCircle, Navigation, Phone, Youtube } from "lucide-react";
import type { RetailerBrandData } from "../../lib/seo/retailer-brand-server";
import type { StoreProduct } from "../../lib/seo/stores-server";
import StoreProductGrid from "../../stores/_components/store-product-grid";
import { ShareLinkButton } from "../../components/shared/share-link-button";
import { shopShareUrl } from "../../lib/share-links";
import { APP_STORE_URL, PLAY_STORE_URL, iosLive } from "../../lib/store-links";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "K").slice(0, 2)).toUpperCase();
}

/**
 * A retailer's public brand page. Server-rendered — the only client island is
 * the product grid (cart + this shop's own prices and offers), so the page is
 * light on a farmer's phone and fully crawlable.
 */
export default function RetailerBrandView({
  data,
  products,
}: {
  data: RetailerBrandData;
  products: StoreProduct[];
}) {
  const { brand, profile } = data;
  const name = profile.name || "KrishiDukan shop";
  const place = [profile.city, profile.state].filter(Boolean).join(", ");
  const address = [profile.line1, profile.city, profile.state, profile.pincode].filter(Boolean).join(", ");
  const waDigits = (brand.whatsapp || profile.phone).replace(/\D/g, "").slice(-10);
  const shareUrl = shopShareUrl(profile.phone);
  const socials = {
    instagram: brand.socialLinks.instagram || profile.socialLinks.instagram,
    facebook: brand.socialLinks.facebook || profile.socialLinks.facebook,
    youtube: brand.socialLinks.youtube || profile.socialLinks.youtube,
  };
  const directionsHref =
    profile.lat && profile.lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${profile.lat},${profile.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, address].filter(Boolean).join(", "))}`;

  const btn =
    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-90";

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:pt-6">
      {/* ── Hero ── */}
      <section className="overflow-hidden rounded-3xl border border-surface-container bg-white shadow-sm">
        <div className="relative h-40 bg-gradient-to-br from-primary to-[#0d1b0a] sm:h-56">
          {profile.banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.banner} alt="" className="h-full w-full object-cover" fetchPriority="high" />
          ) : null}
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-black text-primary shadow">
            <BadgeCheck className="h-3.5 w-3.5" /> Online on KrishiDukan
          </span>
        </div>

        <div className="px-5 pb-5 sm:px-8 sm:pb-7">
          <div className="relative z-10 -mt-12 flex items-end gap-4 sm:-mt-14">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-primary-container text-2xl font-black text-white shadow-md sm:h-28 sm:w-28">
              {profile.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logo} alt={`${name} logo`} className="h-full w-full bg-white object-cover" />
              ) : (
                initials(name)
              )}
            </div>
          </div>

          <h1 className="mt-3 text-2xl font-black leading-tight text-on-surface sm:text-3xl">{name}</h1>
          {brand.tagline ? <p className="mt-1 text-base font-semibold text-on-surface-variant">{brand.tagline}</p> : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-surface-variant">
            {place ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {place}
              </span>
            ) : null}
            {brand.establishedYear ? <span>Since {brand.establishedYear}</span> : null}
            {profile.onlineDelivery ? (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">Home delivery</span>
            ) : null}
          </p>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <a href={`tel:${profile.phone}`} className={`${btn} bg-primary text-white`}>
              <Phone className="h-4 w-4" /> Call
            </a>
            {waDigits.length === 10 ? (
              <a
                href={`https://wa.me/91${waDigits}?text=${encodeURIComponent(`Hi ${name}, I found your shop on KrishiDukan.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btn} bg-[#25D366] text-white`}
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            ) : null}
            <a href={directionsHref} target="_blank" rel="noopener noreferrer" className={`${btn} border border-surface-container bg-white text-on-surface`}>
              <Navigation className="h-4 w-4" /> Directions
            </a>
            <ShareLinkButton
              url={shareUrl}
              title={name}
              text={`${name}${place ? `, ${place}` : ""} is now online on KrishiDukan — see products, prices and offers`}
              label="Share"
              className={`${btn} border border-surface-container bg-white text-on-surface`}
            />
          </div>
        </div>
      </section>

      {brand.highlights.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Highlights">
          {brand.highlights.map((h) => (
            <li key={h} className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary">
              {h}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {brand.about ? (
            <section className="rounded-3xl border border-surface-container bg-white p-5 sm:p-6">
              <h2 className="text-lg font-black text-on-surface">About us</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-on-surface-variant">{brand.about}</p>
            </section>
          ) : null}

          {brand.photos.length > 0 ? (
            <section className="rounded-3xl border border-surface-container bg-white p-5 sm:p-6">
              <h2 className="text-lg font-black text-on-surface">Our shop</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {brand.photos.map((src, i) => (
                  <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl bg-surface-container-low">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`${name} photo ${i + 1}`} loading="lazy" decoding="async" className="aspect-square h-full w-full object-cover transition-transform hover:scale-105" />
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-surface-container bg-white p-5 text-sm">
            <h2 className="text-base font-black text-on-surface">Visit us</h2>
            {address ? (
              <p className="mt-2 flex gap-2 text-on-surface-variant">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {address}
              </p>
            ) : null}
            {brand.openingHours ? (
              <p className="mt-2 flex gap-2 text-on-surface-variant">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" /> {brand.openingHours}
              </p>
            ) : null}
            <p className="mt-2 flex gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" />
              <a href={`tel:${profile.phone}`} className="font-bold text-primary hover:underline">{profile.phone}</a>
            </p>
            {profile.ownerName ? <p className="mt-2 text-on-surface-variant">Proprietor: {profile.ownerName}</p> : null}
          </section>

          {socials.instagram || socials.facebook || socials.youtube ? (
            <section className="flex gap-2 rounded-3xl border border-surface-container bg-white p-4">
              {socials.instagram ? (
                <a href={socials.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="rounded-xl bg-pink-50 p-2.5 text-pink-600"><Instagram className="h-5 w-5" /></a>
              ) : null}
              {socials.facebook ? (
                <a href={socials.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Facebook className="h-5 w-5" /></a>
              ) : null}
              {socials.youtube ? (
                <a href={socials.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="rounded-xl bg-red-50 p-2.5 text-red-600"><Youtube className="h-5 w-5" /></a>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-3xl bg-primary p-5 text-white">
            <p className="text-sm font-black">Order from {name} on the KrishiDukan app</p>
            <p className="mt-1 text-xs text-white/80">Follow the shop, see new stock and offers first.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-white px-3 py-2 text-xs font-black text-primary">Get it on Google Play</a>
              {iosLive ? (
                <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-white px-3 py-2 text-xs font-black text-primary">App Store</a>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      {products.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-black text-on-surface">Products at {name}</h2>
          <nav aria-label={`${name} products`} className="sr-only">
            <ul>
              {products.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.slug}`}>{p.name}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <StoreProductGrid products={products} storeName={name} storePhone={profile.phone} />
        </section>
      ) : null}
    </main>
  );
}
