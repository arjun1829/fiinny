import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import '../../../core/constants/app_config.dart';
import '../../../core/models/cart_model.dart';

/// Result of asking Razorpay directly whether an order actually has a
/// captured payment. See [PaymentService.checkOrderStatus].
class PaymentReconciliation {
  /// True only when Razorpay confirms the money was actually taken.
  final bool captured;

  /// Populated whenever Razorpay found a payment attempt against the order,
  /// captured or not — useful for support/debugging even when [captured] is
  /// false.
  final String? paymentId;

  /// True only when the reconciliation call itself could not be completed
  /// (network/server error). The customer's actual payment status is
  /// UNKNOWN in that case, which the UI must word differently from a
  /// confirmed failure.
  final bool checkFailed;

  /// The Razorpay order's own `notes` (seatCount, durationMonths, etc.) when
  /// [captured] is true — the same trusted, server-computed values
  /// /api/payment/verify reads for a normal success. Lets a reconciled
  /// subscription purchase (see subscription_screen.dart) recover the seat
  /// count it paid for without a second round-trip that would need a
  /// signature this path doesn't have.
  final Map<String, dynamic>? notes;

  const PaymentReconciliation({
    required this.captured,
    this.paymentId,
    required this.checkFailed,
    this.notes,
  });
}

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
  /// AMOUNT CONTRACT — the server is the authority on what is charged.
  ///
  /// A current server (create-cart-order with lib/cart-pricing) prices the
  /// items itself — by the pack size in `items[].variantUnit` — and computes
  /// delivery (slab chosen by `customerDeliveryState`, extra, free) and any
  /// exclusive GST itself. `clientGstAdded` being present is what marks this a
  /// current client; the client figures below are then only compared, never
  /// trusted. The response carries `sellerBreakdown` (per seller: subtotal,
  /// GST, delivery breakdown, total) and `amount` (paise) — callers show the
  /// customer THAT and write the order from it.
  ///
  /// A server that has not been redeployed yet ignores `clientGstAdded` and
  /// charges `serverSubtotal + clientDelivery`, so `clientDelivery` still carries
  /// delivery AND the added GST folded together, as it always has. A current
  /// server ignores that field for a current client. Both therefore charge the
  /// right amount whichever is live.
  ///
  /// Returns the full Razorpay order object. Use `result['id']` as the
  /// Razorpay order_id (NOT `result['orderId']` – that field doesn't exist).
  Future<Map<String, dynamic>> createCartOrder({
    required List<CartItemModel> items,
    required String userId,

    /// The app's own estimate of delivery alone (no GST).
    required double clientDelivery,

    /// GST ADDED on top of the prices (exclusive lines only). Included GST is
    /// already in the prices and is not part of this.
    required double clientGst,

    /// The address state — picks a pan-India seller's in-state or out-of-state
    /// slab on the server.
    String? customerDeliveryState,

    /// Checkout details sent BEFORE payment. Until these were sent, the
    /// address only reached the server in createOrdersAfterPayment — the one
    /// step that can fail after Razorpay has already captured the money
    /// (killed app, dropped network, late UPI confirmation). With them on the
    /// server up front, the payment.captured webhook can rebuild a complete
    /// order even when that step never runs.
    String? customerName,
    String? customerPhone,
    Map<String, dynamic>? customerAddress,
    Map<String, double>? deliveryBySeller,
  }) async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw Exception('Not authenticated');

    final clientSubtotal =
        items.fold<double>(0.0, (sum, i) => sum + i.price * i.quantity);
    // Delivery + added GST folded, for a server not yet redeployed — see the
    // amount contract above.
    final deliveryPlusGst = clientDelivery + clientGst;
    final clientGrandTotal = clientSubtotal + deliveryPlusGst;

    final response = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/payment/create-cart-order'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
        // Tags the paymentAttempts record as coming from the app. Without it
        // create-cart-order defaults source to 'web', so every app failure
        // showed up as a web one in Admin -> Payments and an app-specific
        // checkout problem would have been invisible in the numbers.
        //
        // Not sent from a browser build: a custom header has to be named in
        // the server's Access-Control-Allow-Headers or the browser blocks the
        // whole request ("Failed to fetch"), and running in a browser IS a
        // web client, so 'web' is the honest label there anyway.
        if (!kIsWeb) 'x-client': 'mobile',
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
          // The pack size: the server prices this size (not the base price)
          // and derives the shipment weight from it.
          if (i.variantLabel != null && i.variantLabel!.isNotEmpty)
            'variantUnit': i.variantLabel,
        }).toList(),
        'userId': userId,
        'clientSubtotal': clientSubtotal,
        'clientDelivery': deliveryPlusGst,
        'clientGstAdded': clientGst,
        'clientGrandTotal': clientGrandTotal,
        'customerDeliveryState': ?customerDeliveryState,
        'note': 'Mobile Cart Order',
        'customerName': ?customerName,
        'customerPhone': ?customerPhone,
        'customerAddress': ?customerAddress,
        'deliveryBySeller': ?deliveryBySeller,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to create order: ${response.body}');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Confirms whether a Razorpay order actually has a captured payment,
  /// straight from Razorpay's own records — independent of what the checkout
  /// SDK told the app.
  ///
  /// This exists because the native checkout SDK gives up waiting for a
  /// payment after its own internal timeout and reports PAYMENT_ERROR with
  /// "you could not complete it in time" the moment that happens — even when
  /// the customer's bank/UPI app goes on to approve the payment a few seconds
  /// later and Razorpay captures it. The app must never take the SDK's local
  /// timeout as proof the customer wasn't charged; it asks the server (which
  /// asks Razorpay directly) before showing a failure the customer didn't
  /// actually experience.
  Future<PaymentReconciliation> checkOrderStatus(String razorpayOrderId) async {
    try {
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      if (token == null) {
        return const PaymentReconciliation(captured: false, checkFailed: true);
      }

      final response = await http
          .post(
            Uri.parse('${AppConfig.apiBaseUrl}/api/payment/order-status'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
            },
            body: jsonEncode({'razorpay_order_id': razorpayOrderId}),
          )
          .timeout(const Duration(seconds: 15));

      if (response.statusCode != 200) {
        return const PaymentReconciliation(captured: false, checkFailed: true);
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final status = data['status'] as String?;
      return PaymentReconciliation(
        captured: status == 'captured',
        paymentId: data['paymentId'] as String?,
        checkFailed: false,
        notes: (data['notes'] as Map<String, dynamic>?),
      );
    } catch (_) {
      return const PaymentReconciliation(captured: false, checkFailed: true);
    }
  }

  /// Records a genuine payment failure so admin can see it.
  ///
  /// Reports to `/api/payment/attempt-failed`, which updates the server-side
  /// `paymentAttempts` row behind Admin → Payments. That row already carries
  /// the priced basket, so admin sees WHICH products the customer was buying —
  /// something the client has no way to attach here.
  ///
  /// The endpoint re-checks Razorpay before believing us, so a late capture is
  /// recorded as paid rather than filed as a failure.
  ///
  /// Also still writes the legacy `failedPayments` document that the older
  /// admin Subscriptions → Failed Payments tab reads, so that view keeps
  /// working until it is retired.
  ///
  /// Call this only for a CONFIRMED failure (i.e. after [checkOrderStatus]
  /// shows the payment was not captured) — never for the SDK's own timeout
  /// signal alone, which does not mean the payment actually failed.
  /// [amount] is in PAISE (Razorpay's own unit), matching what web's
  /// logFailedPayment stores and what the admin Failed Payments card renders
  /// (it divides by 100).
  Future<void> logFailedPayment(
    String message, {
    String? orderId,
    int? amount,
    /// 'cart' or 'subscription'.
    ///
    /// A cart failure is recorded ONLY server-side, in paymentAttempts
    /// (Admin -> Payments), which already holds the buyer, the basket and the
    /// failure reason. It deliberately does not also go to `failedPayments`:
    /// that collection backs Admin -> Subscriptions -> Failed Payments, whose
    /// every row offers an "Activate Subscription" button — an action that
    /// makes no sense for a product order and could grant a subscription off
    /// the back of a failed grocery purchase.
    required String kind,
  }) async {
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;
      final db = FirebaseFirestore.instance;

      // Server-side attempt record (Admin → Payments).
      if (orderId != null) {
        try {
          final token = await user.getIdToken();
          await http.post(
            Uri.parse('${AppConfig.apiBaseUrl}/api/payment/attempt-failed'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
            },
            body: jsonEncode({
              'razorpay_order_id': orderId,
              'error': {'description': message},
            }),
          );
        } catch (_) {
          // Best-effort — the legacy write below still records something.
        }
      }

      // Subscription failures additionally go to the legacy queue, which is
      // where an admin can act on them (activate the subscription manually).
      if (kind != 'subscription') return;

      String? phone;
      try {
        final idx = await db.collection('uidIndex').doc(user.uid).get();
        phone = idx.data()?['phone'] as String?;
      } catch (_) {}

      await db.collection('failedPayments').add({
        'kind': kind,
        'userId': user.uid,
        'userPhone': phone ?? user.uid,
        'userUid': user.uid,
        'error': {
          'reason': null,
          'description': message,
          'code': null,
          'source': null,
          'step': null,
          'metadata': null,
        },
        'orderId': orderId,
        'amount': amount,
        'seatCount': null,
        'durationMonths': null,
        'timestamp': FieldValue.serverTimestamp(),
        'status': 'failed',
      });
    } catch (_) {
      // Best-effort — never block the failure UI on a logging error.
    }
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
