import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import '../models/asset_model.dart';

/// AssetService handles saving, loading, and updating the user's portfolio.
/// Data is persisted to Firestore per signed-in user so it works across devices
/// and sessions. Guests fall back to an in-memory cache for the current run.
class AssetService {
  static const _collectionName = 'portfolioAssets';

  static final Map<String, List<AssetModel>> _guestCache = {};

  String? _currentUserId() => FirebaseAuth.instance.currentUser?.uid;

  CollectionReference<Map<String, dynamic>> _collectionFor(String userId) {
    return FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection(_collectionName);
  }

  Future<List<AssetModel>> loadAssets() async {
    final userId = _currentUserId();
    if (userId == null) {
      return List<AssetModel>.unmodifiable(_guestCache['guest'] ?? const []);
    }

    final snap = await _collectionFor(userId).orderBy('createdAt', descending: false).get();
    return snap.docs
        .map((doc) => AssetModel.fromJson(doc.data()))
        .toList();
  }

  Future<void> addAsset(AssetModel asset) async {
    final userId = _currentUserId();
    if (userId == null) {
      final list = _guestCache.putIfAbsent('guest', () => []);
      list.add(asset);
      return;
    }

    try {
      await _collectionFor(userId).doc(asset.id).set(asset.toJson());
    } catch (e) {
      debugPrint('Portfolio addAsset failed: $e');
      rethrow;
    }
  }

  Future<void> removeAsset(String id) async {
    final userId = _currentUserId();
    if (userId == null) {
      final list = _guestCache['guest'];
      list?.removeWhere((a) => a.id == id);
      return;
    }

    try {
      await _collectionFor(userId).doc(id).delete();
    } catch (e) {
      debugPrint('Portfolio removeAsset failed: $e');
      rethrow;
    }
  }

  Future<void> updateAsset(AssetModel updated) async {
    final userId = _currentUserId();
    if (userId == null) {
      final list = _guestCache['guest'];
      if (list == null) return;
      final idx = list.indexWhere((a) => a.id == updated.id);
      if (idx != -1) list[idx] = updated;
      return;
    }

    try {
      await _collectionFor(userId)
          .doc(updated.id)
          .set(updated.toJson(), SetOptions(merge: true));
    } catch (e) {
      debugPrint('Portfolio updateAsset failed: $e');
      rethrow;
    }
  }
}
