import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../models/income_item.dart';

class SalaryPredictorCard extends StatefulWidget {
  final String userPhone;
  final int daysWindow;
  final bool initiallyExpanded;
  final int defaultEarlyDays; // India: salary may arrive 2–3 days early
  const SalaryPredictorCard({
    super.key,
    required this.userPhone,
    this.daysWindow = 365,
    this.initiallyExpanded = true,
    this.defaultEarlyDays = 3,
  });

  @override
  State<SalaryPredictorCard> createState() => _SalaryPredictorCardState();
}

class _SalaryPredictorCardState extends State<SalaryPredictorCard> {
  bool _expanded = true;
  bool _running = false;
  bool _done = false;

  // counters
  int _scanned = 0;
  int _salaryHits = 0;

  // primary employer stats
  String? _employerName;            // cluster picked as primary
  double _avgSalary = 0;
  double _amountStdPct = 0;         // variability %
  int _streakMonths = 0;            // consecutive months with salary
  int _medianDays = 30;             // cadence
  double _confidence = 0;           // 0..1

  // dates
  DateTime? _lastSalaryDate;
  DateTime? _nextPredicted;
  DateTime? _windowStart;           // early window start (India 2–3 days early)
  DateTime? _windowEnd;             // anchor (usually 1st of month)

  // ui / state
  String? _status;
  DateTime? _lastRunAt;
  int _earlyDays = 3;

  // other employers (name -> hits)
  List<MapEntry<String,int>> _otherEmployers = const [];

  final _salaryKw = RegExp(r'\b(salary|sal\s*cr|salary\s*credit|payroll|salary\s*neft)\b', caseSensitive: false);

  @override
  void initState() {
    super.initState();
    _expanded = widget.initiallyExpanded;
    _earlyDays = widget.defaultEarlyDays.clamp(0, 5);
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
          const Icon(Icons.badge_rounded, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text('Salary & Payday Predictor', style: Theme.of(context).textTheme.titleMedium)),
          if (_running) _chip(context, 'Analyzing…')
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
              onPressed: _running ? null : _runPrediction,
              icon: const Icon(Icons.play_circle_fill_rounded),
              label: const Text('Run Prediction'),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: _running ? null : _changeEarlyDays,
              icon: const Icon(Icons.settings_rounded, size: 18),
              label: Text('Early window: $_earlyDays d'),
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
            _stat(context, 'Salary hits', '$_salaryHits'),
            _stat(context, 'Median cycle', '${_medianDays}d'),
          ]),
          const SizedBox(height: 12),

          // Primary employer summary row
          Wrap(spacing: 8, runSpacing: 8, children: [
            _pill(context, Icons.business_center_rounded, 'Employer', _employerName ?? '—'),
            _pill(context, Icons.attach_money_rounded, 'Avg (last 3)', _avgSalary==0 ? '—' : '₹${_fmt(_avgSalary)}'),
            _pill(context, Icons.insights_rounded, 'Stability', _amountStdPct==0 ? '—' : '${_amountStdPct.toStringAsFixed(1)}%'),
            _pill(context, Icons.emoji_events_rounded, 'Streak', _streakMonths>0 ? '${_streakMonths}m' : '—'),
            _pill(context, Icons.verified_rounded, 'Confidence', '${(_confidence*100).round()}%'),
          ]),
          const SizedBox(height: 10),

          // Predicted date window
          Wrap(spacing: 8, runSpacing: 8, children: [
            _pill(context, Icons.event_available_rounded, 'Last Salary',
                _lastSalaryDate==null ? '—' : _ddmmyy(_lastSalaryDate!)),
            _pill(context, Icons.timelapse_rounded, 'Next Payday',
                _windowEnd==null ? '—' : '${_ddmmyy(_windowStart!)} → ${_ddmmyy(_windowEnd!)}'),
          ]),
          const SizedBox(height: 8),

          // Other employers (if any)
          if (_otherEmployers.isNotEmpty) ...[
            Text('Other employers detected', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6, runSpacing: 6,
              children: _otherEmployers.map((e) =>
                  Chip(label: Text('${e.key} · ${e.value} hits'))).toList(),
            ),
            const SizedBox(height: 8),
          ],

          if (_done) _congrats(context),
        ],
      ]),
    );
  }

  // -------------------- Runner --------------------
  Future<void> _runPrediction() async {
    if (_running) return;
    setState(() {
      _running = true;
      _done = false;
      _status = 'Predicting next payday…';
      _scanned = 0; _salaryHits = 0;
      _avgSalary = 0; _amountStdPct = 0; _streakMonths = 0;
      _employerName = null; _confidence = 0;
      _lastSalaryDate = null; _nextPredicted = null; _windowStart = null; _windowEnd = null;
      _medianDays = 30;
      _otherEmployers = const [];
    });

    try {
      final now = DateTime.now();
      final from = DateTime(now.year, now.month, now.day).subtract(Duration(days: widget.daysWindow));

      // fetch incomes (paged)
      final incomes = <({IncomeItem item, Map<String, dynamic> raw})>[];
      DocumentSnapshot? cursor;
      const pageSize = 250;
      while (true) {
        Query q = FirebaseFirestore.instance
            .collection('users').doc(widget.userPhone)
            .collection('incomes')
            .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
            .orderBy('date')
            .limit(pageSize);
        if (cursor != null) q = (q).startAfterDocument(cursor);

        final snap = await q.get();
        if (snap.docs.isEmpty) break;

        for (final d in snap.docs) {
          final i = IncomeItem.fromFirestore(d);
          incomes.add((item: i, raw: d.data() as Map<String, dynamic>));
          _scanned++;
          if (mounted) setState(() {});
          await Future.delayed(const Duration(milliseconds: 6));
        }
        cursor = snap.docs.last;
        if (mounted) setState(() => _status = 'Analyzing… $_scanned incomes');
      }

      // keep only salary-like
      final salary = <({IncomeItem item, Map<String, dynamic> raw})>[];
      for (final rec in incomes) {
        final i = rec.item;
        final raw = rec.raw;
        final tags = (raw['tags'] as List?)?.cast<String>() ?? const [];
        final n = (i.note).toLowerCase();
        if (tags.contains('fixed_income') || _salaryKw.hasMatch(n)) {
          salary.add(rec);
        }
      }

      _salaryHits = salary.length;
      if (salary.isEmpty) {
        setState(() {
          _running = false;
          _done = true;
          _status = 'No salary-like credits found.';
          _lastRunAt = DateTime.now();
        });
        return;
      }

      // ---------- group by employer ----------
      final groups = <String, List<({IncomeItem item, Map<String, dynamic> raw})>>{};
      for (final rec in salary) {
        final employer = _employerFrom(rec.raw, rec.item.note);
        groups.putIfAbsent(employer, () => []).add(rec);
      }

      // choose primary cluster: most recent last date, tie-break by hits
      String primaryKey = groups.keys.first;
      DateTime primaryLast = DateTime.fromMillisecondsSinceEpoch(0);
      for (final entry in groups.entries) {
        final list = entry.value..sort((a,b)=>a.item.date.compareTo(b.item.date));
        final last = list.last.item.date;
        if (last.isAfter(primaryLast) ||
            (last.isAtSameMomentAs(primaryLast) && list.length > (groups[primaryKey]?.length ?? 0))) {
          primaryKey = entry.key; primaryLast = last;
        }
      }

      final primary = (groups[primaryKey]!..sort((a,b)=>a.item.date.compareTo(b.item.date)));
      _employerName = primaryKey;
      _lastSalaryDate = primary.last.item.date;

      // build “other employers” list for chips
      _otherEmployers = groups.entries
          .where((e)=>e.key != primaryKey)
          .map((e)=> MapEntry(e.key, e.value.length))
          .toList()
        ..sort((a,b)=> b.value.compareTo(a.value));

      // ---------- cadence & amounts ----------
      final diffs = <int>[];
      final amounts = <double>[];
      for (int idx=0; idx<primary.length; idx++) {
        amounts.add(primary[idx].item.amount);
        if (idx>0) {
          diffs.add(primary[idx].item.date.difference(primary[idx-1].item.date).inDays.abs());
        }
      }
      diffs.sort();
      _medianDays = diffs.isEmpty
          ? 30
          : (diffs.length.isOdd ? diffs[diffs.length ~/ 2]
          : ((diffs[diffs.length ~/ 2 - 1] + diffs[diffs.length ~/ 2]) / 2).round());

      // avg salary (last 3)
      final last3 = amounts.sublist(max(0, amounts.length - 3));
      _avgSalary = last3.fold<double>(0.0, (a,b)=>a+b) / max(1, last3.length);

      // variability (% std dev on last up to 6 entries)
      final sample = amounts.sublist(max(0, amounts.length - 6));
      _amountStdPct = _std(sample) / (sample.isEmpty ? 1 : (sample.reduce((a,b)=>a+b)/sample.length)) * 100.0;

      // streak = consecutive months containing at least one salary (permit early window)
      _streakMonths = _computeStreak(primary.map((r)=>r.item.date).toList(), earlyDays: _earlyDays);

      // ---------- India-friendly payday window ----------
      // If cadence looks monthly, anchor to next 1st, else use last + median
      if (_isMonthly(_medianDays)) {
        final anchor = _nextMonthFirst(DateTime.now());
        _windowEnd = anchor;
        _windowStart = anchor.subtract(Duration(days: _earlyDays.clamp(0, 5)));
        _nextPredicted = anchor;
      } else {
        // fallback: rolling “last + median” with early window
        var next = _lastSalaryDate!.add(Duration(days: _medianDays));
        final today = DateTime.now();
        while (!next.isAfter(today)) {
          next = next.add(Duration(days: _medianDays));
        }
        _nextPredicted = next;
        _windowEnd = next;
        _windowStart = next.subtract(Duration(days: _earlyDays.clamp(0, 5)));
      }

      // ---------- confidence ----------
      _confidence = _scoreConfidence(
        hits: primary.length,
        monthly: _isMonthly(_medianDays),
        stdPct: _amountStdPct.isFinite ? _amountStdPct : 100,
        streak: _streakMonths,
      );

      setState(() {
        _running = false;
        _done = true;
        _status = 'Prediction ready.';
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

  // -------------------- Helpers --------------------
  bool _isMonthly(int medianDays) => medianDays >= 27 && medianDays <= 34;

  String _employerFrom(Map<String, dynamic> raw, String note) {
    // prefer brainMeta.employer if your enricher writes it
    final meta = (raw['brainMeta'] as Map?)?.cast<String, dynamic>();
    final m = (meta?['employer'] as String?) ?? (raw['label'] as String?) ?? '';
    if (m.trim().isNotEmpty) return _title(m.trim());

    final n = note;
    // common SMS/email patterns
    final by = RegExp(r'\b(by|from|frm)\s+([A-Za-z0-9&.\- ]{3,})', caseSensitive: false).firstMatch(n);
    if (by != null) {
      final name = by.group(2)!.replaceAll(RegExp(r'\s{2,}'), ' ').trim();
      if (name.isNotEmpty) return _title(name);
    }
    final cmp = RegExp(r'\b([A-Z][A-Z0-9.&\- ]{3,})\b').firstMatch(n.toUpperCase());
    if (cmp != null) return _title(cmp.group(1)!);
    return 'Salary';
  }

  int _computeStreak(List<DateTime> dates, {required int earlyDays}) {
    if (dates.isEmpty) return 0;
    dates.sort();
    // convert to month-buckets; a hit counts if within [1st-earlyDays .. 1st]
    final hits = <String>{};
    for (final d in dates) {
      // treat credits on (1st - earlyDays .. 1st) as month of the anchor (1st)
      final anchor = DateTime(d.year, d.month, 1);
      final earlyStart = anchor.subtract(Duration(days: earlyDays));
      final monthKey = (d.isAfter(earlyStart) && !d.isAfter(anchor))
          ? '${anchor.year}-${anchor.month.toString().padLeft(2, '0')}'
          : '${d.year}-${d.month.toString().padLeft(2, '0')}';
      hits.add(monthKey);
    }
    // count backward consecutive months ending at current month (or previous, if we’re still before 1st+early)
    final now = DateTime.now();
    DateTime cursor = DateTime(now.year, now.month, 1);
    // If today is within early window for next month, we still count current month as pending
    int streak = 0;
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
    final m = xs.reduce((a,b)=>a+b) / xs.length;
    final v = xs.fold<double>(0, (a,x)=> a + pow(x - m, 2)) / (xs.length - 1);
    return sqrt(v);
  }

  double _scoreConfidence({required int hits, required bool monthly, required double stdPct, required int streak}) {
    double s = 0.4;                 // base
    if (hits >= 3) s += 0.2;
    if (monthly) s += 0.25;
    if (stdPct <= 10) s += 0.1;     // fairly stable amount
    if (streak >= 3) s += 0.05;
    return s.clamp(0.0, 0.99);
  }

  DateTime _nextMonthFirst(DateTime from) {
    final y = from.year, m = from.month;
    return (m == 12) ? DateTime(y + 1, 1, 1) : DateTime(y, m + 1, 1);
  }

  // -------------------- UI bits --------------------
  Future<void> _changeEarlyDays() async {
    final chosen = await showModalBottomSheet<int>(
      context: context,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('Early credit window (India)', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text('Many salaries arrive a few days before 1st due to weekends/bank processing.'),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: List.generate(6, (i) => i).map((d) =>
                  ChoiceChip(
                    label: Text('$d days early'),
                    selected: _earlyDays == d,
                    onSelected: (_) => Navigator.pop(ctx, d),
                  ),
              ).toList(),
            ),
            const SizedBox(height: 10),
          ]),
        ),
      ),
    );
    if (chosen != null) {
      setState(() => _earlyDays = chosen);
      // recompute the window quickly if we already have a predicted anchor
      if (_nextPredicted != null) {
        setState(() {
          _windowEnd = _nextPredicted;
          _windowStart = _nextPredicted!.subtract(Duration(days: _earlyDays));
        });
      }
    }
  }

  Widget _chip(BuildContext ctx, String t) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: Theme.of(ctx).colorScheme.primary.withValues(alpha: 0.08),
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
      color: Theme.of(ctx).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(i, size: 16),
      const SizedBox(width: 6),
      Text('$t: $v'),
    ]),
  );

  Widget _congrats(BuildContext ctx) {
    final msg = _salaryHits == 0
        ? 'No clear salary pattern found yet. Link email or add a few months to learn.'
        : 'Likely pay window: ${_ddmmyy(_windowStart!)} → ${_ddmmyy(_windowEnd!)} · Avg ₹${_fmt(_avgSalary)} · Confidence ${(_confidence*100).round()}%';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.green.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        const Icon(Icons.celebration_rounded),
        const SizedBox(width: 8),
        Expanded(child: Text(msg)),
      ]),
    );
  }

  // -------------------- formatters --------------------
  static String _fmt(double v) => v.toStringAsFixed(v.truncateToDouble()==v ? 0 : 2);
  static String _ddmmyy(DateTime d) => '${_tw(d.day)}/${_tw(d.month)}/${d.year%100}';
  static String _fmtTime(DateTime dt) => '${dt.year}-${_tw(dt.month)}-${_tw(dt.day)} ${_tw(dt.hour)}:${_tw(dt.minute)}';
  static String _tw(int n) => n<10 ? '0$n' : '$n';

  static String _title(String s) =>
      s.split(RegExp(r'\s+')).map((w)=> w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}').join(' ');
}
