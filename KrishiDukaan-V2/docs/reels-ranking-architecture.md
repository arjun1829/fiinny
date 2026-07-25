# AgriReels — Ranking & Engagement Architecture

Status: **draft for review**. Nothing here is wired into production.

---

## 1. The objective function

The north star is **weekly-active farmers who place at least one order per month**.
Not raw watch time.

Watch time is a good *proxy* and a bad *target*. Optimising it directly is
Goodhart's law: the system will find whatever is most compulsive, and for an
agri-commerce marketplace that converges on clickbait, fake urgency, and
misleading price claims — which burns the trust the marketplace runs on.

So we optimise a composite:

```
value = predicted_engagement  ×  commercial_relevance  ×  quality_gate
```

| Layer | Meaning | Where it lives |
|---|---|---|
| `predicted_engagement` | Will they watch it / not swipe away | Learned from telemetry (§4) |
| `commercial_relevance` | Can they actually buy this, near them | Geo + availability signals |
| `quality_gate` | Hard filters: spam, dupes, moderation | Cloud, pre-ranking |

Metrics we actually track:

- **Primary:** D7 / D30 return rate, orders per active farmer per month
- **Engine:** reels per session, session length, 3-second hook rate, completion rate
- **Commercial:** reel → product CTR, product → order conversion

Engagement metrics are the engine. Commercial metrics are the steering. Ship
neither alone.

### A caution on content supply

No ranking algorithm rescues a small corpus. If the catalogue is a few hundred
reels, a farmer exhausts the good ones in two sessions and ranking quality is
irrelevant — the bottleneck is supply, not sorting.

**Answer this before building any of §3 onward:** how many reels exist today, and
how many are added per week? If the corpus is under ~500 with low weekly inflow,
seller-side content tooling (templates, reminders, bulk upload, incentives) will
move retention far more than a better ranker.

---

## 2. Cloud or phone?

**Both — and which one changes as you grow.** The staging below is driven by data
volume, not calendar time.

### Stage 1 — client-side heuristic (now, < ~1k DAU)

Ranking runs on the phone over a candidate pool. Cloud is used only to *log*.

- **Cost:** no Cloud Function invocations. Firestore reads only.
- **Why:** collaborative filtering needs global engagement data you do not have
  yet. A heuristic is not a compromise here — it is strictly better than an
  undertrained model, and it works from the first user.
- **Limit:** no cross-user learning, and weight changes need an app release —
  which is why weights come from Remote Config (§5), not from Dart constants.

### Stage 2 — cloud precompute + client rank (~1k–10k DAU)

A scheduled function precomputes per-region candidate pools and reel feature
vectors. The client still does final personalised ranking within its pool.

**This is the key cost lever.** Ranking on every feed open is one invocation per
open — 10k DAU × 5 opens/day = 50k invocations/day. Precomputing pools every 15
minutes is **96 invocations/day**, a ~500× reduction, and moves the expensive
aggregation off the request path so feed load gets *faster*, not slower.

### Stage 3 — full cloud ranking service (10k+ DAU)

Two-tower retrieval + a ranking model, feature store, A/B framework. Only worth
it once you have millions of watch events. Do not start here.

### Decision rule

> Compute on the phone what depends on **this user**.
> Compute in the cloud what depends on **all users**.

Geo distance, seen-state, personal affinity → phone.
Engagement rates, trending velocity, embeddings, moderation → cloud.

---

## 3. Folder structure

Designed so **adding a new signal is a new file, not a rewrite**.

### Mobile

```
mobile/lib/features/reels/
├── data/
│   ├── reels_repository.dart         # exists — Firestore CRUD
│   ├── reel_ranker.dart              # drafted — composite scorer
│   ├── ranking_context_builder.dart  # NEW — assembles viewer signals once
│   └── reel_telemetry.dart           # NEW — event capture, batched
│
├── domain/
│   ├── signals/                      # one file per signal, pluggable
│   │   ├── ranking_signal.dart       # the interface everything implements
│   │   ├── geo_signal.dart
│   │   ├── freshness_signal.dart
│   │   ├── engagement_signal.dart
│   │   ├── affinity_signal.dart
│   │   ├── commercial_signal.dart
│   │   ├── season_signal.dart
│   │   └── hook_rate_signal.dart     # future — needs telemetry first
│   │
│   ├── ranking_config.dart           # weights, hydrated from Remote Config
│   ├── feed_policy.dart              # diversity, exploration, pacing rules
│   └── experiment.dart               # A/B bucket assignment
│
├── providers/
│   ├── reels_provider.dart           # exists — feed assembly
│   └── ranking_provider.dart         # NEW — wires context + ranker
│
├── screens/
└── widgets/
```

### Cloud Functions

```
functions/src/reels/
├── telemetry/
│   ├── ingestEvents.ts        # batched watch-event writes
│   └── aggregateDaily.ts      # scheduled → reel_stats rollups
│
├── ranking/
│   ├── buildCandidatePools.ts # scheduled 15min → per-region pools
│   ├── computeReelFeatures.ts # engagement rate, velocity, hook rate
│   └── weights.ts             # served to clients via Remote Config
│
├── media/
│   ├── transcodeReel.ts       # faststart + right-size (see perf plan)
│   ├── generateHls.ts         # Stage 2+
│   └── generateThumbnail.ts   # fixes web uploads having no poster
│
└── moderation/
    └── screenReel.ts          # see §7 — plan it now, not later
```

### Firestore schema additions

| Collection | Purpose | Notes |
|---|---|---|
| `reel_events/{id}` | Raw telemetry | TTL 90d — never let this grow unbounded |
| `reel_stats/{reelId}` | Precomputed aggregates | Written by `aggregateDaily` |
| `user_affinity/{phone}` | Affinity vector | Precomputed, read once per session |
| `candidate_pools/{regionKey}` | Per-region pools | Stage 2 |

New fields on `reels/{id}`:

```
cropTags: string[]      // enables seasonScore — currently inert
language: string        // 'hi' | 'mr' | 'pa' — big relevance signal in India
durationSec: number     // needed for completion-rate maths
qualityScore: number    // cloud-computed, moderation + spam
moderationStatus: string
```

---

## 4. Telemetry — build this first

Today `incrementViewsCount` fires once per session per reel. That is the entire
dataset, and it cannot support tuning, let alone learning.

Four events, batched and flushed on feed exit (never one write per event — that
is both slow and expensive):

```
reel_impression  { reelId, position, timestamp, sessionId }
reel_watch       { reelId, watchedMs, durationMs, completionPct, loops }
reel_action      { reelId, type: like|comment|share|follow|product_click }
reel_exit        { reelId, watchedMs, exitType: swipe|back|background }
```

The single most valuable derived metric is **3-second hook rate** — the fraction
of impressions still watching at 3s. It predicts retention better than any other
single number, and it is what tells you which sellers make content worth pushing.

**Batch writes.** 50 reels/session × 4 events = 200 writes/session at ~$0.18/100k
would be ruinous. Batch into one document per session: 1 write, not 200.

---

## 5. Remote Config for weights

Weights must **not** be Dart constants. Ship them via Firebase Remote Config so
tuning does not require an app release and a week of store review:

```json
{
  "reel_weights": {
    "geo": 0.30, "freshness": 0.20, "affinity": 0.20,
    "engagement": 0.15, "commercial": 0.10, "season": 0.05
  },
  "reel_exploration_rate": 0.17,
  "reel_candidate_pool_size": 150
}
```

This also gives A/B testing nearly free — Remote Config supports percentage
rollouts natively, so you can run weight variants against real retention data.

---

## 6. Legitimate engagement mechanics

Ranked by expected impact:

1. **Fix playback latency first.** 9s → sub-1.5s. Nothing else on this list
   matters if people bounce before frame one. This is not a ranking problem.
2. **Rank by hook rate** once telemetry lands — directly optimises "don't swipe."
3. **Session pacing.** Do not front-load every best reel; interleave strong and
   exploratory so the session has somewhere to go.
4. **Notification loop.** "New reel from [shop you follow]" — the single biggest
   D7 retention lever on most content apps.
5. **Seller content tooling.** Supply-side. See §1's caution.
6. **Seasonal push.** Sowing-season reels are genuinely urgent to a farmer, which
   is an engagement advantage Instagram structurally does not have. Lean on it.

---

## 7. Moderation — plan the hook now

Pushing UGC video hard means spam, misleading agri-chemical claims, and
off-platform contact scraping. Retrofitting moderation into a live feed is far
more painful than leaving the hook in place from day one.

Minimum viable: `moderationStatus` field defaulting to `pending`, a cheap
auto-approve path, and a ranking filter that excludes anything flagged. Even if a
human reviews nothing on day one, the field and filter should exist.

Note that misleading pesticide/fertiliser claims carry real regulatory exposure
in India, which makes this a business risk and not only a content-quality issue.

---

## 8. Sequencing

| Phase | Work | Blocks |
|---|---|---|
| **0** | Video speed: faststart, right-size, poster, prefetch | Everything |
| **1** | Telemetry: events + batching + `reel_stats` | All tuning |
| **2** | Wire ranker, weights via Remote Config | — |
| **3** | Add `cropTags` + `language`; activate inert signals | Phase 1 |
| **4** | Cloud precompute: candidate pools, features | ~1k DAU |
| **5** | Hook-rate signal, notification loop, A/B | Phase 1 data |
| **6** | Learned model | Millions of events |

**Phase 0 before Phase 1 is not negotiable.** Collecting engagement telemetry
while playback takes 9 seconds produces a dataset that measures *patience*, not
content quality — and every weight you later tune on it will be wrong.
