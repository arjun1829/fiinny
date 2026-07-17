import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/models/cart_model.dart';
import '../../../core/models/order_model.dart';

class OrderRepository {
  final _db = FirebaseFirestore.instance;

  /// Creates one order doc per unique seller after successful payment.
  Future<void> createOrdersAfterPayment({
    required List<CartItemModel> items,
    required String customerName,
    required String customerPhone,
    required Map<String, dynamic> customerAddress,
    required String razorpayOrderId,
    required String razorpayPaymentId,
  }) async {
    final user = FirebaseAuth.instance.currentUser!;

    // Group cart items by seller
    final Map<String, List<CartItemModel>> bySeller = {};
    for (final item in items) {
      bySeller.putIfAbsent(item.sellerPhone, () => []).add(item);
    }

    final batch = _db.batch();

    for (final entry in bySeller.entries) {
      final sellerPhone = entry.key;
      final sellerItems = entry.value;
      final sellerName = sellerItems.first.sellerName;

      final subtotal = sellerItems.fold(
          0.0, (acc, i) => acc + i.price * i.quantity);

      final orderRef = _db.collection('orders').doc();
      batch.set(orderRef, {
        'customerId': user.uid,
        'customerName': customerName,
        'customerPhone': customerPhone,
        'customerAddress': customerAddress,
        // sellerId kept as phone for legacy query compatibility
        'sellerId': sellerPhone,
        // sellerPhone required by security rule: sellerPhone == myPhone()
        'sellerPhone': sellerPhone,
        'sellerName': sellerName,
        'sellerType': 'retailer',
        'items': sellerItems
            .map((i) => {
                  'catalogId': i.catalogId,
                  'name': i.catalogName,
                  if (i.catalogImage != null) 'image': i.catalogImage,
                  'price': i.price,
                  'quantity': i.quantity,
                  if (i.variantLabel != null) 'variantLabel': i.variantLabel,
                  'listingId': i.listingId,
                })
            .toList(),
        'subtotal': subtotal,
        'deliveryCharge': 0,
        'total': subtotal,
        // Rules require status == 'placed' on order create
        'status': 'placed',
        'payment': {
          'razorpayOrderId': razorpayOrderId,
          'razorpayPaymentId': razorpayPaymentId,
          'status': 'paid',
          'amount': subtotal,
        },
        'createdAt': FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }

  /// Streams orders placed BY the current customer.
  Stream<List<OrderModel>> watchCustomerOrders() {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return Stream.value([]);

    return _db
        .collection('orders')
        .where('customerId', isEqualTo: user.uid)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map(OrderModel.fromFirestore).toList());
  }

  Future<OrderModel?> fetchById(String orderId) async {
    final doc = await _db.collection('orders').doc(orderId).get();
    if (!doc.exists) return null;
    return OrderModel.fromFirestore(doc);
  }
}
