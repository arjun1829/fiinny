import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import {
  razorpayClient,
  resolveSellerAccount,
  saveSellerRouteState,
} from "../../../lib/route-server";

/**
 * POST /api/admin/route-onboard-seller
 *
 * The admin-triggered equivalent of /api/route/onboard-seller +
 * /api/route/bank-details combined into one action — created because those
 * two endpoints require the SELLER's own auth token, and in practice admin is
 * often the one with the bank details and KYC docs in hand (the owner handed
 * them over directly, no self-service login happened).
 *
 * WHY COMBINED, UNLIKE THE SELLER-FACING PAIR: those two are separate calls
 * because a seller fills them in over two different screens at their own
 * pace. Here, by the time admin clicks this, both the profile AND the bank
 * details submitted via /admin/payouts already exist — there's no reason to
 * make admin click twice for what is functionally one "activate this seller"
 * action.
 *
 * BANK DETAILS COME FROM payoutAccounts/{phone}, NOT THE REQUEST BODY. That
 * collection is the OLD manual-review flow's storage (deliberately different
 * from route/bank-details.ts, which never persists them) — re-using it here
 * means admin never re-types a bank detail that already made it into
 * Firestore once. They are read, forwarded to Razorpay, and not modified.
 *
 * Fails loudly and specifically when required profile or bank fields are
 * missing, rather than sending Razorpay a request that will bounce with a
 * generic validation error — see resolveSellerAccount's users/{phone}
 * fallback for why a real, logged-in seller can still be missing these.
 */

type AdminAuthResult =
  | { ok: true; uid: string; response?: undefined }
  | { ok: false; uid?: undefined; response: NextResponse };

async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  const header = req.headers.get("Authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization token" }, { status: 401 }) };
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid authorization token" }, { status: 401 }) };
  }

  const db = getAdminDb();
  const [byUid, idx] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("uidIndex").doc(uid).get(),
  ]);
  let isAdmin = byUid.exists && byUid.data()?.role === "admin";
  if (!isAdmin && idx.exists) {
    const phone = idx.data()?.phone;
    if (phone) {
      const byPhone = await db.collection("users").doc(String(phone)).get();
      isAdmin = byPhone.exists && byPhone.data()?.role === "admin";
    }
  }
  if (!isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, uid };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { phone } = (await req.json()) as { phone?: string };
    if (!phone || !phone.trim()) {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }

    const seller = await resolveSellerAccount(phone.trim());
    if (!seller) {
      return NextResponse.json(
        { error: "No seller account found for this phone (checked retailers, manufacturers and users)." },
        { status: 404 },
      );
    }

    // ── Bank details: pulled from the old manual-flow's storage ─────────────
    const db = getAdminDb();
    const payoutSnap = await db.collection("payoutAccounts").doc(seller.phone).get();
    const payout = payoutSnap.exists ? payoutSnap.data()! : {};

    const accountNumber = String(payout.accountNumber ?? "").replace(/\s/g, "");
    const ifscCode = String(payout.ifsc ?? "").trim().toUpperCase();
    const beneficiaryName = String(payout.accountHolderName ?? "").trim();

    const missingBank: string[] = [];
    if (!/^\d{5,20}$/.test(accountNumber)) missingBank.push("a valid account number");
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) missingBank.push("a valid IFSC code");
    if (beneficiaryName.length < 3) missingBank.push("the account holder name");
    if (missingBank.length > 0) {
      return NextResponse.json(
        {
          error: `Missing from this seller's bank details (see /admin/payouts): ${missingBank.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    // ── Profile fields Razorpay's Accounts API requires ──────────────────────
    const email = (seller.email ?? "").trim();
    const legalName = seller.shopName.trim();
    const missingProfile: string[] = [];
    if (!email) missingProfile.push("an email address");
    if (legalName.length < 4) missingProfile.push("a shop/business name (at least 4 characters)");
    if (missingProfile.length > 0) {
      return NextResponse.json(
        {
          error: `Missing from this seller's profile (see /admin/users): ${missingProfile.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    let accountId = seller.razorpayAccountId;
    let productId = seller.data.routeProductId ? String(seller.data.routeProductId) : undefined;
    let activationStatus = seller.routeStatus ?? "requested";

    if (!accountId) {
      const digits = seller.phone.replace(/\D/g, "");
      const city = String(seller.data.city ?? "").trim();
      // Razorpay rejects both an empty street2 ("The street2 field is
      // required.") and a "+" anywhere in reference_id ("The code format is
      // invalid."), so street2 falls back to the city (never blank) and the
      // reference id is digits only with a prefix.
      const account = await razorpayClient.accounts.create({
        email,
        phone: `+${digits}`,
        type: "route",
        legal_business_name: legalName,
        customer_facing_business_name: legalName,
        business_type: "proprietorship",
        reference_id: `seller-${digits}`,
        profile: {
          category: "ecommerce",
          subcategory: "agriculture",
          addresses: {
            registered: {
              street1: String(seller.data.address ?? seller.data.street ?? "NA"),
              street2: String(seller.data.area ?? "").trim() || city || "NA",
              city,
              state: String(seller.data.state ?? "").trim(),
              postal_code: String(seller.data.pincode ?? "").trim(),
              country: "IN",
            },
          },
        },
        ...(seller.data.gstin ? { legal_info: { gst: String(seller.data.gstin) } } : {}),
      } as never);
      accountId = (account as { id: string }).id;

      try {
        const product = (await razorpayClient.products.requestProductConfiguration(accountId, {
          product_name: "route",
          tnc_accepted: true,
        } as never)) as { id?: string; activation_status?: string };
        productId = product.id;
        activationStatus = product.activation_status ?? "requested";
      } catch (e) {
        console.error("[admin/route-onboard-seller] product config failed:", e);
      }

      await saveSellerRouteState(seller, {
        razorpayAccountId: accountId,
        routeStatus: activationStatus,
        ...(productId ? { routeProductId: productId } : {}),
      });
    }

    // ── Submit (or resubmit) the settlement bank account ─────────────────────
    if (productId) {
      const updated = (await razorpayClient.products.edit(accountId, productId, {
        settlements: {
          account_number: accountNumber,
          ifsc_code: ifscCode,
          beneficiary_name: beneficiaryName,
        },
        tnc_accepted: true,
      } as never)) as { activation_status?: string; requirements?: unknown[] };

      activationStatus = updated.activation_status ?? activationStatus;
      await saveSellerRouteState(seller, { routeStatus: activationStatus });

      return NextResponse.json({
        accountId,
        productId,
        activationStatus,
        requirements: updated.requirements ?? [],
      });
    }

    // Account created but the product request itself failed — surfaced as a
    // partial success so admin can retry rather than assuming nothing happened.
    return NextResponse.json({
      accountId,
      productId: null,
      activationStatus,
      requirements: [],
      warning: "Account created, but the route product request failed — bank details were not submitted. Retry.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin/route-onboard-seller] failed:", error);
    return NextResponse.json({ error: `Could not create the Route account: ${message}` }, { status: 500 });
  }
}
