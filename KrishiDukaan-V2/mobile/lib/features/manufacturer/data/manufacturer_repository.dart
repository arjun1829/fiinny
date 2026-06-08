import 'dart:async';
import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/network_retailer_model.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../../../core/utils/phone_utils.dart';

class ManufacturerRepository {
  final _db = FirebaseFirestore.instance;

  // ── Retailer network ──────────────────────────────────────────────────────

  Stream<List<NetworkRetailerModel>> watchNetwork(String manufacturerPhone) {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    final streams = <Stream<QuerySnapshot>>[
      _db
          .collection('manufacturerRetailers')
          .where('manufacturerPhone', isEqualTo: manufacturerPhone)
          .snapshots(),
    ];
    if (uid.isNotEmpty) {
      streams.add(_db
          .collection('manufacturerRetailers')
          .where('manufacturerId', isEqualTo: uid)
          .snapshots());
    }

    final controller = StreamController<List<NetworkRetailerModel>>();
    final results = List<List<DocumentSnapshot>>.filled(streams.length, []);

    void emit() {
      final seen = <String>{};
      final merged = results
          .expand((docs) => docs)
          .where((d) => seen.add(d.id))
          .map(NetworkRetailerModel.fromFirestore)
          .where((r) => r.status != 'revoked' && r.onboardingStatus != 'removed')
          .toList()
        ..sort((a, b) {
          // Sort order: active first, then invited, then revoked/inactive/removed
          const order = {'active': 0, 'invited': 1, 'revoked': 2};
          return (order[a.status] ?? 3).compareTo(order[b.status] ?? 3);
        });
      if (!controller.isClosed) controller.add(merged);
    }

    final subs = List.generate(streams.length, (i) {
      return streams[i].listen((s) {
        results[i] = s.docs;
        emit();
      }, onError: controller.addError);
    });

    controller.onCancel = () {
      for (final s in subs) {
        s.cancel();
      }
    };
    return controller.stream;
  }

  Future<Map<String, int>> fetchNetworkStats(
      String manufacturerPhone) async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    final queries = <Future<QuerySnapshot>>[
      _db
          .collection('manufacturerRetailers')
          .where('manufacturerPhone', isEqualTo: manufacturerPhone)
          .get(),
    ];
    if (uid.isNotEmpty) {
      queries.add(_db
          .collection('manufacturerRetailers')
          .where('manufacturerId', isEqualTo: uid)
          .get());
    }
    final snaps = await Future.wait(queries);
    final seen = <String>{};
    final docs = snaps.expand((s) => s.docs).where((d) => seen.add(d.id)).toList();
    final retailers = docs.map(NetworkRetailerModel.fromFirestore).toList();

    return {
      'total': retailers.where((r) => r.status != 'revoked' && r.onboardingStatus != 'removed').length,
      'active': retailers.where((r) => r.status == 'active' && r.onboardingStatus == 'active').length,
      'invited': retailers.where((r) => r.status == 'invited').length,
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
    final manufacturerId = FirebaseAuth.instance.currentUser?.uid ?? '';
    final code = _generateInviteCode();
    final normalizedRetailerPhone = PhoneUtils.normalize(retailerPhone);
    final batch = _db.batch();
    final now = FieldValue.serverTimestamp();

    // 1. Pre-create retailer entity keyed by normalized phone (idempotent)
    final retailerRef = _db.collection('retailers').doc(normalizedRetailerPhone);
    final retailerPayload = {
      'role': 'retailer',
      'phone': normalizedRetailerPhone,
      'shopName': shopName.trim(),
      'ownerName': ownerName.trim(),
      'email': email?.trim().toLowerCase() ?? '',
      'address': {
        'line1': '',
        'city': city?.trim() ?? '',
        'state': state?.trim() ?? '',
        'pincode': '',
      },
      'manufacturerId': manufacturerId,
      'manufacturerPhone': manufacturerPhone,
      'onboardingType': 'manufacturer-network',
      'assignedSeat': false,
      'seatAssignedAt': null,
      'onboardingStatus': 'pending',
      'createdBy': manufacturerId,
      'active': false,
      'subscriptionStatus': 'free',
      'createdAt': now,
      'updatedAt': now,
    };
    batch.set(retailerRef, retailerPayload, SetOptions(merge: true));

    // 2. Invite doc under manufacturerRetailers (random doc ID)
    final inviteRef = _db.collection('manufacturerRetailers').doc();
    final invitePayload = {
      'id': inviteRef.id,
      'manufacturerId': manufacturerId,
      'manufacturerPhone': manufacturerPhone,
      'retailerDocId': normalizedRetailerPhone,
      'retailerId': '',
      'shopName': shopName.trim(),
      'ownerName': ownerName.trim(),
      'retailerEmail': email?.trim().toLowerCase() ?? '',
      'retailerPhone': normalizedRetailerPhone,
      'inviteCode': code,
      'status': 'invited',
      'claimable': true,
      'onboardingStatus': 'pending',
      'assignedSeat': false,
      'seatAssignedAt': null,
      'createdBy': manufacturerId,
      'addedAt': now,
      'address': {
        'line1': '',
        'city': city?.trim() ?? '',
        'state': state?.trim() ?? '',
        'pincode': '',
      },
    };
    batch.set(inviteRef, invitePayload);

    // 3. Mirror doc under manufacturers/{mPhone}/retailers/{rPhone}
    final mirrorRef = _db.doc('manufacturers/$manufacturerPhone/retailers/$normalizedRetailerPhone');
    final mirrorPayload = {
      'retailerDocId': normalizedRetailerPhone,
      'retailerPhone': normalizedRetailerPhone,
      'manufacturerPhone': manufacturerPhone,
      'shopName': shopName.trim(),
      'ownerName': ownerName.trim(),
      'inviteCode': code,
      'status': 'invited',
      'onboardingStatus': 'pending',
      'addedAt': now,
      'updatedAt': now,
    };
    batch.set(mirrorRef, mirrorPayload, SetOptions(merge: true));

    await batch.commit();

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

  Future<void> updateNetworkRetailer({
    required String inviteDocId,
    required String retailerDocId,
    required String shopName,
    required String ownerName,
    required String phone,
    required String email,
    required String manufacturerPhone,
  }) async {
    final now = FieldValue.serverTimestamp();
    final newPhone = PhoneUtils.normalize(phone);

    await _db.collection('manufacturerRetailers').doc(inviteDocId).update({
      'shopName': shopName.trim(),
      'ownerName': ownerName.trim(),
      'retailerPhone': newPhone,
      'retailerDocId': newPhone,
      'retailerEmail': email.trim().toLowerCase(),
      'updatedAt': now,
    });

    if (manufacturerPhone.isNotEmpty) {
      final oldMirrorRef = _db.doc('manufacturers/$manufacturerPhone/retailers/$retailerDocId');
      final newMirrorRef = _db.doc('manufacturers/$manufacturerPhone/retailers/$newPhone');

      if (retailerDocId != newPhone) {
        await oldMirrorRef.delete();
      }

      await newMirrorRef.set({
        'retailerDocId': newPhone,
        'retailerPhone': newPhone,
        'manufacturerPhone': manufacturerPhone,
        'shopName': shopName.trim(),
        'ownerName': ownerName.trim(),
        'updatedAt': now,
      }, SetOptions(merge: true));
    }
  }

  Future<void> updateRetailerStatus(
      String retailerPhone, String status) async {
    // Legacy support: call the appropriate specific methods
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    // Since we only have retailerPhone and status, search for the inviteDocId
    final snap = await _db
        .collection('manufacturerRetailers')
        .where('retailerPhone', isEqualTo: retailerPhone)
        .where('manufacturerId', isEqualTo: uid)
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return;
    final inviteDocId = snap.docs.first.id;
    final data = snap.docs.first.data();
    final manufacturerPhone = data['manufacturerPhone'] as String? ?? '';

    if (status == 'revoked') {
      await deactivateNetworkRetailer(
        inviteDocId: inviteDocId,
        retailerDocId: retailerPhone,
        manufacturerId: uid,
        manufacturerPhone: manufacturerPhone,
      );
    } else if (status == 'active') {
      await reactivateNetworkRetailer(
        inviteDocId: inviteDocId,
        retailerDocId: retailerPhone,
        manufacturerPhone: manufacturerPhone,
      );
    }
  }

  Future<void> removeRetailer(String retailerPhone) async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    final snap = await _db
        .collection('manufacturerRetailers')
        .where('retailerPhone', isEqualTo: retailerPhone)
        .where('manufacturerId', isEqualTo: uid)
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return;
    final inviteDocId = snap.docs.first.id;
    final data = snap.docs.first.data();
    final manufacturerPhone = data['manufacturerPhone'] as String? ?? '';

    await removeNetworkRetailer(
      inviteDocId: inviteDocId,
      retailerDocId: retailerPhone,
      manufacturerId: uid,
      manufacturerPhone: manufacturerPhone,
    );
  }

  Future<void> deactivateNetworkRetailer({
    required String inviteDocId,
    required String retailerDocId,
    required String manufacturerId,
    required String manufacturerPhone,
  }) async {
    final now = FieldValue.serverTimestamp();

    // 1. Fetch active seat listings
    final listingsSnap = await _db
        .collection('retailerSeatListings')
        .where('ownerId', isEqualTo: manufacturerId)
        .where('retailerDocId', isEqualTo: retailerDocId)
        .where('listingType', isEqualTo: 'assigned')
        .where('status', isEqualTo: 'active')
        .get();

    final batch = _db.batch();

    // 2. Update invite link doc
    batch.update(_db.collection('manufacturerRetailers').doc(inviteDocId), {
      'onboardingStatus': 'inactive',
      'assignedSeat': false,
      'manuallyDeactivated': true,
      'deactivatedAt': now,
    });

    // 3. Release listings + deactivate product copies
    for (final doc in listingsSnap.docs) {
      batch.update(doc.reference, {
        'status': 'released',
        'releasedAt': now,
      });
      final productId = doc.data()['productId'] as String? ?? '';
      if (productId.isNotEmpty) {
        batch.update(_db.collection('products').doc(productId), {
          'isActive': false,
          'updatedAt': now,
        });
      }
    }

    await batch.commit();

    // 4. Sync mirror
    if (manufacturerPhone.isNotEmpty) {
      final mirrorRef = _db.doc('manufacturers/$manufacturerPhone/retailers/$retailerDocId');
      await mirrorRef.update({
        'onboardingStatus': 'inactive',
        'assignedSeat': false,
        'manuallyDeactivated': true,
        'updatedAt': now,
      });
    }
  }

  Future<void> reactivateNetworkRetailer({
    required String inviteDocId,
    required String retailerDocId,
    required String manufacturerPhone,
  }) async {
    final now = FieldValue.serverTimestamp();
    await _db.collection('manufacturerRetailers').doc(inviteDocId).update({
      'onboardingStatus': 'active',
      'assignedSeat': true,
      'manuallyDeactivated': false,
      'reactivatedAt': now,
    });

    if (manufacturerPhone.isNotEmpty) {
      final mirrorRef = _db.doc('manufacturers/$manufacturerPhone/retailers/$retailerDocId');
      await mirrorRef.update({
        'onboardingStatus': 'active',
        'assignedSeat': true,
        'manuallyDeactivated': false,
        'updatedAt': now,
      });
    }
  }

  Future<void> removeNetworkRetailer({
    required String inviteDocId,
    required String retailerDocId,
    required String manufacturerId,
    required String manufacturerPhone,
  }) async {
    final now = FieldValue.serverTimestamp();

    // 1. Fetch active seat listings
    final listingsSnap = await _db
        .collection('retailerSeatListings')
        .where('ownerId', isEqualTo: manufacturerId)
        .where('retailerDocId', isEqualTo: retailerDocId)
        .where('listingType', isEqualTo: 'assigned')
        .where('status', isEqualTo: 'active')
        .get();

    final batch = _db.batch();

    // 2. Revoke the invite link
    batch.update(_db.collection('manufacturerRetailers').doc(inviteDocId), {
      'status': 'revoked',
      'claimable': false,
      'assignedSeat': false,
      'onboardingStatus': 'removed',
      'removedAt': now,
    });

    // 3. Release listings + deactivate product copies
    final mfrProductIds = <String>[];
    for (final doc in listingsSnap.docs) {
      batch.update(doc.reference, {
        'status': 'released',
        'releasedAt': now,
      });
      final productId = doc.data()['productId'] as String? ?? '';
      final mfrProductId = doc.data()['manufacturerProductId'] as String? ?? '';
      if (productId.isNotEmpty) {
        batch.update(_db.collection('products').doc(productId), {
          'isActive': false,
          'updatedAt': now,
        });
      }
      if (mfrProductId.isNotEmpty) {
        mfrProductIds.add(mfrProductId);
      }
    }

    await batch.commit();

    // 4. Strip availability entries (fire-and-forget-ish)
    if (mfrProductIds.isNotEmpty) {
      for (final mfrProductId in mfrProductIds) {
        try {
          final snap = await _db.collection('products').doc(mfrProductId).get();
          if (snap.exists) {
            final data = snap.data() as Map<String, dynamic>;
            final availability = data['availability'] as List<dynamic>?;
            if (availability != null) {
              final updated = availability
                  .where((e) => e is Map && e['storeId'] != retailerDocId)
                  .toList();
              await _db.collection('products').doc(mfrProductId).update({
                'availability': updated,
              });
            }
          }
        } catch (_) {}
      }
    }

    // 5. Sync mirror
    if (manufacturerPhone.isNotEmpty) {
      final mirrorRef = _db.doc('manufacturers/$manufacturerPhone/retailers/$retailerDocId');
      await mirrorRef.update({
        'status': 'revoked',
        'onboardingStatus': 'removed',
        'assignedSeat': false,
        'updatedAt': now,
      });
    }
  }

  Future<void> claimInvite(String inviteCode, String userPhone) async {
    final snap = await _db
        .collection('manufacturerRetailers')
        .where('inviteCode', isEqualTo: inviteCode)
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return;
    final doc = snap.docs.first;
    if (doc['status'] == 'invited') {
      final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
      await doc.reference.update({
        'status': 'active',
        'retailerPhone': userPhone,
        'retailerDocId': userPhone,
        'claimable': false,
        'retailerId': uid,
        'onboardingStatus': 'active',
        'claimedAt': FieldValue.serverTimestamp(),
      });
      // Promote user role to retailer
      await _db.collection('users').doc(userPhone).update({
        'role': 'retailer',
      });

      // Update the mirror
      final d = doc.data();
      final manufacturerPhone = d['manufacturerPhone'] as String? ?? '';
      if (manufacturerPhone.isNotEmpty) {
        final mirrorRef = _db.doc('manufacturers/$manufacturerPhone/retailers/$userPhone');
        await mirrorRef.set({
          'status': 'active',
          'retailerPhone': userPhone,
          'retailerDocId': userPhone,
          'retailerId': uid,
          'onboardingStatus': 'active',
          'claimedAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
      }
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
          .collection('manufacturerRetailers')
          .where('manufacturerPhone', isEqualTo: manufacturerPhone)
          .where('status', isEqualTo: 'active')
          .count()
          .get(),
      if (uid.isNotEmpty)
        _db
            .collection('manufacturerRetailers')
            .where('manufacturerId', isEqualTo: uid)
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

    final activeCountPhone = results[0].count ?? 0;
    final activeCountUid = uid.isNotEmpty ? (results[1].count ?? 0) : 0;
    final activeRetailers = activeCountPhone > activeCountUid ? activeCountPhone : activeCountUid;

    final baseIdx = uid.isNotEmpty ? 2 : 1;
    final catalogCount    = results[baseIdx].count ?? 0;
    final productsByPhone = results[baseIdx + 1].count ?? 0;
    final productsByUid   = uid.isNotEmpty ? (results[baseIdx + 2].count ?? 0) : 0;
    final productsByOwner = uid.isNotEmpty ? (results[baseIdx + 3].count ?? 0) : 0;
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
    return List.generate(10, (_) => chars[rng.nextInt(chars.length)])
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
