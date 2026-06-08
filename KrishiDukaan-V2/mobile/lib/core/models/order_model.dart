import 'package:cloud_firestore/cloud_firestore.dart';

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
  final double total;
  final String status;
  final OrderPaymentModel? payment;
  final DateTime? createdAt;
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
    required this.total,
    required this.status,
    this.payment,
    this.createdAt,
    this.invoiceNumber,
  });

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

    final fsStatus = d['status']?.toString() ?? 'pending';
    final status = switch (fsStatus) {
      'placed' => 'pending',
      'out_for_delivery' => 'dispatched',
      'rejected' => 'cancelled',
      _ => fsStatus,
    };

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
      total: (d['total'] as num?)?.toDouble() ??
          (d['grandTotal'] as num?)?.toDouble() ??
          (d['subtotal'] as num?)?.toDouble() ??
          0.0,
      status: status,
      payment: paymentModel,
      createdAt: createdAtDate,
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

  const OrderPaymentModel({
    this.razorpayOrderId,
    this.razorpayPaymentId,
    required this.status,
    required this.amount,
    this.paidAt,
  });

  factory OrderPaymentModel.fromMap(Map<String, dynamic> m) =>
      OrderPaymentModel(
        razorpayOrderId: m['razorpayOrderId'] as String?,
        razorpayPaymentId: m['razorpayPaymentId'] as String?,
        status: m['status'] as String? ?? 'pending',
        amount: (m['amount'] as num?)?.toDouble() ?? 0.0,
        paidAt: m['paidAt'] as String?,
      );
}
