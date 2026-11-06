# Follow-up: speed and cost on the seller, manufacturer and admin side

Status (2026-10-06): items 1-8 below are done on branch
`claude/clever-babbage-0k7r10` (built on `claude/busy-keller-iica2f`), not
deployed. What changed, what to deploy and how to check it: "Seller,
manufacturer and admin side" in `docs/performance-rollout-2026-10.md`
(S1-S7). The audit of the remaining screens is at the end of this file, with
what is still open.

The original brief follows. Line numbers are as of commit e0a52fcf.

## Before you start

- Work on top of `claude/busy-keller-iica2f` (it holds the earlier speed and
  privacy work, not deployed yet). Do not deploy. Do not touch production data.
- Read `docs/performance-explained.md` (Part 6, rules for every new feature) and
  `docs/performance-rollout-2026-10.md` first.
- Every new or changed query must pass `firestore.rules` (rules are not filters:
  a list query must filter on what the rule checks). Add any new composite index
  to `firestore.indexes.json`. Test rule-sensitive changes on the Firestore
  emulator with `@firebase/rules-unit-testing`.
- Old app versions stay in people's hands for weeks: keep their queries working.
- Checks before each commit: web typecheck (`npx tsc --noEmit -p .` in
  `KrishiDukaan-V2`, 20 errors already exist), functions typecheck,
  `flutter analyze` (52 issues already exist) and `flutter test` in `mobile/`.
- Update the rollout guide (new indexes, functions, steps) when you add any.

## High priority

1. **"Add product" name search downloads every product.**
   `searchProductsByName` in `app/dashboard/_lib/manufacturer-products-firestore.ts`
   (~line 358) runs `products orderBy name` with no limit (~4,222 documents) on
   every typing pause (350 ms) in `app/dashboard/_components/add-product-inventory-form.tsx`
   (`handleNameChange`, ~line 596). Retailers, manufacturers and admins all use it.
   Fix: search the `marketplaceCards` / search entries the Market search already
   uses, at most 10 results. Keep what the form needs: the chosen product's ID
   (it becomes the new copy's `originalProductId`), the same source ranking
   (manufacturer_inventory first), and the autofill fields (category, description,
   images, variants, unit, price, NPK, dosage, bestForCrops). If a card lacks a
   field, read that one product by ID after the seller picks it, not per keystroke.

2. **Admin WhatsApp inbox listens to every WhatsApp message ever.**
   `app/admin/whatsapp/page.tsx` (~lines 316-350): live `onSnapshot` on the whole
   `waIncomingMessages` and `waConversations` collections (no order, no limit, on
   purpose because some docs lack `receivedAt`), and it logs a full message to
   the browser console. Fix: list the latest ~50 conversations (order by last
   message time, "load more"), load messages only for the open conversation,
   make the writer always set the time field (and backfill old docs with a
   script), and remove the console logging of message content.

## Medium priority (fine today, slow and costly as we grow)

3. **Admin portal downloads whole collections.** `app/admin/_lib/admin-data.ts`
   (memory cache, 10 min) wraps `fetchAllUsers`, `fetchAllSellerProducts` (all
   products), `fetchAllSubscriptions`, `fetchAllPlans`, `fetchAllOrdersForAdmin`
   in `app/firebase.ts`. Used by Users, Team, Companies, Reports, Subscriptions,
   Products, Orders, Sales team and WhatsApp templates pages.
   - Fix: tables load 50 rows at a time with filters and search done by queries;
     totals via `getCountFromServer`; a full download only behind an "Export" button.
   - Admin Overview (`app/admin/page.tsx` ~line 66) loads every product just to
     count them: count `marketplaceCards` instead (already done in
     `app/admin/_lib/analytics-queries.ts` ~line 166).
   - Admin analytics (`app/admin/_lib/analytics-queries.ts`): "All time" GMV and
     order metrics read every order; subscription revenue, payment funnel and a
     users chart read whole collections. Fix: `sum()`/`count()` aggregations (add
     the createdAt + grandTotal index the code comment mentions) or a daily
     totals document kept by a Cloud Function.
   - Other full scans: payments (`paymentAttempts`), payouts (`payoutAccounts`),
     sales team (`dealerVisits`, `dealers`), moderation (`contentReports`),
     WhatsApp template flows (`uidIndex`, `retailerSeatListings`, `payoutAccounts`),
     `fetchFailedPayments`, `fetchContactMessages`. Fix: newest first, a limit,
     "load more", and status filters.

4. **Manufacturer network map reads each retailer one by one.**
   `fetchManufacturerNetworkStores` in `app/firebase.ts` (~line 3572): one
   `retailers/{id}` read per retailer (200 retailers = 200 reads). Used by
   `app/dashboard/company/page.tsx` and `app/admin/companies/page.tsx`. Fix: take
   address and location from the store directory (1-2 documents, already built;
   see `STORE_DIRECTORY` in `app/firebase.ts`), fall back to the mirror doc.
   Also `fetchRetailerAssignedProducts` in
   `app/dashboard/_lib/manufacturer-retailers-firestore.ts` (~line 800): one
   product read per listing; batch with `documentId() in` (30 per query, in parallel).

5. **Seller dashboard home and analytics read the seller's whole history.**
   `fetchRetailerAnalytics` in `app/dashboard/_lib/analytics-firestore.ts` reads
   every order the seller ever had (several overlapping queries over
   sellerPhone/sellerId and uid/phone forms), all followers and reels, and loads
   the seller's products again although `app/dashboard/page.tsx` already did.
   Fix: a per-seller daily stats document kept by a Cloud Function on order
   writes (like `productStats`), reuse the products already loaded, and limit
   charts to a date window.

6. **Order and enquiry lists have no limit.**
   - Web: `fetchRetailerOrders` in `app/firebase.ts` (~line 1293) loads all orders
     and sorts in the browser.
   - App: `watchSellerOrders` in `mobile/lib/features/dashboard/data/dashboard_repository.dart`
     (~line 1150) and in `mobile/lib/features/orders/data/order_repository.dart`
     (~lines 255-340): 3 overlapping live listeners each, no limit; the buyer's
     order list too.
   - App enquiries: `mobile/lib/features/enquiries/data/enquiry_repository.dart`
     (~line 24), live, no limit.
   - Fix: newest first, 30 at a time, "load more"; live listener only on the
     first page. Fewer overlapping queries if orders store one consistent seller key.

## Low priority

7. Sequential chunk loops: `fetchProductNames` in
   `app/dashboard/_lib/inventory-firestore.ts` (~line 348, chunks of 10 awaited
   one by one) and `app/dashboard/subscription/page.tsx` (~line 635). Run the
   chunks in parallel, 30 per query.
8. App `watchMyListings` (`dashboard_repository.dart` ~line 178): 5 overlapping
   live listeners over the seller's own products, so the same docs are read 2-3 times.

## Audit of the remaining screens (done 2026-10-06)

Website seller pages:

- **Orders**: fixed (S6). Note: the page the brief named,
  `fetchRetailerOrders`, had no callers; the live page used
  `fetchIncomingOrdersForSeller`. The unused function was removed.
- **Payouts** (`seller-earnings-panel.tsx`): reads every order the seller has
  (`fetchIncomingOrdersForSeller`, every id form × 2 fields) to compute
  earnings. Same in the app's Payouts screen. Paging would break the totals
  ("paid out", "on hold", "due" need every paid order). Next step: keep
  those totals on the server (extend `sellerStatsOnOrderWrite` with the
  payout states, or a payouts summary doc written by the payout run).
  **Done (S8).**
- **Enquiries** (`enquiries-firestore.ts`): `limit(200)` with no order, so
  past 200 enquiries it shows 200 arbitrary ones and can miss the newest.
  The index it needs now exists (S6): switch to `orderBy("createdAt",
  "desc")`, 50 at a time. **Done (S9).**
- **Reviews** (`reviews-firestore.ts`): up to 3 queries × 100 docs, no order,
  so past 100 reviews the newest can be missing. Same fix: newest first with
  a limit (needs `storeReviews` (`storePhone`, `createdAt` ↓) and `reviews`
  (`ownerId`, `createdAt` ↓) indexes). **Done (S9)**: the `reviews`
  queries were dropped instead, since no rule allows reading that collection
  (they were always refused).
- **Order requests** (`order-offers.ts` `fetchOpenOffers`): reads every offer
  the seller ever received (`sellerOffers/{phone}/offers`, no filter) and
  keeps the open ones. Filter `status == "open"` in the query. **Done (S9).**
- **Delivery**: one settings doc. Fine.

App manufacturer screens (`mobile/lib/features/manufacturer`):

- `watchNetwork` and `fetchNetworkStats`: two overlapping queries
  (`manufacturerPhone`, `manufacturerId`) over the whole network, live, and
  the stats read the whole network again only to count it. Use one OR query
  for the list and `count()` for the stats. **Done (S10).**
- `watchManufacturerCatalog`: the `manufacturerPhone` and `ownerId` branches
  match the same docs (read twice); one OR query, as done for My listings.
  **Done (S10).**
- `searchRegisteredRetailers`: reads 100 retailer user docs per search and
  filters on the phone; retailers beyond the first 100 are never found. Use a
  name prefix query (as the admin user search does) or the store directory.
  **Done (S10).**
- `assignProductToRetailer` (Assign product): for each selected retailer, one
  after another, 2 subscription queries, a duplicate check, the product and
  the retailer doc; `removeNetworkRetailer` reads and rewrites each product's
  seller list one by one. Rare write actions; worth running in parallel.
  **Done (S10).**

Also fixed while auditing: the app dashboard home (`fetchStats`) read every
order to count them; it now uses the seller stats docs (see S7).

`sales_app` looked fine (queries filtered by the sales executive; the active
dealers list is small).

## Still open

- Product reviews (`productReviews`) are not shown on the seller's Reviews
  page (they never were); showing them there is a feature decision.
- The app's "Find retailer" search matches names and shop names from their
  start (and email prefix, phone); the old search also matched a word in the
  middle of a name, but only among the first 100 retailers.
- Admin "App update" and "Reel promo" WhatsApp templates send to every user,
  so they still read the user list when opened (by design for now; a
  server-side send that pages through users would remove it).
- Rows that don't fit a query stay findable only by search: orders without
  `createdAt`, subscriptions without `startDate`, products without a card.

## Suggested order

Items 1 and 2 first (biggest waste today), then 4 and 3, then 5 and 6, then 7 and 8.
Commit each item separately, with what you measured before and after.
