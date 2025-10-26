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
                    colors: [accent.withOpacity(.12), accent.withOpacity(.04)],
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: accent.withOpacity(.15)),
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
                        color: accent.withOpacity(.12),
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
    final dayCount = _dayExpenses.length + _dayIncomes.length;

    return Scaffold(
      appBar: AppBar(
        title: const Text("Transaction details"),
        backgroundColor: Colors.white,
        elevation: 0,
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
                            const Color(0xFF3B82F6).withOpacity(.06),
                            const Color(0xFF10B981).withOpacity(.06),
                            const Color(0xFFF59E0B).withOpacity(.06),
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

                if (_weekData.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                    child: Card(
                      elevation: 2,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Pick a day to review',
                              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: _weekData.map((data) {
                                final d = data['date'] as DateTime;
                                final isSelected = d.year == _selectedDay.year &&
                                    d.month == _selectedDay.month &&
                                    d.day == _selectedDay.day;
                                return ChoiceChip(
                                  label: Text(DateFormat('dd MMM').format(d)),
                                  selected: isSelected,
                                  onSelected: (_) {
                                    _selectedDay = d;
                                    _recomputeForDay();
                                  },
                                );
                              }).toList(),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Card(
                    elevation: 3,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.analytics_outlined, color: Color(0xFF0F766E)),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  'Transactions on $periodLabel',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                  ),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: Colors.teal.shade50,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  '$dayCount txs',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF0F766E),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              _statTile('Credit', _credit, Colors.green.shade600, Icons.call_received_rounded),
                              const SizedBox(width: 12),
                              _statTile('Debit', _debit, Colors.red.shade500, Icons.call_made_rounded),
                              const SizedBox(width: 12),
                              _statTile('Net', _credit - _debit, _credit - _debit >= 0 ? Colors.teal : Colors.red, Icons.equalizer_rounded),
                            ],
                          ),
                          const SizedBox(height: 18),
                          _DailyLimitSummary(
                            limit: _dailyLimit,
                            used: _daySpendOnly,
                            saving: _savingLimit,
                            onEdit: _editLimitDialog,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 8),

                // transactions
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: CustomDiamondCard(
                    borderRadius: 22,
                    glassGradient: [
                      Colors.white.withOpacity(0.23),
                      Colors.white.withOpacity(0.09)
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
                      onSplit: (tx) {},
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

Widget _statTile(String label, double value, Color color, IconData icon) {
  return Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: color.darken(0.2)),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 12.5,
                  color: color.darken(0.2),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '₹${value.toStringAsFixed(0)}',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: color.darken(0.05),
            ),
          ),
        ],
      ),
    ),
  );
}

class _DailyLimitSummary extends StatelessWidget {
  final double? limit;
  final double used;
  final bool saving;
  final VoidCallback onEdit;

  const _DailyLimitSummary({
    required this.limit,
    required this.used,
    required this.onEdit,
    this.saving = false,
  });

  @override
  Widget build(BuildContext context) {
    final hasLimit = (limit ?? 0) > 0;
    final limitValue = limit ?? 0;
    final pct = hasLimit && limitValue > 0
        ? (used / limitValue).clamp(0.0, 1.0)
        : 0.0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFE9F6F4),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFC6E6DF)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(hasLimit ? Icons.flag : Icons.outlined_flag,
                  color: const Color(0xFF0F766E), size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  hasLimit
                      ? 'Daily limit ₹${limitValue.toStringAsFixed(0)}'
                      : 'No daily limit set',
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF0F766E),
                  ),
                ),
              ),
              TextButton(
                onPressed: saving ? null : onEdit,
                child: saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2.3),
                      )
                    : Text(hasLimit ? 'Edit' : 'Set'),
              ),
            ],
          ),
          if (hasLimit) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                minHeight: 6,
                value: pct,
                backgroundColor: Colors.white,
                valueColor: AlwaysStoppedAnimation<Color>(
                  pct >= 1 ? Colors.redAccent : const Color(0xFF0F766E),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  'Spent ₹${used.toStringAsFixed(0)}',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: pct >= 1 ? Colors.redAccent : const Color(0xFF0F766E),
                  ),
                ),
                const Spacer(),
                Text(
                  '${(pct * 100).clamp(0, 999).toStringAsFixed(0)}% of limit',
                  style: const TextStyle(
                    fontWeight: FontWeight.w500,
                    color: Colors.black54,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

extension _ColorX on Color {
  Color darken([double amount = .2]) {
    assert(amount >= 0 && amount <= 1);
    final hsl = HSLColor.fromColor(this);
    final hslDark = hsl.withLightness((hsl.lightness - amount).clamp(0.0, 1.0));
    return hslDark.toColor();
  }
}
