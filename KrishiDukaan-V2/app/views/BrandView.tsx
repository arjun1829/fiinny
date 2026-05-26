'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import {
  MapPin, ShoppingBag, ArrowRight, Store, Leaf, ExternalLink,
  Package, BadgeCheck, Phone, Mail, Globe, Instagram, Facebook,
  MessageCircle, Youtube, Star, ChevronRight, Award, Pencil,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { MarketplaceProduct } from '../../types/product';
import { MANUFACTURERS, PRODUCTS, STORES } from '../constants';
import {
  auth, fetchCompanyPageById, fetchManufacturerNetworkStores, fetchManufacturerProducts,
  fetchUserProfileByPhone, getUserProfile,
  type CompanyPageDoc, type RetailerNetworkStore,
} from '../firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandViewProps {
  manufacturerId: string;
  products: MarketplaceProduct[];
  stores: any[];
  onProductClick: (id: string) => void;
  onFindNearYou: (manufacturerId: string) => void;
  onStoreClick: (storeId: string) => void;
}

// ─── Map ──────────────────────────────────────────────────────────────────────

function BrandMap({ stores, accent, onStoreClick }: { stores: any[]; accent: string; onStoreClick: (id: string) => void }) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  });
  const [activeStore, setActiveStore] = useState<string | null>(null);
  const center = useMemo(() => {
    if (!stores.length) return { lat: 16.705, lng: 74.2433 };
    return {
      lat: stores.reduce((s, st) => s + (st.location?.lat ?? st.lat ?? 0), 0) / stores.length,
      lng: stores.reduce((s, st) => s + (st.location?.lng ?? st.lng ?? 0), 0) / stores.length,
    };
  }, [stores]);

  if (!isLoaded) return (
    <div className="h-full w-full flex items-center justify-center bg-gray-100 rounded-2xl">
      <div className="animate-spin w-8 h-8 border-4 border-gray-300 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%', borderRadius: '1rem' }}
      center={center}
      zoom={10}
      options={{
        disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative',
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e8f5' }] },
          { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f5f0e8' }] },
        ],
      }}
    >
      {stores.map((store) => {
        const pos = store.location ? { lat: store.location.lat, lng: store.location.lng }
          : (store.lat && store.lng ? { lat: store.lat, lng: store.lng } : null);
        if (!pos) return null;
        return (
          <MarkerF
            key={store.id}
            position={pos}
            onClick={() => { setActiveStore(store.id); onStoreClick(store.id); }}
            icon={{
              url: activeStore === store.id
                ? `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><circle cx="18" cy="18" r="14" fill="${accent}" stroke="white" stroke-width="3"/><polygon points="13,30 18,44 23,30" fill="${accent}"/><circle cx="18" cy="18" r="7" fill="white" fill-opacity="0.9"/></svg>`)}`
                : `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><circle cx="14" cy="14" r="11" fill="#f57c00" stroke="white" stroke-width="2.5"/><polygon points="9,23 14,36 19,23" fill="#f57c00"/><circle cx="14" cy="14" r="5" fill="white" fill-opacity="0.9"/></svg>')}`,
              scaledSize: activeStore === store.id ? new google.maps.Size(36, 44) : new google.maps.Size(28, 36),
            }}
          />
        );
      })}
    </GoogleMap>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function BrandSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-[480px] bg-gray-800" />
      <div className="bg-white px-6 py-10 space-y-4 max-w-7xl mx-auto">
        <div className="h-4 bg-gray-200 rounded w-1/4" />
        <div className="grid grid-cols-3 gap-4">
          {[0,1,2].map(i => <div key={i} className="aspect-square rounded-2xl bg-gray-100" />)}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || '#000000').replace('#', '').padEnd(6, '0');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function darkenHex(hex: string, amount: number): string {
  const h = (hex || '#000000').replace('#', '').padEnd(6, '0');
  const r = Math.max(0, parseInt(h.substring(0, 2), 16) - amount).toString(16).padStart(2, '0');
  const g = Math.max(0, parseInt(h.substring(2, 4), 16) - amount).toString(16).padStart(2, '0');
  const b = Math.max(0, parseInt(h.substring(4, 6), 16) - amount).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// ─── Fade-in variant ──────────────────────────────────────────────────────────

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.45 } } };
const stagger = { show: { transition: { staggerChildren: 0.07 } } };

// ─── Main View ────────────────────────────────────────────────────────────────

export default function BrandView({
  manufacturerId, products, stores,
  onProductClick, onFindNearYou, onStoreClick,
}: BrandViewProps) {
  const [companyPage, setCompanyPage] = useState<CompanyPageDoc | null>(null);
  const [liveProducts, setLiveProducts] = useState<MarketplaceProduct[]>([]);
  const [liveStores, setLiveStores] = useState<RetailerNetworkStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchCompanyPageById(manufacturerId).then(async (page) => {
      setCompanyPage(page);
      const ownerPhone = page?.ownerPhone;
      if (ownerPhone) {
        const [profile, stores] = await Promise.all([
          fetchUserProfileByPhone(ownerPhone).catch(() => null),
          fetchManufacturerNetworkStores(ownerPhone).catch(() => [] as RetailerNetworkStore[]),
        ]);
        const uid = profile?.uid;
        if (uid) {
          const prods = await fetchManufacturerProducts(uid).catch(() => [] as MarketplaceProduct[]);
          setLiveProducts(prods);
        }
        setLiveStores(stores);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [manufacturerId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setIsAdmin(false); return; }
      const profile = await getUserProfile(user.uid).catch(() => null);
      setIsAdmin(profile?.role === 'admin');
    });
    return () => unsub();
  }, []);

  // Merge constants fallback with Firestore data
  const constBrand = MANUFACTURERS[manufacturerId] as any;
  const brand = useMemo(() => {
    if (companyPage) return companyPage;
    if (constBrand) return { ...constBrand, socialLinks: undefined };
    return null;
  }, [companyPage, constBrand]);

  // Products: prefer live manufacturer products, fall back to marketplace products filtered by manufacturerId
  const displayProducts = useMemo(() => {
    if (liveProducts.length > 0) return liveProducts;
    const allKnown = [...products, ...PRODUCTS.filter(p => !products.find(x => x.id === p.id))];
    return allKnown.filter((p: any) => p.manufacturerId === manufacturerId);
  }, [liveProducts, products, manufacturerId]);

  // Stores: prefer live network stores, fall back to brand storeIds from constants
  const displayStores = useMemo(() => {
    if (liveStores.length > 0) return liveStores;
    const allKnown = [...stores, ...STORES.filter(s => !stores.find((x: any) => x.id === s.id))];
    return allKnown.filter((s: any) => constBrand?.storeIds?.includes(s.id));
  }, [liveStores, stores, constBrand]);

  if (loading) return <BrandSkeleton />;
  if (!brand) return <div className="p-20 text-center text-on-surface-variant">Brand not found.</div>;

  const primary = (brand as any).primaryColor || '#154212';
  const accent = (brand as any).accentColor || '#f57c00';
  const social = (brand as any).socialLinks || {};
  const videos: string[] = (brand as any).videos || [];
  const certs: string[] = (brand as any).certifications || [];
  const brandName: string = brand.name || '';
  const tagline: string = (brand as any).tagline || '';
  const aboutText: string = (brand as any).about || '';
  const founded: string = (brand as any).founded || '';
  const location: string = (brand as any).location || '';
  const website: string = (brand as any).website || '';
  const phone: string = (brand as any).phone || '';
  const email: string = (brand as any).email || '';
  const socialProof: string = (brand as any).socialProof || '';

  const heroGrad = `linear-gradient(135deg, ${primary} 0%, ${darkenHex(primary, 18)} 55%, ${darkenHex(primary, 38)} 100%)`;

  return (
    <div className="flex flex-col min-h-screen">

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ background: heroGrad, minHeight: 460 }}>

        {/* ─ L1: Fine dot grid ─ */}
        <div className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1.5px, transparent 1.5px)', backgroundSize: '30px 30px' }} />

        {/* ─ L2: Large glow blobs ─ */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-[560px] w-[560px] rounded-full"
          style={{ background: `radial-gradient(circle, ${hexToRgba(accent, 0.32)} 0%, transparent 58%)` }} />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 h-80 w-80 rounded-full"
          style={{ background: `radial-gradient(circle, ${hexToRgba(accent, 0.18)} 0%, transparent 65%)` }} />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[700px] w-[700px] rounded-full"
          style={{ background: `radial-gradient(circle, ${hexToRgba(primary, 0.0)} 30%, ${hexToRgba(accent, 0.06)} 70%, transparent 100%)` }} />

        {/* ─ L3: Decorative rings (concentric circles — top right) ─ */}
        <svg className="pointer-events-none absolute -right-32 -top-32 opacity-[0.07]" width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
          <circle cx="250" cy="250" r="80"  fill="none" stroke="white" strokeWidth="1.5"/>
          <circle cx="250" cy="250" r="130" fill="none" stroke="white" strokeWidth="1.2"/>
          <circle cx="250" cy="250" r="185" fill="none" stroke="white" strokeWidth="1"/>
          <circle cx="250" cy="250" r="245" fill="none" stroke="white" strokeWidth="0.8"/>
        </svg>

        {/* ─ L4: Dense wheat field — right side ─ */}
        <svg className="pointer-events-none absolute right-0 top-0 h-full opacity-[0.16]"
          style={{ width: 'min(560px, 55vw)' }}
          viewBox="0 0 560 520" preserveAspectRatio="xMaxYMid meet" xmlns="http://www.w3.org/2000/svg">

          {/* ── Stalk helper: each stalk = line + 5 grain ellipses ── */}
          {/* Stalk A — tallest */}
          <line x1="390" y1="520" x2="365" y2="30" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          <ellipse cx="365" cy="30"  rx="11" ry="24" fill="white" transform="rotate(-8 365 30)"/>
          <ellipse cx="353" cy="62"  rx="9"  ry="19" fill="white" transform="rotate(-24 353 62)"/>
          <ellipse cx="379" cy="50"  rx="9"  ry="19" fill="white" transform="rotate(18 379 50)"/>
          <ellipse cx="362" cy="86"  rx="8"  ry="17" fill="white" transform="rotate(-14 362 86)"/>
          <ellipse cx="380" cy="74"  rx="8"  ry="17" fill="white" transform="rotate(22 380 74)"/>

          {/* Stalk B */}
          <line x1="440" y1="520" x2="422" y2="68" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          <ellipse cx="422" cy="68"  rx="11" ry="24" fill="white" transform="rotate(6 422 68)"/>
          <ellipse cx="410" cy="100" rx="9"  ry="19" fill="white" transform="rotate(-22 410 100)"/>
          <ellipse cx="435" cy="88"  rx="9"  ry="19" fill="white" transform="rotate(20 435 88)"/>
          <ellipse cx="420" cy="124" rx="8"  ry="16" fill="white" transform="rotate(-10 420 124)"/>
          <ellipse cx="437" cy="112" rx="8"  ry="16" fill="white" transform="rotate(18 437 112)"/>

          {/* Stalk C */}
          <line x1="495" y1="520" x2="482" y2="110" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <ellipse cx="482" cy="110" rx="10" ry="22" fill="white" transform="rotate(10 482 110)"/>
          <ellipse cx="470" cy="138" rx="8"  ry="17" fill="white" transform="rotate(-18 470 138)"/>
          <ellipse cx="494" cy="126" rx="8"  ry="17" fill="white" transform="rotate(16 494 126)"/>
          <ellipse cx="480" cy="158" rx="7"  ry="15" fill="white" transform="rotate(-8 480 158)"/>

          {/* Stalk D — mid height */}
          <line x1="340" y1="520" x2="325" y2="145" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <ellipse cx="325" cy="145" rx="9"  ry="21" fill="white" transform="rotate(-5 325 145)"/>
          <ellipse cx="314" cy="172" rx="7"  ry="16" fill="white" transform="rotate(-20 314 172)"/>
          <ellipse cx="337" cy="160" rx="7"  ry="16" fill="white" transform="rotate(16 337 160)"/>
          <ellipse cx="323" cy="193" rx="6"  ry="14" fill="white" transform="rotate(-12 323 193)"/>

          {/* Stalk E — shorter, middle foreground */}
          <line x1="415" y1="520" x2="405" y2="185" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <ellipse cx="405" cy="185" rx="9"  ry="20" fill="white" transform="rotate(4 405 185)"/>
          <ellipse cx="394" cy="210" rx="7"  ry="15" fill="white" transform="rotate(-16 394 210)"/>
          <ellipse cx="416" cy="200" rx="7"  ry="15" fill="white" transform="rotate(14 416 200)"/>

          {/* Stalk F — right edge tall */}
          <line x1="540" y1="520" x2="530" y2="155" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
          <ellipse cx="530" cy="155" rx="8"  ry="18" fill="white" transform="rotate(14 530 155)"/>
          <ellipse cx="520" cy="180" rx="6"  ry="13" fill="white" transform="rotate(-14 520 180)"/>
          <ellipse cx="540" cy="170" rx="6"  ry="13" fill="white" transform="rotate(12 540 170)"/>

          {/* Stalk G — background thin */}
          <line x1="370" y1="520" x2="358" y2="95" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
          <ellipse cx="358" cy="95"  rx="8"  ry="18" fill="white" transform="rotate(-3 358 95)" opacity="0.6"/>
          <ellipse cx="348" cy="118" rx="6"  ry="13" fill="white" transform="rotate(-18 348 118)" opacity="0.6"/>

          {/* Stalk H — background thin */}
          <line x1="465" y1="520" x2="456" y2="130" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
          <ellipse cx="456" cy="130" rx="8"  ry="18" fill="white" transform="rotate(8 456 130)" opacity="0.6"/>
          <ellipse cx="446" cy="155" rx="6"  ry="13" fill="white" transform="rotate(-15 446 155)" opacity="0.6"/>

          {/* ── Grass blades at base ── */}
          <path d="M310,520 Q320,455 338,430 Q328,470 345,520" fill="white" opacity="0.55"/>
          <path d="M355,520 Q367,460 380,442 Q372,475 388,520" fill="white" opacity="0.50"/>
          <path d="M395,520 Q403,458 414,445 Q408,472 420,520" fill="white" opacity="0.55"/>
          <path d="M430,520 Q440,462 450,450 Q445,475 455,520" fill="white" opacity="0.48"/>
          <path d="M462,520 Q470,468 479,458 Q475,480 483,520" fill="white" opacity="0.55"/>
          <path d="M500,520 Q507,472 514,464 Q511,482 518,520" fill="white" opacity="0.45"/>
          <path d="M330,520 Q336,470 342,460 Q340,478 348,520" fill="white" opacity="0.40"/>

          {/* ── Floating seed/pollen dots ── */}
          <circle cx="300" cy="280" r="2.5" fill="white" opacity="0.5"/>
          <circle cx="318" cy="240" r="1.8" fill="white" opacity="0.4"/>
          <circle cx="355" cy="300" r="2"   fill="white" opacity="0.45"/>
          <circle cx="340" cy="260" r="1.5" fill="white" opacity="0.35"/>
          <circle cx="375" cy="220" r="2"   fill="white" opacity="0.4"/>
          <circle cx="420" cy="290" r="1.8" fill="white" opacity="0.35"/>
          <circle cx="460" cy="340" r="2.5" fill="white" opacity="0.4"/>
          <circle cx="500" cy="300" r="1.5" fill="white" opacity="0.3"/>
          <circle cx="530" cy="360" r="2"   fill="white" opacity="0.35"/>

          {/* ── Crop-row perspective lines ── */}
          <path d="M200,520 Q340,490 560,478" stroke="white" strokeWidth="1"   fill="none" opacity="0.20"/>
          <path d="M200,500 Q340,472 560,460" stroke="white" strokeWidth="0.8" fill="none" opacity="0.16"/>
          <path d="M200,480 Q340,454 560,442" stroke="white" strokeWidth="0.7" fill="none" opacity="0.12"/>
        </svg>

        {/* ─ L5: Left-side botanical cluster ─ */}
        <svg className="pointer-events-none absolute left-0 bottom-0 opacity-[0.10]"
          style={{ width: 'min(320px, 35vw)', height: 'min(320px, 35vw)' }}
          viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg">
          {/* Big leaf */}
          <path d="M40,320 C40,320 -15,220 45,145 C68,112 105,95 128,58 C150,22 138,0 138,0 C138,0 185,45 162,115 C150,150 115,168 103,198 C91,230 115,320 115,320 Z" fill="white"/>
          <line x1="138" y1="0" x2="78" y2="320" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
          {/* Vein lines */}
          <line x1="105" y1="80"  x2="75"  y2="100" stroke="white" strokeWidth="1" opacity="0.4"/>
          <line x1="110" y1="110" x2="78"  y2="132" stroke="white" strokeWidth="1" opacity="0.35"/>
          <line x1="108" y1="140" x2="82"  y2="162" stroke="white" strokeWidth="1" opacity="0.3"/>
          <line x1="130" y1="70"  x2="158" y2="88"  stroke="white" strokeWidth="1" opacity="0.4"/>
          <line x1="128" y1="100" x2="155" y2="118" stroke="white" strokeWidth="1" opacity="0.35"/>
          {/* Second leaf, overlapping */}
          <path d="M0,320 C0,320 22,242 68,205 C90,188 102,160 90,124 C78,88 55,65 55,65 C55,65 112,78 122,122 C132,158 105,185 94,215 C83,248 100,320 100,320 Z" fill="white" opacity="0.50"/>
          {/* Small leaf top */}
          <path d="M155,320 C155,320 140,275 158,250 C166,238 178,232 184,216 C190,200 186,188 186,188 C186,188 204,204 198,228 C194,242 182,248 178,263 C174,278 182,320 182,320 Z" fill="white" opacity="0.55"/>
          {/* Grass blades left corner */}
          <path d="M0,320  Q8,278  18,262 Q12,288 22,320"  fill="white" opacity="0.45"/>
          <path d="M18,320 Q28,280 40,268 Q33,292 44,320"  fill="white" opacity="0.40"/>
          <path d="M35,320 Q42,285 52,275 Q48,296 56,320"  fill="white" opacity="0.35"/>
        </svg>

        {/* ─ L6: Top-left decorative arc / half-ring ─ */}
        <svg className="pointer-events-none absolute -left-16 -top-16 opacity-[0.06]" width="320" height="320" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg">
          <circle cx="160" cy="160" r="100" fill="none" stroke="white" strokeWidth="28"/>
          <circle cx="160" cy="160" r="130" fill="none" stroke="white" strokeWidth="12"/>
          <circle cx="160" cy="160" r="155" fill="none" stroke="white" strokeWidth="6"/>
        </svg>

        {/* ─ L7: Scattered seed/spore particles — mid-hero ─ */}
        <svg className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.12]" viewBox="0 0 1200 480" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          {/* Dandelion-like seed puffs */}
          {[
            [120,80],[200,140],[80,200],[170,310],[240,60],[50,350],
            [750,60],[820,180],[700,290],[900,100],[850,340],
          ].map(([cx,cy],i) => (
            <g key={i} transform={`translate(${cx},${cy})`} opacity="0.7">
              <circle r="3" fill="white"/>
              {[0,45,90,135,180,225,270,315].map((angle,j) => {
                const rad = angle * Math.PI / 180;
                const len = 10 + (j % 2) * 5;
                return <line key={j} x1={0} y1={0} x2={Math.cos(rad)*len} y2={Math.sin(rad)*len} stroke="white" strokeWidth="0.8" strokeLinecap="round"/>;
              })}
            </g>
          ))}
          {/* Plain tiny dots */}
          {[
            [300,120,2],[450,80,1.5],[560,200,2],[630,140,1.5],[680,300,2],
            [150,400,1.8],[400,380,1.5],[500,420,2],
          ].map(([x,y,r],i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="white" opacity="0.5"/>
          ))}
        </svg>

        {/* ─ L8: Bottom horizon — field silhouette fade ─ */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20"
          style={{ background: `linear-gradient(to top, ${hexToRgba(darkenHex(primary, 30), 0.55)}, transparent)` }} />

        {/* ─ L9: Left-to-right readability fade ─ */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(100deg, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.16) 50%, rgba(0,0,0,0.02) 100%)' }} />

        {/* Admin edit pill — only shown to admin */}
        {isAdmin && (
          <div className="absolute top-4 right-4 z-20">
            <a
              href="/admin/companies"
              className="flex items-center gap-1.5 rounded-xl border border-white/20 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm hover:bg-white/15 transition-colors"
              style={{ background: 'rgba(0,0,0,0.35)' }}
            >
              <Pencil className="w-3 h-3" /> Edit Brand Page
            </a>
          </div>
        )}

        <div className="relative max-w-7xl mx-auto px-5 md:px-10 pt-10 pb-14 md:py-16 flex flex-col md:flex-row items-start gap-8 md:gap-12">

          {/* Left — brand info */}
          <motion.div className="flex-1 flex flex-col gap-4 md:gap-5"
            initial="hidden" animate="show" variants={stagger}>

            {/* Verified badge — matches admin "Admin Panel" label style */}
            <motion.div variants={fadeUp} className="flex items-center gap-2 w-fit">
              <div className="flex items-center justify-center w-5 h-5 rounded-md"
                style={{ background: hexToRgba(accent, 0.25), border: `1px solid ${hexToRgba(accent, 0.4)}` }}>
                <BadgeCheck className="w-3 h-3" style={{ color: accent }} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: hexToRgba(accent, 0.85) }}>
                Verified Manufacturer · KrishiDukan
              </span>
            </motion.div>

            {/* Brand name */}
            <motion.div variants={fadeUp}>
              <h1 className="text-4xl md:text-6xl font-black text-white leading-tight tracking-tight drop-shadow-lg">
                {brandName}
              </h1>
              {tagline && <p className="text-white/65 text-base md:text-lg mt-2 leading-relaxed font-medium">{tagline}</p>}
            </motion.div>

            {/* Meta row */}
            <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {location && (
                <span className="flex items-center gap-1.5 text-white/60 text-xs">
                  <MapPin className="w-3.5 h-3.5" style={{ color: accent }} /> {location}
                </span>
              )}
              {founded && (
                <span className="flex items-center gap-1.5 text-white/60 text-xs">
                  <Package className="w-3.5 h-3.5" style={{ color: accent }} /> Est. {founded}
                </span>
              )}
              {website && (
                <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 text-white/60 text-xs hover:text-white transition-colors">
                  <ExternalLink className="w-3 h-3" style={{ color: accent }} />
                  {(() => { try { return new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace('www.', ''); } catch { return website; } })()}
                </a>
              )}
            </motion.div>

            {/* About preview */}
            {aboutText && (
              <motion.p variants={fadeUp} className="text-white/55 text-sm leading-relaxed max-w-lg line-clamp-2">
                {aboutText}
              </motion.p>
            )}

            {/* Social proof */}
            {socialProof && (
              <motion.div variants={fadeUp} className="flex items-center gap-3 py-2.5 px-4 rounded-2xl w-fit"
                style={{ background: hexToRgba(accent, 0.15), border: `1px solid ${hexToRgba(accent, 0.32)}` }}>
                <Star className="w-4 h-4 fill-current shrink-0" style={{ color: accent }} />
                <span className="text-white font-bold text-sm">{socialProof}</span>
              </motion.div>
            )}

            {/* Social links */}
            {(social.instagram || social.facebook || social.whatsapp || social.youtube) && (
              <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
                {social.instagram && (
                  <a href={social.instagram.startsWith('http') ? social.instagram : `https://${social.instagram}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)' }}>
                    <Instagram className="w-3.5 h-3.5" /> Instagram
                  </a>
                )}
                {social.facebook && (
                  <a href={social.facebook.startsWith('http') ? social.facebook : `https://${social.facebook}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#1877f2] hover:opacity-90 active:scale-95 transition-all">
                    <Facebook className="w-3.5 h-3.5" /> Facebook
                  </a>
                )}
                {social.whatsapp && (
                  <a href={`https://wa.me/${social.whatsapp.replace(/\D/g, '')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#25d366] hover:opacity-90 active:scale-95 transition-all">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </a>
                )}
                {social.youtube && (
                  <a href={social.youtube.startsWith('http') ? social.youtube : `https://youtube.com/@${social.youtube}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#ff0000] hover:opacity-90 active:scale-95 transition-all">
                    <Youtube className="w-3.5 h-3.5" /> YouTube
                  </a>
                )}
              </motion.div>
            )}

            {/* CTAs */}
            <motion.div variants={fadeUp} className="flex flex-wrap gap-3 pt-1">
              <button onClick={() => onFindNearYou(manufacturerId)}
                className="flex items-center gap-2 bg-white hover:bg-white/90 active:scale-95 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg"
                style={{ color: primary }}>
                <MapPin className="w-4 h-4" /> Find Near You
              </button>
              <a href="#brand-products"
                className="flex items-center gap-2 border border-white/20 text-white hover:bg-white/10 px-5 py-2.5 rounded-xl text-sm font-bold transition-all">
                <ShoppingBag className="w-4 h-4" /> View Products
              </a>
            </motion.div>
          </motion.div>

          {/* Right — glassmorphism stats card (same style as admin header stat chips) */}
          <motion.div
            initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
            className="md:w-60 w-full shrink-0 rounded-2xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)' }}>

            {/* Stats grid — matches admin header stat chips */}
            <div className="grid grid-cols-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {[
                { value: displayProducts.length, label: 'Products', icon: Package },
                { value: displayStores.length, label: 'Stores', icon: Store },
                { value: certs.length || '—', label: 'Certs', icon: Award },
              ].map(({ value, label, icon: Icon }, i) => (
                <div key={label} className={`px-2 py-4 text-center ${i > 0 ? 'border-l' : ''}`}
                  style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <Icon className="w-3.5 h-3.5 mx-auto mb-1.5" style={{ color: hexToRgba(accent, 0.7) }} />
                  <p className="text-xl font-black text-white leading-none">{value}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Certifications */}
            {certs.length > 0 && (
              <div className="px-4 py-3.5 space-y-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Certifications</p>
                {certs.slice(0, 4).map(c => (
                  <div key={c} className="flex items-center gap-2">
                    <Leaf className="w-3 h-3 shrink-0 text-green-400" />
                    <span className="text-xs text-white/65 leading-tight">{c}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Contact */}
            {(phone || email) && (
              <div className="px-4 py-3.5 space-y-2">
                {phone && (
                  <a href={`tel:${phone}`} className="flex items-center gap-2 text-xs text-white/55 hover:text-white transition-colors">
                    <Phone className="w-3 h-3" style={{ color: accent }} /> {phone}
                  </a>
                )}
                {email && (
                  <a href={`mailto:${email}`} className="flex items-center gap-2 text-xs text-white/55 hover:text-white transition-colors">
                    <Mail className="w-3 h-3" style={{ color: accent }} /> {email}
                  </a>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── Products Section ──────────────────────────────────────────────────── */}
      <section id="brand-products" className="bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-10 py-10 md:py-14">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}>
            <motion.div variants={fadeUp} className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: accent }}>Available on KrishiDukan</p>
                <h2 className="text-xl md:text-2xl font-black text-on-surface">Our Products</h2>
                {displayProducts.length > 0 && (
                  <p className="text-sm text-on-surface-variant mt-0.5">{displayProducts.length} product{displayProducts.length !== 1 ? 's' : ''}</p>
                )}
              </div>
              <button onClick={() => onFindNearYou(manufacturerId)}
                className="flex items-center gap-1.5 text-sm font-bold hover:gap-3 transition-all"
                style={{ color: primary }}>
                Find near you <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>

            {displayProducts.length === 0 ? (
              <motion.div variants={fadeUp} className="rounded-2xl border-2 border-dashed border-outline-variant/30 py-16 text-center">
                <Package className="w-12 h-12 text-on-surface-variant/20 mx-auto mb-3" />
                <p className="text-on-surface-variant font-medium">Products coming soon.</p>
              </motion.div>
            ) : (
              <motion.div variants={stagger}
                className={`grid gap-3 md:gap-5 ${displayProducts.length === 1 ? 'grid-cols-1 max-w-xs' : displayProducts.length === 2 ? 'grid-cols-2 max-w-sm' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
                {displayProducts.map((p: any) => (
                  <motion.button
                    key={p.id}
                    variants={fadeUp}
                    whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { if (p.manufacturerId !== undefined) onProductClick(p.id); }}
                    className="flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden text-left group transition-all"
                  >
                    {/* Image */}
                    <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden relative">
                      {(p.image || p.images?.[0]) ? (
                        <img src={p.image || p.images?.[0]} alt={p.name}
                          className="w-full h-full object-contain p-2 group-hover:scale-108 transition-transform duration-300"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: hexToRgba(primary, 0.1) }}>
                          <Package className="w-8 h-8" style={{ color: hexToRgba(primary, 0.4) }} />
                        </div>
                      )}
                      {/* Category pill on image */}
                      {p.category && (
                        <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white"
                          style={{ background: hexToRgba(primary, 0.85) }}>
                          {p.category}
                        </span>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-3 md:p-4 flex flex-col gap-1 flex-1">
                      <p className="text-xs md:text-sm font-bold text-on-surface leading-tight line-clamp-2">{p.name || p.fullName}</p>
                      <div className="flex items-center gap-2 mt-auto pt-2">
                        <span className="text-sm md:text-base font-extrabold" style={{ color: primary }}>
                          ₹{p.price}
                        </span>
                        {p.oldPrice && (
                          <span className="text-xs text-on-surface-variant line-through">₹{p.oldPrice}</span>
                        )}
                        {p.stock === 'Fast Selling' || p.stock === 'Trending' ? (
                          <span className="ml-auto text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full"
                            style={{ background: hexToRgba(accent, 0.15), color: accent }}>
                            {p.stock}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── About Section ────────────────────────────────────────────────────── */}
      {(aboutText || certs.length > 0) && (
        <section className="bg-gray-50 border-y border-gray-100">
          <div className="max-w-7xl mx-auto px-5 md:px-10 py-10 md:py-14">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}
              className="grid md:grid-cols-2 gap-8 md:gap-12 items-start">
              {/* About */}
              {aboutText && (
                <motion.div variants={fadeUp}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: accent }}>Our Story</p>
                  <h3 className="text-xl font-bold text-on-surface mb-4">About {brandName}</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{aboutText}</p>
                </motion.div>
              )}
              {/* Certifications + Contact */}
              <motion.div variants={fadeUp} className="space-y-6">
                {certs.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: accent }}>Quality & Trust</p>
                    <div className="flex flex-wrap gap-2">
                      {certs.map(c => (
                        <span key={c} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border"
                          style={{ background: hexToRgba(primary, 0.06), borderColor: hexToRgba(primary, 0.2), color: primary }}>
                          <Leaf className="w-3 h-3" /> {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(phone || email || website) && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: accent }}>Contact</p>
                    <div className="space-y-2.5">
                      {phone && (
                        <a href={`tel:${phone}`} className="flex items-center gap-3 text-sm text-on-surface hover:text-primary transition-colors group">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"
                            style={{ background: hexToRgba(primary, 0.1) }}>
                            <Phone className="w-3.5 h-3.5" style={{ color: primary }} />
                          </div>
                          <span className="font-medium">{phone}</span>
                        </a>
                      )}
                      {email && (
                        <a href={`mailto:${email}`} className="flex items-center gap-3 text-sm text-on-surface hover:text-primary transition-colors group">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"
                            style={{ background: hexToRgba(primary, 0.1) }}>
                            <Mail className="w-3.5 h-3.5" style={{ color: primary }} />
                          </div>
                          <span className="font-medium">{email}</span>
                        </a>
                      )}
                      {website && (
                        <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-3 text-sm text-on-surface hover:text-primary transition-colors group">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"
                            style={{ background: hexToRgba(primary, 0.1) }}>
                            <Globe className="w-3.5 h-3.5" style={{ color: primary }} />
                          </div>
                          <span className="font-medium truncate">{website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── Store Discovery ───────────────────────────────────────────────────── */}
      {displayStores.length > 0 && (
        <section className="bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-5 md:px-10 py-10 md:py-14">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}>
              <motion.div variants={fadeUp} className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: accent }}>Where to Buy</p>
                  <h2 className="text-xl md:text-2xl font-bold text-on-surface">Available at {displayStores.length} Store{displayStores.length !== 1 ? 's' : ''}</h2>
                  {location && <p className="text-sm text-on-surface-variant mt-0.5">Near {location.split(',')[0]}</p>}
                </div>
                <button onClick={() => onFindNearYou(manufacturerId)}
                  className="flex items-center gap-2 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all"
                  style={{ background: primary }}>
                  <MapPin className="w-3.5 h-3.5" /> Find Near You
                </button>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <motion.div variants={fadeUp} className="h-72 md:h-80 rounded-2xl overflow-hidden border border-gray-100 bg-gray-50">
                  <BrandMap stores={displayStores} accent={accent} onStoreClick={onStoreClick} />
                </motion.div>
                <motion.div variants={stagger} className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
                  {displayStores.map((store: any, i) => (
                    <motion.button
                      key={store.id || i}
                      variants={fadeUp}
                      whileHover={{ x: 3 }}
                      className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-center gap-3.5 text-left hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer group"
                      onClick={() => onStoreClick(store.id)}
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"
                        style={{ background: hexToRgba(primary, 0.1) }}>
                        <Store className="w-4 h-4" style={{ color: primary }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-on-surface text-sm truncate">{store.name}</p>
                        <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5 truncate">
                          <MapPin className="w-2.5 h-2.5 shrink-0" /> {store.address}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                          In Stock
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-on-surface-variant/40 group-hover:text-on-surface-variant transition-colors" />
                      </div>
                    </motion.button>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── Videos Section ────────────────────────────────────────────────────── */}
      {videos.length > 0 && (
        <section className="bg-gray-50 border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-5 md:px-10 py-10 md:py-14">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}>
              <motion.div variants={fadeUp} className="mb-6">
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: accent }}>In Action</p>
                <h2 className="text-xl md:text-2xl font-bold text-on-surface">See the Results</h2>
                <p className="text-sm text-on-surface-variant mt-0.5">Farmers share their experience with {brandName}</p>
              </motion.div>
              <motion.div variants={fadeUp} className="flex gap-3.5 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-hide">
                {videos.map((videoId, i) => (
                  <div key={videoId}
                    className="shrink-0 snap-center rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-black"
                    style={{ width: 'min(180px, calc(50vw - 24px))', aspectRatio: '9/16' }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
                      title={`${brandName} video ${i + 1}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen className="w-full h-full" loading="lazy" />
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── CTA Footer ───────────────────────────────────────────────────────── */}
      <section style={{ background: primary }}>
        <div className="max-w-7xl mx-auto px-5 md:px-10 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
            <h3 className="text-xl font-bold text-white">Interested in {brandName}?</h3>
            <p className="text-white/55 text-sm mt-1">
              {displayProducts.length > 0
                ? `Find the nearest store carrying ${displayProducts.slice(0, 2).map((p: any) => p.name).join(', ')}${displayProducts.length > 2 ? ` & ${displayProducts.length - 2} more` : ''}.`
                : 'Find the nearest store carrying our products.'}
            </p>
          </motion.div>
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
            onClick={() => onFindNearYou(manufacturerId)}
            className="shrink-0 flex items-center gap-2 bg-white hover:bg-white/90 active:scale-95 px-7 py-3.5 rounded-xl text-sm font-bold shadow-lg transition-all"
            style={{ color: primary }}>
            Browse Products Near You <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </section>

    </div>
  );
}
