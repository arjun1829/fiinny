// lib/screens/goal_screen.dart
import 'dart:async';
import 'dart:math' show max;
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/ads/ads_shell.dart';
import '../models/goal_model.dart';
import '../services/goal_service.dart';
import '../widgets/add_goal_dialog.dart';

// Keep if you like your diamond card look; safe to remove if unused
import '../themes/custom_card.dart';

enum _SortBy { nearestDue, progressDesc, amountRemainingDesc, createdDesc }

class GoalsScreen extends StatefulWidget {
  final String userId;
  const GoalsScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<GoalsScreen> createState() => _GoalsScreenState();
}

class _GoalsScreenState extends State<GoalsScreen> {
  final _currency = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  final _currencyCompact =
  NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  final _searchCtrl = TextEditingController();

  // Filters
  String? _priorityFilter; // Low / Medium / High
  String? _categoryFilter; // Travel / Gadget / ...
  bool _dueSoonOnly = false; // <= 30 days and not achieved
  _SortBy _sortBy = _SortBy.nearestDue;

  // Which segment is visible
  String _segment = 'active'; // 'active' | 'achieved' | 'archived'

  // Local snapshot
  List<GoalModel> _latest = [];

  // Quotes (auto-rotate)
  static const _quotes = <String>[
    "Small steps. Big wins.",
    "Pay yourself first — even ₹50 counts.",
    "Today’s consistency beats tomorrow’s plan.",
    "Your money should have a mission.",
    "Save like you mean it. Spend like you planned it.",
  ];
  int _quoteIndex = 0;
  Timer? _quoteTimer;

  Color get _brand => const Color(0xFF09857a);

  @override
  void initState() {
    super.initState();
    _quoteTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted) return;
      setState(() => _quoteIndex = (_quoteIndex + 1) % _quotes.length);
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _quoteTimer?.cancel();
    super.dispose();
  }

  Future<void> _showAddGoalDialog() async {
    await showDialog(
      context: context,
      builder: (ctx) => AddGoalDialog(
        onAdd: (GoalModel goal) async {
          await GoalService().addGoal(widget.userId, goal);
        },
      ),
    );
  }

  Future<void> _onRefresh() async {
    setState(() {});
    await Future.delayed(const Duration(milliseconds: 350));
  }

  // ------------------------ Filtering & Sorting -------------------------------

  List<GoalModel> _applyFilters(String tab, List<GoalModel> all) {
    // Partition by tab
    final active = all.where((g) {
      final st = g.status;
      return (st == GoalStatus.active || st == GoalStatus.paused) && !g.isAchieved && !g.archived;
    }).toList();

    final achieved = all.where((g) => g.isAchieved || g.status == GoalStatus.completed).toList();
    final archived = all.where((g) => g.archived || g.status == GoalStatus.archived).toList();

    List<GoalModel> list;
    switch (tab) {
      case 'active':
        list = active;
        break;
      case 'achieved':
        list = achieved;
        break;
      case 'archived':
        list = archived;
        break;
      default:
        list = active;
    }

    // Search
    final q = _searchCtrl.text.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list.where((g) {
        final hay =
        '${g.title} ${g.category ?? ""} ${g.priority ?? ""} ${g.notes ?? ""} ${g.emoji ?? ""}'
            .toLowerCase();
        return hay.contains(q);
      }).toList();
    }

    // Priority
    if (_priorityFilter != null) {
      list = list
          .where((g) => (g.priority ?? '').toLowerCase() == _priorityFilter!.toLowerCase())
          .toList();
    }

    // Category
    if (_categoryFilter != null) {
      list = list.where((g) => (g.category ?? '') == _categoryFilter).toList();
    }

    // Due soon
    if (_dueSoonOnly) {
      list = list.where((g) => !g.isAchieved && g.daysRemaining <= 30).toList();
    }

    // Sort
    list.sort((a, b) {
      switch (_sortBy) {
        case _SortBy.nearestDue:
          return a.daysRemaining.compareTo(b.daysRemaining);
        case _SortBy.progressDesc:
          return b.progress.compareTo(a.progress);
        case _SortBy.amountRemainingDesc:
          return b.amountRemaining.compareTo(a.amountRemaining);
        case _SortBy.createdDesc:
          final ad = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
          final bd = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
          return bd.compareTo(ad);
      }
    });

    return list;
  }

  Map<String, int> _counts(List<GoalModel> all) {
    final active = all.where((g) {
      final st = g.status;
      return (st == GoalStatus.active || st == GoalStatus.paused) && !g.isAchieved && !g.archived;
    }).length;
    final achieved = all.where((g) => g.isAchieved || g.status == GoalStatus.completed).length;
    final archived = all.where((g) => g.archived || g.status == GoalStatus.archived).length;
    return {'active': active, 'achieved': achieved, 'archived': archived};
  }

  // ------------------------------ Actions ------------------------------------

  Future<void> _addProgressSheet(GoalModel g) async {
    final ctrl = TextEditingController();
    final result = await showModalBottomSheet<double>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 12,
            left: 16,
            right: 16,
            top: 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Add to "${g.title}"',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 10),
              TextField(
                controller: ctrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: "Amount (₹)",
                  prefixIcon: Icon(Icons.savings_rounded),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Spacer(),
                  ElevatedButton(
                    onPressed: () {
                      final v = double.tryParse(ctrl.text.trim());
                      if (v != null && v > 0) Navigator.pop(ctx, v);
                    },
                    child: const Text("Add"),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );

    if (result != null) {
      try {
        await GoalService()
            .incrementSavedAmount(widget.userId, g.id, result, clampToTarget: true);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Added ₹${result.toStringAsFixed(0)} to '${g.title}'")),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Failed to add progress: $e")),
          );
        }
      }
    }
  }

  Future<void> _confirmAndDelete(GoalModel g) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Delete goal?"),
        content: Text("This will permanently remove '${g.title}'."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Cancel")),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("Delete")),
        ],
      ),
    );
    if (ok == true) {
      try {
        await GoalService().deleteGoal(widget.userId, g.id);
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Delete failed: $e")),
          );
        }
      }
    }
  }

  // -------------------------------- UI ---------------------------------------

  @override
  Widget build(BuildContext context) {
    final brand = _brand;

    return Scaffold(
      backgroundColor: Colors.grey[50],
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddGoalDialog,
        backgroundColor: brand,
        child: const Icon(Icons.add),
        tooltip: "Add Goal",
      ),
      body: StreamBuilder<List<GoalModel>>(
        stream: GoalService().goalsStream(widget.userId),
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final bottomInset = context.adsBottomPadding(extra: 24);
          _latest = snap.data ?? [];
          final counts = _counts(_latest);

          // current list for selected segment (used for summary + list)
          final list = _applyFilters(_segment, _latest);

          // analytics for summary
          final int totalGoals = list.length;
          final double totalSaved = list.fold(0.0, (a, g) => a + g.savedAmount);
          final double totalTarget = list.fold(0.0, (a, g) => a + g.targetAmount);
          final double pctOverall =
          totalTarget > 0 ? (totalSaved / totalTarget).clamp(0.0, 1.0) : 0.0;

          // extras for smarter summary
          final int dueSoonCount =
              list.where((g) => !g.isAchieved && g.daysRemaining <= 30 && !g.isOverdue).length;
          final int overdueCount = list.where((g) => !g.isAchieved && g.isOverdue).length;
          final double needPerMonth = _requiredPerMonthForAll(list);

          return RefreshIndicator(
            onRefresh: _onRefresh,
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
              slivers: [
                // Header (glassy, bigger top)
                SliverToBoxAdapter(
                  child: _Header(brand: brand, quote: _quotes[_quoteIndex]),
                ),

                // Segments (compact + counts)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: _Segments(
                      segment: _segment,
                      counts: counts,
                      onChanged: (s) => setState(() => _segment = s),
                    ),
                  ),
                ),

                // Search + Filters
                SliverToBoxAdapter(child: _filtersBar(brand)),

                // Summary card (ring only on Active)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
                    child: _SummaryCard(
                      brand: brand,
                      title: switch (_segment) {
                        'active' => "Goals in Progress",
                        'achieved' => "Achieved Goals",
                        _ => "Archived Goals",
                      },
                      totalGoals: totalGoals,
                      totalSaved: totalSaved,
                      totalTarget: totalTarget,
                      showTarget: _segment == 'active',
                      progress: pctOverall,
                      currency: _currencyCompact,
                      // new extras
                      needPerMonth: needPerMonth,
                      dueSoon: dueSoonCount,
                      overdue: overdueCount,
                    ),
                  ),
                ),

                // List / Empty state
                if (list.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Image.asset('assets/images/goal_trophy.png', height: 110),
                          const SizedBox(height: 18),
                          Text(
                            switch (_segment) {
                              'active' => "No active goals yet!",
                              'achieved' => "No achieved goals yet!",
                              'archived' => "No archived goals.",
                              _ => "No goals.",
                            },
                            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 10),
                          ElevatedButton(onPressed: _showAddGoalDialog, child: const Text("Add Goal")),
                        ],
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(16, 2, 16, bottomInset),
                    sliver: SliverList.separated(
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (ctx, i) {
                        final g = list[i];
                        final cardChild = _goalTile(g, brand);
                        return CustomDiamondCard(
                          isDiamondCut: true,
                          borderRadius: 18,
                          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
                          child: cardChild,
                        );
                      },
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  // --------------------------- Helpers ------------------------------

  double _requiredPerMonthForAll(List<GoalModel> items) {
    final now = DateTime.now();
    double total = 0.0;
    for (final g in items) {
      if (g.isAchieved) continue;
      final daysLeft = g.targetDate.difference(now).inDays;
      final amtLeft = max(0.0, g.amountRemaining);
      if (daysLeft <= 0) continue;
      total += (amtLeft / daysLeft) * 30.0;
    }
    return total;
  }

  // --------------------------- Widgets & helpers ------------------------------

  Widget _filtersBar(Color brand) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
      child: Column(
        children: [
          // Search field
          TextField(
            controller: _searchCtrl,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: "Search goals…",
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _searchCtrl.text.isEmpty
                  ? null
                  : IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () {
                  _searchCtrl.clear();
                  setState(() {});
                },
              ),
              isDense: true,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 8),
          // Chips row
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _filterChip(
                  label: _priorityFilter == null ? "Priority" : "Priority: $_priorityFilter",
                  selected: _priorityFilter != null,
                  icon: Icons.low_priority_rounded,
                  onTap: () async {
                    final v = await _pickFrom(
                      title: "Priority",
                      options: const ["Low", "Medium", "High"],
                      current: _priorityFilter,
                    );
                    setState(() => _priorityFilter = v);
                  },
                  onClear: () => setState(() => _priorityFilter = null),
                ),
                const SizedBox(width: 8),
                _filterChip(
                  label: _categoryFilter == null ? "Category" : "Category: $_categoryFilter",
                  selected: _categoryFilter != null,
                  icon: Icons.category_rounded,
                  onTap: () async {
                    final cats = {
                      for (final g in _latest)
                        if ((g.category ?? '').isNotEmpty) g.category!
                    }.toList()
                      ..sort();
                    final v = await _pickFrom(
                      title: "Category",
                      options: cats.isEmpty
                          ? [
                        "Travel",
                        "Gadget",
                        "Emergency",
                        "Education",
                        "Health",
                        "Home",
                        "Vehicle",
                        "Other"
                      ]
                          : cats,
                      current: _categoryFilter,
                    );
                    setState(() => _categoryFilter = v);
                  },
                  onClear: () => setState(() => _categoryFilter = null),
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: const Text("Due soon (≤30d)"),
                  selected: _dueSoonOnly,
                  onSelected: (s) => setState(() => _dueSoonOnly = s),
                  selectedColor: brand.withOpacity(0.12),
                  visualDensity: VisualDensity.compact,
                ),
                const SizedBox(width: 8),
                // Sort
                ActionChip(
                  label: Text(_sortLabel(_sortBy)),
                  avatar: const Icon(Icons.sort_rounded, size: 18),
                  onPressed: () async {
                    final v = await showModalBottomSheet<_SortBy>(
                      context: context,
                      builder: (ctx) => SafeArea(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            ListTile(
                              leading: const Icon(Icons.schedule_rounded),
                              title: const Text("Nearest due"),
                              onTap: () => Navigator.pop(ctx, _SortBy.nearestDue),
                            ),
                            ListTile(
                              leading: const Icon(Icons.stacked_bar_chart_rounded),
                              title: const Text("Progress (high → low)"),
                              onTap: () => Navigator.pop(ctx, _SortBy.progressDesc),
                            ),
                            ListTile(
                              leading: const Icon(Icons.money_off_csred_outlined),
                              title: const Text("Amount remaining (high → low)"),
                              onTap: () =>
                                  Navigator.pop(ctx, _SortBy.amountRemainingDesc),
                            ),
                            ListTile(
                              leading: const Icon(Icons.fiber_new_rounded),
                              title: const Text("Created (new → old)"),
                              onTap: () => Navigator.pop(ctx, _SortBy.createdDesc),
                            ),
                          ],
                        ),
                      ),
                    );
                    if (v != null) setState(() => _sortBy = v);
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _sortLabel(_SortBy s) {
    switch (s) {
      case _SortBy.nearestDue:
        return "Nearest due";
      case _SortBy.progressDesc:
        return "Progress";
      case _SortBy.amountRemainingDesc:
        return "Amount remaining";
      case _SortBy.createdDesc:
        return "Newest";
    }
  }

  Widget _filterChip({
    required String label,
    required bool selected,
    required IconData icon,
    required VoidCallback onTap,
    required VoidCallback onClear,
  }) {
    return InputChip(
      label: Text(label),
      avatar: Icon(icon, size: 18),
      selected: selected,
      onPressed: onTap,
      onDeleted: selected ? onClear : null,
      deleteIcon: const Icon(Icons.close_rounded),
      selectedColor: Theme.of(context).colorScheme.primary.withOpacity(0.12),
      visualDensity: VisualDensity.compact,
    );
  }

  Future<String?> _pickFrom({
    required String title,
    required List<String> options,
    required String? current,
  }) async {
    return await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold))),
            ...options.map((o) => RadioListTile<String>(
              value: o,
              groupValue: current,
              onChanged: (v) => Navigator.pop(ctx, v),
              title: Text(o),
            )),
            ListTile(
              leading: const Icon(Icons.clear_rounded),
              title: const Text("Clear"),
              onTap: () => Navigator.pop(ctx, null),
            ),
          ],
        ),
      ),
    );
  }

  // ----------------------------- Goal Tile ------------------------------------

  Widget _goalTile(GoalModel g, Color brand) {
    final progressPct = (g.progress * 100).toStringAsFixed(1);
    final days = g.daysRemaining;
    final overdue = g.isOverdue;
    final achieved = g.isAchieved;

    final statusColor = switch (g.status) {
      GoalStatus.active => Colors.teal,
      GoalStatus.paused => Colors.orange,
      GoalStatus.completed => Colors.green,
      GoalStatus.archived => Colors.grey,
    };

    return ListTile(
      contentPadding: const EdgeInsets.only(left: 2, right: 4, top: 4, bottom: 4),
      leading: Text(g.emoji ?? "🎯", style: const TextStyle(fontSize: 32)),
      // FIX overflow: Column + Wrap (chips) instead of a single Row
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(g.title, style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            runSpacing: -6,
            children: [
              if ((g.category ?? '').isNotEmpty)
                Chip(
                  label: Text(g.category!),
                  backgroundColor: Colors.teal[50],
                  visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  labelStyle: const TextStyle(fontSize: 12),
                ),
              if ((g.priority ?? '').isNotEmpty)
                Chip(
                  label: Text(g.priority!),
                  backgroundColor: Colors.orange[50],
                  visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  labelStyle: const TextStyle(fontSize: 12),
                ),
            ],
          ),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            runSpacing: -6,
            children: [
              _pill(
                icon: Icons.date_range_rounded,
                text: "By ${DateFormat("d MMM, yyyy").format(g.targetDate)}",
                bg: Colors.blue[50],
              ),
              if (!achieved)
                _pill(
                  icon: overdue ? Icons.warning_amber_rounded : Icons.timelapse_rounded,
                  text: overdue ? "Overdue" : "${days}d left",
                  bg: overdue ? Colors.red[50] : Colors.amber[50],
                ),
              _pill(
                icon: Icons.account_balance_wallet_rounded,
                text: "Target ${_currency.format(g.targetAmount)}",
                bg: Colors.grey[100],
              ),
              if (!achieved && g.amountRemaining > 0)
                _pill(
                  icon: Icons.savings_rounded,
                  text: "Need ~ ${_currency.format(g.requiredPerMonth)}/mo",
                  bg: Colors.green[50],
                ),
              if (g.goalType != null)
                _pill(
                  icon: Icons.info_outline_rounded,
                  text: g.goalType!.name,
                  bg: Colors.purple[50],
                ),
            ],
          ),
          if ((g.notes ?? '').trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6.0),
              child: Text(
                g.notes!,
                style: const TextStyle(fontSize: 12, color: Colors.black54),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          if ((g.dependencies ?? []).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6.0),
              child: Wrap(
                spacing: 5,
                runSpacing: -6,
                children: g.dependencies!
                    .map((dep) => Chip(
                  label: Text(dep, style: const TextStyle(fontSize: 11)),
                  backgroundColor: Colors.green[50],
                  visualDensity: VisualDensity.compact,
                ))
                    .toList(),
              ),
            ),
          const SizedBox(height: 8),
          LinearProgressIndicator(
            value: g.progress,
            backgroundColor: Colors.grey[200],
            color: achieved ? Colors.green : brand,
            minHeight: 7,
          ),
          const SizedBox(height: 5),
          Row(
            children: [
              Text(
                "$progressPct% completed",
                style: TextStyle(
                  fontSize: 12,
                  color: achieved ? Colors.green : brand,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  g.status.name,
                  style: TextStyle(
                    color: statusColor[800],
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
      trailing: PopupMenuButton<String>(
        tooltip: "Actions",
        onSelected: (v) async {
          try {
            switch (v) {
              case 'add':
                await _addProgressSheet(g);
                break;
              case 'pause':
                await GoalService().pauseGoal(widget.userId, g.id);
                break;
              case 'resume':
                await GoalService().resumeGoal(widget.userId, g.id);
                break;
              case 'complete':
                await GoalService().markCompleted(widget.userId, g.id, snapSavedToTarget: true);
                break;
              case 'archive':
                await GoalService().archiveGoal(widget.userId, g.id);
                break;
              case 'unarchive':
                await GoalService().unarchiveGoal(widget.userId, g.id);
                break;
              case 'delete':
                await _confirmAndDelete(g);
                break;
            }
          } catch (e) {
            if (mounted) {
              ScaffoldMessenger.of(context)
                  .showSnackBar(SnackBar(content: Text("Action failed: $e")));
            }
          }
        },
        itemBuilder: (ctx) {
          final items = <PopupMenuEntry<String>>[];
          if (!g.isAchieved && !g.archived) {
            items.add(const PopupMenuItem(
              value: 'add',
              child: ListTile(
                  leading: Icon(Icons.add_rounded), title: Text('Add progress'), dense: true),
            ));
          }
          if (g.status == GoalStatus.active) {
            items.add(const PopupMenuItem(
              value: 'pause',
              child: ListTile(
                  leading: Icon(Icons.pause_circle_rounded), title: Text('Pause'), dense: true),
            ));
          } else if (g.status == GoalStatus.paused) {
            items.add(const PopupMenuItem(
              value: 'resume',
              child: ListTile(
                  leading: Icon(Icons.play_circle_rounded), title: Text('Resume'), dense: true),
            ));
          }
          if (!g.isAchieved && !g.archived) {
            items.add(const PopupMenuItem(
              value: 'complete',
              child: ListTile(
                  leading: Icon(Icons.emoji_events_rounded),
                  title: Text('Mark completed'),
                  dense: true),
            ));
          }
          if (!g.archived) {
            items.add(const PopupMenuItem(
              value: 'archive',
              child: ListTile(
                  leading: Icon(Icons.archive_rounded), title: Text('Archive'), dense: true),
            ));
          } else {
            items.add(const PopupMenuItem(
              value: 'unarchive',
              child: ListTile(
                  leading: Icon(Icons.unarchive_rounded), title: Text('Unarchive'), dense: true),
            ));
          }
          items.add(const PopupMenuDivider());
          items.add(const PopupMenuItem(
            value: 'delete',
            child: ListTile(
              leading: Icon(Icons.delete_forever_rounded, color: Colors.red),
              title: Text('Delete'),
              dense: true,
            ),
          ));
          return items;
        },
      ),
    );
  }

  Widget _pill({required IconData icon, required String text, Color? bg}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: bg ?? Colors.grey[100],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.black87),
          const SizedBox(width: 6),
          Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// ======================= Header & Summary & Segments ==========================

class _Header extends StatelessWidget {
  final Color brand;
  final String quote;
  const _Header({Key? key, required this.brand, required this.quote}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Glassy, larger header with title + rotating quote
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [brand.withOpacity(0.10), Colors.white.withOpacity(0.0)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: ClipRRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Goals",
                  style: TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    color: Colors.grey.shade900,
                  ),
                ),
                const SizedBox(height: 6),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 350),
                  transitionBuilder: (child, anim) => FadeTransition(
                    opacity: anim,
                    child: SizeTransition(sizeFactor: anim, axisAlignment: -1, child: child),
                  ),
                  child: Text(
                    quote,
                    key: ValueKey(quote),
                    style: TextStyle(
                      color: brand,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final Color brand;
  final String title;
  final int totalGoals;
  final double totalSaved;
  final double totalTarget;
  final bool showTarget;
  final double progress; // 0..1
  final NumberFormat currency;

  // extras
  final double needPerMonth;
  final int dueSoon;
  final int overdue;

  const _SummaryCard({
    Key? key,
    required this.brand,
    required this.title,
    required this.totalGoals,
    required this.totalSaved,
    required this.totalTarget,
    required this.showTarget,
    required this.progress,
    required this.currency,
    required this.needPerMonth,
    required this.dueSoon,
    required this.overdue,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final pctText = (progress * 100).toStringAsFixed(0);

    final ring = SizedBox(
      width: 64,
      height: 64,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CircularProgressIndicator(
            value: progress,
            strokeWidth: 7,
            color: brand,
            backgroundColor: Colors.grey[300],
          ),
          Text("$pctText%", style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
        ],
      ),
    );

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: const [BoxShadow(color: Color(0x12000000), blurRadius: 10, offset: Offset(0, 4))],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Left: title + KPI chips
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _statChip(brand, icon: Icons.checklist_rounded, label: "Total", value: "$totalGoals"),
                    _statChip(brand, icon: Icons.savings_rounded, label: "Saved", value: currency.format(totalSaved)),
                    if (showTarget)
                      _statChip(brand, icon: Icons.flag_rounded, label: "Target", value: currency.format(totalTarget)),
                    _statChip(brand, icon: Icons.percent_rounded, label: "Coverage", value: "$pctText%"),
                    if (needPerMonth > 0)
                      _statChip(brand, icon: Icons.calendar_month_rounded, label: "Need/mo", value: currency.format(needPerMonth)),
                    _statChip(brand, icon: Icons.timelapse_rounded, label: "Due soon", value: "$dueSoon"),
                    _statChip(brand, icon: Icons.warning_amber_rounded, label: "Overdue", value: "$overdue"),
                  ],
                ),
                if (needPerMonth > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: brand.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: brand.withOpacity(0.14)),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.lightbulb_rounded, color: brand),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              "Save ~${currency.format(needPerMonth)}/month to hit your timelines.",
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          // Right: ring (active only)
          if (showTarget && totalTarget > 0) ring,
        ],
      ),
    );
  }

  Widget _statChip(Color brand,
      {required IconData icon, required String label, required String value}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: brand.withOpacity(.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: brand.withOpacity(.16)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: brand),
          const SizedBox(width: 6),
          Text("$label: ",
              style: TextStyle(fontSize: 12, color: Colors.grey.shade800, fontWeight: FontWeight.w700)),
          Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _Segments extends StatelessWidget {
  final String segment; // 'active' | 'achieved' | 'archived'
  final void Function(String) onChanged;
  final Map<String, int> counts;

  const _Segments({
    Key? key,
    required this.segment,
    required this.onChanged,
    required this.counts,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final brand = const Color(0xFF09857a);

    final keys = const ['active', 'achieved', 'archived'];
    final labels = {
      'active': 'Active',
      'achieved': 'Achieved',
      'archived': 'Archived',
    };
    final icons = {
      'active': Icons.play_circle_fill_rounded,
      'achieved': Icons.emoji_events_rounded,
      'archived': Icons.archive_rounded,
    };

    final isSelected = keys.map((k) => k == segment).toList();

    return SizedBox(
      height: 40, // compact single-line
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        child: ToggleButtons(
          isSelected: isSelected,
          onPressed: (i) => onChanged(keys[i]),
          borderRadius: BorderRadius.circular(10),
          renderBorder: true,
          borderColor: Colors.grey.shade300,
          selectedBorderColor: brand.withOpacity(.40),
          fillColor: brand.withOpacity(.12),
          selectedColor: brand,
          color: Colors.black87,
          constraints: const BoxConstraints(minHeight: 36),
          textStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
          children: keys.map((k) {
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icons[k], size: 16),
                  const SizedBox(width: 6),
                  Text("${labels[k]} (${counts[k] ?? 0})"),
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}
