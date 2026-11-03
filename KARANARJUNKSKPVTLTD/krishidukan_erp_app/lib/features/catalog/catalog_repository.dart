import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/audit.dart';
import '../../core/tenant_path.dart';
import '../auth/auth_repository.dart';
import 'product.dart';

/// Editable subset of a product — the fields the web's QuickProductModal
/// (POSPage.tsx) writes. Box-level pricing, PTR, images etc. stay on the web
/// Inventory page; an edit here never touches them.
class ProductDraft {
  ProductDraft({
    this.name = '',
    this.type = '',
    this.sellingPrice = 0,
    this.mrp = 0,
    this.purchasePrice = 0,
    this.quantity = 0,
    this.loosePieces = 0,
    this.boxCapacity = 1,
    this.baseUnit = 'pcs',
    this.gstPct = 5,
    this.barcode = '',
  });

  factory ProductDraft.from(Product p) => ProductDraft(
        name: p.name,
        type: p.type,
        sellingPrice: p.sellingPrice != 0 ? p.sellingPrice : p.mrp,
        mrp: p.mrp,
        purchasePrice: p.purchasePrice,
        quantity: p.quantity,
        loosePieces: p.loosePieces,
        boxCapacity: p.boxCapacity == 0 ? 1 : p.boxCapacity,
        baseUnit: p.baseUnit,
        gstPct: p.gstPct ?? 5,
        barcode: p.barcode,
      );

  String name;
  String type;
  double sellingPrice;
  double mrp;
  double purchasePrice;
  double quantity;
  double loosePieces;
  double boxCapacity;
  String baseUnit;
  double gstPct;
  String barcode;
}

class CatalogRepository {
  CatalogRepository(this._db, this._user);

  final FirebaseFirestore _db;
  final AppUser _user;

  CollectionReference<Map<String, dynamic>> get _products =>
      tenantCollection(_db, _user.tenantId, 'products');

  Stream<List<Product>> watchProducts() => _products.snapshots().map((s) {
        final list = [
          for (final d in s.docs)
            if (d.data()['deleted'] != true) Product.fromDoc(d.id, d.data())
        ]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
        return list;
      });

  Future<List<InventoryBatch>> batchesFor(String productId) async {
    final s = await tenantCollection(_db, _user.tenantId, 'inventoryBatches')
        .where('productId', isEqualTo: productId)
        .get();
    return [for (final d in s.docs) InventoryBatch.fromDoc(d.id, d.data())];
  }

  /// QuickProductModal.handleSave — identical field set, margin string,
  /// productNumber (next KA-NNN) and category 'B2B' on create.
  ///
  /// [includeStock] is false when editing a product that has inventory
  /// batches: its loosePieces is the sum of those batches, and overwriting it
  /// by hand would make the product and its batches disagree.
  Future<String> save(ProductDraft f,
      {Product? existing,
      required List<Product> all,
      bool includeStock = true}) async {
    final margin = f.mrp > 0
        ? '${(((f.mrp - f.purchasePrice) / f.mrp) * 100).round()}%'
        : 'N/A';
    final data = <String, dynamic>{
      'name': f.name.trim(),
      'type': f.type,
      'sellingPrice': f.sellingPrice,
      'maxRetailPrice': f.mrp != 0 ? f.mrp : f.sellingPrice,
      'retailerPrice': existing != null && existing.retailerPrice != 0
          ? existing.retailerPrice
          : f.sellingPrice,
      'purchasePrice': f.purchasePrice,
      if (includeStock || existing == null) ...{
        'quantity': f.quantity,
        'loosePieces': f.loosePieces,
      },
      'boxCapacity': f.boxCapacity == 0 ? 1 : f.boxCapacity,
      'baseUnit': f.baseUnit,
      'gstPct': f.gstPct,
      'margin': margin,
      // barcode is optional on the web too; only written when set so an edit
      // never blanks a code the web's Barcode page assigned.
      if (f.barcode.trim().isNotEmpty) 'barcode': f.barcode.trim(),
      'updatedAt': FieldValue.serverTimestamp(),
    };

    if (existing != null) {
      await _products.doc(existing.id).update(data);
      logAudit(_db, _user,
          module: 'Inventory',
          action: 'Update',
          entityName: f.name.trim(),
          entityId: existing.id,
          description: 'Product updated from mobile app');
      return existing.id;
    }

    final ref = await _products.add({
      ...data,
      'productNumber': nextSku(all),
      'category': 'B2B',
      'createdAt': FieldValue.serverTimestamp(),
    });
    logAudit(_db, _user,
        module: 'Inventory',
        action: 'Create',
        entityName: f.name.trim(),
        entityId: ref.id,
        description: 'Product created from mobile app');
    return ref.id;
  }
}

/// nextSku() in QuickProductModal: highest KA-NNN + 1, padded to 3.
String nextSku(List<Product> all) {
  var max = 0;
  final re = RegExp(r'^KA-(\d+)$', caseSensitive: false);
  for (final p in all) {
    final m = re.firstMatch(p.productNumber.trim());
    if (m != null) {
      final n = int.parse(m.group(1)!);
      if (n > max) max = n;
    }
  }
  return 'KA-${(max + 1).toString().padLeft(3, '0')}';
}

final catalogRepositoryProvider = Provider<CatalogRepository?>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return null;
  return CatalogRepository(ref.watch(firestoreProvider), user);
});

final productsProvider = StreamProvider<List<Product>>((ref) {
  final repo = ref.watch(catalogRepositoryProvider);
  if (repo == null) return Stream.value(const []);
  return repo.watchProducts();
});

final productBatchesProvider =
    FutureProvider.autoDispose.family<List<InventoryBatch>, String>((ref, id) {
  final repo = ref.watch(catalogRepositoryProvider);
  if (repo == null) return Future.value(const []);
  return repo.batchesFor(id);
});
