// lib/screens/tx_day_details_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../widgets/unified_transaction_list.dart';
import '../widgets/dashboard_hero_ring.dart';
import '../widgets/animated_mint_background.dart';
import '../themes/custom_card.dart';

// ⬇️ Add your actual edit screens / routes
import 'edit_expense_screen.dart' show EditExpenseScreen;
// If you don't have this yet, create it or change the route below
// import 'edit_income_screen.dart' show EditIncomeScreen;

class TxDayDetailsScreen extends StatefulWidget {
  final String userPhone;
  const TxDayDetailsScreen({required this.userPhone, Key? key}) : super(key: key);

  @override
  State<TxDayDetailsScreen> createState() => _TxDayDetailsScreenState();
}

class _TxDayDetailsScreenState extends State<TxDayDetailsScreen> {
  DateTime _selectedDay = DateTime.now();

  List<ExpenseItem> _allExpenses = [];
  List<IncomeItem> _allIncomes = [];

  List<ExpenseItem> _dayExpenses = [];
  List<IncomeItem> _dayIncomes = [];

  double _credit = 0.0;
  double _debit = 0.0;

  // weekly strip data
  DateTime _weekStart = DateTime.now();
  List<Map<String, dynamic>> _weekData = []; // [{date, credit, debit}]

  // daily limit
  double? _dailyLimit;
  bool _savingLimit = false;

  // streams
  StreamSubscription<List<ExpenseItem>>? _expSub;
  StreamSubscription<List<IncomeItem>>? _incSub;

  @override
  void initState() {
    super.initState();
    _bindStreams();
    _loadDailyLimit();
    _recomputeForDay();
  }

  @override
  void dispose() {
    _expSub?.cancel();
    _incSub?.cancel();
    super.dispose();
  }

  void _bindStreams() {
    _expSub = ExpenseService()
        .getExpensesStream(widget.userPhone)
        .listen((exps) {
      _allExpenses = exps;
      _recomputeForDay();
    });

    _incSub = IncomeService()
        .getIncomesStream(widget.userPhone)
        .listen((incs) {
      _allIncomes = incs;
      _recomputeForDay();
    });
  }

  void _recomputeForDay() {
    final d0 = DateTime(_selectedDay.year, _selectedDay.month, _selectedDay.day);
    final d1 = d0.add(const Duration(days: 1));

    _dayExpenses = _allExpenses
        .where((e) => !e.date.isBefore(d0) && e.date.isBefore(d1))
        .toList();
    _dayIncomes = _allIncomes
        .where((i) => !i.date.isBefore(d0) && i.date.isBefore(d1))
        .toList();

    _credit = _dayIncomes.fold(0.0, (a, b) => a + b.amount);
    _debit = _dayExpenses.fold(0.0, (a, b) => a + b.amount);

    // compute Monday start for the selected week
    _weekStart = _selectedDay.subtract(Duration(days: _selectedDay.weekday - 1));
    _weekData = [];
    for (int i = 0; i < 7; i++) {
      final d = _weekStart.add(Duration(days: i));
      final s = DateTime(d.year, d.month, d.day);
      final e = s.add(const Duration(days: 1));

      final dayExp = _allExpenses.where((x) => !x.date.isBefore(s) && x.date.isBefore(e));
      final dayInc = _allIncomes.where((x) => !x.date.isBefore(s) && x.date.isBefore(e));

      final c = dayInc.fold(0.0, (a, b) => a + b.amount);
      final db = dayExp.fold(0.0, (a, b) => a + b.amount);

      _weekData.add({'date': d, 'credit': c, 'debit': db});
    }

    if (mounted) setState(() {});
  }

  void _shiftDay(int days) {
    _selectedDay = _selectedDay.add(Duration(days: days));
    _recomputeForDay();
  }

  // swipe handler (right = previous, left = next)
  void _onHorizontalSwipe(DragEndDetails details) {
    final v = details.primaryVelocity ?? 0.0;
    if (v > 200) {
      _shiftDay(-1);
    } else if (v < -200) {
      _shiftDay(1);
    }
  }

  String get _limitDocId => "${widget.userPhone}_D";

  Future<void> _loadDailyLimit() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('limits')
          .doc(_limitDocId)
          .get();
      if (!mounted) return;
      if (doc.exists && doc.data()?['limit'] != null) {
        _dailyLimit = (doc.data()!['limit'] as num?)?.toDouble();
      } else {
        _dailyLimit = null;
      }
      setState(() {});
    } catch (_) {/* ignore */}
  }

  Future<void> _editLimitDialog() async {
    final ctrl = TextEditingController(text: _dailyLimit?.toStringAsFixed(0) ?? '');
    final result = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Set Daily Limit"),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(hintText: "Enter limit amount (₹)"),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, 0.0),
              child: const Text("Remove")),
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () {
              final v = double.tryParse(ctrl.text.trim());
              if (v != null && v > 0) Navigator.pop(ctx, v);
            },
            child: const Text("Save"),
          ),
        ],
      ),
    );

    if (result == null) return;
    if (!mounted) return;
    setState(() => _savingLimit = true);
    try {
      if (result == 0.0) {
        await FirebaseFirestore.instance
            .collection('limits')
            .doc(_limitDocId)
            .delete();
        _dailyLimit = null;
      } else {
        await FirebaseFirestore.instance
            .collection('limits')
            .doc(_limitDocId)
            .set({
          'limit': result,
          'userId': widget.userPhone,
          'period': 'D',
          'updatedAt': FieldValue.serverTimestamp(),
        });
        _dailyLimit = result;
      }
      if (mounted) setState(() {});
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Failed to save limit: $e")),
      );
    }
    if (mounted) setState(() => _savingLimit = false);
  }

  double get _daySpendOnly => _dayExpenses.fold(0.0, (a, b) => a + b.amount);

  // 🔥 New: Premium Date Sheet (broad, pretty, not just green)
  Future<void> _openDateSheet() async {
    final credit = _credit;
    final debit = _debit;
    // choose accent dynamically
    final Color accent = (debit > credit)
        ? const Color(0xFFEF4444) // red-ish when more debit
        : const Color(0xFF3B82F6); // blue-ish when more credit

    final picked = await showModalBottomSheet<DateTime>(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) {
        DateTime temp = _selectedDay;
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header
              Container(
                margin: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [accent.withValues(alpha: .12), accent.withValues(alpha: .04)],
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: accent.withValues(alpha: .15)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.event_rounded, color: accent),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        "Pick a date",
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: accent.darken(),
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        DateFormat('EEE, d MMM').format(_selectedDay),
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: accent.darken(),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Quick chips
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ActionChip(
                      label: const Text("Today"),
                      onPressed: () => Navigator.pop(ctx, DateTime.now()),
                    ),
                    ActionChip(
                      label: const Text("Yesterday"),
                      onPressed: () => Navigator.pop(
                        ctx,
                        DateTime.now().subtract(const Duration(days: 1)),
                      ),
                    ),
                    ActionChip(
                      label: const Text("This Monday"),
                      onPressed: () {
                        final now = DateTime.now();
                        final monday = now.subtract(Duration(days: now.weekday - 1));
                        Navigator.pop(ctx, monday);
                      },
                    ),
                    ActionChip(
                      label: const Text("Month Start"),
                      onPressed: () {
                        final now = DateTime.now();
                        Navigator.pop(ctx, DateTime(now.year, now.month, 1));
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),

              // Calendar
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: CalendarDatePicker(
                  initialDate: _selectedDay,
                  firstDate: DateTime(2000),
                  lastDate: DateTime(2100),
                  onDateChanged: (d) => temp = d,
                ),
              ),
              const SizedBox(height: 8),

              // Buttons
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text("Cancel"),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: accent,
                          foregroundColor: Colors.white,
                        ),
                        onPressed: () => Navigator.pop(ctx, temp),
                        child: const Text("Apply"),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );

    if (picked != null) {
      _selectedDay = DateTime(picked.year, picked.month, picked.day);
      _recomputeForDay();
    }
  }

  @override
  Widget build(BuildContext context) {
    final periodLabel = DateFormat('EEE, d MMM').format(_selectedDay);

    return Scaffold(
      appBar: AppBar(
        title: const Text("Transaction details"),
        backgroundColor: Colors.white,
        elevation: 0,
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.pushNamed(context, '/add', arguments: widget.userPhone),
        child: const Icon(Icons.add),
      ),
      body: Stack(
        children: [
          const AnimatedMintBackground(),
          GestureDetector(
            onHorizontalDragEnd: _onHorizontalSwipe,
            behavior: HitTestBehavior.opaque,
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                // ✨ New: Wide, pretty, tappable date bar
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: _openDateSheet,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.black12),
                        gradient: LinearGradient(
                          colors: [
                            const Color(0xFF3B82F6).withValues(alpha: .06),
                            const Color(0xFF10B981).withValues(alpha: .06),
                            const Color(0xFFF59E0B).withValues(alpha: .06),
                          ],
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.calendar_today_rounded, color: Colors.grey[800]),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              periodLabel,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 16,
                              ),
                            ),
                          ),
                          Text(
                            "Change",
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: Colors.grey[700],
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Icon(Icons.expand_more_rounded),
                        ],
                      ),
                    ),
                  ),
                ),

                // weekly 7 mini rings (Mon -> Sun)
                if (_weekData.isNotEmpty)
                  SizedBox(
                    height: 84,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
                      itemCount: _weekData.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 6),
                      itemBuilder: (ctx, i) {
                        final d = _weekData[i]['date'] as DateTime;
                        final c = (_weekData[i]['credit'] as num).toDouble();
                        final deb = (_weekData[i]['debit'] as num).toDouble();

                        final isSelected =
                            d.year == _selectedDay.year &&
                                d.month == _selectedDay.month &&
                                d.day == _selectedDay.day;

                        return Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            SizedBox(
                              width: 46,
                              height: 46,
                              child: Material(
                                color: isSelected ? Colors.black.withValues(alpha: .04) : Colors.transparent,
                                borderRadius: BorderRadius.circular(999),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(999),
                                  onTap: () {
                                    _selectedDay = d;
                                    _recomputeForDay();
                                  },
                                  child: Center(
                                      child: DashboardHeroRing(
                                        credit: c,
                                        debit: deb,
                                        period: "",
                                        showHeader: false,
                                        ringSize: 44,
                                        strokeWidth: 4,
                                        tappable: false,
                                      ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              DateFormat('dd/MM').format(d),
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: isSelected ? Colors.black : Colors.grey[700],
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),

                // big ring for the selected day
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: DashboardHeroRing(
                    credit: _credit,
                    debit: _debit,
                    period: periodLabel,
                    tappable: false,
                    ringSize: 150,
                    strokeWidth: 14,
                  ),
                ),

                // limit chip
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 4, 18, 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.04),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: (_dailyLimit == null)
                              ? const Text(
                            "No daily limit set",
                            style: TextStyle(fontWeight: FontWeight.w700),
                          )
                              : Builder(
                            builder: (_) {
                              final used = _daySpendOnly;
                              final pct = _dailyLimit! > 0
                                  ? (used / _dailyLimit! * 100)
                                  : 0.0;
                              return Text(
                                "Limit ₹${_dailyLimit!.toStringAsFixed(0)} • Used ₹${used.toStringAsFixed(0)} (${pct.clamp(0, 100).toStringAsFixed(0)}%)",
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      IconButton(
                        tooltip: "Edit daily limit",
                        onPressed: _savingLimit ? null : _editLimitDialog,
                        icon: _savingLimit
                            ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.edit_rounded),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 4),

                // transactions
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: CustomDiamondCard(
                    borderRadius: 22,
                    glassGradient: [
                      Colors.white.withValues(alpha: 0.23),
                      Colors.white.withValues(alpha: 0.09)
                    ],
                    padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
                    child: UnifiedTransactionList(
                      expenses: _dayExpenses,
                      incomes: _dayIncomes,
                      userPhone: widget.userPhone,
                      filterType: "All",
                      previewCount: 999,
                      friendsById: const {},
                      showBillIcon: true,
                      multiSelectEnabled: false,
                      selectedIds: const {},
                      onSelectTx: (_, __) {},
                      // 🔧 FIX: Proper edit navigation
                      onEdit: (tx) async {
                        if (tx is ExpenseItem) {
                          // Direct push to EditExpenseScreen
                          await Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => EditExpenseScreen(
                                userPhone: widget.userPhone,
                                expense: tx,
                              ),
                            ),
                          );
                          _recomputeForDay();
                        } else if (tx is IncomeItem) {
                          // Use your route name for income editing
                          // If you have a screen widget, replace with a direct MaterialPageRoute like above
                          try {
                            await Navigator.pushNamed(
                              context,
                              '/edit-income',
                              arguments: {
                                'userPhone': widget.userPhone,
                                'income': tx,
                              },
                            );
                            _recomputeForDay();
                          } catch (_) {
                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text("Edit Income screen not found. Set '/edit-income' route."),
                              ),
                            );
                          }
                        }
                      },
                      onDelete: (tx) async {
                        if (tx is ExpenseItem) {
                          await ExpenseService().deleteExpense(widget.userPhone, tx.id);
                        } else if (tx is IncomeItem) {
                          await IncomeService().deleteIncome(widget.userPhone, tx.id);
                        }
                        _recomputeForDay();
                      },
                      onSplit: (tx) async {
                        if (tx is ExpenseItem) {
                          await Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => EditExpenseScreen(
                                userPhone: widget.userPhone,
                                expense: tx,
                                initialStep: 1,
                              ),
                            ),
                          );
                          _recomputeForDay();
                        }
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------- helpers ----------
extension _ColorX on Color {
  Color darken([double amount = .2]) {
    assert(amount >= 0 && amount <= 1);
    final hsl = HSLColor.fromColor(this);
    final hslDark = hsl.withLightness((hsl.lightness - amount).clamp(0.0, 1.0));
    return hslDark.toColor();
  }
}
