import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../models/expense_item.dart';
import '../brain/cadence_detector.dart';
import '../themes/tokens.dart';
import '../themes/glass_card.dart';
import '../themes/badge.dart';

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
  static final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  @override
  void initState() {
    super.initState();
    _expanded = widget.initiallyExpanded;
  }

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      radius: Fx.r24,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.subscriptions_rounded, size: 20, color: Fx.mintDark),
          const SizedBox(width: Fx.s8),
          Expanded(child: Text('Recurring Payments', style: Fx.title)),
          if (_running) PillBadge('Scanning…', color: Fx.mintDark)
          else if (_done) PillBadge('Last run ✓', color: Fx.good)
          else PillBadge('Ready', color: Fx.mintDark),
          IconButton(
            icon: Icon(_expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded),
            onPressed: () => setState(() => _expanded = !_expanded),
          ),
        ]),

        if (_expanded) const SizedBox(height: Fx.s8),

        if (_expanded) ...[
          if (_status != null) ...[
            Text(_status!, style: Fx.label.copyWith(fontSize: 12)),
            const SizedBox(height: Fx.s8),
          ],
          Row(children: [
            ElevatedButton.icon(
              onPressed: _running ? null : _runScan,
              icon: const Icon(Icons.play_circle_fill_rounded),
              label: const Text('Run Scan'),
            ),
            const SizedBox(width: Fx.s12),
            if (_running) Expanded(child: ClipRRect(
              borderRadius: BorderRadius.circular(Fx.r10),
              child: const LinearProgressIndicator(minHeight: 8),
            )),
            if (_lastRunAt != null && !_running)
              Text('• Last run: ${_fmtTime(_lastRunAt!)}', style: Fx.label.copyWith(fontSize: 12)),
          ]),
          const SizedBox(height: Fx.s12),

          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            _stat('Scanned', '$_scanned'),
            _stat('Expenses', '$_expCount'),
            _stat('Active', '${_items.length}'),
          ]),
          const SizedBox(height: Fx.s12),

          Wrap(spacing: Fx.s8, runSpacing: Fx.s8, children: [
            _pill(Icons.tv_rounded, 'Subscriptions/mo', _inr.format(_subscriptionsTotal)),
            _pill(Icons.autorenew_rounded, 'Autopays', '$_autopays'),
            _pill(Icons.account_balance_rounded, 'Loan EMIs', '$_emis'),
          ]),
          const SizedBox(height: Fx.s10),

          ..._items.take(6).map((r) => ListTile(
                dense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 6),
                leading: Icon(_iconFor(r.type), color: _colorFor(r.type)),
                title: Text(r.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text('${r.type.toUpperCase()} • Next: ${_ddmmyy(r.nextDueDate)}'),
                trailing: Text(_inr.format(r.monthlyAmount)),
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Coming soon: Manage ${r.name}')),
                  );
                },
              )),

          if (_done) ...[
            const SizedBox(height: Fx.s8),
            _congrats(),
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
      HapticFeedback.lightImpact();
      final now = DateTime.now();
      final from = DateTime(now.year, now.month, now.day).subtract(Duration(days: widget.daysWindow));

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
          if (mounted) setState((){});
          await Future.delayed(const Duration(milliseconds: 6));
        }
        cursor = snap.docs.last;
        if (mounted) setState(() => _status = 'Scanning… $_scanned txns');
      }

      final detected = CadenceDetector.detect(all);
      if (!mounted) return;
      setState(() {
        _items = detected;
        _status = 'Scan complete.';
        _running = false;
        _done = true;
        _lastRunAt = DateTime.now();
      });
      HapticFeedback.mediumImpact();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _running = false;
        _done = false;
        _status = 'Error: $e';
      });
    }
  }

  Widget _stat(String t, String v) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(t, style: Fx.label.copyWith(fontSize: 12)),
          const SizedBox(height: Fx.s2),
          Text(v, style: Fx.title),
        ],
      );

  Widget _pill(IconData i, String t, String v) => PillBadge('$t: $v', color: Fx.mintDark, icon: i);

  Widget _congrats() {
    if (_items.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(Fx.s12),
        decoration: BoxDecoration(
          color: Colors.green.withOpacity(0.08),
          borderRadius: BorderRadius.circular(Fx.r12),
        ),
        child: const Row(children: [
          Icon(Icons.celebration_rounded),
          SizedBox(width: Fx.s8),
          Expanded(child: Text('No recurring payments detected. 🎉')),
        ]),
      );
    }
    final subs = _items.where((e)=>e.type=='subscription').length;
    final msg = 'Found ${_items.length} recurring payments · $subs subscriptions • $_autopays autopays • $_emis EMIs.';
    return Container(
      padding: const EdgeInsets.all(Fx.s12),
      decoration: BoxDecoration(
        color: Colors.green.withOpacity(0.08),
        borderRadius: BorderRadius.circular(Fx.r12),
      ),
      child: Row(children: [
        const Icon(Icons.celebration_rounded),
        const SizedBox(width: Fx.s8),
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

  static String _ddmmyy(DateTime d) => '${_tw(d.day)}/${_tw(d.month)}/${d.year%100}';
  static String _fmtTime(DateTime dt) => '${dt.year}-${_tw(dt.month)}-${_tw(dt.day)} ${_tw(dt.hour)}:${_tw(dt.minute)}';
  static String _tw(int n) => n<10 ? '0$n' : '$n';
}
