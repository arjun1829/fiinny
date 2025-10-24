// lib/details/recurring/friend_recurring_screen.dart
import 'package:flutter/material.dart';

import '../services/recurring_service.dart';
import '../models/shared_item.dart';
import '../models/recurring_rule.dart';
import '../models/recurring_scope.dart';

import 'add_choice_sheet.dart';
import 'add_recurring_basic_screen.dart';
import 'add_subscription_screen.dart';
import 'add_emi_link_sheet.dart';
import 'add_custom_reminder_sheet.dart';

// Optional (loan auto-link)
import '../../services/loan_service.dart';
import '../../models/loan_model.dart';
import '../../core/notifications/local_notifications.dart';

// NEW: push helper for deep-linked nudges
import '../../services/push/push_service.dart';

// ----------------- Top-level helpers & DTOs -----------------
class _Metrics {
  final int active, paused, closed, overdue;
  final DateTime? nextDue;
  final double monthTotal;
  const _Metrics({
    required this.active,
    required this.paused,
    required this.closed,
    required this.overdue,
    required this.nextDue,
    required this.monthTotal,
  });
}

class _SmallCardData {
  final String keyName;
  final IconData icon;
  final String label;
  const _SmallCardData(this.keyName, this.icon, this.label);
}

class FriendRecurringScreen extends StatefulWidget {
  final String userPhone;
  final String friendId;
  final String? friendName;

  const FriendRecurringScreen({
    Key? key,
    required this.userPhone,
    required this.friendId,
    this.friendName,
  }) : super(key: key);

  @override
  State<FriendRecurringScreen> createState() => _FriendRecurringScreenState();
}

class _FriendRecurringScreenState extends State<FriendRecurringScreen> {
  final _svc = RecurringService();

  ReminderLocalScheduler? _reminderBind;

  String _fmtDate(DateTime? d) => d == null
      ? '—'
      : '${d.day.toString().padLeft(2, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.year}';

  @override
  void initState() {
    super.initState();
    _reminderBind = ReminderLocalScheduler(
      userPhone: widget.userPhone,
      friendId: widget.friendId,
    )..bind();
  }

  @override
  void dispose() {
    _reminderBind?.unbind();
    super.dispose();
  }

  // ---------- Add hub (single entry) ----------
  Future<void> _openQuickAdd() async {
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => AddChoiceSheet(
        onPick: (key) async {
          Navigator.pop(context);
          await _routeFromChoice(key);
        },
      ),
    );
  }

  Future<void> _routeFromChoice(String key) async {
    dynamic res;
    switch (key) {
      case 'recurring':
        res = await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AddRecurringBasicScreen(
              userPhone: widget.userPhone,
              scope: RecurringScope.friend(widget.userPhone, widget.friendId),
            ),
          ),
        );
        break;
      case 'subscription':
        res = await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AddSubscriptionScreen(
              userPhone: widget.userPhone,
              scope: RecurringScope.friend(widget.userPhone, widget.friendId),
            ),
          ),
        );
        break;
      case 'emi':
        res = await showModalBottomSheet(
          context: context,
          useSafeArea: true,
          isScrollControlled: true,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          builder: (_) => AddEmiLinkSheet(
            scope: RecurringScope.friend(widget.userPhone, widget.friendId),
            currentUserId: widget.userPhone,
          ),
        );
        break;
      case 'custom':
        res = await showModalBottomSheet(
          context: context,
          useSafeArea: true,
          isScrollControlled: true,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          builder: (_) => AddCustomReminderSheet(
            userPhone: widget.userPhone,
            scope: RecurringScope.friend(widget.userPhone, widget.friendId),
          ),
        );
        break;
    }
    await _handleAddResult(res);
  }

  Future<void> _handleAddResult(dynamic res) async {
    if (res == null) return;

    bool changed = false;

    if (res is String) {
      try {
        final LoanModel? loan = await LoanService().getById(res);
        if (loan != null) {
          await _svc.attachLoanToFriend(
            userPhone: widget.userPhone,
            friendId: widget.friendId,
            loan: loan,
          );
          changed = true;
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Couldn't link loan: $e")),
          );
        }
      }
    } else if (res is SharedItem || res == true) {
      changed = true;
    }

    if (!mounted) return;
    if (changed) {
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saved!')),
      );
    }
  }

  // ---------- Per-item quick actions ----------
  Future<void> _markPaid(SharedItem it) async {
    try {
      await _svc.markPaid(
        widget.userPhone,
        widget.friendId,
        it.id,
        amount: it.rule.amount,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to mark paid: $e')),
        );
      }
    }
  }

  Future<void> _togglePause(SharedItem it) async {
    try {
      if (it.rule.status == 'paused') {
        await _svc.resume(widget.userPhone, widget.friendId, it.id);
      } else if (it.rule.status == 'active') {
        await _svc.pause(widget.userPhone, widget.friendId, it.id);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update status: $e')),
        );
      }
    }
  }

  Future<void> _end(SharedItem it) async {
    try {
      await _svc.end(widget.userPhone, widget.friendId, it.id);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to close: $e')),
        );
      }
    }
  }

  Future<void> _addReminderQuick() async {
    final res = await showModalBottomSheet(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => AddCustomReminderSheet(
        userPhone: widget.userPhone,
        friendId: widget.friendId,
      ),
    );
    await _handleAddResult(res);
  }

  Future<void> _debugLocalTest() async {
    try {
      await LocalNotifs.init();
      final fireAt = DateTime.now().add(const Duration(seconds: 5));
      await LocalNotifs.scheduleOnce(
        itemId: 'debug_${DateTime.now().millisecondsSinceEpoch}',
        title: 'Test notification',
        body: 'If you can see this, local notifications work.',
        fireAt: fireAt,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Test notification in ~5s')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to schedule test: $e')),
      );
    }
  }

  Future<void> _scheduleNextLocal(SharedItem it) async {
    try {
      await LocalNotifs.init();

      final now = DateTime.now();
      final next =
          it.nextDueAt ?? _svc.computeNextDue(it.rule, from: now); // your API

      const int daysBefore = 0;
      const int hour = 9;
      const int minute = 0;

      final fireAt = DateTime(
        next.year,
        next.month,
        next.day,
        hour,
        minute,
      ).subtract(const Duration(days: daysBefore));

      final title = _buildNotifTitle(it);
      final body = _buildNotifBody(it, next);
      await LocalNotifs.scheduleOnce(
        itemId: it.id,
        title: title,
        body: body,
        fireAt: fireAt.isAfter(now) ? fireAt : now.add(const Duration(minutes: 1)),
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Reminder scheduled for ${_fmtDate(fireAt)}')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to schedule: $e')),
      );
    }
  }

  Future<void> _sendNudgeNow(SharedItem it) async {
    try {
      await PushService.nudgeFriendRecurringLocal(
        friendId: widget.friendId,
        itemTitle: it.title?.trim().isEmpty == true
            ? 'Reminder'
            : (it.title ?? 'Reminder'),
        dueOn: it.nextDueAt,
        frequency: it.rule.frequency,
        amount: (it.rule.amount != null && it.rule.amount! > 0)
            ? '₹${it.rule.amount!.toStringAsFixed(0)}'
            : null,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to nudge: $e')),
      );
    }
  }

  String _buildNotifTitle(SharedItem it) {
    switch (it.type) {
      case 'subscription':
        return 'Subscription due: ${it.title ?? 'Subscription'}';
      case 'emi':
        return 'EMI due: ${it.title ?? 'Loan'}';
      case 'reminder':
        return 'Reminder: ${it.title ?? 'Reminder'}';
      default:
        return 'Reminder: ${it.title ?? 'Recurring'}';
    }
  }

  String _buildNotifBody(SharedItem it, DateTime due) {
    final when = _fmtDate(due);
    final freq =
    (it.rule.frequency.isNotEmpty) ? ' • ${it.rule.frequency}' : '';
    final amt = (it.rule.amount != null && it.rule.amount! > 0)
        ? ' • ₹${it.rule.amount!.toStringAsFixed(0)}'
        : '';
    final name = it.title ?? 'Item';
    return '$name is due on $when$freq$amt';
  }

  // ----------------- Metrics & helpers -----------------
  _Metrics _calcMetrics(List<SharedItem> items) {
    int active = 0, paused = 0, closed = 0, overdue = 0;
    DateTime? nextDue;
    double monthTotal = 0;
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, 1);

    for (final it in items) {
      switch (it.rule.status) {
        case 'paused':
          paused++;
          break;
        case 'ended':
          closed++;
          break;
        default:
          active++;
          break;
      }
      final due = it.nextDueAt;
      if (due != null) {
        if (nextDue == null || due.isBefore(nextDue)) nextDue = due;
        if (due.year == start.year && due.month == start.month) {
          final amt = it.rule.amount ?? 0;
          if (amt > 0) monthTotal += amt;
        }
        final today = DateTime(now.year, now.month, now.day);
        if (due.isBefore(today)) overdue++;
      }
    }
    return _Metrics(
      active: active,
      paused: paused,
      closed: closed,
      overdue: overdue,
      nextDue: nextDue,
      monthTotal: monthTotal,
    );
  }

  DateTime? _minDue(Iterable<SharedItem> it) {
    DateTime? d;
    for (final x in it) {
      if (x.nextDueAt == null) continue;
      if (d == null || x.nextDueAt!.isBefore(d)) d = x.nextDueAt!;
    }
    return d;
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    final title = (widget.friendName == null || widget.friendName!.isEmpty)
        ? 'Subscriptions & Bills'
        : '${widget.friendName} • Bills';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(title),
        actions: [
          IconButton(
            tooltip: 'Test notification',
            icon: const Icon(Icons.notification_important_outlined),
            onPressed: _debugLocalTest,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openQuickAdd,
        icon: const Icon(Icons.add),
        label: const Text('Add'),
        heroTag: 'friend-recurring-fab',
      ),
      body: StreamBuilder<List<SharedItem>>(
        stream: _svc.streamByFriend(widget.userPhone, widget.friendId),
        builder: (context, snap) {
          final isLoading = snap.connectionState == ConnectionState.waiting &&
              (snap.data == null || snap.data!.isEmpty);
          final items = snap.data ?? const <SharedItem>[];
          final m = _calcMetrics(items);

          return RefreshIndicator(
            onRefresh: () async => setState(() {}),
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Overview card
                  _cardSurface(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            const Icon(Icons.receipt_long, size: 22),
                            const SizedBox(width: 8),
                            const Text(
                              'Overview',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const Spacer(),
                            _pillBadge(
                              'Overdue: ${m.overdue}',
                              m.overdue > 0 ? Colors.red : Colors.green,
                            ),
                          ]),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _chip('Active', '${m.active}'),
                              _chip('Paused', '${m.paused}'),
                              _chip('Closed', '${m.closed}'),
                              _chip(
                                'This month',
                                m.monthTotal > 0
                                    ? '₹${m.monthTotal.toStringAsFixed(0)}'
                                    : '--',
                              ),
                              _chip(
                                'Next due',
                                m.nextDue == null
                                    ? '--'
                                    : '${m.nextDue!.day}-${m.nextDue!.month}-${m.nextDue!.year}',
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          _bar(
                            context: context,
                            label: 'Month progress',
                            value: _monthProgress(),
                            meta: _monthMeta(),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Four small cards
                  _FourCards(
                    items: const [
                      _SmallCardData('recurring', Icons.repeat_rounded, 'Recurring'),
                      _SmallCardData('subscription', Icons.subscriptions_rounded, 'Subscriptions'),
                      _SmallCardData('emi', Icons.account_balance_rounded, 'EMIs / Loans'),
                      _SmallCardData('reminder', Icons.alarm_rounded, 'Reminders'),
                    ],
                    counts: {
                      'recurring': items
                          .where((e) => e.type == 'recurring' && e.rule.status != 'ended')
                          .length,
                      'subscription': items
                          .where((e) => e.type == 'subscription' && e.rule.status != 'ended')
                          .length,
                      'emi': items
                          .where((e) => e.type == 'emi' && e.rule.status != 'ended')
                          .length,
                      'reminder': items
                          .where((e) => e.type == 'reminder' && e.rule.status != 'ended')
                          .length,
                    },
                    nextDue: {
                      'recurring': _minDue(items.where((e) => e.type == 'recurring')),
                      'subscription': _minDue(items.where((e) => e.type == 'subscription')),
                      'emi': _minDue(items.where((e) => e.type == 'emi')),
                      'reminder': _minDue(items.where((e) => e.type == 'reminder')),
                    },
                    onTap: (k) => _openTypeSheet(k),
                    onAdd: (k) async {
                      switch (k) {
                        case 'recurring':
                          await _routeFromChoice('recurring');
                          break;
                        case 'subscription':
                          await _routeFromChoice('subscription');
                          break;
                        case 'emi':
                          await _routeFromChoice('emi');
                          break;
                        case 'reminder':
                          await _routeFromChoice('custom');
                          break;
                      }
                      if (mounted) setState(() {});
                    },
                  ),

                  if (isLoading) ...[
                    const SizedBox(height: 16),
                    _cardSurface(
                      child: const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Center(
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ---------- bottom sheet for a type ----------
  Future<void> _openTypeSheet(String type) async {
    String title;
    switch (type) {
      case 'subscription':
        title = 'Subscriptions';
        break;
      case 'emi':
        title = 'EMIs / Loans';
        break;
      case 'reminder':
        title = 'Reminders';
        break;
      default:
        title = 'Recurring';
    }

    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _TypeListSheet(
        title: title,
        type: type,
        userPhone: widget.userPhone,
        friendId: widget.friendId,
        svc: _svc,
        fmtDate: _fmtDate,
        onMarkPaid: _markPaid,
        onTogglePause: _togglePause,
        onEnd: _end,
        onAddReminder: _addReminderQuick,
        onScheduleNext: _scheduleNextLocal,
        onNudgeNow: _sendNudgeNow,
        onEditTitle: _editItem,
        onDelete: _deleteItem,
        onCloseAllActiveOfType: _closeAllActiveOfType,
      ),
    );
    if (mounted) setState(() {}); // reflect any changes after closing
  }

  // ---------- Edit / Delete ----------
  Future<void> _editItem(SharedItem it) async {
    final controller = TextEditingController(text: it.title ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
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
      ),
    );

    if (ok == true) {
      try {
        await _svc.updateTitle(
          widget.userPhone,
          widget.friendId,
          it.id,
          controller.text.trim(),
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Updated')),
          );
          setState(() {});
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed: $e')),
          );
        }
      }
    }
  }
  // ---------- Bulk helpers (restore) ----------
  Future<void> _closeAllActiveOfType(String type) async {
    try {
      final snap = await _svc.streamByFriend(widget.userPhone, widget.friendId).first;
      final toEnd = snap.where((x) =>
      x.type == type &&
          (x.rule.status == 'active' || x.rule.status == 'paused'));

      await Future.wait(
        toEnd.map((item) => _svc.end(widget.userPhone, widget.friendId, item.id)),
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Closed ${toEnd.length} $type item(s).')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to close items: $e')),
        );
      }
    }
  }


  Future<void> _deleteItem(SharedItem it) async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete item?'),
        content: const Text(
          'This will permanently remove it for both participants.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (sure == true) {
      try {
        await _svc.delete(widget.userPhone, widget.friendId, it.id);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Deleted')),
          );
          setState(() {});
        }
      } catch (_) {
        try {
          await _svc.end(widget.userPhone, widget.friendId, it.id);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Closed')),
            );
            setState(() {});
          }
        } catch (e2) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Failed: $e2')),
            );
          }
        }
      }
    }
  }

  Future<void> _confirm(Future<void> Function() action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Are you sure?'),
        content: const Text('This will affect all matching active items.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Yes'),
          ),
        ],
      ),
    );
    if (ok == true) {
      await action();
      if (mounted) setState(() {});
    }
  }

  // ---------------- small helpers ----------------
  Widget _cardSurface({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 14,
            offset: const Offset(0, 8),
          )
        ],
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
        child: child,
      ),
    );
  }

  Widget _pillBadge(String text, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: color.withOpacity(.12),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      text,
      style: TextStyle(
        fontSize: 12,
        color: color,
        fontWeight: FontWeight.w700,
      ),
    ),
  );

  Widget _chip(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 3),
          )
        ],
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text('$label: ',
            style: TextStyle(
                fontSize: 12,
                color: Colors.grey[800],
                fontWeight: FontWeight.w700)),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          child: Text(
            value,
            key: ValueKey(value),
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900),
          ),
        ),
      ]),
    );
  }

  double _monthProgress() {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, 1);
    final end = DateTime(now.year, now.month + 1, 1);
    final total = end.difference(start).inSeconds.toDouble();
    final done = now.difference(start).inSeconds.toDouble().clamp(0, total);
    return total == 0 ? 0 : (done / total);
  }

  String _monthMeta() {
    final now = DateTime.now();
    final end =
    DateTime(now.year, now.month + 1, 1).subtract(const Duration(days: 1));
    return '${now.day}/${end.day} days';
  }

  Widget _bar({
    required BuildContext context,
    required String label,
    required double value,
    String? meta,
  }) {
    final color = Theme.of(context).colorScheme.primary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
          if (meta != null) ...[
            const SizedBox(width: 6),
            Text(meta,
                style: TextStyle(
                    color: Colors.grey[700], fontWeight: FontWeight.w600)),
          ],
        ]),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: value.clamp(0, 1)),
            duration: const Duration(milliseconds: 400),
            curve: Curves.easeOutCubic,
            builder: (_, v, __) => LinearProgressIndicator(
              minHeight: 8,
              value: v,
              backgroundColor: Colors.grey[200],
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ),
      ],
    );
  }
}

// ================= Four small cards (tap ➜ bottom sheet) =================
class _FourCards extends StatelessWidget {
  final List<_SmallCardData> items;
  final Map<String, int> counts;
  final Map<String, DateTime?> nextDue;
  final void Function(String key) onTap;
  final void Function(String key) onAdd;

  const _FourCards({
    Key? key,
    required this.items,
    required this.counts,
    required this.nextDue,
    required this.onTap,
    required this.onAdd,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: items.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.6,
      ),
      itemBuilder: (_, i) {
        final data = items[i];
        final count = counts[data.keyName] ?? 0;
        final due = nextDue[data.keyName];
        final dueTxt = due == null ? '--' : '${due.day}/${due.month}';

        return TweenAnimationBuilder<double>(
          tween: Tween(begin: .96, end: 1),
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
          builder: (_, s, child) => Transform.scale(scale: s, child: child),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => onTap(data.keyName),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.grey.shade200),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(.06),
                    blurRadius: 10,
                    offset: const Offset(0, 6),
                  )
                ],
              ),
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Icon(data.icon, size: 20),
                    const Spacer(),
                    IconButton(
                      tooltip: 'Add',
                      onPressed: () => onAdd(data.keyName),
                      icon: const Icon(Icons.add_circle_outline),
                      visualDensity: VisualDensity.compact,
                    ),
                  ]),
                  const Spacer(),
                  Text(
                    data.label,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 6),
                  Row(children: [
                    _miniPill('$count active'),
                    const SizedBox(width: 6),
                    _miniPill('next: $dueTxt'),
                  ]),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _miniPill(String t) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: Colors.grey.shade200),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(0.04),
          blurRadius: 6,
          offset: const Offset(0, 3),
        )
      ],
    ),
    child: Text(t,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
  );
}

// ================= Bottom sheet list for a type =================
class _TypeListSheet extends StatefulWidget {
  final String title;
  final String type; // 'recurring' | 'subscription' | 'emi' | 'reminder'
  final String userPhone;
  final String friendId;
  final RecurringService svc;
  final String Function(DateTime?) fmtDate;

  // callbacks from parent (so we reuse logic)
  final Future<void> Function(SharedItem) onMarkPaid;
  final Future<void> Function(SharedItem) onTogglePause;
  final Future<void> Function(SharedItem) onEnd;
  final Future<void> Function() onAddReminder;
  final Future<void> Function(SharedItem) onScheduleNext;
  final Future<void> Function(SharedItem) onNudgeNow;
  final Future<void> Function(SharedItem) onEditTitle;
  final Future<void> Function(SharedItem) onDelete;
  final Future<void> Function(String) onCloseAllActiveOfType;

  const _TypeListSheet({
    Key? key,
    required this.title,
    required this.type,
    required this.userPhone,
    required this.friendId,
    required this.svc,
    required this.fmtDate,
    required this.onMarkPaid,
    required this.onTogglePause,
    required this.onEnd,
    required this.onAddReminder,
    required this.onScheduleNext,
    required this.onNudgeNow,
    required this.onEditTitle,
    required this.onDelete,
    required this.onCloseAllActiveOfType,
  }) : super(key: key);

  @override
  State<_TypeListSheet> createState() => _TypeListSheetState();
}

class _TypeListSheetState extends State<_TypeListSheet> {
  bool _includeClosed = false;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final maxH = media.size.height * .88;

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.88,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (_, controller) => ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxH),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // handle
            const SizedBox(height: 8),
            Container(
              width: 46,
              height: 5,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const SizedBox(height: 12),

            // header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Text(widget.title,
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w900)),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Add',
                    onPressed: () async {
                      // Route to correct add flow
                      switch (widget.type) {
                        case 'recurring':
                          await Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => AddRecurringBasicScreen(
                                userPhone: widget.userPhone,
                                scope: RecurringScope.friend(
                                  widget.userPhone,
                                  widget.friendId,
                                ),
                              ),
                            ),
                          );
                          break;
                        case 'subscription':
                          await Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => AddSubscriptionScreen(
                                userPhone: widget.userPhone,
                                scope: RecurringScope.friend(
                                  widget.userPhone,
                                  widget.friendId,
                                ),
                              ),
                            ),
                          );
                          break;
                        case 'emi':
                          await showModalBottomSheet(
                            context: context,
                            useSafeArea: true,
                            isScrollControlled: true,
                            shape: const RoundedRectangleBorder(
                              borderRadius:
                              BorderRadius.vertical(top: Radius.circular(16)),
                            ),
                            builder: (_) => AddEmiLinkSheet(
                              scope: RecurringScope.friend(
                                widget.userPhone,
                                widget.friendId,
                              ),
                              currentUserId: widget.userPhone,
                            ),
                          );
                          break;
                        case 'reminder':
                          await widget.onAddReminder();
                          break;
                      }
                      if (mounted) setState(() {});
                    },
                    icon: const Icon(Icons.add_circle_outline),
                  ),
                  PopupMenuButton<String>(
                    tooltip: 'More',
                    onSelected: (v) async {
                      switch (v) {
                        case 'toggle_closed':
                          setState(() => _includeClosed = !_includeClosed);
                          break;
                        case 'close_all':
                          await _confirm(context, () async {
                            await widget.onCloseAllActiveOfType(widget.type);
                          });
                          if (mounted) setState(() {});
                          break;
                      }
                    },
                    itemBuilder: (ctx) => [
                      PopupMenuItem(
                        value: 'toggle_closed',
                        child: ListTile(
                          leading: Icon(
                            _includeClosed
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                          ),
                          title: Text(_includeClosed ? 'Hide closed' : 'Show closed'),
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                      ),
                      const PopupMenuDivider(),
                      const PopupMenuItem(
                        value: 'close_all',
                        child: ListTile(
                          leading: Icon(Icons.cancel_schedule_send_outlined),
                          title: Text('Close all active'),
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            const Divider(height: 1),

            // list
            Expanded(
              child: StreamBuilder<List<SharedItem>>(
                stream:
                widget.svc.streamByFriend(widget.userPhone, widget.friendId),
                builder: (context, snap) {
                  final items = (snap.data ?? const <SharedItem>[])
                      .where((e) => e.type == widget.type)
                      .toList();

                  final active = items.where((e) => e.rule.status != 'ended').toList()
                    ..sort((a, b) {
                      final da = a.nextDueAt ??
                          DateTime.fromMillisecondsSinceEpoch(0);
                      final db = b.nextDueAt ??
                          DateTime.fromMillisecondsSinceEpoch(0);
                      return da.compareTo(db);
                    });

                  final closed = items.where((e) => e.rule.status == 'ended').toList()
                    ..sort((a, b) {
                      final da = a.nextDueAt ??
                          DateTime.fromMillisecondsSinceEpoch(0);
                      final db = b.nextDueAt ??
                          DateTime.fromMillisecondsSinceEpoch(0);
                      return da.compareTo(db);
                    });

                  final show = _includeClosed ? [...active, ...closed] : active;

                  if (snap.connectionState == ConnectionState.waiting &&
                      items.isEmpty) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24.0),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    );
                  }

                  if (show.isEmpty) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24.0),
                        child: Text(
                          'No ${widget.title.toLowerCase()} yet.',
                          style: TextStyle(color: Colors.grey.shade700),
                        ),
                      ),
                    );
                  }

                  return ListView.builder(
                    controller: controller,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    itemCount: show.length,
                    itemBuilder: (_, i) => _ItemTile(
                      item: show[i],
                      fmtDate: widget.fmtDate,
                      onMarkPaid: widget.onMarkPaid,
                      onTogglePause: widget.onTogglePause,
                      onEnd: widget.onEnd,
                      onAddReminder: widget.onAddReminder,
                      onScheduleNext: widget.onScheduleNext,
                      onNudgeNow: widget.onNudgeNow,
                      onEditTitle: widget.onEditTitle,
                      onDelete: widget.onDelete,
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirm(BuildContext context, Future<void> Function() action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Are you sure?'),
        content: const Text('This will affect all matching active items.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Yes')),
        ],
      ),
    );
    if (ok == true) await action();
  }
}

class _ItemTile extends StatelessWidget {
  final SharedItem item;
  final String Function(DateTime?) fmtDate;

  final Future<void> Function(SharedItem) onMarkPaid;
  final Future<void> Function(SharedItem) onTogglePause;
  final Future<void> Function(SharedItem) onEnd;
  final Future<void> Function() onAddReminder;
  final Future<void> Function(SharedItem) onScheduleNext;
  final Future<void> Function(SharedItem) onNudgeNow;
  final Future<void> Function(SharedItem) onEditTitle;
  final Future<void> Function(SharedItem) onDelete;

  const _ItemTile({
    Key? key,
    required this.item,
    required this.fmtDate,
    required this.onMarkPaid,
    required this.onTogglePause,
    required this.onEnd,
    required this.onAddReminder,
    required this.onScheduleNext,
    required this.onNudgeNow,
    required this.onEditTitle,
    required this.onDelete,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final isPaused = item.rule.status == 'paused';
    final isEnded = item.rule.status == 'ended';
    final DateTime? due = item.nextDueAt;
    final String dueStr = fmtDate(due);
    final bool isReminder = item.type == 'reminder';

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: .96, end: 1),
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOutCubic,
      builder: (_, s, child) => Transform.scale(scale: s, child: child),
      child: Card(
        margin: const EdgeInsets.symmetric(vertical: 6),
        elevation: 0,
        color: isEnded
            ? Colors.grey.shade100
            : (isPaused ? Colors.amber.withOpacity(.06) : Colors.white),
        shape: RoundedRectangleBorder(
          side: BorderSide(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(12),
        ),
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          title: Text(
            item.title ?? 'Untitled',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: isEnded ? Colors.grey : null,
            ),
          ),
          subtitle: Text(
            'Next: $dueStr  •  ${item.rule.frequency}'
                '${item.type == "subscription" ? " (billing)" : ""}',
            maxLines: 2,
            style: TextStyle(
              color: isEnded ? Colors.grey : Colors.grey.shade700,
            ),
          ),
          trailing: PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (v) async {
              switch (v) {
                case 'paid':
                  await onMarkPaid(item);
                  break;
                case 'pause':
                  await onTogglePause(item);
                  break;
                case 'end':
                  await onEnd(item);
                  break;
                case 'reminder':
                  await onAddReminder();
                  break;
                case 'edit':
                  await onEditTitle(item);
                  break;
                case 'delete':
                  await onDelete(item);
                  break;
                case 'schedule_next':
                  await onScheduleNext(item);
                  break;
                case 'nudge_now':
                  await onNudgeNow(item);
                  break;
              }
            },
            itemBuilder: (ctx) => [
              if (!isEnded && !isReminder)
                PopupMenuItem(
                  value: 'paid',
                  child: ListTile(
                    leading: const Icon(Icons.check_circle_outline),
                    title: const Text('Mark paid'),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              if (!isEnded)
                PopupMenuItem(
                  value: 'pause',
                  child: ListTile(
                    leading: Icon(
                      item.rule.status == 'paused'
                          ? Icons.play_arrow_rounded
                          : Icons.pause_circle_outline,
                    ),
                    title: Text(item.rule.status == 'paused' ? 'Resume' : 'Pause'),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              if (!isEnded)
                const PopupMenuItem(
                  value: 'end',
                  child: ListTile(
                    leading: Icon(Icons.cancel_outlined),
                    title: Text('End (close)'),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'edit',
                child: ListTile(
                  leading: Icon(Icons.edit_outlined),
                  title: Text('Edit'),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'delete',
                child: ListTile(
                  leading: Icon(Icons.delete_outline),
                  title: Text('Delete'),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuDivider(),
              if (!isReminder)
                const PopupMenuItem(
                  value: 'reminder',
                  child: ListTile(
                    leading: Icon(Icons.alarm_add_outlined),
                    title: Text('Add reminder'),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              if (!isEnded)
                const PopupMenuItem(
                  value: 'schedule_next',
                  child: ListTile(
                    leading: Icon(Icons.schedule),
                    title: Text('Schedule next reminder (device)'),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              if (!isEnded)
                const PopupMenuItem(
                  value: 'nudge_now',
                  child: ListTile(
                    leading: Icon(Icons.notifications_active_outlined),
                    title: Text('Send nudge now'),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
