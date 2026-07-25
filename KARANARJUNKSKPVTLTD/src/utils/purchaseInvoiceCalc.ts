/** Purchase invoice calculation engine — single source of truth for all line and summary formulas. */

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Derive rate excluding GST from rate including GST.
 * Rate w/o GST = Rate +GST / (1 + GST% / 100)
 * Examples: 18% → ÷1.18, 12% → ÷1.12, 5% → ÷1.05
 */
export function rateWithGstToWithoutGst(rateWithGst: number, gstPct: number): number {
  if (gstPct <= 0 || rateWithGst <= 0) return r2(rateWithGst);
  return r2(rateWithGst / (1 + gstPct / 100));
}

/** Convenience inverse: rate excluding GST → rate including GST. */
export function rateWithoutGstToWithGst(rateWithoutGst: number, gstPct: number): number {
  return r2(rateWithoutGst * (1 + gstPct / 100));
}

export interface PurchaseLineInput {
  rateWithoutGst: number;
  gstPct: number;
  creditRate: number;
  qtyPerBox: number;
  boxQty: number;
}

export interface PurchaseLineCalc {
  rateWithGst: number;
  qty: number;
  amountWithoutGst: number;
  gstAmount: number;
  amountWithGst: number;
  creditAmount: number;
  differenceAmount: number;
  unitValue: number;
}

export interface PurchaseTotals {
  totalBoxQty: number;
  totalQty: number;
  totalAmountWithoutGst: number;
  totalGst: number;
  totalAmountWithGst: number;
  totalCreditAmount: number;
  totalDifferenceAmount: number;
  totalUnitValue: number;
}

export function calcPurchaseLine(input: PurchaseLineInput): PurchaseLineCalc {
  const rateWithGst = r2(input.rateWithoutGst * (1 + input.gstPct / 100));
  const qty = input.qtyPerBox * input.boxQty;
  const amountWithoutGst = r2(input.rateWithoutGst * qty);
  const gstAmount = r2(amountWithoutGst * input.gstPct / 100);
  const amountWithGst = r2(amountWithoutGst + gstAmount);
  const creditAmount = r2(input.creditRate * qty);
  const differenceAmount = r2(creditAmount - amountWithGst);
  const unitValue = qty > 0 ? r2(amountWithGst / qty) : 0;
  return { rateWithGst, qty, amountWithoutGst, gstAmount, amountWithGst, creditAmount, differenceAmount, unitValue };
}

export function calcPurchaseTotals(
  lines: Array<PurchaseLineInput & PurchaseLineCalc>,
): PurchaseTotals {
  return {
    totalBoxQty: lines.reduce((s, l) => s + l.boxQty, 0),
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    totalAmountWithoutGst: r2(lines.reduce((s, l) => s + l.amountWithoutGst, 0)),
    totalGst: r2(lines.reduce((s, l) => s + l.gstAmount, 0)),
    totalAmountWithGst: r2(lines.reduce((s, l) => s + l.amountWithGst, 0)),
    totalCreditAmount: r2(lines.reduce((s, l) => s + l.creditAmount, 0)),
    totalDifferenceAmount: r2(lines.reduce((s, l) => s + l.differenceAmount, 0)),
    totalUnitValue: r2(lines.reduce((s, l) => s + l.unitValue, 0)),
  };
}
