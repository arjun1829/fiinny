import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/audit.dart';
import '../../core/parse.dart';
import '../../core/tenant_path.dart';
import '../auth/auth_repository.dart';
import '../customers/customer.dart';
import 'billing_math.dart';

/// Counter-sale buyer. [retailerId] is set only when the cashier picked a
/// known customer (or the phone matched exactly one) — the same moments the
/// web POS links a bill to a retailer.
class PosBuyer {
  PosBuyer({
    this.name = '',
    this.phone = '',
    this.address = '',
    this.pin = '',
    this.taluka = '',
    this.district = '',
    this.retailerId,
  });

  factory PosBuyer.fromCustomer(Customer c) => PosBuyer(
        name: c.name,
        phone: c.phone,
        address: c.atPost,
        pin: c.pin,
        taluka: c.taluka,
        district: c.district,
        retailerId: c.id,
      );

  String name;
  String phone;
  String address;
  String pin;
  String taluka;
  String district;
  String? retailerId;
}

class PosDraft {
  PosDraft({
    required this.lines,
    required this.buyer,
    required this.method,
    this.paidNow = 0,
    this.transport = 0,
    this.labour = 0,
    this.discount = 0,
    this.khataNote = '',
    this.billNote = '',
    this.previousBalance = 0,
  });

  final List<PosLine> lines;
  final PosBuyer buyer;
  final String method;
  final double paidNow;
  final double transport;
  final double labour;
  final double discount;
  final String khataNote;
  final String billNote;
  final double previousBalance;
}

class B2bHeader {
  B2bHeader({
    DateTime? invoiceDate,
    this.modeOfPayment = '15 Days',
    this.salesmanName = '',
    this.salesmanId = '',
    this.termsOfDelivery = '',
    this.buyerName = '',
    this.buyerAddress = '',
    this.buyerGstin = '',
    this.buyerContact = '',
    this.retailerId = '',
    this.transporterId = '',
    this.transporterName = '',
    this.transporterContact = '',
  }) : invoiceDate = invoiceDate ?? DateTime.now();

  DateTime invoiceDate;
  String modeOfPayment;
  String salesmanName;
  String salesmanId;
  String termsOfDelivery;
  String buyerName;
  String buyerAddress;
  String buyerGstin;
  String buyerContact;
  String retailerId;
  String transporterId;
  String transporterName;
  String transporterContact;
}

class SaleResult {
  const SaleResult(this.orderId, this.number, this.total, this.lowStock);
  final String orderId;
  final String number;
  final double total;

  /// "Name — Stock: n" for every product that went below zero — the web
  /// shows the same list in its post-save Low Stock alert.
  final List<String> lowStock;
}

class SalesPerson {
  const SalesPerson(this.id, this.name);
  final String id;
  final String name;
}

class Transporter {
  const Transporter(this.id, this.name, this.mobile);
  final String id;
  final String name;
  final String mobile;
}

/// A sale that could not be saved. [message] is safe to show the cashier.
class BillingException implements Exception {
  BillingException(this.message);
  final String message;
  @override
  String toString() => message;
}

class _Stocked {
  _Stocked(this.productId, this.name, this.preferredBatch);
  final String productId;
  final String name;
  final String preferredBatch;
  double qty = 0;
  List<DocumentReference<Map<String, dynamic>>> batchRefs = const [];
}

class BillingRepository {
  BillingRepository(this._db, this._user);

  final FirebaseFirestore _db;
  final AppUser _user;

  CollectionReference<Map<String, dynamic>> _col(String name) =>
      tenantCollection(_db, _user.tenantId, name);

  // ── Lookups ──────────────────────────────────────────────────────────────

  Future<int> peekCounter(String counterId, String field) async {
    final s = await _col('counters').doc(counterId).get();
    return dbl(s.data()?[field]).toInt() + 1;
  }

  Future<String> nextPosNumber() async =>
      posBillNumber(await peekCounter('posBillCounter', 'lastBillNumber'));

  Future<String> nextB2bNumber() async => b2bInvoiceNumber(
      await peekCounter('b2bInvoiceCounter', 'lastInvoiceNumber'),
      DateTime.now());

  /// fetchLiveOutstanding (POSPage.tsx) — latest 500 bills, non-B2B,
  /// matched by name else phone.
  Future<double> khataOutstanding(String name, String phone) async {
    if (name.trim().isEmpty && phoneKey(phone).isEmpty) return 0;
    final s = await _col('salesOrders')
        .orderBy('createdAt', descending: true)
        .limit(500)
        .get();
    var total = 0.0;
    for (final d in s.docs) {
      final e = d.data();
      if (str(e['invoiceType']) == 'B2B_GST' || isVoidBill(e)) continue;
      if (!khataCustomerMatches(e, name, phone)) continue;
      total += khataBillBalance(e).outstanding;
    }
    return total;
  }

  /// applyRetailerBalance (B2BInvoicePage.tsx) — bills by retailerId minus
  /// the payments subcollection.
  Future<double> partnerOutstanding(String retailerId) async {
    final results = await Future.wait([
      _col('salesOrders').where('retailerId', isEqualTo: retailerId).get(),
      _col('retailers').doc(retailerId).collection('payments').get(),
    ]);
    var sales = 0.0, paid = 0.0;
    for (final d in results[0].docs) {
      if (d.data()['deleted'] == true) continue;
      sales += dbl(d.data()['grandTotal'] ?? d.data()['netAmount'] ?? d.data()['totalAmount']);
    }
    for (final d in results[1].docs) {
      paid += dbl(d.data()['amount']);
    }
    return math.max(0, sales - paid);
  }

  Future<List<SalesPerson>> salesPeople() async {
    final s = await _db
        .collection('users')
        .where('tenantId', isEqualTo: _user.tenantId)
        .where('role', isEqualTo: 'sales')
        .get();
    return [
      for (final d in s.docs)
        SalesPerson(
            d.id,
            str(d.data()['name']).isNotEmpty
                ? str(d.data()['name'])
                : (str(d.data()['email']).isNotEmpty ? str(d.data()['email']) : d.id))
    ]..sort((a, b) => a.name.compareTo(b.name));
  }

  Future<List<Transporter>> transporters() async {
    final s = await _col('transporters').get();
    return [
      for (final d in s.docs)
        Transporter(d.id, str(d.data()['name']), str(d.data()['mobile']))
    ];
  }

  // ── Stock helpers ────────────────────────────────────────────────────────

  /// One entry per product, quantities summed across lines, with the batch
  /// doc refs found up front (queries can't run inside a transaction; the
  /// transaction then re-reads each of these docs for current quantities).
  Future<List<_Stocked>> _prepareStock(
      Iterable<({String productId, String name, double qty, String batchNo})> lines) async {
    final byId = <String, _Stocked>{};
    for (final l in lines) {
      if (l.productId.isEmpty || !(l.qty > 0)) continue;
      byId.putIfAbsent(l.productId, () => _Stocked(l.productId, l.name, l.batchNo)).qty += l.qty;
    }
    await Future.wait(byId.values.map((s) async {
      final q = await _col('inventoryBatches')
          .where('productId', isEqualTo: s.productId)
          .get();
      s.batchRefs = [for (final d in q.docs) d.reference];
    }));
    return byId.values.toList();
  }

  /// Reads current stock inside [tx] and stages the FEFO deduction writes.
  /// Returns the movement rows and any low-stock notices. Reads happen before
  /// any write, as Firestore transactions require — callers must invoke this
  /// before staging their own writes.
  Future<_StockStage> _readStock(Transaction tx, List<_Stocked> items) async {
    final staged = <({_Stocked item, StockPlan plan})>[];
    for (final s in items) {
      final prod = await tx.get(_col('products').doc(s.productId));
      if (!prod.exists) {
        throw BillingException('Product "${s.name}" not found. Remove it and add it again.');
      }
      final batches = <BatchStock>[];
      for (final ref in s.batchRefs) {
        final b = await tx.get(ref);
        final d = b.data();
        if (d == null) continue;
        batches.add(BatchStock(
            id: b.id,
            batchNumber: str(d['batchNumber']),
            quantity: dbl(d['quantity']),
            expiryDate: str(d['expiryDate'])));
      }
      final p = prod.data()!;
      staged.add((
        item: s,
        plan: planStockDeduction(
          productId: s.productId,
          productName: s.name,
          qty: s.qty,
          batches: batches,
          preferredBatch: s.preferredBatch,
          product: ProductStock(
            loosePieces: dbl(p['loosePieces']),
            quantity: dbl(p['quantity'] ?? p['stock']),
            boxCapacity: p['boxCapacity'] == null ? 1 : dbl(p['boxCapacity']),
          ),
        ),
      ));
    }
    return _StockStage(staged);
  }

  void _writeStock(Transaction tx, _StockStage stage) {
    for (final s in stage.staged) {
      for (final b in s.plan.batchDeductions) {
        tx.update(_col('inventoryBatches').doc(b.batchId), {
          'quantity': b.newQty,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }
      tx.update(_col('products').doc(s.item.productId), {
        'loosePieces': s.plan.newLoosePieces,
        if (s.plan.newBoxQuantity != null) 'quantity': s.plan.newBoxQuantity,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
  }

  /// recordStockMovements — best-effort audit trail after the sale commits.
  void _recordMovements(_StockStage stage, Map<String, dynamic> meta) {
    for (final s in stage.staged) {
      for (final m in s.plan.movements) {
        _col('stockMovements').add({
          ...m,
          ...meta,
          'createdAt': FieldValue.serverTimestamp(),
        }).then((_) {}, onError: (_) {});
      }
    }
  }

  // ── POS ──────────────────────────────────────────────────────────────────

  Future<SaleResult> createPosBill(PosDraft d) async {
    final lines = d.lines.where((l) => l.qty > 0).toList();
    if (lines.isEmpty) throw BillingException('Add at least one item.');
    if (!posPaymentMethods.contains(d.method)) {
      throw BillingException('Choose a payment method.');
    }
    final totals = posTotals(lines,
        transport: d.transport, labour: d.labour, discount: d.discount);
    final grand = totals.grandTotal;
    final settle = posSettlement(d.method, grand, d.paidNow);
    final isKhata = d.method == 'Khata';

    final stock = await _prepareStock(lines.map((l) =>
        (productId: l.productId, name: l.name, qty: l.qty, batchNo: l.batchNo)));

    // Which retailer doc this sale accrues to (handleCheckout's priority:
    // picked id → phone → exact name). Resolved before the transaction
    // because it needs a query; the doc itself is re-read inside it.
    final name = d.buyer.name.trim();
    final phone = d.buyer.phone.trim();
    DocumentReference<Map<String, dynamic>>? retailerRef;
    if (phone.length >= 5 || name.isNotEmpty) {
      retailerRef = await _resolvePosCustomer(d.buyer);
    }
    final createRetailer = retailerRef == null && (phone.length >= 5 || name.isNotEmpty);
    final newRetailerRef = createRetailer ? _col('retailers').doc() : null;

    final counterRef = _col('counters').doc('posBillCounter');
    final orderRef = _col('salesOrders').doc();
    final today = isoDay(DateTime.now());
    late String number;
    late _StockStage stage;

    try {
      await _db.runTransaction((tx) async {
        // ── reads ──
        final counter = await tx.get(counterRef);
        stage = await _readStock(tx, stock);
        final retailerSnap = retailerRef != null ? await tx.get(retailerRef) : null;

        // ── writes ──
        final seq = dbl(counter.data()?['lastBillNumber']).toInt() + 1;
        number = posBillNumber(seq);
        tx.set(counterRef, {'lastBillNumber': seq}, SetOptions(merge: true));

        tx.set(orderRef, {
          'orderNumber': number,
          'retailerName': name.isEmpty ? 'Walk-in Customer' : name,
          'phoneNumber': phone,
          'address': d.buyer.address.trim(),
          'pin': d.buyer.pin.trim(),
          'taluka': d.buyer.taluka.trim(),
          'district': d.buyer.district.trim(),
          if ((d.buyer.retailerId ?? '').isNotEmpty) 'retailerId': d.buyer.retailerId,
          'lineItems': [
            for (final l in lines)
              {
                'productId': l.productId,
                'productName': l.name.isEmpty ? 'Unknown Product' : l.name,
                'mfgCompany': l.mfgCompany,
                'batchNo': l.batchNo,
                'expDate': l.expDate,
                'quantity': l.qty,
                'unit': l.unit.isEmpty ? 'pcs' : l.unit,
                'mrp': l.rate,
                'amount': l.amount,
                'gstPct': l.gstPct ?? 0,
              }
          ],
          'subtotal': totals.subtotal,
          'transportCharges': d.transport,
          'laborCharges': d.labour,
          'manualDiscount': d.discount,
          'discount': d.discount,
          'grandTotal': grand,
          'paymentStatus': settle.paymentStatus,
          'paymentMethod': d.method,
          'paymentSplits': const <dynamic>[],
          'cashReceived': null,
          'changeGiven': 0,
          'loyaltyPointsRedeemed': 0,
          'amountPaid': settle.amountPaid,
          'creditAmount': settle.creditAmount,
          'note': isKhata && d.khataNote.trim().isNotEmpty ? d.khataNote.trim() : null,
          'notes': d.billNote.trim().isEmpty ? null : d.billNote.trim(),
          'previousBalance': d.previousBalance,
          'netBalance': grand + d.previousBalance,
          'status': 'delivered',
          'createdAt': FieldValue.serverTimestamp(),
          'invoiceDate': today,
        });

        _writeStock(tx, stage);

        final paidContribution = isKhata ? settle.amountPaid : grand;
        final creditContribution = isKhata ? settle.creditAmount : 0.0;
        if (retailerSnap != null && retailerSnap.exists) {
          final r = retailerSnap.data()!;
          tx.update(retailerRef!, {
            if (name.isNotEmpty) 'name': name,
            if (phone.length >= 5) 'number': phone,
            if (d.buyer.address.trim().isNotEmpty) 'atPost': d.buyer.address.trim(),
            if (d.buyer.pin.trim().isNotEmpty) 'pin': d.buyer.pin.trim(),
            if (d.buyer.taluka.trim().isNotEmpty) 'taluka': d.buyer.taluka.trim(),
            if (d.buyer.district.trim().isNotEmpty) 'district': d.buyer.district.trim(),
            'totalSales': math.max(0, dbl(r['totalSales']) + grand),
            'outstandingAmount': math.max(0, dbl(r['outstandingAmount']) + creditContribution),
            'totalPaid': math.max(0, dbl(r['totalPaid']) + paidContribution),
            'lastOrderedAt': FieldValue.serverTimestamp(),
          });
        } else if (newRetailerRef != null || (retailerSnap != null && !retailerSnap.exists)) {
          tx.set(newRetailerRef ?? _col('retailers').doc(), {
            'name': name,
            'number': phone,
            'atPost': d.buyer.address.trim(),
            'pin': d.buyer.pin.trim(),
            'taluka': d.buyer.taluka.trim(),
            'district': d.buyer.district.trim(),
            'status': 'active',
            'channel': 'pos',
            'totalSales': grand,
            'outstandingAmount': creditContribution,
            'totalPaid': paidContribution,
            'createdAt': FieldValue.serverTimestamp(),
            'lastOrderedAt': FieldValue.serverTimestamp(),
          });
        }
      });
    } on BillingException {
      rethrow;
    } on FirebaseException catch (e) {
      throw BillingException(_friendly(e));
    }

    _recordMovements(stage, {
      'type': 'sale_pos',
      'sourceType': 'POS Billing',
      'sourceId': orderRef.id,
      'sourceNumber': number,
      'date': today,
    });
    logAudit(_db, _user,
        module: 'POS Billing',
        action: 'Generate Invoice',
        entityName: name.isEmpty ? 'Walk-in Customer' : name,
        entityId: number,
        description: 'POS bill created · $number${isKhata ? ' · Khata/Credit' : ''} · mobile app',
        remarks: '₹${grand.round()} · ${d.method}');

    return SaleResult(orderRef.id, number, grand, stage.lowStockNotices());
  }

  Future<DocumentReference<Map<String, dynamic>>?> _resolvePosCustomer(PosBuyer b) async {
    if ((b.retailerId ?? '').isNotEmpty) return _col('retailers').doc(b.retailerId);
    final all = await _col('retailers').get();
    if (b.phone.trim().length >= 5) {
      for (final d in all.docs) {
        if (samePhone(d.data()['number'], b.phone)) return d.reference;
      }
    }
    final key = b.name.trim().toLowerCase();
    if (key.isNotEmpty) {
      for (final d in all.docs) {
        if (str(d.data()['name']).trim().toLowerCase() == key) return d.reference;
      }
    }
    return null;
  }

  // ── B2B ──────────────────────────────────────────────────────────────────

  Future<SaleResult> createB2bInvoice(
    B2bHeader h,
    List<B2bLine> rows, {
    required double discount,
    required double previousBalance,
    required Map<String, String> productIdByName,
  }) async {
    final active = rows.where((r) => r.isActive).toList();
    if (h.salesmanName.trim().isEmpty) {
      throw BillingException('Please select a Salesperson before saving.');
    }
    if (h.buyerName.trim().isEmpty) throw BillingException('Enter the buyer name.');
    if (active.isEmpty) throw BillingException('Please add at least one item.');
    if (active.any((r) => !(r.qty > 0))) {
      throw BillingException('Every item needs a quantity above zero.');
    }
    final gstErr = gstinError(h.buyerGstin);
    if (gstErr != null) throw BillingException(gstErr);

    // Typed-but-not-picked rows resolve by exact name, so stock still moves.
    String pid(B2bLine r) => r.productId.isNotEmpty
        ? r.productId
        : (productIdByName[r.description.trim().toLowerCase()] ?? '');

    final totals = b2bTotals(active, discount: discount);
    final net = totals.netAmount;
    final settle = b2bSettlement(h.modeOfPayment, net);
    final isCash = h.modeOfPayment == 'Cash';
    final invoiceDate = isoDay(h.invoiceDate);

    final stock = await _prepareStock(active.map((r) =>
        (productId: pid(r), name: r.description, qty: r.qty, batchNo: r.batchNo)));

    final counterRef = _col('counters').doc('b2bInvoiceCounter');
    final orderRef = _col('salesOrders').doc();
    final retailerRef = h.retailerId.isEmpty ? null : _col('retailers').doc(h.retailerId);
    final paymentRef = retailerRef?.collection('payments').doc();
    late String number;
    late _StockStage stage;

    try {
      await _db.runTransaction((tx) async {
        final counter = await tx.get(counterRef);
        stage = await _readStock(tx, stock);
        final retailer = retailerRef != null ? await tx.get(retailerRef) : null;

        final seq = dbl(counter.data()?['lastInvoiceNumber']).toInt() + 1;
        number = b2bInvoiceNumber(seq, DateTime.now());
        tx.set(counterRef, {'lastInvoiceNumber': seq}, SetOptions(merge: true));

        tx.set(orderRef, {
          'orderNumber': number,
          'invoiceType': 'B2B_GST',
          'retailerId': h.retailerId,
          'retailerName': h.buyerName.trim(),
          'buyerAddress': h.buyerAddress.trim(),
          'buyerGstin': h.buyerGstin.trim().toUpperCase(),
          'buyerContact': h.buyerContact.trim(),
          'modeOfPayment': h.modeOfPayment,
          'salesmanName': h.salesmanName.trim(),
          'salesmanId': h.salesmanId.isEmpty ? null : h.salesmanId,
          'termsOfDelivery': h.termsOfDelivery.trim(),
          'transporterId': h.transporterId.isEmpty ? null : h.transporterId,
          'transporterName': h.transporterName.isEmpty ? null : h.transporterName,
          'transporterContact': h.transporterContact.isEmpty ? null : h.transporterContact,
          'lineItems': [
            for (final r in active)
              {
                'productId': pid(r),
                'itemDescription': r.description.trim(),
                'mfgCompany': r.mfgCompany,
                'batchNo': r.batchNo,
                'expDate': r.expDate,
                'gstPct': r.gstPct,
                'per': r.per,
                'quantity': r.qty,
                'rate': r.rate,
                'grossAmount': r.gross,
              }
          ],
          'taxableValue': totals.taxable,
          'cgst': totals.cgst,
          'sgst': totals.sgst,
          'totalTax': totals.totalTax,
          'discountAmount': totals.discount,
          'roundOff': totals.roundOff,
          'netAmount': net,
          'grandTotal': net,
          'previousBalance': previousBalance,
          'netBalance': net + previousBalance,
          'invoiceDate': invoiceDate,
          'status': settle.status,
          'paymentStatus': settle.paymentStatus,
          'amountPaid': settle.amountPaid,
          'createdAt': FieldValue.serverTimestamp(),
        });

        _writeStock(tx, stage);

        if (retailer != null && retailer.exists) {
          final r = retailer.data()!;
          tx.update(retailerRef!, {
            'totalSales': math.max(0, dbl(r['totalSales']) + net),
            'outstandingAmount': math.max(0, dbl(r['outstandingAmount']) + (isCash ? 0 : net)),
            'totalPaid': math.max(0, dbl(r['totalPaid']) + (isCash ? net : 0)),
            'lastOrderedAt': FieldValue.serverTimestamp(),
          });
          if (isCash) {
            tx.set(paymentRef!, {
              'amount': net,
              'paymentDate': invoiceDate,
              'paymentMethod': 'Cash',
              'notes': 'B2B GST Invoice $number',
              'orderId': orderRef.id,
              'orderNumber': number,
              'linkedOrderIds': [orderRef.id],
              'unallocatedAmount': 0,
              'source': 'b2b_invoice_cash',
              'createdAt': FieldValue.serverTimestamp(),
            });
          }
        }
      });
    } on BillingException {
      rethrow;
    } on FirebaseException catch (e) {
      throw BillingException(_friendly(e));
    }

    _recordMovements(stage, {
      'type': 'sale_b2b',
      'sourceType': 'B2B Invoice',
      'sourceId': orderRef.id,
      'sourceNumber': number,
      'date': invoiceDate,
    });
    logAudit(_db, _user,
        module: 'B2B Invoice',
        action: 'Generate Invoice',
        entityName: h.buyerName.trim(),
        entityId: orderRef.id,
        description: 'B2B Invoice created · $number · ₹${net.round()} · mobile app',
        after: {'orderNumber': number, 'grandTotal': net, 'modeOfPayment': h.modeOfPayment});

    return SaleResult(orderRef.id, number, net, stage.lowStockNotices());
  }

  String _friendly(FirebaseException e) => switch (e.code) {
        'permission-denied' =>
          'Your role is not allowed to save this bill. Ask your admin.',
        'unavailable' || 'deadline-exceeded' =>
          'No internet connection. The bill was NOT saved — try again when online.',
        'aborted' => 'Someone else was billing at the same moment. Please tap save again.',
        _ => 'Could not save the bill (${e.code}). Nothing was saved — please try again.',
      };
}

class _StockStage {
  _StockStage(this.staged);
  final List<({_Stocked item, StockPlan plan})> staged;

  List<String> lowStockNotices() => [
        for (final s in staged)
          if (s.plan.lowStockFor(s.item.qty))
            '${s.item.name} — Stock: ${_fmtQty(s.plan.available - s.item.qty)}'
      ];
}

String _fmtQty(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);

final billingRepositoryProvider = Provider<BillingRepository?>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return null;
  return BillingRepository(ref.watch(firestoreProvider), user);
});
