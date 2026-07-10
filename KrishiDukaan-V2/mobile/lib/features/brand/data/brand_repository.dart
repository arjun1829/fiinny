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
    final mfrDoc = await _db.collection('manufacturers').doc(phone).get();
    if (!mfrDoc.exists) return null;
    return _buildBrand(mfrDoc);
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

  /// Reads from the global `manufacturerRetailers` collection — the single
  /// source of truth written by both web admin and mobile. The mirror
  /// subcollection (manufacturers/{phone}/retailers) is only written by the
  /// mobile flows and is empty for web-created retailers, so it can't be used
  /// as the primary source here.
  Future<List<BrandRetailerModel>> fetchBrandRetailers(
      String manufacturerPhone) async {
    final snap = await _db
        .collection('manufacturerRetailers')
        .where('manufacturerPhone', isEqualTo: manufacturerPhone)
        .where('status', whereIn: ['active', 'invited'])
        .limit(50)
        .get();
    return snap.docs.map((d) {
      final data = d.data();
      // retailerPhone is the canonical phone; fall back to retailerDocId or doc ID
      final phone = (data['retailerPhone'] as String?)?.isNotEmpty == true
          ? data['retailerPhone'] as String
          : ((data['retailerDocId'] as String?)?.isNotEmpty == true
              ? data['retailerDocId'] as String
              : d.id);
      return BrandRetailerModel.fromMirror(phone, data);
    }).toList();
  }
}
