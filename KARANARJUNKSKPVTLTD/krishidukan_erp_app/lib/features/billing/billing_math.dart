// Pure billing arithmetic — no Firestore, no Flutter. Every function here is
// a line-for-line port of the web ERP so a bill made on the phone carries
// exactly the totals, tax split and number the browser would have produced:
//   POS  → src/pages/POSPage.tsx        (handleCheckout, invLineGst, …)
//   B2B  → src/pages/B2BInvoicePage.tsx (totals block, generateInvoiceNumber)
//   FEFO → src/utils/stockDeduction.ts  (prepareStockDeduction)
// Covered by test/billing_math_test.dart.

import 'dart:math' as math;

import '../../core/parse.dart';

/// JavaScript's Math.round (half rounds toward +∞). Dart's round() goes away
/// from zero, which differs for negative halves — B2B round-off must match
/// the web to the paisa.
double jsRound(double v) => (v + 0.5).floorToDouble();

// ── Numbering ───────────────────────────────────────────────────────────────

/// POS bill number from counters/posBillCounter.lastBillNumber — `KA-0001`.
String posBillNumber(int seq) => 'KA-${seq.toString().padLeft(4, '0')}';

/// B2B number from counters/b2bInvoiceCounter.lastInvoiceNumber —
/// `SIPL/26-27/001`. The web uses the calendar year (not the financial year)
/// for both halves; copied as-is so the two clients never fork the series.
String b2bInvoiceNumber(int seq, DateTime now) {
  final y = now.year;
  String yy(int v) => v.toString().substring(v.toString().length - 2);
  return 'SIPL/${yy(y)}-${yy(y + 1)}/${seq.toString().padLeft(3, '0')}';
}

// ── POS ─────────────────────────────────────────────────────────────────────

/// posSellingRate: counter bills use the offer/selling price, MRP as the only
/// fallback — never the retailer (PTR) rate.
double posSellingRate({required dynamic sellingPrice, required dynamic mrp}) {
  final sp = dbl(sellingPrice);
  if (sp != 0) return sp;
  return dbl(mrp);
}

class PosLine {
  PosLine({
    required this.productId,
    required this.name,
    required this.rate,
    required this.qty,
    this.gstPct,
    this.unit = 'pcs',
    this.mfgCompany = '',
    this.batchNo = '',
    this.expDate = '',
  });

  final String productId;
  final String name;
  double rate;
  double qty;

  /// null when the product has no GST configured — the bill shows 5% (web
  /// invLineGst default) but stores 0 (web `Number(item.gstPct) || 0`).
  final double? gstPct;
  final String unit;
  final String mfgCompany;
  String batchNo;
  String expDate;

  double get amount => qty * rate;
  double get displayGstPct => gstPct ?? 5;
}

class PosTotals {
  const PosTotals({
    required this.subtotal,
    required this.taxable,
    required this.cgst,
    required this.grandTotal,
    required this.totalQty,
  });

  final double subtotal;
  final double taxable;
  final double cgst;
  double get sgst => cgst;
  double get totalTax => cgst * 2;
  final double grandTotal;
  final double totalQty;
}

/// Amounts are GST-inclusive; taxable is backed out per line and split evenly
/// into CGST/SGST. grandTotal = subtotal + transport + labour − discount,
/// floored at zero, with NO rounding (the POS bill has no round-off line).
PosTotals posTotals(
  List<PosLine> lines, {
  double transport = 0,
  double labour = 0,
  double discount = 0,
}) {
  var subtotal = 0.0, taxable = 0.0, cgst = 0.0, qty = 0.0;
  for (final l in lines) {
    final g = l.displayGstPct;
    subtotal += l.amount;
    qty += l.qty;
    taxable += l.amount / (1 + g / 100);
    cgst += (l.amount / (1 + g / 100)) * (g / 2) / 100;
  }
  return PosTotals(
    subtotal: subtotal,
    taxable: taxable,
    cgst: cgst,
    grandTotal: math.max(0, subtotal + transport + labour - discount),
    totalQty: qty,
  );
}

/// Payment methods the POS checkout offers. 'Khata' is credit.
const posPaymentMethods = ['Cash', 'UPI', 'Card', 'Khata'];

class PosSettlement {
  const PosSettlement({
    required this.paymentStatus,
    required this.amountPaid,
    required this.creditAmount,
  });
  final String paymentStatus;
  final double amountPaid;
  final double creditAmount;
}

/// Same branches as handleCheckout: a Khata bill can be part-paid now, every
/// other method settles in full.
PosSettlement posSettlement(String method, double grandTotal, double paidNow) {
  if (method != 'Khata') {
    return PosSettlement(
        paymentStatus: 'Paid', amountPaid: grandTotal, creditAmount: 0);
  }
  final paid = math.min(math.max(0.0, paidNow), grandTotal);
  final credit = math.max(0.0, grandTotal - paid);
  return PosSettlement(
    paymentStatus: credit > 0 ? (paid > 0 ? 'Partial' : 'Pending') : 'Paid',
    amountPaid: paid,
    creditAmount: credit,
  );
}

// ── B2B ─────────────────────────────────────────────────────────────────────

const b2bPaymentModes = ['Cash', '15 Days', '30 Days', '45 Days', 'Credit'];

class B2bLine {
  B2bLine({
    this.productId = '',
    this.description = '',
    this.mfgCompany = '',
    this.batchNo = '',
    this.expDate = '',
    this.gstPct = 5,
    this.per = 'Nos',
    this.qty = 0,
    this.rate = 0,
  });

  String productId;
  String description;
  String mfgCompany;
  String batchNo;
  String expDate;
  double gstPct;
  String per;
  double qty;
  double rate;

  double get gross => rate * qty;
  bool get isActive => description.trim().isNotEmpty || rate != 0;
}

class B2bTotals {
  const B2bTotals({
    required this.taxable,
    required this.cgst,
    required this.discount,
    required this.roundOff,
    required this.netAmount,
  });

  final double taxable;
  final double cgst;
  double get sgst => cgst;
  double get totalTax => cgst * 2;
  final double discount;
  final double roundOff;
  final double netAmount;
}

/// Gross is GST-inclusive; taxable backed out per line, CGST = SGST. Net is
/// rounded to the rupee (JS Math.round) and never below zero.
B2bTotals b2bTotals(List<B2bLine> lines, {double discount = 0}) {
  var taxable = 0.0, cgst = 0.0;
  for (final l in lines) {
    final t = l.gross / (1 + l.gstPct / 100);
    taxable += t;
    cgst += t * (l.gstPct / 2) / 100;
  }
  final d = math.max(0.0, discount);
  final raw = taxable + cgst * 2 - d;
  return B2bTotals(
    taxable: taxable,
    cgst: cgst,
    discount: d,
    roundOff: jsRound(raw) - raw,
    netAmount: math.max(0, jsRound(raw)),
  );
}

/// B2B status/paymentStatus/amountPaid for a NEW invoice.
({String status, String paymentStatus, double amountPaid}) b2bSettlement(
    String modeOfPayment, double netAmount) {
  final cash = modeOfPayment == 'Cash';
  return (
    status: cash ? 'paid' : 'confirmed',
    paymentStatus: cash ? 'Paid' : 'Pending',
    amountPaid: cash ? netAmount : 0,
  );
}

// ── FEFO stock deduction ────────────────────────────────────────────────────

class BatchStock {
  const BatchStock({
    required this.id,
    required this.batchNumber,
    required this.quantity,
    this.expiryDate = '',
  });
  final String id;
  final String batchNumber;
  final double quantity;
  final String expiryDate;
}

class ProductStock {
  const ProductStock({
    required this.loosePieces,
    required this.quantity,
    required this.boxCapacity,
  });
  final double loosePieces;
  final double quantity;
  final double boxCapacity;

  double get totalPieces => loosePieces + quantity * boxCapacity;
}

class BatchDeduction {
  const BatchDeduction(this.batchId, this.batchNumber, this.newQty, this.deducted);
  final String batchId;
  final String batchNumber;
  final double newQty;
  final double deducted;
}

class StockPlan {
  const StockPlan({
    required this.batchDeductions,
    required this.newLoosePieces,
    required this.newBoxQuantity,
    required this.available,
    required this.movements,
  });

  final List<BatchDeduction> batchDeductions;
  final double newLoosePieces;

  /// Only set for products without batches (old box/loose model).
  final double? newBoxQuantity;
  final double available;
  final List<Map<String, dynamic>> movements;

  /// Sale goes ahead regardless (web passes allowNegative=true); this drives
  /// the post-save "Low stock" notice.
  bool lowStockFor(double qty) => available < qty;
}

int _fefo(BatchStock a, BatchStock b) {
  if (a.expiryDate.isEmpty && b.expiryDate.isEmpty) return 0;
  if (a.expiryDate.isEmpty) return 1;
  if (b.expiryDate.isEmpty) return -1;
  return a.expiryDate.compareTo(b.expiryDate);
}

/// prepareStockDeduction for one product, with allowNegative = true.
///
/// [batches] are every inventoryBatches doc for the product; only positive
/// ones count. With none, the product's own box/loose stock is deducted
/// instead (pre-batch products). The caller aggregates all lines of the same
/// product into one [qty] first — the web runs each line against the same
/// snapshot, which under-deducts when a product appears twice.
StockPlan planStockDeduction({
  required String productId,
  required String productName,
  required double qty,
  required List<BatchStock> batches,
  required ProductStock product,
  String preferredBatch = '',
}) {
  final live = batches.where((b) => b.quantity > 0).toList()..sort(_fefo);
  final batchTotal = live.fold<double>(0, (s, b) => s + b.quantity);

  if (live.isEmpty || batchTotal == 0) {
    final cap = product.boxCapacity == 0 ? 1.0 : product.boxCapacity;
    final total = product.totalPieces;
    var newLoose = product.loosePieces - qty;
    var newBoxes = product.quantity;
    while (newLoose < 0 && newBoxes > 0) {
      newBoxes--;
      newLoose += cap;
    }
    return StockPlan(
      batchDeductions: const [],
      newLoosePieces: newLoose,
      newBoxQuantity: newBoxes,
      available: total,
      movements: [
        {
          'productId': productId,
          'productName': productName,
          'batchNumber': '',
          'qtyIn': 0,
          'qtyOut': qty,
          'remainingBatchQty': 0,
          'remainingStock': total - qty,
        }
      ],
    );
  }

  final ordered = preferredBatch.isEmpty
      ? live
      : [
          ...live.where((b) => b.batchNumber == preferredBatch),
          ...live.where((b) => b.batchNumber != preferredBatch),
        ];

  var remaining = qty;
  final deductions = <BatchDeduction>[];
  final movements = <Map<String, dynamic>>[];
  for (final b in ordered) {
    if (remaining <= 0) break;
    final take = math.min(b.quantity, remaining);
    final newQty = b.quantity - take;
    remaining -= take;
    deductions.add(BatchDeduction(b.id, b.batchNumber, newQty, take));
    movements.add({
      'productId': productId,
      'productName': productName,
      'batchNumber': b.batchNumber,
      'qtyIn': 0,
      'qtyOut': take,
      'remainingBatchQty': newQty,
      'remainingStock': batchTotal - qty,
    });
  }
  // Oversell beyond every batch: the batches drain to zero and the product's
  // loosePieces goes negative, exactly as the web records it.
  return StockPlan(
    batchDeductions: deductions,
    newLoosePieces: batchTotal - qty,
    newBoxQuantity: null,
    available: batchTotal,
    movements: movements,
  );
}

// ── Outstanding ─────────────────────────────────────────────────────────────

/// Per-bill Khata balance — fetchLiveOutstanding / Digital Khata. Returns
/// (grand, paid, outstanding) for a non-B2B bill.
({double grand, double paid, double outstanding}) khataBillBalance(
    Map<String, dynamic> e) {
  final grandBase =
      dbl(e['grandTotal'] ?? e['netAmount'] ?? e['totalAmount'] ?? e['amount']);
  final grand = math.max(0.0, grandBase - dbl(e['returnTotal']));
  final rawPaid = e['amountPaid'] ?? e['paidAmount'];
  final paid = rawPaid != null
      ? dbl(rawPaid)
      : (str(e['paymentStatus']).toLowerCase() == 'paid' ? grand : 0.0);
  return (grand: grand, paid: paid, outstanding: math.max(0.0, grand - paid));
}

bool isVoidBill(Map<String, dynamic> e) =>
    e['deleted'] == true || str(e['status']).toLowerCase() == 'cancelled';

/// Customer identity used by the Khata: name when the customer has one, else
/// the last 10 phone digits.
bool khataCustomerMatches(
    Map<String, dynamic> e, String name, String phone) {
  final nameKey = name.trim().toLowerCase();
  final eName = str(e['customerName'] ?? e['retailerName']).trim().toLowerCase();
  if (nameKey.isNotEmpty) return eName == nameKey;
  final pk = phoneKey(phone);
  if (pk.isEmpty) return false;
  return samePhone(e['customerPhone'] ?? e['phoneNumber'], pk);
}

/// One Khata bill as Digital Khata sees it.
class KhataBill {
  const KhataBill({
    required this.id,
    required this.number,
    required this.date,
    required this.total,
    required this.paid,
    required this.isManual,
  });
  final String id;
  final String number;
  final DateTime date;
  final double total;
  final double paid;

  /// Entered through "Add Udhari" (source: 'khata') rather than billed.
  final bool isManual;
  double get outstanding => math.max(0, total - paid);
}

/// One customer row in Digital Khata.
class KhataCustomer {
  KhataCustomer(this.key);
  final String key;
  String name = '';
  String phone = '';
  String address = '';
  String pin = '';
  final bills = <KhataBill>[];
  double total = 0;
  double paid = 0;
  double outstanding = 0;
  DateTime lastActivity = DateTime(2000);

  String get status => outstanding <= 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Pending');
}

/// customerKeyOf (DigitalKhataPage.tsx): normalized name first, else the
/// last 10 phone digits, else one shared walk-in bucket.
String khataKeyOf(Map<String, dynamic> e) {
  final nm = str(e['customerName'] ?? e['retailerName']).trim().toLowerCase();
  if (nm.isNotEmpty) return 'n:$nm';
  final ph = phoneKey(e['customerPhone'] ?? e['phoneNumber']);
  if (ph.isNotEmpty) return 'p:${ph.length > 10 ? ph.substring(ph.length - 10) : ph}';
  return 'n:walk-in';
}

/// Rolls salesOrders up into Digital Khata's customer table: non-B2B,
/// non-deleted, non-cancelled bills; totals use `||` fallbacks (a 0 grand
/// total falls through) exactly like the web page; newest activity first.
List<KhataCustomer> groupKhata(
    Iterable<({String id, Map<String, dynamic> data})> docs, DateTime? Function(dynamic) toDate) {
  final map = <String, KhataCustomer>{};
  for (final d in docs) {
    final e = d.data;
    if (str(e['invoiceType']) == 'B2B_GST' || e['deleted'] == true) continue;
    if (str(e['status']).toLowerCase() == 'cancelled') continue;
    double firstNonZero(List<dynamic> vs) {
      for (final v in vs) {
        final x = dbl(v);
        if (x != 0) return x;
      }
      return 0;
    }

    final totalBase = firstNonZero([e['grandTotal'], e['netAmount'], e['totalAmount'], e['amount']]);
    final total = math.max(0.0, totalBase - dbl(e['returnTotal']));
    final rawPaid = e['amountPaid'] ?? e['paidAmount'];
    final paid = rawPaid != null
        ? dbl(rawPaid)
        : (str(e['paymentStatus']).toLowerCase() == 'paid' ? total : 0.0);
    final ts = toDate(e['createdAt']) ?? DateTime(2000);
    final updated = toDate(e['updatedAt']) ?? ts;
    final key = khataKeyOf(e);
    final c = map.putIfAbsent(key, () => KhataCustomer(key)..lastActivity = updated);
    final bill = KhataBill(
      id: d.id,
      number: str(e['invoiceNumber']).isNotEmpty
          ? str(e['invoiceNumber'])
          : (str(e['orderNumber']).isNotEmpty
              ? str(e['orderNumber'])
              : d.id.substring(math.max(0, d.id.length - 6)).toUpperCase()),
      date: ts,
      total: total,
      paid: paid,
      isManual: str(e['source']) == 'khata',
    );
    c.bills.add(bill);
    c.total += total;
    c.paid += paid;
    c.outstanding += bill.outstanding;
    if (updated.isAfter(c.lastActivity)) c.lastActivity = updated;
    if (c.name.isEmpty) c.name = str(e['customerName'] ?? e['retailerName']);
    if (c.phone.isEmpty) c.phone = str(e['customerPhone'] ?? e['phoneNumber']);
    if (c.address.isEmpty) c.address = str(e['address']);
    if (c.pin.isEmpty) c.pin = str(e['pin']);
  }
  final list = map.values.toList();
  for (final c in list) {
    if (c.name.isEmpty) c.name = 'Walk-in Customer';
    c.bills.sort((a, b) => b.date.compareTo(a.date));
  }
  list.sort((a, b) => b.lastActivity.compareTo(a.lastActivity));
  return list;
}

/// Spreads a Khata payment over a customer's open bills, oldest first —
/// submitPayment() in DigitalKhataPage.tsx with no invoice linked.
List<({String billId, double newAmountPaid})> allocateFifo(
  List<({String id, DateTime date, double paid, double outstanding})> bills,
  double amount,
) {
  final ordered = [...bills]..sort((a, b) => a.date.compareTo(b.date));
  var left = amount;
  final out = <({String billId, double newAmountPaid})>[];
  for (final b in ordered) {
    if (left <= 0) break;
    if (b.outstanding <= 0) continue;
    final apply = math.min(left, b.outstanding);
    out.add((billId: b.id, newAmountPaid: b.paid + apply));
    left -= apply;
  }
  return out;
}

// ── Amount in words (Indian system) ─────────────────────────────────────────

const _ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const _tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty',
  'Ninety',
];

String _words(int n) {
  if (n < 20) return _ones[n];
  if (n < 100) return _tens[n ~/ 10] + (n % 10 != 0 ? ' ${_ones[n % 10]}' : '');
  if (n < 1000) {
    return '${_ones[n ~/ 100]} Hundred${n % 100 != 0 ? ' ${_words(n % 100)}' : ''}';
  }
  if (n < 100000) {
    return '${_words(n ~/ 1000)} Thousand${n % 1000 != 0 ? ' ${_words(n % 1000)}' : ''}';
  }
  if (n < 10000000) {
    return '${_words(n ~/ 100000)} Lakh${n % 100000 != 0 ? ' ${_words(n % 100000)}' : ''}';
  }
  return '${_words(n ~/ 10000000)} Crore${n % 10000000 != 0 ? ' ${_words(n % 10000000)}' : ''}';
}

/// numberToWords from B2BInvoicePage.tsx — "One Thousand Two Hundred and
/// Fifty Paise only".
String amountInWords(double num) {
  if (num <= 0) return 'Zero';
  final intPart = num.floor();
  final paise = ((num - intPart) * 100).round();
  var r = _words(intPart);
  if (r.isEmpty) r = 'Zero';
  if (paise > 0) r += ' and ${_words(paise)} Paise';
  return '$r only';
}
