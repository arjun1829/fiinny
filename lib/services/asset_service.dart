import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/asset_model.dart';

class AssetService {
  final _collection = FirebaseFirestore.instance.collection('assets');

  // -------------------------
  // Get all assets for a user
  // -------------------------
  Future<List<AssetModel>> getAssets(String userId) async {
    try {
      final snap = await _collection
          .where('userId', isEqualTo: userId)
          .orderBy('createdAt', descending: true)
          .get();

      return snap.docs
          .map((doc) => AssetModel.fromJson(doc.data(), doc.id))
          .toList();
    } on FirebaseException catch (e) {
      final needsIndex =
          e.code == 'failed-precondition' || (e.message?.contains('requires an index') ?? false);
      if (!needsIndex) rethrow;

      final snap = await _collection
          .where('userId', isEqualTo: userId)
          .get();

      final assets = snap.docs
          .map((doc) => AssetModel.fromJson(doc.data(), doc.id))
          .toList();

      assets.sort((a, b) {
        final aCreated = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bCreated = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bCreated.compareTo(aCreated);
      });

      return assets;
    }
  }

  // -------------------------
  // Add a new asset
  // -------------------------
  Future<String> addAsset(AssetModel asset) async {
    final data = asset.toJson()
      ..['createdAt'] = DateTime.now().toIso8601String();
    final docRef = await _collection.add(data);
    return docRef.id;
  }

  // -------------------------
  // Delete asset by ID
  // -------------------------
  Future<void> deleteAsset(String assetId) async {
    await _collection.doc(assetId).delete();
  }

  // -------------------------
  // Update asset (partial safe update)
  // -------------------------
  Future<void> updateAsset(AssetModel asset) async {
    if (asset.id == null) {
      throw Exception("Asset must have an ID to update");
    }
    await _collection.doc(asset.id).update(asset.toJson());
  }

  // -------------------------
  // Get single asset by ID
  // -------------------------
  Future<AssetModel?> getAssetById(String assetId) async {
    final doc = await _collection.doc(assetId).get();
    if (!doc.exists) return null;
    return AssetModel.fromJson(doc.data()!, doc.id);
  }

  // -------------------------
  // Aggregate: total assets value
  // -------------------------
  Future<double> getTotalAssets(String userId) async {
    final assets = await getAssets(userId);
    return assets.fold<double>(0.0, (sum, a) => sum + a.value);
  }

  // -------------------------
  // Aggregate: asset count
  // -------------------------
  Future<int> getAssetCount(String userId) async {
    final assets = await getAssets(userId);
    return assets.length;
  }

  // -------------------------
  // Aggregate: by assetType
  // -------------------------
  Future<Map<String, double>> getAssetBreakdown(String userId) async {
    final assets = await getAssets(userId);
    final Map<String, double> breakdown = {};
    for (final a in assets) {
      breakdown[a.assetType] = (breakdown[a.assetType] ?? 0) + a.value;
    }
    return breakdown;
  }

  // -------------------------
  // Get recent assets (for dashboard)
  // -------------------------
  Future<List<AssetModel>> getRecentAssets(String userId, {int limit = 5}) async {
    try {
      final snap = await _collection
          .where('userId', isEqualTo: userId)
          .orderBy('createdAt', descending: true)
          .limit(limit)
          .get();

      return snap.docs
          .map((doc) => AssetModel.fromJson(doc.data(), doc.id))
          .toList();
    } on FirebaseException catch (e) {
      final needsIndex =
          e.code == 'failed-precondition' || (e.message?.contains('requires an index') ?? false);
      if (!needsIndex) rethrow;

      final snap = await _collection
          .where('userId', isEqualTo: userId)
          .get();

      final assets = snap.docs
          .map((doc) => AssetModel.fromJson(doc.data(), doc.id))
          .toList();

      assets.sort((a, b) {
        final aCreated = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bCreated = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bCreated.compareTo(aCreated);
      });

      if (assets.length > limit) {
        return assets.sublist(0, limit);
      }
      return assets;
    }
  }

  // -------------------------
  // Search by tags or institution
  // -------------------------
  Future<List<AssetModel>> searchAssets(String userId, {String? tag, String? institution}) async {
    Query query = _collection.where('userId', isEqualTo: userId);

    if (tag != null) {
      query = query.where('tags', arrayContains: tag);
    }
    if (institution != null) {
      query = query.where('institution', isEqualTo: institution);
    }

    final snap = await query.get();
    return snap.docs
        .map((doc) => AssetModel.fromJson(doc.data() as Map<String, dynamic>, doc.id))
        .toList();
  }
}
