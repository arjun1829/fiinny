import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../app_state.dart';
import '../core/models.dart';
import '../core/status_engine.dart';
import 'common.dart';

/// Today's numbers, the pending count, the last 14 days and each phone's load.
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key, required this.state, required this.openPending});
  final AppState state;
  final VoidCallback openPending;

  @override
  Widget build(BuildContext context) {
    final s = state;
    final now = DateTime.now();
    final todayStart = startOfDay(now).millisecondsSinceEpoch;
    final today = s.calls.where((c) => c.timestamp >= todayStart && c.kind != CallKind.blocked).toList();
    final pending = s.pending;
    final red = pending.where((p) => p.status == CallStatus.pending).length;

    final answered = today.where((c) => c.kind == CallKind.incoming).length;
    final missed = today.where((c) => c.kind.isMissed).length;
    final outgoing = today.where((c) => c.kind == CallKind.outgoing).length;
    final uniqueToday = today.map((c) => c.numberKey).where((k) => k.isNotEmpty).toSet().length;
    final calledBackToday = s.status.summaries
        .where((p) => p.status == CallStatus.calledBack && (p.resolvedAt ?? 0) >= todayStart)
        .length;

    final weekAgo = now.subtract(const Duration(days: 7)).millisecondsSinceEpoch;
    final recentCallbacks = s.status.callbacks.where((c) => c.resolvedAt >= weekAgo).toList();
    final avgDelay = recentCallbacks.isEmpty
        ? null
        : Duration(
            milliseconds: recentCallbacks.map((c) => c.delay.inMilliseconds).reduce((a, b) => a + b) ~/
                recentCallbacks.length);

    // Per phone, today.
    final perPhone = <String, List<CallRecord>>{};
    for (final c in today) {
      perPhone.putIfAbsent(c.deviceName, () => []).add(c);
    }

    return RefreshIndicator(
      onRefresh: s.sync,
      child: ListView(padding: const EdgeInsets.all(12), children: [
        Card(
          color: pending.isEmpty ? kGreen.withValues(alpha: 0.1) : kRed.withValues(alpha: 0.08),
          child: InkWell(
            onTap: openPending,
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(children: [
                Text('${pending.length}',
                    style: TextStyle(
                        fontSize: 48,
                        fontWeight: FontWeight.bold,
                        color: pending.isEmpty ? kGreen : kRed)),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(pending.isEmpty ? 'All called back' : 'Still pending call back',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                    if (pending.isNotEmpty)
                      Text('$red not called · ${pending.length - red} tried, no answer\n'
                          'Oldest: ${whenText(pending.first.openSince!)}'),
                  ]),
                ),
                const Icon(Icons.chevron_right),
              ]),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text('Today · ${DateFormat('EEE d MMM').format(now)}',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 1.35,
          children: [
            _Tile('Total calls', today.length, kBlue),
            _Tile('Answered', answered, kGreen),
            _Tile('Missed', missed, kRed),
            _Tile('Outgoing', outgoing, kBlue),
            _Tile('Called back', calledBackToday, kGreen),
            _Tile('Unique numbers', uniqueToday, kGrey),
          ],
        ),
        if (avgDelay != null)
          Card(
            child: ListTile(
              leading: const Icon(Icons.timer_outlined),
              title: Text('Average call-back time: ${delayText(avgDelay)}'),
              subtitle: Text('Last 7 days · ${recentCallbacks.length} missed calls handled'),
            ),
          ),
        const SizedBox(height: 8),
        Text('Last 14 days', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Card(child: Padding(padding: const EdgeInsets.all(12), child: _DailyChart(calls: s.calls))),
        if (perPhone.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text('By phone today', style: Theme.of(context).textTheme.titleMedium),
          Card(
            child: Column(children: [
              for (final e in perPhone.entries)
                ListTile(
                  leading: const Icon(Icons.smartphone),
                  title: Text(e.key),
                  subtitle: Text(
                      '${e.value.where((c) => c.kind == CallKind.incoming).length} answered · '
                      '${e.value.where((c) => c.kind.isMissed).length} missed · '
                      '${e.value.where((c) => c.kind == CallKind.outgoing).length} outgoing'),
                  trailing: Text('${e.value.length}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ),
            ]),
          ),
        ],
        const SizedBox(height: 8),
        Text('${s.calls.length} calls stored · ${s.status.summaries.length} numbers',
            textAlign: TextAlign.center, style: const TextStyle(color: kGrey, fontSize: 12)),
      ]),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile(this.label, this.value, this.color);
  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) => Card(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text('$value', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: color)),
          Text(label, style: const TextStyle(fontSize: 12), textAlign: TextAlign.center),
        ]),
      );
}

/// Stacked bars per day: answered (green) + outgoing (blue) + missed (red).
class _DailyChart extends StatelessWidget {
  const _DailyChart({required this.calls});
  final List<CallRecord> calls;

  @override
  Widget build(BuildContext context) {
    final today = startOfDay(DateTime.now());
    final days = [for (var i = 13; i >= 0; i--) today.subtract(Duration(days: i))];
    final counts = {for (final d in days) d: [0, 0, 0]};
    for (final c in calls) {
      final d = startOfDay(c.time);
      final row = counts[d];
      if (row == null || c.kind == CallKind.blocked) continue;
      if (c.kind == CallKind.incoming) {
        row[0]++;
      } else if (c.kind == CallKind.outgoing) {
        row[1]++;
      } else {
        row[2]++;
      }
    }
    final maxTotal = counts.values.map((r) => r[0] + r[1] + r[2]).fold(1, (a, b) => a > b ? a : b);
    const height = 140.0;

    return Column(children: [
      SizedBox(
        height: height + 34,
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          for (final d in days)
            Expanded(
              child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                Text('${counts[d]!.reduce((a, b) => a + b)}', style: const TextStyle(fontSize: 9)),
                const SizedBox(height: 2),
                for (final (i, color) in [(2, kRed), (1, kBlue), (0, kGreen)])
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    height: height * counts[d]![i] / maxTotal,
                    color: color,
                  ),
                const SizedBox(height: 4),
                Text(DateFormat('d').format(d), style: const TextStyle(fontSize: 10)),
              ]),
            ),
        ]),
      ),
      const SizedBox(height: 8),
      const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        _Legend(kGreen, 'Answered'),
        _Legend(kBlue, 'Outgoing'),
        _Legend(kRed, 'Missed'),
      ]),
    ]);
  }
}

class _Legend extends StatelessWidget {
  const _Legend(this.color, this.label);
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Row(children: [
          Container(width: 10, height: 10, color: color),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(fontSize: 12)),
        ]),
      );
}
