import 'dart:convert';
import 'package:lifemap/shims/shared_prefs_shim.dart';

import '../models/asset_model.dart';

/// AssetService handles saving, loading, and updating the user's portfolio.
/// Currently uses SharedPreferences (local). Later can be swapped for Firestore.
class AssetService {
  static const _key = 'user_assets';

  /// Save all assets to local storage
  Future<void> saveAssets(List<AssetModel> assets) async {
    final prefs = await SharedPreferences.getInstance();
    final data = assets.map((a) => jsonEncode(a.toJson())).toList();
    await prefs.setStringList(_key, data);
  }

  /// Load all assets from local storage
  Future<List<AssetModel>> loadAssets() async {
    final prefs = await SharedPreferences.getInstance();
    final rawList = prefs.getStringList(_key) ?? [];
    return rawList
        .map((s) => AssetModel.fromJson(jsonDecode(s)))
        .toList();
  }

  /// Add a new asset entry
  Future<void> addAsset(AssetModel asset) async {
    final current = await loadAssets();
    current.add(asset);
    await saveAssets(current);
  }

  /// Remove an asset entry by id
  Future<void> removeAsset(String id) async {
    final current = await loadAssets();
    current.removeWhere((a) => a.id == id);
    await saveAssets(current);
  }

  /// Update an existing asset entry
  Future<void> updateAsset(AssetModel updated) async {
    final current = await loadAssets();
    final idx = current.indexWhere((a) => a.id == updated.id);
    if (idx != -1) {
      current[idx] = updated;
      await saveAssets(current);
    }
  }
}
