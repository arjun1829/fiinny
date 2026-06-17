# Karan Arjun Power Plus — Developer Intern Brief

**Deadline:** June 1, 2026  
**Today:** May 4, 2026 — 28 days  
**Live Site:** https://karanarjun-powerplus.web.app  
**Codebase:** `C:\lifemap\karan-arjun-powerplus`  
**Framework:** Next.js (App Router) · TypeScript · Tailwind CSS · Firebase  
**Owner:** Arjun Tanpure  

---

## Context

You are working on the e-commerce + product site for **Karan Arjun Power Plus**, an agricultural biostimulant sold PAN India. The site currently has a landing page with a basic order form. Your job is to build a proper order pipeline: Razorpay payments → Firestore storage → Admin dashboard → ERP sync → Delivery tracking.

This is **production software** used by real farmers. Be careful. Test everything before pushing.

---

## Working Principles

### 1. Plug-and-Play File Structure
Every file must be self-explanatory. A new developer picking this up must understand what each file does from its name and folder alone.

**Required structure:**
```
src/
  app/
    page.tsx                          ← Landing (simplified CTAs only)
    order/
      page.tsx                        ← Full order page (redirected from landing)
    order-success/
      page.tsx                        ← Post-payment confirmation
    track/
      [orderId]/
        page.tsx                      ← Live order tracking
    admin/
      layout.tsx                      ← Admin auth wrapper
      page.tsx                        ← Admin dashboard (orders overview)
      login/
        page.tsx                      ← Admin login
      orders/
        page.tsx                      ← Full orders table
      orders/[orderId]/
        page.tsx                      ← Single order detail
    api/
      orders/
        create-razorpay/route.ts      ← Create Razorpay order ID
        confirm-payment/route.ts      ← Verify payment + save to Firestore + push to ERP
        list/route.ts                 ← Admin: list all orders
      tracking/
        [orderId]/route.ts            ← Get Shiprocket tracking status
      admin/
        auth/route.ts                 ← Verify admin token

  components/
    landing/
      Hero.tsx                        ← Keep existing
      Benefits.tsx                    ← Keep existing (will improve in T14)
      AntiCounterfeit.tsx             ← Keep existing
      Specs.tsx                       ← Keep existing
      Crops.tsx                       ← Keep existing
      HowToUse.tsx                    ← Keep existing
      SocialProof.tsx                 ← Keep existing (add Instagram videos in T15)
      Footer.tsx                      ← Keep existing
    order/
      ProductSelector.tsx             ← Size + quantity picker
      OrderForm.tsx                   ← Customer details form
      OrderSummary.tsx                ← Price breakdown
      PaymentButton.tsx               ← Razorpay trigger
    admin/
      OrdersTable.tsx                 ← Table with filters/search
      OrderStats.tsx                  ← Counts, revenue cards
      OrderDetail.tsx                 ← Single order view
      TrackingStatus.tsx              ← Shiprocket tracking inline
    shared/
      Navbar.tsx                      ← Keep existing
      Footer.tsx                      ← Keep existing

  lib/
    firebase/
      client.ts                       ← Firebase client SDK init
      admin.ts                        ← Firebase Admin SDK init (server-only)
      collections.ts                  ← Firestore collection refs
    services/
      order-service.ts                ← saveOrder(), getOrder(), listOrders()
      payment-service.ts              ← verifyRazorpaySignature()
      shipping-service.ts             ← Shiprocket: createShipment(), trackOrder()
      erp-service.ts                  ← Push order to Fiinny ERP webhook
    models/
      Order.ts                        ← Order TypeScript interface (source of truth)
      Customer.ts                     ← Customer TypeScript interface
      Payment.ts                      ← Payment TypeScript interface
    config.ts                         ← Site config (pricing, phone, etc.)
    translations.ts                   ← i18n strings
    data.ts                           ← Static data (crops, benefits)
```

### 2. Naming Conventions
- Files: `kebab-case.ts` for services/libs, `PascalCase.tsx` for components
- Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Firestore collections: `kebab-case` (e.g., `powerplus-orders`)
- API routes: descriptive verbs (`confirm-payment` not just `payment`)

### 3. Comments
Only comment the WHY, never the WHAT. If a function name explains itself, don't add a comment.

### 4. Environment Variables
All secrets go in `.env.local` (never committed). A `.env.example` must always be kept updated.

### 5. Fiinny Wiki
After completing each sprint, update the Fiinny Wiki with:
- What was built
- All new environment variables added
- Firestore collection schema
- Any third-party API keys/accounts created
- Known limitations / next steps

---

## Order Data Models (Define First — Both Teams Depend on This)

`src/lib/models/Order.ts` — this is the contract between the website and the ERP.

```typescript
export interface Customer {
  name: string;
  phone: string;           // 10-digit, no country code
  state: string;
  address: string;         // full delivery address with pincode
}

export interface OrderItem {
  size: "1L" | "3L" | "5L";
  quantity: number;
  unitPrice: number;       // base price per unit at time of order
  subtotal: number;
}

export interface Payment {
  method: "razorpay";
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  amount: number;          // total amount paid in INR (not paise)
  gst: number;
  status: "paid" | "failed" | "pending";
  paidAt: Date;
}

export interface Shipping {
  shiprocketOrderId?: string;
  shiprocketShipmentId?: string;
  trackingUrl?: string;
  courier?: string;
  status: "pending" | "processing" | "shipped" | "delivered";
  estimatedDelivery?: Date;
  lastUpdated?: Date;
}

export interface Order {
  id: string;              // Firestore doc ID — also used as order reference
  displayId: string;       // Human-readable: KAP-2026-00001
  customer: Customer;
  items: OrderItem[];
  payment: Payment;
  shipping: Shipping;
  createdAt: Date;
  updatedAt: Date;
  source: "website";       // for ERP to know where the order came from
}
```

**Share this schema with the ERP developer (Person 2) immediately so they can build their receiving endpoint.**

---

## Task List — Sequenced by Dependency

### SPRINT 1 — Foundation (May 4–10) · 7 days

---

#### T1 · Project Restructure
**What:** Reorganize files into the plug-and-play structure above. Move existing components into `components/landing/`. Create all empty service files with a comment `// TODO: implement`. Create `.env.example`.  
**Acceptance Criteria:**
- [ ] Folder structure matches the spec above exactly
- [ ] Existing site still builds and renders identically after move
- [ ] `.env.example` lists every variable the project needs
- [ ] `README.md` updated with setup instructions  

**Files touched:** all existing components, `package.json` alias paths  
**Estimated:** 1 day  
**No dependencies**

---

#### T2 · Firebase Setup
**What:** Add Firebase to the project. Two SDKs are needed: client SDK (browser, for reading tracking data) and Admin SDK (server-only, for writing orders securely).

**Steps:**
1. Create a new Firebase project at console.firebase.google.com named `karanarjun-powerplus`
2. Enable Firestore in production mode
3. Enable Firebase Authentication (Email/Password — for admin login only)
4. Add the client config to `.env.local` under `NEXT_PUBLIC_FIREBASE_*`
5. Generate a service account key for Admin SDK, add as `FIREBASE_SERVICE_ACCOUNT_KEY` in `.env.local`
6. Implement `src/lib/firebase/client.ts` (singleton pattern — check `if (getApps().length)`)
7. Implement `src/lib/firebase/admin.ts` (server-only, use `import 'server-only'`)
8. Implement `src/lib/firebase/collections.ts` with typed collection refs

**Firestore Collections:**
```
powerplus-orders/          ← all orders (main collection)
  {orderId}/
    (Order interface fields)

powerplus-admin/           ← admin config
  settings/
    (business settings)
```

**Acceptance Criteria:**
- [ ] `firebase/client.ts` exports `db`, `auth`
- [ ] `firebase/admin.ts` exports `adminDb` — only importable in server files
- [ ] `collections.ts` exports typed refs: `ordersCol`, etc.
- [ ] No Firebase credentials are in any committed file
- [ ] `.env.example` updated  

**Estimated:** 1 day  
**Depends on:** T1

---

#### T3 · Order Data Models
**What:** Create the TypeScript interfaces in `src/lib/models/`. Exactly as defined in the "Order Data Models" section above.  
**Acceptance Criteria:**
- [ ] `Order.ts`, `Customer.ts`, `Payment.ts` created
- [ ] All fields have JSDoc comments explaining units (e.g., `// INR, not paise`)
- [ ] No `any` types
- [ ] Send `Order.ts` to the ERP developer  

**Estimated:** 0.5 day  
**Depends on:** T1

---

#### T4 · Razorpay Proper Setup
**What:** Fix the existing Razorpay integration. Currently the secret key is a placeholder and there's no payment verification.

**Steps:**
1. Move Razorpay key_id and secret to `.env.local`
2. In `confirm-payment/route.ts`: verify Razorpay signature using `crypto.createHmac` before saving anything to Firestore (this is critical for security — prevents fake orders)
3. Remove hardcoded key from `BuySection.tsx`

**Verification Logic (must implement):**
```typescript
import crypto from "crypto";

function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const body = orderId + "|" + paymentId;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET!)
    .update(body)
    .digest("hex");
  return expectedSignature === signature;
}
```

**Acceptance Criteria:**
- [ ] No hardcoded keys anywhere in code
- [ ] Payment verification works — fake signatures must be rejected with 400
- [ ] UAT: place a real ₹1 test payment in Razorpay test mode and verify it saves correctly
- [ ] `.env.example` updated with `RAZORPAY_KEY_ID`, `RAZORPAY_SECRET`  

**Estimated:** 1 day  
**Depends on:** T2, T3

---

### SPRINT 2 — Order Flow (May 11–17) · 7 days

---

#### T5 · Simplify Landing Page Order Section
**What:** The current `BuySection` on the landing page is a full form + payment. Replace it with two simple CTAs that redirect to `/order`:
- **"Order Now"** → `/order` (goes directly to form)
- **"Add to Cart"** → `/order` (same page, no separate cart needed for a single product)

The `/order` page will have the full detailed form (built in T6).

**New BuySection on landing:**
```
[Hero image of bottle]
Starting at ₹500 / 1L
[Order Now →]  [See Details]
```

Keep the rest of the landing page intact.

**Acceptance Criteria:**
- [ ] Landing page `BuySection` shows price + two CTAs only
- [ ] Both CTAs navigate to `/order`
- [ ] No form or payment logic on the landing page
- [ ] Mobile: sticky bottom bar with "Order Now" button  

**Estimated:** 1 day  
**Depends on:** T1

---

#### T6 · Full Order Page (`/order`)
**What:** Build `src/app/order/page.tsx` — the dedicated order page with the full form.

**Layout (two columns on desktop, stacked on mobile):**
```
Left: Product Selector              Right: Customer Details Form
  - Size toggle (1L / 3L / 5L)        - Full Name
  - Quantity stepper                   - Phone (10 digit)
  - Price breakdown:                   - State (dropdown)
    Base price                         - Full address + pincode
    GST (5%)                         
    Delivery (₹300)                  [Pay with Razorpay  ₹XXXX]
    Total                            
  - Bottle image (changes with size)   Note: Our team will confirm
```

**Behavior:**
- Language follows the lang selected on landing (saved in localStorage — see T7)
- On successful payment: redirect to `/order-success?orderId=XXX`
- On payment failure: show inline error, let user retry

**Acceptance Criteria:**
- [ ] Page is fully functional end-to-end with payment
- [ ] Works on mobile (375px width)
- [ ] All 3 languages (EN/HI/MR) render correctly
- [ ] Delivery details form validates before Razorpay opens  

**Estimated:** 2 days  
**Depends on:** T4, T5

---

#### T7 · Language Persistence
**What:** Currently the language selection resets on page refresh. Save to `localStorage` so it persists across pages.

In `LangContext.tsx`:
```typescript
// On init: read from localStorage
const [lang, setLang] = useState<Lang>(() => {
  if (typeof window === "undefined") return "en";
  return (localStorage.getItem("ka-lang") as Lang) || "en";
});

// On change: write to localStorage
const handleSetLang = (l: Lang) => {
  setLang(l);
  localStorage.setItem("ka-lang", l);
};
```

**Acceptance Criteria:**
- [ ] Select Hindi, refresh → still Hindi
- [ ] Works across landing → /order page navigation  

**Estimated:** 0.5 day  
**Depends on:** T1

---

#### T8 · Save Orders to Firestore
**What:** Implement `src/app/api/orders/confirm-payment/route.ts`. This is the most important API route.

**Flow:**
1. Receive: `{ razorpayOrderId, razorpayPaymentId, razorpaySignature, customer, items, total }`
2. Verify Razorpay signature (from T4) → reject if invalid
3. Build the `Order` object (from T3 model)
4. Generate `displayId`: `KAP-2026-XXXXX` (use a Firestore counter or timestamp-based)
5. Save to `powerplus-orders/{orderId}` in Firestore
6. Call `erp-service.pushOrderToERP(order)` (from T11 — stub it for now)
7. Return `{ success: true, orderId, displayId }`

**Implement `src/lib/services/order-service.ts`:**
```typescript
export async function saveOrder(order: Order): Promise<void>
export async function getOrder(orderId: string): Promise<Order | null>
export async function listOrders(limit?: number): Promise<Order[]>
export async function updateShipping(orderId: string, shipping: Partial<Shipping>): Promise<void>
```

**Acceptance Criteria:**
- [ ] Placing an order saves a complete record in Firestore
- [ ] Firestore document matches the `Order` interface exactly
- [ ] Invalid signatures return 400 and nothing is saved
- [ ] Document is visible in Firebase console after test order  

**Estimated:** 1.5 days  
**Depends on:** T2, T3, T4

---

#### T9 · Order Success Page
**What:** Build `src/app/order-success/page.tsx`.

**Content:**
- "Order Confirmed!" with displayId (e.g., KAP-2026-00001)
- Summary: what they ordered, total paid
- "Track your order" link → `/track/{orderId}`
- WhatsApp link for urgent queries
- "Back to Home" button

**Acceptance Criteria:**
- [ ] Receives `orderId` from query param
- [ ] Fetches order from Firestore and shows details
- [ ] All 3 languages  

**Estimated:** 0.5 day  
**Depends on:** T8

---

### SPRINT 3 — Admin & ERP (May 18–24) · 7 days

---

#### T10 · Admin Login
**What:** Build `src/app/admin/login/page.tsx`. Simple email + password login using Firebase Auth.

- Only allow known admin emails (store allowed emails in Firestore `powerplus-admin/settings`)
- On login success → redirect to `/admin`
- Protect all `/admin/*` routes with a middleware check in `src/app/admin/layout.tsx`

**Acceptance Criteria:**
- [ ] Wrong password shows error
- [ ] Unknown email shows "Access denied"
- [ ] Refresh on `/admin` while logged in → stays on admin
- [ ] Refresh on `/admin` while logged out → redirects to `/admin/login`  

**Estimated:** 1 day  
**Depends on:** T2

---

#### T11 · Admin Orders Dashboard
**What:** Build the admin dashboard.

**`/admin` (overview):**
- Stats cards: Total Orders, Total Revenue (₹), Orders Today, Pending Shipments
- Last 10 orders preview table
- Link to `/admin/orders` for full list

**`/admin/orders` (full table):**

| Order ID | Date | Customer | State | Size/Qty | Amount | Payment | Shipping | Actions |
|---|---|---|---|---|---|---|---|---|
| KAP-2026-00001 | May 11 | Ramesh K. | MH | 3L ×2 | ₹2,835 | ✅ Paid | Pending | View |

- Filter by: State, Date range, Shipping status
- Search by: phone number, order ID

**`/admin/orders/[orderId]` (detail):**
- Full customer info
- Payment details (Razorpay IDs)
- Shipping status + tracking (from T13)
- Button: "Mark as Shipped" (opens form to enter Shiprocket details)

**Acceptance Criteria:**
- [ ] Admin can see all orders
- [ ] Can filter and search
- [ ] Mobile-usable (responsive table with horizontal scroll)
- [ ] Order count and revenue are accurate  

**Estimated:** 2.5 days  
**Depends on:** T8, T10

---

#### T12 · ERP Integration (CRITICAL — Highlighted Task)
**What:** When an order is placed on the website, it must automatically appear in the Fiinny ERP "Online Orders" screen. This is the bridge between Person 1 (website) and Person 2 (ERP).

**Coordinate with ERP developer first.** They need to:
1. Build a POST endpoint: `POST https://erp.fiinny.com/api/webhooks/powerplus-order`
2. Accept the `Order` payload (share `Order.ts` with them)
3. Return `{ success: true }` or `{ success: false, error: "..." }`

**Your job (website side) — implement `src/lib/services/erp-service.ts`:**
```typescript
export async function pushOrderToERP(order: Order): Promise<void> {
  const res = await fetch(process.env.FIINNY_ERP_WEBHOOK_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.FIINNY_ERP_WEBHOOK_SECRET}`,
    },
    body: JSON.stringify(order),
  });

  if (!res.ok) {
    // Log but don't fail the order — ERP sync failure must NOT block payment confirmation
    console.error("ERP sync failed for order:", order.id, await res.text());
  }
}
```

**Important:** ERP push failures must be silent. If the ERP is down, the order still succeeds. Add a `erpSynced: boolean` field to the Firestore order so admin can retry failed syncs.

**Acceptance Criteria:**
- [ ] Placing an order → order appears in Fiinny ERP within 5 seconds
- [ ] ERP outage → order still saves in Firestore, `erpSynced: false`
- [ ] Admin can see `erpSynced` status in order detail
- [ ] `.env.example` has `FIINNY_ERP_WEBHOOK_URL` and `FIINNY_ERP_WEBHOOK_SECRET`  

**Estimated:** 1.5 days (+ coordination time with ERP dev)  
**Depends on:** T8

---

### SPRINT 4 — Delivery & UX (May 25–28) · 4 days

---

#### T13 · Delivery Tracking (Shiprocket)
**What:** Integrate Shiprocket for shipment creation and live tracking.

**Steps:**
1. Create Shiprocket account at shiprocket.in (or use existing — ask owner)
2. Add `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` to `.env.local`
3. Implement `src/lib/services/shipping-service.ts`:

```typescript
// Authenticate and get token (cache this — it expires in 24h)
async function getShiprocketToken(): Promise<string>

// Called when admin marks order as ready to ship
export async function createShipment(order: Order): Promise<{ shipmentId: string, trackingUrl: string }>

// Called from tracking page
export async function trackOrder(shiprocketShipmentId: string): Promise<ShipmentStatus>
```

4. In admin order detail (`/admin/orders/[orderId]`): add "Create Shipment" button that calls `createShipment()`
5. Save returned `shiprocketShipmentId` and `trackingUrl` to Firestore order

**`/track/[orderId]` page:**
- Fetch order from Firestore by orderId
- Call `trackOrder()` to get live status
- Show timeline: Order Placed → Processing → Shipped → Out for Delivery → Delivered
- Show estimated delivery date and courier name

**Acceptance Criteria:**
- [ ] Admin can create a shipment from the order detail page
- [ ] Customer can track their order at `/track/{orderId}`
- [ ] Tracking page shows current status and courier
- [ ] Works without Shiprocket (graceful fallback: "Shipment being prepared")  

**Estimated:** 2 days  
**Depends on:** T11

---

#### T14 · UI/UX Improvements
**What:** Improve the landing page based on these specific items:

1. **Benefits Section:** Add a visual comparison — show before/after numbers. E.g., "Without Power Plus: 70% yield | With Power Plus: 92% yield" as a simple progress bar or stat card. Keep the existing 6 benefit cards but add one "Results at a glance" row above them.

2. **Mobile Sticky CTA:** Add a fixed bottom bar on mobile only:
```
[₹500 from] ·  [  🛒 Order Now  ]
```
Only visible below the hero section (disappears when #buy is in view).

3. **Navbar:** Replace `☰` text with a proper SVG hamburger icon. Lang toggle should show a globe icon + current lang abbreviation.

4. **How to Use:** Add step numbers (Step 1, Step 2, Step 3) visually above each card.

**Acceptance Criteria:**
- [ ] All changes work in all 3 languages
- [ ] Sticky CTA visible on mobile only (hidden on desktop)
- [ ] Benefits section has the "at a glance" comparison row  

**Estimated:** 1.5 days  
**Depends on:** T5

---

### SPRINT 5 — SEO & Polish (May 29 – June 1) · 4 days

---

#### T15 · Instagram Videos Section
**What:** Add a section on the landing page showing recent posts from `@karanarjun_ksk_priyanka_mall`. 

Use Instagram's oEmbed API or a static embed approach:
- Take 3–4 specific Reel/post URLs from the owner
- Use `<blockquote class="instagram-media">` embed code for each
- Load `//www.instagram.com/embed.js` asynchronously

Title: "देखिये किसानों का अनुभव" (See what farmers say)

**Acceptance Criteria:**
- [ ] 3–4 Instagram posts/reels embedded and loading
- [ ] Section loads lazily (doesn't block page load)
- [ ] Works on mobile  

**Estimated:** 0.5 day  
**Depends on:** T14 (visual consistency)  
**Note:** Get the specific post URLs from the owner before starting.

---

#### T16 · SEO Optimization
**What:** Improve search ranking for queries like "humates fulvates liquid fertilizer Maharashtra" and "Karan Arjun Power Plus price".

**Steps:**
1. `src/app/layout.tsx`: Add comprehensive metadata
```typescript
export const metadata: Metadata = {
  title: "Karan Arjun Power Plus | Humates & Fulvates 22% Liquid Biostimulant",
  description: "India's trusted biostimulant for grapes, onion, banana & vegetables. ISO 9001 certified. PAN India delivery. ₹500/L onwards.",
  keywords: ["humates fulvates", "biostimulant India", "crop yield booster", "Power Plus fertilizer"],
  openGraph: { ... },
};
```

2. Add Product structured data in `layout.tsx`:
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Karan Arjun Power Plus",
  "offers": {
    "@type": "Offer",
    "price": "500",
    "priceCurrency": "INR",
    "availability": "https://schema.org/InStock"
  }
}
```

3. Verify `sitemap.ts` includes `/order` and `/track` pages
4. Add `alt` text audit — ensure all images have descriptive alt text in all 3 languages
5. Add page speed check — images should use `next/image` with proper `sizes` prop

**Acceptance Criteria:**
- [ ] Google's Rich Results Test passes for Product schema
- [ ] PageSpeed score ≥ 85 on mobile
- [ ] All images have meaningful alt text  

**Estimated:** 1 day  
**Depends on:** T15

---

#### T17 · Final QA & Deployment
**What:** Full end-to-end test before June 1 deadline.

**Test checklist:**
- [ ] Place a real test order (Razorpay test mode): confirm → Firestore → ERP → success page
- [ ] Admin login works, order visible in dashboard
- [ ] Order tracking page loads correctly
- [ ] All 3 languages on every page
- [ ] Mobile (375px), tablet (768px), desktop (1440px)
- [ ] No TypeScript errors (`npm run build` passes)
- [ ] Deploy to Firebase Hosting: `firebase deploy`
- [ ] Verify live site at https://karanarjun-powerplus.web.app

**Estimated:** 1.5 days  
**Depends on:** All above

---

## ERP Developer (Person 2) — Coordination Points

These are items Person 1 (website) needs from Person 2 (Fiinny ERP):

| What | From | To | By When |
|------|------|-----|---------|
| Share `Order.ts` model | Person 1 | Person 2 | May 6 |
| ERP webhook URL + secret | Person 2 | Person 1 | May 16 |
| ERP "online orders" screen built | Person 2 | — | May 22 |
| End-to-end ERP sync test | Both | — | May 24 |

---

## Environment Variables Reference

All variables for `.env.local` (never commit this file):

```bash
# Firebase (Client)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=karanarjun-powerplus
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase (Admin — server only)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Razorpay
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_S1aAwIHZXLMSDG
RAZORPAY_SECRET=

# Fiinny ERP
FIINNY_ERP_WEBHOOK_URL=
FIINNY_ERP_WEBHOOK_SECRET=

# Shiprocket
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=

# Admin
ADMIN_ALLOWED_EMAILS=arjun@example.com,admin@example.com
```

---

## Daily Standup Format

Every day, update the owner with:
```
Date: 
Completed:
Working on:
Blocked by:
Fiinny Wiki updated: Yes / No
```

---

## Fiinny Wiki — What to Document

After each sprint, add/update:
1. **Firebase schema** — collection name, field list, field types
2. **API routes** — endpoint, method, request body, response body
3. **Environment variables** — name, purpose, where to get the value
4. **Third-party accounts** — Razorpay dashboard link, Shiprocket account email
5. **Known issues / workarounds** — anything non-obvious that would trip up the next developer

---

## Summary Timeline

| Sprint | Dates | Tasks | Goal |
|--------|-------|-------|------|
| 1 — Foundation | May 4–10 | T1, T2, T3, T4 | Firebase ready, project restructured, Razorpay secure |
| 2 — Order Flow | May 11–17 | T5, T6, T7, T8, T9 | Full order pipeline working end-to-end |
| 3 — Admin & ERP | May 18–24 | T10, T11, T12 | Admin dashboard live, ERP sync working |
| 4 — Delivery & UX | May 25–28 | T13, T14 | Tracking live, UX improved |
| 5 — SEO & Polish | May 29–Jun 1 | T15, T16, T17 | Videos, SEO, QA, final deploy |

**Hard deadline: June 1, 2026.**
