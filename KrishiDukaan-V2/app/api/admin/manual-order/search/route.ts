import { NextRequest, NextResponse } from 'next/server';
import { requireSection } from '../../../../lib/admin-auth';
import { getAdminDb } from '../../../../lib/firebase-admin';

/**
 * GET /api/admin/manual-order/search?type=customer|retailer|product&q=&retailerPhone=
 *
 * Read-only lookups that feed the "Create order manually" wizard. Admin / team
 * with the `orders` section only. Everything runs server-side through the Admin
 * SDK (the same trust boundary as the rest of /api/admin).
 *
 *  - customer : users with role "customer" (or no role), by name / phone / email.
 *               A phone-looking query is also resolved directly (users/{+91…})
 *               and through uidIndex, so a buyer tied to a known payment is found
 *               even in a large customer base.
 *  - retailer : retailers/{phone} docs (+ users with role "retailer"), by name /
 *               phone / city — the fulfilling seller.
 *  - product  : the retailer's OWN catalogue copies (products where retailerPhone
 *               == retailerPhone). Each row carries the canonical productId used on
 *               the order item AND the copy doc id used to price it exactly.
 */

const SCAN_LIMIT = 500; // bounded per request; admin tool, low frequency
const RESULT_LIMIT = 30;

/** Normalize an Indian phone to the +91XXXXXXXXXX the user/seller docs are keyed by. */
function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  const out = new Set<string>();
  if (ten.length === 10) {
    out.add(`+91${ten}`);
    out.add(`91${ten}`);
    out.add(ten);
  }
  out.add(raw.trim());
  return Array.from(out).filter(Boolean);
}

const looksLikePhone = (q: string) => /\d{4,}/.test(q.replace(/\D/g, ''));

const capitalizeFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const titleCase = (s: string) => s.split(/\s+/).map(capitalizeFirst).join(' ');

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = await requireSection(req, 'orders');
  if (caller instanceof NextResponse) return caller;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? '';
  const q = (searchParams.get('q') ?? '').trim();
  const qLower = q.toLowerCase();
  const retailerPhone = (searchParams.get('retailerPhone') ?? '').trim();
  const db = getAdminDb();

  try {
    if (type === 'customer') {
      // A "customer" has no dedicated role value — it's a users doc with no role
      // (OTP buyers) OR role === 'customer' (see fetchUserRoleCounts). So we must
      // NOT filter by role server-side; we identify customers in memory instead.
      const results = new Map<string, Record<string, unknown>>();
      const isCustomer = (d: FirebaseFirestore.DocumentData) => {
        const role = String(d.role ?? '');
        return role === '' || role === 'customer';
      };

      // 1) Exact phone resolution — the reliable path for a known buyer, and
      //    role-agnostic (an exact phone match is shown whatever the role).
      if (looksLikePhone(q)) {
        const reads = phoneVariants(q).flatMap((variant) => [
          db.collection('users').doc(variant).get(),
          db.collection('uidIndex').doc(variant).get(),
        ]);
        const snaps = await Promise.all(reads);
        for (let i = 0; i < snaps.length; i++) {
          const snap = snaps[i];
          if (!snap.exists) continue;
          if (i % 2 === 0) {
            results.set(snap.id, mapCustomer(snap.id, snap.data()!)); // users/{phone}
          } else {
            const p = String(snap.data()?.phone ?? '').trim(); // uidIndex → phone
            if (p) {
              const uSnap = await db.collection('users').doc(p).get();
              if (uSnap.exists) results.set(uSnap.id, mapCustomer(uSnap.id, uSnap.data()!));
            }
          }
        }
      }

      // 2) Name prefix via the indexed `name` field (catches customers of any age,
      //    not just recent ones). Firestore prefix matching is case-sensitive, so
      //    try a few common casings of the typed query.
      if (!looksLikePhone(q) && q.length >= 2) {
        const casings = Array.from(new Set([q, q.toLowerCase(), titleCase(q), capitalizeFirst(q)]));
        const prefixReads = casings.map((c) =>
          db.collection('users').orderBy('name').startAt(c).endAt(c + '').limit(RESULT_LIMIT).get().catch(() => null),
        );
        for (const snap of await Promise.all(prefixReads)) {
          if (!snap) continue;
          for (const d of snap.docs) {
            if (isCustomer(d.data())) results.set(d.id, mapCustomer(d.id, d.data()));
          }
        }
      }

      // 3) Newest-users scan, filtered in memory. A just-failed order's customer
      //    is usually recent, so newest-first makes this a strong fallback for
      //    name / email / city queries the prefix search can't phrase.
      const scan = await db.collection('users').orderBy('createdAt', 'desc').limit(SCAN_LIMIT).get().catch(() => null);
      if (scan) {
        for (const d of scan.docs) {
          if (results.size >= RESULT_LIMIT * 4) break;
          const data = d.data();
          if (!isCustomer(data)) continue;
          const hay = [data.name, data.phone, data.email, d.id, data.city, data.state]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!qLower || hay.includes(qLower)) results.set(d.id, mapCustomer(d.id, data));
        }
      }

      return NextResponse.json({ results: Array.from(results.values()).slice(0, RESULT_LIMIT) });
    }

    if (type === 'retailer') {
      const results = new Map<string, Record<string, unknown>>();

      if (looksLikePhone(q)) {
        for (const variant of phoneVariants(q)) {
          const snap = await db.collection('retailers').doc(variant).get();
          if (snap.exists) results.set(snap.id, mapRetailer(snap.id, snap.data()!));
        }
      }

      // retailers/{phone} docs, plus users with role "retailer" (newer-signup
      // sellers can have the role on their user doc with no retailers/ record yet).
      const [retailSnap, userSnap] = await Promise.all([
        db.collection('retailers').limit(SCAN_LIMIT).get(),
        db.collection('users').where('role', '==', 'retailer').limit(SCAN_LIMIT).get(),
      ]);
      for (const d of [...retailSnap.docs, ...userSnap.docs]) {
        if (results.size >= RESULT_LIMIT * 4) break;
        if (results.has(d.id)) continue;
        const data = d.data();
        const hay = [data.shopName, data.businessName, data.name, d.id, data.phone, data.city, data.state]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!qLower || hay.includes(qLower)) results.set(d.id, mapRetailer(d.id, data));
      }

      return NextResponse.json({ results: Array.from(results.values()).slice(0, RESULT_LIMIT) });
    }

    if (type === 'product') {
      if (!retailerPhone) {
        return NextResponse.json({ error: 'retailerPhone is required for product search.' }, { status: 400 });
      }
      // A seller's catalogue copies are keyed by any of these, across phone
      // formats — the same ambiguity create-cart-order and the dashboard handle.
      // Query the lot in parallel and merge by doc id.
      const phones = phoneVariants(retailerPhone);
      const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
      for (const phone of phones) {
        for (const field of ['retailerPhone', 'ownerPhone', 'storePhone']) {
          queries.push(db.collection('products').where(field, '==', phone).limit(SCAN_LIMIT).get());
        }
      }
      const snaps = await Promise.all(queries);
      const byId = new Map<string, Record<string, unknown>>();
      for (const snap of snaps) {
        for (const d of snap.docs) {
          if (!byId.has(d.id)) byId.set(d.id, mapProduct(d.id, d.data()));
        }
      }
      const results = Array.from(byId.values())
        .filter((p) => !qLower || String(p.name).toLowerCase().includes(qLower))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .slice(0, RESULT_LIMIT * 3);
      return NextResponse.json({ results });
    }

    return NextResponse.json({ error: 'Unknown search type.' }, { status: 400 });
  } catch (e) {
    console.error('[manual-order/search] failed:', e);
    return NextResponse.json({ error: 'Search failed.' }, { status: 500 });
  }
}

function mapCustomer(id: string, d: FirebaseFirestore.DocumentData): Record<string, unknown> {
  return {
    id,
    name: String(d.name ?? d.businessName ?? d.ownerName ?? '').trim() || '(no name)',
    phone: String(d.phone ?? id).trim(),
    email: d.email ? String(d.email) : null,
    city: d.city ? String(d.city) : null,
    state: d.state ? String(d.state) : null,
    address: d.address ? String(d.address) : null,
  };
}

function mapRetailer(id: string, d: FirebaseFirestore.DocumentData): Record<string, unknown> {
  return {
    id,
    phone: String(d.phone ?? id).trim(),
    shopName: String(d.shopName ?? d.businessName ?? d.name ?? '').trim() || id,
    city: d.city ? String(d.city) : null,
    state: d.state ? String(d.state) : null,
    gstin: d.gstin ?? d.gstNumber ?? null,
  };
}

function mapProduct(copyId: string, d: FirebaseFirestore.DocumentData): Record<string, unknown> {
  // The id written onto the order item (what the stock-decrement trigger and the
  // rest of the app key off) is the canonical product id when this copy points at
  // one, else the copy's own doc id.
  const productId = String(d.manufacturerProductId ?? d.originalProductId ?? copyId);
  const variants = Array.isArray(d.variants)
    ? (d.variants as Record<string, unknown>[]).map((v) => ({
        unit: String(v.unit ?? ''),
        price: Number(v.price ?? 0),
      }))
    : [];
  return {
    copyId,
    productId,
    name: String(d.name ?? d.productName ?? '').trim() || productId,
    price: Number(d.price ?? d.sellingPrice ?? 0),
    image: d.image ? String(d.image) : (d.imageUrl ? String(d.imageUrl) : null),
    variants,
    gstApplicable: d.gstApplicable === true,
    gstRate: Number(d.gstRate ?? 0),
  };
}
