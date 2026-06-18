# UAT Migration — Production vs UAT Configuration Audit

Full comparison of `krishidukan-e8315` (production) vs `karan-arjun-uat`.
Everything in this file is read-only analysis — no production changes are made.

---

## 1. Firestore Rules

**Status: IDENTICAL** — same `firestore.rules` file deploys to both projects.

The rules use `myPhone()`, `isAdmin()`, and `phoneMatches()` helpers that resolve
identity from Firestore data, not project-level config. They are fully portable.

Collections covered by rules (all must exist in UAT):
`uidIndex`, `users`, `profiles`, `catalog`, `listings`, `manufacturerNetwork`,
`seatListings`, `subscriptions`, `payments`, `failedPayments`, `orders`, `hubs`,
`adminLogs`, `contactMessages`, `products`, `retailers`, `stores`, `manufacturers`,
`brandPages`, `inventory`, `manufacturerRetailers`, `retailerSeatListings`,
`manufacturer_contacts`, `reportLogs`, `deliverySettings`, `companyPages`,
`blogPosts`, `siteVisits`, `appVersion`, `productReviews`, `storeReviews`,
`notifications`, `carts`

**Deploy command:**
```bash
firebase deploy --only firestore:rules \
  --project karan-arjun-uat \
  --config firebase.uat.json
```

---

## 2. Firestore Indexes

**Status: IDENTICAL** — same `firestore.indexes.json` deploys to both.

19 composite indexes across 9 collections:

| Collection | Index fields |
|---|---|
| `catalog` | `category + isActive + createdAt` |
| `catalog` | `nameSearch + isActive` |
| `catalog` | `createdByPhone + isActive + createdAt` |
| `listings` | `catalogId + isActive` |
| `listings` | `catalogId + isActive + sellerType` |
| `listings` | `sellerPhone + isActive + createdAt` |
| `listings` | `assignedByManufacturerPhone + isActive` |
| `manufacturerNetwork` | `manufacturerPhone + status + addedAt` |
| `manufacturerNetwork` | `retailerPhone + status` |
| `orders` | `customerPhone + createdAt` |
| `orders` | `sellerPhone + status + createdAt` |
| `subscriptions` | `ownerPhone + subscriptionStatus + expiryDate` |
| `seatListings` | `ownerPhone + status + listingType` |
| `seatListings` | `ownerPhone + catalogId + status` |
| `payments` | `userPhone + createdAt` |
| `products` | `manufacturerId + isActive` |
| `blogPosts` | `status + publishedAt` |
| `productReviews` | `catalogId + createdAt` |
| `storeReviews` | `storePhone + createdAt` |

> **Note:** Indexes take 5–10 minutes to build after deployment. The app will
> return index errors until building completes. Monitor at:
> Firebase Console → karan-arjun-uat → Firestore → Indexes

**Deploy command:**
```bash
firebase deploy --only firestore:indexes \
  --project karan-arjun-uat \
  --config firebase.uat.json
```

---

## 3. Storage Rules

**Status: IDENTICAL** — same `storage.rules` deploys to both.

Two buckets protected:
- `/blog-covers/**` — public read, auth write
- `/product-images/**` — public read, auth write
- Everything else — denied

**Deploy command:**
```bash
firebase deploy --only storage \
  --project karan-arjun-uat \
  --config firebase.uat.json
```

---

## 4. Cloud Functions

**Status: IDENTICAL CODE — must redeploy** to UAT project.

7 functions in `functions/src/index.ts`. All use `admin.initializeApp()` with no
arguments, which automatically binds to the project they're deployed in.

| Function | Trigger | Description |
|---|---|---|
| `syncSellerProductToCanonical` | `onDocumentWritten("products/{productId}")` | Mirrors seller copy price/stock/discount → canonical availability[] and inventory doc |
| `decrementStockOnOrder` | `onDocumentCreated("orders/{orderId}")` | Decrements stockQuantity on product + inventory when order placed |
| `expireSubscriptions` | `onSchedule("every 24 hours", Asia/Kolkata)` | Flips `isPaid=false` on users with expired subscriptions |
| `notifySellerOnOrder` | `onDocumentCreated("orders/{orderId}")` | Pushes/in-app notification to seller on new order |
| `notifyCustomerOnOrderStatus` | `onDocumentWritten("orders/{orderId}")` | Pushes/in-app notification to customer on status change |
| `notifyRetailerOnAssignment` | `onDocumentCreated("products/{productId}")` | Notifies retailer when manufacturer/admin assigns a product |
| `notifyRetailerOnNetworkAdd` | `onDocumentCreated("manufacturerRetailers/{docId}")` | Notifies retailer when added to manufacturer network |

**Runtime:** Node 20 (set in `functions/package.json` `engines.node`)

**Deploy commands:**
```bash
# Build first
(cd functions && npm run build)

# Deploy
firebase deploy --only functions \
  --project karan-arjun-uat \
  --config firebase.uat.json
```

> **Scheduler note:** `expireSubscriptions` runs `every 24 hours` on UAT too.
> This is correct — test subscriptions in UAT should expire normally.

---

## 5. Hosting Configuration

**Production** has 2 hosting targets:

| Target | Firebase Site | Purpose |
|---|---|---|
| `main` | `krishidukan-e8315` | Customer-facing app — admin routes return 404 |
| `admin` | `krishidukan-admin` | Admin panel — no route restrictions |

**UAT** has 1 hosting target (`firebase.uat.json`):

| Target | Firebase Site | Purpose |
|---|---|---|
| `main` | `karan-arjun-uat` | UAT app — same admin-route 404 rewrites as prod |

**GAP:** No `admin` hosting target for UAT. The admin panel is accessible via the
main UAT URL `/admin-login` (redirect is to 404.html on the main site, same as prod).
If a separate UAT admin site is needed:
1. Create `karan-arjun-uat-admin` hosting site in Firebase Console
2. Add `"admin": ["karan-arjun-uat-admin"]` to `.firebaserc` under `karan-arjun-uat` targets
3. Add an `admin` hosting entry to `firebase.uat.json`

**Hosting is served via App Hosting (Next.js SSR)** — static deploy is a fallback only.
The real hosting for UAT is `apphosting.uat.yaml`.

---

## 6. App Hosting (Next.js)

**Production** (`apphosting.yaml`):

| Setting | Value |
|---|---|
| `concurrency` | 80 |
| `maxInstances` | 2 |
| Auth domain | `krishidukan.com` (custom domain) |
| Razorpay keys | `rzp_live_*` (live) |

**UAT** (`apphosting.uat.yaml`):

| Setting | Value |
|---|---|
| `concurrency` | 20 |
| `maxInstances` | 1 |
| Auth domain | `karan-arjun-uat.firebaseapp.com` |
| Razorpay keys | `rzp_test_*` (test) |

**GAP:** App Hosting backend for UAT does not yet exist. Creation steps:
```bash
firebase apphosting:backends:create \
  --project karan-arjun-uat \
  --location us-central1

# When prompted for config file, specify apphosting.uat.yaml
```

---

## 7. Environment Variables — Full Diff

### NEXT_PUBLIC_* (baked into browser bundle at build time)

| Variable | Production | UAT | Same? |
|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `krishidukan-e8315` | `karan-arjun-uat` | ✗ |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyDh_Y67...` | `AIzaSyAG7Q5Q...` | ✗ |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `krishidukan.com` | `karan-arjun-uat.firebaseapp.com` | ✗ |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `krishidukan-e8315.firebasestorage.app` | `karan-arjun-uat.firebasestorage.app` | ✗ |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `650303885415` | `823396858694` | ✗ |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:650303885415:web:7db7...` | `1:823396858694:web:647ee...` | ✗ |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | `G-7MEFGCD4EX` | `G-KPJCC681D5` | ✗ |
| `NEXT_PUBLIC_BASE_URL` | `https://krishidukan.com` | `https://karan-arjun-uat.web.app` | ✗ |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `rzp_live_S1aAwIHZXLMSDG` | `rzp_test_SmPxtEcNJ25LUj` | ✗ |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `AIzaSyDh_Y67TDJc2K...` | `AIzaSyDh_Y67TDJc2K...` | ✓ |
| `NEXT_PUBLIC_CRON_SECRET` | `krishidukan-cron-2026` | `krishidukan-uat-cron-secret` | ✗ |

### Server-side runtime variables

| Variable | Production | UAT | Same? |
|---|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_live_S1aAwIHZXLMSDG` | `rzp_test_SmPxtEcNJ25LUj` | ✗ |
| `RAZORPAY_KEY_SECRET` | secret `RAZORPAY_KEY_SECRET` | secret `RAZORPAY_KEY_SECRET_UAT` | ✗ (different secret) |
| `SMTP_HOST` | `smtp.gmail.com` | `smtp.gmail.com` | ✓ |
| `SMTP_PORT` | `587` | `587` | ✓ |
| `SMTP_SECURE` | `false` | `false` | ✓ |
| `SMTP_USER` | secret `SMTP_USER` (prod project) | secret `SMTP_USER` (UAT project) | Same name, independent values |
| `SMTP_PASS` | secret `SMTP_PASS` (prod project) | secret `SMTP_PASS` (UAT project) | Same name, independent values |
| `SMTP_FROM` | `KrishiDukan <...>` | `KrishiDukan UAT <...>` | ✗ |
| `CRON_SECRET` | `krishidukan-cron-2026` | `krishidukan-uat-cron-secret` | ✗ |
| `FIREBASE_PROJECT_ID` | `krishidukan-e8315` | `karan-arjun-uat` | ✗ |
| `FIREBASE_CLIENT_EMAIL` | secret `FIREBASE_CLIENT_EMAIL` | secret `FIREBASE_CLIENT_EMAIL_UAT` | ✗ (different SA) |
| `FIREBASE_PRIVATE_KEY` | secret `FIREBASE_PRIVATE_KEY` | secret `FIREBASE_PRIVATE_KEY_UAT` | ✗ (different SA) |

### Secret Manager — secrets to create in UAT project

```bash
# All of these must be created in the karan-arjun-uat project.
# Production secrets are NOT copied — UAT gets its own values.

firebase apphosting:secrets:set RAZORPAY_KEY_SECRET_UAT  --project karan-arjun-uat
# Value: your Razorpay TEST secret (rzp_test_...)

firebase apphosting:secrets:set FIREBASE_CLIENT_EMAIL_UAT --project karan-arjun-uat
# Value: service account email from karan-arjun-uat SA JSON

firebase apphosting:secrets:set FIREBASE_PRIVATE_KEY_UAT  --project karan-arjun-uat
# Value: private key from karan-arjun-uat SA JSON

firebase apphosting:secrets:set SMTP_USER  --project karan-arjun-uat
# Value: Gmail address (can reuse prod or use a separate test mailbox)

firebase apphosting:secrets:set SMTP_PASS  --project karan-arjun-uat
# Value: Gmail App Password for above address
```

---

## 8. Authentication

**Status: NOT automatically replicated** — must enable manually.

| Provider | Production | UAT | Action |
|---|---|---|---|
| Phone | ✓ | ✗ (must enable) | Firebase Console → karan-arjun-uat → Authentication → Sign-in method → Phone |
| Email/Password | ✓ | ✗ (must enable) | Firebase Console → Authentication → Email/Password |
| Authorized domains | `krishidukan.com`, `krishidukan-e8315.firebaseapp.com` | `karan-arjun-uat.web.app`, `localhost` | Firebase Console → Authentication → Settings → Authorized domains |

---

## 9. What Does NOT Need Replication

| Item | Why |
|---|---|
| Production Firestore data | UAT has its own data via `npm run seed:uat` |
| Production Storage files | UAT uploads go to UAT bucket |
| Custom domain (`krishidukan.com`) | UAT uses `*.web.app` — no custom domain needed |
| Live Razorpay keys | UAT uses test keys — no real transactions |
| Production FCM tokens | UAT test devices register their own tokens |
| Google Analytics property | Optional — UAT has its own measurement ID |
| `krishidukan-admin` hosting site | No separate admin site needed for UAT |

---

## 10. Full Deployment Sequence

Run once to initialize the UAT project from scratch:

```bash
# 0. Prerequisites check
firebase --version         # must be >= 13.x
firebase login             # must be logged in
firebase projects:list     # karan-arjun-uat must appear

# 1. One-time setup (secrets + all deploys)
bash scripts/setup-uat-project.sh

# 2. Seed test data (requires UAT service account)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/karan-arjun-uat-sa.json
npm run seed:uat

# 3. Start local dev against UAT
npm run dev:uat
```

For subsequent deploys after code changes:

```bash
npm run deploy:uat
# or individually:
firebase deploy --only firestore:rules --project karan-arjun-uat --config firebase.uat.json
firebase deploy --only firestore:indexes --project karan-arjun-uat --config firebase.uat.json
firebase deploy --only storage --project karan-arjun-uat --config firebase.uat.json
firebase deploy --only functions --project karan-arjun-uat --config firebase.uat.json
```

---

## 11. Checklist — UAT Project Readiness

### Firebase Console (manual)
- [ ] Firestore database created (region: `asia-south1`)
- [ ] Storage enabled (region: `asia-south1`)
- [ ] Authentication → Phone sign-in enabled
- [ ] Authentication → Email/Password enabled
- [ ] Authentication → Authorized domains: added `karan-arjun-uat.web.app`, `localhost`

### CLI (run `setup-uat-project.sh`)
- [ ] Secret `RAZORPAY_KEY_SECRET_UAT` created in UAT Secret Manager
- [ ] Secret `FIREBASE_CLIENT_EMAIL_UAT` created in UAT Secret Manager
- [ ] Secret `FIREBASE_PRIVATE_KEY_UAT` created in UAT Secret Manager
- [ ] Secret `SMTP_USER` created in UAT Secret Manager
- [ ] Secret `SMTP_PASS` created in UAT Secret Manager
- [ ] Firestore rules deployed
- [ ] Firestore indexes deployed (wait for build to complete)
- [ ] Storage rules deployed
- [ ] Cloud Functions deployed (7 functions)

### App Hosting (when ready to host UAT online)
- [ ] App Hosting backend created for `karan-arjun-uat`
- [ ] Backend linked to GitHub repo + UAT branch
- [ ] `apphosting.uat.yaml` specified as config
- [ ] Secret accessor roles granted to App Hosting service account

### Test data
- [ ] UAT service account key downloaded
- [ ] `npm run seed:uat` executed successfully
- [ ] Auth test users created in Firebase Console for each role
