// lib/services/subscriptions/subscriptions_service.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/details/services/recurring_service.dart';
import 'package:lifemap/details/models/recurring_scope.dart';
import 'package:lifemap/details/services/sharing_service.dart';
import 'package:lifemap/ui/tokens.dart';

import '../../core/notifications/local_notifications.dart';
// If you don’t have PushService, comment this import & the call sites.
import '../push/push_service.dart';
import '../../models/suggestion.dart';

/// Aggregate KPIs for "Subscriptions & Bills".
class SubsBillsKpis {
  final int active, paused, closed, overdue;
  final DateTime? nextDue;
  final double monthTotal;
  final double monthProgress; // 0..1
  final String monthMeta;     // "day/total days"

  const SubsBillsKpis({
    required this.active,
    required this.paused,
    required this.closed,
    required this.overdue,
    required this.nextDue,
    required this.monthTotal,
    required this.monthProgress,
    required this.monthMeta,
  });

  SubsBillsKpis copyWith({
    int? active,
    int? paused,
    int? closed,
    int? overdue,
    DateTime? nextDue,
    double? monthTotal,
    double? monthProgress,
    String? monthMeta,
  }) {
    return SubsBillsKpis(
      active: active ?? this.active,
      paused: paused ?? this.paused,
      closed: closed ?? this.closed,
      overdue: overdue ?? this.overdue,
      nextDue: nextDue ?? this.nextDue,
      monthTotal: monthTotal ?? this.monthTotal,
      monthProgress: monthProgress ?? this.monthProgress,
      monthMeta: monthMeta ?? this.monthMeta,
    );
  }
}

/// Convenience container for dashboard cards (counts + soonest due).
class SubsBillsSectionInfo {
  final int activeCount;
  final DateTime? nextDue;
  const SubsBillsSectionInfo({required this.activeCount, required this.nextDue});
}

/// Adapter around RecurringService + SharingService for the Subscriptions & Bills UX.
/// - Works for **friend mirrors** and **groups** transparently.
/// - Provides UI hooks (openEdit/openManage/etc) and share helpers.
class SubscriptionsService {
  final RecurringService _svc;
  final SharingService _share;

  /// Optional defaults so caller can omit scope params.
  final String? defaultUserPhone;  // current user
  final String? defaultFriendId;   // current “friend chat”/context
  final String? defaultGroupId;    // current group context

  SubscriptionsService({
    RecurringService? svc,
    SharingService? share,
    this.defaultUserPhone,
    this.defaultFriendId,
    this.defaultGroupId,
  })  : _svc = svc ?? RecurringService(),
        _share = share ?? SharingService();

  /// 🔁 Where to mirror, if RecurringService lacks a direct create/upsert.
  static const String kUnifiedColl = 'recurring_items';

  /// Safe empty stream so UI never breaks when aggregate stream isn't wired yet.
  Stream<List<SharedItem>> get safeEmptyStream =>
      Stream<List<SharedItem>>.value(const []);

  // ---------------------------------------------------------------------------
  // Streams
  // ---------------------------------------------------------------------------

  /// ✅ Unified live stream across **all** recurring docs that include this user
  /// in `participants.userIds` (works for friends & groups).
  Stream<List<SharedItem>> watchUnified(String userPhone) {
    final s = _resolveUnifiedStream(userPhone) ?? safeEmptyStream;

    return s.map((items) {
      final list = [...items];
      list.sort((a, b) {
        final ax = a.nextDueAt?.millisecondsSinceEpoch ?? 0;
        final bx = b.nextDueAt?.millisecondsSinceEpoch ?? 0;
        return ax.compareTo(bx);
      });
      return list;
    });
  }

  /// Watch only the friend-scope items for this pair (shortcut).
  Stream<List<SharedItem>> watchFriend(String userPhone, String friendId) {
    return _svc.streamByFriend(userPhone, friendId);
  }

  // (Group-scope specific stream isn’t required because watchUnified covers it,
  // but you can add one later in RecurringService if you want a direct group stream.)

  // ---------------------------------------------------------------------------
  // UI hooks (stubs; wire to your routing/sheets as needed)
  // ---------------------------------------------------------------------------

  void openDetails(BuildContext context, SharedItem item) {
    _snack(context, 'Open details for ${item.title ?? 'subscription'}');
  }

  void openEdit(BuildContext context, SharedItem item) {
    _snack(context, 'Edit ${item.title ?? 'subscription'}');
  }

  void openManage(BuildContext context, SharedItem item) {
    _snack(context, 'Manage ${item.title ?? 'subscription'}');
  }

  void openReminder(BuildContext context, SharedItem item) {
    _snack(context, 'Set reminder for ${item.title ?? 'subscription'}');
  }

  /// UI-friendly optimistic "mark paid".
  Future<void> markPaid(BuildContext context, SharedItem item) async {
    _snack(context, 'Marked paid: ${item.title ?? 'subscription'}');
    await markPaidServer(item).catchError((_) {});
  }

  // ---------------------------------------------------------------------------
  // Share helpers (friend / group / invite)
  // ---------------------------------------------------------------------------

  /// Share an existing item (by id) from the current friend scope to another friend.
  /// If you need to share from a group scope or a different pair, pass `source`.
  Future<String?> shareItemToFriend({
    required String itemId,
    String? ownerUserPhone, // defaultUserPhone used if null
    String? targetFriendId, // defaultFriendId used if null
    RecurringScope? source,
  }) async {
    final owner = ownerUserPhone ?? defaultUserPhone;
    final target = targetFriendId ?? defaultFriendId;
    if (owner == null || target == null) return null;

    final src = source ??
        RecurringScope.friend(
          defaultUserPhone ?? owner,
          defaultFriendId ?? target,
        );

    return _share.shareExistingToFriend(
      source: src,
      itemId: itemId,
      ownerUserPhone: owner,
      targetFriendId: target,
    );
  }

  /// Share an existing item (by id) to a group.
  Future<String?> shareItemToGroup({
    required String itemId,
    String? groupId, // defaultGroupId used if null
    RecurringScope? source,
  }) async {
    final gid = groupId ?? defaultGroupId;
    if (gid == null) return null;

    final src = source ??
        (defaultUserPhone != null && defaultFriendId != null
            ? RecurringScope.friend(defaultUserPhone!, defaultFriendId!)
            : RecurringScope.group(gid));

    return _share.shareExistingToGroup(
      source: src,
      itemId: itemId,
      groupId: gid,
    );
  }

  /// Create a deep link to share an item (acceptor will get a friend mirror).
  Future<String> createInviteLink({
    required String itemId,
    String? inviterUserPhone,
    RecurringScope? source,
    Duration ttl = const Duration(days: 3),
    String? schemeBase,
  }) {
    final inviter = inviterUserPhone ?? defaultUserPhone ?? '';
    final src = source ??
        RecurringScope.friend(
          defaultUserPhone ?? inviter,
          defaultFriendId ?? '',
        );
    return _share.createFriendInviteLink(
      source: src,
      itemId: itemId,
      inviterUserPhone: inviter,
      ttl: ttl,
      schemeBase: schemeBase,
    );
  }

  /// Accept a friend invite (token) as the `acceptorUserPhone`.
  Future<String?> acceptInvite({
    required String token,
    required String acceptorUserPhone,
  }) {
    return _share.acceptFriendInvite(
      token: token,
      acceptorUserPhone: acceptorUserPhone,
    );
  }

  // ---------------------------------------------------------------------------
  // Refresh hook (best-effort calls against RecurringService)
  // ---------------------------------------------------------------------------

  Future<void> pokeRefresh([String? userPhone, String? friendId]) async {
    final dyn = _svc as dynamic;
    try { await dyn.refresh?.call(userPhone ?? defaultUserPhone, friendId ?? defaultFriendId); } catch (_) {}
    try { await dyn.reload?.call(userPhone ?? defaultUserPhone, friendId ?? defaultFriendId); } catch (_) {}
    try { await dyn.invalidateCache?.call(userPhone ?? defaultUserPhone, friendId ?? defaultFriendId); } catch (_) {}
    try { await dyn.sync?.call(userPhone ?? defaultUserPhone, friendId ?? defaultFriendId); } catch (_) {}
    try { await dyn.refetch?.call(userPhone ?? defaultUserPhone, friendId ?? defaultFriendId); } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Firestore-side confirm/reject flows (existing auto-detection UX)
  // ---------------------------------------------------------------------------

  Future<void> confirmSubscription({
    required String userId,
    required String subscriptionId,
  }) async {
    final db = FirebaseFirestore.instance;
    final ref = db.collection('users').doc(userId)
        .collection('subscriptions').doc(subscriptionId);

    final snap = await ref.get();
    if (!snap.exists) return;

    final data = snap.data()!;
    final brand = (data['brand'] ?? '').toString();
    await ref.update({
      'needsConfirmation': false,
      'active': true,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    await _relinkPendingExpenses(
      db: db,
      userId: userId,
      brandOrLender: brand.isEmpty ? 'UNKNOWN' : brand,
      isLoan: false,
      targetId: subscriptionId,
    );

    await upsertUnifiedFromSubscription(userId: userId, subscriptionId: subscriptionId);
    await pokeRefresh(defaultUserPhone, defaultFriendId);
  }

  Future<void> confirmLoan({
    required String userId,
    required String loanId,
  }) async {
    final db = FirebaseFirestore.instance;
    final ref = db.collection('users').doc(userId)
        .collection('loans').doc(loanId);

    final snap = await ref.get();
    if (!snap.exists) return;

    final data = snap.data()!;
    final lender = (data['lender'] ?? '').toString();
    await ref.update({
      'needsConfirmation': false,
      'active': true,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    await _relinkPendingExpenses(
      db: db,
      userId: userId,
      brandOrLender: lender.isEmpty ? 'UNKNOWN' : lender,
      isLoan: true,
      targetId: loanId,
    );

    await upsertUnifiedFromLoan(userId: userId, loanId: loanId);
    await pokeRefresh(defaultUserPhone, defaultFriendId);
  }

  Future<void> rejectSubscription({
    required String userId,
    required String subscriptionId,
    bool hardDelete = false,
  }) async {
    final db = FirebaseFirestore.instance;
    final ref = db.collection('users').doc(userId)
        .collection('subscriptions').doc(subscriptionId);
    if (hardDelete) {
      await ref.delete();
    } else {
      await ref.update({
        'active': false,
        'needsConfirmation': false,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
    await pokeRefresh(defaultUserPhone, defaultFriendId);
  }

  Future<void> rejectLoan({
    required String userId,
    required String loanId,
    bool hardDelete = false,
  }) async {
    final db = FirebaseFirestore.instance;
    final ref = db.collection('users').doc(userId)
        .collection('loans').doc(loanId);
    if (hardDelete) {
      await ref.delete();
    } else {
      await ref.update({
        'active': false,
        'needsConfirmation': false,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
    await pokeRefresh(defaultUserPhone, defaultFriendId);
  }

  /// Small helper to display a **Review (n)** chip without wiring streams manually.
  Stream<int> pendingCount({required String userId, required bool isLoans}) {
    final col = FirebaseFirestore.instance.collection('users').doc(userId)
        .collection(isLoans ? 'loans' : 'subscriptions');
    return col.where('needsConfirmation', isEqualTo: true)
        .snapshots()
        .map((s) => s.docs.length);
  }

  // ---------------------------------------------------------------------------
  // Unified upsert helpers (fallback store; optional)
  // ---------------------------------------------------------------------------

  Future<void> upsertUnifiedFromSubscription({
    required String userId,
    required String subscriptionId,
  }) async {
    final db = FirebaseFirestore.instance;
    final subRef = db.collection('users').doc(userId)
        .collection('subscriptions').doc(subscriptionId);
    final snap = await subRef.get();
    if (!snap.exists) return;
    final d = snap.data() ?? {};

    final payload = {
      'type': 'subscription',
      'title': (d['brand'] ?? 'Subscription').toString(),
      'amount': _toDouble(d['expectedAmount']),
      'frequency': (d['recurrence'] ?? 'monthly').toString(),
      'nextDueAt': d['nextDue'] is Timestamp ? (d['nextDue'] as Timestamp).toDate() : null,
      'status': true == (d['active'] ?? true) ? 'active' : 'paused',
      'sourceId': subscriptionId,
      'source': 'subscriptions',
      'updatedAt': FieldValue.serverTimestamp(),
    };

    final dyn = _svc as dynamic;
    bool called = false;
    try { await dyn.createFromSubscription?.call(userId, payload); called = true; } catch (_) {}
    try { await dyn.upsertFromSubscription?.call(userId, payload); called = true; } catch (_) {}
    try { await dyn.createRecurring?.call(userId, payload); called = true; } catch (_) {}
    try { await dyn.upsertRecurring?.call(userId, payload); called = true; } catch (_) {}

    if (!called) {
      final uni = db.collection('users').doc(userId).collection(kUnifiedColl);
      final uniId = 'sub_$subscriptionId';
      await uni.doc(uniId).set(payload, SetOptions(merge: true));
    }
  }

  Future<void> upsertUnifiedFromLoan({
    required String userId,
    required String loanId,
  }) async {
    final db = FirebaseFirestore.instance;
    final loanRef = db.collection('users').doc(userId)
        .collection('loans').doc(loanId);
    final snap = await loanRef.get();
    if (!snap.exists) return;
    final d = snap.data() ?? {};

    final payload = {
      'type': 'emi',
      'title': (d['lender'] ?? 'Loan').toString(),
      'amount': _toDouble(d['emiAmount']),
      'frequency': 'monthly',
      'nextDueAt': d['nextDue'] is Timestamp ? (d['nextDue'] as Timestamp).toDate() : null,
      'status': true == (d['active'] ?? true) ? 'active' : 'paused',
      'sourceId': loanId,
      'source': 'loans',
      'updatedAt': FieldValue.serverTimestamp(),
    };

    final dyn = _svc as dynamic;
    bool called = false;
    try { await dyn.createFromLoan?.call(userId, payload); called = true; } catch (_) {}
    try { await dyn.upsertFromLoan?.call(userId, payload); called = true; } catch (_) {}
    try { await dyn.createRecurring?.call(userId, payload); called = true; } catch (_) {}
    try { await dyn.upsertRecurring?.call(userId, payload); called = true; } catch (_) {}

    if (!called) {
      final uni = db.collection('users').doc(userId).collection(kUnifiedColl);
      final uniId = 'loan_$loanId';
      await uni.doc(uniId).set(payload, SetOptions(merge: true));
    }
  }

  // ---------------------------------------------------------------------------
  // Dynamic fallback to RecurringService stream methods
  // ---------------------------------------------------------------------------

  Stream<List<SharedItem>>? _resolveUnifiedStream(String userPhone) {
    final dyn = _svc as dynamic;
    final labeled = <String, Stream<List<SharedItem>>?>{
      'streamAll'           : _tryStream(() => dyn.streamAll(userPhone)),
      'watchAll'            : _tryStream(() => dyn.watchAll(userPhone)),
      'watchUserRecurring'  : _tryStream(() => dyn.watchUserRecurring(userPhone)),
      'streamUserRecurring' : _tryStream(() => dyn.streamUserRecurring(userPhone)),
      'stream'              : _tryStream(() => dyn.stream(userPhone)),
      'watch'               : _tryStream(() => dyn.watch(userPhone)),
      'streamAllForUser'    : _tryStream(() => dyn.streamAllForUser(userPhone)),
      'watchAllForUser'     : _tryStream(() => dyn.watchAllForUser(userPhone)),
    };

    for (final entry in labeled.entries) {
      final name = entry.key;
      final stream = entry.value;
      if (stream != null) {
        debugPrint('[SubsBills] using RecurringService.$name(userPhone)');
        return stream;
      }
    }
    debugPrint('[SubsBills] no matching RecurringService stream; using empty stream');
    return null;
  }

  Stream<List<SharedItem>>? _tryStream(
      Stream<List<SharedItem>> Function() call,
      ) {
    try {
      final res = call();
      if (res is Stream<List<SharedItem>>) return res;
    } catch (_) {}
    return null;
  }

  // ---------------------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------------------

  String formatInr(num? n) {
    if (n == null || n <= 0) return '--';
    final i = n.round();
    if (i >= 10000000) return '₹${(i / 10000000).toStringAsFixed(1)}Cr';
    if (i >= 100000)  return '₹${(i / 100000).toStringAsFixed(1)}L';
    if (i >= 1000)    return '₹${(i / 1000).toStringAsFixed(1)}k';
    return '₹$i';
  }

  DateTime dateOrEpoch(DateTime? d) => d ?? DateTime.fromMillisecondsSinceEpoch(0);

  DateTime? minDue(Iterable<SharedItem> items) {
    DateTime? d;
    for (final x in items) {
      final nd = x.nextDueAt;
      if (nd == null) continue;
      if (d == null || nd.isBefore(d)) d = nd;
    }
    return d;
  }

  int countDueWithin(List<SharedItem> items, {required int days}) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final end = today.add(Duration(days: days));
    return items.where((e) {
      if (e.rule.status == 'ended') return false;
      final nd = e.nextDueAt;
      if (nd == null) return false;
      final due = DateTime(nd.year, nd.month, nd.day);
      return !due.isBefore(today) && due.isBefore(end);
    }).length;
  }

  Map<String, List<SharedItem>> partitionByType(List<SharedItem> items) {
    final map = <String, List<SharedItem>>{
      'recurring': [],
      'subscription': [],
      'emi': [],
      'reminder': [],
    };
    for (final it in items) {
      final key = (it.type ?? 'unknown');
      (map[key] ??= []).add(it);
    }
    return map;
  }

  Map<String, SubsBillsSectionInfo> buildSectionsSummary(List<SharedItem> items) {
    final p = partitionByType(items);
    DateTime? nextFor(String k) => minDue(p[k] ?? const []);
    int activeFor(String k) => (p[k] ?? const []).where((e) => e.rule.status != 'ended').length;

    return {
      'recurring': SubsBillsSectionInfo(activeCount: activeFor('recurring'),   nextDue: nextFor('recurring')),
      'subscription': SubsBillsSectionInfo(activeCount: activeFor('subscription'), nextDue: nextFor('subscription')),
      'emi': SubsBillsSectionInfo(activeCount: activeFor('emi'),               nextDue: nextFor('emi')),
      'reminder': SubsBillsSectionInfo(activeCount: activeFor('reminder'),     nextDue: nextFor('reminder')),
    };
  }

  String prettyType(String key) {
    switch (key) {
      case 'recurring':   return 'Recurring';
      case 'subscription':return 'Subscriptions';
      case 'emi':         return 'EMIs / Loans';
      case 'reminder':    return 'Reminders';
      default:            return key;
    }
  }

  SubsBillsKpis computeKpis(List<SharedItem> items) {
    int active = 0, paused = 0, closed = 0, overdue = 0;
    DateTime? nextDue;
    double monthTotal = 0.0;

    final now = DateTime.now();
    final start = DateTime(now.year, now.month, 1);
    final today = DateTime(now.year, now.month, now.day);
    final endMonth = DateTime(now.year, now.month + 1, 1).subtract(const Duration(days: 1));

    final totalDays = endMonth.day;
    final monthProgress = totalDays == 0 ? 0.0 : (now.day / totalDays).clamp(0.0, 1.0);
    final monthMeta = '${now.day}/$totalDays days';

    for (final it in items) {
      switch (it.rule.status) {
        case 'paused': paused++; break;
        case 'ended':  closed++; break;
        default:       active++; break;
      }

      final due = it.nextDueAt;
      if (due != null) {
        if (nextDue == null || due.isBefore(nextDue)) nextDue = due;

        if (due.year == start.year && due.month == start.month) {
          final amt = (it.rule.amount ?? 0).toDouble();
          if (amt > 0) monthTotal += amt;
        }

        final d = DateTime(due.year, due.month, due.day);
        if (d.isBefore(today) && it.rule.status == 'active') overdue++;
      }
    }

    return SubsBillsKpis(
      active: active,
      paused: paused,
      closed: closed,
      overdue: overdue,
      nextDue: nextDue,
      monthTotal: monthTotal,
      monthProgress: monthProgress.toDouble(),
      monthMeta: monthMeta,
    );
  }

  // ---------------------------------------------------------------------------
  // Server-side actions (back-compat; uses RecurringService dynamically)
  // ---------------------------------------------------------------------------

  bool _resolveIds(
      String? userPhone,
      String? friendId,
      FutureOr<void> Function(String u, String f) fn,
      ) {
    final u = userPhone ?? defaultUserPhone;
    final f = friendId ?? defaultFriendId;
    if (u == null || f == null) return false;
    fn(u, f);
    return true;
  }

  Future<bool> markPaidServer(
      SharedItem it, [
        String? userPhone,
        String? friendId,
      ]) async {
    try {
      final ok = _resolveIds(userPhone, friendId, (u, f) async {
        final dyn = _svc as dynamic;
        try { await dyn.markPaid(u, f, it.id, amount: it.rule.amount); } catch (_) {}
        try { await dyn.bumpNextDue?.call(u, f, it.id); } catch (_) {}
      });
      return ok;
    } catch (_) {
      return false;
    }
  }

  Future<bool> togglePause(
      SharedItem it, [
        String? userPhone,
        String? friendId,
      ]) async {
    try {
      final ok = _resolveIds(userPhone, friendId, (u, f) async {
        final dyn = _svc as dynamic;
        if (it.rule.status == 'paused') {
          try { await dyn.resume(u, f, it.id); } catch (_) {}
        } else if (it.rule.status == 'active') {
          try { await dyn.pause(u, f, it.id); } catch (_) {}
        }
      });
      return ok;
    } catch (_) {
      return false;
    }
  }

  Future<bool> end(
      SharedItem it, [
        String? userPhone,
        String? friendId,
      ]) async {
    try {
      final ok = _resolveIds(userPhone, friendId, (u, f) async {
        final dyn = _svc as dynamic;
        try { await dyn.end(u, f, it.id); } catch (_) {}
      });
      return ok;
    } catch (_) {
      return false;
    }
  }

  Future<bool> deleteOrEnd(
      SharedItem it, [
        String? userPhone,
        String? friendId,
      ]) async {
    try {
      final ok = _resolveIds(userPhone, friendId, (u, f) async {
        final dyn = _svc as dynamic;
        try {
          await dyn.delete(u, f, it.id);
        } catch (_) {
          try { await dyn.end(u, f, it.id); } catch (_) {}
        }
      });
      return ok;
    } catch (_) {
      return false;
    }
  }

  Future<bool> quickEditTitle(
      BuildContext context,
      SharedItem it, [
        String? userPhone,
        String? friendId,
      ]) async {
    final controller = TextEditingController(text: it.title ?? '');

    final okDialog = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Edit item'),
          content: TextField(
            controller: controller,
            decoration: const InputDecoration(
              labelText: 'Title',
              hintText: 'Enter title',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save'),
            ),
          ],
        );
      },
    );

    if (okDialog == true) {
      try {
        final ok = _resolveIds(userPhone, friendId, (u, f) async {
          final dyn = _svc as dynamic;
          try { await dyn.updateTitle(u, f, it.id, controller.text.trim()); } catch (_) {}
        });
        return ok;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  Future<bool> addQuickReminder(
      BuildContext context,
      SharedItem it, [
        String? userPhone,
        String? friendId,
      ]) async {
    try {
      // Hook your reminder add flow here if needed.
      return false;
    } catch (_) {
      return false;
    }
  }

  /// Schedules a local one-off notification at 9:00 on/before the next due date.
  Future<bool> scheduleNextLocal(
      SharedItem it, [
        String? userPhone,
        String? friendId,
        int daysBefore = 0,
        int hour = 9,
        int minute = 0,
      ]) async {
    try {
      await LocalNotifs.init();
      final now = DateTime.now();
      final dyn = _svc as dynamic;

      DateTime? next = it.nextDueAt;
      if (next == null) {
        try { next = dyn.computeNextDue(it.rule, from: now); } catch (_) {}
        next ??= now;
      }

      DateTime fireAt = DateTime(next.year, next.month, next.day, hour, minute)
          .subtract(Duration(days: daysBefore));
      if (!fireAt.isAfter(now)) {
        fireAt = now.add(const Duration(minutes: 1));
      }

      await LocalNotifs.scheduleOnce(
        itemId: it.id,
        title: _notifTitle(it),
        body: _notifBody(it, next),
        fireAt: fireAt,
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Sends a local push-like nudge (requires PushService).
  Future<bool> nudgeNow(
      SharedItem it, [
        String? userPhone,
        String? friendId,
      ]) async {
    try {
      await PushService.nudgeFriendRecurringLocal(
        friendId: friendId ?? defaultFriendId ?? '',
        itemTitle: (it.title == null || it.title!.isEmpty) ? 'Reminder' : it.title!,
        dueOn: it.nextDueAt,
        frequency: it.rule.frequency ?? '',
        amount: (() {
          final amt = (it.rule.amount ?? 0).toDouble();
          return amt > 0 ? '₹${amt.toStringAsFixed(0)}' : null;
        })(),
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<int> closeAllOfType(
      String typeKey,
      List<SharedItem> items, [
        String? userPhone,
        String? friendId,
      ]) async {
    int closed = 0;
    final okBase = _resolveIds(userPhone, friendId, (u, f) {});
    if (!okBase) return 0;

    final toEnd = items.where((x) =>
    x.type == typeKey && (x.rule.status == 'active' || x.rule.status == 'paused'));
    for (final it in toEnd) {
      try {
        final dyn = _svc as dynamic;
        await dyn.end(userPhone ?? defaultUserPhone!, friendId ?? defaultFriendId!, it.id);
        closed++;
      } catch (_) {}
    }
    return closed;
  }

  // ---------------------------------------------------------------------------
  // Add flows (safe hooks)
  // ---------------------------------------------------------------------------

  Future<void> openAddEntry(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      barrierColor: Colors.black.withOpacity(0.45),
      backgroundColor: Colors.white.withOpacity(0.98),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) {
        var pad = const EdgeInsets.fromLTRB(16, 20, 16, 16);
        final bottomInset = MediaQuery.of(sheetCtx).viewPadding.bottom;
        if (bottomInset > 0) {
          pad = EdgeInsets.fromLTRB(16, 20, 16, 16 + bottomInset);
        }
        Widget tile({
          required IconData icon,
          required String title,
          required VoidCallback onTap,
          String? subtitle,
        }) {
          return ListTile(
            leading: CircleAvatar(
              radius: 22,
              backgroundColor: AppColors.mint.withOpacity(.12),
              child: Icon(icon, color: AppColors.mint),
            ),
            title: Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: subtitle == null
                ? null
                : Text(subtitle, style: TextStyle(color: Colors.black.withOpacity(0.6))),
            trailing: const Icon(Icons.chevron_right_rounded, color: Colors.black54),
            onTap: () {
              Navigator.pop(sheetCtx);
              onTap();
            },
          );
        }

        return Padding(
          padding: pad,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 6,
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(height: 20),
              tile(
                icon: Icons.repeat_rounded,
                title: 'Add Recurring',
                subtitle: 'Split rent, utilities, retainers',
                onTap: () => openAddFromType(context, 'recurring'),
              ),
              const SizedBox(height: 6),
              tile(
                icon: Icons.subscriptions_rounded,
                title: 'Add Subscription',
                subtitle: 'Apps, OTT, memberships',
                onTap: () => openAddFromType(context, 'subscription'),
              ),
              const SizedBox(height: 6),
              tile(
                icon: Icons.account_balance_rounded,
                title: 'Link EMI / Loan',
                subtitle: 'Track repayments automatically',
                onTap: () => openAddFromType(context, 'emi'),
              ),
              const SizedBox(height: 6),
              tile(
                icon: Icons.alarm_rounded,
                title: 'Add Reminder',
                subtitle: 'Light nudges without amounts',
                onTap: () => openAddFromType(context, 'reminder'),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> openAddFromType(BuildContext context, String typeKey) async {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Open add flow for $typeKey')),
    );
  }

  Future<void> createFromSuggestion(BuildContext context, Suggestion s) async {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Added ${s.merchant}')),
    );
  }

  // ---------------------------------------------------------------------------
  // Notification helpers
  // ---------------------------------------------------------------------------

  String _notifTitle(SharedItem it) {
    switch (it.type) {
      case 'subscription': return 'Subscription due: ${it.title ?? 'Subscription'}';
      case 'emi':          return 'EMI due: ${it.title ?? 'Loan'}';
      case 'reminder':     return 'Reminder: ${it.title ?? 'Reminder'}';
      default:             return 'Reminder: ${it.title ?? 'Recurring'}';
    }
  }

  String _notifBody(SharedItem it, DateTime due) {
    final when = '${due.day}-${due.month}-${due.year}';
    final freqStr = (it.rule.frequency ?? '').isNotEmpty ? ' • ${it.rule.frequency}' : '';
    final amtVal = (it.rule.amount ?? 0).toDouble();
    final amt = amtVal > 0 ? ' • ₹${amtVal.toStringAsFixed(0)}' : '';
    final name = it.title ?? 'Item';
    return '$name is due on $when$freqStr$amt';
  }

  // ---------------------------------------------------------------------------
  // Business helpers
  // ---------------------------------------------------------------------------

  static bool computeOverdue({
    required DateTime now,
    required DateTime? nextDue,
    required DateTime? lastPaidAt,
    required bool active,
    Duration grace = const Duration(days: 3),
  }) {
    if (!active || nextDue == null) return false;
    if (lastPaidAt != null &&
        lastPaidAt.isAfter(nextDue.subtract(const Duration(days: 0)))) {
      return false;
    }
    return now.isAfter(nextDue.add(grace));
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  double _toDouble(dynamic v) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? 0.0;
    return 0.0;
  }

  Future<void> _relinkPendingExpenses({
    required FirebaseFirestore db,
    required String userId,
    required String brandOrLender,
    required bool isLoan,
    required String targetId,
    int limit = 80,
  }) async {
    final expenses = await db.collection('users').doc(userId)
        .collection('expenses')
        .where('merchantKey', isEqualTo: brandOrLender)
        .limit(limit)
        .get();

    final pathField = isLoan ? 'linkedLoanId' : 'linkedSubscriptionId';
    final batch = db.batch();
    for (final e in expenses.docs) {
      if ((e.data()[pathField] ?? '') == 'PENDING') {
        batch.update(e.reference, {pathField: targetId});
      }
    }
    await batch.commit();
  }

  void _snack(BuildContext context, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }
}
