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
    final uid = mfrDoc.data()?['uid'] as String?;
    if (uid == null) return [];

    final snap = await _db
        .collection('catalog')
        .where('createdByPhone', isEqualTo: manufacturerPhone)
        .limit(30)
        .get();
    return snap.docs.map(CatalogModel.fromFirestore).toList();
  }
}
