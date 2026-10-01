import 'package:cloud_firestore/cloud_firestore.dart';

import '../utils/delivery_utils.dart';

class OrderModel {
  final String id;
  final String customerId;
  final String customerName;
  final String customerPhone;
  final Map<String, dynamic> customerAddress;
  final String sellerId; // seller phone
  final String sellerName;
  final String sellerType;
  final List<OrderItemModel> items;
  final double subtotal;
  final double deliveryCharge;

  /// Total GST for this order (written as `totalGst` at checkout) — included
  /// and added together, for the invoice.
  final double totalGst;

  /// The part of [totalGst] that was ADDED to the payable total, when the
  /// order records it (`totalGstAdded`). Null on orders older than that field:
  /// see [gstAdded].
  final double? totalGstAdded;

  /// The delivery charge as it was made up when charged (slab, extra, free,
  /// waived, which slab set) — frozen on the order so nothing is recomputed
  /// from today's settings. Null on older orders.
  final DeliveryBreakdown? deliveryBreakdown;

  /// The state the delivery went to; decided the within/outside-state slab.
  final String? customerDeliveryState;

  final double total;
  final String status;
  final OrderPaymentModel? payment;
  final DateTime? createdAt;

  /// Status transitions, each `{status, at}` with an ISO timestamp. The
  /// payout hold runs from the `delivered` entry, so this is required for
  /// earnings — it was previously not parsed at all.
  final List<Map<String, String>> statusHistory;
  final String? invoiceNumber;

  const OrderModel({
    required this.id,
    required this.customerId,
    required this.customerName,
    required this.customerPhone,
    required this.customerAddress,
    required this.sellerId,
    required this.sellerName,
    required this.sellerType,
    required this.items,
    required this.subtotal,
    required this.deliveryCharge,
    this.totalGst = 0,
    this.totalGstAdded,
    this.deliveryBreakdown,
    this.customerDeliveryState,
    required this.total,
    required this.status,
    this.payment,
    this.createdAt,
    this.statusHistory = const [],
    this.invoiceNumber,
  });

  /// GST added on top of the items. Orders from before `totalGstAdded` existed
  /// charged their GST on top, which shows as a grand total above items +
  /// delivery — the same inference the web invoice makes.
  double get gstAdded {
    if (totalGstAdded != null) return totalGstAdded!;
    if (totalGst <= 0) return 0;
    return total > subtotal + deliveryCharge + 0.01 ? totalGst : 0;
  }

  /// GST that was already inside the item prices.
  double get gstIncluded {
    final v = totalGst - gstAdded;
    return v > 0.005 ? v : 0;
  }

  factory OrderModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>? ?? {};
    final rawAddress = d['customerAddress'];
    final Map<String, dynamic> customerAddressMap = {};
    if (rawAddress is Map) {
      rawAddress.forEach((key, val) {
        customerAddressMap[key.toString()] = val;
      });
    } else if (rawAddress is String) {
      customerAddressMap['name'] = d['customerName']?.toString() ?? '';
      customerAddressMap['address'] = rawAddress;
      customerAddressMap['city'] = '';
      customerAddressMap['pincode'] = '';
    }

    // Canonical Firestore status, used verbatim. The old mapping to mobile-only
    // names ('pending'/'dispatched'/'cancelled') was removed: it renamed
    // out_for_delivery to 'dispatched', which collided once 'dispatched' became
    // a real status between accepted and out_for_delivery.
    final status = d['status']?.toString() ?? 'placed';

    final rawItems = d['items'];
    final List<OrderItemModel> itemsList = [];
    if (rawItems is List) {
      for (final e in rawItems) {
        if (e is Map) {
          try {
            itemsList.add(OrderItemModel.fromMap(Map<String, dynamic>.from(e)));
          } catch (_) {
            // Ignore malformed item
          }
        }
      }
    }

    final rawPayment = d['payment'];
    OrderPaymentModel? paymentModel;
    if (rawPayment is Map) {
      try {
        paymentModel = OrderPaymentModel.fromMap(Map<String, dynamic>.from(rawPayment));
      } catch (_) {
        // Ignore malformed payment
      }
    }

    DateTime? createdAtDate;
    final rawCreatedAt = d['createdAt'];
    if (rawCreatedAt is Timestamp) {
      createdAtDate = rawCreatedAt.toDate();
    } else if (rawCreatedAt is String) {
      createdAtDate = DateTime.tryParse(rawCreatedAt);
    }

    return OrderModel(
      id: doc.id,
      customerId: d['customerId']?.toString() ?? '',
      customerName: d['customerName']?.toString() ?? '',
      customerPhone: d['customerPhone']?.toString() ?? '',
      customerAddress: customerAddressMap,
      sellerId: d['sellerId']?.toString() ?? '',
      sellerName: d['sellerName']?.toString() ?? '',
      sellerType: d['sellerType']?.toString() ?? 'retailer',
      items: itemsList,
      subtotal: (d['subtotal'] as num?)?.toDouble() ?? 0.0,
      deliveryCharge: (d['deliveryCharge'] as num?)?.toDouble() ?? 0.0,
      totalGst: (d['totalGst'] as num?)?.toDouble() ?? 0.0,
      totalGstAdded: (d['totalGstAdded'] as num?)?.toDouble(),
      deliveryBreakdown: d['deliveryBreakdown'] is Map
          ? DeliveryBreakdown.fromMap(d['deliveryBreakdown'] as Map)
          : null,
      customerDeliveryState: (d['customerDeliveryState'] ??
              (d['deliveryBreakdown'] is Map
                  ? (d['deliveryBreakdown'] as Map)['customerDeliveryState']
                  : null))
          ?.toString(),
      total: (d['total'] as num?)?.toDouble() ??
          (d['grandTotal'] as num?)?.toDouble() ??
          (d['subtotal'] as num?)?.toDouble() ??
          0.0,
      status: status,
      payment: paymentModel,
      createdAt: createdAtDate,
      statusHistory: (d['statusHistory'] as List?)
              ?.whereType<Map>()
              .map((e) => {
                    'status': (e['status'] ?? '').toString(),
                    'at': (e['at'] ?? '').toString(),
                  })
              .toList() ??
          const [],
      invoiceNumber: d['invoiceNumber']?.toString(),
    );
  }
}

class OrderItemModel {
  final String catalogId;
  final String name;
  final String? image;
  final double price;
  final int quantity;
  final String? variantLabel;

  const OrderItemModel({
    required this.catalogId,
    required this.name,
    this.image,
    required this.price,
    required this.quantity,
    this.variantLabel,
  });

  double get lineTotal => price * quantity;

  factory OrderItemModel.fromMap(Map<String, dynamic> m) => OrderItemModel(
        catalogId: m['catalogId'] as String? ?? m['productId'] as String? ?? '',
        name: m['name'] as String? ?? '',
        image: m['image'] as String?,
        price: (m['price'] as num?)?.toDouble() ?? 0.0,
        quantity: (m['quantity'] as num?)?.toInt() ?? (m['qty'] as num?)?.toInt() ?? 1,
        variantLabel: m['variantLabel'] as String? ?? m['variantUnit'] as String?,
      );

  Map<String, dynamic> toMap() => {
        'catalogId': catalogId,
        'name': name,
        if (image != null) 'image': image,
        'price': price,
        'quantity': quantity,
        if (variantLabel != null) 'variantLabel': variantLabel,
      };
}

class OrderPaymentModel {
  final String? razorpayOrderId;
  final String? razorpayPaymentId;
  final String status;
  final double amount;
  final String? paidAt;

  // ── Payout fields, written by the web payout flow ─────────────────────
  // Mirrors app/dashboard/_lib/seller-earnings.ts so the app and the web
  // dashboard can never disagree about what a seller is owed.

  /// Razorpay's own charge on this payment, fetched post-capture. Null until
  /// it has been looked up — treated as 0 rather than guessed, so the seller
  /// is never shown a deduction that was invented.
  final double? gatewayFee;
  final double? gatewayTax;

  /// Set once a Route transfer has actually paid this order out.
  final String? transferId;
  final String? transferredAt;

  /// Amount already refunded to the customer. A PARTIAL refund leaves the
  /// order's status unchanged, so this must be subtracted or the seller would
  /// appear owed the full original amount.
  final double? refundedAmount;
  final String? refundId;

  const OrderPaymentModel({
    this.razorpayOrderId,
    this.razorpayPaymentId,
    required this.status,
    required this.amount,
    this.paidAt,
    this.gatewayFee,
    this.gatewayTax,
    this.transferId,
    this.transferredAt,
    this.refundedAmount,
    this.refundId,
  });

  factory OrderPaymentModel.fromMap(Map<String, dynamic> m) =>
      OrderPaymentModel(
        razorpayOrderId: m['razorpayOrderId'] as String?,
        razorpayPaymentId: m['razorpayPaymentId'] as String?,
        status: m['status'] as String? ?? 'pending',
        amount: (m['amount'] as num?)?.toDouble() ?? 0.0,
        paidAt: m['paidAt'] as String?,
        gatewayFee: (m['gatewayFee'] as num?)?.toDouble(),
        gatewayTax: (m['gatewayTax'] as num?)?.toDouble(),
        transferId: m['transferId'] as String?,
        transferredAt: m['transferredAt'] as String?,
        refundedAmount: (m['refundedAmount'] as num?)?.toDouble(),
        refundId: m['refundId'] as String?,
      );
}
