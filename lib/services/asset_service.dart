import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/asset_model.dart';

class AssetService {
  final _collection = FirebaseFirestore.instance.collection('assets');

  // Fetch all assets for a user (returns List<AssetModel>)
  Future<List<AssetModel>> getAssets(String userId) async {
    final snap = await _collection.where('userId', isEqualTo: userId).get();
    return snap.docs
        .map((doc) => AssetModel.fromJson(doc.data(), doc.id))
        .toList();
  }

  // Add a new asset
  Future<void> addAsset(AssetModel asset) async {
    final data = asset.toJson();
    data['createdAt'] = DateTime.now().toIso8601String();
    await _collection.add(data);
  }

  // Delete an asset by ID
  Future<void> deleteAsset(String assetId) async {
    await _collection.doc(assetId).delete();
  }

  // Update an asset
  Future<void> updateAsset(AssetModel asset) async {
    await _collection.doc(asset.id).set(asset.toJson());
  }

  // Get total asset value (sum of all assets)
  Future<double> getTotalAssets(String userId) async {
    final assets = await getAssets(userId); // List<AssetModel>
    double sum = 0.0;
    for (final a in assets) {
      sum += a.value;
    }
    return sum;
  }

  // Get count of all assets
  Future<int> getAssetCount(String userId) async {
    final assets = await getAssets(userId); // List<AssetModel>
    return assets.length;
  }
}
