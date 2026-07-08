import 'dart:io';
import 'dart:typed_data';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/models/reel_comment_model.dart';

class ReelsRepository {
  final _db = FirebaseFirestore.instance;
  final _storage = FirebaseStorage.instance;

  // ── Feed ──────────────────────────────────────────────────────────────────

  Future<List<ReelModel>> fetchFeed({int limit = 30}) async {
    final snap = await _db
        .collection('reels')
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snap.docs.map(ReelModel.fromFirestore).toList();
  }

  /// Returns all reels for a shop: their own + any reels they were tagged in
  /// (collaborations).
  ///
  /// Both queries are deliberately equality/array-only with **no `orderBy`** —
  /// combining `arrayContains` (or an equality filter) with `orderBy` on a
  /// different field forces a composite Firestore index. That index was never
  /// deployed, so the collaboration (`taggedShopIds`) query was silently
  /// failing and tagged reels never showed on partners' profiles. We sort the
  /// merged result in memory instead (a shop has at most a handful of reels).
  Future<List<ReelModel>> fetchSellerReels(String shopOwnerId) async {
    final ownQ = _db
        .collection('reels')
        .where('shopOwnerId', isEqualTo: shopOwnerId)
        .get();

    final taggedQ = _db
        .collection('reels')
        .where('taggedShopIds', arrayContains: shopOwnerId)
        .get();

    final snaps = await Future.wait([ownQ, taggedQ]);
    final seen = <String>{};
    final merged = <ReelModel>[];
    for (final snap in snaps) {
      for (final doc in snap.docs) {
        if (seen.add(doc.id)) merged.add(ReelModel.fromFirestore(doc));
      }
    }
    merged.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return merged;
  }

  Future<ReelModel?> fetchReelById(String reelId) async {
    final doc = await _db.collection('reels').doc(reelId).get();
    if (!doc.exists) return null;
    return ReelModel.fromFirestore(doc);
  }

  /// Reels linked to a product — most-viewed first, capped at 5.
  ///
  /// Deliberately a plain equality query (no composite index needed): a product
  /// has only a handful of reels, so sorting in memory is cheaper and far more
  /// robust than depending on a deployed Firestore index. It also avoids the
  /// orderBy gotcha where docs missing `viewsCount` get silently dropped.
  Future<List<ReelModel>> fetchProductReels(String productId) async {
    final snap = await _db
        .collection('reels')
        .where('linkedProductId', isEqualTo: productId)
        .limit(50)
        .get();
    final reels = snap.docs.map(ReelModel.fromFirestore).toList();
    reels.sort((a, b) {
      final byViews = b.viewsCount.compareTo(a.viewsCount);
      return byViews != 0 ? byViews : b.createdAt.compareTo(a.createdAt);
    });
    return reels.take(5).toList();
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  Stream<List<ReelCommentModel>> watchComments(String reelId) {
    return _db
        .collection('reels')
        .doc(reelId)
        .collection('reel_comments')
        .orderBy('createdAt', descending: false)
        .snapshots()
        .map((s) => s.docs.map(ReelCommentModel.fromFirestore).toList());
  }

  Future<void> addComment(
    String reelId,
    String userId,
    String userName,
    String text,
  ) async {
    final batch = _db.batch();
    final commentRef = _db
        .collection('reels')
        .doc(reelId)
        .collection('reel_comments')
        .doc();
    batch.set(commentRef, {
      'userId': userId,
      'userName': userName,
      'text': text,
      'createdAt': FieldValue.serverTimestamp(),
    });
    batch.update(_db.collection('reels').doc(reelId), {
      'commentsCount': FieldValue.increment(1),
    });
    await batch.commit();
  }

  // ── Likes ─────────────────────────────────────────────────────────────────

  Future<bool> isLikedBy(String reelId, String userId) async {
    final doc = await _db
        .collection('reel_likes')
        .doc('${reelId}_$userId')
        .get();
    return doc.exists;
  }

  Future<void> toggleLike(String reelId, String userId) async {
    final likeRef = _db.collection('reel_likes').doc('${reelId}_$userId');
    final reelRef = _db.collection('reels').doc(reelId);
    await _db.runTransaction((txn) async {
      final snap = await txn.get(likeRef);
      if (snap.exists) {
        txn.delete(likeRef);
        txn.update(reelRef, {'likesCount': FieldValue.increment(-1)});
      } else {
        txn.set(likeRef, {
          'reelId': reelId,
          'userId': userId,
          'createdAt': FieldValue.serverTimestamp(),
        });
        txn.update(reelRef, {'likesCount': FieldValue.increment(1)});
      }
    });
  }

  // ── Follows ───────────────────────────────────────────────────────────────

  Future<bool> isFollowing(String followerId, String shopId) async {
    final doc = await _db
        .collection('follows')
        .doc('${followerId}_$shopId')
        .get();
    return doc.exists;
  }

  Future<void> toggleFollow(String followerId, String shopId) async {
    final ref = _db.collection('follows').doc('${followerId}_$shopId');
    final snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
    } else {
      await ref.set({
        'followerId': followerId,
        'followedShopId': shopId,
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }

  Future<int> countFollowers(String shopId) async {
    final agg = await _db
        .collection('follows')
        .where('followedShopId', isEqualTo: shopId)
        .count()
        .get();
    return agg.count ?? 0;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  Future<void> updateReel(
    String reelId, {
    required String title,
    required String caption,
    String? linkedProductId,
    String? linkedProductName,
    String? linkedProductImageUrl,
  }) async {
    await _db.collection('reels').doc(reelId).update({
      'title': title,
      'caption': caption,
      'linkedProductId': linkedProductId,
      'linkedProductName': linkedProductName,
      'linkedProductImageUrl': linkedProductImageUrl,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> incrementViewsCount(String reelId) async {
    await _db.collection('reels').doc(reelId).update({
      'viewsCount': FieldValue.increment(1),
    });
  }

  Future<void> deleteReel(String reelId) async {
    await _db.collection('reels').doc(reelId).delete();
    try {
      await _storage.ref('reels/$reelId/video.mp4').delete();
    } catch (_) {}
  }

  /// Returns the caller's existing repost doc id for [sourceReel] (following it
  /// back to the root original), or null if they have not reposted it. Lets the
  /// UI render repost state and offer a one-tap undo. Index-free (two equality
  /// filters only).
  Future<String?> myRepostId({
    required ReelModel sourceReel,
    required String shopOwnerId,
  }) async {
    final rootOriginalId = sourceReel.originalReelId ?? sourceReel.id;
    final existing = await _db
        .collection('reels')
        .where('shopOwnerId', isEqualTo: shopOwnerId)
        .where('originalReelId', isEqualTo: rootOriginalId)
        .limit(1)
        .get();
    return existing.docs.isEmpty ? null : existing.docs.first.id;
  }

  /// Removes a repost the caller made. Only the repost doc is deleted — the
  /// shared video lives under the original's storage path, so we never touch
  /// storage here (unlike [deleteReel]).
  Future<void> undoRepost(String repostId) async {
    await _db.collection('reels').doc(repostId).delete();
  }

  /// Reposts [sourceReel] onto the caller's profile and returns the new doc id.
  Future<String> repostReel({
    required ReelModel sourceReel,
    required String shopOwnerId,
    required String shopName,
    String? shopProfilePic,
  }) async {
    final rootOriginalId = sourceReel.originalReelId ?? sourceReel.id;
    final rootOriginalOwnerId =
        sourceReel.originalShopOwnerId ?? sourceReel.shopOwnerId;
    final rootOriginalOwnerName =
        sourceReel.originalShopName ?? sourceReel.shopName;

    if (shopOwnerId == sourceReel.shopOwnerId ||
        shopOwnerId == rootOriginalOwnerId) {
      throw StateError('You cannot repost your own reel.');
    }

    final existing = await _db
        .collection('reels')
        .where('shopOwnerId', isEqualTo: shopOwnerId)
        .where('originalReelId', isEqualTo: rootOriginalId)
        .limit(1)
        .get();
    if (existing.docs.isNotEmpty) {
      throw StateError('You already reposted this reel.');
    }

    final ref = await _db.collection('reels').add({
      'shopOwnerId': shopOwnerId,
      'shopName': shopName,
      'shopProfilePic': shopProfilePic,
      'videoUrl': sourceReel.videoUrl,
      'thumbnailUrl': sourceReel.thumbnailUrl,
      'title': sourceReel.title,
      'caption': sourceReel.caption,
      'linkedProductId': sourceReel.linkedProductId,
      'linkedProductName': sourceReel.linkedProductName,
      'linkedProductImageUrl': sourceReel.linkedProductImageUrl,
      'taggedShops': const [],
      'taggedShopIds': const [],
      if (sourceReel.filterId != null) 'filterId': sourceReel.filterId,
      if (sourceReel.overlayText != null &&
          sourceReel.overlayText!.isNotEmpty) ...{
        'overlayText': sourceReel.overlayText,
        'overlayPos': sourceReel.overlayPos ?? 'center',
      },
      'originalReelId': rootOriginalId,
      'originalShopOwnerId': rootOriginalOwnerId,
      'originalShopName': rootOriginalOwnerName,
      'likesCount': 0,
      'commentsCount': 0,
      'viewsCount': 0,
      'createdAt': FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  // ── Username ──────────────────────────────────────────────────────────────

  /// Returns true if [username] is available for [myPhone] to claim.
  /// Also returns true if the caller already owns it.
  Future<bool> checkUsernameAvailable(String username, String myPhone) async {
    final doc = await _db.collection('usernames').doc(username).get();
    if (!doc.exists) return true;
    return (doc.data()?['phone'] as String?) == myPhone;
  }

  Future<void> setUsername({
    required String username,
    required String phone,
    required String businessName,
    required String role,
    String? oldUsername,
  }) async {
    final batch = _db.batch();
    if (oldUsername != null &&
        oldUsername.isNotEmpty &&
        oldUsername != username) {
      batch.delete(_db.collection('usernames').doc(oldUsername));
    }
    batch.set(_db.collection('usernames').doc(username), {
      'username': username,
      'phone': phone,
      'businessName': businessName,
      'businessNameSearch': businessName.toLowerCase(),
      'role': role,
      'createdAt': FieldValue.serverTimestamp(),
    });
    batch.update(_db.collection('users').doc(phone), {'username': username});
    await batch.commit();
  }

  /// Prefix-searches `usernames` collection by handle and business name.
  Future<List<Map<String, dynamic>>> searchShops(String query) async {
    final q = query.toLowerCase().trim();
    if (q.isEmpty) return [];

    final end =
        q.substring(0, q.length - 1) +
        String.fromCharCode(q.codeUnitAt(q.length - 1) + 1);

    final byHandle = _db
        .collection('usernames')
        .where('username', isGreaterThanOrEqualTo: q)
        .where('username', isLessThan: end)
        .limit(5)
        .get();

    final byName = _db
        .collection('usernames')
        .where('businessNameSearch', isGreaterThanOrEqualTo: q)
        .where('businessNameSearch', isLessThan: end)
        .limit(5)
        .get();

    final results = await Future.wait([byHandle, byName]);
    final seen = <String>{};
    final merged = <Map<String, dynamic>>[];
    for (final snap in results) {
      for (final doc in snap.docs) {
        final phone = doc.data()['phone'] as String? ?? '';
        if (seen.add(phone)) {
          merged.add({
            'phone': phone,
            'username': doc.id,
            'businessName': doc.data()['businessName'] as String? ?? '',
            'role': doc.data()['role'] as String? ?? '',
          });
        }
      }
    }
    return merged.take(6).toList();
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  Future<void> uploadReel({
    required String shopOwnerId,
    required String shopName,
    String? shopProfilePic,
    File? videoFile,
    Uint8List? videoBytes,
    File? thumbnailFile,
    required String title,
    required String caption,
    String? linkedProductId,
    String? linkedProductName,
    String? linkedProductImageUrl,
    List<Map<String, dynamic>> taggedShops = const [],
    String? filterId,
    String? overlayText,
    String? overlayPos,
    void Function(double progress)? onProgress,
  }) async {
    assert(
      videoFile != null || videoBytes != null,
      'Provide either videoFile (mobile) or videoBytes (web)',
    );

    final docRef = _db.collection('reels').doc();

    final storageRef = _storage.ref('reels/${docRef.id}/video.mp4');
    final uploadTask = videoBytes != null
        ? storageRef.putData(
            videoBytes,
            SettableMetadata(contentType: 'video/mp4'),
          )
        : storageRef.putFile(
            videoFile!,
            SettableMetadata(contentType: 'video/mp4'),
          );

    if (onProgress != null) {
      uploadTask.snapshotEvents.listen((event) {
        if (event.totalBytes > 0) {
          onProgress(event.bytesTransferred / event.totalBytes);
        }
      });
    }

    final snapshot = await uploadTask;
    final videoUrl = await snapshot.ref.getDownloadURL();

    // Poster frame (mobile generates it; web reels fall back to a placeholder).
    String? thumbnailUrl;
    if (thumbnailFile != null) {
      final thumbSnap = await _storage
          .ref('reels/${docRef.id}/thumb.jpg')
          .putFile(thumbnailFile, SettableMetadata(contentType: 'image/jpeg'));
      thumbnailUrl = await thumbSnap.ref.getDownloadURL();
    }

    final taggedShopIds = taggedShops.map((t) => t['phone'] as String).toList();

    await docRef.set({
      'shopOwnerId': shopOwnerId,
      'shopName': shopName,
      'shopProfilePic': ?shopProfilePic,
      'videoUrl': videoUrl,
      'thumbnailUrl': ?thumbnailUrl,
      'title': title,
      'caption': caption,
      'linkedProductId': ?linkedProductId,
      'linkedProductName': ?linkedProductName,
      'linkedProductImageUrl': ?linkedProductImageUrl,
      'taggedShops': taggedShops,
      'taggedShopIds': taggedShopIds,
      if (filterId != null && filterId != 'none') 'filterId': filterId,
      if (overlayText != null && overlayText.isNotEmpty) ...{
        'overlayText': overlayText,
        'overlayPos': overlayPos ?? 'center',
      },
      'likesCount': 0,
      'commentsCount': 0,
      'viewsCount': 0,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }
}
