import 'dart:async';
import 'dart:math' as math;

import 'package:characters/characters.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'package:lifemap/services/notif_prefs_service.dart' as Prefs;
import 'package:lifemap/services/push/push_service.dart';

/// Listens for social events (friends, shared expenses) and nudges locally.
/// Call [bind] after login and [unbind] on logout/dispose.
class SocialEventsWatch {
  SocialEventsWatch._();

  static StreamSubscription? _friendsSub;
  static StreamSubscription? _expensesSub;
  static StreamSubscription? _joinsByInviteSub;
  static StreamSubscription? _pairEdgesA;
  static StreamSubscription? _pairEdgesB;
  static DateTime _bootAt = DateTime.now();
  static final _seenExpense = <String>{};
  static final _seenJoins = <String>{};

  static String get _uid => FirebaseAuth.instance.currentUser?.uid ?? '';

  static Future<void> bind(String userPhone) async {
    await unbind();
    _bootAt = DateTime.now().subtract(const Duration(seconds: 3));

    final prefs = await Prefs.NotifPrefsService.fetchForUser(_uid);
    final channels = (prefs['channels'] as Map?) ?? const {};
    final partnerOn = (channels['partner_checkins'] ?? true) == true;
    final nudgeOn = (channels['settleup_nudges'] ?? true) == true;

    final db = FirebaseFirestore.instance;

    if (partnerOn) {
      _friendsSub = FirebaseFirestore.instance
          .collection('users')
          .doc(userPhone)
          .collection('friends')
          .snapshots()
          .listen((snapshot) async {
        for (final change in snapshot.docChanges) {
          if (change.type != DocumentChangeType.added) continue;
          final data = change.doc.data() ?? {};
          final addedAt = _tsOrNow(data['createdAt']);
          if (addedAt.isBefore(_bootAt)) continue;

          final phone = (data['phone'] ?? '') as String;
          final name = ((data['name'] ?? '') as String).trim();
          final who = name.isNotEmpty
              ? name
              : (phone.isNotEmpty ? 'Friend' : 'New friend');

          final copy = <String>[
            '🎉 $who is now on Fiinny — say hi!',
            '🤝 You’re connected with $who. Split smarter, stress less.',
            '👋 $who just joined your circle. Tap to add first expense.',
          ];
          final body = copy[math.Random().nextInt(copy.length)];
          await PushService.showLocalSmart(
            title: 'New friend',
            body: body,
            deeplink: 'app://friends',
            channelId: 'fiinny_nudges',
          );
        }
      });
    }

    if (nudgeOn) {
      _expensesSub = FirebaseFirestore.instance
          .collection('users')
          .doc(userPhone)
          .collection('expenses')
          .orderBy('date', descending: true)
          .limit(40)
          .snapshots()
          .listen((snapshot) async {
        for (final change in snapshot.docChanges) {
          if (change.type != DocumentChangeType.added) continue;

          final id = change.doc.id;
          if (_seenExpense.contains(id)) continue;
          _seenExpense.add(id);

          final data = change.doc.data() ?? {};
          final createdAt =
              _tsOrNow(data['createdAt'] ?? data['updatedAt'] ?? data['date']);
          if (createdAt.isBefore(_bootAt)) continue;

          final payer = (data['payerId'] ?? '') as String;
          final friendIds = ((data['friendIds'] ?? const []) as List).cast<String>();
          final you = userPhone;

          final itAffectsMe = payer == you || friendIds.contains(you);
          final addedByMe = data['sourceRecord'] is Map
              ? (((data['sourceRecord'] as Map)['addedBy'] ?? you) == you)
              : payer == you;
          if (!itAffectsMe || addedByMe) continue;

          final amount = (data['amount'] as num?)?.toDouble() ?? 0;
          final label =
              ((data['label'] ?? data['category'] ?? 'Expense') as String).trim();
          var who = (data['counterparty'] ?? '').toString().trim();
          if (who.isEmpty) {
            who = 'Your friend';
          }

          final variants = <String>[
            '💸 $who added ₹${amount.toStringAsFixed(0)} • $label',
            '🧾 New shared expense • ₹${amount.toStringAsFixed(0)} • $label',
            '🤝 Split updated with $who • ₹${amount.toStringAsFixed(0)}',
          ];
          final body = variants[math.Random().nextInt(variants.length)];
          await PushService.showLocalSmart(
            title: 'Shared expense added',
            body: body,
            deeplink: 'app://friends',
            channelId: 'fiinny_nudges',
          );
        }
      });
    }

    _joinsByInviteSub = db
        .collection('friend_links')
        .where('inviterPhone', isEqualTo: userPhone)
        .where('status', isEqualTo: 'active')
        .orderBy('claimedAt', descending: true)
        .limit(50)
        .snapshots()
        .listen((snapshot) async {
      for (final change in snapshot.docChanges) {
        if (change.type != DocumentChangeType.added &&
            change.type != DocumentChangeType.modified) {
          continue;
        }

        final data = change.doc.data() ?? {};
        final claimedAt = _tsOrNow(data['claimedAt']);
        if (claimedAt.isBefore(_bootAt)) continue;

        final friendPhone = (data['friendPhone'] ?? '').toString();
        final friendName = (data['friendName'] ?? '').toString().trim();
        if (friendPhone.isEmpty) continue;
        if (_seenJoins.contains(friendPhone)) continue;
        _seenJoins.add(friendPhone);

        final who = friendName.isNotEmpty ? friendName : 'Your contact';
        await PushService.showLocalSmart(
          title: '🎉 They joined Fiinny',
          body:
              '$who is now on Fiinny. You’re connected and can split instantly.',
          deeplink: 'app://friends',
          channelId: 'fiinny_nudges',
        );
      }
    });

    Future<void> onPairEdge(
      QuerySnapshot<Map<String, dynamic>> snapshot,
    ) async {
      for (final change in snapshot.docChanges) {
        if (change.type != DocumentChangeType.added) continue;
        final data = change.doc.data();
        final map = data ?? const <String, dynamic>{};
        final createdAt = _tsOrNow(map['createdAt']);
        if (createdAt.isBefore(_bootAt)) continue;

        final a = (map['a'] ?? '').toString();
        final b = (map['b'] ?? '').toString();
        final other = a == userPhone
            ? b
            : (b == userPhone
                ? a
                : '');
        if (other.isEmpty) continue;
        if (_seenJoins.contains(other)) continue;
        _seenJoins.add(other);

        final preview = other.characters.take(4).toString();
        await PushService.showLocalSmart(
          title: '🤝 Connected',
          body:
              'You’re now connected with $preview… on Fiinny. Add your first split!',
          deeplink: 'app://friends',
          channelId: 'fiinny_nudges',
        );
      }
    }

    _pairEdgesA = db
        .collection('friends_pairs')
        .where('a', isEqualTo: userPhone)
        .orderBy('createdAt', descending: true)
        .limit(50)
        .snapshots()
        .listen(onPairEdge);

    _pairEdgesB = db
        .collection('friends_pairs')
        .where('b', isEqualTo: userPhone)
        .orderBy('createdAt', descending: true)
        .limit(50)
        .snapshots()
        .listen(onPairEdge);
  }

  static Future<void> unbind() async {
    await _friendsSub?.cancel();
    await _expensesSub?.cancel();
    await _joinsByInviteSub?.cancel();
    await _pairEdgesA?.cancel();
    await _pairEdgesB?.cancel();
    _friendsSub = null;
    _expensesSub = null;
    _joinsByInviteSub = null;
    _pairEdgesA = null;
    _pairEdgesB = null;
    _seenExpense.clear();
    _seenJoins.clear();
  }

  static DateTime _tsOrNow(dynamic ts) {
    if (ts is Timestamp) return ts.toDate();
    if (ts is int) {
      return DateTime.fromMillisecondsSinceEpoch(ts);
    }
    if (ts is DateTime) return ts;
    return DateTime.now();
  }
}
