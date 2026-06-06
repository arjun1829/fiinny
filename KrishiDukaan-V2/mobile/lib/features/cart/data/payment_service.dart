import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import '../../../core/constants/app_config.dart';
import '../../../core/models/cart_model.dart';

class PaymentService {
  /// Creates a Razorpay order via the existing Next.js API.
  /// Returns {orderId, amount (paise)}.
  Future<Map<String, dynamic>> createCartOrder({
    required List<CartItemModel> items,
    required String customerPhone,
  }) async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw Exception('Not authenticated');

    final response = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/payment/create-cart-order'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'items': items.map((i) => {
          'listingId': i.listingId,
          'catalogId': i.catalogId,
          'quantity': i.quantity,
          if (i.variantLabel != null) 'variantLabel': i.variantLabel,
        }).toList(),
        'customerPhone': customerPhone,
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
