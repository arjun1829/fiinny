import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import '../../../core/constants/app_config.dart';
import '../../../core/models/cart_model.dart';

class PaymentService {
  /// Creates a Razorpay order via the existing Next.js API.
  ///
  /// The web API `/api/payment/create-cart-order` expects:
  ///   items[].productId  – the listing / inventory doc ID
  ///   items[].sellerId   – seller phone (used for inventory lookup)
  ///   items[].sellerPhone – seller phone (redundant but accepted)
  ///   items[].qty        – quantity
  ///   userId             – Firebase Auth UID of the buyer
  ///   clientSubtotal     – rupee subtotal computed client-side
  ///   clientDelivery     – extra charges on top of the subtotal
  ///   clientGrandTotal   – clientSubtotal + clientDelivery
  ///
  /// IMPORTANT — amount contract: the server charges
  /// `serverSubtotal + clientDelivery` and has no GST field, so GST must be
  /// folded into `clientDelivery`. This mirrors the web client, which sends
  /// `clientDelivery = grandTotal - subtotal` (delivery + GST combined).
  /// Do NOT add a separate gst field here without also changing the server,
  /// or the buyer would be double-charged.
  ///
  /// Returns the full Razorpay order object. Use `result['id']` as the
  /// Razorpay order_id (NOT `result['orderId']` – that field doesn't exist).
  Future<Map<String, dynamic>> createCartOrder({
    required List<CartItemModel> items,
    required String userId,
    required double clientDelivery,
    required double clientGst,
  }) async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw Exception('Not authenticated');

    final clientSubtotal =
        items.fold<double>(0.0, (sum, i) => sum + i.price * i.quantity);
    // Fold GST into the delivery figure — see the amount contract above.
    final deliveryPlusGst = clientDelivery + clientGst;
    final clientGrandTotal = clientSubtotal + deliveryPlusGst;

    final response = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/payment/create-cart-order'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        // Map mobile cart fields → web API contract
        'items': items.map((i) => {
          // catalogId is the canonical product doc ID; the server uses it to
          // find the seller's product copy or read availability[] pricing.
          'productId': i.catalogId,
          // sellerId and sellerPhone both carry the seller phone so the
          // server-side inventory lookup succeeds on either field
          'sellerId': i.sellerPhone,
          'sellerPhone': i.sellerPhone,
          'qty': i.quantity,
        }).toList(),
        'userId': userId,
        'clientSubtotal': clientSubtotal,
        'clientDelivery': deliveryPlusGst,
        'clientGrandTotal': clientGrandTotal,
        'note': 'Mobile Cart Order',
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to create order: ${response.body}');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Verifies Razorpay payment signature via the existing Next.js API.
  Future<bool> verifyPayment({
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw Exception('Not authenticated');

    final response = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/payment/verify'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'razorpay_order_id': razorpayOrderId,
        'razorpay_payment_id': razorpayPaymentId,
        'razorpay_signature': razorpaySignature,
      }),
    );

    return response.statusCode == 200;
  }
}
