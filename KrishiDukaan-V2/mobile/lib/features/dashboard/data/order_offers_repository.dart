import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../../core/constants/app_config.dart';

/// An order another seller rejected, offered to this seller because they sell
/// every item in it online. Written server-side only (app/lib/order-reassignment.ts)
/// at `sellerOffers/{10-digit phone}/offers/{orderId}` — path-keyed so the
/// Firestore rule can scope reads to the owner without a field check.
///
/// Carries only what a seller needs to decide: items, value, their earning and
/// the delivery area. The customer's name, phone and full address are on the
/// order itself, which the seller can read only once they have accepted it.
class OrderOfferModel {
  final String orderId;
  final List<OrderOfferItem> items;
  final String itemSummary;
  final double orderValue;
  /// What this seller nets after the platform cut. Null when the server could
  /// not load the commission config — the card then shows the order value only.
  final double? sellerEarning;
  final String deliveryCity;
  final String deliveryPincode;
  final DateTime? expiresAt;

  const OrderOfferModel({
    required this.orderId,
    required this.items,
    required this.itemSummary,
    required this.orderValue,
    required this.sellerEarning,
    required this.deliveryCity,
    required this.deliveryPincode,
    required this.expiresAt,
  });

  bool isExpiredAt(DateTime now) =>
      expiresAt != null && !expiresAt!.isAfter(now);

  factory OrderOfferModel.fromFirestore(
      DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const <String, dynamic>{};
    final rawExpiry = d['expiresAt'];
    final rawItems = d['items'];
    return OrderOfferModel(
      orderId: (d['orderId'] as String?)?.trim().isNotEmpty == true
          ? d['orderId'] as String
          : doc.id,
      items: rawItems is List
          ? rawItems
              .whereType<Map>()
              .map((m) => OrderOfferItem.fromMap(Map<String, dynamic>.from(m)))
              .toList()
          : const [],
      itemSummary: (d['itemSummary'] as String?) ?? '',
      orderValue: (d['orderValue'] as num?)?.toDouble() ?? 0,
      sellerEarning: (d['sellerEarning'] as num?)?.toDouble(),
      deliveryCity: (d['deliveryCity'] as String?) ?? '',
      deliveryPincode: (d['deliveryPincode'] as String?) ?? '',
      expiresAt: rawExpiry is Timestamp
          ? rawExpiry.toDate()
          : rawExpiry is String
              ? DateTime.tryParse(rawExpiry)
              : null,
    );
  }
}

class OrderOfferItem {
  final String name;
  final int qty;
  final String variantLabel;
  final double price;

  const OrderOfferItem({
    required this.name,
    required this.qty,
    required this.variantLabel,
    required this.price,
  });

  factory OrderOfferItem.fromMap(Map<String, dynamic> m) => OrderOfferItem(
        name: (m['name'] as String?) ?? 'Product',
        qty: (m['qty'] as num?)?.toInt() ?? 1,
        variantLabel: (m['variantLabel'] as String?) ?? '',
        price: (m['price'] as num?)?.toDouble() ?? 0,
      );
}

class OrderOffersRepository {
  final FirebaseFirestore _db;
  OrderOffersRepository({FirebaseFirestore? db})
      : _db = db ?? FirebaseFirestore.instance;

  /// Offers are keyed by the bare 10-digit number, whichever form the user
  /// doc stores (`+91…` or bare).
  static String sellerKey(String phone) {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    return digits.length > 10 ? digits.substring(digits.length - 10) : digits;
  }

  /// Open offers for this seller, soonest-expiring first. Expired ones are
  /// dropped here too: the server closes them on a 15-minute sweep, so a doc
  /// can still say `open` for a few minutes after its window ended.
  ///
  /// Errors resolve to an empty list rather than an error state — the Requests
  /// section sits on the Orders screen, and an unreadable offers path must
  /// never take the seller's real orders down with it.
  Stream<List<OrderOfferModel>> watchOpenOffers(String phone) {
    final key = sellerKey(phone);
    if (key.length != 10) return Stream.value(const []);
    return _db
        .collection('sellerOffers')
        .doc(key)
        .collection('offers')
        .where('status', isEqualTo: 'open')
        .snapshots()
        .map((snap) {
      final now = DateTime.now();
      final offers = snap.docs
          .map(OrderOfferModel.fromFirestore)
          .where((o) => !o.isExpiredAt(now))
          .toList()
        ..sort((a, b) => (a.expiresAt ?? now).compareTo(b.expiresAt ?? now));
      return offers;
    }).transform(StreamTransformer.fromHandlers(
      handleError: (Object e, StackTrace st, EventSink<List<OrderOfferModel>> sink) {
        debugPrint('OrderOffersRepository.watchOpenOffers: $e');
        sink.add(const []);
      },
    ));
  }

  /// Accept or decline. Goes through the server (not a Firestore write) because
  /// accepting moves the order to this seller and creates their payout
  /// transfer inside one transaction — the first accept wins, and every later
  /// one gets a clear error back. Throws with the server's message on failure.
  Future<void> respond(String orderId, {required bool accept}) async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    final res = await http.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/orders/reassignment'),
      headers: {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
      body: jsonEncode({
        'orderId': orderId,
        'action': accept ? 'accept' : 'decline',
      }),
    );
    Map<String, dynamic> body = const {};
    try {
      body = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {}
    if (res.statusCode != 200) {
      throw Exception(body['error'] ??
          (accept
              ? 'Could not accept this order.'
              : 'Could not decline this order.'));
    }
  }
}
