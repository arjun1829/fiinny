import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/models/reel_comment_model.dart';

class ReelsRepository {
  final _db = FirebaseFirestore.instance;
  final _storage = FirebaseStorage.instance;

  Future<List<ReelModel>> fetchFeed({int limit = 30}) async {
    final snap = await _db
        .collection('reels')
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snap.docs.map(ReelModel.fromFirestore).toList();
  }

  Stream<List<ReelCommentModel>> watchComments(String reelId) {
    return _db
        .collection('reels')
        .doc(reelId)
        .collection('reel_comments')
        .orderBy('createdAt', descending: false)
        .snapshots()
        .map((s) => s.docs.map(ReelCommentModel.fromFirestore).toList());
  }

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

  Future<void> addComment(
      String reelId, String userId, String userName, String text) async {
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
    batch.update(
      _db.collection('reels').doc(reelId),
      {'commentsCount': FieldValue.increment(1)},
    );
    await batch.commit();
  }

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

  Future<void> uploadReel({
    required String shopOwnerId,
    required String shopName,
    String? shopProfilePic,
    required File videoFile,
    required String caption,
    String? linkedProductId,
    String? linkedProductName,
    void Function(double progress)? onProgress,
  }) async {
    final docRef = _db.collection('reels').doc();

    final storageRef = _storage.ref('reels/${docRef.id}/video.mp4');
    final uploadTask = storageRef.putFile(
      videoFile,
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

    await docRef.set({
      'shopOwnerId': shopOwnerId,
      'shopName': shopName,
      'shopProfilePic': ?shopProfilePic,
      'videoUrl': videoUrl,
      'caption': caption,
      'linkedProductId': ?linkedProductId,
      'linkedProductName': ?linkedProductName,
      'likesCount': 0,
      'commentsCount': 0,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }
}
