# Why KrishiDukaan was slow and costly, and how we fixed it

Written October 2026, for the whole team. The fixes are on branch
`claude/busy-keller-iica2f`. They are built and tested, but **not deployed yet**.
Deploy steps are in [performance-rollout-2026-10.md](performance-rollout-2026-10.md).
A shorter version with charts, for anyone on the team, is in
[performance-report-2026-10.pdf](performance-report-2026-10.pdf).

This document has three jobs:

1. Explain what was wrong and how it hurt farmers, sellers and our bill.
2. Explain what we changed and how the new parts work.
3. Give simple rules and checks so we stay fast as users grow.

---

## The short version

One idea explains almost everything:

> **The app did the heavy work every time someone opened a screen.
> Now the work is done once, when the data changes.**

Think of a shop. A customer asks the price of urea. Shop A phones all 30
suppliers, writes down every answer, works out the lowest price, and only then
replies. It does this again for the next customer, and the next. Shop B keeps a
printed price list and updates it only when a supplier changes a price. Shop B
answers instantly.

KrishiDukaan was Shop A. After this work it is Shop B.

| | Before | After |
|---|---|---|
| Website Market page | Up to 480 documents read, one batch after another. 13–33 seconds per page | About 20 ready-made cards |
| App search while typing | The whole catalogue and every review downloaded on each pause | No reads. Search runs on cards already on the phone |
| Store list (cart, map, app) | 5 whole collections downloaded | 1–2 documents |
| Each product a farmer scrolls past | 1 write to the product, plus 2 Cloud Function runs | 1 write to a separate stats document, no function runs. Nothing for signed-out visitors |
| Website server | In the USA, database in India | Both in Mumbai |

---

## Part 1: Basics in two minutes

You need these five ideas to follow the rest.

**1. A read is one document.** Firestore charges for every document it sends.
A query that returns 4,000 documents costs 4,000 reads, every time it runs.
Downloading a whole collection is the most expensive thing an app can do.

**2. A write can wake up Cloud Functions.** Some functions listen to a
collection (a "trigger"). Every write to that collection starts them, even if
they then have nothing to do. Each start is a function run we pay for.

**3. Speed depends on four things:**
- How many documents travel over the network.
- How many trips happen one after another. Ten trips in a row are ten waits.
- How far the server is from the database. India to the USA and back takes
  roughly 0.2 seconds for every single trip.
- Whether the server was asleep. A server that wakes up after a quiet period
  (a "cold start") adds many seconds to the first visitor's request.

**4. Security rules can cost reads too.** Every request is checked by
`firestore.rules`. A rule that looks up another document (`get()` or
`exists()`) costs an extra read. A **denied** request is wasted work, and it
usually means a bug.

**5. A farmer's phone is not a laptop.** Many farmers use slow mobile networks
and pay for data. Downloading a whole catalogue to show 8 search suggestions
costs them seconds, data and battery.

---

## Part 2: What the numbers showed

From the Firebase and Google Cloud consoles (early October 2026) and Arjun's
measurements in [status-2026-10-02.md](status-2026-10-02.md):

| What we looked at | Number | What it told us |
|---|---|---|
| Firestore reads | **68 million** | About 99% of all database work was reads |
| Firestore writes | 898,000 | |
| Security rule checks denied | **349,000** (about 1 in 6) | Code was asking for things it isn't allowed to do |
| Top query by load | `products ... LIMIT 5000`: 4,222 documents each time, 29 times in the window | The sitemap, reading every product |
| `syncSellerProductToCanonical` / `notifyLowStock` | **1,539 / 1,538 runs per day** | `decrementStockOnOrder` ran once, so there was about 1 order that day. These runs came from view counters, not real edits |
| Website server region | `us-central1` (Iowa, USA) | The database is in `asia-south1` (Mumbai) |
| Market page | 13–33 seconds per page | Measured by Arjun |
| Search for "urea" | 0 results after 29 seconds | It gave up before reaching "u" in the alphabet. Arjun fixed the results; it is still slow after quiet periods |
| After a quiet period, even with Arjun's cache | ~19 s for the first search, ~13.7 s to browse, ~30 s server start | |
| Store list on the home page | "~20M reads", from the team's own code comment | Sai stopped this from running on every home page load |

---

## Part 3: The problems, one by one

Each problem below has the same parts: what was happening, how it hurt users,
how it hurt reads, writes and cost, and what we changed.

### Problem 1: Each product is saved many times and combined on every read

**This was the root cause of most of the slowness.**

**What was happening.** A manufacturer's product is one document. Every
retailer who stocks it gets their own **copy** of that document, with their
price and stock. So one product, for example "Urea 45 kg", exists as many
documents (Arjun measured about 32 per product). `products` had 4,222
documents in total.

To show one product card, the code had to:
1. Fetch every copy of it.
2. Combine them: the lowest price, the list of sellers, stock, and discounts.
3. Fetch **every review** to calculate the star rating.

It did this every time any screen opened, for every user:

- **Website Market page:** read up to 480 documents, in many trips one after
  another, to show about 13 products.
- **Website search:** walked through the products from A to Z and gave up
  after 1,600 documents, so "urea" found nothing. Arjun fixed the results by
  keeping the whole catalogue in server memory for 5 minutes. It was still
  slow whenever that memory was empty.
- **Website product, cart, map, brand and store pages:** downloaded every
  product and every review into the visitor's browser.
- **App:** downloaded every product and every review on **each pause while
  typing a search**, on each category change, and when a product was opened
  from a shared link.

**How it hurt users.** Pages that took 13–33 seconds. Searches that came back
empty. An app that felt stuck while the farmer typed, and that used their
mobile data to download the whole catalogue again and again.

**How it hurt cost.** Reads grew with **catalogue size × visitors**. Every new
seller, product or review made every visit more expensive.

**What we changed: `marketplaceCards`.** A Cloud Function now builds **one
ready-made card per product name**. The card already contains the combined
sellers, lowest price, stock, rating average and count, and the active
discount. It is rebuilt within seconds when a product or review changes.

- The card uses **the exact same combining code** the website used before,
  moved into Cloud Functions. We checked 1,082 test cards: every one matches
  what the old storefront showed.
- **Search** uses a second collection, `marketplaceSearch`. For each card it
  stores the words a farmer might type: parts of words ("ure", "urea"),
  Hindi names for common products ("यूरिया"), and common misspellings
  ("uria"). A search is one query for the typed word,
  and it returns only the matches.
- **Website Market page:** reads about 20 cards per page. Arjun's 60-second
  cache stays in place.
- **App:** downloads all the cards once and keeps them for 5 minutes. Typing a
  search filters cards already on the phone, so it costs **no reads**.
  Opening a product costs **1 read**.

### Problem 2: Every product view was a write that woke up two functions

**What was happening.** Seller analytics (views, clicks, calls) were counted
**on the product document itself**. Every product card a farmer scrolled past
was 1 write. Every write to `products` starts `syncSellerProductToCanonical`
and `notifyLowStock`, which then had nothing to do. That is why they ran
about 1,540 times a day when there was about 1 order.

Two more side effects:
- The daily counters (`impressionsByDay` and others) made product documents
  **bigger every day**, so every catalogue read got slower over time.
- Signed-out visitors aren't allowed to write, so each card they saw was a
  **denied** write, adding to the 349,000 denials.

Store views were counted the same way, on the retailer document. That made
retailer documents grow too, which made Problem 3 worse.

**What we changed.**
- Counters moved to their own documents: `productStats/{productId}` and
  `storeStats/{phone}`. No function listens to them.
- The website collects counter updates and sends them together in one
  request every ~0.8 seconds, instead of one request per card. (Firestore
  still bills one write per product; the saving is the function runs.)
- Signed-out visitors are skipped.
- The rules for these documents need no extra lookups.
- Seller dashboards, admin analytics and the weekly digest add the old and
  new counters together, so no history is lost.

**Result.** About 3,000 fewer function runs a day. The product functions run
only for real product edits. Product documents stop growing. Denied writes
from signed-out visitors stop.

### Problem 3: The store list downloaded five whole collections

This is the query your teammate found: `COLLECTION /retailers ORDER_BY __name__ ASC`.
It means "download every retailer, with no filter and no limit".

**What was happening.** One store's information is spread across five
collections: `retailers`, `profiles`, `manufacturers`, `stores` and
`storeReviews`. To show any list of stores, the code downloaded all five in
full and matched them up. This happened in:
- the website cart and store map, for every visitor who opened them
- the SEO store pages
- the manufacturer's add-retailer form (all retailers **twice**, plus all users)
- reel comment tagging on the website
- the app's store list: the first Marketplace or product screen in each
  session, and again after every store review
- the app's tag dialog

Before Sai's fix it also ran on every home page load. The team's own code
comment said this was about 20 million reads.

**How it hurt users.** The cart and map waited for five downloads before
showing anything.

**What we changed: `storeDirectory`.** A Cloud Function packs only the store
fields the screens use, plus review totals, into **1–2 documents** (each up to
about 700 KB). When a store document changes, a trigger marks the directory
"needs rebuild". A job every 5 minutes rebuilds it if needed. The website, SEO
pages and app read 1–2 documents and keep their existing matching code, so what
they show doesn't change.

**Result.** 1–2 reads instead of five whole collections. A store change
appears within about 5 minutes.

### Problem 4: Tagging and pickers downloaded every user

**What was happening.** Typing "@" in a reel comment, the app's tag dialog,
the admin reel picker and the add-retailer form downloaded **every user
document** into the seller's browser or phone. That is expensive, and it put
every farmer's personal details on someone else's device. For some roles the
rules refused it, which added more denials.

**What we changed.** Shops now come from the store directory. People come from
a name search that returns at most 5 matches per spelling (10 documents at
most). After a permission error the search stops instead of retrying.

### Problem 5: The website server was in the USA and the database in India

**What was happening.** `firebase.json` ran the website's server (the
`ssrkrishidukane8315` function) in `us-central1`, in Iowa. Firestore is in
`asia-south1`, in Mumbai. Every database call from the website server went
Iowa → Mumbai → Iowa, roughly 0.2 seconds each. The Market page made many
calls one after another, so this added up quickly.

**What we changed.** One line: both website servers (the storefront and admin)
now run in `asia-south1`, next to the database.

**Not fixed by this:** the ~30-second wake-up after the server has been quiet.
Keeping one server always awake (`minInstances: 1`) would fix it, but it costs
money every hour, so it is a business decision.

### Problem 6: The sitemap read every product

**What was happening.** Each time the sitemap for Google was rebuilt, it read
all 4,222 product documents. It was the top query by load.

**What we changed.** It reads the cards instead. Each card lists the product
pages it contains, so the sitemap's links stay the same. It is rebuilt at most
every 6 hours.

### Problem 7: We had no speed numbers from real users

**What was happening.** We only had timings from developers' computers.

**What we changed.** We added Firebase Performance Monitoring:
- Website: real page load times.
- App: start-up time, plus two custom timers, `load_marketplace_cards` and
  `load_store_directory`.

You can see them in Firebase console → Performance, split by device, country
and network type.

### Already fixed by the team before this work

- **Sai:** the home page loads about 10 top picks instead of the whole
  catalogue, and the store list loads only when a screen needs it.
- **Arjun:** the Market feed is cached for 60 seconds on the server and on
  Google's CDN, and search finds matches anywhere instead of returning nothing.

---

## Part 4: Before and after, per user action

| What the user does | Before | After |
|---|---|---|
| Opens the Market page on the website | Up to 480 product documents, in many trips one after another | About 20 cards. Repeat visits within 60 s come from the cache |
| Searches on the website | The whole catalogue, kept in server memory and reloaded every 5 minutes (~19 s when empty) | The search entries for the typed word, plus the cards for one page |
| Types a search in the app | Every product and every review, on each pause | **0** (filters the cards already on the phone) |
| Opens a product from a shared link in the app | Every product and every review | **1** |
| Opens the cart or store map on the website | All 5 store collections, plus every product and every review | 1–2 directory documents, plus the cards |
| Opens the store list in the app | All 5 store collections | 1–2 documents |
| Scrolls past 20 products (signed in) | 20 writes to products and 40 function runs | 20 writes to `productStats`, sent in one request, and no function runs |
| Scrolls past 20 products (signed out) | 20 denied writes | Nothing |
| Types "@" to tag someone | Every user and every retailer | At most 10 user documents, plus the directory |
| Sitemap rebuild | All 4,222 product documents | One read per card, at most every 6 hours |

---

## Part 5: How the new system works

### Product cards

```
 A seller or admin changes a product, or a farmer posts a review
                          │
                          ▼
   products / productReviews        (unchanged: still the real data)
                          │  Cloud Function trigger, within seconds
                          ▼
   marketplaceCards   — one ready-made card per product name
   marketplaceSearch  — search words that point to a card
                          │
                          ▼
   Website API, website pages and app read only the cards they show
```

### Store directory

```
 retailers / profiles / manufacturers / stores / storeReviews change
                          │  trigger marks "needs rebuild",
                          │  only if a field we show changed
                          ▼
   rebuildStoreDirectoryIfDirty (every 5 minutes)
                          │
                          ▼
   storeDirectory — 1–2 documents with every store
```

### How fresh the data is

| Change | Shows up |
|---|---|
| Product price, stock, name, or a new review | Within seconds |
| A discount starting or ending at its set time | Within 15 minutes |
| Store details or a store review | Within about 5 minutes |
| Website Market page | About 1–2 minutes extra (Arjun's server and CDN cache) |

### Safety nets

- **Discount timer:** a job every 15 minutes updates cards whose discount has
  just started or ended.
- **Nightly repair, 02:30 IST:** checks every card against the real data and
  fixes anything that was missed.
- **No overwriting newer data:** if two updates for the same card run at once,
  the older one is skipped.
- **Old data isn't touched:** the original collections stay exactly as they
  were. Old app versions keep working, and rolling back the website is safe.

### The trade-off

Cards and the directory are copies, so they update a few seconds to a few
minutes after a change. Building them costs some reads and writes **when data
changes**. Data changes far less often than people look at it, so the total
is much lower.

---

## Part 6: Rules for every new feature

Use these when building something new or reviewing a pull request.

**The one question to ask in every code review:**

> "How many documents does this read if we have **10 times more** products,
> stores or users?"
>
> If the answer grows with the size of a collection, stop and redesign it.

**The rules:**

1. **Never download a whole collection for a screen.** Every query needs a
   `limit()` or a tight `where`. If you think a screen needs "all of them",
   it needs a pre-built document instead (like the cards or the directory).
2. **Do the work when data is written, not when it is read.** If many people
   see the same combined result (a merged product, a rating, a total), build
   it in a Cloud Function and store it.
3. **Keep counters off important documents.** Documents that are read a lot or
   have triggers (products, retailers, users) must not get view counters.
   Put counters in their own documents, group the saves, and skip signed-out
   visitors. Never add "per day" fields that grow forever to a busy document.
4. **Keep everything in `asia-south1`.** Every new function sets
   `region: "asia-south1"`. Only add a new region for a clear reason.
5. **Cache what is the same for everyone.** Public API responses send
   `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. The app
   keeps lists in memory for a few minutes instead of reloading them on every
   screen.
6. **Load what the screen shows.** Show about 20 items per page. Load details
   when the user opens them.
7. **Never send other users' personal data to a device.** Search people with a
   small `limit()`, or through a server endpoint that returns only what the
   screen needs.
8. **Add the index with the query.** A new query with a filter plus sorting
   needs an entry in `firestore.indexes.json`. Deploy indexes **before** the
   code that uses them.
9. **Treat every denied request as a bug.** Avoid `get()` and `exists()` in
   rules where you can, because each one is an extra read.
10. **Measure before and after.** Check Query insights and Performance before
    a change and a few days after it.
11. **Test security rules with data the app saved, not only the website's.**
    The app saves a whole number like 450 as `450.0`; the website saves `450`.
    A rule that compares whole list entries (`==`, `in`, `removeAll()`) counts
    those as different values, while `diff()` and sets count them as equal.
    The products seller-list rule hit this (see `updateOwnAvailabilityEntries`).

---

## Part 7: Monthly health check (15 minutes)

| Where to look | What to check | Healthy | Warning sign |
|---|---|---|---|
| Firebase console → Firestore → **Usage** | Reads, writes and rule denials per day | Reads rise with visitors, not with catalogue size. Denials near zero | Reads jump after a release. Denials rising |
| Google Cloud console → Firestore → **Query insights** | Top queries by documents scanned | Queries return about as many documents as they scan, and the numbers are small | A query with no filter (`ORDER_BY __name__` alone) or `LIMIT 5000` |
| Firebase console → Functions → **Usage** | Runs per function | Product functions run about as often as real product edits | Thousands of runs with few real changes |
| Firebase console → Functions → **Logs** | Errors in the card and directory functions | No repeated errors | The same error every few minutes |
| Firebase console → **Performance** | Website page load, `load_marketplace_cards`, `load_store_directory` | Suggested target: under 2–3 seconds on 4G | Times rising month by month |
| Google Cloud console → Billing → **Budgets & alerts** | A monthly budget with email alerts | Spending as expected | An alert fires |

Write down the numbers each month. A trend tells you more than one day.

---

## Part 8: When we grow — what to change next

What we built is right for today's size. As KrishiDukaan grows, these are the
next limits, the signal that tells you one is close, and the next step. All
of them use only Firebase and Google Cloud.

| What | Signal to watch | Next step |
|---|---|---|
| **The app downloads all cards** (once per 5 minutes) | `load_marketplace_cards` gets slow, or there are a few thousand cards | Make the app load 20 cards at a time and search with `marketplaceSearch`, the same way the website API does |
| **Website product, cart, map, brand and store pages load all cards** in the browser | Those pages get slower as the catalogue grows | Load only the cards a page needs, by ID, plus a paged list |
| **The store directory holds every store** (each document up to ~700 KB) | More than 2–3 directory documents, or `load_store_directory` gets slow | Save a geohash on each store and query only stores near the farmer (the method Firebase documents for location queries) |
| **Search matches words, parts of words and listed misspellings** | Farmers search with sentences ("medicine for wheat rust") or with spellings we didn't list | Firestore vector search with Vertex AI embeddings, or Vertex AI Search for commerce |
| **One counter document per product** | Firestore advises about 1 write per second per document; watch the logs for "contention" errors on `productStats` | Split a busy product's counter into several documents, or move view tracking to Google Analytics with BigQuery export |
| **`siteVisits/{day}`**: one document written on every home page load | Same 1-write-per-second limit, on one document for the whole site | Remove it. Google Analytics already counts page views |
| **Security rule lookups** (`myPhone()`, `myRole()`, `isAdmin()`) | Each request pays 1–3 extra reads | Put phone and role into Firebase Auth custom claims, so rules can check them without reads |
| **The website server wakes up slowly** (~30 s after a quiet period) | Real-user page loads show slow first visits | `minInstances: 1` on the website server (an always-on cost) |
| **The nightly repair reads every product** (4,222 reads a night today) | The catalogue reaches tens of thousands of products | Check only products changed since the last run |
| **Copies per seller in `products`** (the root cause behind the cards) | The cards hide it for now | Long term: one `catalog` document per product, plus one `offers` document per seller with price and stock |

---

## Part 9: Still open

- **Fixed since (privacy and safety rules, not yet deployed):** enquiries and
  notifications are readable only by their own seller/recipient; sellers can
  read only other seller accounts, not farmers'; only a seller's own entry in
  a product's seller list can be changed by them, and discount badges are
  owner-only (kept correct by a Cloud Function); invites can only be looked up
  one at a time by code; site visits, likes and follows accept only valid,
  own writes. Details: "Privacy and safety rules" in the deploy guide.
- **Invite lookups** could still be stepped through one request at a time;
  a server endpoint for invite codes would close that fully.
- **Auth custom claims** for the rules (see Part 8).
- **Manufacturer's own discount** doesn't show in a card's lowest price when
  retailers also sell the product. The live site already behaves this way;
  the fix belongs in `functions/src/marketplace/merge.ts`.
- **`siteVisits`** (see Part 8).
- **After most users update the app:** remove the counter exception from the
  `products` rule, so no counter can be written to a product again.
- **`storage.rules` is missing from the repo**, but `firebase.json` and
  `firebase.uat.json` point to it. `npm run deploy:prod` and
  `npm run deploy:uat` stop at the storage step, before deploying functions.
  Copy the live rules from Firebase console → Storage → Rules into
  `storage.rules` and commit them.
- **`firebase.uat.json`** still runs the UAT website server in `us-central1`.

---

## Part 10: Words used in this document

| Word | Meaning |
|---|---|
| **Document** | One record in Firestore, for example one product |
| **Collection** | A group of documents, for example `products` |
| **Read / write** | One document sent to us / one document saved. Both are billed |
| **Query** | A request for documents that match a condition |
| **Index** | Firestore's lookup table that makes a query fast. Queries with filters and sorting need one |
| **Cloud Function** | Our code that runs on Google's servers, not on the user's device |
| **Trigger** | A Cloud Function that runs automatically when a document changes |
| **Read model / card** | A ready-made document built from other data, so screens don't have to build it |
| **Backfill** | A one-time script that builds the cards and directory for existing data |
| **Cache** | A saved copy of an answer, reused for a short time |
| **CDN** | Google's network of servers that hands out cached pages close to the user |
| **Region** | The city where a server or database runs. Ours is `asia-south1` (Mumbai) |
| **Latency** | The waiting time for one trip between two computers |
| **Cold start** | Extra time while a sleeping server wakes up |
| **SSR server** | The server that builds website pages before sending them to the browser |
| **Security rules** | `firestore.rules`: who may read or write which documents |
| **Denied request** | A request the security rules refused |

---

## Part 11: Where the code lives

| Part | Files |
|---|---|
| Card builder | `functions/src/marketplace/cards.ts`, `merge.ts`, `discount.ts`, `search-keywords.ts` |
| Store directory builder | `functions/src/stores/directory.ts` |
| One-time scripts | `functions/scripts/backfill-marketplace-cards.ts`, `functions/scripts/build-store-directory.ts` |
| Website Market API | `app/api/marketplace/products/route.ts`, `app/api/home/top-picks/route.ts` |
| Website card and directory helpers | `app/lib/marketplace-cards.ts`, `app/lib/store-directory.ts` |
| Website data functions and counters | `app/firebase.ts` |
| Sitemap and SEO | `app/sitemap.ts`, `app/lib/seo/products-server.ts`, `app/lib/seo/stores-server.ts` |
| App products and stores | `mobile/lib/features/marketplace/data/catalog_repository.dart`, `store_repository.dart` |
| App counters | `mobile/.../product_analytics_service.dart`, `shop_profile_screen.dart` |
| App speed timers | `mobile/lib/core/services/perf_trace.dart` |
| Per-day platform totals and per-seller order totals (admin Analytics, seller dashboards) | `functions/src/stats/platform-daily.ts`, `seller-stats.ts`, `increments.ts`; scripts `backfill-platform-daily-stats.ts`, `backfill-seller-stats.ts` |
| Paged lists (admin tables, seller orders) | `app/admin/_lib/use-paged-query.ts`, `admin-queries.ts`, `app/lib/merged-pager.ts`, `mobile/lib/core/data/paged_feed.dart` |
| Rules and indexes | `firestore.rules`, `firestore.indexes.json` |
| Website server region | `firebase.json` |
| Deploy steps | `docs/performance-rollout-2026-10.md` |
