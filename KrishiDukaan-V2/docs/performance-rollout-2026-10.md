# Performance and cost rollout — October 2026

Branch: `claude/busy-keller-iica2f` (vinayfiinny/fiinnybusiness). Nothing here is
deployed yet. Follow the order below: the website and app read new collections
that must exist first.

## What changed and why

Firestore showed 68M reads against 898k writes in the period checked: reads are
~99% of the work, and most came from screens downloading whole collections.

| # | Change | Before | After |
|---|---|---|---|
| 1 | Website server moved to `asia-south1` (`firebase.json`) | SSR ran in Iowa; every Firestore call crossed to Mumbai and back | Same region as the database |
| 2 | View/click/call counters moved to `productStats/{id}` and `storeStats/{phone}` | Every product card a farmer saw wrote to the product doc and ran `syncSellerProductToCanonical` + `notifyLowStock` (~1,540 runs of each per day). Signed-out visitors got a denied write per product | Counter docs with lookup-free rules; no product functions fire; signed-out visitors skipped |
| 3 | Sitemap reads `marketplaceCards` and regenerates every 6 h | All 4,222 product docs per regeneration (top query by load) | One read per card |
| 4 | `marketplaceCards` built by Cloud Functions | Market API read up to 480 raw docs per page (13 s warm, 33 s cold); search kept the whole catalogue in memory; product, cart and map pages and the app downloaded every product and every review | One pre-merged card per product name; a page reads ~20 cards; search reads matching token docs |
| 5 | App reads cards, cached 5 min | Every search pause, category change and deep-linked product read the whole catalogue and every review | All cards once per 5 min; typing costs no reads; opening a product is 1 read |
| 6 | `storeDirectory` built by Cloud Functions | Cart, store map, SEO store pages and the app's store list read all of `retailers`, `profiles`, `manufacturers`, `stores` and `storeReviews` (the `COLLECTION /retailers` query) | 1–2 docs |
| 7 | Comment tagging, add-retailer form, admin reel picker | Downloaded every user (with personal details) and every retailer | Shops from the store directory; people by a name search of at most 10 docs |
| 8 | Firebase Performance Monitoring (web + app) | No real-user timings | Page loads, app start, and traces `load_marketplace_cards`, `load_store_directory` |

Cards are built with the exact merge code the website used, so a card matches
what the old storefront showed (checked over 1,082 generated products). The store
directory stores source records, not a merged result, so the web, SEO and app
merges run unchanged on it.

## Deploy order

Do this on **UAT first** (see "Testing on UAT" below), then production. All
commands run from `KrishiDukaan-V2/`.

### 0. Check which service serves krishidukan.com

`ENVIRONMENTS.md` says the website deploys through **App Hosting** on every push
to `main`, but production traffic in the Functions list goes to the **Firebase
Hosting** server `ssrkrishidukane8315`. In the Firebase console, see whether the
`krishidukan.com` custom domain is under **Hosting** or under **App Hosting**:

- **Hosting:** the website deploys with `firebase deploy --only hosting` (step 4),
  and the region change in `firebase.json` applies.
- **App Hosting:** merging this branch into `main` deploys the website. Do not
  merge until steps 1–3 are done. The region change in `firebase.json` would not
  apply; an App Hosting backend's region is chosen when the backend is created.

### 1. Security rules and indexes

Steps 1–3 don't change what farmers see: the new rules add access to the
new collections, and nothing reads those until the new website and app ship
in steps 4–5. The same rules also close privacy and safety gaps (see
"Privacy and safety rules" below); every query the current website and app
run is still allowed, with one exception noted there.

```
firebase deploy --only firestore --project prod     # rules + indexes
```

(`npm run deploy:prod` does the same plus Storage and functions, but
`firebase.json` points Storage at `storage.rules`, which is not in the repo, so
the script stops at Storage before deploying functions. Commit the live rules
from Firebase console → Storage → Rules as `storage.rules` to use the script.)

- If the CLI asks whether to **delete** indexes that are not in the file,
  answer **No**: production may have indexes created from console links.
- Rules replace the whole ruleset. If anyone edited rules directly in the
  console after 30 Sep, compare with `firestore.rules` first.

Then open Firebase console → Firestore → Indexes and wait until **every** index
shows **Enabled** (minutes): the four new `marketplaceCards` /
`marketplaceSearch` ones (the fourth, `nameKeywords` + `nameKey`, is for the
sellers' add-product search; see "Seller, manufacturer and admin side" below), `users` (`role`, `name`) for @-tagging, and the
`waNotifications` index (`status`,
`createdAt` ↓, `retryCount`) from Sai's 30 Sep change, which the WhatsApp retry
job in step 2 needs. Deploying functions before it is ready makes that job fail
every 5 minutes until it is (notifications are delayed, not lost).

Note: `firestore.indexes.json` already had an entry under `fieldOverrides` that
is really a composite index (`dealerNotes`: `dealerId`, `createdAt`). It was there
before this work; if the deploy complains about it, move it into `indexes`.

### 2. Cloud Functions

```
firebase deploy --only functions --project prod
```

If the CLI lists functions "not in your local source" and asks to delete them,
answer **No**. The branch contains all of the team's `main` (checked against
Arjun's, Sai's and Kunal's repos), so existing functions deploy unchanged
apart from `sendStoreAnalyticsDigest`, which also counts the new stats records.

New functions (all `asia-south1`):
`syncMarketplaceCardOnProductWrite`, `syncMarketplaceCardOnReviewWrite`,
`recomputeDueMarketplaceCards` (every 15 min), `reconcileMarketplaceCards`
(nightly 02:30 IST), `markStoreDirectoryDirtyOn{Retailer,Manufacturer,Profile,Store,StoreReview}`,
`rebuildStoreDirectoryIfDirty` (every 5 min), and
`syncMaxDiscountOnProductWrite`, which keeps a manufacturer product's "Up to
N% OFF" (`maxDiscountPct`) equal to the best active seller discount — the
rules no longer let other people write that field, and the app never updated
it. The others only write the new collections. Until the new website and app
ship, the current ones still save view counts on products; these functions
exit on those writes without reading anything.

### Privacy and safety rules (in step 1)

| Collection | Before | After |
|---|---|---|
| `enquiries`, `notifications` | Any signed-in user could list all (buyers' names and phones) | Only queries for the caller's own phone; admin; team "users" for enquiries |
| `products` | Any signed-in user could rewrite any product's `availability` (other sellers' prices, stock) and set `maxDiscountPct` / `effectiveDiscountPct` | Non-owners may add, edit or remove only their own entry, and may set `updatedAt` only to the server time; discount fields owner-only |
| `users` | Any seller could read or list every user | Sellers read other seller accounts only (role filter); farmers' records private |
| `manufacturerRetailers` | Anyone, signed in or not, could list every invite and link | Invite-code lookups one at a time (signup still works signed out); own invites/network; admin/team |
| `siteVisits` | Anyone could write anything | Only +1 on the day's counters |
| `reel_likes`, `follows` | Any signed-in user could delete or forge anyone's | Own likes and follows only |

Visible changes:

- @-tagging in reel comments finds seller accounts only (farmers' records are
  no longer searchable by sellers).
- The current website and app load every user to suggest @-tags. The rules
  now refuse that for sellers, as they already did for farmers. So until the
  new website is live, sellers get no @-tag suggestions on the website, and
  until they install the new app version, the app's suggestion list just
  keeps loading (it closes when they type a space). Farmers see the same
  today. Posting comments is not affected.
- Also until the new website is live, in an uncommon case a stock change
  made on the current website may not reach the brand's product page. This
  happens when another seller of that product saved from the app and a price
  is still stored the app's way (450.0, which the rule reads as different
  from the website's 450). Price, discount and size changes still reach that
  page through the `syncSellerProductToCanonical` function, and the new
  website handles this case.

So deploy the website (step 4) soon after this step. The brand pages' public
dealer list (`manufacturers/{phone}/retailers`) stays public by design.
Tests: `firestore.rules` checked against 93 emulator cases covering every
query and write shape the website, app and invite flows use.

### 3. Build the cards and the store directory once

```
gcloud auth application-default login
cd functions
npx tsx scripts/backfill-marketplace-cards.ts --project krishidukan-e8315           # preview
npx tsx scripts/backfill-marketplace-cards.ts --project krishidukan-e8315 --write
npx tsx scripts/build-store-directory.ts --project krishidukan-e8315                # preview
npx tsx scripts/build-store-directory.ts --project krishidukan-e8315 --write
```

Before step 1, write down the product count on Admin → Overview (computed the
old way). Now check in the console: `marketplaceCards` has about that many docs
(one per product name), and `storeDirectory` has `chunk-000` (and maybe
`chunk-001`). `failures` in the first report must be 0.

### 4. Website

If krishidukan.com is on **Hosting** (step 0):

```
firebase deploy --only hosting --project prod
```

This creates the SSR function in `asia-south1`; the old `us-central1` one stays
until deleted in step 7, which is what makes a rollback instant.

If it is on **App Hosting**: merge this branch into the `main` branch App
Hosting watches; that push deploys the website.

Check on the live site: home top picks; Market browse, scroll and a category;
search for `urea`, `uria`, `यूरिया`, `neem oil`, a shop name; a product page;
add to cart and the store picker; the store map; a `/stores/...` page; a seller's
dashboard analytics; Admin Overview; typing `@` in a reel comment; the
manufacturer add-retailer form; `/sitemap.xml`; a retailer changing a price on
the website and the brand's product page showing it.

### 5. App release

Build and test the app on a real phone (Marketplace, search, a product, the
Stores tab, a seller's Profile overview and Analytics, tagging in comments), then
publish. Older app versions keep working: they still read the raw collections and
write counters onto products, which the rules still allow.

### 5b. Cache header for photos already in Storage (once)

New uploads now get `Cache-Control: public, max-age=31536000, immutable`, so
browsers and the app stop re-checking each photo on every view. Photos uploaded
before this change need the same header once. It only changes metadata (the
files and their links stay the same), and is safe to re-run:

```
gcloud storage objects update "gs://krishidukan-e8315.firebasestorage.app/product-images/**" --cache-control="public, max-age=31536000, immutable"
gcloud storage objects update "gs://krishidukan-e8315.firebasestorage.app/profile-images/**" --cache-control="public, max-age=31536000, immutable"
gcloud storage objects update "gs://krishidukan-e8315.firebasestorage.app/hub-images/**" --cache-control="public, max-age=31536000, immutable"
gcloud storage objects update "gs://krishidukan-e8315.firebasestorage.app/blog-images/**" --cache-control="public, max-age=31536000, immutable"
gcloud storage objects update "gs://krishidukan-e8315.firebasestorage.app/blog-covers/**" --cache-control="public, max-age=31536000, immutable"
```

Leave `kyc/**` and invoices alone: those are private documents. While in the
console, note the bucket's location (Storage → Files): if it is not
`asia-south1`, every uncached photo travels further to farmers in India.

### 6. Watch for a week

- Firestore → Usage: daily reads should fall sharply.
- Functions: `syncSellerProductToCanonical` and `notifyLowStock` should drop from
  ~1,540/day toward real product edits (old app versions still add some until
  users update). Check the new functions for errors.
- Performance: web page load and the two app traces.

### 7. Clean up after a few quiet days

```
firebase functions:delete ssrkrishidukane8315 --region us-central1 --project prod
firebase functions:delete ssrkrishidukanadmin --region us-central1 --project prod
```

## Seller, manufacturer and admin side (follow-up on this branch)

Branch `claude/clever-babbage-0k7r10` (built on `claude/busy-keller-iica2f`,
which it includes). Same deploy order: rules and indexes in step 1, functions
in step 2, scripts in step 3, website in step 4, app in step 5. Each item
below says which steps it needs. Brief and audit:
`docs/follow-up-seller-admin-performance.md`.

**All of it in one list:**

1. Step 1 (`firebase deploy --only firestore`): the rules and the new
   indexes below; wait until every index is **Enabled**.
2. Step 2 (`firebase deploy --only functions`): new functions
   `platformStatsOnOrderWrite`, `platformStatsOnSubscriptionWrite`,
   `platformStatsOnPaymentAttemptWrite`, `platformStatsOnUserWrite`,
   `platformStatsOnProductCreate`, `platformStatsOnProductDelete`,
   `sellerStatsOnOrderWrite`; changed: the card builder
   (`syncMarketplaceCardOnProductWrite` and the other card functions, for
   `nameKeywords`) and `webhookReceiver` (WhatsApp conversation fields).
3. Step 3, after the functions, each previewed first and then with `--write`
   (from `functions/`):
   `backfill-marketplace-cards.ts` (already in step 3; it now also writes
   `nameKeywords`), `backfill-wa-inbox.ts`, `backfill-platform-daily-stats.ts`,
   `backfill-seller-stats.ts`. Optional: the `statsEvents` TTL policy (S4a).
4. Step 4: the website. Step 5: the app.

Nothing here deletes or rewrites existing source data: the scripts only add
fields to WhatsApp docs and write the new totals collections.

| # | Change | Before | After |
|---|---|---|---|
| S1 | "Add product" name search (retailers, manufacturers, admins) reads cards | Every product (~4,222 reads, a few MB) on each typing pause | A name prefix query on `marketplaceCards` plus name tokens on `marketplaceSearch`: at most ~45 small reads (usually 10-20), plus 1 product read when a suggestion is picked |
| S2 | Admin WhatsApp inbox pages conversations | Live listeners on **all** of `waIncomingMessages` and `waConversations`: every message ever on open, and the whole set again on every new message; full message contents logged to the browser console | The newest 50 conversations (live), 50 more per "Load more"; messages only for the open chat (newest 100, "Load earlier"); no message content in the console |
| S3 | Manufacturer network map and a retailer's assigned products | One `retailers/{id}` read per retailer (200 retailers = 200 reads, one trip each); one product read per assigned listing | Addresses and locations from the store directory (1–2 reads), the mirror doc filling gaps; assigned products in parallel queries of 30 |
| S4a | Admin Overview product count; Admin Analytics | Overview read every product (~4,222) to count them. Analytics read every order, subscription, payment attempt and new user in the window ("All time" = whole collections) on each tab open | Overview: 2 count reads on `marketplaceCards`. Analytics: one small `platformDailyStats` doc per day with activity, kept by Cloud Functions |
| S4b | Admin lists: Messages, Moderation, Payments, Payouts, Sales team, WhatsApp templates | Whole `contactMessages`, `contentReports`, `payoutAccounts`, `dealerVisits`, `dealers`, `uidIndex`, `retailerSeatListings` collections, all users for template audiences, the newest 500 payment attempts | 50 rows at a time, newest first, filters in the query, totals from count/sum queries; template audiences read sellers only and look up their subscriptions, seats and KYC docs by id |
| S4c | Admin tables: Users, Team, Companies, Reports, Subscriptions, Products, Orders | The shared cache downloaded all users, all products, all subscriptions and all orders (10 min), on every Refresh, and again for any search or filter | 50 rows at a time with filters in the query; searches are a few small queries (name, shop, email prefixes; exact phone, ID, invoice, Razorpay ID); totals from count/sum queries; "Export" downloads everything only when clicked |
| S5 | Seller dashboard Home and Analytics (website) | Every order the seller ever had (up to 12 overlapping queries), every follower and reel, and the seller's products up to 30 times over (5 owner fields × each id form); Home loaded the products twice | Two small stats docs per seller id plus one doc per day with orders in the chosen window; follower count and reel sums from count/sum queries; Home reuses its product list |
| S6 | Order and enquiry lists (website seller Orders; app seller Orders, manufacturer hub, my Orders, Enquiries, Analytics) | Every order (website: every id form × 2 fields; app: 3 live listeners each, one always refused by the rules) and every enquiry, live, no limit | Newest 30 per query, merged in date order; app: live listener on the first page only, "Load more" reads older pages once; tab counts and paid totals from the seller stats docs; app Analytics reads only the chosen window |
| S7 | Product-name lookups (website inventory and subscription pages); app "My listings" | Batches of 10 or 30 read one after another; app: 5 live listeners over the seller's products, most products read 2-3 times | Batches of 30 in parallel; app: one OR query over the products (each read once) plus the legacy `listings` listener |
| S8 | Seller earnings (website Payouts panel, app Payouts screen) | Every order the seller ever had (website: every id form × 2 fields; app: live listeners), on every visit | The seller stats docs (2) plus the last 9 days' day docs for the "on hold" split; the order-by-order table from the newest 30 orders |
| S9 | Website seller Enquiries, Reviews and order requests | Every enquiry (newest 200 by array match, unordered), every store review (both lists read in full each visit, the summary computed from them) and every order offer the seller was ever sent, filtered on the device | 50 enquiries per tab and 50 reviews at a time, newest first; tab counts, review count, average and star bars from count/sum queries over all of them; only open offers read |
| S10 | App manufacturer screens: network, catalog, find retailer, assign and remove | Network list: 2 overlapping live queries; network tiles read the whole network again to count it; catalog: 2 overlapping live queries; "Find retailer" read 100 retailer accounts per search and missed everyone after them; assigning to several retailers and removing a retailer ran one step after another | One OR query for the list and for the catalog (each doc read once); tiles from 6 count queries; search by name, shop, email or phone over all retailers (about 12 small queries); assignments 5 at a time, one failing no longer stops the rest; removal updates the products at once |
| S13 | Seller payout status from Razorpay (Route transfers) | Nothing read Razorpay's transfer or settlement status back. Sellers saw a fixed "7 days after delivery" guess (Route-paid orders sat at "Ready to transfer" forever, never "Paid out"); the admin Route page called Razorpay once per order on every load | Each paid order carries Razorpay's transfer and settlement status, checked only when due (every 15 min job, backing off while held, stopping once settled) and at once on Razorpay webhooks; sellers see On hold / Release time / On the way / In your bank; admin sees totals per state from count/sum queries |

### S1. Add-product search

- **Index (step 1):** `marketplaceSearch` (`nameKeywords` array-contains,
  `nameKey` ↑).
- **Function (step 2):** the card builder now also writes `nameKeywords` (the
  product name's own search words) on each `marketplaceSearch` doc, so
  description and shop-name matches can't crowd name matches out.
- **Script (step 3):** the card backfill writes `nameKeywords` on every
  search doc; run it after the functions deploy as written. If cards were
  already backfilled (e.g. on UAT) before this change, run the backfill again
  (or wait for the nightly repair, which rewrites any card whose content
  changed).
- **Website (step 4):** suggestions come from cards; the picked product's own
  doc is read once to autofill exact sizes and prices (cards merge sizes
  across sellers). The chosen id is the card's canonical product, which is the
  `manufacturer_inventory` product whenever one exists, as before.
- **Difference:** products without a photo or price, inactive products, and
  products that exist only as retailer copies have no card, so they are no
  longer suggested. Same-name products in different categories now show as
  one suggestion (the card).
- **Check:** in a retailer's and a manufacturer's dashboard, Add product:
  type `ure`, `urea`, `neem oil`; pick a suggestion; the form fills in sizes,
  photos and NPK as before.

### S2. Admin WhatsApp inbox

- **Indexes (step 1):** `waConversations` (`hasIncoming`, `lastMessageAt` ↓)
  and (`hasIncoming`, `status`, `lastMessageAt` ↓); `waIncomingMessages`
  (`phone`, `timestamp` ↓).
- **Function (step 2):** the functions webhook (`webhookReceiver`) now also
  updates `waConversations/{phone}` (unread count, last message, status), as
  the website's webhook already did. Every writer (both webhooks, Send, Send
  document, payment-failed templates) now sets `lastMessageAt`; incoming ones
  also set `hasIncoming: true`.
- **Script (step 3, after functions):** fills the new fields on old docs and
  creates a conversation doc for any phone that has messages but no doc:

  ```
  cd functions
  npx tsx scripts/backfill-wa-inbox.ts --project krishidukan-e8315           # preview
  npx tsx scripts/backfill-wa-inbox.ts --project krishidukan-e8315 --write
  ```

  Safe to re-run; a second run reports 0 changes.
- **Website (step 4):** the inbox reads only the pages it shows. Search
  filters the loaded conversations; typing a full phone number also opens a
  conversation that isn't loaded yet (1 read). Unknown numbers are looked up
  once per visit instead of on every new message.
- **Check:** Admin → WhatsApp: the list shows the newest conversations with
  unread counts; Open/Resolved tabs; "Load more"; open a chat, send a reply,
  it moves to the top; a new incoming message shows up live.

### S3. Network map and assigned products

- **Website (step 4) only.** No index, function or script. Uses the store
  directory from step 3, so a retailer's new address shows on the map within
  about 5 minutes (the directory's refresh), as on the store map.
- **Check:** a manufacturer's Company page and Admin → Companies → a
  manufacturer: the network map shows the same pins and addresses as before;
  a retailer's assigned products list shows names, prices and photos.

### S4a. Overview and Analytics

- **Rules and indexes (step 1):** admins can read `platformDailyStats`.
  Indexes `subscriptions` (`ownerPhone`, `createdAt`) and (`ownerId`,
  `createdAt`), for the renewal check.
- **Functions (step 2):** `platformStatsOnOrderWrite`,
  `platformStatsOnSubscriptionWrite`, `platformStatsOnPaymentAttemptWrite`,
  `platformStatsOnUserWrite`, `platformStatsOnProductCreate`,
  `platformStatsOnProductDelete` (all `asia-south1`). They keep
  `platformDailyStats/{YYYY-MM-DD}` (India dates): orders (count, GMV with the
  `grandTotal ?? total ?? subtotal+delivery+GST` fallback, platform fee, count
  per status), subscriptions (count, paid and manual revenue, seats,
  renewals), payment attempts (paid, failed, unfinished, failed amount), new
  users per role, products added. Each change is applied exactly once (a
  marker per event in `statsEvents`).
- **Optional:** let Firestore delete old markers automatically:

  ```
  gcloud firestore fields ttls update expireAt --collection-group=statsEvents --enable-ttl --project krishidukan-e8315
  ```

- **Script (step 3, after functions):** builds the history; re-run any time
  to correct drift (it rewrites each day from the source docs):

  ```
  cd functions
  npx tsx scripts/backfill-platform-daily-stats.ts --project krishidukan-e8315           # preview
  npx tsx scripts/backfill-platform-daily-stats.ts --project krishidukan-e8315 --write
  ```

- **Differences:** "Renewals" now means subscriptions in the window whose
  owner already had an earlier subscription (before, only repeats inside the
  window counted; "All time" is unchanged). "All time" GMV leaves out orders
  without a `createdAt` (the date-range views already did).
- **Check:** Admin → Overview product count equals the Market's "Showing N
  products"; Admin → Analytics, each tab, "All time", "Last 30 days" and a
  single day: numbers match a note of the old page taken before the deploy.

### S4b. Admin lists

- **Indexes (step 1):** `contentReports` (`status`, `createdAt` ↓);
  `paymentAttempts` (`status`, `amount`) for the "value not collected" sum;
  `payoutAccounts` (`status`, `updatedAt` ↓).
- **Website (step 4) only.**
- **Differences:**
  - Payments: the tab counts and "value not collected" now cover every
    attempt, not just the newest 500.
  - Sales team: "Retailers visited" is now for the last 30 days (a distinct
    count needs the visits themselves, and only that window is read); total
    visits and dealers added are all-time counts as before. The executive's
    own page is unchanged.
  - WhatsApp templates: "App update" and "Reel promo" go to every user, so
    they still load the whole user list, but only when that template is
    opened. The others read sellers, active subscriptions and the matching
    seat listings, uidIndex and payout docs only.
- **Check:** each page lists the newest rows, "Load more" adds older ones,
  the tabs/filters and their counts match; WhatsApp templates: Subscription
  expiry, New product reminder (vacant seats), KYC pending/success show the
  same people as before.

### S4c. Admin tables

- **Rules (step 1):** team members with the Orders section may read
  `platformDailyStats` (the Orders page's gross value; they already read
  every order).
- **Indexes (step 1):** `orders` (`status`, `createdAt` ↓), (`sellerType`,
  `createdAt` ↓), (`status`, `sellerType`, `createdAt` ↓), (`payment.status`,
  `payment.amount`); `users` (`isPaid`, `createdAt` ↓), (`role`, `isPaid`,
  `createdAt` ↓); `subscriptions` (`subscriptionStatus`, `startDate` ↓).
- **Website (step 4).** Needs S1 (cards) and S4a (daily totals) in place.
- **Differences:**
  - Users: search finds names, shop/business names and emails that *start*
    with the typed text (any capitalization), and exact phone numbers and
    IDs; it no longer matches text in the middle of a name, or city/state.
    City, state, "not paid" and subscription filters narrow each loaded page
    ("See More" for more).
  - Orders: search finds an order by its ID, invoice number, Razorpay order or
    payment ID, or the customer's or seller's phone, even if it isn't loaded
    or has no date; other words match the loaded orders. Orders without a
    `createdAt` only appear through that search. "Export CSV" downloads every
    order matching the filters.
  - Subscriptions: search finds owners by name/phone and Razorpay payment ID;
    the expiry sort applies to loaded rows when a date filter is set.
    Subscriptions without a `startDate` only appear through search.
  - Products: one row per marketplace card (what buyers see). Products with
    no photo or price, and names whose every doc is inactive, aren't listed
    (they aren't on the marketplace either); "Export" downloads every product
    doc. Edit and delete re-read the product's docs first and act on the same
    doc as before (manufacturer, then admin, then newest), never on sellers'
    copies. A change shows in the table after the card rebuild (seconds).
  - Team, Reports, Companies read only team accounts / manufacturers.
- **Check:** Users: search "ram", a phone with and without +91, an email;
  role chips and date/paid filters; promote panel search. Orders: filters,
  paste an order ID, invoice, `pay_…` and a phone; Export. Subscriptions:
  filters, search a name and a phone, manual activate and assign pickers.
  Products: categories, search, edit an admin product, assignments.

### S5. Seller dashboard analytics

- **Rules (step 1):** `sellerStats/{sellerKey}` and `sellerDailyStats` are
  readable by that seller (their Auth UID or phone), admins, and team
  members with the Users section.
- **Indexes (step 1):** `sellerDailyStats` (`sellerKey`, `date`); `reels`
  (`shopOwnerId`, `viewsCount`), (`shopOwnerId`, `likesCount`),
  (`shopOwnerId`, `commentsCount`) for the reel sums.
- **Function (step 2):** `sellerStatsOnOrderWrite` (`asia-south1`) keeps
  `sellerStats/{sellerKey}` (all-time order count, revenue without
  cancelled/rejected orders, count per status, quantity and revenue per
  product) and `sellerDailyStats/{sellerKey}_{YYYY-MM-DD}` (orders and
  revenue per India day). `sellerKey` is the seller's phone as `+91` and 10
  digits, or the Auth UID for orders without a phone.
- **Script (step 3, after functions):**

  ```
  cd functions
  npx tsx scripts/backfill-seller-stats.ts --project krishidukan-e8315           # preview
  npx tsx scripts/backfill-seller-stats.ts --project krishidukan-e8315 --write
  ```

  Safe to re-run; it rewrites every seller's docs from the orders.
- **Difference:** orders filed under the seller's phone written without
  `+91` are now counted (the old dashboard's queries for them were refused
  by the rules, so they were silently missing).
- **Not changed:** the app's own analytics screen still reads orders (see
  the audit at the end of the brief).
- **Check:** a seller's dashboard Home tiles and Analytics (Week, Month,
  Year, a custom range) show the same order totals, revenue chart, status
  counts, top products, followers and reel numbers as before the deploy.

### S6. Order and enquiry lists

- **Indexes (step 1):** `orders` (`sellerId`, `createdAt` ↓), (`sellerId`,
  `status`, `createdAt` ↓), (`customerId`, `createdAt` ↓); `enquiries`
  (`sellerPhones` array-contains, `createdAt` ↓).
- **Function (step 2):** `sellerStatsOnOrderWrite` (S5) now also counts
  orders paid online and their amount. If S5 was already backfilled, run its
  script again after this deploy.
- **Website (step 4):** the seller Orders page loads 30 at a time per tab;
  tab counts and paid totals are all-time (stats docs).
- **App (step 5):** seller Orders, manufacturer hub, my Orders and
  Enquiries: the newest 30 per query are live, "Load more" at the end of
  the list. The hub's pending count and revenue and the Orders tab counts
  come from the stats docs (revenue now leaves out cancelled orders as well
  as rejected ones, as the website always did). Analytics reads only the
  orders in the selected window. Older app versions keep their unlimited
  listeners until they update; nothing they read changed.
- **Payouts:** the earnings totals moved to the server in S8.
- **Check:** website and app seller Orders: newest first, each tab, "Load
  older orders", accept an order and see it move; a new order appears at
  the top live in the app; my Orders and Enquiries load more; hub tiles
  show all-time numbers.

### S7. Small fixes

- **Website (step 4) and app (step 5) only.** No index, function or rule.
  The app's OR query uses only equality filters, which Firestore serves
  without a composite index.
- **App dashboard home (`fetchStats`)** read every order the seller ever
  had to count pending and total orders, and the products through four
  overlapping queries; it now takes the order counts from the seller stats
  docs (S5, deploy steps 1–3 first) and reads the products with the same
  single OR query. The app's engagement totals (`productStats`) read their
  batches of 30 in parallel.
- **Check:** website Inventory and Subscription pages show product names;
  app Profile → My listings shows the same products as before (retailer and
  manufacturer); the app dashboard tiles show the same listing, in-stock,
  pending and total order numbers.

### S8. Seller earnings

- **Function (step 2):** `sellerStatsOnOrderWrite` (S5) also keeps
  `earnings` on `sellerStats` (payable orders, gateway and platform fees, and
  the net amount per state: awaiting delivery, delivered but not yet
  transferred, transferred) and, for each delivered order not yet
  transferred, a hold entry (`holds.{orderId}`: net and delivery time) on the
  day doc of its delivery day. Same rules as `seller-earnings.ts` and
  `seller_earnings.dart`.
- **Script (step 3):** `backfill-seller-stats.ts` (already in the list)
  builds these too.
- **Website (step 4) and app (step 5):** "Ready to transfer", "On hold",
  "Awaiting delivery", "Paid out" and the next release date come from those
  docs; "on hold" vs "ready" is still worked out to the minute (7 days after
  delivery) from the hold entries, so money moves from one to the other on
  time without any write. The order-by-order table shows the newest orders.
- **Check:** a seller's Payouts page (website and app) shows the same four
  amounts and next release date as before the deploy; mark an order
  delivered and it appears under "On hold" within seconds.

### S9. Website seller Enquiries, Reviews and order requests

- **Indexes (step 1):** `enquiries` (`sellerPhones` array-contains,
  `status`, `createdAt` ↓); `storeReviews` (`storePhone`, `createdAt` ↓),
  (`storePhone`, `rating`).
- **Website (step 4) only.** No function, script or rule change; every
  query filters on the fields the existing rules check.
- **Enquiries:** each tab (All, Open, Contacted, Closed) loads its newest 50,
  "Load older enquiries" for more; the tab counts are count queries over
  all of the seller's enquiries (before: the newest 200, read every visit,
  in no particular order).
- **Reviews:** the list loads 50 at a time, newest first; the count,
  average and star bars cover every review (count and sum queries). The
  dashboard Home card reads only the newest 5. The page no longer queries
  the old `reviews` collection: no rule allows reading it, so those
  queries were always refused and showed nothing. Product reviews
  (`productReviews`) were never shown here and still aren't.
- **Order requests (re-routed orders):** only offers with status `open` are
  read (the app already did this); expired ones are still hidden.
- **Check:** a seller's Enquiries page shows the same enquiries and tab
  counts, newest first, and changing a status moves it between tabs;
  Reviews shows the same average and star bars as before; open order
  requests appear on the dashboard.

### S10. App manufacturer screens

- **Indexes (step 1):** `users` (`role`, `shopName`), (`role`, `email`),
  (`role`, `phone`) for "Find retailer" (`role`, `name` already existed).
  The OR and count queries use only equality filters, which Firestore
  serves without a composite index.
- **App (step 5) only.** No function, script or rule change; every query
  filters on the fields the existing rules check (network links on the
  manufacturer's phone or UID; user search on `role == "retailer"`).
- **Find retailer** matches names and shop names starting with the typed
  text (a few capitalizations), an email starting with it, or the phone
  (full number, or typed from the start). It no longer matches a word in
  the middle of a name, but finds every retailer, not just the first 100.
- **Assign product** to several retailers: 5 at a time; if one fails
  (e.g. already assigned), the others still go through and the message
  names the ones that didn't.
- **Check:** manufacturer hub tiles (total, active, invited) match the
  Network list; My Catalog lists the same products, no duplicates; Find
  retailer finds a retailer by name, shop, email and phone; assign a
  product to 2+ retailers; remove a retailer and their store disappears
  from the product's sellers.

### S11. Share a shop or brand page (new feature)

- **Links:** `https://krishidukan.com/shop/+91XXXXXXXXXX` (a seller's shop)
  and `https://krishidukan.com/brand/+91XXXXXXXXXX` (a manufacturer's brand
  page). Built by `app/lib/share-links.ts` (website) and
  `WebLinks.shop/brand` (app).
- **Where to share from:** website: store pages, brand pages, and Dashboard →
  Profile ("Share shop", and "Share brand page" for manufacturers). App: the
  shop screen and brand screen (share icon, top right), and Dashboard →
  Profile ("Share My Shop", "Share Brand Page").
- **Opening a link:**
  - Android with the app: opens in the app (the app already handles every
    krishidukan.com link). iPhone with the app: opens in the app once the
    new `apple-app-site-association` is live (step 4). iOS can take up to a
    day or two to pick up the change, through Apple's cache.
  - Older app versions open them correctly too: `/shop/{phone}` and
    `/brand/{phone}` are the shop and brand screens in every version.
  - Without the app: `/shop/{phone}` redirects to the shop's store page
    (`/stores/{state}/{city}/{shop}`), or to the shop on the store map when
    it has no city/state yet; `/brand/{phone}` redirects to `/brand/{slug}`
    (or shows the brand page directly when it has no slug).
  - The brand page's own address, `/brand/{slug}`, still opens on the
    website on iPhone. The new app version also opens it on Android, looking
    up the brand by its slug.
- **Website (step 4) and app (step 5) only.** No index, function or rule
  change: the app's slug lookup reads `manufacturers`, which is public.
- **Check:** share a shop from the app and from the website, then open the
  link on an Android phone with the app, an iPhone with the app, and a
  laptop. Each opens that shop. Do the same for a brand page.

### S12. Share my stats as an image (new feature)

- **Where:** website Dashboard → Analytics ("Share my stats", next to the
  period picker); app Dashboard → Analytics ("Share my stats on Instagram /
  WhatsApp", top of the page).
- **What it makes:** a 1080×1920 story-size image for the period picked on
  the page: shop name and logo, orders, product views, calls, followers, reel
  views, best seller, an orders chart and the shop link
  (`krishidukan.com/shop/+91…`, S11). The seller turns each item on or off
  with a live preview, and the choice is remembered. **Sales (₹) stay off
  until the seller turns them on.** Items at zero are left out.
- **Sharing:** phones (app, and the website in a phone browser) open the share
  sheet with the image: Instagram story, WhatsApp status or chat, Save image.
  On a computer the website downloads the PNG.
- **Same card on both:** `app/dashboard/_lib/stats-share-card.ts` (canvas)
  and `mobile/lib/features/dashboard/widgets/stats_share_card.dart` (widget)
  draw the same layout. Change them together.
- **Numbers:** for the selected window (the website's order tiles are
  all-time, but the card uses the window's daily series, like the app).
  Followers and reel views are lifetime totals, as on the page.
- **Website (step 4) and app (step 5) only.** It reads nothing new: the image
  is made on the device from the numbers already on the page.
- **Check:** on a phone, open Analytics → Share my stats, turn Sales on and
  off and see the preview change, then share to Instagram story and WhatsApp.
  On a laptop, the website downloads the image.

### S13. Seller payout status from Razorpay (new feature)

**What it does.** Every order paid online now carries `payout`: the seller's
Razorpay Route transfer as Razorpay reports it.
- Fields: transfer id (`trf_…`), linked account (`acc_…`), amount, transfer
  status (processed / failed), settlement status (on hold / pending /
  settled), release time and settlement id (`setl_…`). These are the columns
  of Razorpay's Route → Transfers screen.
- It also covers transfers made by the admin payout run (`payment.transferId`),
  showing each order's share.
- It is read-only: it never creates, releases or reverses a transfer.

**Where it shows.**
- **Seller website, Payouts:**
  - "Paid out" splits into *in your bank* and *on the way*.
  - "On hold" uses the real release time (24 hours after delivery for Route,
    instead of the old guess of 7 days).
  - Each order shows its state and transfer id.
- **Seller website, order card:** the old "Transferred to your registered bank
  account" (shown whatever had happened) is replaced by the real state.
- **Seller app, Payouts screen:** the same as the website.
- **Admin → Route Payouts:**
  - Totals and counts per state: Needs action, On hold, Release scheduled, On
    the way, Settled, Failed.
  - A paged transfer list with filters.
  - "Check with Razorpay now".
  - **Release** for delivered orders whose money is still held. These are
    orders delivered while `settings/route.releaseEnabled` was off; the delivery
    trigger only releases at the moment of delivery. Release checks Razorpay
    first (the seller's own transfer, still held, not reversed) and asks for
    confirmation.

**How it stays current (and cheap).**
- `trackPayoutOnOrderWrite` starts following an order once it is paid. It
  makes the order due again when something that moves money changes:
  delivered, refunded, payout run, release.
- `syncPayoutStatus` runs every 15 minutes and reads only due orders (a query
  on `payout.nextCheckAt`, up to 150 a run).
  - One Razorpay request covers a payment, for all its sellers.
  - A transfer on hold is re-checked daily; one with a release date, an hour
    after that time; one released but not settled, every 3 hours.
  - Settled, failed or reversed transfers are no longer checked. Orders older
    than 120 days stop being followed.
  - Razorpay errors back off (1h, 2h, 4h … a day).
- Razorpay webhooks `transfer.processed`, `transfer.failed` and
  `settlement.processed` make the matching orders due at once. The function
  still reads Razorpay itself, so a webhook can only speed a check up.

**Deploy.**
- **Step 1 (rules, indexes):**
  - Indexes: `orders` (`payout.state`, `createdAt` ↓) and (`payout.state`,
    `status`, `createdAt` ↓).
  - Rules: customers and sellers can no longer write `payout`.
  - Customers can no longer create an order carrying `payout`, `routeRelease`,
    `routeTransfer` or `reassignment`.
  - Customers can no longer set or change server-written payment fields
    (`transferId`, refund and fee fields). Before, a customer could set
    `payment.transferId` on their own order. That made it look paid out, and
    the payout run would skip the seller.
- **Step 2 (functions):**
  - New: `syncPayoutStatus` (scheduled, asia-south1), `trackPayoutOnOrderWrite`
    (asia-south1) and `syncPayoutsNow` (callable, us-central1, admin only).
  - Changed: `sellerStatsOnOrderWrite`, for settled totals and release times.
  - They use the existing `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` secrets,
    as `releaseTransferOnDelivery` does.
- **Step 3 (once, after functions), from `functions/`:**

  ```
  npx tsx scripts/backfill-payout-status.ts --project krishidukan-e8315           # preview
  npx tsx scripts/backfill-payout-status.ts --project krishidukan-e8315 --write
  ```

  This marks paid orders from the last 120 days (`--days` to change) to be
  followed. Statuses fill in over the next runs, 150 orders per 15 minutes.
- **Step 4 (website) and step 5 (app).**

**Razorpay dashboard (no code).**
- Settings → Webhooks → the existing `…/api/webhooks/razorpay` webhook: also
  tick `transfer.processed`, `transfer.failed` and `settlement.processed`.
  Keep the same secret. This is optional: without it, statuses still update
  within 15 minutes to a few hours.
- Route itself is already on: transfers are being created at checkout.

**Settings to check (Firestore `settings/route`).**
- `releaseEnabled: true` releases a seller's money automatically 24 hours
  after delivery. While it is false, delivered orders stay "On hold" and show
  up under Admin → Route Payouts → Needs action.
- `holdTransfers` (default true) keeps money held until delivery.

**Check.**
1. Admin → Route Payouts shows the same transfers and statuses as Razorpay's
   Route → Transfers screen. Use "Check with Razorpay now" to refresh.
2. Mark a held order delivered (with `releaseEnabled` on): it moves to "Release
   scheduled" with a time, then "On the way", then "Settled".
3. The seller's Payouts page shows the same.

### S13b. Dates and bank reference (UTR) for each transfer

- **Stored on `orders/{id}.payout`** by `syncPayoutStatus`:
  - `processedAt`: when Razorpay processed the transfer.
  - `settlementAt` and `utr`: when it settled to the seller's bank, and the
    bank reference.
- **Where the UTR comes from:** Razorpay's documented Fetch Settlement
  Details call (`GET /transfers?recipient_settlement_id=…&expand[]=recipient_settlement`).
  - It is made once per settlement and reused for every order in it.
  - If Razorpay has no UTR yet, the order is checked again every 6 hours for
    3 days.
- **Shown to admins** in Seller payments → Transfers:
  - Columns: Order Date, Delivery Date, Transfer Id, Amount, Transfer Status /
    Processed, Settlement Status / Settled, UTR.
  - The order panel shows all of them.
  - **Download CSV** exports the current filter or search, up to 5,000 rows,
    with order, delivery, processed and settled dates, settlement id and UTR,
    for reconciling with the bank statement.
- **Shown to sellers:**
  - Website Payouts: a "Settled · UTR" column.
  - App Payouts rows: "Settled 9 Oct 2026 · UTR …".
  - The "In your bank" step of the timeline shows the UTR, so sellers can
    find the money in their bank statement.
- **Deploy:** functions (step 2), website (4) and app (5).
- **After deploying**, fill in the UTR for transfers that had already
  settled:

  ```
  cd functions
  npx tsx scripts/backfill-payout-status.ts --project krishidukan-e8315 --refresh-settled           # preview
  npx tsx scripts/backfill-payout-status.ts --project krishidukan-e8315 --refresh-settled --write
  ```

### S14. Payment timeline and a reorganised admin

**Payment timeline (sellers and admins).** Every order now tells its money
story step by step:

  Order placed → Customer paid online → Held safely by KrishiDukan →
  Marked delivered → Released → In the bank

Each step done shows its date. The current step says what it is waiting for
("Mark the order delivered to release your money", "Releases 9 Oct, 3:44
pm", "Razorpay is sending it to your bank, usually by the next working
day"). Refunds and rejections, failed transfers, payout-run payments and cash
orders each have their own wording.
- Logic: `app/lib/payout-timeline.ts` (website) and
  `mobile/lib/features/dashboard/data/payout_timeline.dart` (app). Same
  rules; change them together.
- **Seller website:** "Where is my money?" on each order's details. Payouts
  rows show where the money is; click a row for the timeline.
- **Seller app:**
  - Each order card shows where the money is; tap it for the timeline.
  - Orders → Payments cards show the timeline.
  - Payouts rows open it.

**Admin reorganised.**
- **Sidebar:** grouped into Orders & money, People, Catalogue, Content and
  Insights. Groups fold away (remembered per browser), and a "Find a page…"
  box searches names and keywords. "Payments" is now **Customer payments**,
  to tell it apart from seller payments.
- **Seller payments** (`/admin/payouts`) replaces the two pages "Seller
  Payouts" and "Route Payouts" with four tabs:
  - **Overview:**
    - How a seller gets paid, in five steps.
    - The **automatic release** switch (`settings/route.releaseEnabled`).
      Admins can turn it on or off here; a warning shows while it is off.
    - Delivered orders still on hold, with a link to release them.
    - Totals for every state, and the sellers on Route.
  - **Transfers:**
    - Every transfer with Razorpay's columns, filters, and search by order
      id, `trf_…`, `pay_…`, `order_…` or seller phone.
    - Clicking an order opens a panel with its timeline, every id (payment,
      order, transfer, seller account, settlement) and actions: **Release to
      seller** (delivered and still held) and **Check this order with
      Razorpay**.
  - **Payout run:** the bank-transfer run for sellers not on Route (moved
    unchanged).
  - **Bank & KYC:** bank details and documents to verify (moved unchanged).
  - The old `/admin/route-payouts` address opens the Transfers tab.
- **Team access:**
  - "Route Payouts" permission: Overview and Transfers, read only.
  - "Seller Payouts" permission: Payout run, and Bank & KYC.
  - Releasing money and the switch are admin only.
  - Fixed: team members given Route Payouts or Sales Team were redirected
    away from those pages, because the page address did not match the
    permission name.

**Deploy:** website (step 4) and app (step 5) only. No rule, index or
function change.

**Check:**
1. Open a seller's delivered order (website and app) and see each step with
   its date.
2. In Admin → Seller payments: turn automatic release on, search an order by
   its `trf_…` id, open it, and release a "Delivered, still held" order.
3. As a team member with only Route Payouts, open Seller payments: you see
   Overview and Transfers, with no Release button.

### S15. Old reels that start slowly

**Problem.** Reels posted before server-side compression (mid-September) still
play the raw phone video: often 50–150 MB at 1080p. They take seconds to
start on mobile data and make the whole feed feel slow. A function to fix them
(`backfillReelTranscodes`) existed but nothing ever called it. Also found:
- A fast encode could finish before the app saved the reel. The update then
  failed and that reel kept its raw file for good.
- Reposts copy the reel's video address. Once the original was compressed
  (and its raw file deleted), older reposts pointed at nothing.
- The website `/reels` page read the first 120 reels by id, not the newest.

**Fix: compress them, and keep the feed fast meanwhile.**
- New function **`compressOldReels`** (every 30 minutes):
  - Re-runs the normal compressor (`transcodeReel`) on 4 old reels per run,
    so ~200 reels a day without a burst of large machines.
  - A reel already compressed but never switched over is switched directly
    (no second encode).
  - Skips files uploaded in the last hour (their own encode is running).
  - Gives up on a file after 3 failed tries and logs it.
  - Progress per reel is kept in `reelCompression/{reelId}` (server only;
    the rules deny clients by default).
  - When nothing is left it lists Storage, finds nothing, and ends.
- `transcodeReel` now waits up to 3 minutes for the reel to be saved, and moves
  reposts to the compressed file too.
- **Until a reel is compressed** the feed ranks it lower (score × 0.3, after a
  day's grace for new uploads) on the app and the website, and never picks it
  for the "new reel" slot. It still shows; it just isn't first. As each reel is
  compressed it ranks normally again, so there is no date cut-off to remove
  later. Rule in `app/reels/lib/ranking/rank.ts` and
  `mobile/lib/features/reels/domain/reel_ranker.dart`.
- Website `/reels` now reads the newest reels first (`orderBy createdAt`).

**Deploy:** functions (step 2: `compressOldReels` new, `transcodeReel`
changed), website (step 4), app (step 5). No index (single-field order).
Older app versions keep working: they read the same `videoUrl`, which now
points at the small file.

**Cost:** each old reel is encoded once (2 GiB, about a minute). Storage drops,
since each raw file is deleted after its compressed copy is in place.

**Check:**
1. Logs of `compressOldReels`: `[compress-old-reels] run` with `nudged: 4`,
   then `transcodeReel` runs for those reels.
2. A day later, the count of reels without `optimizedAt` is going down.
3. Open an old reel in the app: it starts quickly and its `videoUrl` ends in
   `video_optimized.mp4`.
4. Any reel listed under "could not compress" in the logs: open it; if the
   file is broken, ask the seller to upload it again.

### S16. Simpler KYC for sellers

**Problem.** Sellers were asked for five documents (PAN card, cheque, address
proof, owner photo, licence) plus a long bank form. Many stopped halfway.

**Now (website Payouts page and app Payouts screen), three short steps:**
1. **Bank account:** account holder name, IFSC, bank name and branch name
   (filled in automatically from the IFSC), account number typed twice (paste
   blocked), and a small note: "Please fill carefully and check each digit".
2. **GST number or PAN:** a GST number contains the PAN, so entering it fills
   the PAN in. Sellers without GST type their PAN. The GST number's check
   character is verified, so one wrong character is caught on the form.
3. **Licence:** one photo. The other documents are optional, under "Other
   documents (optional)". Anything a seller already uploaded is still shown.
- A checklist at the top ticks each step; a green note says selling never
  waits for KYC.
- Rules in `app/lib/kyc.ts` (website) and `mobile/lib/core/utils/kyc_rules.dart`
  (app); change them together.
- New website endpoint **`/api/ifsc?code=…`** (bank and branch from Razorpay's
  free IFSC directory, cached a day). The app uses it too. If it is down, the
  seller types bank and branch themselves.
- **Admin, Bank & KYC:** shows GST number, PAN (and whether it came from GST),
  bank and branch; "missing" now means bank details, PAN/GST or licence.
- **Create Route account** now sends the PAN and GST number to Razorpay
  (`legal_info`), and sets the business type from the PAN (P person →
  proprietorship, C company → private limited, F firm → partnership, H HUF,
  T trust). It also records when the account was created (24-hour cooling).
- **Verify** now also links the seller's shop to the same Razorpay account
  (if the shop has none), so new orders are split at checkout. If the shop is
  already linked to a different account, verify refuses and says which.
- Daily KYC reminder: asks only for what's still missing, in kinder words
  ("Your money is safe with KrishiDukan and is sent to your bank once this is
  done"). WhatsApp templates `kyc_pending`/`kyc_success` are approved in Meta
  and unchanged.

**Old app versions:** keep working; they write the old fields, which the new
screens and admin still read. Old sellers stay verified.

**Rules:** `linkedAccountId` and `linkedAccountCreatedAt` added to the
admin-only payout fields (sellers can't write them). Tested on the emulator:
new website and app save shapes, the old app's shape, licence upload, and
every forbidden write (14 checks).

**Deploy:** rules (step 1), functions (step 2: `remindIncompletePayoutDetails`
changed), website (step 4), app (step 5).

**Check:** fill the form on UAT with IFSC `SBIN0001234`: bank and branch fill
in. Enter a GST number: PAN fills in. Upload a licence: checklist shows 3 of 3.

### S17. Sell before KYC; paid automatically once verified

**What was already true.** Checkout never blocked a seller without KYC. Their
online orders simply had no Route transfer, so the whole payment stayed with
KrishiDukan, and they were paid only when an admin ran the payout run by hand.
Only Online Delivery asks for a GST number (unchanged; that's a tax rule).

**Why "keep it on hold in Razorpay" isn't enough on its own.** Razorpay
settles every payment to KrishiDukan's bank in about 2 days. So for a seller
who finishes KYC later, older payments are no longer in Razorpay, and a
transfer tied to such a payment would fail. They have to be paid from
KrishiDukan's Razorpay balance (a "direct transfer"), which is what the payout
run already does.

**Now:**
- **New function `payAfterKyc`** (every hour, `functions/src/payouts/pay-after-kyc.ts`).
  It pays an order when ALL of these hold:
  - `settings/payouts.transfersEnabled` and the new `settings/payouts.autoPayout`
    are on (both off by default; admin switch in Seller payments → Payout run).
  - The seller is verified with a Razorpay account, and 24 hours have passed
    since verification and since the account was created (Razorpay's
    cooling period).
  - The order was paid online and delivered, and 7 days have passed since
    delivery (same hold as the payout run).
  - Nothing has paid it, and Razorpay shows no live Route transfer for this
    seller on the payment.
- **Amount = "after our cut":** the order total less refunds, less
  KrishiDukan's commission and the gateway fee from `settings/route`, exactly
  what a Route seller nets at checkout (a test checks the maths matches).
- **Never twice:** each order is claimed in a transaction before money moves.
  On failure the claim is removed, the error is kept on the order, and it is
  tried again after 6 hours. If the job stops after paying but before writing
  it down, the order stays claimed, is never paid again automatically, and the
  admin timeline says "check Razorpay".
- **Payout run (manual) now pays the same amounts** and skips claimed orders.
  It used to deduct only the gateway fee, so sellers off Route paid no
  commission although the Terms say 1%. Orders it pays now record the
  commission (`payment.platformFee`) and the split (`payment.payoutSplit`).
- **Earnings screens** (website, app, stats) show what a payout actually sent
  (`payment.transferredNet`) once an order is paid.
- **Payment timeline:** for a seller whose KYC isn't verified, an order not
  split at checkout says "Waiting for your KYC — your money is safe with
  KrishiDukan; finish the 3 steps and it is sent automatically" (headline
  "Finish KYC to get paid"). Admins see "Waiting for seller's KYC", and any
  automatic-payout failure or unconfirmed payout.
- **Payouts page (website and app):** a green note "You can keep selling while
  you do this".
- **Checkout:** if Razorpay refuses an order because of a transfer (a linked
  account not active yet, still in its cooling day, suspended), it retries once
  without transfers, so the customer can still pay. That seller is then paid by
  this job or the payout run.
- **One Razorpay account per seller:** verifying a seller fills the shop's
  `razorpayAccountId` (used by checkout) when empty, so their next orders are
  split at checkout automatically (see S16).

**Turn on (after deploy):**
1. Razorpay: direct transfers (from balance) must be enabled on the account,
   as for the payout run. Keep enough money in the Razorpay balance, or set
   settlements so some stays there: a transfer fails when the balance is short
   and is retried 6 hours later.
2. Admin → Seller payments → Payout run: "Live transfers" Enable, then "Pay
   verified sellers automatically" Turn on.
3. Watch the `payAfterKyc` logs for a day (`[pay-after-kyc] run`).

**Deploy:** functions (step 2: `payAfterKyc` new; `sellerStatsOnOrderWrite`
changed), website (step 4), app (step 5). No rule or index change (the order
queries are equality-only).

**Tests:** on the emulator with Razorpay faked: off until switched on; cooling
period; unverified seller; hold after delivery; order already on Route;
already paid by the payout run; both phone formats; failure keeps the claim
off and waits 6 hours; one transfer for several orders with the exact
amounts; never pays twice; a leftover claim blocks payment. Timeline: KYC
wording for seller and admin, routed money unaffected (website and app).

### S18. Two fixes recovered from a local stash

- `firestore.indexes.json`: the `dealerNotes` (dealerId, createdAt) composite
  index had been added under `fieldOverrides`, where an index with `fields` is
  not valid, so deploying indexes could fail. Moved to `indexes`.
- "Create Route account" no longer fails with "missing email" for a seller
  whose shop record has no email but whose user record does
  (`app/lib/route-server.ts` reads every one of the seller's records).

**Deploy:** indexes (step 1), website (step 4).

## Testing on UAT

Needs your usual `.env.uat` file and access to `karan-arjun-uat`.

```
npm run copy:prod-to-uat     # optional: real catalogue and stores in UAT
npm run deploy:uat           # rules, indexes, storage and functions to UAT (see the storage.rules note in step 1)
cd functions
npx tsx scripts/backfill-marketplace-cards.ts --project karan-arjun-uat --write
npx tsx scripts/build-store-directory.ts --project karan-arjun-uat --write
cd ..
npm run dev:uat              # this website, on your computer, against UAT
```

Open http://localhost:3000 and run the step 4 checklist. For the app, run it on
a phone with the UAT flavor from `ENVIRONMENTS.md`
(`flutter run --flavor uat --dart-define=...`) and run the step 5 checklist.

## Rollback

- Website: Firebase console → Hosting → previous release → Rollback. The old
  website reads the raw collections, which this work never changes, so it works
  as before.
- Functions: the new ones only add `marketplaceCards`, `marketplaceSearch`,
  `cardMembers`, `storeDirectory`, `storeDirectoryState`, `productStats`,
  `storeStats`, `platformDailyStats`, `sellerStats`, `sellerDailyStats` and
  `statsEvents`. They can be deleted without affecting the old website or
  app. The WhatsApp webhook change only adds fields (`hasIncoming`,
  `lastMessageAt`) that older code ignores.

## Not done in this round (follow-ups)

- **Invite-code lookups** are limited to one invite per query, but someone
  determined could still step through invites one request at a time. Moving the
  signup lookup to a server endpoint (and old app versions off the client
  query) would close it completely.
- **Auth custom claims** for `myPhone()` / `myRole()` / `isAdmin()`: each costs
  `get()` reads per request. Putting phone and role in token claims removes them,
  but it rewrites 100+ rule checks and a role change only reaches the token on
  refresh (up to an hour), so it needs its own careful change.
- **Manufacturer's own discount** is not reflected in a card's lowest final price
  when retailer copies exist, because the merge builds that price from seller
  entries and the manufacturer's entry carries no discount. This was already how
  the live storefront behaved; cards keep it. Worth fixing in `functions/src/marketplace/merge.ts`.
- **Page views** (`trackPageView`) write one shared `siteVisits/{day}` doc per
  home load (now only +1 increments are accepted). Cheap, but a hot document
  under heavy traffic; Google Analytics already counts these.
- **After most users update the app**, remove the analytics-counter exemption
  from the `products` update rule so no counter write can reach product docs.
- Android: add the Firebase Performance Gradle plugin if automatic network
  traces are wanted.
- `firebase.uat.json` still sets the UAT website server to `us-central1`; set it
  to the UAT database's region.

## Tests run

All in a cloud dev environment against the Firestore emulator (no access to
production):

- Card output equals the old storefront merge for 1,082 cards (3 randomized runs).
- Card triggers: build, ratings, rename, delete, review changes, counter-only
  writes ignored, 40 concurrent copies, discount window job, backfill dry run and
  re-run, nightly reconcile repairing damage (22 checks).
- Market API on `next dev`: paging, categories, search incl. Hindi, misspellings,
  substrings, shop names, suggestions (20 checks).
- Store directory: build, field selection, ratings, change detection, chunking
  (17 checks); every field the web, SEO and app store merges read is present.
- Counter rules (12 checks).
- Privacy and safety rules (93 checks): each query and write shape the
  website, app and invite flows use, the abuse each rule now stops, and the
  website's price sync on a product whose other sellers saved prices from the
  app (stored as decimals).
- "Up to N% OFF" function: follows discount changes, inactive copies, deletes,
  ignores view-counter writes, no write loop (10 checks).
- App: `flutter analyze` (no new issues), `flutter test` (135 passing, 7 new).
- Web and functions typecheck: no new errors. `next build` compiles every page
  and route; its later page-data step needs the production Razorpay keys, which
  the test environment doesn't have, so run the full build where they are set.
- Seller, manufacturer and admin side (S1–S10), on the Firestore emulator
  as the real roles (seller, manufacturer, admin, team member, another
  seller): every new query passes the rules and others are refused; the new
  totals (platform day docs, seller stats, earnings, counts) equal what the
  old code computed from the raw collections; paging returns every row once,
  newest first. `flutter test` 141 passing.
- Not tested here: the storefront and app UI against real data (no access to
  production). That is what the UAT pass in "Deploy order" is for.
