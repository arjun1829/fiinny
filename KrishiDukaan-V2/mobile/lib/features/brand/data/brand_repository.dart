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

    final byUid = _db
        .collection('products')
        .where('manufacturerId', isEqualTo: uid)
        .where('isActive', isEqualTo: true)
        .limit(30)
        .get();
    final byPhone = _db
        .collection('products')
        .where('manufacturerPhone', isEqualTo: manufacturerPhone)
        .where('isActive', isEqualTo: true)
        .limit(30)
        .get();

    final results = await Future.wait([byUid, byPhone]);
    final copySources = {'retailer_inventory_copy', 'manufacturer_assigned', 'admin_assigned'};
    final seen = <String>{};
    final products = <CatalogModel>[];
    for (final snap in results) {
      for (final doc in snap.docs) {
        if (seen.add(doc.id)) {
          final p = CatalogModel.fromFirestore(doc);
          if (!copySources.contains(p.source)) products.add(p);
        }
      }
    }
    return products;
  }

  /// Reads the public mirror docs from `manufacturers/{phone}/retailers`
  /// (status == 'active') and returns them as [BrandRetailerModel] list.
  Future<List<BrandRetailerModel>> fetchBrandRetailers(
      String manufacturerPhone) async {
    final snap = await _db
        .collection('manufacturers')
        .doc(manufacturerPhone)
        .collection('retailers')
        .where('status', isEqualTo: 'active')
        .limit(50)
        .get();
    return snap.docs
        .map((d) => BrandRetailerModel.fromMirror(d.id, d.data()))
        .toList();
  }
}
