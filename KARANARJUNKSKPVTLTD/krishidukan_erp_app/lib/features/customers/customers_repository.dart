import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/audit.dart';
import '../../core/parse.dart';
import '../../core/tenant_path.dart';
import '../analytics/models.dart' show tsToDate;
import '../auth/auth_repository.dart';
import '../billing/billing_math.dart';
import 'customer.dart';

/// Fields a partner form edits — OnboardingPage.tsx's INITIAL_FORM.
class CustomerDraft {
  CustomerDraft({
    this.name = '',
    this.number = '',
    this.email = '',
    this.state = 'Maharashtra',
    this.district = '',
    this.taluka = '',
    this.atPost = '',
    this.pin = '',
    this.fullAddress = '',
    this.gstin = '',
    this.licenseNumber = '',
  });

  factory CustomerDraft.from(Customer c) => CustomerDraft(
        name: c.name,
        number: c.phone,
        email: c.email,
        state: c.state.isEmpty ? 'Maharashtra' : c.state,
        district: c.district,
        taluka: c.taluka,
        atPost: c.atPost,
        pin: c.pin,
        fullAddress: c.fullAddress,
        gstin: c.gstin,
        licenseNumber: c.licenseNumber,
      );

  String name;
  String number;
  String email;
  String state;
  String district;
  String taluka;
  String atPost;
  String pin;
  String fullAddress;
  String gstin;
  String licenseNumber;

  Map<String, dynamic> toFields() => {
        'name': name.trim(),
        'number': number.trim(),
        'email': email.trim(),
        'state': state.trim(),
        'district': district.trim(),
        'taluka': taluka.trim(),
        'atPost': atPost.trim(),
        'pin': pin.trim(),
        'fullAddress': fullAddress.trim(),
        'gstin': gstin.trim().toUpperCase(),
        'licenseNumber': licenseNumber.trim(),
        // Kept for backward compatibility, exactly as OnboardingPage writes it.
        'location': '${atPost.trim()}, ${taluka.trim()}, ${district.trim()}',
      };
}

const paymentMethods = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'];

class CustomersRepository {
  CustomersRepository(this._db, this._user);

  final FirebaseFirestore _db;
  final AppUser _user;

  CollectionReference<Map<String, dynamic>> _col(String name) =>
      tenantCollection(_db, _user.tenantId, name);

  Stream<List<Customer>> watchCustomers() =>
      _col('retailers').snapshots().map((s) {
        var list = [
          for (final d in s.docs)
            if (d.data()['deleted'] != true) Customer.fromDoc(d.id, d.data())
        ];
        if (_user.can.isScopedToAssignedRetailers) list = _scope(list);
        list.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
        return list;
      });

  /// useSalesFilter.ts: assigned retailers ∪ retailers in assigned districts;
  /// neither configured → sees nothing.
  List<Customer> _scope(List<Customer> all) {
    final ids = _user.assignedRetailers.toSet();
    final districts =
        _user.assignedDistricts.map((d) => d.toLowerCase()).toSet();
    if (ids.isEmpty && districts.isEmpty) return const [];
    return all
        .where((c) =>
            ids.contains(c.id) || districts.contains(c.district.toLowerCase()))
        .toList();
  }

  /// Phone already on another customer — warned before creating a duplicate
  /// record that would split one person's balance across two docs.
  Future<Customer?> findByPhone(String phone, {String? exceptId}) async {
    final key = phoneKey(phone);
    if (key.length < 6) return null;
    final s = await _col('retailers').get();
    for (final d in s.docs) {
      if (d.id == exceptId) continue;
      if (samePhone(d.data()['number'] ?? d.data()['phone'], key)) {
        return Customer.fromDoc(d.id, d.data());
      }
    }
    return null;
  }

  Future<String> save(CustomerDraft f, {Customer? existing}) async {
    if (existing != null) {
      // Profile fields only — balances are owned by billing and payments.
      await _col('retailers').doc(existing.id).update(f.toFields());
      logAudit(_db, _user,
          module: 'Manage Retailers',
          action: 'Update',
          entityName: f.name.trim(),
          entityId: existing.id,
          description: 'Customer updated from mobile app');
      return existing.id;
    }
    final ref = await _col('retailers').add({
      ...f.toFields(),
      'country': 'India',
      'portfolioSize': 'Small',
      'createdAt': FieldValue.serverTimestamp(),
      'totalSales': 0,
      'totalPaid': 0,
      'outstandingAmount': 0,
    });
    logAudit(_db, _user,
        module: 'Manage Retailers',
        action: 'Create',
        entityName: f.name.trim(),
        entityId: ref.id,
        description: 'Customer created from mobile app');
    return ref.id;
  }

  // ── Ledgers ──────────────────────────────────────────────────────────────

  Future<CustomerLedger> ledger(Customer c) async {
    if (c.isPosCustomer) {
      // fetchLiveOutstanding reads the latest 500 bills and matches by name /
      // phone; bills explicitly linked by retailerId are added on top so an
      // older linked bill is never missed.
      final results = await Future.wait([
        _col('salesOrders').orderBy('createdAt', descending: true).limit(500).get(),
        _col('salesOrders').where('retailerId', isEqualTo: c.id).get(),
      ]);
      return buildKhataLedger([...results[0].docs, ...results[1].docs], c);
    }

    final bills =
        await _col('salesOrders').where('retailerId', isEqualTo: c.id).get();
    if (!_user.can.canViewPayments) {
      // Sales role: no access to payments — show bills, cached balance.
      final b2b = buildB2bLedger(bills.docs, const []);
      return CustomerLedger(
        entries: b2b.entries,
        outstanding: c.cachedDue,
        totalBilled: b2b.totalBilled,
        totalReceived: c.totalPaid,
        paymentsVisible: false,
      );
    }
    final payments =
        await _col('retailers').doc(c.id).collection('payments').get();
    return buildB2bLedger(bills.docs, payments.docs);
  }

  // ── Payments ─────────────────────────────────────────────────────────────

  /// handleRecordPayment (WorklistDetailsPage.tsx) for a B2B partner, made
  /// atomic: payment id from settings/paymentCounter, the payment doc and the
  /// retailer's totals all commit together or not at all.
  Future<String> recordPartnerPayment({
    required Customer c,
    required double amount,
    required String method,
    required DateTime date,
    String accountName = '',
    String transactionRef = '',
    String notes = '',
  }) async {
    if (!(amount > 0)) throw ArgumentError('Amount must be positive');
    final counterRef = _col('settings').doc('paymentCounter');
    final retailerRef = _col('retailers').doc(c.id);
    final paymentRef = retailerRef.collection('payments').doc();
    late String paymentId;

    await _db.runTransaction((tx) async {
      final counter = await tx.get(counterRef);
      final retailer = await tx.get(retailerRef);
      if (!retailer.exists) throw StateError('Customer no longer exists');
      // Keyed by the current calendar year, not the payment date — same as
      // generatePaymentId() so both clients share one PAY- series.
      final key = 'seq_${DateTime.now().year}';
      final seq = dbl(counter.data()?[key]).toInt() + 1;
      paymentId = 'PAY-${DateTime.now().year}-${seq.toString().padLeft(4, '0')}';
      final r = retailer.data()!;

      tx.set(counterRef, {key: seq}, SetOptions(merge: true));
      tx.set(paymentRef, {
        'paymentId': paymentId,
        'amount': amount,
        'paymentDate': isoDay(date),
        'paymentMethod': method,
        'accountDetails': {
          'accountName': accountName.trim(),
          'transactionRef': transactionRef.trim(),
        },
        'notes': notes.trim(),
        'linkedOrderIds': <String>[],
        'unallocatedAmount': amount,
        'createdAt': FieldValue.serverTimestamp(),
      });
      tx.update(retailerRef, {
        'totalPaid': dbl(r['totalPaid']) + amount,
        'outstandingAmount': math.max(0, dbl(r['outstandingAmount']) - amount),
      });
    });
    logAudit(_db, _user,
        module: 'Worklist',
        action: 'Record Payment',
        entityName: c.name,
        entityId: paymentId,
        description: 'Payment recorded · ₹${amount.toStringAsFixed(0)} · $method',
        after: {'amount': amount, 'paymentMethod': method, 'paymentDate': isoDay(date)});
    return paymentId;
  }

  /// submitPayment() in DigitalKhataPage.tsx with no specific invoice: the
  /// amount is spread over the customer's open bills oldest-first. Runs in a
  /// transaction that re-reads every bill, so two people collecting at once
  /// can never double-apply. Returns the amount actually applied (capped at
  /// what is owed).
  Future<double> collectKhataPayment({
    required Customer c,
    required double amount,
    required String method,
    required DateTime date,
    String transactionRef = '',
    String notes = '',
  }) async {
    if (!(amount > 0)) throw ArgumentError('Amount must be positive');
    final ledger = await this.ledger(c);
    return collectKhataOnBills(
      billIds: [
        for (final e in ledger.entries)
          if (!e.isPayment && e.outstanding > 0 && e.billId != null) e.billId!
      ],
      customerName: c.name,
      entityId: c.id,
      amount: amount,
      method: method,
      date: date,
      transactionRef: transactionRef,
      notes: notes,
    );
  }

  /// The FIFO Khata collection over an explicit set of bills (one Digital
  /// Khata customer row). Every bill is re-read inside the transaction.
  Future<double> collectKhataOnBills({
    required List<String> billIds,
    required String customerName,
    required String entityId,
    required double amount,
    required String method,
    required DateTime date,
    String transactionRef = '',
    String notes = '',
  }) async {
    if (!(amount > 0)) throw ArgumentError('Amount must be positive');
    final openIds = billIds;
    if (openIds.isEmpty) return 0;

    var applied = 0.0;
    await _db.runTransaction((tx) async {
      final fresh = <({String id, DateTime date, double paid, double outstanding})>[];
      for (final id in openIds) {
        final snap = await tx.get(_col('salesOrders').doc(id));
        final e = snap.data();
        if (e == null || isVoidBill(e)) continue;
        final bal = khataBillBalance(e);
        fresh.add((
          id: id,
          date: tsToDate(e['createdAt']) ?? DateTime.tryParse(str(e['invoiceDate'])) ?? DateTime(2000),
          paid: bal.paid,
          outstanding: bal.outstanding,
        ));
      }
      final owed = fresh.fold<double>(0, (s, b) => s + b.outstanding);
      final toApply = math.min(amount, owed);
      applied = toApply;
      final grandById = {for (final b in fresh) b.id: b.paid + b.outstanding};
      for (final a in allocateFifo(fresh, toApply)) {
        final settled = a.newAmountPaid >= (grandById[a.billId] ?? 0) - 0.005;
        tx.update(_col('salesOrders').doc(a.billId), {
          'amountPaid': round2(a.newAmountPaid),
          // The web Khata leaves paymentStatus as it was, so a fully paid
          // bill kept reading "Partial" in Order History. Keep it in step.
          'paymentStatus': settled ? 'Paid' : 'Partial',
          'paymentMethod': method,
          'paymentDate': isoDay(date),
          'transactionRef': transactionRef.trim().isEmpty ? null : transactionRef.trim(),
          'paymentNotes': notes.trim().isEmpty ? null : notes.trim(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }
    });

    if (applied > 0) {
      logAudit(_db, _user,
          module: 'Digital Khata',
          action: 'Record Payment',
          entityName: customerName,
          entityId: entityId,
          description: 'Khata payment · ₹${applied.toStringAsFixed(0)} · $method');
    }
    return applied;
  }

  /// submitAdd() in DigitalKhataPage.tsx: a manual udhari entry is a
  /// salesOrders doc tagged source:'khata' dated by its createdAt, and the
  /// customer is upserted into retailers (phone → name → new, balances 0) so
  /// POS can find them. The loyalty/customer-master write is best-effort.
  Future<void> addUdhari({
    required String name,
    required String phone,
    required String address,
    required String pin,
    required double billAmount,
    required double paidAmount,
    required DateTime date,
    String note = '',
  }) async {
    final nm = name.trim();
    if (nm.isEmpty) throw ArgumentError('Customer name is required.');
    if (!(billAmount > 0)) throw ArgumentError('Bill amount must be greater than 0.');
    final paid = math.min(math.max(0.0, paidAmount), billAmount);
    final ph = phoneKey(phone);
    final ph10 = ph.length > 10 ? ph.substring(0, 10) : ph;

    final ref = await _col('salesOrders').add({
      'retailerName': nm,
      'phoneNumber': ph10,
      'address': address.trim(),
      'pin': pin.trim(),
      'grandTotal': billAmount,
      'amountPaid': paid,
      'note': note.trim().isEmpty ? null : note.trim(),
      'source': 'khata',
      'createdAt': Timestamp.fromDate(date),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    if (ph10.isNotEmpty) {
      _col('loyalty').doc(ph10).set(
        {'name': nm, 'phone': ph10, 'updatedAt': FieldValue.serverTimestamp()},
        SetOptions(merge: true),
      ).then((_) {}, onError: (_) {});
    }
    try {
      final all = await _col('retailers').get();
      DocumentReference<Map<String, dynamic>>? existing;
      if (ph10.isNotEmpty) {
        existing = all.docs
            .where((d) => samePhone(d.data()['number'], ph10))
            .map((d) => d.reference)
            .firstOrNull;
      }
      existing ??= all.docs
          .where((d) => str(d.data()['name']).trim().toLowerCase() == nm.toLowerCase())
          .map((d) => d.reference)
          .firstOrNull;
      if (existing != null) {
        await existing.update({
          'name': nm,
          if (ph10.isNotEmpty) 'number': ph10,
          if (address.trim().isNotEmpty) 'atPost': address.trim(),
          if (pin.trim().isNotEmpty) 'pin': pin.trim(),
          'lastOrderedAt': FieldValue.serverTimestamp(),
        });
      } else {
        await _col('retailers').add({
          'name': nm, 'number': ph10, 'atPost': address.trim(), 'pin': pin.trim(),
          'taluka': '', 'district': '', 'status': 'active', 'channel': 'pos',
          'totalSales': 0, 'outstandingAmount': 0, 'totalPaid': 0,
          'createdAt': FieldValue.serverTimestamp(),
          'lastOrderedAt': FieldValue.serverTimestamp(),
        });
      }
    } catch (_) {
      // Same as the web: never fail the udhari entry on this best-effort sync.
    }
    logAudit(_db, _user,
        module: 'Digital Khata',
        action: 'Create',
        entityName: nm,
        entityId: ref.id,
        description: 'Udhari entry · ₹${billAmount.toStringAsFixed(0)} · mobile app');
  }
}

final customersRepositoryProvider = Provider<CustomersRepository?>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return null;
  return CustomersRepository(ref.watch(firestoreProvider), user);
});

final customersProvider = StreamProvider<List<Customer>>((ref) {
  final repo = ref.watch(customersRepositoryProvider);
  if (repo == null) return Stream.value(const []);
  return repo.watchCustomers();
});

/// Keyed by id, not by the Customer object: the customers stream emits new
/// instances on every change, which would otherwise refetch the ledger (up
/// to 500 bills) each time any retailer doc moved. Refresh with invalidate.
final customerLedgerProvider =
    FutureProvider.autoDispose.family<CustomerLedger, String>((ref, id) async {
  final repo = ref.watch(customersRepositoryProvider);
  if (repo == null) throw StateError('Not signed in');
  final all = await ref.read(customersProvider.future);
  final c = all.where((x) => x.id == id).firstOrNull;
  if (c == null) throw StateError('Customer not found');
  return repo.ledger(c);
});
