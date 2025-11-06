// lib/services/friend_service.dart

import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/friend_model.dart';

class FriendService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // ==== Collections ====
  CollectionReference<Map<String, dynamic>> getFriendsCollection(String userPhone) {
    return _firestore.collection('users').doc(userPhone).collection('friends');
  }

  CollectionReference<Map<String, dynamic>> get _links =>
      _firestore.collection('friend_links'); // pending links by phone

  CollectionReference<Map<String, dynamic>> get _pairs =>
      _firestore.collection('friends_pairs'); // global friend edges (bidirectional pair)

  // ==== Helpers ====
  String _pairId(String a, String b) {
    final s = [a.trim(), b.trim()]..sort();
    return '${s[0]}__${s[1]}';
  }

  Future<bool> _userExists(String phone) async {
    final doc = await _firestore.collection('users').doc(phone).get();
    return doc.exists;
  }

  Future<String> _userProfileName(String phone) async {
    try {
      final snap = await _firestore.collection('users').doc(phone).get();
      final name = (snap.data()?['name'] as String?)?.trim();
      if (name != null && name.isNotEmpty) {
        return name;
      }
    } catch (_) {}
    return phone;
  }

  // ==== Streams / Reads (UNCHANGED) ====
  Stream<List<FriendModel>> streamFriends(String userPhone) {
    return getFriendsCollection(userPhone)
        .orderBy('name')
        .snapshots()
        .map((snapshot) =>
        snapshot.docs.map((doc) => FriendModel.fromFirestore(doc)).toList());
  }

  Future<FriendModel?> getFriendByPhone(String userPhone, String friendPhone) async {
    final doc = await getFriendsCollection(userPhone).doc(friendPhone).get();
    if (!doc.exists) return null;
    return FriendModel.fromFirestore(doc);
  }

  Future<List<FriendModel>> getAllFriendsForUser(String userPhone) async {
    final snapshot = await getFriendsCollection(userPhone).get();
    return snapshot.docs.map((doc) => FriendModel.fromFirestore(doc)).toList();
  }

  /// (Heavy) Searches everyone’s friend subcollections for a phone.
  /// Kept for backward-compat; prefer pairs/links for new features.
  Future<List<FriendModel>> findFriendsByPhoneGlobal(String phone) async {
    final usersCollection = _firestore.collection('users');
    final userDocs = await usersCollection.get();
    List<FriendModel> foundFriends = [];
    for (var userDoc in userDocs.docs) {
      final friendsCollection = usersCollection.doc(userDoc.id).collection('friends');
      final friendDoc = await friendsCollection.doc(phone).get();
      if (friendDoc.exists) {
        foundFriends.add(FriendModel.fromFirestore(friendDoc));
      }
    }
    return foundFriends;
  }

  // ==== Writes (UPGRADED) ====

  /// Add friend by phone to the current user’s list.
  /// Backward-compatible: still throws if already added locally.
  /// NEW: also creates a pending link (friend_links) so when the friend signs up,
  /// your name auto-appears in their Friends tab. If the friend already exists,
  /// we immediately create a reciprocal mirror and a global pair.
  Future<void> addFriendByPhone({
    required String userPhone,    // E.164 of current user
    required String friendName,   // user-entered label
    required String friendPhone,  // E.164
    String? avatar,               // emoji/url
    String? email,
  }) async {
    // 1) Prevent duplicate in current user's list
    final exists = await getFriendByPhone(userPhone, friendPhone);
    if (exists != null) {
      throw Exception('Friend with this phone already exists');
    }

    // 2) Create/merge local friend doc for current user
    final docRef = getFriendsCollection(userPhone).doc(friendPhone);
    final friend = FriendModel(
      phone: friendPhone,
      name: friendName,
      avatar: avatar ?? "👤",
      email: email,
      docId: friendPhone,
    );
    await docRef.set(friend.toJson(), SetOptions(merge: true));

    // 3) Create/merge pending invite (so friend sees you when they sign up)
    final linkId = '${userPhone}_$friendPhone';
    await _links.doc(linkId).set({
      'inviterPhone': userPhone,
      'friendPhone': friendPhone,
      'inviterName': friendName, // store label for convenience
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    // 4) If friend already has an account, auto-complete the relation now:
    if (await _userExists(friendPhone)) {
      final yourDisplay = await _userProfileName(userPhone);
      await _createGlobalPairAndMirrors(
        userPhone,
        friendPhone,
        nameA: friendName,
        nameB: yourDisplay,
      );

      // Mark both directions active (idempotent)
      await _links.doc('${userPhone}_$friendPhone').set({
        'status': 'active',
        'claimedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      await _links.doc('${friendPhone}_$userPhone').set({
        'status': 'active',
        'claimedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    }
  }

  /// Update friend details for the current user (by phone)
  Future<void> updateFriend(
      String userPhone,
      String friendPhone,
      Map<String, dynamic> updates,
      ) async {
    await getFriendsCollection(userPhone).doc(friendPhone).update(updates);
  }

  /// Delete friend from the current user's mirrored list
  Future<void> deleteFriend(String userPhone, String friendPhone) async {
    await getFriendsCollection(userPhone).doc(friendPhone).delete();

    // Optional: also remove the global pair if exists
    final pairId = _pairId(userPhone, friendPhone);
    final pairDoc = await _pairs.doc(pairId).get();
    if (pairDoc.exists) {
      // Delete both mirrors for a clean break (idempotent)
      final batch = _firestore.batch();
      batch.delete(_pairs.doc(pairId));
      batch.delete(getFriendsCollection(friendPhone).doc(userPhone));
      await batch.commit();
    }
  }

  // ==== New global flow methods ====

  /// Ensure an invite exists without adding to my local list (useful when
  /// referencing a phone elsewhere, e.g., splitting expense with a non-user)
  Future<void> ensureInvite({
    required String inviterPhone,
    required String friendPhone,
    String? inviterName,
    String? friendDisplayNameHint,
  }) async {
    final linkId = '${inviterPhone}_$friendPhone';
    await _links.doc(linkId).set({
      'inviterPhone': inviterPhone,
      'friendPhone': friendPhone,
      'inviterName': inviterName ?? '',
      'friendName': friendDisplayNameHint ?? '',
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    // (Optional) show placeholder in inviter’s friends list immediately
    await getFriendsCollection(inviterPhone).doc(friendPhone).set({
      'phone': friendPhone,
      'name': friendDisplayNameHint ?? friendPhone,
      'avatar': '👤',
      'source': 'invite',
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  /// Call this right after onboarding completes for a user.
  /// It converts pending invites (where this phone was the invitee)
  /// into active friendships (mirrors + global pair), so the inviter
  /// appears automatically in the new user’s Friends tab.
  Future<void> claimPendingFor(String myPhone, String myName) async {
    final q = await _links
        .where('friendPhone', isEqualTo: myPhone)
        .where('status', isEqualTo: 'pending')
        .get();
    if (q.docs.isEmpty) return;

    final batch = _firestore.batch();

    for (final d in q.docs) {
      final data = d.data();
      final inviterPhone = (data['inviterPhone'] as String).trim();
      final inviterProfileName = await _userProfileName(inviterPhone);

      // Global pair
      final pairId = _pairId(inviterPhone, myPhone);
      batch.set(_pairs.doc(pairId), {
        'a': inviterPhone,
        'b': myPhone,
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      // Mirrors: inviter sees me
      batch.set(getFriendsCollection(inviterPhone).doc(myPhone), {
        'phone': myPhone,
        'name': myName,
        'avatar': '👤',
        'source': 'claimed',
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      // Mirrors: I see inviter
      batch.set(getFriendsCollection(myPhone).doc(inviterPhone), {
        'phone': inviterPhone,
        'name': inviterProfileName,
        'avatar': '👤',
        'source': 'claimed',
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      // Mark link active
      batch.update(d.reference, {
        'status': 'active',
        'claimedAt': FieldValue.serverTimestamp(),
      });

      // Also mark reverse direction active if it exists
      final reverse = _links.doc('${myPhone}_$inviterPhone');
      batch.set(reverse, {
        'status': 'active',
        'claimedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    }

    await batch.commit();
  }

  /// Create reciprocal mirrors + global pair (idempotent).
  Future<void> _createGlobalPairAndMirrors(
      String phoneA,
      String phoneB, {
        String? nameA, // how B shows in A's list
        String? nameB, // how A shows in B's list
      }) async {
    final batch = _firestore.batch();
    final pairId = _pairId(phoneA, phoneB);

    final displayForA = nameA ?? await _userProfileName(phoneB);
    final displayForB = nameB ?? await _userProfileName(phoneA);

    // Global pair
    batch.set(_pairs.doc(pairId), {
      'a': phoneA,
      'b': phoneB,
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    // Mirrors
    batch.set(getFriendsCollection(phoneA).doc(phoneB), {
      'phone': phoneB,
      'name': displayForA,
      'avatar': '👤',
      'source': 'pair',
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    batch.set(getFriendsCollection(phoneB).doc(phoneA), {
      'phone': phoneA,
      'name': displayForB,
      'avatar': '👤',
      'source': 'pair',
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    await batch.commit();
  }

  Future<void> backfillNamesForUser(String userPhone) async {
    final snapshot = await getFriendsCollection(userPhone).get();
    for (final doc in snapshot.docs) {
      final currentName = (doc.data()['name'] as String?)?.trim() ?? '';
      final looksPhone = RegExp(r'^[+0-9]{6,}$').hasMatch(currentName);
      if (currentName.isEmpty || looksPhone) {
        final profileName = await _userProfileName(doc.id);
        await doc.reference.set({'name': profileName}, SetOptions(merge: true));
      }
    }
  }
}
