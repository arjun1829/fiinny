import 'package:cloud_firestore/cloud_firestore.dart';

enum Channel { b2b, b2c, online }

extension ChannelX on Channel {
  String get label => switch (this) {
        Channel.b2b => 'B2B',
        Channel.b2c => 'POS',
        Channel.online => 'Online',
      };
}

enum PaymentState { paid, partial, pending }

extension PaymentStateX on PaymentState {
  String get label => switch (this) {
        PaymentState.paid => 'Paid',
        PaymentState.partial => 'Partial',
        PaymentState.pending => 'Pending',
      };
}

class Bill {
  const Bill({
    required this.id,
    required this.number,
    required this.customerName,
    required this.channel,
    required this.amount,
    required this.amountPaid,
    required this.paymentState,
    required this.date,
    required this.paymentMode,
    this.retailerId,
    this.phone = '',
  });

  final String id;
  final String number;
  final String customerName;
  final Channel channel;
  final double amount;
  final double amountPaid;
  final PaymentState paymentState;
  final DateTime date;
  final String paymentMode;

  /// Present only when the bill is linked to a retailer record — that's what
  /// lets a note be written to the same retailers/{id}/notes the web ERP's
  /// Customer Profile "Notes" tab reads, so it stays in sync both ways.
  final String? retailerId;
  final String phone;

  double get outstanding => (amount - amountPaid).clamp(0, double.infinity);
  bool get canCall => phone.trim().isNotEmpty;
  bool get canNote => (retailerId ?? '').isNotEmpty;

  static Bill fromSalesOrder(String id, Map<String, dynamic> d) {
    final isB2B = d['invoiceType'] == 'B2B_GST';
    final amount = _num(
        d['grandTotal'] ?? d['netAmount'] ?? d['totalAmount'] ?? d['amount']);
    final paid = _num(d['amountPaid']);
    return Bill(
      id: id,
      number: (d['orderNumber'] as String?) ?? id,
      customerName: (d['retailerName'] as String?)?.trim().isNotEmpty == true
          ? d['retailerName'] as String
          : 'Walk-in Customer',
      channel: isB2B ? Channel.b2b : Channel.b2c,
      amount: amount,
      amountPaid: paid,
      paymentState: _paymentState(d['paymentStatus'], amount, paid),
      date: businessDate(d),
      paymentMode: (d['modeOfPayment'] ?? d['paymentMethod'] ?? '') as String,
      retailerId: (d['retailerId'] as String?)?.trim().isNotEmpty == true
          ? d['retailerId'] as String
          : null,
      // POS bills carry phoneNumber; B2B invoices carry buyerContact.
      phone: ((d['phoneNumber'] ?? d['buyerContact']) as String?)?.trim() ?? '',
    );
  }

  static Bill fromOnlineOrder(String id, Map<String, dynamic> d) {
    final amount = _num(d['grandTotal'] ?? d['amount']);
    final paid = _num(d['amountPaid']);
    return Bill(
      id: id,
      number: (d['orderNumber'] as String?) ?? id,
      customerName: (d['customerName'] as String?) ??
          (d['retailerName'] as String?) ??
          'Online Customer',
      channel: Channel.online,
      amount: amount,
      amountPaid: paid,
      paymentState: _paymentState(d['paymentStatus'], amount, paid),
      date: tsToDate(d['createdAt']) ?? DateTime.now(),
      paymentMode: (d['paymentMethod'] ?? '') as String,
      retailerId: (d['retailerId'] as String?)?.trim().isNotEmpty == true
          ? d['retailerId'] as String
          : null,
      phone:
          ((d['phoneNumber'] ?? d['customerPhone']) as String?)?.trim() ?? '',
    );
  }
}

/// salesOrders carry a user-set `invoiceDate` (YYYY-MM-DD); legacy docs only
/// have createdAt. Same fallback order as AnalyticsPage.tsx.
DateTime businessDate(Map<String, dynamic> d) {
  final raw = d['invoiceDate'];
  if (raw is String && raw.isNotEmpty) {
    final parsed = DateTime.tryParse(raw);
    if (parsed != null) return DateTime(parsed.year, parsed.month, parsed.day);
  }
  final created = tsToDate(d['createdAt']);
  if (created != null) {
    return DateTime(created.year, created.month, created.day);
  }
  return DateTime.now();
}

DateTime? tsToDate(dynamic v) {
  if (v is Timestamp) return v.toDate();
  if (v is String && v.isNotEmpty) return DateTime.tryParse(v);
  if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
  return null;
}

PaymentState _paymentState(dynamic status, double amount, double paid) {
  final s = (status as String?)?.toLowerCase();
  if (s == 'paid') return PaymentState.paid;
  if (s == 'partial') return PaymentState.partial;
  if (s == 'pending') {
    return paid > 0 ? PaymentState.partial : PaymentState.pending;
  }
  // Legacy docs without paymentStatus — infer from amounts.
  if (paid >= amount && amount > 0) return PaymentState.paid;
  return paid > 0 ? PaymentState.partial : PaymentState.pending;
}

double _num(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

double asDouble(dynamic v) => _num(v);

class DailyPoint {
  const DailyPoint(this.date, this.b2b, this.b2c, this.online);
  final DateTime date;
  final double b2b;
  final double b2c;
  final double online;
  double get total => b2b + b2c + online;
}

class NamedAmount {
  const NamedAmount(this.name, this.amount, {this.retailerId, this.phone = ''});
  final String name;
  final double amount;

  /// Present for a customer due (backed by a real retailer doc); absent for a
  /// top-supplier row, which has no call/note target.
  final String? retailerId;
  final String phone;

  bool get canCall => phone.trim().isNotEmpty;
  bool get canNote => (retailerId ?? '').isNotEmpty;
}

/// All-time balance-sheet snapshot — not affected by the time filter.
/// One dated flow record (a purchase or a supplier payment), kept so the UI
/// can re-sum them for whatever time window is selected — mirrors the web's
/// posInRange/pmtsInRange filtering in AnalyticsPage.tsx.
class DatedAmount {
  const DatedAmount(this.date, this.amount);
  final DateTime date;
  final double amount;
}

class PositionSnapshot {
  const PositionSnapshot({
    required this.supplierOutstanding,
    required this.retailerOutstanding,
    required this.inventoryValue,
    required this.purchaseFlow,
    required this.paymentFlow,
    required this.topRetailerDues,
  });

  final double supplierOutstanding;
  final double retailerOutstanding;
  final double inventoryValue;
  final List<DatedAmount> purchaseFlow;
  final List<DatedAmount> paymentFlow;
  final List<NamedAmount> topRetailerDues;

  double get purchasesAllTime => purchaseFlow.fold(0, (s, d) => s + d.amount);
  double get paymentsAllTime => paymentFlow.fold(0, (s, d) => s + d.amount);
}
