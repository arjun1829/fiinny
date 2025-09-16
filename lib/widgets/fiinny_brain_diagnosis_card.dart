// lib/widgets/fiinny_brain_diagnosis_card.dart
import 'dart:math';
import 'dart:ui' as ui;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../services/loan_service.dart'; // (ok if unused)
import '../brain/loan_detection_service.dart';

// sheets
import 'hidden_charges_review_sheet.dart';
import 'forex_findings_sheet.dart';
import 'subscriptions_review_sheet.dart';
import 'loan_suggestions_sheet.dart';

/// Fiinny Personalized Diagnosis (v3.0.1)
/// Overflow-safe:
/// - Header actions are a Wrap with compact icon buttons
/// - Toolbar last-run text is Flexible with ellipsis
/// - Finding tiles use adaptive trailing (icon-only on narrow widths)
/// - Chips band is already a Wrap
class FiinnyBrainDiagnosisCard extends StatefulWidget {
  final String userPhone;
  final int daysWindow;
  final bool initiallyExpanded;
  final int salaryEarlyDays;

  const FiinnyBrainDiagnosisCard({
    super.key,
    required this.userPhone,
    this.daysWindow = 90,
    this.initiallyExpanded = true,
    this.salaryEarlyDays = 3,
  });

  @override
  State<FiinnyBrainDiagnosisCard> createState() =>
      _FiinnyBrainDiagnosisCardState();
}

class _FiinnyBrainDiagnosisCardState extends State<FiinnyBrainDiagnosisCard> {
  // UI state
  bool _expanded = true;
  bool _running = false;
  bool _cancelRequested = false;
  bool _done = false;
  DateTime? _lastRunAt;
  String? _status;

  // live counters
  int _txScanned = 0;
  int _hiddenCharges = 0;
  int _subscriptions = 0;
  int _forexHits = 0;
  int _loanSuggestions = 0;

  // forex totals
  double _intlSpendInr = 0;
  double _forexFeesInr = 0;

  // salary prediction
  DateTime? _payWindowStart;
  DateTime? _payWindowEnd;
  double _avgSalary = 0;
  int _salaryHits = 0;
  int _medianDays = 30;
  double _salaryConfidence = 0;

  // fast-path
  final List<ExpenseItem> _fxIntlItems = [];
  final List<ExpenseItem> _fxFeeItems = [];
  final List<ExpenseItem> _hiddenFeeItems = [];
  final List<ExpenseItem> _subscriptionCandidates = [];

  // services
  final _loanDetector = LoanDetectionService();

  // regexes
  final _feeWords = RegExp(
      r'\b(fee|charge|convenience|processing|gst|markup|penalty|late)\b',
      caseSensitive: false);
  final _subKw = RegExp(
    r'\b('
    r'subscript|subscription|recurring|auto[- ]?pay|autopay|auto[- ]?debit|'
    r'upi\s*autopay|standing\s*instruction|si\s*mandate|e[- ]?mandate|nach|ecs'
    r')\b',
    caseSensitive: false,
  );
  final _salaryKw = RegExp(
      r'\b(salary|sal\s*cr|salary\s*credit|payroll|salary\s*neft)\b',
      caseSensitive: false);

  @override
  void initState() {
    super.initState();
    _expanded = widget.initiallyExpanded;
  }

  // =============================== UI ===============================
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final anyFindings =
        _hiddenCharges + _subscriptions + _forexHits + _loanSuggestions;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(18),
        boxShadow: kElevationToShadow[2],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // ---------- Header (overflow-safe) ----------
        Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          const Icon(Icons.auto_awesome_rounded, color: Colors.teal, size: 22),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Fiinny Personalized Diagnosis',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
              softWrap: false,
            ),
          ),
          const SizedBox(width: 8),
          // trailing controls can wrap
          Flexible(
            child: Wrap(
              spacing: 2,
              runSpacing: 2,
              crossAxisAlignment: WrapCrossAlignment.center,
              alignment: WrapAlignment.end,
              children: [
                _chip(context, _running ? 'Scanning…' : _done ? 'Last run ✓' : 'Ready'),
                _tinyIconButton(
                  tooltip: 'What is this?',
                  icon: Icons.info_outline,
                  onTap: () => _showInfo(
                    title: 'Fiinny Diagnosis',
                    message:
                    'We scan recent transactions to spot hidden fees, recurring debits, forex markup and potential loans, and estimate your next payday. Only tiles with findings stay visible after a run.',
                  ),
                ),
                _tinyIconButton(
                  tooltip: 'History',
                  icon: Icons.history_rounded,
                  onTap: _openHistory,
                ),
                _tinyIconButton(
                  tooltip: _expanded ? 'Collapse' : 'Expand',
                  icon: _expanded
                      ? Icons.expand_less_rounded
                      : Icons.expand_more_rounded,
                  onTap: () => setState(() => _expanded = !_expanded),
                ),
              ],
            ),
          ),
        ]),

        if (_expanded) const SizedBox(height: 8),

        if (_expanded) ...[
          // ---------- Toolbar (overflow-safe) ----------
          Row(children: [
            if (!_running)
              ElevatedButton.icon(
                onPressed: _runAll,
                icon: const Icon(Icons.play_circle_fill_rounded),
                label: const Text('Run Diagnosis'),
              )
            else
              FilledButton.icon(
                onPressed: () => setState(() => _cancelRequested = true),
                icon: const Icon(Icons.stop_circle_rounded),
                label: const Text('Stop'),
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.red.shade600,
                ),
              ),
            const SizedBox(width: 8),
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: const LinearProgressIndicator(minHeight: 8),
              ),
            ),
            const SizedBox(width: 8),
            if (_lastRunAt != null && !_running)
              Flexible(
                child: Text(
                  '• Last run: ${_fmtTime(_lastRunAt!)}',
                  style: theme.textTheme.bodySmall,
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                  softWrap: false,
                ),
              ),
          ]),

          if (_status != null) ...[
            const SizedBox(height: 8),
            Text(_status!, style: theme.textTheme.bodySmall),
          ],

          const SizedBox(height: 12),

          // ---------- Counters ----------
          _CountersBand(
            txScanned: _txScanned,
            hidden: _hiddenCharges,
            subs: _subscriptions,
            forex: _forexHits,
            loans: _loanSuggestions,
            running: _running,
          ),

          const SizedBox(height: 10),

          // ---------- Tiles ----------
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 350),
            child: (_done && anyFindings > 0)
                ? _findingsGrid(showOnlyFindings: true)
                : _findingsGrid(showOnlyFindings: false),
          ),

          const SizedBox(height: 10),

          _salaryStrip(context),

          const SizedBox(height: 10),

          if (_done) _congratsBanner(context, anyFindings),
        ],
      ]),
    );
  }

  Widget _tinyIconButton({
    required String tooltip,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return IconButton(
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints.tightFor(width: 36, height: 36),
      tooltip: tooltip,
      icon: Icon(icon, size: 18),
      onPressed: onTap,
    );
  }

  Widget _chip(BuildContext ctx, String t) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: Theme.of(ctx).colorScheme.primary.withOpacity(0.08),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(t, style: Theme.of(ctx).textTheme.labelSmall),
  );

  void _showInfo({required String title, required String message}) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: Theme.of(ctx)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(message),
          ],
        ),
      ),
    );
  }

  Future<void> _openHistory() async {
    final db = FirebaseFirestore.instance;
    final snap = await db
        .collection('users')
        .doc(widget.userPhone)
        .collection('diagnosis_runs')
        .orderBy('at', descending: true)
        .limit(20)
        .get();

    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SizedBox(
        height: MediaQuery.of(ctx).size.height * 0.85,
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 20),
          itemBuilder: (_, i) {
            final d = snap.docs[i].data();
            final ts = (d['at'] as Timestamp).toDate();
            final c = (d['counters'] as Map?) ?? {};
            return ListTile(
              leading: const Icon(Icons.event_note_rounded),
              title: Text(_fmtTime(ts), overflow: TextOverflow.ellipsis),
              subtitle: Text(
                'Scanned: ${c['scanned'] ?? 0} • Hidden: ${c['hidden'] ?? 0} • Subs: ${c['subs'] ?? 0} • Forex: ${c['forexHits'] ?? 0} • Loans: ${c['loanSuggestions'] ?? 0}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            );
          },
          separatorBuilder: (_, __) => const Divider(height: 0),
          itemCount: snap.docs.length,
        ),
      ),
    );
  }

  Widget _findingsGrid({required bool showOnlyFindings}) {
    final tiles = <Widget>[];

    // Hidden charges
    if (!showOnlyFindings || _hiddenCharges > 0) {
      tiles.add(_FindingTile(
        color: Colors.deepOrange,
        icon: Icons.report_gmailerrorred_rounded,
        title: 'Hidden Charges',
        subtitle: _hiddenCharges == 0
            ? 'No surprise fees'
            : '$_hiddenCharges item(s) need review',
        count: _hiddenCharges,
        alertPulse: _hiddenCharges > 0,
        onTapReview: () => _openHiddenChargesReview(),
        onInfo: () => _showInfo(
          title: 'Hidden Charges',
          message:
          'We look for convenience/processing/markup/penalty/GST lines and fee-tagged expenses.',
        ),
        onExpand: () => _openHiddenChargesReview(fullscreen: true),
        actionsBuilder: _hiddenCharges == 0
            ? null
            : (ctx) => _actionsForFinding(
          ctx,
          onReview: () => _openHiddenChargesReview(),
          onDismissAll: () =>
              _dismissCollection('hidden_charge_suggestions'),
        ),
      ));
    }

    // Subscriptions & autopays
    if (!showOnlyFindings || _subscriptions > 0) {
      tiles.add(_FindingTile(
        color: Colors.indigo,
        icon: Icons.autorenew_rounded,
        title: 'Subscriptions & Auto-pays',
        subtitle: _subscriptions == 0
            ? 'No recurring debits detected'
            : '$_subscriptions active pattern(s)',
        count: _subscriptions,
        onTapReview: () => _openSubscriptionsReview(),
        onInfo: () => _showInfo(
          title: 'Subscriptions & Auto-pays',
          message:
          'Detects monthly-ish repeats by merchant+amount and keywords like “autopay/UPI autopay/standing instruction”.',
        ),
        onExpand: () => _openSubscriptionsReview(fullscreen: true),
        actionsBuilder: _subscriptions == 0
            ? null
            : (ctx) => _actionsForFinding(
          ctx,
          onReview: () => _openSubscriptionsReview(),
          onSaveAll: _saveSubscriptionsDetected,
          onDismissAll: () =>
              _dismissCollection('subscription_suggestions'),
        ),
      ));
    }

    // Forex / international
    if (!showOnlyFindings || _forexHits > 0) {
      final value = _forexHits == 0
          ? 'No intl spend'
          : '₹${_fmt(_intlSpendInr)} with ₹${_fmt(_forexFeesInr)} fees';
      tiles.add(_FindingTile(
        color: Colors.teal,
        icon: Icons.public_rounded,
        title: 'Forex & International Spend',
        subtitle: value,
        count: _forexHits,
        onTapReview: () => _openForexReview(),
        onInfo: () => _showInfo(
          title: 'Forex & International Spend',
          message:
          'Flags overseas spends via currency/FX keywords and estimates INR debits and markup/fee lines.',
        ),
        onExpand: () => _openForexReview(fullscreen: true),
        actionsBuilder: _forexHits == 0
            ? null
            : (ctx) => _actionsForFinding(
          ctx,
          onReview: () => _openForexReview(),
          onDismissAll: () => _dismissCollection('forex_suggestions'),
        ),
      ));
    }

    // Loans
    if (!showOnlyFindings || _loanSuggestions > 0) {
      tiles.add(_FindingTile(
        color: Colors.pink,
        icon: Icons.account_balance_rounded,
        title: 'New Loans Detected',
        subtitle:
        _loanSuggestions == 0 ? 'No new loans' : '$_loanSuggestions to review',
        count: _loanSuggestions,
        onTapReview: () => _openLoanSuggestions(),
        onInfo: () => _showInfo(
          title: 'Loans',
          message:
          'Matches lender patterns & disbursal/EMI keywords to surface possible loans for your confirmation.',
        ),
        onExpand: () => _openLoanSuggestions(fullscreen: true),
        actionsBuilder: _loanSuggestions == 0
            ? null
            : (ctx) => _actionsForFinding(
          ctx,
          onReview: () => _openLoanSuggestions(),
          onDismissAll: () => _dismissCollection('loan_suggestions'),
        ),
      ));
    }

    if (tiles.isEmpty) {
      return Padding(
        key: const ValueKey('no-findings'),
        padding: const EdgeInsets.only(top: 6),
        child: Text('No findings yet. Tap “Run Diagnosis”.',
            style: Theme.of(context).textTheme.bodySmall),
      );
    }

    return Column(
      key: ValueKey('findings-${showOnlyFindings ? "only" : "all"}'),
      children: [
        for (int i = 0; i < tiles.length; i++)
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1),
            duration: Duration(milliseconds: 140 + i * 50),
            curve: Curves.easeOutBack,
            builder: (ctx, v, child) => Opacity(
              opacity: v,
              child: Transform.translate(
                offset: Offset(0, ui.lerpDouble(8, 0, v)!),
                child: child,
              ),
            ),
            child: Padding(
              padding: EdgeInsets.only(bottom: i == tiles.length - 1 ? 0 : 8),
              child: tiles[i],
            ),
          ),
      ],
    );
  }

  // common 3-dot menu
  Widget _actionsForFinding(
      BuildContext ctx, {
        VoidCallback? onReview,
        Future<void> Function()? onSaveAll,
        Future<void> Function()? onDismissAll,
      }) {
    return PopupMenuButton<String>(
      tooltip: 'Actions',
      onSelected: (val) async {
        if (val == 'review' && onReview != null) onReview();
        if (val == 'save' && onSaveAll != null) await onSaveAll();
        if (val == 'dismiss' && onDismissAll != null) await onDismissAll();
      },
      itemBuilder: (_) => [
        if (onReview != null)
          const PopupMenuItem(value: 'review', child: Text('Review')),
        if (onSaveAll != null)
          const PopupMenuItem(value: 'save', child: Text('Confirm / Save all')),
        if (onDismissAll != null)
          const PopupMenuItem(value: 'dismiss', child: Text('Dismiss all')),
      ],
      child: const Padding(
        padding: EdgeInsets.all(8.0),
        child: Icon(Icons.more_horiz_rounded),
      ),
    );
  }

  // salary strip
  Widget _salaryStrip(BuildContext ctx) {
    final theme = Theme.of(ctx);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.green.withOpacity(0.06),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        const Icon(Icons.payments_rounded, color: Colors.green),
        const SizedBox(width: 8),
        Expanded(
            child:
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Payday Predictor',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontSize: 14, fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              if (_payWindowEnd == null)
                const Text('Not enough data yet. We’ll learn as you add more months.',
                    style: TextStyle(color: Colors.black54))
              else
                Text(
                    'Likely window: ${_ddmmyy(_payWindowStart!)} → ${_ddmmyy(_payWindowEnd!)} • '
                        'Avg ₹${_fmt(_avgSalary)} • Conf ${(_salaryConfidence * 100).round()}%',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
            ])),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.green.withOpacity(0.10),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(_salaryHits == 0 ? '—' : '${_salaryHits} hits',
              style: const TextStyle(
                  color: Colors.green, fontWeight: FontWeight.w700)),
        ),
      ]),
    );
  }

  Widget _congratsBanner(BuildContext ctx, int anyFindings) {
    final text = anyFindings == 0
        ? 'All clear! No issues found in this window. 🎉'
        : 'Diagnosis complete: $anyFindings item(s) to review. Tap “Review”.';
    return AnimatedContainer(
      duration: const Duration(milliseconds: 400),
      curve: Curves.easeOutBack,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: anyFindings == 0
            ? Colors.green.withOpacity(0.09)
            : Colors.orange.withOpacity(0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        Icon(
            anyFindings == 0
                ? Icons.celebration_rounded
                : Icons.lightbulb_outline_rounded,
            color: anyFindings == 0 ? Colors.green : Colors.orange),
        const SizedBox(width: 8),
        Expanded(child: Text(text)),
      ]),
    );
  }

  // =============================== Actions ===============================

  Future<void> _openHiddenChargesReview({bool fullscreen = false}) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      builder: (_) => SizedBox(
        height: MediaQuery.of(context).size.height * (fullscreen ? 0.92 : 0.70),
        child: HiddenChargesReviewSheet(
          userId: widget.userPhone,
          daysWindow: widget.daysWindow,
          prefetched: _hiddenFeeItems,
        ),
      ),
    );
  }

  Future<void> _openForexReview({bool fullscreen = false}) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      builder: (_) => SizedBox(
        height: MediaQuery.of(context).size.height * (fullscreen ? 0.92 : 0.70),
        child: ForexFindingsSheet(
          userId: widget.userPhone,
          daysWindow: widget.daysWindow,
          prefetchedIntl: _fxIntlItems,
          prefetchedFees: _fxFeeItems,
        ),
      ),
    );
  }

  Future<void> _openSubscriptionsReview({bool fullscreen = false}) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      builder: (_) => SizedBox(
        height: MediaQuery.of(context).size.height * (fullscreen ? 0.92 : 0.78),
        child: SubscriptionsReviewSheet(
          userId: widget.userPhone,
          daysWindow: 180,
          prefetched: _subscriptionCandidates,
        ),
      ),
    );
  }

  Future<void> _openLoanSuggestions({bool fullscreen = false}) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      builder: (_) => SizedBox(
        height: MediaQuery.of(context).size.height * (fullscreen ? 0.92 : 0.78),
        child: LoanSuggestionsSheet(userId: widget.userPhone),
      ),
    );
    _loanSuggestions = await _loanDetector.pendingCount(widget.userPhone);
    if (mounted) setState(() {});
  }

  // bulk “confirm/save” for subscriptions
  Future<void> _saveSubscriptionsDetected() async {
    final db = FirebaseFirestore.instance;
    final sugg = await db
        .collection('users')
        .doc(widget.userPhone)
        .collection('subscription_suggestions')
        .where('status', whereIn: [null, 'new']).get();

    final batch = db.batch();
    for (final d in sugg.docs) {
      final data = d.data();
      final out = {
        'userId': widget.userPhone,
        'merchant': data['merchant'] ?? data['label'] ?? 'Subscription',
        'amount': (data['amount'] as num?)?.toDouble() ?? 0.0,
        'cycle': 'monthly',
        'sourceExpenseIds':
        (data['expenseIds'] as List?)?.cast<String>() ?? [],
        'createdAt': FieldValue.serverTimestamp(),
        'active': true,
      };
      final dest = db
          .collection('users')
          .doc(widget.userPhone)
          .collection('subscriptions')
          .doc();
      batch.set(dest, out);
      batch.update(d.reference, {'status': 'saved'});
    }
    await batch.commit();
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Subscriptions saved.')));
    }
  }

  Future<void> _dismissCollection(String subcol) async {
    final db = FirebaseFirestore.instance;
    final snap = await db
        .collection('users')
        .doc(widget.userPhone)
        .collection(subcol)
        .where('status', whereIn: [null, 'new']).get();

    final batch = db.batch();
    for (final d in snap.docs) {
      batch.update(d.reference, {'status': 'dismissed'});
    }
    await batch.commit();
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Dismissed.')));
    }
  }

  // ============================== Runner ==============================

  Future<void> _runAll() async {
    if (_running) return;
    setState(() {
      _running = true;
      _cancelRequested = false;
      _done = false;
      _status = 'Starting diagnosis…';
      _txScanned = 0;
      _hiddenCharges = 0;
      _subscriptions = 0;
      _forexHits = 0;
      _loanSuggestions = 0;
      _intlSpendInr = 0;
      _forexFeesInr = 0;
      _avgSalary = 0;
      _salaryHits = 0;
      _medianDays = 30;
      _salaryConfidence = 0;
      _payWindowStart = null;
      _payWindowEnd = null;
      _fxIntlItems.clear();
      _fxFeeItems.clear();
      _hiddenFeeItems.clear();
      _subscriptionCandidates.clear();
    });

    try {
      await _scanHiddenCharges();
      if (_cancelRequested) throw 'Cancelled';

      await _scanSubscriptions();
      if (_cancelRequested) throw 'Cancelled';

      await _scanForex();
      if (_cancelRequested) throw 'Cancelled';

      await _scanLoans();
      if (_cancelRequested) throw 'Cancelled';

      await _predictSalary();

      await _persistRun();

      setState(() {
        _running = false;
        _done = true;
        _status = 'Diagnosis complete.';
        _lastRunAt = DateTime.now();
      });
    } catch (e) {
      setState(() {
        _running = false;
        _done = false;
        _status = e.toString() == 'Cancelled' ? 'Cancelled.' : 'Error: $e';
      });
    }
  }

  // ============================== Scanners ==============================

  Future<void> _scanHiddenCharges() async {
    setState(() => _status = 'Scanning hidden charges…');

    final now = DateTime.now();
    final from = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: widget.daysWindow));

    DocumentSnapshot? cursor;
    const page = 250;
    int found = 0;

    while (true) {
      if (_cancelRequested) break;
      Query q = FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userPhone)
          .collection('expenses')
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
          .orderBy('date')
          .limit(page);
      if (cursor != null) q = (q as Query).startAfterDocument(cursor);
      final snap = await q.get();
      if (snap.docs.isEmpty) break;

      for (final d in snap.docs) {
        if (_cancelRequested) break;
        final e = ExpenseItem.fromFirestore(d);
        _txScanned++;

        final note = e.note.toLowerCase();
        final tags =
            (e.toJson()['tags'] as List?)?.cast<String>() ?? const [];
        final isFee = tags.contains('fee') || _feeWords.hasMatch(note);

        if (isFee) {
          found++;
          _hiddenFeeItems.add(e);
          await FirebaseFirestore.instance
              .collection('users')
              .doc(widget.userPhone)
              .collection('hidden_charge_suggestions')
              .doc(d.id)
              .set({
            'expenseId': d.id,
            'amount': e.amount,
            'date': d['date'],
            'note': e.note,
            'createdAt': FieldValue.serverTimestamp(),
            'status': 'new',
          }, SetOptions(merge: true));
        }

        if (mounted) setState(() {});
        await Future.delayed(const Duration(milliseconds: 4));
      }
      cursor = snap.docs.last;
    }
    setState(() => _hiddenCharges = found);
  }

  Future<void> _scanSubscriptions() async {
    setState(() => _status = 'Detecting subscriptions & auto-pays…');

    final now = DateTime.now();
    final from = DateTime(now.year, now.month, now.day)
        .subtract(const Duration(days: 180));

    final expenses = <ExpenseItem>[];
    DocumentSnapshot? cursor;
    const page = 250;

    while (true) {
      if (_cancelRequested) break;
      Query q = FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userPhone)
          .collection('expenses')
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
          .orderBy('date')
          .limit(page);
      if (cursor != null) q = (q as Query).startAfterDocument(cursor);
      final snap = await q.get();
      if (snap.docs.isEmpty) break;
      for (final d in snap.docs) {
        if (_cancelRequested) break;
        expenses.add(ExpenseItem.fromFirestore(d));
      }
      cursor = snap.docs.last;
    }

    final Map<String, List<ExpenseItem>> groups = {};
    for (final e in expenses) {
      final note = e.note.toLowerCase();
      final tags =
          (e.toJson()['tags'] as List?)?.cast<String>() ?? const [];
      final looksRecurring =
          tags.contains('subscription') ||
              tags.contains('autopay') ||
              _subKw.hasMatch(note);

      final merchant = _merchantOf(e);
      final bucket = _amountBucket(e.amount);
      final key = '${merchant.toLowerCase()}|$bucket';
      groups.putIfAbsent(key, () => []).add(e);

      if (looksRecurring) {
        _subscriptionCandidates.add(e);
        await FirebaseFirestore.instance
            .collection('users')
            .doc(widget.userPhone)
            .collection('subscription_suggestions')
            .doc(key)
            .set({
          'merchant': merchant,
          'amount': e.amount,
          'expenseIds': FieldValue.arrayUnion([e.id]),
          'createdAt': FieldValue.serverTimestamp(),
          'status': 'new',
        }, SetOptions(merge: true));
      }
    }

    int subs = 0;
    for (final entry in groups.entries) {
      final list = entry.value..sort((a, b) => a.date.compareTo(b.date));
      if (list.length < 2) continue;

      final diffs = <int>[];
      for (int i = 1; i < list.length; i++) {
        diffs.add(list[i].date.difference(list[i - 1].date).inDays.abs());
      }
      diffs.sort();
      final median = diffs.isEmpty
          ? 30
          : (diffs.length.isOdd
          ? diffs[diffs.length ~/ 2]
          : ((diffs[diffs.length ~/ 2 - 1] + diffs[diffs.length ~/ 2]) / 2)
          .round());
      final monthly = median >= 27 && median <= 34;
      if (monthly) subs++;
    }
    setState(() => _subscriptions = subs);
  }

  Future<void> _scanForex() async {
    setState(() => _status = 'Scanning forex / international spend…');

    final now = DateTime.now();
    final from = DateTime(now.year, now.month, now.day)
        .subtract(const Duration(days: 180));

    final reSpentFx = RegExp(
        r'(spent|purchase|txn)\s+(usd|eur|gbp|aud|cad|sgd|aed|jpy)\s*([0-9]+(?:\.[0-9]+)?)',
        caseSensitive: false);
    final reInrDebit = RegExp(
        r'(spent|debited|txn|transaction|purchase)\s*(inr|rs\.?)\s*([0-9,]+(?:\.[0-9]+)?)',
        caseSensitive: false);
    final reFxHint = RegExp(
        r'\b(forex|fx|cross.?currency|intl|international|overseas|markup)\b',
        caseSensitive: false);
    final reFxSymbol = RegExp(r'(\$|€|£|usd|eur|gbp)', caseSensitive: false);

    DocumentSnapshot? cursor;
    const page = 250;

    int intlCount = 0;
    double spendInr = 0;
    double feeInr = 0;

    while (true) {
      if (_cancelRequested) break;
      Query q = FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userPhone)
          .collection('expenses')
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
          .orderBy('date')
          .limit(page);
      if (cursor != null) q = (q as Query).startAfterDocument(cursor);
      final snap = await q.get();
      if (snap.docs.isEmpty) break;

      for (final d in snap.docs) {
        if (_cancelRequested) break;
        final e = ExpenseItem.fromFirestore(d);
        final lower = e.note.toLowerCase();

        final isIntl = reSpentFx.hasMatch(lower) ||
            reFxHint.hasMatch(lower) ||
            reFxSymbol.hasMatch(lower);
        if (!isIntl) continue;

        final looksFee = _feeWords.hasMatch(lower);

        if (!looksFee) {
          intlCount++;
          _fxIntlItems.add(e);
        } else {
          _fxFeeItems.add(e);
        }

        final inrM = reInrDebit.firstMatch(lower);
        if (inrM != null) {
          final inrStr = inrM.group(3)!.replaceAll(',', '');
          final val = double.tryParse(inrStr);
          if (val != null) spendInr += val;
        }

        if (looksFee) {
          feeInr += e.amount;
        }
      }

      cursor = snap.docs.last;
      if (mounted) setState(() {});
      await Future.delayed(const Duration(milliseconds: 4));
    }

    setState(() {
      _forexHits = intlCount;
      _intlSpendInr = spendInr;
      _forexFeesInr = feeInr;
    });
  }

  Future<void> _scanLoans() async {
    setState(() => _status = 'Detecting loans…');
    await _loanDetector.scanAndWrite(widget.userPhone, daysWindow: 360);
    _loanSuggestions = await _loanDetector.pendingCount(widget.userPhone);
    if (mounted) setState(() {});
  }

  Future<void> _predictSalary() async {
    setState(() => _status = 'Predicting payday…');

    final now = DateTime.now();
    final from = DateTime(now.year, now.month, now.day)
        .subtract(const Duration(days: 365));

    final records = <({IncomeItem item, Map<String, dynamic> raw})>[];
    DocumentSnapshot? cursor;
    const page = 250;

    while (true) {
      if (_cancelRequested) break;
      Query q = FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userPhone)
          .collection('incomes')
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
          .orderBy('date')
          .limit(page);
      if (cursor != null) q = (q as Query).startAfterDocument(cursor);
      final snap = await q.get();
      if (snap.docs.isEmpty) break;
      for (final d in snap.docs) {
        if (_cancelRequested) break;
        final it = IncomeItem.fromFirestore(d);
        records.add((item: it, raw: d.data() as Map<String, dynamic>));
      }
      cursor = snap.docs.last;
    }

    final salary = <IncomeItem>[];
    for (final rec in records) {
      final n = rec.item.note.toLowerCase();
      final tags =
          (rec.raw['tags'] as List?)?.cast<String>() ?? const [];
      if (tags.contains('fixed_income') || _salaryKw.hasMatch(n)) {
        salary.add(rec.item);
      }
    }
    _salaryHits = salary.length;
    if (_salaryHits == 0) {
      setState(() {});
      return;
    }

    salary.sort((a, b) => a.date.compareTo(b.date));

    final diffs = <int>[];
    for (int i = 1; i < salary.length; i++) {
      final curr = salary[i].date;
      final prev = salary[i - 1].date;
      diffs.add(curr.difference(prev).inDays.abs());

    }
    diffs.sort();
    _medianDays = diffs.isEmpty
        ? 30
        : (diffs.length.isOdd
        ? diffs[diffs.length ~/ 2]
        : ((diffs[diffs.length ~/ 2 - 1] + diffs[diffs.length ~/ 2]) / 2)
        .round());

    final last3 =
    salary.sublist(max(0, salary.length - 3)).map((e) => e.amount).toList();
    _avgSalary =
        last3.fold<double>(0.0, (a, b) => a + b) / max(1, last3.length);

    if (_medianDays >= 27 && _medianDays <= 34) {
      final anchor = _nextMonthFirst(DateTime.now());
      _payWindowEnd = anchor;
      _payWindowStart =
          anchor.subtract(Duration(days: widget.salaryEarlyDays.clamp(0, 5)));
    } else {
      var next = salary.last.date.add(Duration(days: _medianDays));
      final today = DateTime.now();
      while (!next.isAfter(today)) {
        next = next.add(Duration(days: _medianDays));
      }
      _payWindowEnd = next;
      _payWindowStart =
          next.subtract(Duration(days: widget.salaryEarlyDays.clamp(0, 5)));
    }

    final tail =
    salary.map((e) => e.amount).toList().sublist(max(0, salary.length - 6));
    final stdPct = _std(tail) / ((_avgSalary == 0) ? 1 : _avgSalary) * 100.0;
    _salaryConfidence = _scoreConfidence(
      hits: _salaryHits,
      monthly: _medianDays >= 27 && _medianDays <= 34,
      stdPct: stdPct.isFinite ? stdPct : 100,
      streak: _computeStreak(
          salary.map((e) => e.date).toList(),
          earlyDays: widget.salaryEarlyDays),
    );

    if (mounted) setState(() {});
  }

  // ============================ Persistence ============================

  Future<void> _persistRun() async {
    final db = FirebaseFirestore.instance;
    final now = DateTime.now();
    final runId = now.toIso8601String();

    final payload = {
      'userId': widget.userPhone,
      'at': Timestamp.fromDate(now),
      'windowDays': widget.daysWindow,
      'counters': {
        'scanned': _txScanned,
        'hidden': _hiddenCharges,
        'subs': _subscriptions,
        'forexHits': _forexHits,
        'loanSuggestions': _loanSuggestions,
      },
      'forex': {
        'intlSpendInr': _intlSpendInr,
        'feesInr': _forexFeesInr,
      },
      'salary': {
        'hits': _salaryHits,
        'medianDays': _medianDays,
        'avgSalary': _avgSalary,
        'confidence': _salaryConfidence,
        'windowStart':
        _payWindowStart == null ? null : Timestamp.fromDate(_payWindowStart!),
        'windowEnd':
        _payWindowEnd == null ? null : Timestamp.fromDate(_payWindowEnd!),
      },
    };

    await db
        .collection('users')
        .doc(widget.userPhone)
        .collection('diagnosis_runs')
        .doc(runId)
        .set(payload);

    await db
        .collection('users')
        .doc(widget.userPhone)
        .collection('diagnosis')
        .doc('latest')
        .set(payload);
  }

  // ============================== helpers ==============================

  String _merchantOf(ExpenseItem e) {
    final meta = (e.toJson()['brainMeta'] as Map?)?.cast<String, dynamic>();
    final m = (meta?['merchant'] as String?) ?? e.label ?? e.category ?? '';
    if (m.trim().isNotEmpty) return _title(m);
    final n = e.note;
    final m2 = RegExp(r'[A-Z][A-Z0-9&._-]{3,}').firstMatch(n.toUpperCase());
    return m2 != null ? _title(m2.group(0)!) : 'Merchant';
  }

  String _amountBucket(double v) {
    final rounded = (v / 10).round() * 10;
    return rounded.toString();
  }

  DateTime _nextMonthFirst(DateTime from) =>
      (from.month == 12) ? DateTime(from.year + 1, 1, 1) : DateTime(from.year, from.month + 1, 1);

  int _computeStreak(List<DateTime> dates, {required int earlyDays}) {
    if (dates.isEmpty) return 0;
    dates.sort();
    final hits = <String>{};
    for (final d in dates) {
      final anchor = DateTime(d.year, d.month, 1);
      final earlyStart = anchor.subtract(Duration(days: earlyDays));
      final key = (d.isAfter(earlyStart) && !d.isAfter(anchor))
          ? '${anchor.year}-${anchor.month.toString().padLeft(2, '0')}'
          : '${d.year}-${d.month.toString().padLeft(2, '0')}';
      hits.add(key);
    }
    int streak = 0;
    DateTime cursor = DateTime(DateTime.now().year, DateTime.now().month, 1);
    while (true) {
      final key = '${cursor.year}-${cursor.month.toString().padLeft(2, '0')}';
      if (hits.contains(key)) {
        streak++;
        cursor = DateTime(cursor.year, cursor.month - 1, 1);
      } else {
        break;
      }
    }
    return streak;
  }

  double _std(List<double> xs) {
    if (xs.length <= 1) return 0;
    final m = xs.reduce((a, b) => a + b) / xs.length;
    final v = xs.fold<double>(0, (a, x) => a + pow(x - m, 2)) / (xs.length - 1);
    return sqrt(v);
  }

  double _scoreConfidence(
      {required int hits,
        required bool monthly,
        required double stdPct,
        required int streak}) {
    double s = 0.4;
    if (hits >= 3) s += 0.2;
    if (monthly) s += 0.25;
    if (stdPct <= 10) s += 0.1;
    if (streak >= 3) s += 0.05;
    return s.clamp(0.0, 0.99);
  }

  static String _fmt(double v) =>
      v.toStringAsFixed(v.truncateToDouble() == v ? 0 : 2);
  static String _ddmmyy(DateTime d) =>
      '${_tw(d.day)}/${_tw(d.month)}/${d.year % 100}';
  static String _fmtTime(DateTime dt) =>
      '${dt.year}-${_tw(dt.month)}-${_tw(dt.day)} ${_tw(dt.hour)}:${_tw(dt.minute)}';
  static String _tw(int n) => n < 10 ? '0$n' : '$n';
  static String _title(String s) => s
      .split(RegExp(r'\s+'))
      .map((w) => w.isEmpty
      ? w
      : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}')
      .join(' ');
}

// ===================== Counter band (chip-based) =====================
class _CountersBand extends StatelessWidget {
  final int txScanned, hidden, subs, forex, loans;
  final bool running;
  const _CountersBand({
    required this.txScanned,
    required this.hidden,
    required this.subs,
    required this.forex,
    required this.loans,
    required this.running,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    Widget chip(String t, String v, {Color? color}) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: (color ?? Colors.teal).withOpacity(0.06),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(t,
              style: const TextStyle(fontSize: 12, color: Colors.black54)),
          const SizedBox(height: 4),
          Text(v,
              style: const TextStyle(
                  fontWeight: FontWeight.w800, fontSize: 16)),
        ],
      ),
    );

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        chip('Scanned', '$txScanned', color: Colors.blueGrey),
        chip('Hidden', '$hidden', color: Colors.deepOrange),
        chip('Subs', '$subs', color: Colors.indigo),
        chip('Forex', '$forex', color: Colors.teal),
        chip('Loans', '$loans', color: Colors.pink),
      ],
    );
  }
}

// =================== Tile with pulse / actions + info/expand ===================
class _FindingTile extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String title;
  final String subtitle;
  final int count;
  final bool alertPulse;
  final VoidCallback? onTapReview;
  final VoidCallback? onInfo;
  final VoidCallback? onExpand;
  final Widget Function(BuildContext context)? actionsBuilder;

  const _FindingTile({
    super.key,
    required this.color,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.count,
    this.alertPulse = false,
    this.onTapReview,
    this.onInfo,
    this.onExpand,
    this.actionsBuilder,
  });

  @override
  Widget build(BuildContext context) {
    final has = count > 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: has ? color.withOpacity(0.06) : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(14),
      ),
      child: LayoutBuilder(
        builder: (ctx, ct) {
          final narrow = ct.maxWidth < 360;
          return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            Stack(alignment: Alignment.center, children: [
              if (alertPulse)
                _AlertPulse(color: color.withOpacity(0.28), size: 38),
              CircleAvatar(
                radius: 18,
                backgroundColor: color.withOpacity(0.12),
                child: Icon(icon, color: color, size: 20),
              ),
            ]),
            const SizedBox(width: 10),
            Expanded(
              child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Text(title,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  ),
                  if (onInfo != null)
                    IconButton(
                      tooltip: 'What is this?',
                      icon: const Icon(Icons.info_outline, size: 18),
                      onPressed: onInfo,
                      padding: EdgeInsets.zero,
                      visualDensity: VisualDensity.compact,
                      constraints:
                      const BoxConstraints.tightFor(width: 32, height: 32),
                    ),
                  if (onExpand != null)
                    IconButton(
                      tooltip: 'Expand',
                      icon: const Icon(Icons.open_in_full, size: 18),
                      onPressed: onExpand,
                      padding: EdgeInsets.zero,
                      visualDensity: VisualDensity.compact,
                      constraints:
                      const BoxConstraints.tightFor(width: 32, height: 32),
                    ),
                ]),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: has ? Colors.black87 : Colors.black54),
                ),
              ]),
            ),
            const SizedBox(width: 8),
            // trailing area stays compact; switches to icon-only on very narrow widths
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color:
                has ? color.withOpacity(0.10) : Colors.grey.withOpacity(0.10),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text('$count',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: has ? color : Colors.grey[700],
                  )),
            ),
            const SizedBox(width: 6),
            if (onTapReview != null)
              (narrow
                  ? IconButton(
                tooltip: 'Review',
                icon: const Icon(Icons.chevron_right),
                onPressed: onTapReview,
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints.tightFor(
                    width: 32, height: 32),
              )
                  : TextButton(onPressed: onTapReview, child: const Text('Review'))),
            if (actionsBuilder != null) actionsBuilder!(context),
          ]);
        },
      ),
    );
  }
}

class _AlertPulse extends StatefulWidget {
  final Color color;
  final double size;
  const _AlertPulse({super.key, required this.color, this.size = 40});

  @override
  State<_AlertPulse> createState() => _AlertPulseState();
}

class _AlertPulseState extends State<_AlertPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        final v = Curves.easeOut.transform(_c.value);
        final size = widget.size * (1 + 0.55 * v);
        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: widget.color.withOpacity(0.7 * (1 - v)),
          ),
        );
      },
    );
  }
}
