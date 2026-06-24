import { describe, it, expect } from 'vitest';
import {
  isBalanced, entryTotals, validateJournalEntry, makeIdempotencyKey,
  computeAccountDeltas, agingBucketFor, daysOverdue,
  buildInvoiceJournal, buildBillJournal, buildReceiptJournal,
  buildVendorPaymentJournal, buildCreditNoteJournal, buildWriteOffJournal,
  buildOpeningBalanceJournal, dr, cr,
} from './ledgerCore';

// ─── Balancing invariant: every builder must produce a balanced entry ────────

describe('posting builders are always balanced (Σdebit = Σcredit)', () => {
  it('invoice with GST', () => {
    const e = buildInvoiceJournal({ accountId: 'acc1', date: '2026-06-18', sourceId: 'inv1', taxable: 1000, gstOutput: 50 });
    expect(isBalanced(e.lines)).toBe(true);
    expect(entryTotals(e.lines)).toEqual({ debit: 1050, credit: 1050 });
  });

  it('invoice with 0% GST drops the zero GST line but stays balanced', () => {
    const e = buildInvoiceJournal({ accountId: 'acc1', date: '2026-06-18', sourceId: 'inv2', taxable: 800, gstOutput: 0 });
    expect(e.lines).toHaveLength(2); // AR + Sales only
    expect(isBalanced(e.lines)).toBe(true);
  });

  it('bill (payable) to inventory', () => {
    const e = buildBillJournal({ accountId: 'sup1', date: '2026-06-18', sourceId: 'bill1', taxable: 2000, gstInput: 100, toInventory: true });
    expect(isBalanced(e.lines)).toBe(true);
    expect(e.lines.find(l => l.glAccount === 'INVENTORY')?.debit).toBe(2000);
  });

  it('receipt, vendor payment, credit note, write-off, opening balance', () => {
    expect(isBalanced(buildReceiptJournal({ accountId: 'a', date: '2026-06-18', sourceId: 'p1', amount: 500 }).lines)).toBe(true);
    expect(isBalanced(buildVendorPaymentJournal({ accountId: 'a', date: '2026-06-18', sourceId: 'p2', amount: 700 }).lines)).toBe(true);
    expect(isBalanced(buildCreditNoteJournal({ accountId: 'a', date: '2026-06-18', sourceId: 'cn1', taxable: 300, gstOutput: 15 }).lines)).toBe(true);
    expect(isBalanced(buildWriteOffJournal({ accountId: 'a', date: '2026-06-18', sourceId: 'w1', amount: 250 }).lines)).toBe(true);
    expect(isBalanced(buildOpeningBalanceJournal({ accountId: 'a', date: '2026-06-18', ar: 1234.56, ap: 99.99 }).lines)).toBe(true);
  });

  it('float dust from GST splits stays within epsilon', () => {
    // 5% on 12.5 = 0.625 → rounds; entry must still balance
    const e = buildInvoiceJournal({ accountId: 'a', date: '2026-06-18', sourceId: 'inv3', taxable: 12.5, gstOutput: 0.63 });
    expect(isBalanced(e.lines)).toBe(true);
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe('validateJournalEntry', () => {
  it('accepts a balanced two-line entry', () => {
    const r = validateJournalEntry({
      date: '2026-06-18', type: 'adjustment', sourceType: 't', sourceId: 'x',
      lines: [dr('CASH', 100), cr('SALES', 100)],
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects an unbalanced entry', () => {
    const r = validateJournalEntry({
      date: '2026-06-18', type: 'adjustment', sourceType: 't', sourceId: 'x',
      lines: [dr('CASH', 100), cr('SALES', 90)],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('not balanced'))).toBe(true);
  });

  it('rejects a line with both a debit and a credit', () => {
    const r = validateJournalEntry({
      date: '2026-06-18', type: 'adjustment', sourceType: 't', sourceId: 'x',
      lines: [{ glAccount: 'CASH', debit: 50, credit: 50 }, cr('SALES', 50)],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('both a debit and a credit'))).toBe(true);
  });

  it('rejects an AR line without an accountId', () => {
    const r = validateJournalEntry({
      date: '2026-06-18', type: 'invoice', sourceType: 't', sourceId: 'x',
      lines: [dr('AR', 100), cr('SALES', 100)], // AR has no party
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('requires an accountId'))).toBe(true);
  });

  it('rejects a single-line entry', () => {
    const r = validateJournalEntry({
      date: '2026-06-18', type: 'adjustment', sourceType: 't', sourceId: 'x',
      lines: [dr('CASH', 100)],
    });
    expect(r.valid).toBe(false);
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe('idempotency keys are deterministic', () => {
  it('same source + type yields the same key every time', () => {
    const k1 = makeIdempotencyKey('invoice', 'inv1', 'invoice');
    const k2 = makeIdempotencyKey('invoice', 'inv1', 'invoice');
    expect(k1).toBe(k2);
    expect(k1).toBe('invoice:inv1:invoice');
  });

  it('builders auto-derive a stable key', () => {
    const a = buildInvoiceJournal({ accountId: 'acc1', date: '2026-06-18', sourceId: 'inv9', taxable: 100 });
    const b = buildInvoiceJournal({ accountId: 'acc1', date: '2026-06-18', sourceId: 'inv9', taxable: 100 });
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
  });

  it('different events get different keys', () => {
    expect(makeIdempotencyKey('payment', 'p1', 'receipt'))
      .not.toBe(makeIdempotencyKey('payment', 'p1', 'vendor_payment'));
  });
});

// ─── Balance deltas ──────────────────────────────────────────────────────────

describe('computeAccountDeltas', () => {
  it('invoice raises customer AR by the invoice total', () => {
    const e = buildInvoiceJournal({ accountId: 'acc1', date: '2026-06-18', sourceId: 'inv1', taxable: 1000, gstOutput: 50 });
    const { partyDeltas, glDeltas } = computeAccountDeltas(e);
    expect(partyDeltas['acc1'].ar).toBe(1050);
    expect(glDeltas.SALES).toBe(1000);     // income up
    expect(glDeltas.GST_OUTPUT).toBe(50);  // liability up
    expect(glDeltas.AR).toBe(1050);        // asset up
  });

  it('receipt lowers customer AR', () => {
    const e = buildReceiptJournal({ accountId: 'acc1', date: '2026-06-18', sourceId: 'p1', amount: 400 });
    const { partyDeltas, glDeltas } = computeAccountDeltas(e);
    expect(partyDeltas['acc1'].ar).toBe(-400);
    expect(glDeltas.CASH).toBe(400);
  });

  it('bill raises vendor AP; vendor payment lowers it', () => {
    const bill = computeAccountDeltas(buildBillJournal({ accountId: 'sup1', date: '2026-06-18', sourceId: 'b1', taxable: 2000, gstInput: 100 }));
    expect(bill.partyDeltas['sup1'].ap).toBe(2100);
    const pay = computeAccountDeltas(buildVendorPaymentJournal({ accountId: 'sup1', date: '2026-06-18', sourceId: 'p2', amount: 500 }));
    expect(pay.partyDeltas['sup1'].ap).toBe(-500);
  });

  it('invoice then receipt nets to the open balance', () => {
    const inv = computeAccountDeltas(buildInvoiceJournal({ accountId: 'acc1', date: '2026-06-18', sourceId: 'i', taxable: 1000, gstOutput: 0 }));
    const rec = computeAccountDeltas(buildReceiptJournal({ accountId: 'acc1', date: '2026-06-19', sourceId: 'r', amount: 600 }));
    const net = inv.partyDeltas['acc1'].ar + rec.partyDeltas['acc1'].ar;
    expect(net).toBe(400);
  });
});

// ─── Aging ────────────────────────────────────────────────────────────────────

describe('agingBucketFor', () => {
  const asOf = '2026-06-18';
  it('not-yet-due is current', () => {
    expect(agingBucketFor('2026-06-30', asOf)).toBe('current');
    expect(agingBucketFor('2026-06-18', asOf)).toBe('current');
  });
  it('buckets by days overdue', () => {
    expect(agingBucketFor('2026-06-01', asOf)).toBe('1-30');   // 17 days
    expect(agingBucketFor('2026-05-10', asOf)).toBe('31-60');  // 39 days
    expect(agingBucketFor('2026-04-01', asOf)).toBe('61-90');  // 78 days
    expect(agingBucketFor('2026-01-01', asOf)).toBe('90+');    // 168 days
  });
  it('daysOverdue is negative before the due date', () => {
    expect(daysOverdue('2026-06-28', asOf)).toBeLessThan(0);
  });
});

// ─── Spot-check explicit double-entry shape ──────────────────────────────────

describe('invoice entry shape', () => {
  it('debits AR (party) and credits Sales + Output GST', () => {
    const e = buildInvoiceJournal({ accountId: 'acc1', date: '2026-06-18', sourceId: 'inv1', taxable: 1000, gstOutput: 180 });
    const arLine = e.lines.find(l => l.glAccount === 'AR');
    expect(arLine?.debit).toBe(1180);
    expect(arLine?.accountId).toBe('acc1');
    expect(e.lines.find(l => l.glAccount === 'SALES')?.credit).toBe(1000);
    expect(e.lines.find(l => l.glAccount === 'GST_OUTPUT')?.credit).toBe(180);
  });
});
