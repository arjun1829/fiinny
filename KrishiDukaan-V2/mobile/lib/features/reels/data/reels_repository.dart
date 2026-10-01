import 'dart:io';
import 'dart:typed_data';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/models/reel_comment_model.dart';
import '../domain/ranking_context.dart';

/// One follower row on the followers screen.
class FollowerProfile {
  final String phone;
  final String name;
  final String? photoUrl;
  final DateTime? followedAt;

  const FollowerProfile({
    required this.phone,
    required this.name,
    this.photoUrl,
    this.followedAt,
  });
}

/// One page of followers plus the cursor needed to ask for the next.
class FollowersPage {
  final List<FollowerProfile> followers;
  final DocumentSnapshot? cursor;
  final bool hasMore;

  const FollowersPage({
    required this.followers,
    required this.cursor,
    required this.hasMore,
  });

  static const empty = FollowersPage(followers: [], cursor: null, hasMore: false);
}

class ReelsRepository {
  final _db = FirebaseFirestore.instance;
  final _storage = FirebaseStorage.instance;

  // ── Feed ──────────────────────────────────────────────────────────────────

  /// Filters out flagged reels in memory rather than with a Firestore
  /// `moderationStatus != 'flagged'` clause: an inequality filter forces
  /// `orderBy` onto that same field first, which would break the `createdAt`
  /// ordering the whole feed depends on — and likely needs a composite index
  /// this repo has been burned by before (see fetchSellerReels). Flagged
  /// reels are rare, so the client-side filter costs nothing that matters.
  Future<List<ReelModel>> fetchFeed({int limit = 30}) async {
    final snap = await _db
        .collection('reels')
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snap.docs
        .map(ReelModel.fromFirestore)
        .where((r) => r.moderationStatus != 'flagged')
        .toList();
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
    // Same rationale as fetchFeed: filtered in memory, not in the query.
    // This also hides a flagged reel from the owner's own profile view, not
    // just strangers' — an acceptable trade for a first-cut moderation gate;
    // flagReelOnReports (functions/src/index.ts) notifies the owner
    // separately so they aren't left wondering where it went.
    merged.removeWhere((r) => r.moderationStatus == 'flagged');
    merged.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return merged;
  }

  Future<ReelModel?> fetchReelById(String reelId) async {
    final doc = await _db.collection('reels').doc(reelId).get();
    if (!doc.exists) return null;
    final reel = ReelModel.fromFirestore(doc);
    // A shared/deep-linked reel must not be viewable once flagged, even by
    // someone who already has the link.
    return reel.moderationStatus == 'flagged' ? null : reel;
  }

  /// Reels linked to a product — most-viewed first, capped at 5.
  ///
  /// Deliberately a plain equality query (no composite index needed): a product
  /// has only a handful of reels, so sorting in memory is cheaper and far more
  /// robust than depending on a deployed Firestore index. It also avoids the
  /// orderBy gotcha where docs missing `viewsCount` get silently dropped.
  /// A reel is linked to whichever product doc the seller who uploaded it
  /// actually owns — that can be the canonical id OR any retailer/admin copy
  /// id merged into the product card — so every id merged into the card must
  /// be matched, not just the one the page happened to navigate with.
  /// Mirrors web's ProductReelsSection (app/views/ProductDetailView.tsx):
  /// Firestore `whereIn` allows at most 30 values, so chunk and merge.
  Future<List<ReelModel>> fetchProductReels(List<String> productIds) async {
    if (productIds.isEmpty) return [];

    final chunks = <List<String>>[];
    for (var i = 0; i < productIds.length; i += 30) {
      chunks.add(productIds.sublist(i, i + 30 > productIds.length ? productIds.length : i + 30));
    }

    final snaps = await Future.wait(chunks.map((chunk) => _db
        .collection('reels')
        .where('linkedProductId', whereIn: chunk)
        .limit(50)
        .get()));

    final seen = <String>{};
    final reels = <ReelModel>[];
    for (final snap in snaps) {
      for (final doc in snap.docs) {
        if (!seen.add(doc.id)) continue;
        final reel = ReelModel.fromFirestore(doc);
        if (reel.moderationStatus == 'flagged') continue;
        reels.add(reel);
      }
    }

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

  /// Adds a comment and bumps the reel's comment counter.
  ///
  /// Does NOT write to `notifications` — that collection's rules require
  /// `isAdmin()` on create (any authenticated user writing straight into
  /// another user's notification feed would let comments/likes/follows be
  /// spoofed). The `notifyReelOwnerOnComment` Cloud Function trigger on
  /// `reels/{reelId}/reel_comments/{commentId}` handles the owner
  /// notification + push server-side instead. A client-side notifications
  /// write here used to sit in the SAME batch as the comment itself, so the
  /// whole batch (including the comment) was rejected with
  /// `PERMISSION_DENIED` the moment it touched notifications.
  Future<void> addComment(
    String reelId,
    String userId,
    String userName,
    String text, {
    String? taggedUserId,
    String? taggedUserName,
  }) async {
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
      if (taggedUserId != null) 'taggedUserId': taggedUserId,
      if (taggedUserName != null) 'taggedUserName': taggedUserName,
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

  /// Toggles a like and adjusts the reel's like counter.
  ///
  /// Does NOT write to `notifications` (see [addComment] for why — same
  /// `isAdmin()`-gated rule). This used to write a notification doc inside
  /// the SAME transaction as the like, so security rules rejected the whole
  /// transaction with `PERMISSION_DENIED` — the exact 403 that made liking
  /// a reel appear completely broken. The `notifyReelOwnerOnLike` Cloud
  /// Function trigger on `reel_likes/{likeId}` sends the owner notification
  /// + push server-side instead.
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

  /// Toggles a follow. Does NOT write to `notifications` — same rule/reason
  /// as [addComment]/[toggleLike]. The `notifyShopOwnerOnFollow` Cloud
  /// Function trigger on `follows/{followId}` handles it server-side.
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

  /// The people following [shopId], newest first.
  ///
  /// `follows` docs carry only the follower's phone, so each one is resolved
  /// against `users` then `retailers` for a name and picture. A follower whose
  /// profile is unreadable (permission rules on a stranger's doc) is still
  /// returned — with their phone as the label — rather than dropped, matching
  /// how ListingRepository handles unreadable seller profiles.
  /// One page of followers, newest first.
  ///
  /// This used to fetch EVERY follow doc and then resolve each follower's name
  /// and photo with two separate lookups, each scanning two collections — five
  /// reads per follower, all issued at once. A shop with 1000 followers fired
  /// ~5000 concurrent reads on open, which is what made the screen crawl.
  ///
  /// Now: [limit] follow docs per page (server-ordered via the deployed
  /// follows(followedShopId, createdAt DESC) composite index), and ONE profile
  /// read per follower per collection, stopping at the first hit.
  Future<FollowersPage> fetchFollowersPage(
    String shopId, {
    int limit = 25,
    DocumentSnapshot? startAfter,
  }) async {
    if (shopId.isEmpty) return FollowersPage.empty;

    Query<Map<String, dynamic>> q = _db
        .collection('follows')
        .where('followedShopId', isEqualTo: shopId)
        .orderBy('createdAt', descending: true)
        .limit(limit);
    if (startAfter != null) q = q.startAfterDocument(startAfter);

    final snap = await q.get();
    if (snap.docs.isEmpty) return FollowersPage.empty;

    final followers = await Future.wait(snap.docs.map((doc) async {
      final data = doc.data();
      final phone = (data['followerId'] as String? ?? '').trim();
      final brief = await _profileBrief(phone);
      return FollowerProfile(
        phone: phone,
        name: brief.name,
        photoUrl: brief.photoUrl,
        followedAt: (data['createdAt'] as Timestamp?)?.toDate(),
      );
    }));

    return FollowersPage(
      followers: followers,
      cursor: snap.docs.last,
      hasMore: snap.docs.length == limit,
    );
  }

  /// Display name + avatar for [phone] in a SINGLE read per collection.
  ///
  /// `profiles/{phone}` comes first: it's the unified public mirror (readable
  /// by anyone per firestore.rules) and carries both fields, so it resolves for
  /// shoppers who can't read a stranger's `users` doc at all.
  ///
  /// `logo` is included among the avatar keys because that is the field the
  /// rest of the app actually writes and reads (StoreModel.logo, and web's
  /// saveRetailerProfile/saveManufacturerProfile). Looking only at
  /// profilePic/photoUrl/logoUrl meant a seller's uploaded logo was never
  /// found and every follower fell back to a bare initial.
  Future<({String name, String? photoUrl})> _profileBrief(String phone) async {
    if (phone.isEmpty) return (name: 'Someone', photoUrl: null);

    String? name;
    String? photo;

    for (final col in ['profiles', 'users', 'retailers']) {
      if (name != null && photo != null) break;
      try {
        final doc = await _db.collection(col).doc(phone).get();
        if (!doc.exists) continue;
        final d = doc.data() ?? {};

        if (name == null) {
          final n = ((d['businessName'] ?? d['shopName'] ?? d['name'] ?? '')
                  as Object)
              .toString()
              .trim();
          if (n.isNotEmpty) name = n;
        }
        if (photo == null) {
          final url = ((d['logo'] ??
                      d['profilePic'] ??
                      d['photoUrl'] ??
                      d['logoUrl'] ??
                      '') as Object)
              .toString()
              .trim();
          if (url.isNotEmpty) photo = url;
        }
      } catch (_) {
        // Unreadable stranger profile — try the next collection.
      }
    }

    return (name: name ?? phone, photoUrl: photo);
  }

  /// shopOwnerIds [viewerPhone] follows — feeds the ranker's affinity signal.
  Future<Set<String>> fetchFollowedShopIds(String viewerPhone) async {
    if (viewerPhone.isEmpty) return {};
    final snap = await _db
        .collection('follows')
        .where('followerId', isEqualTo: viewerPhone)
        .get();
    return snap.docs
        .map((d) => d.data()['followedShopId'] as String? ?? '')
        .where((id) => id.isNotEmpty)
        .toSet();
  }

  // ── Ranking support ──────────────────────────────────────────────────────

  /// Seller phones [viewerPhone] has actually bought from — the strongest
  /// affinity signal the ranker uses. Reads `customerPhone`/`sellerPhone`,
  /// the phone-keyed fields orders carry alongside the legacy uid ones (see
  /// OrderRepository.watchMyOrders), which is what `reel.shopOwnerId` is
  /// keyed by.
  Future<Set<String>> fetchOrderedShopIds(String viewerPhone) async {
    if (viewerPhone.isEmpty) return {};
    final snap = await _db
        .collection('orders')
        .where('customerPhone', isEqualTo: viewerPhone)
        .get();
    return snap.docs
        .map((d) => d.data()['sellerPhone'] as String? ?? '')
        .where((id) => id.isNotEmpty)
        .toSet();
  }

  /// Resolves city/state/pincode for a batch of sellers, one parallel get per
  /// id — cheap at feed scale (a candidate pool has a few dozen distinct
  /// sellers at most) and avoids a `whereIn` chunking dance for something
  /// that runs once per feed load.
  Future<Map<String, SellerLocation>> fetchSellerLocations(
    Set<String> shopOwnerIds,
  ) async {
    if (shopOwnerIds.isEmpty) return {};
    final docs = await Future.wait(
      shopOwnerIds.map((id) => _db.collection('users').doc(id).get()),
    );
    final out = <String, SellerLocation>{};
    for (final doc in docs) {
      if (!doc.exists) continue;
      final data = doc.data();
      out[doc.id] = SellerLocation(
        city: data?['city'] as String?,
        state: data?['state'] as String?,
        pincode: data?['pincode'] as String?,
      );
    }
    return out;
  }

  // ── Moderation ────────────────────────────────────────────────────────────

  /// Files a report against [reelId]. Writes to `reel_reports`, never
  /// touches the reel doc directly — `flagReelOnReports`
  /// (functions/src/index.ts) is what tallies reports and flips
  /// `moderationStatus`, running with the admin SDK so it isn't bound by the
  /// same rules a client is. See firestore.rules for why clients (including
  /// the reel's own owner) cannot set `moderationStatus` themselves.
  ///
  /// ALSO writes to `contentReports` — `reel_reports` only ever fed the
  /// auto-hide-after-3-reports counter and was never visible to a human.
  /// `contentReports` is what Admin -> Moderation reads, so a single report
  /// reaches a person who can act on it, not just a counter.
  Future<void> reportReel({
    required String reelId,
    required String reporterId,
    required String reason,
    String? reportedUserId,
    String? contentSnippet,
  }) async {
    final batch = _db.batch();
    batch.set(_db.collection('reel_reports').doc(), {
      'reelId': reelId,
      'reporterId': reporterId,
      'reason': reason,
      'createdAt': FieldValue.serverTimestamp(),
    });
    batch.set(_db.collection('contentReports').doc(), {
      'type': 'reel',
      'reelId': reelId,
      'reportedUserId': reportedUserId,
      'reporterId': reporterId,
      'reason': reason,
      'contentSnippet': contentSnippet,
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  /// Files a report against one comment. There is no per-comment analogue
  /// of `reel_reports`' auto-hide counter — a comment is short-lived enough
  /// that a single report going straight to a human reviewer (Admin ->
  /// Moderation) is the right bar, not a threshold.
  Future<void> reportComment({
    required String reelId,
    required String commentId,
    required String reporterId,
    required String reportedUserId,
    required String reason,
    String? contentSnippet,
  }) async {
    await _db.collection('contentReports').add({
      'type': 'comment',
      'reelId': reelId,
      'commentId': commentId,
      'reportedUserId': reportedUserId,
      'reporterId': reporterId,
      'reason': reason,
      'contentSnippet': contentSnippet,
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  /// Deletes one of the caller's own comments — mirrors [addComment]'s
  /// batched counter update so `commentsCount` never drifts from the actual
  /// number of comments left on the reel.
  Future<void> deleteComment(String reelId, String commentId) async {
    final batch = _db.batch();
    batch.delete(_db
        .collection('reels')
        .doc(reelId)
        .collection('reel_comments')
        .doc(commentId));
    batch.update(_db.collection('reels').doc(reelId), {
      'commentsCount': FieldValue.increment(-1),
    });
    await batch.commit();
  }

  // ── Blocking ─────────────────────────────────────────────────────────────
  //
  // Guideline 1.2 (Apple App Store Review) requires a way to block an
  // abusive user, with the block (a) removing their content from the
  // blocker's feed instantly and (b) notifying the developer of whatever
  // content triggered it. (a) is client-side filtering — see
  // blockedUserIdsProvider in reels_provider.dart, which every feed/comment
  // list here reads from. (b) is the contentReports write below.

  /// Every phone this [blockerId] has blocked. Read once per session by
  /// [BlockedUserIdsNotifier] and kept in memory from then on — filtering
  /// happens client-side, exactly like moderationStatus filtering elsewhere
  /// in this file, so it never needs its own composite index.
  Future<Set<String>> fetchBlockedUserIds(String blockerId) async {
    final snap = await _db
        .collection('blockedUsers')
        .where('blockerId', isEqualTo: blockerId)
        .get();
    return snap.docs
        .map((d) => d.data()['blockedId'] as String? ?? '')
        .where((s) => s.isNotEmpty)
        .toSet();
  }

  /// Blocks [blockedId]. The pair doc id (`{blockerId}_{blockedId}`) makes a
  /// duplicate block a harmless overwrite rather than a growing list.
  Future<void> blockUser({
    required String blockerId,
    required String blockedId,
    String? reelId,
    String? commentId,
    String? contentSnippet,
  }) async {
    final batch = _db.batch();
    batch.set(_db.collection('blockedUsers').doc('${blockerId}_$blockedId'), {
      'blockerId': blockerId,
      'blockedId': blockedId,
      'createdAt': FieldValue.serverTimestamp(),
    });
    batch.set(_db.collection('contentReports').doc(), {
      'type': 'block',
      'reelId': reelId,
      'commentId': commentId,
      'reportedUserId': blockedId,
      'reporterId': blockerId,
      'reason': 'User blocked — see content for context',
      'contentSnippet': contentSnippet,
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  Future<void> unblockUser({
    required String blockerId,
    required String blockedId,
  }) async {
    await _db
        .collection('blockedUsers')
        .doc('${blockerId}_$blockedId')
        .delete();
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
      if (shopProfilePic != null) 'shopProfilePic': shopProfilePic,
      'videoUrl': videoUrl,
      if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
      'title': title,
      'caption': caption,
      if (linkedProductId != null) 'linkedProductId': linkedProductId,
      if (linkedProductName != null) 'linkedProductName': linkedProductName,
      if (linkedProductImageUrl != null)
        'linkedProductImageUrl': linkedProductImageUrl,
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
