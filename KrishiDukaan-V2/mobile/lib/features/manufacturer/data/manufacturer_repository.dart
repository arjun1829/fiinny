import 'dart:async';
import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/listing_model.dart';
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
    String? pincode,
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
        'pincode': pincode?.trim() ?? '',
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
        'pincode': pincode?.trim() ?? '',
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
    if (snap.docs.isEmpty) throw Exception('Invite code not found.');
    final doc = snap.docs.first;
    if (doc['claimable'] == false) throw Exception('This invite has already been claimed.');
    if (doc['status'] != 'invited') throw Exception('Invite is no longer valid.');

    // Verify the claimer's phone matches the invited phone (prevent code theft)
    final invitedPhone = PhoneUtils.normalize(doc['retailerPhone'] as String? ?? '');
    final claimerPhone = PhoneUtils.normalize(userPhone);
    if (invitedPhone.isNotEmpty && invitedPhone != claimerPhone) {
      throw Exception('This invite was sent to a different phone number.');
    }

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
    // Promote user role to retailer — use set+merge in case the user doc doesn't exist yet
    await _db.collection('users').doc(userPhone).set({
      'role': 'retailer',
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

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
    List<VariantModel> variants = const [],
    List<String> images = const [],
    bool isActive = true,
    String sellMode = 'online_delivery',
    bool gstApplicable = false,
    double gstRate = 18.0,
  }) async {
    final nameSearch = _buildNameSearch(name);
    final uid = FirebaseAuth.instance.currentUser?.uid;
    await _db.collection('catalog').add({
      'name': name,
      'nameSearch': nameSearch,
      'category': category,
      'price': price,
      'images': images,
      if (images.isNotEmpty) 'imageUrl': images.first,
      if (images.isNotEmpty) 'image': images.first,
      if (description != null && description.isNotEmpty) 'description': description,
      if (nitrogen != null) 'nitrogen': nitrogen,
      if (phosphorus != null) 'phosphorus': phosphorus,
      if (potassium != null) 'potassium': potassium,
      'createdByPhone': manufacturerPhone,
      'manufacturerPhone': manufacturerPhone,
      'ownerId': uid,
      'ownerType': 'manufacturer',
      'source': 'manufacturer_inventory',
      'variants': variants.map((v) => v.toMap()).toList(),
      'isActive': isActive,
      'sellMode': sellMode,
      'gstApplicable': gstApplicable,
      'gstRate': gstRate,
      'sellerCount': 0,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> updateCatalogProduct(
      String productId, Map<String, dynamic> data, {String collectionPath = 'catalog'}) async {
    if (data.containsKey('name')) {
      data['nameSearch'] = _buildNameSearch(data['name'] as String);
    }
    await _db.collection(collectionPath).doc(productId).update({
      ...data,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deleteCatalogProduct(String productId, {String collectionPath = 'catalog'}) async {
    await _db.collection(collectionPath).doc(productId).delete();
  }

  // ── Product assignment ────────────────────────────────────────────────────

  /// Assigns a manufacturer product to a retailer using the same atomic flow
  /// as the web dashboard:
  ///   1. Validates a seat is available from an active subscription.
  ///   2. Creates a product copy in `products` (retailer manages stock).
  ///   3. Creates an `inventory` record linked to the copy.
  ///   4. Creates a `retailerSeatListings` entry (consumes the seat).
  ///   5. Appends an `availability[]` entry to the canonical product doc so the
  ///      marketplace "Available At" tab reflects the assignment immediately.
  Future<void> assignProductToRetailer({
    required String catalogId,
    required String catalogName,
    required String retailerPhone,
    required String retailerName,
    required String manufacturerPhone,
    required double price,
  }) async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    final now = FieldValue.serverTimestamp();

    // 1. Resolve manufacturer's active subscription expiry for seat lifetime
    Timestamp? subExpiry;
    final subQueries = <Future<QuerySnapshot>>[
      if (manufacturerPhone.isNotEmpty)
        _db.collection('subscriptions')
            .where('ownerPhone', isEqualTo: manufacturerPhone)
            .where('subscriptionStatus', isEqualTo: 'active')
            .limit(1)
            .get(),
      if (uid.isNotEmpty)
        _db.collection('subscriptions')
            .where('ownerId', isEqualTo: uid)
            .where('subscriptionStatus', isEqualTo: 'active')
            .limit(1)
            .get(),
    ];
    for (final snap in await Future.wait(subQueries)) {
      if (snap.docs.isNotEmpty) {
        final d = snap.docs.first.data() as Map<String, dynamic>? ?? {};
        subExpiry = d['expiryDate'] as Timestamp?;
        if (subExpiry != null) break;
      }
    }
    if (subExpiry == null) {
      throw Exception('No active subscription found. Purchase a plan to assign products.');
    }

    // 2. Guard against duplicate active assignment
    final dupSnap = await _db
        .collection('retailerSeatListings')
        .where('manufacturerId', isEqualTo: uid.isNotEmpty ? uid : manufacturerPhone)
        .where('retailerDocId', isEqualTo: retailerPhone)
        .where('manufacturerProductId', isEqualTo: catalogId)
        .where('status', isEqualTo: 'active')
        .limit(1)
        .get();
    if (dupSnap.docs.isNotEmpty) {
      throw Exception('This product is already assigned to this retailer.');
    }

    // 3. Fetch canonical product source data
    final productSnap = await _db.collection('products').doc(catalogId).get();
    if (!productSnap.exists) throw Exception('Product not found.');
    final src = productSnap.data()!;

    // 4. Resolve retailer store name from their profile doc
    String storeName = retailerName;
    try {
      final rSnap = await _db.collection('retailers').doc(retailerPhone).get();
      if (rSnap.exists) {
        final d = rSnap.data()!;
        storeName = (d['shopName'] ?? d['businessName'] ?? d['ownerName'] ?? retailerName) as String;
      }
    } catch (_) {}

    final batch = _db.batch();

    // 5. Product copy — retailer is owner; manufacturer is source reference
    final retailerProductRef = _db.collection('products').doc();
    final rawImages = src['images'];
    final images = rawImages is List ? List<String>.from(rawImages.map((e) => e.toString())) : <String>[];
    final imageUrl = images.isNotEmpty ? images.first : (src['imageUrl'] ?? src['image'] ?? '') as String;

    batch.set(retailerProductRef, {
      'id': retailerProductRef.id,
      'name': src['name'] ?? catalogName,
      'category': src['category'] ?? '',
      'description': src['description'] ?? '',
      'images': images,
      'image': imageUrl,
      'imageUrl': imageUrl,
      'price': price,
      'isActive': true,
      'ownerId': uid.isNotEmpty ? uid : retailerPhone,
      'ownerPhone': retailerPhone,
      'ownerType': 'retailer',
      'createdBy': uid.isNotEmpty ? uid : manufacturerPhone,
      'manufacturerId': uid.isNotEmpty ? uid : manufacturerPhone,
      'manufacturerPhone': manufacturerPhone,
      'manufacturerProductId': catalogId,
      'originalProductId': catalogId,
      'retailerDocId': retailerPhone,
      'retailerId': '',
      'retailerPhone': retailerPhone,
      'source': 'manufacturer_assigned',
      'store': storeName,
      'stock': 'In Stock',
      'stockQuantity': 0,
      'sellMode': src['sellMode'] ?? 'offline_store_only',
      'isOnline': src['isOnline'] ?? false,
      'variants': src['variants'] ?? [],
      'createdAt': now,
      'updatedAt': now,
    });

    // 6. Inventory record — zero stock until retailer sets it
    final inventoryRef = _db.collection('inventory').doc();
    batch.set(inventoryRef, {
      'id': inventoryRef.id,
      'ownerId': uid.isNotEmpty ? uid : retailerPhone,
      'ownerPhone': retailerPhone,
      'ownerType': 'retailer',
      'manufacturerId': uid.isNotEmpty ? uid : manufacturerPhone,
      'manufacturerPhone': manufacturerPhone,
      'retailerDocId': retailerPhone,
      'retailerId': '',
      'retailerPhone': retailerPhone,
      'productId': retailerProductRef.id,
      'manufacturerProductId': catalogId,
      'assignedByManufacturer': true,
      'stockQuantity': 0,
      'sellingPrice': price,
      'reorderThreshold': 5,
      'isAvailable': false,
      'updatedAt': now,
    });

    // 7. Seat listing — tracks which subscription seat this consumes
    final seatListingRef = _db.collection('retailerSeatListings').doc();
    batch.set(seatListingRef, {
      'id': seatListingRef.id,
      'ownerId': uid.isNotEmpty ? uid : manufacturerPhone,
      'ownerPhone': manufacturerPhone,
      'ownerType': 'manufacturer',
      'manufacturerId': uid.isNotEmpty ? uid : manufacturerPhone,
      'manufacturerPhone': manufacturerPhone,
      'retailerDocId': retailerPhone,
      'retailerId': '',
      'retailerPhone': retailerPhone,
      'productId': retailerProductRef.id,
      'manufacturerProductId': catalogId,
      'listingType': 'assigned',
      'status': 'active',
      'expiresAt': subExpiry,
      'createdAt': now,
      'updatedAt': now,
    });

    // 8. Append to canonical product's availability[] so marketplace reflects this immediately
    batch.update(_db.collection('products').doc(catalogId), {
      'availability': FieldValue.arrayUnion([{
        'storeId': retailerPhone,
        'storePhone': retailerPhone,
        'storeName': storeName,
        'stockLevel': 'In Stock',
        'sellingPrice': price,
      }]),
      'updatedAt': now,
    });

    await batch.commit();

    // Fire-and-forget email notification
    _sendProductAssignedNotification(
      retailerPhone: retailerPhone,
      productName: catalogName,
      manufacturerPhone: manufacturerPhone,
    );
  }

  Future<void> _sendProductAssignedNotification({
    required String retailerPhone,
    required String productName,
    required String manufacturerPhone,
  }) async {
    try {
      final idToken = await FirebaseAuth.instance.currentUser?.getIdToken();
      if (idToken == null) return;
      await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/api/email/product-assigned'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $idToken',
        },
        body: jsonEncode({
          'retailerPhone': retailerPhone,
          'productName': productName,
          'manufacturerPhone': manufacturerPhone,
        }),
      ).timeout(const Duration(seconds: 10));
    } catch (_) {}
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

  /// Searches registered KrishiDukan users with role='retailer'.
  /// Results are filtered client-side against [query] (name, shopName, email, phone).
  Future<List<Map<String, dynamic>>> searchRegisteredRetailers(
      String query) async {
    final q = query.toLowerCase().trim();
    if (q.isEmpty) return [];
    final snap = await _db
        .collection('users')
        .where('role', isEqualTo: 'retailer')
        .limit(100)
        .get();
    return snap.docs
        .map((d) => <String, dynamic>{...d.data(), 'id': d.id})
        .where((u) {
          final name = (u['name'] as String? ?? '').toLowerCase();
          final shop = (u['shopName'] as String? ?? '').toLowerCase();
          final email = (u['email'] as String? ?? '').toLowerCase();
          final phone = (u['phone'] as String? ?? '').toLowerCase();
          return name.contains(q) ||
              shop.contains(q) ||
              email.contains(q) ||
              phone.contains(q);
        })
        .toList();
  }

  /// Links an existing KrishiDukan retailer to the manufacturer's network.
  /// Sets status=active immediately (no invite needed — account already exists).
  Future<void> linkExistingRetailer({
    required String manufacturerPhone,
    required String manufacturerName,
    required String retailerPhone,
    required String shopName,
    required String ownerName,
    String? email,
  }) async {
    final manufacturerId = FirebaseAuth.instance.currentUser?.uid ?? '';
    final normalized = PhoneUtils.normalize(retailerPhone);
    final batch = _db.batch();
    final now = FieldValue.serverTimestamp();

    final inviteRef = _db.collection('manufacturerRetailers').doc();
    batch.set(inviteRef, {
      'id': inviteRef.id,
      'manufacturerId': manufacturerId,
      'manufacturerPhone': manufacturerPhone,
      'retailerDocId': normalized,
      'retailerId': '',
      'shopName': shopName.trim(),
      'ownerName': ownerName.trim(),
      'retailerEmail': email?.trim().toLowerCase() ?? '',
      'retailerPhone': normalized,
      'inviteCode': '',
      'status': 'active',
      'claimable': false,
      'onboardingStatus': 'active',
      'assignedSeat': false,
      'linkedExisting': true,
      'createdBy': manufacturerId,
      'addedAt': now,
      'address': {'line1': '', 'city': '', 'state': '', 'pincode': ''},
    });

    final mirrorRef = _db
        .doc('manufacturers/$manufacturerPhone/retailers/$normalized');
    batch.set(mirrorRef, {
      'retailerDocId': normalized,
      'retailerPhone': normalized,
      'manufacturerPhone': manufacturerPhone,
      'shopName': shopName.trim(),
      'ownerName': ownerName.trim(),
      'status': 'active',
      'onboardingStatus': 'active',
      'linkedExisting': true,
      'addedAt': now,
      'updatedAt': now,
    }, SetOptions(merge: true));

    await batch.commit();
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
        Uri.parse('${AppConfig.apiBaseUrl}/api/email/invite'),
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

  Future<Map<String, dynamic>?> fetchInviteDetails(String inviteCode) async {
    final snap = await _db
        .collection('manufacturerRetailers')
        .where('inviteCode', isEqualTo: inviteCode.trim())
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return null;
    return snap.docs.first.data();
  }
}

