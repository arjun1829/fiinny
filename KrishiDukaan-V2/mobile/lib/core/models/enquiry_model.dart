import 'package:cloud_firestore/cloud_firestore.dart';

/// A lost sale a seller can still win back.
///
/// Written server-side (functions/src/notifications/enquiries.ts) whenever a
/// buyer opens checkout for a product and never completes payment. One doc per
/// SELLER of the products involved — every seller offering them for online
/// delivery, not just the shop the buyer happened to pick, since any of them
/// can still close the sale by calling.
///
/// Carries only what that one seller is allowed to see: their own lines, and
/// the buyer's name and phone. The full basket and the delivery address stay
/// on `paymentAttempts`, which is admin-only.
class EnquiryItemModel {
  final String productId;
  final String name;
  final int qty;
  final double unitPrice;
  final double lineTotal;

  const EnquiryItemModel({
    required this.productId,
    required this.name,
    required this.qty,
    required this.unitPrice,
    required this.lineTotal,
  });

  /// The line's value, falling back to qty × price when the writer didn't
  /// store a total.
  double get effectiveTotal =>
      lineTotal > 0 ? lineTotal : unitPrice * qty;

  factory EnquiryItemModel.fromMap(Map<String, dynamic> m) => EnquiryItemModel(
        productId: (m['productId'] ?? '').toString(),
        name: (m['name'] ?? 'Product').toString(),
        qty: (m['qty'] as num?)?.toInt() ?? 1,
        unitPrice: (m['unitPrice'] as num?)?.toDouble() ?? 0,
        lineTotal: (m['lineTotal'] as num?)?.toDouble() ?? 0,
      );
}

enum EnquiryStatus { open, contacted, closed }

class EnquiryModel {
  final String id;
  final String attemptId;

  /// Why the sale was lost — the buyer walked away from the payment sheet, or
  /// the payment itself was declined.
  final bool paymentFailed;
  final EnquiryStatus status;

  final String? buyerName;
  final String buyerPhone;

  final List<EnquiryItemModel> items;
  final String itemSummary;

  /// Rupees the basket was worth to THIS seller.
  final double value;

  final String? sellerNote;
  final DateTime? createdAt;
  final DateTime? contactedAt;

  const EnquiryModel({
    required this.id,
    required this.attemptId,
    required this.paymentFailed,
    required this.status,
    required this.buyerName,
    required this.buyerPhone,
    required this.items,
    required this.itemSummary,
    required this.value,
    required this.sellerNote,
    required this.createdAt,
    required this.contactedAt,
  });

  String get displayName =>
      (buyerName?.trim().isNotEmpty ?? false) ? buyerName!.trim() : 'Customer';

  bool get isOpen => status == EnquiryStatus.open;

  static EnquiryStatus _status(String? raw) {
    switch (raw) {
      case 'contacted':
        return EnquiryStatus.contacted;
      case 'closed':
        return EnquiryStatus.closed;
      default:
        return EnquiryStatus.open;
    }
  }

  factory EnquiryModel.fromDoc(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>? ?? {};
    final rawItems = d['items'];
    return EnquiryModel(
      id: doc.id,
      attemptId: (d['attemptId'] ?? '').toString(),
      paymentFailed: d['reason'] == 'failed',
      status: _status(d['status'] as String?),
      buyerName: d['buyerName'] as String?,
      buyerPhone: (d['buyerPhone'] ?? '').toString(),
      items: rawItems is List
          ? rawItems
              .whereType<Map>()
              .map((m) => EnquiryItemModel.fromMap(Map<String, dynamic>.from(m)))
              .toList()
          : const [],
      itemSummary: (d['itemSummary'] ?? '').toString(),
      value: (d['value'] as num?)?.toDouble() ?? 0,
      sellerNote: d['sellerNote'] as String?,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
      contactedAt: (d['contactedAt'] as Timestamp?)?.toDate(),
    );
  }
}
