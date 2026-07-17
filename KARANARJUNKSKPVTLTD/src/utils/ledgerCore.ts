// ─────────────────────────────────────────────────────────────────
//  Ledger core — pure double-entry engine (no Firebase deps)
//
//  This is the single source of truth for the double-entry rules:
//  chart of accounts, entry validation, balance deltas, idempotency,
//  and the posting "builders" that encode how each business event maps
//  to debits/credits. The Cloud Function `postJournal` wraps these in a
//  Firestore transaction — but the rules live here so they can be unit
//  tested with vitest (see ledgerCore.test.ts).
// ─────────────────────────────────────────────────────────────────

import { round2 } from './gstCalculator';
import type {
  GLAccountId, GLAccountDef, JournalLine, JournalEntryInput,
  JournalEntryType, AgingBucket, PartyDeltas,
} from '../types/finance';

// ─── Chart of accounts ──────────────────────────────────────────────────────

export const CHART_OF_ACCOUNTS: Record<GLAccountId, GLAccountDef> = {
  AR:             { code: 'AR',             name: 'Accounts Receivable',     type: 'asset',     normalBalance: 'debit'  },
  AP:             { code: 'AP',             name: 'Accounts Payable',        type: 'liability', normalBalance: 'credit' },
  CASH:           { code: 'CASH',           name: 'Cash & Bank',             type: 'asset',     normalBalance: 'debit'  },
  SALES:          { code: 'SALES',          name: 'Sales Revenue',           type: 'income',    normalBalance: 'credit' },
  PURCHASES:      { code: 'PURCHASES',      name: 'Purchases / COGS',        type: 'expense',   normalBalance: 'debit'  },
  INVENTORY:      { code: 'INVENTORY',      name: 'Inventory',               type: 'asset',     normalBalance: 'debit'  },
  GST_OUTPUT:     { code: 'GST_OUTPUT',     name: 'Output GST Payable',      type: 'liability', normalBalance: 'credit' },
  GST_INPUT:      { code: 'GST_INPUT',      name: 'Input GST Credit',        type: 'asset',     normalBalance: 'debit'  },
  DISCOUNTS:      { code: 'DISCOUNTS',      name: 'Discounts & Promotions',  type: 'expense',   normalBalance: 'debit'  },
  DISPUTES:       { code: 'DISPUTES',       name: 'Disputes / Deductions',   type: 'asset',     normalBalance: 'debit'  },
  WRITEOFF:       { code: 'WRITEOFF',       name: 'Bad Debt Write-off',      type: 'expense',   normalBalance: 'debit'  },
  OPENING_EQUITY: { code: 'OPENING_EQUITY', name: 'Opening Balance Equity',  type: 'equity',    normalBalance: 'credit' },
};

/** GL accounts that carry a per-party sub-ledger and therefore require `accountId`. */
const PARTY_ACCOUNTS: ReadonlySet<GLAccountId> = new Set<GLAccountId>(['AR', 'AP']);

/** Default rounding tolerance for "balanced" — guards float dust from GST splits. */
export const BALANCE_EPSILON = 0.01;

// ─── Line construction helpers ──────────────────────────────────────────────

/** Debit line. */
export function dr(glAccount: GLAccountId, amount: number, accountId?: string | null, description?: string): JournalLine {
  return { glAccount, accountId: accountId ?? null, debit: round2(amount), credit: 0, description };
}

/** Credit line. */
export function cr(glAccount: GLAccountId, amount: number, accountId?: string | null, description?: string): JournalLine {
  return { glAccount, accountId: accountId ?? null, debit: 0, credit: round2(amount), description };
}

/** Drop zero-value lines (e.g. a 0% GST line) so entries stay clean. */
function nonZero(lines: JournalLine[]): JournalLine[] {
  return lines.filter(l => round2(l.debit) !== 0 || round2(l.credit) !== 0);
}

// ─── Totals / validation ────────────────────────────────────────────────────

export function entryTotals(lines: JournalLine[]): { debit: number; credit: number } {
  return {
    debit: round2(lines.reduce((s, l) => s + (l.debit || 0), 0)),
    credit: round2(lines.reduce((s, l) => s + (l.credit || 0), 0)),
  };
}

export function isBalanced(lines: JournalLine[], epsilon = BALANCE_EPSILON): boolean {
  const { debit, credit } = entryTotals(lines);
  return Math.abs(debit - credit) <= epsilon;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a journal entry before posting:
 *  - at least 2 lines, balanced within epsilon
 *  - each line carries exactly one positive side (debit XOR credit)
 *  - AR / AP lines must name a party (`accountId`)
 */
export function validateJournalEntry(input: JournalEntryInput): ValidationResult {
  const errors: string[] = [];
  const lines = input.lines || [];

  if (lines.length < 2) errors.push('Entry must have at least two lines.');

  lines.forEach((l, i) => {
    const d = l.debit || 0, c = l.credit || 0;
    if (d < 0 || c < 0) errors.push(`Line ${i + 1}: amounts cannot be negative.`);
    if (d > 0 && c > 0) errors.push(`Line ${i + 1}: a line cannot have both a debit and a credit.`);
    if (round2(d) === 0 && round2(c) === 0) errors.push(`Line ${i + 1}: amount is zero.`);
    if (PARTY_ACCOUNTS.has(l.glAccount) && !l.accountId) {
      errors.push(`Line ${i + 1}: ${l.glAccount} line requires an accountId (party).`);
    }
  });

  if (lines.length >= 2 && !isBalanced(lines)) {
    const { debit, credit } = entryTotals(lines);
    errors.push(`Entry is not balanced: debit ${debit} ≠ credit ${credit}.`);
  }

  return { valid: errors.length === 0, errors };
}

// ─── Idempotency ────────────────────────────────────────────────────────────

/**
 * Deterministic key so re-posting the same source event is a no-op.
 * Same (sourceType, sourceId, type) → same key, always.
 */
export function makeIdempotencyKey(sourceType: string, sourceId: string, type: JournalEntryType): string {
  return `${sourceType}:${sourceId}:${type}`;
}

/** Attach a derived idempotency key if the caller didn't supply one. */
export function withIdempotencyKey(input: JournalEntryInput): JournalEntryInput & { idempotencyKey: string } {
  return {
    ...input,
    idempotencyKey: input.idempotencyKey || makeIdempotencyKey(input.sourceType, input.sourceId, input.type),
  };
}

// ─── Balance deltas (for materializing glAccounts + party balances) ─────────

export interface AccountDeltas {
  /** Change to each GL account expressed in its *natural* balance direction. */
  glDeltas: Partial<Record<GLAccountId, number>>;
  /** Change to each party's AR / AP balances, keyed by accountId. */
  partyDeltas: Record<string, PartyDeltas>;
}

/**
 * Compute how a single entry moves GL and party balances.
 * GL: debit-normal accounts move by (debit − credit), credit-normal by (credit − debit).
 * Party AR: (debit − credit) on AR lines (customer owes more on a debit).
 * Party AP: (credit − debit) on AP lines (we owe more on a credit).
 */
export function computeAccountDeltas(input: JournalEntryInput): AccountDeltas {
  const glDeltas: Partial<Record<GLAccountId, number>> = {};
  const partyDeltas: Record<string, PartyDeltas> = {};

  for (const l of input.lines) {
    const def = CHART_OF_ACCOUNTS[l.glAccount];
    const signed = def.normalBalance === 'debit'
      ? (l.debit - l.credit)
      : (l.credit - l.debit);
    glDeltas[l.glAccount] = round2((glDeltas[l.glAccount] || 0) + signed);

    if (l.accountId && PARTY_ACCOUNTS.has(l.glAccount)) {
      const pd = partyDeltas[l.accountId] || { ar: 0, ap: 0 };
      if (l.glAccount === 'AR') pd.ar = round2(pd.ar + (l.debit - l.credit));
      if (l.glAccount === 'AP') pd.ap = round2(pd.ap + (l.credit - l.debit));
      partyDeltas[l.accountId] = pd;
    }
  }

  return { glDeltas, partyDeltas };
}

// ─── Posting builders — one per business event ──────────────────────────────

interface InvoiceArgs { accountId: string; date: string; sourceId: string; taxable: number; gstOutput?: number; memo?: string; }
/** Customer/retailer invoice: Dr AR / Cr Sales + Cr Output GST. */
export function buildInvoiceJournal(a: InvoiceArgs): JournalEntryInput {
  const gst = round2(a.gstOutput || 0);
  const total = round2(a.taxable + gst);
  return withIdempotencyKey({
    date: a.date, type: 'invoice', sourceType: 'invoice', sourceId: a.sourceId, partyId: a.accountId, memo: a.memo,
    lines: nonZero([
      dr('AR', total, a.accountId, 'Invoice total'),
      cr('SALES', a.taxable, null, 'Taxable value'),
      cr('GST_OUTPUT', gst, null, 'Output GST'),
    ]),
  });
}

interface BillArgs { accountId: string; date: string; sourceId: string; taxable: number; gstInput?: number; toInventory?: boolean; memo?: string; }
/** Vendor bill (payable): Dr Inventory|Purchases + Dr Input GST / Cr AP. */
export function buildBillJournal(a: BillArgs): JournalEntryInput {
  const gst = round2(a.gstInput || 0);
  const total = round2(a.taxable + gst);
  return withIdempotencyKey({
    date: a.date, type: 'bill', sourceType: 'bill', sourceId: a.sourceId, partyId: a.accountId, memo: a.memo,
    lines: nonZero([
      dr(a.toInventory ? 'INVENTORY' : 'PURCHASES', a.taxable, null, 'Goods value'),
      dr('GST_INPUT', gst, null, 'Input GST'),
      cr('AP', total, a.accountId, 'Bill total'),
    ]),
  });
}

interface ReceiptArgs { accountId: string; date: string; sourceId: string; amount: number; memo?: string; }
/** Money received from a customer: Dr Cash / Cr AR. */
export function buildReceiptJournal(a: ReceiptArgs): JournalEntryInput {
  return withIdempotencyKey({
    date: a.date, type: 'receipt', sourceType: 'payment', sourceId: a.sourceId, partyId: a.accountId, memo: a.memo,
    lines: [
      dr('CASH', a.amount, null, 'Receipt'),
      cr('AR', a.amount, a.accountId, 'Applied to receivables'),
    ],
  });
}

interface VendorPaymentArgs { accountId: string; date: string; sourceId: string; amount: number; memo?: string; }
/** Money paid to a vendor: Dr AP / Cr Cash. */
export function buildVendorPaymentJournal(a: VendorPaymentArgs): JournalEntryInput {
  return withIdempotencyKey({
    date: a.date, type: 'vendor_payment', sourceType: 'payment', sourceId: a.sourceId, partyId: a.accountId, memo: a.memo,
    lines: [
      dr('AP', a.amount, a.accountId, 'Applied to payables'),
      cr('CASH', a.amount, null, 'Payment'),
    ],
  });
}

interface CreditNoteArgs { accountId: string; date: string; sourceId: string; taxable: number; gstOutput?: number; memo?: string; }
/** Credit note to a customer (sales return/adjustment): reverses Dr Sales + Dr GST / Cr AR. */
export function buildCreditNoteJournal(a: CreditNoteArgs): JournalEntryInput {
  const gst = round2(a.gstOutput || 0);
  const total = round2(a.taxable + gst);
  return withIdempotencyKey({
    date: a.date, type: 'credit_note', sourceType: 'credit_note', sourceId: a.sourceId, partyId: a.accountId, memo: a.memo,
    lines: nonZero([
      dr('SALES', a.taxable, null, 'Sales reversal'),
      dr('GST_OUTPUT', gst, null, 'Output GST reversal'),
      cr('AR', total, a.accountId, 'Credit to customer'),
    ]),
  });
}

interface WriteOffArgs { accountId: string; date: string; sourceId: string; amount: number; memo?: string; }
/** Write off an uncollectible receivable: Dr Write-off / Cr AR. */
export function buildWriteOffJournal(a: WriteOffArgs): JournalEntryInput {
  return withIdempotencyKey({
    date: a.date, type: 'write_off', sourceType: 'write_off', sourceId: a.sourceId, partyId: a.accountId, memo: a.memo,
    lines: [
      dr('WRITEOFF', a.amount, null, 'Bad debt write-off'),
      cr('AR', a.amount, a.accountId, 'Receivable written off'),
    ],
  });
}

interface OpeningBalanceArgs { accountId: string; date: string; ar?: number; ap?: number; memo?: string; }
/**
 * Migration opening balance. AR (customer owes us): Dr AR / Cr Opening Equity.
 * AP (we owe vendor): Dr Opening Equity / Cr AP. Supports a net party that is both.
 */
export function buildOpeningBalanceJournal(a: OpeningBalanceArgs): JournalEntryInput {
  const ar = round2(a.ar || 0);
  const ap = round2(a.ap || 0);
  const lines: JournalLine[] = [];
  if (ar !== 0) {
    lines.push(dr('AR', ar, a.accountId, 'Opening receivable'));
    lines.push(cr('OPENING_EQUITY', ar, null, 'Opening equity (AR)'));
  }
  if (ap !== 0) {
    lines.push(dr('OPENING_EQUITY', ap, null, 'Opening equity (AP)'));
    lines.push(cr('AP', ap, a.accountId, 'Opening payable'));
  }
  return withIdempotencyKey({
    date: a.date, type: 'opening_balance', sourceType: 'account', sourceId: a.accountId, partyId: a.accountId, memo: a.memo,
    lines: nonZero(lines),
  });
}

// ─── Aging ──────────────────────────────────────────────────────────────────

/** Days a receivable/payable is past its due date (negative = not yet due). */
export function daysOverdue(dueDateISO: string, asOfISO?: string): number {
  const due = new Date(dueDateISO).getTime();
  const asOf = asOfISO ? new Date(asOfISO).getTime() : Date.now();
  return Math.floor((asOf - due) / (24 * 60 * 60 * 1000));
}

/** Standard 30-day aging buckets used across AR/AP and collections. */
export function agingBucketFor(dueDateISO: string, asOfISO?: string): AgingBucket {
  const d = daysOverdue(dueDateISO, asOfISO);
  if (d <= 0) return 'current';
  if (d <= 30) return '1-30';
  if (d <= 60) return '31-60';
  if (d <= 90) return '61-90';
  return '90+';
}
