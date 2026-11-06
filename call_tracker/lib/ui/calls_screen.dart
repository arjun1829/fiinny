import 'package:flutter/material.dart';

import '../app_state.dart';
import '../core/models.dart';
import 'common.dart';
import 'export.dart';
import 'number_detail_screen.dart';

enum _KindFilter { all, missed, incoming, outgoing }

/// Every call from every phone, one line each, with filters and export.
class CallsScreen extends StatefulWidget {
  const CallsScreen({super.key, required this.state});
  final AppState state;

  @override
  State<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends State<CallsScreen> {
  var _kind = _KindFilter.all;
  String? _device;
  DateTimeRange? _range;
  var _onlyPending = false;
  final _search = TextEditingController();

  List<CallRecord> _filtered() {
    final s = widget.state;
    final q = _search.text.trim().toLowerCase();
    final qDigits = q.replaceAll(RegExp(r'\D'), '');
    final from = _range?.start.millisecondsSinceEpoch;
    final to = _range == null
        ? null
        : startOfDay(_range!.end).add(const Duration(days: 1)).millisecondsSinceEpoch;
    return s.calls.where((c) {
      if (c.kind == CallKind.blocked && _kind != _KindFilter.all) return false;
      switch (_kind) {
        case _KindFilter.missed:
          if (!c.kind.isMissed) return false;
        case _KindFilter.incoming:
          if (c.kind != CallKind.incoming) return false;
        case _KindFilter.outgoing:
          if (c.kind != CallKind.outgoing) return false;
        case _KindFilter.all:
          break;
      }
      if (_device != null && c.deviceName != _device) return false;
      if (from != null && (c.timestamp < from || c.timestamp >= to!)) return false;
      if (_onlyPending && !(s.byNumber[c.numberKey]?.status.needsCallback ?? false)) return false;
      if (q.isNotEmpty) {
        final name = (s.byNumber[c.numberKey]?.name ?? c.cachedName ?? '').toLowerCase();
        final numberHit = qDigits.isNotEmpty && c.rawNumber.replaceAll(RegExp(r'\D'), '').contains(qDigits);
        if (!name.contains(q) && !numberHit) return false;
      }
      return true;
    }).toList();
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2015),
      lastDate: now,
      initialDateRange: _range ?? DateTimeRange(start: startOfDay(now), end: now),
    );
    if (r != null) setState(() => _range = r);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    final calls = _filtered();
    final devices = s.calls.map((c) => c.deviceName).toSet().toList()..sort();

    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: Row(children: [
          Expanded(
            child: TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                isDense: true,
                prefixIcon: const Icon(Icons.search),
                hintText: 'Search name or number',
                border: const OutlineInputBorder(),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () => setState(_search.clear)),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Export to Excel (CSV)',
            icon: const Icon(Icons.file_download_outlined),
            onPressed: calls.isEmpty ? null : () => exportCalls(s, calls),
          ),
        ]),
      ),
      SizedBox(
        height: 52,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          children: [
            for (final k in _KindFilter.values)
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  label: Text(switch (k) {
                    _KindFilter.all => 'All',
                    _KindFilter.missed => 'Missed',
                    _KindFilter.incoming => 'Answered',
                    _KindFilter.outgoing => 'Outgoing',
                  }),
                  selected: _kind == k,
                  onSelected: (_) => setState(() => _kind = k),
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                label: const Text('Pending only'),
                selected: _onlyPending,
                selectedColor: kRed.withValues(alpha: 0.18),
                onSelected: (v) => setState(() => _onlyPending = v),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: InputChip(
                avatar: const Icon(Icons.date_range, size: 18),
                label: Text(_range == null
                    ? 'Any date'
                    : '${dateText(_range!.start)} – ${dateText(_range!.end)}'),
                selected: _range != null,
                onPressed: _pickRange,
                onDeleted: _range == null ? null : () => setState(() => _range = null),
              ),
            ),
            if (devices.length > 1)
              PopupMenuButton<String?>(
                initialValue: _device,
                onSelected: (v) => setState(() => _device = v),
                itemBuilder: (_) => [
                  const PopupMenuItem(value: null, child: Text('All phones')),
                  for (final d in devices) PopupMenuItem(value: d, child: Text(d)),
                ],
                child: Chip(
                  avatar: const Icon(Icons.smartphone, size: 18),
                  label: Text(_device ?? 'All phones'),
                ),
              ),
          ],
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text('${calls.length} calls', style: const TextStyle(color: kGrey, fontSize: 12)),
        ),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: s.sync,
          child: calls.isEmpty
              ? ListView(children: const [
                  SizedBox(height: 80),
                  EmptyState(icon: Icons.call, text: 'No calls match these filters'),
                ])
              : ListView.builder(
                  itemCount: calls.length,
                  itemBuilder: (_, i) => _CallTile(state: s, call: calls[i]),
                ),
        ),
      ),
    ]);
  }
}

class _CallTile extends StatelessWidget {
  const _CallTile({required this.state, required this.call});
  final AppState state;
  final CallRecord call;

  @override
  Widget build(BuildContext context) {
    final summary = state.byNumber[call.numberKey];
    final name = summary?.name ?? call.cachedName;
    final number = call.rawNumber.isEmpty ? 'Private number' : call.rawNumber;
    return ListTile(
      leading: Stack(clipBehavior: Clip.none, children: [
        CircleAvatar(
          backgroundColor: kindColor(call.kind).withValues(alpha: 0.12),
          child: Icon(kindIcon(call.kind), color: kindColor(call.kind), size: 20),
        ),
        if (summary != null)
          Positioned(right: -2, bottom: -2, child: StatusDot(summary.status, size: 12)),
      ]),
      title: Text(name ?? number,
          style: TextStyle(
              fontWeight: FontWeight.w600, color: call.kind.isMissed ? kRed : null)),
      subtitle: Text([
        if (name != null) number,
        '${call.kind.label} ${durationText(call.duration)}'.trim(),
        call.deviceName,
        if (call.sim != null) call.sim!,
      ].join(' · ')),
      trailing: Text(whenText(call.timestamp), style: const TextStyle(fontSize: 12)),
      onTap: call.numberKey.isEmpty
          ? null
          : () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => NumberDetailScreen(state: state, numberKey: call.numberKey))),
    );
  }
}
