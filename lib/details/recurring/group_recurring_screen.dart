import 'package:flutter/material.dart';
import 'package:lifemap/core/notifications/local_notifications.dart';
import 'package:lifemap/details/models/recurring_scope.dart';
import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/details/recurring/add_choice_sheet.dart';
import 'package:lifemap/details/recurring/add_custom_reminder_sheet.dart';
import 'package:lifemap/details/recurring/add_emi_link_sheet.dart';
import 'package:lifemap/details/recurring/add_recurring_basic_screen.dart';
import 'package:lifemap/details/recurring/add_subscription_screen.dart';
import 'package:lifemap/details/services/recurring_service.dart';
import 'package:lifemap/services/group_service.dart';

class GroupRecurringScreen extends StatefulWidget {
  final String groupId;
  final String? groupName;
  final String currentUserPhone;

  const GroupRecurringScreen({
    super.key,
    required this.groupId,
    required this.currentUserPhone,
    this.groupName,
  });

  @override
  State<GroupRecurringScreen> createState() => _GroupRecurringScreenState();
}

class _GroupRecurringScreenState extends State<GroupRecurringScreen> {
  final _svc = RecurringService();
  late final RecurringScope _scope;
  final GroupService _groupService = GroupService();
  List<String> _memberPhones = <String>[];

  @override
  void initState() {
    super.initState();
    _scope = RecurringScope.group(widget.groupId);
    _loadMembers();
  }

  Future<void> _loadMembers() async {
    try {
      final group = await _groupService.getGroupById(widget.groupId);
      final members = <String>{};
      final fetched = group?.memberPhones ?? const <String>[];
      for (final phone in fetched) {
        final trimmed = phone.trim();
        if (trimmed.isNotEmpty) members.add(trimmed);
      }

      final self = widget.currentUserPhone.trim();
      if (self.isNotEmpty) members.add(self);
      if (!mounted) return;
      setState(() => _memberPhones = members.toList());
    } catch (_) {
      if (!mounted) return;
      final fallback = widget.currentUserPhone.trim();
      setState(() => _memberPhones = fallback.isEmpty ? const [] : [fallback]);
    }
  }

  List<String> get _loanParticipants {
    final set = <String>{};
    for (final phone in [..._memberPhones, widget.currentUserPhone]) {
      final trimmed = phone.trim();
      if (trimmed.isNotEmpty) set.add(trimmed);
    }
    return set.toList();
  }

  // ---------- Helpers ----------
  String _fmtDate(DateTime? d) => d == null
      ? '—'
      : '${d.day.toString().padLeft(2, '0')}-${d.month.toString().padLeft(2, '0')}-${d.year}';

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

  DateTime? _minDue(Iterable<SharedItem> it) {
    DateTime? d;
    for (final x in it) {
      final nd = x.nextDueAt;
      if (nd == null) continue;
      if (d == null || nd.isBefore(d)) d = nd;
    }
    return d;
  }

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
      case 'emi':
        final participants = _loanParticipants;
        if (participants.isEmpty) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                  content: Text('Add group members before linking a loan.')),
            );
          }
          return;
        }
        res = await showModalBottomSheet(
          context: context,
          useSafeArea: true,
          isScrollControlled: true,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          builder: (_) => AddEmiLinkSheet(
            scope: _scope,
            currentUserId: widget.currentUserPhone,
            participantUserIds: participants,
          ),
        );
        break;
      case 'custom':
      case 'reminder':
        res = await showModalBottomSheet(
          context: context,
          useSafeArea: true,
          isScrollControlled: true,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          builder: (_) => AddCustomReminderSheet(
            userPhone: widget.currentUserPhone,
            scope: _scope,
            participantUserIds: _memberPhones,
            mirrorToFriend: false,
          ),
        );
        break;
      case 'subscription':
      case 'recurring':
      default:
        if (key == 'subscription') {
          res = await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => AddSubscriptionScreen(
                userPhone: widget.currentUserPhone,
                scope: _scope,
                participantUserIds: _memberPhones,
                mirrorToFriend: false,
              ),
            ),
          );
        } else {
          res = await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => AddRecurringBasicScreen(
                userPhone: widget.currentUserPhone,
                scope: _scope,
                participantUserIds: _memberPhones,
                mirrorToFriend: false,
              ),
            ),
          );
        }
        break;
    }
    await _handleAddResult(res);
  }

  Future<void> _openAddType(String type) async {
    if (type == 'reminder') {
      await _routeFromChoice('reminder');
    } else {
      await _routeFromChoice(type);
    }
  }

  Future<void> _handleAddResult(dynamic res) async {
    if (res == null) return;
    if (!mounted) return;
    if (res == true || res is SharedItem) {
      setState(() {});
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Saved')));
    }
  }

  Future<void> _addReminderQuick() => _routeFromChoice('reminder');

  Future<void> _closeAllActiveOfType(String type) async {
    try {
      final items = await _svc.streamByScope(_scope).first;
      final toEnd = items.where((x) {
        final status = x.rule.status;
        return x.type == type && (status == 'active' || status == 'paused');
      }).toList();

      for (final item in toEnd) {
        await _svc.endScope(_scope, item.id);
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Closed ${toEnd.length} $type item(s).')),
      );
      setState(() {});
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to close items: $e')),
      );
    }
  }

  Future<void> _editTitle(SharedItem it) async {
    final controller = TextEditingController(text: it.title ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Edit item'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(labelText: 'Title'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save')),
        ],
      ),
    );

    if (ok == true) {
      try {
        await _svc.patchInGroup(
          groupId: widget.groupId,
          itemId: it.id,
          payload: {'title': controller.text.trim()},
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Updated')));
        setState(() {});
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    }
  }

  // ---------- Item actions (scope variants) ----------
  Future<void> _markPaid(SharedItem it) async {
    try {
      await _svc.markPaidScope(_scope, it.id, amount: it.rule.amount);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Failed to mark paid: $e')));
    }
  }

  Future<void> _togglePause(SharedItem it) async {
    try {
      if (it.rule.status == 'paused') {
        await _svc.resumeScope(_scope, it.id);
      } else if (it.rule.status == 'active') {
        await _svc.pauseScope(_scope, it.id);
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Failed to update status: $e')));
    }
  }

  Future<void> _end(SharedItem it) async {
    try {
      await _svc.endScope(_scope, it.id);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Failed to close: $e')));
    }
  }

  Future<void> _delete(SharedItem it) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete item?'),
        content: const Text('This will remove it for the whole group.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete')),
        ],
      ),
    );
    if (ok == true) {
      try {
        await _svc.deleteScope(_scope, it.id);
        if (!mounted) return;
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Deleted')));
        setState(() {});
      } catch (e) {
        try {
          await _svc.endScope(_scope, it.id);
          if (!mounted) return;
          ScaffoldMessenger.of(context)
              .showSnackBar(const SnackBar(content: Text('Closed')));
          setState(() {});
        } catch (e2) {
          if (!mounted) return;
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('Failed: $e2')));
        }
      }
    }
  }

  Future<void> _scheduleNextLocal(SharedItem it) async {
    try {
      await LocalNotifs.init();
      final now = DateTime.now();
      final next = it.nextDueAt ?? _svc.computeNextDue(it.rule, from: now);
      final fireAt = DateTime(next.year, next.month, next.day, 9, 0);
      await LocalNotifs.scheduleOnce(
        itemId: 'grp_${it.id}',
        title: _notifTitle(it),
        body: _notifBody(it, next),
        fireAt:
            fireAt.isAfter(now) ? fireAt : now.add(const Duration(minutes: 1)),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Reminder set for ${_fmtDate(fireAt)}')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Failed to schedule: $e')));
    }
  }

  String _notifTitle(SharedItem it) {
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

  String _notifBody(SharedItem it, DateTime due) {
    final when = _fmtDate(due);
    final f = (it.rule.frequency).isNotEmpty ? ' • ${it.rule.frequency}' : '';
    final amt =
        (it.rule.amount) > 0 ? ' • ₹${it.rule.amount.toStringAsFixed(0)}' : '';
    return '${it.title ?? 'Item'} is due on $when$f$amt';
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    final title = (widget.groupName == null || widget.groupName!.isEmpty)
        ? 'Group Recurring'
        : '${widget.groupName} • Bills';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(title),
        actions: [
          IconButton(
            tooltip: 'Test notification',
            icon: const Icon(Icons.notification_important_outlined),
            onPressed: () async {
              try {
                await LocalNotifs.init();
                await LocalNotifs.scheduleOnce(
                  itemId: 'grp_test_${DateTime.now().millisecondsSinceEpoch}',
                  title: 'Test reminder',
                  body: 'This is a local test reminder.',
                  fireAt: DateTime.now().add(const Duration(seconds: 5)),
                );
                if (!mounted) return;
                ScaffoldMessenger.of(context)
                    .showSnackBar(const SnackBar(content: Text('Test in ~5s')));
              } catch (e) {
                if (!mounted) return;
                ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text('Failed: $e')));
              }
            },
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('Add'),
        onPressed: _openQuickAdd,
      ),
      body: StreamBuilder<List<SharedItem>>(
        stream: _svc.streamByScope(_scope),
        builder: (context, snap) {
          final loading = snap.connectionState == ConnectionState.waiting &&
              (snap.data == null || snap.data!.isEmpty);
          final items = snap.data ?? const <SharedItem>[];

          // KPIs
          final int active =
              items.where((e) => e.rule.status == 'active').length;
          final int paused =
              items.where((e) => e.rule.status == 'paused').length;
          final int closed =
              items.where((e) => e.rule.status == 'ended').length;
          final DateTime? nextDue = _minDue(items);
          final double monthTotal = items.fold<double>(0, (s, it) {
            final due = it.nextDueAt;
            if (due == null) return s;
            final n = DateTime.now();
            if (due.year == n.year && due.month == n.month) {
              return s + (it.rule.amount).toDouble();
            }
            return s;
          });
          final overdue = items.where((it) {
            final d = it.nextDueAt;
            if (d == null) return false;
            final today = DateTime.now();
            final dd = DateTime(d.year, d.month, d.day);
            final td = DateTime(today.year, today.month, today.day);
            return dd.isBefore(td) && it.rule.status == 'active';
          }).length;

          // Buckets by type
          final subs = items.where((e) => e.type == 'subscription').toList();
          final emis = items.where((e) => e.type == 'emi').toList();
          final rec = items.where((e) => e.type == 'recurring').toList();
          final rem = items.where((e) => e.type == 'reminder').toList();

          return RefreshIndicator(
            onRefresh: () async => setState(() {}),
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ------- Overview -------
                  _cardSurface(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            const Icon(Icons.receipt_long, size: 22),
                            const SizedBox(width: 8),
                            const Text('Overview',
                                style: TextStyle(
                                    fontSize: 18, fontWeight: FontWeight.w900)),
                            const Spacer(),
                            _pillBadge('Overdue: $overdue',
                                overdue > 0 ? Colors.red : Colors.green),
                          ]),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _chip('Active', '$active'),
                              _chip('Paused', '$paused'),
                              _chip('Closed', '$closed'),
                              _chip(
                                  'This month',
                                  monthTotal > 0
                                      ? '₹${monthTotal.toStringAsFixed(0)}'
                                      : '--'),
                              _chip('Next due',
                                  nextDue == null ? '--' : _fmtDate(nextDue)),
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

                  // ------- Four small cards (by type) -------
                  _FourCards(
                    items: const [
                      _SmallCardData(
                          'recurring', Icons.repeat_rounded, 'Recurring'),
                      _SmallCardData('subscription',
                          Icons.subscriptions_rounded, 'Subscriptions'),
                      _SmallCardData(
                          'emi', Icons.account_balance_rounded, 'EMIs / Loans'),
                      _SmallCardData(
                          'reminder', Icons.alarm_rounded, 'Reminders'),
                    ],
                    counts: {
                      'recurring':
                          rec.where((e) => e.rule.status != 'ended').length,
                      'subscription':
                          subs.where((e) => e.rule.status != 'ended').length,
                      'emi': emis.where((e) => e.rule.status != 'ended').length,
                      'reminder':
                          rem.where((e) => e.rule.status != 'ended').length,
                    },
                    nextDue: {
                      'recurring': _minDue(rec),
                      'subscription': _minDue(subs),
                      'emi': _minDue(emis),
                      'reminder': _minDue(rem),
                    },
                    onTap: (type) => _openTypeSheet(type),
                    onAdd: (type) async => _openAddType(type),
                  ),

                  if (loading) ...[
                    const SizedBox(height: 16),
                    _cardSurface(
                      child: const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Center(
                            child: CircularProgressIndicator(strokeWidth: 2)),
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

  // ---------- Sheet per type ----------
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
      builder: (_) => _TypeListSheetGroup(
        title: title,
        type: type,
        scope: _scope,
        svc: _svc,
        fmtDate: _fmtDate,
        onMarkPaid: _markPaid,
        onTogglePause: _togglePause,
        onEnd: _end,
        onDelete: _delete,
        onScheduleNext: _scheduleNextLocal,
        onEditTitle: _editTitle,
        onAddReminder: _addReminderQuick,
        onAddType: _openAddType,
        onCloseAllActiveOfType: _closeAllActiveOfType,
      ),
    );
    if (mounted) setState(() {}); // reflect changes
  }

  // ---------- small UI helpers ----------
  Widget _cardSurface({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 14,
              offset: const Offset(0, 8))
        ],
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 12), child: child),
    );
  }

  Widget _pillBadge(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
            color: color.withValues(alpha: .12),
            borderRadius: BorderRadius.circular(999)),
        child: Text(text,
            style: TextStyle(
                fontSize: 12, color: color, fontWeight: FontWeight.w700)),
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
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 3))
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
          child: Text(value,
              key: ValueKey(value),
              style:
                  const TextStyle(fontSize: 12, fontWeight: FontWeight.w900)),
        ),
      ]),
    );
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

// ================= Four small cards =================
class _SmallCardData {
  final String keyName;
  final IconData icon;
  final String label;
  const _SmallCardData(this.keyName, this.icon, this.label);
}

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
                      color: Colors.black.withValues(alpha: .06),
                      blurRadius: 10,
                      offset: const Offset(0, 6))
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
                  Text(data.label,
                      style: const TextStyle(fontWeight: FontWeight.w900)),
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
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 6,
                offset: const Offset(0, 3))
          ],
        ),
        child: Text(t,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
      );
}

// ================= Bottom sheet list for a type (Group scope) =================
class _TypeListSheetGroup extends StatefulWidget {
  final String title;
  final String type; // 'recurring' | 'subscription' | 'emi' | 'reminder'
  final RecurringScope scope;
  final RecurringService svc;
  final String Function(DateTime?) fmtDate;

  final Future<void> Function(SharedItem) onMarkPaid;
  final Future<void> Function(SharedItem) onTogglePause;
  final Future<void> Function(SharedItem) onEnd;
  final Future<void> Function(SharedItem) onDelete;
  final Future<void> Function(SharedItem) onScheduleNext;
  final Future<void> Function(SharedItem) onEditTitle;
  final Future<void> Function() onAddReminder;
  final Future<void> Function(String) onAddType;
  final Future<void> Function(String) onCloseAllActiveOfType;

  const _TypeListSheetGroup({
    Key? key,
    required this.title,
    required this.type,
    required this.scope,
    required this.svc,
    required this.fmtDate,
    required this.onMarkPaid,
    required this.onTogglePause,
    required this.onEnd,
    required this.onDelete,
    required this.onScheduleNext,
    required this.onEditTitle,
    required this.onAddReminder,
    required this.onAddType,
    required this.onCloseAllActiveOfType,
  }) : super(key: key);

  @override
  State<_TypeListSheetGroup> createState() => _TypeListSheetGroupState();
}

class _TypeListSheetGroupState extends State<_TypeListSheetGroup> {
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
            const SizedBox(height: 8),
            Container(
                width: 46,
                height: 5,
                decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(999))),
            const SizedBox(height: 12),

            // Header
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
                      await widget.onAddType(widget.type);
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
                          await _confirm(() async {
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
                          leading: Icon(_includeClosed
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined),
                          title: Text(
                              _includeClosed ? 'Hide closed' : 'Show closed'),
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

            // List
            Expanded(
              child: StreamBuilder<List<SharedItem>>(
                stream: widget.svc.streamByScope(widget.scope),
                builder: (context, snap) {
                  final items = (snap.data ?? const <SharedItem>[])
                      .where((e) => e.type == widget.type)
                      .toList();

                  final active = items
                      .where((e) => e.rule.status != 'ended')
                      .toList()
                    ..sort((a, b) {
                      final da =
                          a.nextDueAt ?? DateTime.fromMillisecondsSinceEpoch(0);
                      final db =
                          b.nextDueAt ?? DateTime.fromMillisecondsSinceEpoch(0);
                      return da.compareTo(db);
                    });

                  final closed = items
                      .where((e) => e.rule.status == 'ended')
                      .toList()
                    ..sort((a, b) {
                      final da =
                          a.nextDueAt ?? DateTime.fromMillisecondsSinceEpoch(0);
                      final db =
                          b.nextDueAt ?? DateTime.fromMillisecondsSinceEpoch(0);
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
                        child: Text('No ${widget.title.toLowerCase()} yet.',
                            style: TextStyle(color: Colors.grey.shade700)),
                      ),
                    );
                  }

                  return ListView.builder(
                    controller: controller,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    itemCount: show.length,
                    itemBuilder: (_, i) => _ItemTileGroup(
                      item: show[i],
                      fmtDate: widget.fmtDate,
                      onMarkPaid: widget.onMarkPaid,
                      onTogglePause: widget.onTogglePause,
                      onEnd: widget.onEnd,
                      onDelete: widget.onDelete,
                      onScheduleNext: widget.onScheduleNext,
                      onAddReminder: widget.onAddReminder,
                      onEditTitle: widget.onEditTitle,
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

  Future<void> _confirm(Future<void> Function() action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Are you sure?'),
        content: const Text('This will affect all matching active items.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Yes')),
        ],
      ),
    );
    if (ok == true) await action();
  }
}

class _ItemTileGroup extends StatelessWidget {
  final SharedItem item;
  final String Function(DateTime?) fmtDate;
  final Future<void> Function(SharedItem) onMarkPaid;
  final Future<void> Function(SharedItem) onTogglePause;
  final Future<void> Function(SharedItem) onEnd;
  final Future<void> Function(SharedItem) onDelete;
  final Future<void> Function(SharedItem) onScheduleNext;
  final Future<void> Function() onAddReminder;
  final Future<void> Function(SharedItem) onEditTitle;

  const _ItemTileGroup({
    Key? key,
    required this.item,
    required this.fmtDate,
    required this.onMarkPaid,
    required this.onTogglePause,
    required this.onEnd,
    required this.onDelete,
    required this.onScheduleNext,
    required this.onAddReminder,
    required this.onEditTitle,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final isPaused = item.rule.status == 'paused';
    final isEnded = item.rule.status == 'ended';
    final DateTime? due = item.nextDueAt;
    final dueStr = fmtDate(due);
    final isReminder = item.type == 'reminder';
    final amt = (item.rule.amount).toDouble();

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
            : (isPaused ? Colors.amber.withValues(alpha: .06) : Colors.white),
        shape: RoundedRectangleBorder(
          side: BorderSide(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(12),
        ),
        child: ListTile(
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          title: Text(
            item.title ?? 'Untitled',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                fontWeight: FontWeight.w700,
                color: isEnded ? Colors.grey : null),
          ),
          subtitle: Text(
            '₹ ${_fmtAmt(amt)}  •  Next: $dueStr  •  ${(item.rule.frequency).isEmpty ? "monthly" : item.rule.frequency}'
            '${item.type == "subscription" ? " (billing)" : ""}',
            maxLines: 2,
            style:
                TextStyle(color: isEnded ? Colors.grey : Colors.grey.shade700),
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
                case 'delete':
                  await onDelete(item);
                  break;
                case 'schedule_next':
                  await onScheduleNext(item);
                  break;
                case 'reminder':
                  await onAddReminder();
                  break;
                case 'edit':
                  await onEditTitle(item);
                  break;
              }
            },
            itemBuilder: (ctx) => [
              if (!isEnded && !isReminder)
                _mi('paid', Icons.check_circle_outline, 'Mark paid'),
              if (!isEnded)
                _mi(
                    'pause',
                    isPaused
                        ? Icons.play_arrow_rounded
                        : Icons.pause_circle_outline,
                    isPaused ? 'Resume' : 'Pause'),
              if (!isEnded) _mi('end', Icons.cancel_outlined, 'End (close)'),
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
              const PopupMenuDivider(),
              if (!isEnded)
                _mi('schedule_next', Icons.schedule,
                    'Schedule next reminder (device)'),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'delete',
                child: ListTile(
                  leading: Icon(Icons.delete_outline, color: Colors.redAccent),
                  title:
                      Text('Delete', style: TextStyle(color: Colors.redAccent)),
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

  static PopupMenuItem<String> _mi(String v, IconData i, String t) =>
      PopupMenuItem(
        value: v,
        child: ListTile(
            leading: Icon(i),
            title: Text(t),
            dense: true,
            contentPadding: EdgeInsets.zero),
      );

  static String _fmtAmt(double v) {
    if (v >= 10000000) return '${(v / 10000000).toStringAsFixed(1)}Cr';
    if (v >= 100000) return '${(v / 100000).toStringAsFixed(1)}L';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}k';
    return v.toStringAsFixed(0);
  }
}
