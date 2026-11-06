import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukan_erp/core/parse.dart';
import 'package:krishidukan_erp/core/roles.dart';
import 'package:krishidukan_erp/features/billing/billing_math.dart';

void main() {
  group('numbering (web parity)', () {
    test('POS bill number pads to 4', () {
      expect(posBillNumber(1), 'KA-0001');
      expect(posBillNumber(12345), 'KA-12345');
    });
    test('B2B invoice number uses calendar year halves', () {
      expect(b2bInvoiceNumber(7, DateTime(2026, 10, 30)), 'SIPL/26-27/007');
      expect(b2bInvoiceNumber(1234, DateTime(2027, 1, 2)), 'SIPL/27-28/1234');
    });
  });

  group('POS totals', () {
    test('selling price wins, MRP is the only fallback', () {
      expect(posSellingRate(sellingPrice: 90, mrp: 100), 90);
      expect(posSellingRate(sellingPrice: 0, mrp: 100), 100);
      expect(posSellingRate(sellingPrice: null, mrp: '55'), 55);
      expect(posSellingRate(sellingPrice: null, mrp: null), 0);
    });

    test('GST-inclusive back-out and charges', () {
      final lines = [
        PosLine(productId: 'a', name: 'A', rate: 105, qty: 2, gstPct: 5),
        PosLine(productId: 'b', name: 'B', rate: 118, qty: 1, gstPct: 18),
      ];
      final t = posTotals(lines, transport: 20, labour: 10, discount: 30);
      expect(t.subtotal, 328);
      expect(t.taxable, closeTo(200 + 100, 1e-9));
      expect(t.totalTax, closeTo(10 + 18, 1e-9));
      expect(t.grandTotal, 328);
      expect(t.totalQty, 3);
    });

    test('missing GST displays as 5% (web invLineGst default)', () {
      final t = posTotals(
          [PosLine(productId: 'a', name: 'A', rate: 105, qty: 1)]);
      expect(t.taxable, closeTo(100, 1e-9));
    });

    test('discount can never push grand total below zero', () {
      final t = posTotals(
          [PosLine(productId: 'a', name: 'A', rate: 10, qty: 1, gstPct: 0)],
          discount: 50);
      expect(t.grandTotal, 0);
    });

    test('settlement: cash is paid in full, khata can be partial', () {
      final cash = posSettlement('Cash', 500, 0);
      expect(cash.paymentStatus, 'Paid');
      expect(cash.amountPaid, 500);
      expect(cash.creditAmount, 0);

      final partial = posSettlement('Khata', 500, 200);
      expect(partial.paymentStatus, 'Partial');
      expect(partial.amountPaid, 200);
      expect(partial.creditAmount, 300);

      final pending = posSettlement('Khata', 500, 0);
      expect(pending.paymentStatus, 'Pending');

      final overpaid = posSettlement('Khata', 500, 900);
      expect(overpaid.amountPaid, 500);
      expect(overpaid.creditAmount, 0);
      expect(overpaid.paymentStatus, 'Paid');
    });
  });

  group('B2B totals', () {
    test('round-off to rupee with JS rounding', () {
      final t = b2bTotals([
        B2bLine(description: 'Urea', qty: 3, rate: 266.5, gstPct: 5),
      ], discount: 0);
      // gross 799.5 → net 800, round-off +0.5 (JS rounds half up)
      expect(t.netAmount, 800);
      expect(t.roundOff, closeTo(0.5, 1e-9));
      expect(t.taxable + t.totalTax, closeTo(799.5, 1e-9));
    });

    test('discount and floor at zero', () {
      final t = b2bTotals(
          [B2bLine(description: 'X', qty: 1, rate: 100, gstPct: 0)],
          discount: 250);
      expect(t.netAmount, 0);
      expect(t.discount, 250);
    });

    test('negative discount ignored', () {
      final t = b2bTotals(
          [B2bLine(description: 'X', qty: 1, rate: 100, gstPct: 0)],
          discount: -20);
      expect(t.netAmount, 100);
    });

    test('settlement', () {
      expect(b2bSettlement('Cash', 900).status, 'paid');
      expect(b2bSettlement('Cash', 900).amountPaid, 900);
      final credit = b2bSettlement('15 Days', 900);
      expect(credit.status, 'confirmed');
      expect(credit.paymentStatus, 'Pending');
      expect(credit.amountPaid, 0);
    });

    test('jsRound matches Math.round on negative halves', () {
      expect(jsRound(2.5), 3);
      expect(jsRound(-2.5), -2);
      expect(jsRound(-2.6), -3);
    });
  });

  group('FEFO stock deduction', () {
    const product = ProductStock(loosePieces: 0, quantity: 0, boxCapacity: 1);

    test('earliest expiry first, undated last', () {
      final plan = planStockDeduction(
        productId: 'p',
        productName: 'P',
        qty: 7,
        product: product,
        batches: const [
          BatchStock(id: 'nodate', batchNumber: 'N', quantity: 10),
          BatchStock(id: 'late', batchNumber: 'L', quantity: 5, expiryDate: '2027-05'),
          BatchStock(id: 'early', batchNumber: 'E', quantity: 4, expiryDate: '2026-12'),
        ],
      );
      expect(plan.batchDeductions.map((d) => d.batchId), ['early', 'late']);
      expect(plan.batchDeductions[0].newQty, 0);
      expect(plan.batchDeductions[1].newQty, 2);
      expect(plan.newLoosePieces, 12);
      expect(plan.newBoxQuantity, isNull);
      expect(plan.lowStockFor(7), isFalse);
    });

    test('preferred batch goes first', () {
      final plan = planStockDeduction(
        productId: 'p',
        productName: 'P',
        qty: 3,
        product: product,
        preferredBatch: 'L',
        batches: const [
          BatchStock(id: 'early', batchNumber: 'E', quantity: 4, expiryDate: '2026-12'),
          BatchStock(id: 'late', batchNumber: 'L', quantity: 5, expiryDate: '2027-05'),
        ],
      );
      expect(plan.batchDeductions.single.batchId, 'late');
      expect(plan.batchDeductions.single.newQty, 2);
    });

    test('oversell drains batches and goes negative', () {
      final plan = planStockDeduction(
        productId: 'p',
        productName: 'P',
        qty: 6,
        product: product,
        batches: const [BatchStock(id: 'b', batchNumber: 'B', quantity: 4)],
      );
      expect(plan.batchDeductions.single.newQty, 0);
      expect(plan.newLoosePieces, -2);
      expect(plan.lowStockFor(6), isTrue);
    });

    test('empty and zero batches fall back to box/loose model', () {
      final plan = planStockDeduction(
        productId: 'p',
        productName: 'P',
        qty: 5,
        product: const ProductStock(loosePieces: 2, quantity: 3, boxCapacity: 10),
        batches: const [BatchStock(id: 'z', batchNumber: 'Z', quantity: 0)],
      );
      expect(plan.batchDeductions, isEmpty);
      // 2 loose − 5 → borrow one box: 3 boxes→2, loose −3+10 = 7
      expect(plan.newBoxQuantity, 2);
      expect(plan.newLoosePieces, 7);
      expect(plan.available, 32);
    });
  });

  group('khata', () {
    test('bill balance fallbacks', () {
      expect(khataBillBalance({'grandTotal': 500, 'amountPaid': 200}).outstanding, 300);
      expect(khataBillBalance({'netAmount': 500, 'paymentStatus': 'Paid'}).outstanding, 0);
      expect(khataBillBalance({'grandTotal': 500}).outstanding, 500);
      expect(
          khataBillBalance({'grandTotal': 500, 'returnTotal': 100, 'amountPaid': 0})
              .outstanding,
          400);
    });

    test('identity: name first, else phone', () {
      final e = {'retailerName': 'Ramesh Patil', 'phoneNumber': 9876543210};
      expect(khataCustomerMatches(e, ' ramesh patil ', ''), isTrue);
      expect(khataCustomerMatches(e, 'Suresh', '9876543210'), isFalse);
      expect(khataCustomerMatches(e, '', '+91 98765 43210'), isTrue);
    });

    test('FIFO allocation oldest first, skips settled', () {
      final out = allocateFifo([
        (id: 'new', date: DateTime(2026, 3), paid: 0, outstanding: 300),
        (id: 'old', date: DateTime(2026, 1), paid: 100, outstanding: 200),
        (id: 'done', date: DateTime(2025, 1), paid: 50, outstanding: 0),
      ], 350);
      expect(out.map((e) => e.billId), ['old', 'new']);
      expect(out[0].newAmountPaid, 300);
      expect(out[1].newAmountPaid, 150);
    });

    test('Digital Khata grouping matches the web table', () {
      DateTime? d(dynamic v) => v is DateTime ? v : null;
      final rows = groupKhata([
        (id: 'a1', data: {'retailerName': 'Ramesh Patil', 'phoneNumber': '9876543210', 'grandTotal': 800, 'amountPaid': 300, 'createdAt': DateTime(2026, 10, 1)}),
        // same person, different case + phone stored as number → same row
        (id: 'a2', data: {'retailerName': ' ramesh patil', 'phoneNumber': 9876543210, 'grandTotal': 500, 'paymentStatus': 'Paid', 'createdAt': DateTime(2026, 10, 5)}),
        // B2B, cancelled and deleted bills never count
        (id: 'b1', data: {'retailerName': 'Ramesh Patil', 'invoiceType': 'B2B_GST', 'grandTotal': 9999}),
        (id: 'c1', data: {'retailerName': 'Ramesh Patil', 'status': 'Cancelled', 'grandTotal': 9999}),
        (id: 'd1', data: {'retailerName': 'Ramesh Patil', 'deleted': true, 'grandTotal': 9999}),
        // phone-only entry keyed by last 10 digits; manual udhari flagged
        (id: 'p1', data: {'phoneNumber': '+91 91234 56780', 'grandTotal': 200, 'amountPaid': 0, 'source': 'khata', 'createdAt': DateTime(2026, 10, 9)}),
        // a return nets the bill down; grandTotal 0 falls through to netAmount
        (id: 'r1', data: {'retailerName': 'Suresh', 'grandTotal': 0, 'netAmount': 1000, 'returnTotal': 400, 'amountPaid': 100, 'createdAt': DateTime(2026, 9, 1)}),
      ], d);

      final ramesh = rows.firstWhere((c) => c.key == 'n:ramesh patil');
      expect(ramesh.bills.length, 2);
      expect(ramesh.total, 1300);
      expect(ramesh.paid, 800);
      expect(ramesh.outstanding, 500);
      expect(ramesh.status, 'Partial');
      expect(ramesh.bills.first.id, 'a2'); // newest first

      final phoneOnly = rows.firstWhere((c) => c.key == 'p:9123456780');
      expect(phoneOnly.name, 'Walk-in Customer');
      expect(phoneOnly.bills.single.isManual, isTrue);
      expect(phoneOnly.status, 'Pending');

      final suresh = rows.firstWhere((c) => c.key == 'n:suresh');
      expect(suresh.total, 600);
      expect(suresh.outstanding, 500);

      expect(rows.first.key, 'p:9123456780'); // most recent activity first
    });
  });

  group('parsing + validation', () {
    test('str tolerates numbers from imports', () {
      expect(str(9876543210.0), '9876543210');
      expect(str(12.5), '12.5');
      expect(str(null), '');
    });
    test('phone matching on last 10 digits', () {
      expect(samePhone('+91-98765 43210', 9876543210), isTrue);
      expect(samePhone('', ''), isFalse);
    });
    test('contact number validator mirrors web', () {
      expect(contactNumberError('9876543210'), isNull);
      expect(contactNumberError('+919876543210, 8765432109'), isNull);
      expect(contactNumberError('12345'), isNotNull);
      expect(contactNumberError(''), isNotNull);
    });
    test('GSTIN optional but validated', () {
      expect(gstinError(''), isNull);
      expect(gstinError('27AAPFU0939F1ZV'), isNull);
      expect(gstinError('27AAPFU0939F1Z'), isNotNull);
    });
    test('amount in words', () {
      expect(amountInWords(1250.5), 'One Thousand Two Hundred Fifty and Fifty Paise only');
      expect(amountInWords(150000), 'One Lakh Fifty Thousand only');
    });
  });

  group('roles follow firestore.rules', () {
    test('only admin/analyst can bill or touch payments', () {
      for (final r in ['admin', 'analyst', 'master']) {
        final c = Capabilities.of(r);
        expect(c.canBill, isTrue, reason: r);
        expect(c.canRecordPayment, isTrue, reason: r);
        expect(c.canEditProducts, isTrue, reason: r);
      }
      for (final r in ['shopkeeper', 'sales', 'retailer', 'manufacturer', '']) {
        final c = Capabilities.of(r);
        expect(c.canBill, isFalse, reason: r);
        expect(c.canRecordPayment, isFalse, reason: r);
        expect(c.canEditProducts, isFalse, reason: r);
      }
    });
    test('portal users get nothing', () {
      expect(Capabilities.of('retailer').canUseApp, isFalse);
      expect(Capabilities.of('manufacturer').canUseApp, isFalse);
    });
    test('sales is read-only and scoped', () {
      final c = Capabilities.of('sales');
      expect(c.canViewCustomers, isTrue);
      expect(c.canEditCustomers, isFalse);
      expect(c.canViewBatches, isFalse);
      expect(c.isScopedToAssignedRetailers, isTrue);
    });
  });
}
