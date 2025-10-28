// lib/services/subscriptions/subscriptions_service.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/details/services/recurring_service.dart';
import 'package:lifemap/details/models/recurring_scope.dart';
import 'package:lifemap/details/services/sharing_service.dart';

import '../../core/notifications/local_notifications.dart';
// If you don’t have PushService, comment this import & the call sites.
import '../push/push_service.dart';
import '../../models/suggestion.dart';

// 👇 NEW: reuse the same choices sheet but with custom options (adds "Card").
import '../../details/recurring/add_choice_sheet.dart';

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
class SubscriptionsService {
  final RecurringService _svc;
  final SharingService _share;

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

  static const String kUnifiedColl = 'recurring_items';

  Stream<List<SharedItem>> get safeEmptyStream =>
      Stream<List<SharedItem>>.value(const []);

  // ---------------------------------------------------------------------------
  // Streams
  // ---------------------------------------------------------------------------

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

  Stream<List<SharedItem>> watchFriend(String userPhone, String friendId) {
    return _svc.streamByFriend(userPhone, friendId);
  }

  // ---------------------------------------------------------------------------
  // UI hooks (stubs; existing)
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

  Future<void> markPaid(BuildContext context, SharedItem item) async {
    _snack(context, 'Marked paid: ${item.title ?? 'subscription'}');
    await markPaidServer(item).catchError((_) {});
  }

  // ---------------------------------------------------------------------------
  // Share helpers (existing)
  // ---------------------------------------------------------------------------

  Future<String?> shareItemToFriend({
    required String itemId,
    String? ownerUserPhone,
    String? targetFriendId,
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

  Future<String?> shareItemToGroup({
    required String itemId,
    String? groupId,
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
  // Refresh hook (best-effort)
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
  // Confirm/Reject (existing)
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

  Stream<int> pendingCount({required String userId, required bool isLoans}) {
    final col = FirebaseFirestore.instance.collection('users').doc(userId)
        .collection(isLoans ? 'loans' : 'subscriptions');
    return col.where('needsConfirmation', isEqualTo: true)
        .snapshots()
        .map((s) => s.docs.length);
  }

  // ---------------------------------------------------------------------------
  // Unified upsert helpers (existing)
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
  // Dynamic stream resolver (existing)
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
      final stream = entry.value;
      if (stream != null) {
        debugPrint('[SubsBills] using RecurringService.${entry.key}(userPhone)');
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
  // Formatting helpers (existing)
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
  // Server-side actions (existing)
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
  // Add flows (existing)
  // ---------------------------------------------------------------------------

  Future<void> openAddEntry(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.repeat_rounded),
              title: const Text('Add Recurring'),
              onTap: () {
                Navigator.pop(context);
                openAddFromType(context, 'recurring');
              },
            ),
            ListTile(
              leading: const Icon(Icons.subscriptions_rounded),
              title: const Text('Add Subscription'),
              onTap: () {
                Navigator.pop(context);
                openAddFromType(context, 'subscription');
              },
            ),
            ListTile(
              leading: const Icon(Icons.account_balance_rounded),
              title: const Text('Link EMI / Loan'),
              onTap: () {
                Navigator.pop(context);
                openAddFromType(context, 'emi');
              },
            ),
            ListTile(
              leading: const Icon(Icons.alarm_rounded),
              title: const Text('Add Reminder'),
              onTap: () {
                Navigator.pop(context);
                openAddFromType(context, 'reminder');
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
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
  // NEW: Quick add sheet for Subs/Bills (adds "Card")
  // ---------------------------------------------------------------------------

  Future<void> openQuickAddForSubs(
    BuildContext context, {
    required String userId,
  }) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => AddChoiceSheet(
        title: 'Add to Subs & Bills',
        onPick: (v) => Navigator.pop(_, v),
        options: const [
          AddChoice(
            icon: Icons.repeat_rounded,
            title: 'Recurring bill',
            subtitle: 'Monthly / weekly — amount + due day',
            value: 'recurring',
          ),
          AddChoice(
            icon: Icons.subscriptions_rounded,
            title: 'Subscription',
            subtitle: 'Apps, OTT, gym — billing day',
            value: 'subscription',
          ),
          AddChoice(
            icon: Icons.account_balance_rounded,
            title: 'EMI / Loan',
            subtitle: 'Link an existing loan as recurring EMI',
            value: 'emi',
          ),
          AddChoice(
            icon: Icons.alarm_rounded,
            title: 'Custom reminder',
            subtitle: 'Light reminder with cadence',
            value: 'reminder',
          ),
          AddChoice(
            icon: Icons.credit_card_rounded,
            title: 'Card',
            subtitle: 'Credit card & billing cycle',
            value: 'card',
          ),
        ],
      ),
    );

    if (choice == null) return;

    if (choice == 'card') {
      await openAddCard(context, userId: userId);
    } else {
      await openAddFromType(context, choice);
    }
  }

  // ---------------------------------------------------------------------------
  // NEW: Add Card (simple sheet) -> users/<id>/cards/<doc>
  // ---------------------------------------------------------------------------

  Future<void> openAddCard(
    BuildContext context, {
    required String userId,
  }) async {
    final issuer = TextEditingController();
    final last4 = TextEditingController();
    final billingDay = TextEditingController();
    final statementDay = TextEditingController();
    final limitCtrl = TextEditingController();

    Future<bool> save(bool autopay) async {
      final iss = issuer.text.trim();
      final l4 = last4.text.trim();
      final bDay = int.tryParse(billingDay.text.trim());
      final sDay = statementDay.text.trim().isEmpty
          ? null
          : int.tryParse(statementDay.text.trim());
      final limit = limitCtrl.text.trim().isEmpty
          ? null
          : double.tryParse(limitCtrl.text.trim());

      if (iss.isEmpty || l4.length != 4 || bDay == null || bDay < 1 || bDay > 31) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please enter issuer, last 4 digits (4) and billing day (1–31).')),
        );
        return false;
      }

      final due = _nextDueDate(bDay);

      final db = FirebaseFirestore.instance;
      final ref = db.collection('users').doc(userId).collection('cards').doc();

      await ref.set({
        'issuer': iss,
        'last4': l4,
        'billingDay': bDay,
        if (sDay != null) 'statementDay': sDay,
        if (limit != null) 'creditLimit': limit,
        'autopay': autopay,
        'status': 'ok',
        'createdAt': FieldValue.serverTimestamp(),
        'lastBill': {
          'dueDate': Timestamp.fromDate(due),
          'totalDue': 0.0,
          'minDue': 0.0,
        },
        'spendThisCycle': 0.0,
      }, SetOptions(merge: true));
      return true;
    }

    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) {
        final pad = MediaQuery.of(sheetContext).viewInsets.bottom;
        bool autopay = false;
        return StatefulBuilder(
          builder: (context, setState) {
            return Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + pad),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      height: 4,
                      width: 42,
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: Colors.grey[300],
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                    Row(
                      children: const [
                        Icon(Icons.credit_card_rounded, color: Colors.teal),
                        SizedBox(width: 8),
                        Text(
                          'Add Card',
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: issuer,
                      decoration: const InputDecoration(
                        labelText: 'Issuer / Bank',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: last4,
                      maxLength: 4,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Last 4 digits',
                        counterText: '',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: billingDay,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Billing day (1–31)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: statementDay,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Statement close day (optional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: limitCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Credit limit (optional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Autopay on due date'),
                      value: autopay,
                      onChanged: (v) => setState(() => autopay = v),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        TextButton(
                          onPressed: () => Navigator.pop(sheetContext, null),
                          child: const Text('Cancel'),
                        ),
                        const Spacer(),
                        FilledButton.icon(
                          onPressed: () async {
                            final ok = await save(autopay);
                            if (ok && sheetContext.mounted) {
                              Navigator.pop(sheetContext, true);
                            }
                          },
                          icon: const Icon(Icons.save_rounded),
                          label: const Text('Save'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  DateTime _nextDueDate(int day) {
    final now = DateTime.now();
    final lastThisMonth = DateTime(now.year, now.month + 1, 0).day;
    final safeDay = day.clamp(1, lastThisMonth);
    final candidate = DateTime(now.year, now.month, safeDay);

    final today = DateTime(now.year, now.month, now.day);
    if (!candidate.isBefore(today)) {
      return candidate;
    }
    final lastNextMonth = DateTime(now.year, now.month + 2, 0).day;
    final safeNext = day.clamp(1, lastNextMonth);
    return DateTime(now.year, now.month + 1, safeNext);
  }

  // ---------------------------------------------------------------------------
  // Notification helpers (existing)
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
  // Business helpers (existing)
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
  // Internals (existing)
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
