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

  /// Page size for a brand's product grid; the rest load on demand.
  static const brandProductsPageSize = 12;

  // The brand's OWN docs. Retailer copies (retailer_inventory_copy,
  // manufacturer_assigned, admin_assigned) also carry manufacturerPhone — one
  // brand has 2,000+ of them — so the query itself filters them out.
  static const _ownSources = ['manufacturer_inventory', 'admin'];

  Query<Map<String, dynamic>> _ownProductsQuery(String manufacturerPhone) => _db
      .collection('products')
      .where('manufacturerPhone', isEqualTo: manufacturerPhone)
      .where('isActive', isEqualTo: true)
      .where('source', whereIn: _ownSources);

  /// One page of the brand's own products, by document id so the cursor is
  /// simply the last document read. Same query as the website
  /// (app/lib/brand-products.ts).
  ///
  /// Replaced three queries (manufacturerId, ownerId, phone) with limit(100)
  /// each: they matched on the manufacturer's uid, which is wrong on some
  /// accounts (UNIMAX keeps its phone there), and the phone one returned the
  /// first 100 of 2,000+ retailer copies. normalizeProductOwnerOnWrite keeps
  /// manufacturerPhone on every product a brand owns.
  Future<BrandProductsPage> fetchBrandProductsPage(
    String manufacturerPhone, {
    DocumentSnapshot<Map<String, dynamic>>? after,
  }) async {
    var q = _ownProductsQuery(manufacturerPhone)
        .orderBy(FieldPath.documentId)
        .limit(brandProductsPageSize);
    if (after != null) q = q.startAfterDocument(after);
    final snap = await q.get();
    return BrandProductsPage(
      products: snap.docs.map(CatalogModel.fromFirestore).toList(),
      last: snap.docs.isEmpty ? after : snap.docs.last,
      hasMore: snap.docs.length == brandProductsPageSize,
    );
  }

  /// First page only (the product page's "more from this brand").
  Future<List<CatalogModel>> fetchBrandProducts(String manufacturerPhone) async =>
      (await fetchBrandProductsPage(manufacturerPhone)).products;

  /// How many products the brand has: one count read, no documents.
  Future<int> countBrandProducts(String manufacturerPhone) async {
    final agg = await _ownProductsQuery(manufacturerPhone).count().get();
    return agg.count ?? 0;
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

/// A page of a brand's products plus the cursor for the next one.
class BrandProductsPage {
  final List<CatalogModel> products;
  final DocumentSnapshot<Map<String, dynamic>>? last;
  final bool hasMore;
  const BrandProductsPage({required this.products, required this.last, required this.hasMore});
}
