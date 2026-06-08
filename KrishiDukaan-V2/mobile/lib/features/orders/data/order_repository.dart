import 'dart:async';
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

  /// Streams all orders for the current user — as buyer and as seller.
  /// Runs three separate queries so a permission denial on any one (e.g. phone
  /// queries when myPhone() fails in rules) never kills the other results.
  Stream<List<OrderModel>> watchCustomerOrders() {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return Stream.value([]);

    final phone = user.phoneNumber ?? '';

    final controller = StreamController<List<OrderModel>>();
    List<DocumentSnapshot> uidDocs    = [];
    List<DocumentSnapshot> buyerDocs  = [];
    List<DocumentSnapshot> sellerDocs = [];

    void emit() {
      final seen = <String>{};
      final orders = [...uidDocs, ...buyerDocs, ...sellerDocs]
          .where((d) => seen.add(d.id))
          .map((d) {
            try { return OrderModel.fromFirestore(d); } catch (_) { return null; }
          })
          .whereType<OrderModel>()
          .toList()
        ..sort((a, b) =>
            (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
      if (!controller.isClosed) controller.add(orders);
    }

    // Query 1: by Firebase Auth UID — always allowed by security rules
    final sub1 = _db.collection('orders')
        .where('customerId', isEqualTo: user.uid)
        .snapshots()
        .listen((s) { uidDocs = s.docs; emit(); }, onError: (_) {});

    // Queries 2 & 3: by phone — may be denied if myPhone() fails in rules; silenced
    StreamSubscription? sub2;
    StreamSubscription? sub3;
    if (phone.isNotEmpty) {
      sub2 = _db.collection('orders')
          .where('customerPhone', isEqualTo: phone)
          .snapshots()
          .listen((s) { buyerDocs = s.docs; emit(); }, onError: (_) {});
      sub3 = _db.collection('orders')
          .where('sellerPhone', isEqualTo: phone)
          .snapshots()
          .listen((s) { sellerDocs = s.docs; emit(); }, onError: (_) {});
    }

    controller.onCancel = () {
      sub1.cancel();
      sub2?.cancel();
      sub3?.cancel();
    };
    return controller.stream;
  }

  Future<OrderModel?> fetchById(String orderId) async {
    final doc = await _db.collection('orders').doc(orderId).get();
    if (!doc.exists) return null;
    return OrderModel.fromFirestore(doc);
  }
}
