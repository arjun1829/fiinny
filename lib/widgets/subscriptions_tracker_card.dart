import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../brain/cadence_detector.dart';

class SubscriptionsTrackerCard extends StatefulWidget {
  final String userPhone;
  final int daysWindow;
  final bool initiallyExpanded;
  const SubscriptionsTrackerCard({
    super.key,
    required this.userPhone,
    this.daysWindow = 180,
    this.initiallyExpanded = true,
  });

  @override
  State<SubscriptionsTrackerCard> createState() => _SubscriptionsTrackerCardState();
}

class _SubscriptionsTrackerCardState extends State<SubscriptionsTrackerCard> {
  bool _expanded = true;
  bool _running = false;
  bool _done = false;

  int _scanned = 0;
  int _expCount = 0;

  List<RecurringItem> _items = [];
  double get _subscriptionsTotal => _items.where((e)=>e.type=='subscription').fold(0.0, (a,b)=>a+b.monthlyAmount);
  int get _autopays => _items.where((e)=>e.type=='autopay').length;
  int get _emis => _items.where((e)=>e.type=='loan_emi').length;

  String? _status;
  DateTime? _lastRunAt;

  @override
  void initState() {
    super.initState();
    _expanded = widget.initiallyExpanded;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(16),
        boxShadow: kElevationToShadow[2],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.subscriptions_rounded, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text('Recurring Payments', style: Theme.of(context).textTheme.titleMedium)),
          if (_running) _chip(context, 'Scanning…')
          else if (_done) _chip(context, 'Last run ✓')
          else _chip(context, 'Ready'),
          IconButton(
            icon: Icon(_expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded),
            onPressed: () => setState(() => _expanded = !_expanded),
          ),
        ]),

        if (_expanded) const SizedBox(height: 8),

        if (_expanded) ...[
          if (_status != null) ...[
            Text(_status!, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
          ],
          Row(children: [
            ElevatedButton.icon(
              onPressed: _running ? null : _runScan,
              icon: const Icon(Icons.play_circle_fill_rounded),
              label: const Text('Run Scan'),
            ),
            const SizedBox(width: 12),
            if (_running) Expanded(child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: const LinearProgressIndicator(minHeight: 8),
            )),
            if (_lastRunAt != null && !_running)
              Text('• Last run: ${_fmtTime(_lastRunAt!)}', style: Theme.of(context).textTheme.bodySmall),
          ]),
          const SizedBox(height: 12),

          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            _stat(context, 'Scanned', '$_scanned'),
            _stat(context, 'Expenses', '$_expCount'),
            _stat(context, 'Active', '${_items.length}'),
          ]),
          const SizedBox(height: 12),

          // Quick totals
          Wrap(spacing: 8, runSpacing: 8, children: [
            _pill(context, Icons.tv_rounded, 'Subscriptions/mo', '₹${_fmt(_subscriptionsTotal)}'),
            _pill(context, Icons.autorenew_rounded, 'Autopays', '$_autopays'),
            _pill(context, Icons.account_balance_rounded, 'Loan EMIs', '$_emis'),
          ]),
          const SizedBox(height: 10),

          // List view (top 6 soonest)
          ..._items.take(6).map((r) => ListTile(
            dense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 6),
            leading: Icon(_iconFor(r.type), color: _colorFor(r.type)),
            title: Text(r.name),
            subtitle: Text('${r.type.toUpperCase()} • Next: ${_ddmmyy(r.nextDueDate)}'),
            trailing: Text('₹${_fmt(r.monthlyAmount)}'),
            onTap: () {
              // TODO: open a details/manage page; for now show a snackbar
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Coming soon: Manage ${r.name}')),
              );
            },
          )),

          if (_done) ...[
            const SizedBox(height: 8),
            _congrats(context),
          ],
        ],
      ]),
    );
  }

  Future<void> _runScan() async {
    if (_running) return;
    setState(() {
      _running = true;
      _done = false;
      _status = 'Starting recurring scan…';
      _scanned = 0;
      _expCount = 0;
      _items = [];
    });

    try {
      final now = DateTime.now();
      final from = DateTime(now.year, now.month, now.day).subtract(Duration(days: widget.daysWindow));

      // page through expenses
      final all = <ExpenseItem>[];
      DocumentSnapshot? cursor;
      const pageSize = 250;
      while (true) {
        Query q = FirebaseFirestore.instance
            .collection('users').doc(widget.userPhone)
            .collection('expenses')
            .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
            .orderBy('date')
            .limit(pageSize);
        if (cursor != null) q = (q as Query).startAfterDocument(cursor);

        final snap = await q.get();
        if (snap.docs.isEmpty) break;

        for (final d in snap.docs) {
          final e = ExpenseItem.fromFirestore(d);
          all.add(e);
          _expCount++; _scanned++;
          if (mounted) setState((){}); // live repaint
          await Future.delayed(const Duration(milliseconds: 6));
        }
        cursor = snap.docs.last;
        if (mounted) setState(() => _status = 'Scanning… $_scanned txns');
      }

      // detect recurring
      final detected = CadenceDetector.detect(all);
      setState(() {
        _items = detected;
        _status = 'Scan complete.';
        _running = false;
        _done = true;
        _lastRunAt = DateTime.now();
      });
    } catch (e) {
      setState(() {
        _running = false;
        _done = false;
        _status = 'Error: $e';
      });
    }
  }

  // --- UI helpers
  Widget _stat(BuildContext ctx, String t, String v) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(t, style: Theme.of(ctx).textTheme.bodySmall),
      const SizedBox(height: 2),
      Text(v, style: Theme.of(ctx).textTheme.titleMedium),
    ],
  );

  Widget _pill(BuildContext ctx, IconData i, String t, String v) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: Theme.of(ctx).colorScheme.surfaceVariant.withOpacity(0.5),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(i, size: 16),
      const SizedBox(width: 6),
      Text('$t: $v'),
    ]),
  );

  Widget _chip(BuildContext ctx, String t) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: Theme.of(ctx).colorScheme.primary.withOpacity(0.08),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(t, style: Theme.of(ctx).textTheme.labelSmall),
  );

  Widget _congrats(BuildContext ctx) {
    if (_items.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.green.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Row(children: [
          Icon(Icons.celebration_rounded),
          SizedBox(width: 8),
          Expanded(child: Text('No recurring payments detected. 🎉')),
        ]),
      );
    }
    final subs = _items.where((e)=>e.type=='subscription').length;
    final msg = 'Found ${_items.length} recurring payments · '
        '$subs subscriptions • $_autopays autopays • $_emis EMIs.';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.green.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        const Icon(Icons.celebration_rounded),
        const SizedBox(width: 8),
        Expanded(child: Text(msg)),
      ]),
    );
  }

  IconData _iconFor(String t) {
    switch (t) {
      case 'loan_emi': return Icons.account_balance_rounded;
      case 'autopay': return Icons.autorenew_rounded;
      default: return Icons.tv_rounded;
    }
  }

  Color _colorFor(String t) {
    switch (t) {
      case 'loan_emi': return Colors.indigo;
      case 'autopay': return Colors.teal;
      default: return Colors.purple;
    }
  }

  static String _fmt(double v) => v.toStringAsFixed(v.truncateToDouble()==v ? 0 : 2);
  static String _ddmmyy(DateTime d) => '${_tw(d.day)}/${_tw(d.month)}/${d.year%100}';
  static String _fmtTime(DateTime dt) => '${dt.year}-${_tw(dt.month)}-${_tw(dt.day)} ${_tw(dt.hour)}:${_tw(dt.minute)}';
  static String _tw(int n) => n<10 ? '0$n' : '$n';
}
