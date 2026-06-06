import 'dart:async';
import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/network_retailer_model.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class ManufacturerRepository {
  final _db = FirebaseFirestore.instance;

  // ── Retailer network ──────────────────────────────────────────────────────

  Stream<List<NetworkRetailerModel>> watchNetwork(String manufacturerPhone) {
    return _db
        .collection('manufacturerNetwork')
        .where('manufacturerPhone', isEqualTo: manufacturerPhone)
        .snapshots()
        .map((s) => s.docs
            .map(NetworkRetailerModel.fromFirestore)
            .toList()
          ..sort((a, b) {
            // active first, then invited, then revoked
            const order = {'active': 0, 'invited': 1, 'revoked': 2};
            return (order[a.status] ?? 3)
                .compareTo(order[b.status] ?? 3);
          }));
  }

  Future<Map<String, int>> fetchNetworkStats(
      String manufacturerPhone) async {
    final snap = await _db
        .collection('manufacturerNetwork')
        .where('manufacturerPhone', isEqualTo: manufacturerPhone)
        .get();
    final docs = snap.docs;
    return {
      'total': docs.length,
      'active': docs.where((d) => d['status'] == 'active').length,
      'invited': docs.where((d) => d['status'] == 'invited').length,
    };
  }

  Future<String> addRetailer({
    required String manufacturerPhone,
    required String manufacturerName,
    required String shopName,
    required String ownerName,
    required String retailerPhone,
    String? email,
    String? city,
    String? state,
  }) async {
    final code = _generateInviteCode();
    final docRef =
        _db.collection('manufacturerNetwork').doc(retailerPhone);

    await docRef.set({
      'manufacturerPhone': manufacturerPhone,
      // retailerPhone required by security rule for invite-claim update check
      'retailerPhone': retailerPhone,
      'shopName': shopName,
      'ownerName': ownerName,
      'email': email,
      'inviteCode': code,
      'status': 'invited',
      // claimable: true required by security rule for retailer to accept invite
      'claimable': true,
      'address': {
        'city': ?city,
        'state': ?state,
      },
      'createdAt': FieldValue.serverTimestamp(),
    });

    // Fire invite email via existing API
    if (email != null && email.isNotEmpty) {
      await _sendInviteEmail(
        email: email,
        shopName: shopName,
        ownerName: ownerName,
        inviteCode: code,
        manufacturerName: manufacturerName,
      );
    }

    return code;
  }

  Future<void> updateRetailerStatus(
      String retailerPhone, String status) async {
    await _db
        .collection('manufacturerNetwork')
        .doc(retailerPhone)
        .update({
      'status': status,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> removeRetailer(String retailerPhone) async {
    await _db
        .collection('manufacturerNetwork')
        .doc(retailerPhone)
        .delete();
  }

  // ── Invite claim (called on signup with inviteCode) ───────────────────────

  Future<void> claimInvite(String inviteCode, String userPhone) async {
    final snap = await _db
        .collection('manufacturerNetwork')
        .where('inviteCode', isEqualTo: inviteCode)
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return;
    final doc = snap.docs.first;
    if (doc['status'] == 'invited') {
      await doc.reference.update({
        'status': 'active',
        // retailerPhone + claimable:false required by security rule for this update
        'retailerPhone': userPhone,
        'claimable': false,
        'claimedByPhone': userPhone,
        'claimedAt': FieldValue.serverTimestamp(),
      });
      // Promote user role to retailer
      await _db.collection('users').doc(userPhone).update({
        'role': 'retailer',
      });
    }
  }

  // ── Manufacturer catalog management ──────────────────────────────────────

  Stream<List<CatalogModel>> watchManufacturerCatalog(
      String manufacturerPhone) {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

    // Query all sources: legacy catalog collection, products by phone,
    // products by manufacturerId (legacy uid field), and products by ownerId
    // (web new schema: ownerId == uid AND ownerType == "manufacturer").
    final streams = <Stream<QuerySnapshot>>[
      _db.collection('catalog')
          .where('createdByPhone', isEqualTo: manufacturerPhone)
          .snapshots(),
      _db.collection('products')
          .where('manufacturerPhone', isEqualTo: manufacturerPhone)
          .snapshots(),
    ];
    if (uid.isNotEmpty) {
      streams.add(_db.collection('products')
          .where('manufacturerId', isEqualTo: uid)
          .snapshots());
      streams.add(_db.collection('products')
          .where('ownerId', isEqualTo: uid)
          .where('ownerType', isEqualTo: 'manufacturer')
          .snapshots());
    }

    final controller = StreamController<List<CatalogModel>>();
    final results = List<List<DocumentSnapshot>>.filled(streams.length, []);

    void emit() {
      final seen = <String>{};
      final merged = results
          .expand((docs) => docs)
          .where((d) => seen.add(d.id))
          .map(CatalogModel.fromFirestore)
          .toList()
        ..sort((a, b) => (b.createdAt ?? DateTime(0))
            .compareTo(a.createdAt ?? DateTime(0)));
      if (!controller.isClosed) controller.add(merged);
    }

    final subs = List.generate(streams.length, (i) {
      return streams[i].listen((s) { results[i] = s.docs; emit(); },
          onError: controller.addError);
    });

    controller.onCancel = () { for (final s in subs) { s.cancel(); } };
    return controller.stream;
  }

  Future<void> addCatalogProduct({
    required String manufacturerPhone,
    required String name,
    required String category,
    required double price,
    String? description,
    double? nitrogen,
    double? phosphorus,
    double? potassium,
  }) async {
    final nameSearch = _buildNameSearch(name);
    await _db.collection('catalog').add({
      'name': name,
      'nameSearch': nameSearch,
      'category': category,
      'price': price,
      'images': [],
      'description': description,
      'nitrogen': nitrogen,
      'phosphorus': phosphorus,
      'potassium': potassium,
      'createdByPhone': manufacturerPhone,
      'sellerCount': 0,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> updateCatalogProduct(
      String productId, Map<String, dynamic> data) async {
    if (data.containsKey('name')) {
      data['nameSearch'] = _buildNameSearch(data['name'] as String);
    }
    await _db.collection('catalog').doc(productId).update({
      ...data,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deleteCatalogProduct(String productId) async {
    await _db.collection('catalog').doc(productId).delete();
  }

  // ── Product assignment ────────────────────────────────────────────────────

  Future<void> assignProductToRetailer({
    required String catalogId,
    required String catalogName,
    required String retailerPhone,
    required String retailerName,
    required String manufacturerPhone,
    required double price,
  }) async {
    // Create a listing for the retailer
    await _db.collection('listings').add({
      'catalogId': catalogId,
      'sellerPhone': retailerPhone,
      'sellerName': retailerName,
      'sellerType': 'retailer',
      'price': price,
      'stockQuantity': 0,
      'assignedByManufacturerPhone': manufacturerPhone,
      'variants': [],
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    // Notify via API
    final idToken =
        await FirebaseAuth.instance.currentUser?.getIdToken();
    if (idToken != null) {
      await http
          .post(
        Uri.parse('${AppConfig.apiBaseUrl}/api/email/product-assigned'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $idToken',
        },
        body: jsonEncode({
          'retailerPhone': retailerPhone,
          'productName': catalogName,
          'manufacturerPhone': manufacturerPhone,
        }),
      )
          .timeout(const Duration(seconds: 10));
    }
  }

  // ── Brand page editor ─────────────────────────────────────────────────────

  Future<Map<String, dynamic>?> fetchBrandPage(
      String manufacturerPhone) async {
    final doc = await _db
        .collection('brandPages')
        .doc(manufacturerPhone)
        .get();
    return doc.exists ? doc.data() : null;
  }

  Future<void> saveBrandPage(
    String manufacturerPhone,
    Map<String, dynamic> data,
  ) async {
    await _db
        .collection('brandPages')
        .doc(manufacturerPhone)
        .set(data, SetOptions(merge: true));
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  Future<Map<String, int>> fetchAnalytics(
      String manufacturerPhone) async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';

    final futures = <Future<AggregateQuerySnapshot>>[
      _db
          .collection('manufacturerNetwork')
          .where('manufacturerPhone', isEqualTo: manufacturerPhone)
          .where('status', isEqualTo: 'active')
          .count()
          .get(),
      // Legacy catalog collection
      _db
          .collection('catalog')
          .where('createdByPhone', isEqualTo: manufacturerPhone)
          .count()
          .get(),
      // Products by phone field
      _db
          .collection('products')
          .where('manufacturerPhone', isEqualTo: manufacturerPhone)
          .count()
          .get(),
      if (uid.isNotEmpty)
        _db
            .collection('products')
            .where('manufacturerId', isEqualTo: uid)
            .count()
            .get(),
      // Web new schema: ownerId + ownerType
      if (uid.isNotEmpty)
        _db
            .collection('products')
            .where('ownerId', isEqualTo: uid)
            .where('ownerType', isEqualTo: 'manufacturer')
            .count()
            .get(),
    ];

    final results = await Future.wait(futures);

    final activeRetailers = results[0].count ?? 0;
    final catalogCount    = results[1].count ?? 0;
    final productsByPhone = results[2].count ?? 0;
    final productsByUid   = uid.isNotEmpty ? (results[3].count ?? 0) : 0;
    final productsByOwner = uid.isNotEmpty ? (results[4].count ?? 0) : 0;
    // Use max across all product-count queries (can't deduplicate counts)
    final maxProductCount = [productsByPhone, productsByUid, productsByOwner]
        .reduce((a, b) => a > b ? a : b);
    final catalogProducts = catalogCount + maxProductCount;

    return {
      'activeRetailers': activeRetailers,
      'catalogProducts': catalogProducts,
      'totalAssignments': 0,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  String _generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final rng = Random.secure();
    return List.generate(8, (_) => chars[rng.nextInt(chars.length)])
        .join();
  }

  List<String> _buildNameSearch(String name) {
    final words = name.toLowerCase().split(' ');
    final tokens = <String>{};
    for (final w in words) {
      for (var i = 1; i <= w.length; i++) {
        tokens.add(w.substring(0, i));
      }
    }
    return tokens.toList();
  }

  Future<void> _sendInviteEmail({
    required String email,
    required String shopName,
    required String ownerName,
    required String inviteCode,
    required String manufacturerName,
  }) async {
    try {
      final idToken =
          await FirebaseAuth.instance.currentUser?.getIdToken();
      if (idToken == null) return;
      await http
          .post(
        Uri.parse('${AppConfig.apiBaseUrl}/api/email/invite-retailer'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $idToken',
        },
        body: jsonEncode({
          'email': email,
          'shopName': shopName,
          'ownerName': ownerName,
          'inviteCode': inviteCode,
          'manufacturerName': manufacturerName,
        }),
      )
          .timeout(const Duration(seconds: 10));
    } catch (_) {
      // Email failure is non-blocking
    }
  }
}
