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
  });

  factory OrderModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    return OrderModel(
      id: doc.id,
      customerId: d['customerId'] as String? ?? '',
      customerName: d['customerName'] as String? ?? '',
      customerPhone: d['customerPhone'] as String? ?? '',
      customerAddress:
          (d['customerAddress'] as Map<String, dynamic>?) ?? {},
      sellerId: d['sellerId'] as String? ?? '',
      sellerName: d['sellerName'] as String? ?? '',
      sellerType: d['sellerType'] as String? ?? 'retailer',
      items: (d['items'] as List? ?? [])
          .map((e) => OrderItemModel.fromMap(e as Map<String, dynamic>))
          .toList(),
      subtotal: (d['subtotal'] as num?)?.toDouble() ?? 0.0,
      deliveryCharge: (d['deliveryCharge'] as num?)?.toDouble() ?? 0.0,
      total: (d['total'] as num?)?.toDouble() ?? 0.0,
      status: d['status'] as String? ?? 'pending',
      payment: d['payment'] != null
          ? OrderPaymentModel.fromMap(d['payment'] as Map<String, dynamic>)
          : null,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
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
        catalogId: m['catalogId'] as String? ?? '',
        name: m['name'] as String? ?? '',
        image: m['image'] as String?,
        price: (m['price'] as num?)?.toDouble() ?? 0.0,
        quantity: (m['quantity'] as num?)?.toInt() ?? 1,
        variantLabel: m['variantLabel'] as String?,
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

  const OrderPaymentModel({
    this.razorpayOrderId,
    this.razorpayPaymentId,
    required this.status,
    required this.amount,
  });

  factory OrderPaymentModel.fromMap(Map<String, dynamic> m) =>
      OrderPaymentModel(
        razorpayOrderId: m['razorpayOrderId'] as String?,
        razorpayPaymentId: m['razorpayPaymentId'] as String?,
        status: m['status'] as String? ?? 'pending',
        amount: (m['amount'] as num?)?.toDouble() ?? 0.0,
      );
}
