import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/parse.dart';
import '../analytics/models.dart' show tsToDate;
import '../billing/billing_math.dart';

/// A `retailers` doc — both B2B partners (worklist) and POS counter
/// customers (channel: 'pos') live in the same collection.
class Customer {
  const Customer({
    required this.id,
    required this.name,
    required this.phone,
    this.atPost = '',
    this.taluka = '',
    this.district = '',
    this.state = '',
    this.pin = '',
    this.gstin = '',
    this.email = '',
    this.fullAddress = '',
    this.licenseNumber = '',
    this.channel = '',
    this.totalSales = 0,
    this.totalPaid = 0,
    this.outstandingAmount = 0,
    this.lastOrderedAt,
  });

  final String id;
  final String name;
  final String phone;
  final String atPost;
  final String taluka;
  final String district;
  final String state;
  final String pin;
  final String gstin;
  final String email;
  final String fullAddress;
  final String licenseNumber;
  final String channel;
  final double totalSales;
  final double totalPaid;
  final double outstandingAmount;
  final DateTime? lastOrderedAt;

  bool get isPosCustomer => channel == 'pos';

  /// Cached due shown in lists (totalSales − totalPaid, the figure the
  /// Position tab already uses). The detail screen recomputes it live.
  double get cachedDue => (totalSales - totalPaid).clamp(0, double.infinity);

  /// B2B invoice buyer address: "atPost, Tal. taluka, Dist. district".
  String get b2bAddress =>
      '$atPost, Tal. $taluka, Dist. $district'.trim();

  String get placeLine => [atPost, taluka, district]
      .where((s) => s.trim().isNotEmpty)
      .join(', ');

  static Customer fromDoc(String id, Map<String, dynamic> d) => Customer(
        id: id,
        name: str(d['name']).trim().isEmpty ? 'Unnamed' : str(d['name']).trim(),
        phone: str(d['number'] ?? d['phone']).trim(),
        atPost: str(d['atPost']),
        taluka: str(d['taluka']),
        district: str(d['district']),
        state: str(d['state']),
        pin: str(d['pin']),
        gstin: str(d['gstin']),
        email: str(d['email']),
        fullAddress: str(d['fullAddress']),
        licenseNumber: str(d['licenseNumber']),
        channel: str(d['channel']),
        totalSales: dbl(d['totalSales']),
        totalPaid: dbl(d['totalPaid']),
        outstandingAmount: dbl(d['outstandingAmount']),
        lastOrderedAt: tsToDate(d['lastOrderedAt']),
      );
}

/// One row of a customer's ledger: a bill (debit) or a payment (credit).
class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.date,
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.isPayment,
    this.outstanding = 0,
    this.billId,
  });

  final String id;
  final DateTime date;
  final String title;
  final String subtitle;
  final double amount;
  final bool isPayment;

  /// Khata bills only — what is still open on that bill.
  final double outstanding;

  /// Set for bills so the row can open the invoice.
  final String? billId;
}

class CustomerLedger {
  const CustomerLedger({
    required this.entries,
    required this.outstanding,
    required this.totalBilled,
    required this.totalReceived,
    required this.paymentsVisible,
  });

  final List<LedgerEntry> entries;

  /// Live, never the cached counter on the retailer doc.
  final double outstanding;
  final double totalBilled;
  final double totalReceived;

  /// False for roles that can't read retailers/{id}/payments — the balance
  /// then falls back to the cached counter and the screen says so.
  final bool paymentsVisible;
}

/// B2B worklist ledger — applyRetailerBalance() in B2BInvoicePage.tsx:
/// Σ bill totals (non-deleted) − Σ payments.
CustomerLedger buildB2bLedger(
  List<QueryDocumentSnapshot<Map<String, dynamic>>> bills,
  List<QueryDocumentSnapshot<Map<String, dynamic>>> payments,
) {
  final entries = <LedgerEntry>[];
  var billed = 0.0, received = 0.0;
  for (final d in bills) {
    final e = d.data();
    if (e['deleted'] == true) continue;
    final amt = dbl(e['grandTotal'] ?? e['netAmount'] ?? e['totalAmount']);
    billed += amt;
    entries.add(LedgerEntry(
      id: d.id,
      billId: d.id,
      date: _billDate(e),
      title: str(e['orderNumber']).isEmpty ? d.id : str(e['orderNumber']),
      subtitle: str(e['modeOfPayment'] ?? e['paymentMethod']),
      amount: amt,
      isPayment: false,
    ));
  }
  for (final d in payments) {
    final p = d.data();
    final amt = dbl(p['amount']);
    received += amt;
    entries.add(LedgerEntry(
      id: d.id,
      date: tsToDate(p['paymentDate']) ?? tsToDate(p['createdAt']) ?? DateTime(2000),
      title: str(p['paymentId']).isNotEmpty ? str(p['paymentId']) : 'Payment',
      subtitle: [str(p['paymentMethod']), str(p['notes'])]
          .where((s) => s.isNotEmpty)
          .join(' · '),
      amount: amt,
      isPayment: true,
    ));
  }
  entries.sort((a, b) => b.date.compareTo(a.date));
  return CustomerLedger(
    entries: entries,
    outstanding: (billed - received).clamp(0, double.infinity),
    totalBilled: billed,
    totalReceived: received,
    paymentsVisible: true,
  );
}

/// Digital Khata ledger for a counter customer: every non-B2B, non-void bill
/// matched by name (else phone), each carrying its own open balance.
CustomerLedger buildKhataLedger(
  Iterable<QueryDocumentSnapshot<Map<String, dynamic>>> bills,
  Customer c,
) {
  final entries = <LedgerEntry>[];
  final seen = <String>{};
  var billed = 0.0, received = 0.0, open = 0.0;
  for (final d in bills) {
    if (!seen.add(d.id)) continue;
    final e = d.data();
    if (str(e['invoiceType']) == 'B2B_GST' || isVoidBill(e)) continue;
    final byId = str(e['retailerId']) == c.id;
    if (!byId && !khataCustomerMatches(e, c.name, c.phone)) continue;
    final bal = khataBillBalance(e);
    billed += bal.grand;
    received += bal.paid.clamp(0, bal.grand);
    open += bal.outstanding;
    entries.add(LedgerEntry(
      id: d.id,
      billId: d.id,
      date: _billDate(e),
      title: str(e['orderNumber']).isEmpty ? 'Khata entry' : str(e['orderNumber']),
      subtitle: str(e['paymentMethod']),
      amount: bal.grand,
      outstanding: bal.outstanding,
      isPayment: false,
    ));
  }
  entries.sort((a, b) => b.date.compareTo(a.date));
  return CustomerLedger(
    entries: entries,
    outstanding: open,
    totalBilled: billed,
    totalReceived: received,
    paymentsVisible: true,
  );
}

DateTime _billDate(Map<String, dynamic> e) {
  final raw = str(e['invoiceDate']);
  return DateTime.tryParse(raw) ?? tsToDate(e['createdAt']) ?? DateTime(2000);
}
