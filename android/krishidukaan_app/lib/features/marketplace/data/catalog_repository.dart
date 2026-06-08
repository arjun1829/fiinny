import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/models/catalog_model.dart';

// Products are stored in the legacy 'products' collection.
// New 'catalog' collection exists but is mostly empty — data lives in 'products'.
const _col = 'products';

class CatalogRepository {
  final _db = FirebaseFirestore.instance;

  Future<List<CatalogModel>> fetchPage({
    String? category,
    String? searchQuery,
    DocumentSnapshot? startAfter,
    int limit = AppConfig.firestorePageSize,
  }) async {
    Query q = _db.collection(_col).orderBy('createdAt', descending: true);

    if (category != null && category.isNotEmpty) {
      q = _db
          .collection(_col)
          .where('category', isEqualTo: category)
          .orderBy('createdAt', descending: true);
    }

    // Legacy products don't have nameSearch; fall back to name range query
    if (searchQuery != null && searchQuery.trim().isNotEmpty) {
      final s = searchQuery.trim().toLowerCase();
      q = _db
          .collection(_col)
          .orderBy('name')
          .startAt([s]).endAt(['$s']);
    }

    if (startAfter != null) q = q.startAfterDocument(startAfter);

    final snap = await q.limit(limit).get();
    return snap.docs.map(CatalogModel.fromFirestore).toList();
  }

  Future<List<({CatalogModel model, DocumentSnapshot doc})>> fetchPageWithDocs({
    String? category,
    String? searchQuery,
    DocumentSnapshot? startAfter,
    int limit = AppConfig.firestorePageSize,
  }) async {
    Query q = _db.collection(_col).orderBy('createdAt', descending: true);

    if (category != null && category.isNotEmpty) {
      q = _db
          .collection(_col)
          .where('category', isEqualTo: category)
          .orderBy('createdAt', descending: true);
    }

    if (searchQuery != null && searchQuery.trim().isNotEmpty) {
      final s = searchQuery.trim().toLowerCase();
      q = _db
          .collection(_col)
          .orderBy('name')
          .startAt([s]).endAt(['$s']);
    }

    if (startAfter != null) q = q.startAfterDocument(startAfter);

    final snap = await q.limit(limit).get();
    return snap.docs
        .map((doc) => (model: CatalogModel.fromFirestore(doc), doc: doc))
        .toList();
  }

  Future<CatalogModel?> fetchById(String catalogId) async {
    final doc = await _db.collection(_col).doc(catalogId).get();
    if (!doc.exists) return null;
    return CatalogModel.fromFirestore(doc);
  }

  Future<List<CatalogModel>> fetchFeatured({int limit = 6}) async {
    final snap = await _db
        .collection(_col)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snap.docs.map(CatalogModel.fromFirestore).toList();
  }
}
