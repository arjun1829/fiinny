import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/filters/saved_views_store.dart';
import '../core/filters/transaction_filter.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/income_item.dart';
import '../services/expense_service.dart';
import '../services/friend_service.dart';
import '../services/income_service.dart';
import '../widgets/animated_mint_background.dart';
import '../widgets/filters/transaction_filter_bar.dart';
import '../widgets/unified_transaction_list.dart';
import '../core/ads/ad_slots.dart';
import 'edit_expense_screen.dart';

class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({super.key, required this.userPhone});

  final String userPhone;

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  static const double _bannerHeight = 60.0;

  final ValueNotifier<bool> _showBottomBanner = ValueNotifier<bool>(true);
  final SavedViewsStore _savedViews = const SavedViewsStore();

  final List<ExpenseItem> _expenses = [];
  final List<IncomeItem> _incomes = [];
  final Map<String, FriendModel> _friendsById = {};

  List<ExpenseItem> _filteredExpenses = [];
  List<IncomeItem> _filteredIncomes = [];
  List<Map<String, dynamic>> _normalizedAll = const [];

  TransactionFilter _filter = TransactionFilter.defaults();
  bool _multiSelectMode = false;
  final Set<String> _selectedTxIds = <String>{};

  StreamSubscription<List<ExpenseItem>>? _expSub;
  StreamSubscription<List<IncomeItem>>? _incSub;
  StreamSubscription<List<FriendModel>>? _friendSub;

  @override
  void initState() {
    super.initState();
    _listenToStreams();
  }

  @override
  void dispose() {
    _expSub?.cancel();
    _incSub?.cancel();
    _friendSub?.cancel();
    _showBottomBanner.dispose();
    super.dispose();
  }

  void _listenToStreams() {
    _expSub = ExpenseService()
        .getExpensesStream(widget.userPhone)
        .listen((expenses) {
      if (!mounted) return;
      setState(() {
        _expenses
          ..clear()
          ..addAll(expenses);
        _filteredExpenses = List<ExpenseItem>.from(_expenses);
      });
    });

    _incSub = IncomeService()
        .getIncomesStream(widget.userPhone)
        .listen((incomes) {
      if (!mounted) return;
      setState(() {
        _incomes
          ..clear()
          ..addAll(incomes);
        _filteredIncomes = List<IncomeItem>.from(_incomes);
      });
    });

    _friendSub = FriendService()
        .streamFriends(widget.userPhone)
        .listen((friends) {
      if (!mounted) return;
      setState(() {
        _friendsById
          ..clear()
          ..addEntries(friends.map((f) => MapEntry(f.phone, f)));
      });
    });
  }

  void _handleFilterChanged(TransactionFilter filter) {
    setState(() {
      _filter = filter;
      _filteredExpenses = List<ExpenseItem>.from(_expenses);
      _filteredIncomes = List<IncomeItem>.from(_incomes);
    });
  }

  void _resetFilter() {
    _handleFilterChanged(TransactionFilter.defaults());
  }

  void _handleNormalized(List<Map<String, dynamic>> list) {
    setState(() {
      _normalizedAll = List<Map<String, dynamic>>.from(list);
    });
  }

  void _handleSelectTx(String txId, bool selected) {
    setState(() {
      if (selected) {
        _selectedTxIds.add(txId);
      } else {
        _selectedTxIds.remove(txId);
      }
    });
  }

  void _exitMultiSelect() {
    setState(() {
      _multiSelectMode = false;
      _selectedTxIds.clear();
    });
  }

  Future<void> _handleDelete(dynamic tx) async {
    if (_multiSelectMode) return;
    if (tx is ExpenseItem) {
      await ExpenseService().deleteExpense(widget.userPhone, tx.id);
    } else if (tx is IncomeItem) {
      await IncomeService().deleteIncome(widget.userPhone, tx.id);
    }
  }

  Future<void> _handleEdit(dynamic tx) async {
    if (_multiSelectMode) return;
    if (tx is ExpenseItem) {
      _showBottomBanner.value = false;
      try {
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => EditExpenseScreen(
              userPhone: widget.userPhone,
              expense: tx,
            ),
          ),
        );
      } finally {
        _showBottomBanner.value = true;
      }
    }
  }

  Future<String?> _promptLabel() async {
    String? result;
    final controller = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Set Label'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: 'Enter new label…'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              result = controller.text.trim();
              Navigator.pop(ctx);
            },
            child: const Text('Apply'),
          ),
        ],
      ),
    );
    return result;
  }

  Future<void> _applyLabelToSelection() async {
    if (_selectedTxIds.isEmpty) return;
    final newLabel = await _promptLabel();
    if (newLabel == null || newLabel.isEmpty) return;

    for (final expense in _filteredExpenses.where(
      (e) => _selectedTxIds.contains(e.id),
    )) {
      await ExpenseService().updateExpense(
        widget.userPhone,
        expense.copyWith(label: newLabel),
      );
    }

    for (final income in _filteredIncomes.where(
      (i) => _selectedTxIds.contains(i.id),
    )) {
      await IncomeService().updateIncome(
        widget.userPhone,
        income.copyWith(label: newLabel),
      );
    }

    _exitMultiSelect();
  }

  Future<void> _deleteSelection() async {
    if (_selectedTxIds.isEmpty) return;
    for (final expense in _filteredExpenses.where(
      (e) => _selectedTxIds.contains(e.id),
    )) {
      await ExpenseService().deleteExpense(widget.userPhone, expense.id);
    }
    for (final income in _filteredIncomes.where(
      (i) => _selectedTxIds.contains(i.id),
    )) {
      await IncomeService().deleteIncome(widget.userPhone, income.id);
    }
    _exitMultiSelect();
  }

  Future<void> _saveView(String name, TransactionFilter filter) {
    return _savedViews.save(name, filter);
  }

  Future<List<(String, TransactionFilter)>> _loadSavedViews() {
    return _savedViews.loadAll();
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 18, 12, 4),
      child: Row(
        children: [
          const Text(
            'Transactions',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 28,
              letterSpacing: 0.5,
              color: Color(0xFF09857a),
            ),
          ),
          const Spacer(),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            child: !_multiSelectMode
                ? IconButton(
                    key: const ValueKey('multiselect'),
                    icon: const Icon(Icons.check_box_rounded,
                        color: Colors.deepPurple),
                    tooltip: 'Multi-Select',
                    onPressed: () => setState(() {
                      _multiSelectMode = true;
                    }),
                  )
                : const SizedBox(width: 36),
          ),
        ],
      ),
    );
  }

  Widget _buildBulkBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
      child: Row(
        children: [
          Text(
            '${_selectedTxIds.length} selected',
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.deepPurple,
            ),
          ),
          const Spacer(),
          IconButton(
            icon: const Icon(Icons.label, color: Colors.amber),
            tooltip: 'Edit Label (Bulk)',
            onPressed: _selectedTxIds.isEmpty ? null : _applyLabelToSelection,
          ),
          IconButton(
            icon: const Icon(Icons.delete_forever, color: Colors.red),
            tooltip: 'Delete Selected',
            onPressed: _selectedTxIds.isEmpty ? null : _deleteSelection,
          ),
          IconButton(
            icon: const Icon(Icons.close_rounded),
            tooltip: 'Exit Multi-Select',
            onPressed: _exitMultiSelect,
          ),
        ],
      ),
    );
  }

  Widget _buildFilterAndList(BoxConstraints constraints) {
    final isWide = constraints.maxWidth >= 600;
    final filterType = _filter.type == TxType.expense
        ? 'Expense'
        : _filter.type == TxType.income
            ? 'Income'
            : 'All';

    final filterBar = TransactionFilterBar(
      isRail: isWide,
      allTx: _normalizedAll,
      initial: _filter,
      onApply: _handleFilterChanged,
      onReset: _resetFilter,
      onSaveView: _saveView,
      loadSavedViews: _loadSavedViews,
    );

    final list = UnifiedTransactionList(
      expenses: _filteredExpenses,
      incomes: _filteredIncomes,
      friendsById: _friendsById,
      userPhone: widget.userPhone,
      filterType: filterType,
      filter: _filter,
      groupBy: _filter.groupBy,
      onBeginModal: () => _showBottomBanner.value = false,
      onEndModal: () => _showBottomBanner.value = true,
      multiSelectEnabled: _multiSelectMode,
      selectedIds: _selectedTxIds,
      onSelectTx: _handleSelectTx,
      onEdit: (tx) {
        _handleEdit(tx);
      },
      onDelete: (tx) {
        _handleDelete(tx);
      },
      onNormalized: _handleNormalized,
    );

    if (isWide) {
      final railWidth = math.min(360.0, math.max(280.0, constraints.maxWidth * 0.30));
      return Row(
        children: [
          SizedBox(
            width: railWidth,
            child: filterBar,
          ),
          const SizedBox(width: 12),
          Expanded(child: list),
        ],
      );
    }

    return Column(
      children: [
        filterBar,
        const SizedBox(height: 8),
        Expanded(child: list),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          const AnimatedMintBackground(),
          ValueListenableBuilder<bool>(
            valueListenable: _showBottomBanner,
            builder: (context, show, _) {
              final keyboardUp = MediaQuery.of(context).viewInsets.bottom > 0;
              final bottomPad = (show && !keyboardUp)
                  ? _bannerHeight +
                      kBottomNavigationBarHeight +
                      MediaQuery.of(context).padding.bottom +
                      6
                  : 0.0;

              return SafeArea(
                child: Padding(
                  padding: EdgeInsets.only(bottom: bottomPad),
                  child: OrientationBuilder(
                    builder: (context, orientation) {
                      return LayoutBuilder(
                        builder: (context, constraints) {
                          return Column(
                            children: [
                              _buildHeader(),
                              if (_multiSelectMode) _buildBulkBar(),
                              Expanded(
                                child: _buildFilterAndList(constraints),
                              ),
                            ],
                          );
                        },
                      );
                    },
                  ),
                ),
              );
            },
          ),
          ValueListenableBuilder<bool>(
            valueListenable: _showBottomBanner,
            builder: (context, show, _) {
              final keyboardUp = MediaQuery.of(context).viewInsets.bottom > 0;
              if (!show || keyboardUp) return const SizedBox.shrink();
              return Positioned(
                left: 8,
                right: 8,
                bottom:
                    kBottomNavigationBarHeight + MediaQuery.of(context).padding.bottom + 4,
                child: SafeArea(
                  top: false,
                  bottom: false,
                  child: SizedBox(
                    height: _bannerHeight,
                    child: const AdsBannerSlot(
                      inline: false,
                      padding: EdgeInsets.zero,
                      alignment: Alignment.center,
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
