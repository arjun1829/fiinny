# KrishiDukan Analytics

Standalone web app for KrishiDukan analytics. It reuses the existing **FinERP UAT**
Firebase project (`finny-erp-uat`) for Authentication, Firestore, and Hosting —
**no new Firebase project is created**. It is fully separate from the main FinERP
ERP app (`KARANARJUNKSKPVTLTD`) and from `KrishiDukaan-V2`.

> **Note on the project id:** it is `finny-erp-uat` (single "i"), which is the UAT
> alias of the ERP app (see `KARANARJUNKSKPVTLTD/.firebaserc`).

> **Phase 2 (current):** monthly Demographic Analytics CSV import + dashboard
> (overview cards, sortable city table, geographic bubble map, cross-month
> trends). No Firebase Analytics API is used — the uploaded monthly CSV is the
> sole source of truth.

## Stack

Vite + React 19 + TypeScript + Firebase Web SDK v12 (same stack as `../admin`),
plus `recharts` (trends) and `react-leaflet`/`leaflet` (map). Tests: `vitest`.

## Monthly report workflow

1. Click **Upload Monthly Report** (super-admin only).
2. Pick the GA4 **Demographic details: City** CSV export for one month.
3. Confirm the report month (auto-detected from the CSV header when possible).
4. Review validation + a preview, then **Import**. Re-uploading a month is
   detected and requires an explicit **Replace & Import** confirmation (old rows
   are deleted first — never silently duplicated).

### CSV columns

Required: `Town/City`, `Active users`, `New users`, `Engaged sessions`,
`Engagement rate`, `Engaged sessions per active user`,
`Average engagement time per active user`, `Event count`, `Key events`,
`User key event rate`. `Total revenue` is ignored. GA4 comment lines and a
trailing blank-city totals row are skipped. `(not set)` is kept as real usage
but handled separately from actual cities (never mapped).

### Stored schema

`analytics/demographicReports/months/{YYYY-MM}` holds `{ month, label, category,
rowCount, totals, source, uploadedBy, uploadedAt, schemaVersion }`; each
`.../rows/{citySlug}` holds the normalized metrics + `month` + `isNotSet`.
Aggregated `totals` (counts summed, rates/time active-user-weighted) are stored
on the month doc so trends/overview don't re-read every row.

## Time periods & All Time

The primary nav is time-period based, generated dynamically from the months
actually in Firestore (never hardcoded): **All Time** (default, first) → each
uploaded month → **Trends**.

**All Time** loads every month's rows, groups them by normalized city, and
aggregates: additive metrics (New Users, Engaged Sessions, Event Count, Key
Events) are summed; derived metrics are **recomputed from aggregated
numerators/denominators**, never by averaging monthly percentages
(`aggregateCitiesAcrossMonths` / `computeExactTotals` in `src/lib/demographics.ts`):
- Engagement Rate = Σ engaged sessions ÷ Σ sessions (sessions reconstructed per
  month from `engagedSessions / engagementRate`).
- Engaged Sessions / Active User = Σ engaged sessions ÷ Σ active users.
- Avg Engagement Time = active-user-weighted mean.
- User Key Event Rate = Σ(rate × active users) ÷ Σ active users.

> Active Users for All Time is the **sum of monthly active-user counts, not
> unique users** (the CSVs carry no user ids) — the overview card is labelled
> accordingly.

A single shared **Metric** selector drives both the City Distribution ranking and
the map bubble sizes, for a month or All Time.

## Geographic level (State / City)

A **Geographic level** selector (default **State**) switches the City Distribution
table and the map between per-city and per-state views:

- **State mode** aggregates cities into their state (additive metrics summed;
  rates/time recomputed from aggregated numerators/denominators — never averaged),
  one bubble per state at the mean of its member-city coordinates. Clicking a
  state shows its metrics and a **View cities in …** drill-down; a **← Back to
  States** control returns. (The Active Users "aggregate, not unique" caveat still
  applies.)
- **City mode** shows the individual city bubbles.

State comes from Google's **structured address components** —
`administrative_area_level_1` (never parsed from the formatted string) — captured
during the same one-time geocode and cached alongside the coordinates
(`state`, `country` added to `analytics/demographicReports/cityGeo/{slug}`).
Well-known cities carry their state in the in-code gazetteer, so they need no
geocoding at all. Cities Google can't resolve to a state collapse into a single
**Unknown** group (never guessed, never plotted); `(not set)` remains separate and
non-geographic. Coordinate resolution + geocode caching live in
`src/hooks/useCityLocations.ts`.

## City analytics map

Uses the **Google Maps JavaScript API** (bubbles) with the **Geocoding API**
(`google.maps.Geocoder`) as a coordinate fallback. Reuses the existing Maps key
from KrishiDukaan-V2 via `VITE_GOOGLE_MAPS_API_KEY` in `.env` — no new key.

- Each city is one aggregated **bubble** (a pixel-sized map marker, not a
  ground-distance circle) at the city centre — never user locations. Radius uses
  **square-root scaling** normalized to the dataset max, min ~6px / **hard max
  ~30px**, with transparency + borders so overlapping cities stay distinct.
- Default viewport is **India-focused** (fixed centre + zoom); the map does not
  auto-refit to cities on every render. Users pan/zoom freely.
- Clicking a bubble opens an info panel with the city's full metric set.
- `(not set)` is never plotted — summarised separately in the side panel.
- Coordinates resolve cheapest-first: in-code **gazetteer** (`src/lib/geo.ts`) →
  Firestore cache (`analytics/demographicReports/cityGeo/{slug}`) → one-time
  **geocode**, written back to the cache. A city is geocoded at most once, ever.
- `React.lazy`-loaded, so the Maps bundle only downloads for a period view
  (never on the Trends tab).

## Running tests

```bash
npm test     # vitest: CSV parsing, validation, aggregation, month helpers
```

## Firebase project

| | |
|---|---|
| Project ID | `finny-erp-uat` (the FinERP UAT project) |
| Auth | Firebase Auth (Google provider), shared with the UAT project |
| Firestore | shared `(default)` database, `analytics/**` namespace only |
| Hosting site | `finny-erp-uat-analytics` (target `analytics`) |

Public client config lives in `.env` (committed — these are public web values, the
same ones as `KARANARJUNKSKPVTLTD/.env.uat`). Override locally with `.env.local`.

## Auth & authorization

- Uses the existing Firebase Auth on the UAT project — no second auth system.
- A user must be **signed in** and be a **platform super admin** to see anything.
  This mirrors the ERP project's `isSuperAdmin()` rule: either a master-tenant
  admin/analyst (`users/{uid}` with `tenantId == 'master'` and role in
  admin/analyst/master), or the `superadmin@fiinny.com` account.
- The client gate (`src/auth/AuthGate.tsx`) is UX only. Real enforcement is the
  Firestore rule on `analytics/**` (super-admin only), maintained in
  `../KARANARJUNKSKPVTLTD/firestore.rules`.

## Firestore namespace

Everything is under one isolated tree; business collections are never touched:

```
analytics/{category}/months/{YYYY-MM}/rows/{rowId}
  e.g. analytics/demographicReports/months/2026-09/rows/{rowId}
```

Path helpers: `src/lib/analyticsPaths.ts`.

## Run locally

```bash
cd krishidukan-analytics
npm install
npm run dev          # http://localhost:5173
```

Sign in with a Google account that is a platform super admin on `finny-erp-uat`.

> One-time: ensure the dev origin (`localhost`) is listed under
> Firebase Auth → Settings → Authorized domains for `finny-erp-uat`
> (`localhost` is allow-listed by default).

## Deploy (independent from the ERP app)

This app has its own `firebase.json` / `.firebaserc` and declares **hosting only**,
so deploying it can never overwrite the shared Firestore rules, indexes, or
Cloud Functions.

One-time setup (requires `firebase login` with access to the UAT project):

```bash
# create the dedicated hosting site (only if it does not exist yet)
firebase hosting:sites:create finny-erp-uat-analytics --project finny-erp-uat
# the target->site mapping is already in .firebaserc; to (re)apply it:
firebase target:apply hosting analytics finny-erp-uat-analytics --project finny-erp-uat
```

Build & deploy:

```bash
npm run deploy
# == npm run build && firebase deploy --only hosting:analytics --project finny-erp-uat
```

Deployed URL: `https://finny-erp-uat-analytics.web.app`.

The main ERP app (`KARANARJUNKSKPVTLTD`) deploys from its own folder and is unaffected.

## Configuration / security notes

- `.env` holds only **public** Firebase web config — no secrets.
- Access control = Firebase Auth + the super-admin-only `analytics/**` Firestore
  rule. The CSV upload path (later phase) must also be super-admin-gated.
- Never run a full `firebase deploy` from this folder; use the `hosting:analytics`
  target. Firestore rule changes belong in `KARANARJUNKSKPVTLTD` and deploy from
  there (that project owns the `finny-erp-uat` rules).
- `robots` meta is set to `noindex` since this is an internal dashboard.
