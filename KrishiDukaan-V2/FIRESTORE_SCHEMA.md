# KrishiDukaan V2 — Firestore Schema Reference

## Core design principles

| Principle | Decision |
|-----------|----------|
| Primary user key | Normalized phone number e.g. `+919876543210` |
| Auth bridge | `uidIndex/{uid}` maps Firebase Auth UID → phone |
| Product architecture | Catalog (master) + Listings (seller offers) |
| Seller product list | Stored as `catalogIds[]` in `profiles/{phone}` — no collection scan |
| Email | Optional; added in profile; fetched before any notification |

---

## Collections

### `uidIndex/{uid}`
Maps the Firebase Auth UID to the user's normalized phone. Written once on first signup. Used by security rules via `get()` to resolve phone from `request.auth.uid`.

```
uid            string   // Firebase Auth UID (= doc ID)
phone          string   // "+919876543210"
createdAt      Timestamp
```

---

### `users/{phone}`
Doc ID = normalized phone. Auth/role metadata only. Business details live in `profiles`.

```
phone          string   // "+919876543210"  (= doc ID)
uid            string   // Firebase Auth UID for reverse lookup
name           string
email          string | null    // optional, added in profile section
role           "consumer" | "retailer" | "manufacturer" | "admin"
roleUpgradeHistory  [{ from, to, at: Timestamp }]
isPaid         boolean          // quick subscription flag
totalSeats     number
productCount   number           // incremented atomically on listing create
createdAt      Timestamp
updatedAt      Timestamp
```

**Role upgrade path:**
`consumer` → `retailer` → `manufacturer`  
Downgrade is blocked by security rules.

---

### `profiles/{phone}`
Business profile — only exists for retailers and manufacturers. Public read so marketplace can show seller cards.

```
type           "retailer" | "manufacturer"
ownerPhone     string
businessName   string
ownerName      string
phone          string   // display phone (may differ from doc ID formatting)
email          string | null
address        { line1, city, state, pincode }
geo            GeoPoint
isActive       boolean
subscriptionStatus  "free" | "active" | "expired"

// Performance: list of catalogIds this seller sells
// Avoids scanning the entire listings collection to find a seller's products.
// Use array-contains for "products for a seller" queries.
// For sellers with >100 products use the seatListings collection instead.
catalogIds     string[]   // max 100

// For manufacturers: quick count/list of network retailers
retailerPhones string[]   // denormalized; detail in manufacturerNetwork

onboardedByManufacturerPhone  string | null  // if invited by a manufacturer

createdAt      Timestamp
updatedAt      Timestamp
```

---

### `catalog/{catalogId}`
Master product catalog. One document per unique product definition. Multiple sellers can reference the same `catalogId` via `listings`.

```
name           string
nameSearch     string   // name.toLowerCase() — enables prefix search
category       string
description    string
images         string[]
tags           string[]
unit           string   // default unit of measurement

// Creator info (denormalized for product page display)
createdByPhone string
createdByType  "retailer" | "manufacturer"
createdByName  string   // business name

sellerCount    number   // incremented when a listing is added
isActive       boolean
createdAt      Timestamp
updatedAt      Timestamp
```

**Marketplace query (browse by category):**
```ts
query(collection(db, 'catalog'),
  where('category', '==', 'seeds'),
  where('isActive', '==', true),
  orderBy('createdAt', 'desc'),
  limit(20)
)
```

**Search by name:**
```ts
query(collection(db, 'catalog'),
  where('nameSearch', '>=', term.toLowerCase()),
  where('nameSearch', '<=', term.toLowerCase() + ''),
  where('isActive', '==', true)
)
```

---

### `listings/{listingId}`
A seller's specific offer of a catalog item. Multiple listings can point to the same `catalogId` — one per seller. Seller details are **denormalized** here so the marketplace never needs to join `profiles`.

```
catalogId      string   // ref to catalog/{catalogId}

// Seller (denormalized for zero-join marketplace display)
sellerPhone    string
sellerType     "retailer" | "manufacturer"
sellerName     string
sellerAddress  { line1, city, state, pincode }
sellerGeo      GeoPoint

// Offer details
price          number
variants       [{ unit: string, price: number }]
stockQuantity  number
sellMode       "online_delivery" | "offline_store_only"
isActive       boolean

// If this listing was assigned by a manufacturer to this retailer
assignedByManufacturerPhone  string | null
assignedAt                   Timestamp | null

createdAt      Timestamp
updatedAt      Timestamp
```

**Get all sellers for a product (marketplace product page):**
```ts
query(collection(db, 'listings'),
  where('catalogId', '==', catalogId),
  where('isActive', '==', true)
)
```

**Get all listings by one seller (seller profile page):**
```ts
// Fast path — read catalogIds from profile (no scan)
const profile = await getDoc(doc(db, 'profiles', sellerPhone));
const ids: string[] = profile.data().catalogIds;
const catalogDocs = await Promise.all(ids.map(id => getDoc(doc(db, 'catalog', id))));
```

---

### `manufacturerNetwork/{docId}`
Manufacturer ↔ Retailer relationship. One document per link.

```
manufacturerPhone  string
manufacturerName   string   // denormalized

retailerPhone      string   // empty string "" if retailer hasn't signed up yet
retailerName       string   // denormalized

status             "invited" | "active" | "revoked"
inviteCode         string   // 10-char alphanumeric, for claiming
claimable          boolean

// Data for pre-created retailers (not yet registered via OTP)
isPreCreated       boolean
preCreatedData     {
  shopName, ownerName, email, address, geo
} | null

addedAt    Timestamp
updatedAt  Timestamp
```

**Manufacturer → Retailer assignment flow:**
1. Manufacturer creates `manufacturerNetwork` doc (status: `invited`, claimable: `true`)
2. Email sent to retailer's address with invite code
3. Retailer signs up via OTP → on first login, looks up invite by `inviteCode`
4. Retailer claims invite: status → `active`, `retailerPhone` filled, `claimable` → `false`
5. Manufacturer assigns product: creates `listings` doc with `sellerPhone = retailerPhone`, `assignedByManufacturerPhone = manufacturerPhone`
6. Retailer's shop automatically appears on the product's marketplace page

---

### `subscriptions/{docId}`
One document per subscription purchase. Never overwritten — new purchase = new document.

```
ownerPhone           string
ownerType            "retailer" | "manufacturer"
planName             string
seatsPurchased       number
durationMonths       number
amountPaid           number
currency             "INR"
razorpayOrderId      string | null
razorpayPaymentId    string | null
subscriptionStatus   "active" | "expired" | "cancelled"
startDate            Timestamp
expiryDate           Timestamp
createdAt            Timestamp
updatedAt            Timestamp
```

---

### `seatListings/{docId}`
Tracks which seat is consumed by which listing. One doc per active seller-listing pair.

```
ownerPhone                   string
ownerType                    "retailer" | "manufacturer"
listingId                    string   // ref to listings/{listingId}
catalogId                    string   // denormalized for easy querying
listingType                  "own" | "assigned"
status                       "active" | "released" | "expired"
assignedByManufacturerPhone  string | null
expiresAt                    Timestamp
assignedAt                   Timestamp
releasedAt                   Timestamp | null
```

---

### `orders/{orderId}`

```
customerPhone    string
customerName     string
customerAddress  string

sellerPhone      string
sellerType       "retailer" | "manufacturer"
sellerName       string   // denormalized

items            [{
  catalogId, listingId, name, price, qty, lineTotal
}]
subtotal         number
deliveryMode     "delivery" | "pickup"
status           "placed" | "accepted" | "out_for_delivery" | "delivered" | "rejected"

createdAt        Timestamp
updatedAt        Timestamp
```

---

### `payments/{paymentId}`

```
userPhone          string
amount             number
seatCount          number
durationMonths     number
currency           "INR"
razorpayOrderId    string | null
razorpayPaymentId  string | null
status             "success" | "failed" | "pending"
createdAt          Timestamp
```

---

### `hubs/{hubId}`
Crop knowledge hubs. Unchanged from previous schema.

---

## Product ownership & seller mapping

```
catalog/{catalogId}
  └─ createdByPhone = "+91XXXXXXXXXX"   ← shown at bottom of product page

listings/{listingId}          (one per seller)
  ├─ catalogId → catalog/{catalogId}
  ├─ sellerPhone = "+91AAAA..."         ← manufacturer
  └─ sellerPhone = "+91BBBB..."         ← assigned retailer
```

**Product page rendering:**
1. Fetch `catalog/{catalogId}` — master info
2. Query `listings` where `catalogId == X && isActive == true` — all seller cards
3. Sort by proximity (sellerGeo), price, or seller rating
4. Show original creator at the bottom using `catalog.createdByPhone` → `profiles/{phone}`

---

## Role upgrade workflow

### Consumer → Retailer (self-upgrade)
```
1. User fills business profile form
2. Write profiles/{phone} with type: "retailer"
3. Update users/{phone}.role = "retailer"
4. Append { from: "consumer", to: "retailer", at: now } to roleUpgradeHistory
```

### Retailer → Manufacturer (self-upgrade)
Same pattern, type: "manufacturer".

### Consumer onboarded by Manufacturer
```
1. Manufacturer adds retailer → manufacturerNetwork doc created (status: "invited")
2. Invite email sent with code
3. Retailer signs up via phone OTP
4. On first login: look up manufacturerNetwork by inviteCode
5. Claim: update status → "active", fill retailerPhone
6. Auto-create profiles/{retailerPhone} from preCreatedData
7. Update users/{retailerPhone}.role = "retailer"
```

---

## Notification / email architecture

- Email stored in `users/{phone}.email` (optional field)
- Before sending any notification:
  1. Fetch fresh email from `users/{phone}.email`
  2. Skip if null or placeholder (e.g. ends with `@krishidukan.local`)
- Triggers:
  | Event | Email target | Template |
  |-------|-------------|----------|
  | Manufacturer adds retailer | retailer email | Invite + invite code |
  | Product assigned to retailer | retailer email | Product assigned notification |
  | Order placed | customer email (if set) + seller email | Order confirmation |

---

## Scalability notes

- `profiles.catalogIds[]` is capped at ~100 items for `array-contains` queries. Sellers with more products should be queried via `seatListings` (ownerPhone + status).
- Denormalized seller fields in `listings` eliminates joins on marketplace load.
- `catalog.nameSearch` (lowercase name) enables prefix search without Algolia for modest catalogs (<50k products). Switch to Algolia/Typesense at scale.
- Composite indexes in `firestore.indexes.json` cover all production query patterns.
- Incremental counters (`productCount`, `sellerCount`) use `increment()` — no transaction needed.
