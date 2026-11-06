import 'package:flutter/material.dart';

import '../app_state.dart';
import '../core/status_engine.dart';
import 'common.dart';
import 'number_detail_screen.dart';

enum _PendingFilter { all, notCalled, tried, doneToday }

/// The work list: every number still waiting for a call back, oldest first.
class PendingScreen extends StatefulWidget {
  const PendingScreen({super.key, required this.state});
  final AppState state;

  @override
  State<PendingScreen> createState() => _PendingScreenState();
}

class _PendingScreenState extends State<PendingScreen> {
  var _filter = _PendingFilter.all;

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    final pending = s.pending;
    final red = pending.where((p) => p.status == CallStatus.pending).length;
    final orange = pending.length - red;
    final today = startOfDay(DateTime.now()).millisecondsSinceEpoch;
    final doneToday = s.status.summaries
        .where((p) =>
            (p.status == CallStatus.calledBack || p.status == CallStatus.dismissed) &&
            (p.resolvedAt ?? 0) >= today)
        .toList()
      ..sort((a, b) => b.resolvedAt!.compareTo(a.resolvedAt!));

    final list = switch (_filter) {
      _PendingFilter.all => pending,
      _PendingFilter.notCalled => pending.where((p) => p.status == CallStatus.pending).toList(),
      _PendingFilter.tried => pending.where((p) => p.status == CallStatus.attempted).toList(),
      _PendingFilter.doneToday => doneToday,
    };

    return Column(children: [
      SizedBox(
        height: 52,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          children: [
            _chip('All pending (${pending.length})', _PendingFilter.all, null),
            _chip('Not called ($red)', _PendingFilter.notCalled, kRed),
            _chip('Tried ($orange)', _PendingFilter.tried, kOrange),
            _chip('Done today (${doneToday.length})', _PendingFilter.doneToday, kGreen),
          ],
        ),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: s.sync,
          child: list.isEmpty
              ? ListView(children: [
                  const SizedBox(height: 80),
                  EmptyState(
                    icon: _filter == _PendingFilter.doneToday
                        ? Icons.history
                        : Icons.check_circle_outline,
                    text: _filter == _PendingFilter.doneToday
                        ? 'Nothing called back yet today'
                        : 'No pending calls. Everyone has been called back.',
                  ),
                ])
              : ListView.separated(
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) => PendingTile(state: s, summary: list[i]),
                ),
        ),
      ),
    ]);
  }

  Widget _chip(String label, _PendingFilter f, Color? color) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          label: Text(label),
          selected: _filter == f,
          selectedColor: color?.withValues(alpha: 0.18),
          onSelected: (_) => setState(() => _filter = f),
        ),
      );
}

class PendingTile extends StatelessWidget {
  const PendingTile({super.key, required this.state, required this.summary});
  final AppState state;
  final NumberSummary summary;

  @override
  Widget build(BuildContext context) {
    final p = summary;
    final color = statusColor(p.status);
    final String subtitle;
    if (p.status.needsCallback) {
      final missed = '${p.openMissed} missed · first ${whenText(p.openSince!)}';
      subtitle = p.attempts > 0
          ? '$missed\nTried ${p.attempts}× · no answer'
          : '$missed · ${agoText(p.openSince!)}';
    } else {
      subtitle = '${statusLabel(p.status)} ${whenText(p.resolvedAt!)}'
          '${p.resolvedBy != null ? ' · ${p.resolvedBy}' : ''}';
    }

    return Dismissible(
      key: ValueKey('pending-${p.numberKey}'),
      direction:
          p.status.needsCallback ? DismissDirection.endToStart : DismissDirection.none,
      background: Container(
        color: kGrey,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 24),
        child: const Text('Not needed', style: TextStyle(color: Colors.white)),
      ),
      confirmDismiss: (_) async {
        await state.markNotNeeded(p.numberKey, p.displayNumber);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('${p.title} marked not needed'),
            action: SnackBarAction(label: 'Undo', onPressed: () => state.undoNotNeeded(p.numberKey)),
          ));
        }
        return false; // the list rebuilds from state
      },
      child: Container(
        decoration: BoxDecoration(border: Border(left: BorderSide(color: color, width: 5))),
        child: ListTile(
          isThreeLine: p.name != null || p.attempts > 0,
          leading: CircleAvatar(
            backgroundColor: color.withValues(alpha: 0.15),
            child: p.status.needsCallback
                ? Text('${p.openMissed}',
                    style: TextStyle(color: color, fontWeight: FontWeight.bold))
                : Icon(Icons.check, color: color),
          ),
          title: Text(p.title,
              style: TextStyle(fontWeight: FontWeight.w600, color: p.status.needsCallback ? color : null)),
          subtitle: Text(
              '${p.name != null ? '${p.displayNumber}\n' : ''}$subtitle'),
          trailing: CallButton(state: state, number: p.displayNumber),
          onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => NumberDetailScreen(state: state, numberKey: p.numberKey))),
        ),
      ),
    );
  }
}
