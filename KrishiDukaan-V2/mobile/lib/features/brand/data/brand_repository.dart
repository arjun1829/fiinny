import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/models/brand_model.dart';
import '../../../core/models/catalog_model.dart';

class BrandRepository {
  final _db = FirebaseFirestore.instance;

  Future<BrandModel?> fetchBrandBySlug(String slug) async {
    final snap = await _db
        .collection('manufacturers')
        .where('slug', isEqualTo: slug)
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return null;
    return _buildBrand(snap.docs.first);
  }

  Future<BrandModel?> fetchBrandByUid(String uid) async {
    final snap = await _db
        .collection('manufacturers')
        .where('uid', isEqualTo: uid)
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return null;
    return _buildBrand(snap.docs.first);
  }

  Future<BrandModel?> fetchBrandByPhone(String phone) async {
    // manufacturers/{phone} and brandPages/{phone} share the same doc ID
    // here (unlike the slug/uid lookups below, which must find the
    // manufacturer doc first to learn its ID) — fetching both in parallel
    // instead of sequentially cuts a full round trip off every brand page
    // open.
    final results = await Future.wait([
      _db.collection('manufacturers').doc(phone).get(),
      _db.collection('brandPages').doc(phone).get(),
    ]);
    final mfrDoc = results[0];
    if (!mfrDoc.exists) return null;
    final brandDoc = results[1];
    return BrandModel.fromFirestore(mfrDoc, brandDoc.exists ? brandDoc : null);
  }

  Future<BrandModel> _buildBrand(DocumentSnapshot<Map<String, dynamic>> mfrDoc) async {
    final brandDoc = await _db.collection('brandPages').doc(mfrDoc.id).get();
    return BrandModel.fromFirestore(mfrDoc, brandDoc.exists ? brandDoc : null);
  }

  Future<List<CatalogModel>> fetchBrandProducts(String manufacturerPhone) async {
    final mfrDoc = await _db.collection('manufacturers').doc(manufacturerPhone).get();
    final data = mfrDoc.data();
    // uid field first, then manufacturerId (legacy), then fall back to the phone
    // itself — some docs store the phone in uid when created from web.
    final uid = (data?['uid'] as String?)?.isNotEmpty == true
        ? data!['uid'] as String
        : (data?['manufacturerId'] as String?)?.isNotEmpty == true
            ? data!['manufacturerId'] as String
            : manufacturerPhone;
    if (uid.isEmpty) return [];

    // Three parallel queries, mirroring the web brand page (app/brand/[slug]).
    // The ownerId+ownerType query is essential: canonical manufacturer products
    // often carry ONLY ownerId (source 'manufacturer_inventory'), while the
    // manufacturerId field is stamped onto every retailer-assigned COPY — so
    // querying manufacturerId alone returns copies that we then filter out,
    // leaving the page empty (seen live with UNIMAX AGRI BIO-TECHNOLOGIES).
    // limit(100) keeps copy-heavy result sets from starving canonical docs.
    final byUid = _db
        .collection('products')
        .where('manufacturerId', isEqualTo: uid)
        .where('isActive', isEqualTo: true)
        .limit(100)
        .get();
    final byOwner = _db
        .collection('products')
        .where('ownerId', isEqualTo: uid)
        .where('ownerType', isEqualTo: 'manufacturer')
        .limit(100)
        .get();
    final byPhone = _db
        .collection('products')
        .where('manufacturerPhone', isEqualTo: manufacturerPhone)
        .where('isActive', isEqualTo: true)
        .limit(100)
        .get();

    final results = await Future.wait([byOwner, byUid, byPhone]);
    final copySources = {'retailer_inventory_copy', 'manufacturer_assigned', 'admin_assigned'};
    final seen = <String>{};
    final products = <CatalogModel>[];
    for (final snap in results) {
      for (final doc in snap.docs) {
        if (seen.add(doc.id)) {
          final p = CatalogModel.fromFirestore(doc);
          final isActive = (doc.data()['isActive'] as bool?) ?? true;
          if (isActive && !copySources.contains(p.source)) products.add(p);
        }
      }
    }
    return products;
  }

  /// Reads from the `manufacturers/{phone}/retailers` mirror subcollection —
  /// the exact source (and doc-ID-as-retailer-phone shape) web's public brand
  /// page reads (app/brand/[slug]/page.tsx: "Fetch ALL linked retailer mirror
  /// docs — no limit"). Mobile used to read the top-level
  /// `manufacturerRetailers` collection with a hard limit(50) and a
  /// status-whereIn(['active','invited']) filter, which is why a manufacturer
  /// with 65 dealers on web showed only 50 here — both the cap and the
  /// stricter filter dropped real dealers. Web's filter is the opposite
  /// shape (exclude only revoked/removed/inactive, default-include everything
  /// else including missing status), reproduced identically below so both
  /// platforms count the same dealers.
  Future<List<BrandRetailerModel>> fetchBrandRetailers(
      String manufacturerPhone) async {
    final snap = await _db
        .collection('manufacturers')
        .doc(manufacturerPhone)
        .collection('retailers')
        .get();
    final active = snap.docs.where((d) {
      final data = d.data();
      final status = (data['status'] as String?) ?? 'invited';
      final onboarding = (data['onboardingStatus'] as String?) ?? 'active';
      return status != 'revoked' &&
          onboarding != 'removed' &&
          onboarding != 'inactive';
    });
    // The mirror's doc ID is the retailer's phone (manufacturers/{mPhone}/
    // retailers/{retailerPhone}), same as web's `phone: d.id`.
    return active
        .map((d) => BrandRetailerModel.fromMirror(d.id, d.data()))
        .toList();
  }
}
