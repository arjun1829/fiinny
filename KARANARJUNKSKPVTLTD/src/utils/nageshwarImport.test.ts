import { describe, it, expect } from 'vitest';
import { BILLS, PAYMENTS, OPENING_BALANCE, CLOSING_BALANCE, TOTAL_INVOICED, TOTAL_PAID } from './nageshwarImport';

// The supplier statement must reconcile exactly: every rupee is accounted for.
describe('Nageshwar statement reconciliation', () => {
  const billsSum = BILLS.reduce((s, b) => s + b.amount, 0);
  const paymentsSum = PAYMENTS.reduce((s, p) => s + p.amount, 0);

  it('bills total matches the statement debit (ex-opening)', () => {
    expect(billsSum).toBe(1025860);
  });

  it('payments total matches the statement credit', () => {
    expect(paymentsSum).toBe(1235530);
  });

  it('opening + bills − payments equals the closing balance ₹70,206', () => {
    expect(OPENING_BALANCE + billsSum - paymentsSum).toBe(CLOSING_BALANCE);
    expect(CLOSING_BALANCE).toBe(70206);
  });

  it('derived supplier totals are consistent', () => {
    expect(TOTAL_INVOICED).toBe(OPENING_BALANCE + billsSum); // 1,305,736
    expect(TOTAL_PAID).toBe(paymentsSum);                    // 1,235,530
    expect(TOTAL_INVOICED - TOTAL_PAID).toBe(CLOSING_BALANCE);
  });
});
