// lib/group/group_chart_tab.dart
import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import 'group_member_balance_chart.dart';
import '../widgets/simple_bar_chart_widget.dart';
import 'group_balance_math.dart';

enum _TimeFilter { all, last30, last90, thisMonth, ytd, custom }

class GroupChartTab extends StatefulWidget {
  final String currentUserPhone;
  final List<FriendModel> members;
  final List<ExpenseItem> expenses;

  const GroupChartTab({
    super.key,
    required this.currentUserPhone,
    required this.members,
    required this.expenses,
  });

  @override
  State<GroupChartTab> createState() => _GroupChartTabState();
}

class _GroupChartTabState extends State<GroupChartTab> {
  _TimeFilter _time = _TimeFilter.all;
  DateTime? _from;
  DateTime? _to;
  String? _category; // null => All

  List<String> get _allCategories {
    final set = <String>{};
    for (final e in widget.expenses) {
      final c = (e.category ?? '').trim();
      if (c.isNotEmpty) {
        set.add(c);
      }
    }
    final list = set.toList()..sort();
    return list;
  }

  // ------ filtering ------
  bool _inRange(DateTime d) {
    if (_from != null && d.isBefore(_from!)) {
      return false;
    }
    if (_to != null && d.isAfter(_to!)) {
      return false;
    }
    return true;
  }

  List<ExpenseItem> _filteredExpenses() {
    // derive date window from _time if not custom
    final now = DateTime.now();
    DateTime? from, to;

    switch (_time) {
      case _TimeFilter.all:
        from = null;
        to = null;
        break;
      case _TimeFilter.last30:
        from = now.subtract(const Duration(days: 30));
        to = now;
        break;
      case _TimeFilter.last90:
        from = now.subtract(const Duration(days: 90));
        to = now;
        break;
      case _TimeFilter.thisMonth:
        from = DateTime(now.year, now.month, 1);
        to = DateTime(now.year, now.month + 1, 0, 23, 59, 59);
        break;
      case _TimeFilter.ytd:
        from = DateTime(now.year, 1, 1);
        to = now;
        break;
      case _TimeFilter.custom:
        from = _from;
        to = _to;
        break;
    }

    return widget.expenses.where((e) {
      final inDate = (from == null && to == null) ? true : _inRange(e.date);
      final inCat = (_category == null || (_category ?? '').isEmpty)
          ? true
          : (e.category ?? '') == _category;
      return inDate && inCat;
    }).toList();
  }

  Map<String, String> _displayNames() => {
        for (final m in widget.members)
          m.phone: (m.phone == widget.currentUserPhone ? 'You' : m.name)
      };

  Future<void> _pickCustomRange() async {
    final now = DateTime.now();
    final pickedFrom = await showDatePicker(
      context: context,
      initialDate: _from ?? DateTime(now.year, now.month, 1),
      firstDate: DateTime(now.year - 5),
      lastDate: now,
      helpText: 'Select start date',
    );
    if (pickedFrom == null) {
      return;
    }
    if (!mounted) return;
    final pickedTo = await showDatePicker(
      context: context,
      initialDate: _to ?? now,
      firstDate: pickedFrom,
      lastDate: now,
      helpText: 'Select end date',
    );
    if (pickedTo == null) {
      return;
    }
    if (!mounted) return;
    setState(() {
      _time = _TimeFilter.custom;
      _from = DateTime(pickedFrom.year, pickedFrom.month, pickedFrom.day);
      _to = DateTime(pickedTo.year, pickedTo.month, pickedTo.day, 23, 59, 59);
    });
  }

  void _resetFilters() {
    setState(() {
      _time = _TimeFilter.all;
      _from = null;
      _to = null;
      _category = null;
    });
  }

  Widget _card({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, 6),
          )
        ],
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: child,
    );
  }

  Widget _chip({
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return ChoiceChip(
      label: Text(
        label,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          color: selected ? Colors.white : Colors.teal.shade800,
        ),
      ),
      selected: selected,
      selectedColor: Colors.teal.shade700,
      backgroundColor: Colors.teal.withValues(alpha: .10),
      onSelected: (_) => onTap(),
      showCheckmark: false,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredExpenses();

    // compute net per member from filtered list
    final totals = computeMemberTotals(filtered);
    final net = {for (final e in totals.entries) e.key: e.value.net};

    final you = net[widget.currentUserPhone] ?? 0.0;
    final owe = you < 0 ? you.abs() : 0.0;
    final owed = you > 0 ? you : 0.0;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        // ---- Filters row ----
        _card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Filters',
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: Colors.teal.shade900)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _chip(
                    label: 'All',
                    selected: _time == _TimeFilter.all,
                    onTap: () => setState(() => _time = _TimeFilter.all),
                  ),
                  _chip(
                    label: '30d',
                    selected: _time == _TimeFilter.last30,
                    onTap: () => setState(() => _time = _TimeFilter.last30),
                  ),
                  _chip(
                    label: '90d',
                    selected: _time == _TimeFilter.last90,
                    onTap: () => setState(() => _time = _TimeFilter.last90),
                  ),
                  _chip(
                    label: 'This Month',
                    selected: _time == _TimeFilter.thisMonth,
                    onTap: () => setState(() => _time = _TimeFilter.thisMonth),
                  ),
                  _chip(
                    label: 'YTD',
                    selected: _time == _TimeFilter.ytd,
                    onTap: () => setState(() => _time = _TimeFilter.ytd),
                  ),
                  ActionChip(
                    label: const Text('Custom'),
                    avatar: const Icon(Icons.date_range, size: 16),
                    onPressed: _pickCustomRange,
                    backgroundColor: Colors.indigo.withValues(alpha: .08),
                  ),
                  if (_time == _TimeFilter.custom &&
                      (_from != null || _to != null))
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.indigo.withValues(alpha: .08),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        "${_from?.toLocal().toString().substring(0, 10) ?? '…'} → ${_to?.toLocal().toString().substring(0, 10) ?? '…'}",
                        style: TextStyle(
                            color: Colors.indigo.shade900,
                            fontWeight: FontWeight.w700),
                      ),
                    ),
                  const SizedBox(width: 6),
                  // Category dropdown
                  DropdownButtonHideUnderline(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      decoration: BoxDecoration(
                        color: Colors.orange.withValues(alpha: .08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: Colors.orange.withValues(alpha: .3)),
                      ),
                      child: DropdownButton<String>(
                        value: _category,
                        hint: const Text('Category'),
                        items: <DropdownMenuItem<String>>[
                          const DropdownMenuItem(
                              value: null, child: Text('All')),
                          ..._allCategories.map((c) =>
                              DropdownMenuItem(value: c, child: Text(c))),
                        ],
                        onChanged: (v) => setState(() => _category = v),
                      ),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _resetFilters,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Reset'),
                  ),
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // ---- Your overview bar ----
        _card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Your Overview',
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: Colors.teal.shade900)),
              const SizedBox(height: 10),
              // add small chips
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _miniChip(
                    color: Colors.green,
                    text: owed > 0
                        ? "Owed to you ₹${owed.toStringAsFixed(0)}"
                        : "No credit",
                    bg: Colors.green.withValues(alpha: .10),
                  ),
                  _miniChip(
                    color: Colors.redAccent,
                    text: owe > 0
                        ? "You owe ₹${owe.toStringAsFixed(0)}"
                        : "No dues",
                    bg: Colors.red.withValues(alpha: .10),
                  ),
                  _miniChip(
                    color: (owed - owe) >= 0
                        ? Colors.teal.shade800
                        : Colors.orange.shade800,
                    text: (owed - owe) >= 0
                        ? "Net +₹${(owed - owe).toStringAsFixed(0)}"
                        : "Net -₹${(owe - owed).toStringAsFixed(0)}",
                    bg: (owed - owe) >= 0
                        ? Colors.teal.withValues(alpha: .10)
                        : Colors.orange.withValues(alpha: .10),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 240,
                child: SimpleBarChartWidget(owe: owe, owed: owed),
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // ---- Members net chart ----
        _card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Members Net',
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: Colors.teal.shade900)),
              const SizedBox(height: 8),
              if (net.isEmpty || net.values.every((v) => v.abs() < 0.009))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Text('No data for selected filters.',
                      style: TextStyle(color: Colors.grey[700])),
                )
              else
                GroupMemberBalanceChart(
                  netByMember: net,
                  displayNames: _displayNames(),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _miniChip(
      {required Color color, required String text, required Color bg}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.circle, size: 8, color: color),
          const SizedBox(width: 6),
          Text(text,
              style: TextStyle(color: color, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
