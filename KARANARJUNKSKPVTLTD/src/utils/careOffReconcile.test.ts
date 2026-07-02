import { describe, it, expect } from 'vitest';
import {
  normalize, matchRetailer, classify, buildReconcilePlan, planSummary,
  type RetailerLite, type CareOffEntry,
} from './careOffReconcile';

// Existing retailers (the real ones already in the worklist)
const RETAILERS: RetailerLite[] = [
  { id: 'r1', name: 'Dongare Patil Agro', atPost: 'Patoda', taluka: 'Yewala' },
  { id: 'r2', name: 'Kisan Agro Traders', location: 'Kokamthan Kopargaon' },
  { id: 'r3', name: 'Yogesh Krushi Seva Kendra', location: 'Gangadhari' },
  { id: 'r4', name: 'Bhos Krushi Seva Kendra', location: 'Ruichattishi' },
];

describe('normalize', () => {
  it('expands the KSK abbreviation', () => {
    expect(normalize('Yogesh KSK')).toBe('yogesh krushi seva kendra');
  });
  it('strips punctuation and collapses whitespace', () => {
    expect(normalize('  SHRI SAI-RAM, KSK.  ')).toBe('shri sai ram krushi seva kendra');
  });
});

describe('classify thresholds', () => {
  it('maps scores to confidence bands', () => {
    expect(classify(0.9)).toBe('high');
    expect(classify(0.6)).toBe('medium');
    expect(classify(0.45)).toBe('low');
    expect(classify(0.2)).toBe('none');
  });
});

describe('matchRetailer — merges variants of the same shop', () => {
  it('matches "DONGARE PATIL AGRO SERVICES" to existing "Dongare Patil Agro" (extra suffix ignored)', () => {
    const m = matchRetailer('DONGARE PATIL AGRO SERVICES', 'PATODA TAL-YEWALA', RETAILERS);
    expect(m.retailerId).toBe('r1');
    expect(m.confidence).toBe('high');
  });

  it('matches exact name with partial village', () => {
    const m = matchRetailer('KISAN AGRO TRADERS', 'KOKAMTHAN', RETAILERS);
    expect(m.retailerId).toBe('r2');
    expect(m.confidence).toBe('high');
  });

  it('matches "YOGESH KSK" to "Yogesh Krushi Seva Kendra" via abbreviation expansion', () => {
    const m = matchRetailer('YOGESH KSK', 'GANGADHARI TAL-NANDGAON', RETAILERS);
    expect(m.retailerId).toBe('r3');
    expect(m.confidence).toBe('high');
  });
});

describe('matchRetailer — does NOT false-match on common suffixes', () => {
  it('"PARAHIT KRUSHI SEVA KENDRA" with no distinctive overlap → create new', () => {
    const m = matchRetailer('PARAHIT KRUSHI SEVA KENDRA', 'CHAKHALAMBA', RETAILERS);
    expect(m.retailerId).toBeNull();
    expect(m.confidence).toBe('none');
  });

  it('a brand-new shop returns no match', () => {
    const m = matchRetailer('KRUSHIDEEPAK KRUSHI SEVA KENDRA', 'KOPARGAON', RETAILERS);
    expect(m.retailerId).toBeNull();
  });
});

describe('matchRetailer — village disambiguates', () => {
  it('shared distinctive name + matching village beats name-only', () => {
    const both: RetailerLite[] = [
      { id: 'a', name: 'Bhos Krushi Seva Kendra', location: 'Ruichattishi' },
      { id: 'b', name: 'Bhos Agro Agency', location: 'Ruichattishi' },
    ];
    const m = matchRetailer('BHOS KRUSHI SEVA KENDRA', 'RUICHATTISHI', both);
    expect(m.retailerId).toBe('a');
    expect(m.confidence).toBe('high');
  });
});

describe('buildReconcilePlan + planSummary', () => {
  const entries: CareOffEntry[] = [
    { vchNo: 'UAB/1696/25-26', shopName: 'DONGARE PATIL AGRO', place: 'PATODA TAL-YEWALA', amount: 22220 },
    { vchNo: 'UAB/1718/25-26', shopName: 'YOGESH KRUSHI SEVA KENDRA', place: 'GANGADHARI NADGAON', amount: 23600 },
    { vchNo: 'UAB/1607/25-26', shopName: 'PARAHIT KRUSHI SEVA KENDRA', place: 'CHAKHALAMBA', amount: 18880 },
  ];

  it('produces one action per entry with matches and new-retailer flags', () => {
    const plan = buildReconcilePlan(entries, RETAILERS);
    expect(plan).toHaveLength(3);
    expect(plan[0].proposedRetailerId).toBe('r1');
    expect(plan[1].proposedRetailerId).toBe('r3');
    expect(plan[2].willCreateNew).toBe(true);
  });

  it('summarises matched vs new and totals the amount', () => {
    const s = planSummary(buildReconcilePlan(entries, RETAILERS));
    expect(s.total).toBe(3);
    expect(s.matched).toBe(2);
    expect(s.newRetailers).toBe(1);
    expect(s.totalAmount).toBe(64700);
  });

  it('is deterministic — same inputs, same plan', () => {
    const a = buildReconcilePlan(entries, RETAILERS);
    const b = buildReconcilePlan(entries, RETAILERS);
    expect(a).toEqual(b);
  });
});
