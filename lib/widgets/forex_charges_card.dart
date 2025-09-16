import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../models/expense_item.dart';

class ForexChargesCard extends StatefulWidget {
  final String userPhone;
  final int daysWindow;
  final bool initiallyExpanded;
  const ForexChargesCard({
    super.key,
    required this.userPhone,
    this.daysWindow = 180,
    this.initiallyExpanded = true,
  });

  @override
  State<ForexChargesCard> createState() => _ForexChargesCardState();
}

class _ForexChargesCardState extends State<ForexChargesCard> {
  bool _expanded = true;
  bool _running = false;
  bool _done = false;

  int _scanned = 0;
  int _fxTxn = 0;

  double _intlSpend = 0;      // ₹ sum of intl purchases
  double _fxFees = 0;         // ₹ sum of forex/markup fees (from brainMeta if available or heuristic)
  double get _markupPct => _intlSpend > 0 ? (_fxFees / _intlSpend) * 100.0 : 0.0;

  String? _status;
  DateTime? _lastRunAt;

  final _feeWords  = RegExp(r'\b(fee|charge|convenience|processing|gst|markup|penalty|late)\b', caseSensitive: false);
  final _fxWords   = RegExp(r'\b(forex|fx|cross.?currency|intl|international|overseas|markup)\b', caseSensitive: false);
  final _fxSymbol  = RegExp(r'(\$|usd|eur|€|gbp|£)', caseSensitive: false);

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
          const Icon(Icons.public_rounded, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text('Forex & International Spend', style: Theme.of(context).textTheme.titleMedium)),
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
              label: const Text('Run Forex Scan'),
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
            _stat(context, 'Intl txns', '$_fxTxn'),
            _stat(context, 'Markup %', _intlSpend==0 ? '—' : '${_markupPct.toStringAsFixed(1)}%'),
          ]),
          const SizedBox(height: 12),

          Wrap(spacing: 8, runSpacing: 8, children: [
            _pill(context, Icons.flight_takeoff_rounded, 'International Spend', '₹${_fmt(_intlSpend)}'),
            _pill(context, Icons.price_change_rounded, 'FX Fees (₹)', '₹${_fmt(_fxFees)}'),
          ]),
          const SizedBox(height: 8),

          if (_done) _congrats(context),
        ],
      ]),
    );
  }

  Future<void> _runScan() async {
    if (_running) return;
    setState(() {
      _running = true;
      _done = false;
      _status = 'Starting forex scan…';
      _scanned = 0; _fxTxn = 0;
      _intlSpend = 0; _fxFees = 0;
    });

    try {
      final now = DateTime.now();
      final from = DateTime(now.year, now.month, now.day).subtract(Duration(days: widget.daysWindow));

      // page through expenses
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
          _scanned++;

          final n = e.note.toLowerCase();
          final tags = (e.toJson()['tags'] as List?)?.cast<String>() ?? const [];
          final meta = (e.toJson()['brainMeta'] as Map?)?.cast<String, dynamic>();

          final looksFx = tags.contains('forex') || _fxWords.hasMatch(n) || _fxSymbol.hasMatch(n);
          final looksFee = tags.contains('fee') || _feeWords.hasMatch(n);

          if (looksFx && !looksFee) {
            // count this as intl spend
            _fxTxn++;
            _intlSpend += e.amount;
          }

          // add explicit fxFee if present OR heuristic fee tagged as forex
          final fxFee = (meta?['fxFee'] as num?)?.toDouble();
          if (fxFee != null && fxFee > 0) {
            _fxFees += fxFee;
          } else if (looksFx && looksFee) {
            _fxFees += e.amount; // fee line separate (heuristic)
          }

          if (mounted) setState(() {});
          await Future.delayed(const Duration(milliseconds: 6));
        }

        cursor = snap.docs.last;
        if (mounted) setState(() => _status = 'Scanning… $_scanned txns');
      }

      setState(() {
        _running = false;
        _done = true;
        _status = 'Forex scan complete.';
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

  // UI helpers
  Widget _chip(BuildContext ctx, String t) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: Theme.of(ctx).colorScheme.primary.withOpacity(0.08),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(t, style: Theme.of(ctx).textTheme.labelSmall),
  );
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

  Widget _congrats(BuildContext ctx) {
    final msg = _intlSpend == 0
        ? 'No international spend detected in this window. 🌍✨'
        : 'Found ₹${_fmt(_intlSpend)} intl spend with ₹${_fmt(_fxFees)} forex fees '
        '(${_markupPct.isFinite ? _markupPct.toStringAsFixed(1) : '—'}%).';
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

  static String _fmt(double v) => v.toStringAsFixed(v.truncateToDouble()==v ? 0 : 2);
  static String _fmtTime(DateTime dt) => '${dt.year}-${_tw(dt.month)}-${_tw(dt.day)} ${_tw(dt.hour)}:${_tw(dt.minute)}';
  static String _tw(int n) => n<10 ? '0$n' : '$n';
}
