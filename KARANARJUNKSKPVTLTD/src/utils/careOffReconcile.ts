// ─────────────────────────────────────────────────────────────────
//  Care-off → retailer matching & reconciliation (pure, no Firebase)
//
//  When a manufacturer (e.g. UNIMAX) ships to a retailer "on our behalf"
//  ("Care Off: NAME, VILLAGE"), that is a receivable from THAT retailer.
//  This module decides which existing retailer a care-off line belongs to
//  so the dry-run preview can show every match before anything is written.
//
//  Matching is deliberately conservative and EXPLAINABLE — it returns a
//  score + confidence + reason so a human reviews before money moves.
//  The hard cases this handles (from real data):
//    • "KSK" abbreviation  → "Krushi Seva Kendra"
//    • common suffixes ("Krushi Seva Kendra", "Agro", "Services") must NOT
//      inflate similarity — only the distinctive part of the name should
//    • village/taluka disambiguates same-named shops
// ─────────────────────────────────────────────────────────────────

/** Tokens that appear in almost every agri-shop name — weighted low so the
 *  distinctive part of the name drives the match. */
const COMMON_TOKENS = new Set([
  'krushi', 'seva', 'kendra', 'agro', 'agri', 'agency', 'agencies',
  'services', 'service', 'traders', 'trader', 'clinic', 'centre', 'center',
  'company', 'co', 'the', 'and',
]);

/** Location qualifier tokens to ignore when comparing villages. */
const PLACE_NOISE = new Set(['tal', 'taluka', 'dist', 'district', 'ta', 'po', 'ap', 'village', 'vil']);

/** Lowercase, expand the KSK abbreviation, strip punctuation, collapse spaces. */
export function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\bksk\b/g, 'krushi seva kendra')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(s: string): string[] {
  return normalize(s).split(' ').filter(Boolean);
}

function placeTokens(s: string): string[] {
  return normalize(s).split(' ').filter(t => t && !PLACE_NOISE.has(t));
}

const tokenWeight = (t: string): number => (COMMON_TOKENS.has(t) ? 0.2 : 1);

/** Jaccard similarity where common business-suffix tokens count for little. */
function weightedJaccard(a: string[], b: string[]): number {
  const sa = new Set(a), sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0, union = 0;
  new Set([...sa, ...sb]).forEach(t => {
    const w = tokenWeight(t);
    union += w;
    if (sa.has(t) && sb.has(t)) shared += w;
  });
  return union === 0 ? 0 : shared / union;
}

/** Plain Jaccard — used for village comparison. */
function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a), sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  sa.forEach(t => { if (sb.has(t)) inter++; });
  return inter / (sa.size + sb.size - inter);
}

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface RetailerLite {
  id: string;
  name: string;
  location?: string;
  atPost?: string;
  taluka?: string;
  district?: string;
  sourceRef?: string;
}

export interface MatchResult {
  retailerId: string | null;   // null → no confident match; propose a new retailer
  retailerName: string | null;
  score: number;               // 0..1 combined name+place
  confidence: Confidence;
  reason: string;
}

function retailerPlace(r: RetailerLite): string {
  return [r.location, r.atPost, r.taluka, r.district].filter(Boolean).join(' ');
}

export function classify(score: number): Confidence {
  if (score >= 0.75) return 'high';
  if (score >= 0.55) return 'medium';
  if (score >= 0.40) return 'low';
  return 'none';
}

/** Best-guess retailer for one care-off line. Name dominates (85%), village
 *  nudges (15%). Below the 'none' threshold we recommend creating a new retailer. */
export function matchRetailer(shopName: string, place: string, retailers: RetailerLite[]): MatchResult {
  const eName = nameTokens(shopName);
  const ePlace = placeTokens(place);

  let best: { r: RetailerLite; score: number; nameScore: number; placeScore: number } | null = null;
  for (const r of retailers) {
    const nameScore = weightedJaccard(eName, nameTokens(r.name));
    const placeScore = jaccard(ePlace, placeTokens(retailerPlace(r)));
    const score = nameScore * 0.85 + placeScore * 0.15;
    if (!best || score > best.score) best = { r, score, nameScore, placeScore };
  }

  if (!best) return { retailerId: null, retailerName: null, score: 0, confidence: 'none', reason: 'no retailers to match against' };

  const confidence = classify(best.score);
  if (confidence === 'none') {
    return { retailerId: null, retailerName: null, score: best.score, confidence, reason: 'no confident match — create new retailer' };
  }
  return {
    retailerId: best.r.id,
    retailerName: best.r.name,
    score: best.score,
    confidence,
    reason: `name ${Math.round(best.nameScore * 100)}% · village ${Math.round(best.placeScore * 100)}%`,
  };
}

export interface CareOffEntry {
  vchNo: string;   // manufacturer invoice no — unique idempotency key
  shopName: string;
  place: string;
  amount: number;
}

export interface ReconcileAction {
  vchNo: string;
  shopName: string;
  place: string;
  amount: number;
  match: MatchResult;
  proposedRetailerId: string | null; // null → create new retailer
  willCreateNew: boolean;
}

/** Build the dry-run plan: one proposed action per care-off line. No writes. */
export function buildReconcilePlan(entries: CareOffEntry[], retailers: RetailerLite[]): ReconcileAction[] {
  return entries.map(e => {
    const match = matchRetailer(e.shopName, e.place, retailers);
    return {
      vchNo: e.vchNo,
      shopName: e.shopName,
      place: e.place,
      amount: e.amount,
      match,
      proposedRetailerId: match.retailerId,
      willCreateNew: match.retailerId === null,
    };
  });
}

export function planSummary(actions: ReconcileAction[]) {
  return {
    total: actions.length,
    matched: actions.filter(a => !a.willCreateNew).length,
    newRetailers: actions.filter(a => a.willCreateNew).length,
    high: actions.filter(a => a.match.confidence === 'high').length,
    needsReview: actions.filter(a => a.match.confidence === 'medium' || a.match.confidence === 'low').length,
    totalAmount: actions.reduce((s, a) => s + a.amount, 0),
  };
}
