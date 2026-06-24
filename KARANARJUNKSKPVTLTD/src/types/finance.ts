// ─────────────────────────────────────────────────────────────────
//  Finance domain types — HighRadius-style O2C + S2P
//  Shared by the client (read/display) and mirrored by Cloud Functions
//  (which own all posting). Clients NEVER write the ledger.
// ─────────────────────────────────────────────────────────────────

/** Chart-of-accounts GL codes. Kept small and stable — codes are the contract. */
export type GLAccountId =
  | 'AR'             // Accounts Receivable (control)
  | 'AP'             // Accounts Payable (control)
  | 'CASH'           // Cash / Bank
  | 'SALES'          // Sales revenue
  | 'PURCHASES'      // Purchases / COGS
  | 'INVENTORY'      // Inventory asset
  | 'GST_OUTPUT'     // Output GST payable (on sales)
  | 'GST_INPUT'      // Input GST credit (on purchases)
  | 'DISCOUNTS'      // Discounts / promotions given
  | 'DISPUTES'       // Disputes / deductions suspense
  | 'WRITEOFF'       // Bad-debt write-off
  | 'OPENING_EQUITY'; // Opening-balance equity (migration counter-entry)

export type NormalBalance = 'debit' | 'credit';
export type GLAccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity';

export interface GLAccountDef {
  code: GLAccountId;
  name: string;
  type: GLAccountType;
  normalBalance: NormalBalance;
}

/** Every business event posts exactly one of these. */
export type JournalEntryType =
  | 'invoice'
  | 'bill'
  | 'receipt'          // money in from a customer
  | 'vendor_payment'   // money out to a vendor
  | 'credit_note'
  | 'debit_note'
  | 'write_off'
  | 'opening_balance'
  | 'adjustment'
  | 'promo_accrual'
  | 'dispute';

export interface JournalLine {
  glAccount: GLAccountId;
  /** Party id (AR/AP sub-ledger). Required for AR/AP lines, omit otherwise. */
  accountId?: string | null;
  debit: number;   // >= 0; a line carries either a debit OR a credit, never both
  credit: number;  // >= 0
  description?: string;
}

/** Caller-supplied entry (pre-posting). `idempotencyKey` defaults from source. */
export interface JournalEntryInput {
  date: string;        // ISO date (yyyy-mm-dd or full ISO)
  type: JournalEntryType;
  lines: JournalLine[];
  sourceType: string;  // e.g. 'invoice', 'payment', 'bill', 'dispute'
  sourceId: string;    // id of the source document
  partyId?: string | null;
  memo?: string;
  idempotencyKey?: string;
}

/** Stored journal entry — adds server-owned fields. */
export interface JournalEntry extends JournalEntryInput {
  id: string;
  idempotencyKey: string;
  posted: boolean;
  reversedBy?: string | null;
  createdAt?: unknown;
  createdBy?: string;
}

export type PartyRole = 'customer' | 'retailer' | 'manufacturer' | 'supplier';
export type CreditStatus = 'active' | 'hold' | 'blocked';

/** Unified counterparty. Existing retailers/suppliers/manufacturers link in via linkedRefs. */
export interface Account {
  id: string;
  name: string;
  roles: PartyRole[];
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  linkedRefs?: {
    retailerId?: string;
    supplierId?: string;
    manufacturerId?: string;
    customerId?: string;
  };
  // Credit management
  creditLimit?: number;
  creditTermsDays?: number;
  creditStatus?: CreditStatus;
  riskScore?: number;
  // Materialized balances (Function-owned)
  arBalance: number;
  apBalance: number;
  lastPostedAt?: unknown;
  createdAt?: unknown;
}

export type InvoiceStatus = 'open' | 'partial' | 'paid' | 'disputed' | 'written_off';
export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

/** Signed change to a party's AR / AP balances produced by one journal entry. */
export interface PartyDeltas {
  ar: number;
  ap: number;
}
