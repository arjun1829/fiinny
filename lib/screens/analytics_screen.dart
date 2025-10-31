// ignore_for_file: prefer_final_fields, library_private_types_in_public_api

import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../models/friend_model.dart';

import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../services/friend_service.dart';

import '../widgets/animated_mint_background.dart';
import '../themes/custom_card.dart';

const List<String> kIncomeCategories = [
  'Salary',
  'Freelance',
  'Interest',
  'Dividend',
  'Cashback/Rewards',
  'Refund/Reimbursement',
  'Rent Received',
  'Gift',
  'Transfer In (Self)',
  'Sale Proceeds',
  'Loan Received',
  'Other',
];

enum SortBy { amountDesc, amountAsc, dateDesc, dateAsc }

class _TxnRow {
  final bool isIncome;
  final double amount;
  final DateTime date;
  final String? label;
  final String note;
  final String category;
  final dynamic raw; // ExpenseItem or IncomeItem

  _TxnRow.expense(ExpenseItem e, String category)
      : isIncome = false,
        amount = e.amount,
        date = e.date,
        label = e.label,
        note = e.note,
        category = category,
        raw = e;

  _TxnRow.income(IncomeItem i, String category)
      : isIncome = true,
        amount = i.amount,
        date = i.date,
        label = i.label,
        note = i.note,
        category = category,
        raw = i;
}

class _Agg {
  final String key;
  final int count;
  final double sum;
  final List<ExpenseItem> items;
  _Agg({required this.key, required this.count, required this.sum, required this.items});
}

class _AggInc {
  final String key;
  final int count;
  final double sum;
  final List<IncomeItem> items;
  _AggInc({required this.key, required this.count, required this.sum, required this.items});
}

class AnalyticsScreen extends StatefulWidget {
  final String userPhone;
  const AnalyticsScreen({required this.userPhone, Key? key}) : super(key: key);

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  // === Palette / tokens ===
  static const Color _cIncome = Colors.green;
  static const Color _cExpense = Colors.red;
  static const Color _cHeadline = Color(0xFF09857a);
  static const Color _cGlassHi = Color(0x30FFFFFF);
  static const Color _cGlassLo = Color(0x12FFFFFF);

  // === UI state ===
  String _selectedFilter = "Month"; // Day / Yesterday / Week / Month / Quarter / Year / All / Custom
  DateTime? _customFrom;
  DateTime? _customTo;

  int _hvThreshold = 1000; // INR
  bool _hvCollapsed = true;
  SortBy _sortBy = SortBy.amountDesc;

  // === Data ===
  List<ExpenseItem> _allExpenses = [];
  List<IncomeItem> _allIncomes = [];
  Map<String, FriendModel> _friendsById = {};

  // Filtered
  List<ExpenseItem> _filteredExpenses = [];
  List<IncomeItem> _filteredIncomes = [];

  // Aggregation caches (invalidate on _recompute)
  List<_Agg>? _cacheExpCatAgg;
  List<_AggInc>? _cacheIncCatAgg;
  List<_Agg>? _cacheFriendAgg;
  List<_Agg>? _cacheGroupAgg;
  List<_TxnRow>? _cacheMergedSorted;
  Map<DateTime, List<ExpenseItem>>? _cacheHvByDate;

  // Stream subs
  StreamSubscription? _expSub, _incSub, _friendSub;

  // Date helpers
  late DateTime _now;
  late ({DateTime start, DateTime end}) _currentRange;

  // First-load gates
  int _pendingFirstLoads = 2; // expenses + incomes (friends can come later)
  bool get _ready => _pendingFirstLoads == 0;

  // Debounce recompute
  Timer? _recomputeDebounce;

  // Formats
  final _inr0 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  final _inr2 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);

  // === Noisy types → Other
  static const Set<String> _noiseTypes = {
    'email debit', 'sms debit', 'email credit', 'sms credit', 'debit', 'credit'
  };

  @override
  void initState() {
    super.initState();
    _now = DateTime.now();
    _currentRange = _rangeForFilter(_now, _selectedFilter);
    _wireStreams();
  }

  @override
  void dispose() {
    _expSub?.cancel();
    _incSub?.cancel();
    _friendSub?.cancel();
    _recomputeDebounce?.cancel();
    super.dispose();
  }

  void _wireStreams() {
    _expSub = ExpenseService().getExpensesStream(widget.userPhone).listen((xs) {
      if (!mounted) return;
      _allExpenses = xs;
      _onDataChanged();
      if (_pendingFirstLoads > 0) _pendingFirstLoads--;
      setState(() {});
    });

    _incSub = IncomeService().getIncomesStream(widget.userPhone).listen((xs) {
      if (!mounted) return;
      _allIncomes = xs;
      _onDataChanged();
      if (_pendingFirstLoads > 0) _pendingFirstLoads--;
      setState(() {});
    });

    _friendSub = FriendService().streamFriends(widget.userPhone).listen((fs) {
      if (!mounted) return;
      _friendsById = {for (var f in fs) f.phone: f};
      // no need to invalidate everything; friend/group aggs only
      _cacheFriendAgg = null;
      _cacheGroupAgg = null;
      setState(() {});
    });
  }

  // Debounced recompute to avoid double work when streams fire together
  void _onDataChanged() {
    _recomputeDebounce?.cancel();
    _recomputeDebounce = Timer(const Duration(milliseconds: 120), _recompute);
  }

  // === Date helpers ===
  DateTime _d(DateTime x) => DateTime(x.year, x.month, x.day);

  ({DateTime start, DateTime end}) _rangeForFilter(DateTime now, String f) {
    switch (f) {
      case 'Day':
        final d0 = _d(now);
        return (start: d0, end: d0);
      case 'Yesterday':
        final y = _d(now).subtract(const Duration(days: 1));
        return (start: y, end: y);
      case 'Week':
        final start = _d(now).subtract(Duration(days: now.weekday - 1));
        final end = start.add(const Duration(days: 6));
        return (start: start, end: end);
      case 'Month':
        final start = DateTime(now.year, now.month, 1);
        final end = DateTime(now.year, now.month + 1, 0);
        return (start: start, end: end);
      case 'Quarter':
        final q = ((now.month - 1) ~/ 3) + 1;
        final sm = (q - 1) * 3 + 1;
        final start = DateTime(now.year, sm, 1);
        final end = DateTime(now.year, sm + 3, 0);
        return (start: start, end: end);
      case 'Year':
        return (start: DateTime(now.year, 1, 1), end: DateTime(now.year, 12, 31));
      case 'All':
        return (start: DateTime(2000), end: DateTime(2100));
      case 'Custom':
        final s = _customFrom ?? _d(now);
        final e = _customTo ?? _d(now);
        return (start: _d(s), end: _d(e));
      default:
        return (start: DateTime(2000), end: DateTime(2100));
    }
  }

  bool _inRange(DateTime d, ({DateTime start, DateTime end}) r) {
    final x = _d(d);
    return (x.isAtSameMomentAs(r.start) || x.isAfter(r.start)) &&
        (x.isAtSameMomentAs(r.end) || x.isBefore(r.end));
  }

  // === Category helpers ===
  String _cleanType(String? raw) {
    final s = (raw ?? '').trim();
    if (s.isEmpty) return 'Other';
    if (_noiseTypes.contains(s.toLowerCase())) return 'Other';
    return s;
  }

  // Expense guesser from label/note/source when type is empty/noisy
  String _guessExpenseCategory({required ExpenseItem e}) {
    final base = "${e.label ?? ''} ${e.note}".toLowerCase();

    bool hasAny(Iterable<String> keys) => keys.any((k) => base.contains(k));

    if (hasAny(['zomato', 'swiggy', 'eat', 'restaurant', 'dine', 'food', 'meal']))
      return 'Food & Dining';
    if (hasAny(['grocery', 'mart', 'd mart', 'dmart', 'bigbasket', 'bbnow', 'fresh', 'kirana']))
      return 'Groceries';
    if (hasAny(['ola', 'uber', 'rapido', 'metro', 'bus', 'auto', 'cab', 'train']))
      return 'Transport';
    if (hasAny(['fuel', 'petrol', 'diesel', 'hpcl', 'bpcl', 'ioc']))
      return 'Fuel';
    if (hasAny(['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'tata cliq', 'meesho']))
      return 'Shopping';
    if (hasAny(['electric', 'electricity', 'power', 'water bill', 'wifi', 'broadband', 'dth', 'mobile bill', 'recharge', 'gas']))
      return 'Bills & Utilities';
    if (hasAny(['rent', 'landlord']))
      return 'Rent';
    if (hasAny(['emi', 'loan', 'nbfc', 'interest debit']))
      return 'EMI & Loans';
    if (hasAny(['netflix', 'prime', 'spotify', 'yt premium', 'hotstar', 'zee5', 'sonyliv']))
      return 'Subscriptions';
    if (hasAny(['hospital', 'clinic', 'pharma', 'apollo', '1mg', 'pharmacy', 'diagnostic']))
      return 'Health';
    if (hasAny(['fee', 'college', 'tuition', 'coaching']))
      return 'Education';
    if (hasAny(['flight', 'air', 'goair', 'indigo', 'vistara', 'hotel', 'oyo', 'makemytrip', 'mmt', 'booking.com']))
      return 'Travel';
    if (hasAny(['movie', 'pvr', 'inox', 'bookmyshow', 'bms', 'concert', 'event']))
      return 'Entertainment';
    if (hasAny(['charge', 'fee', 'penalty']))
      return 'Fees & Charges';
    if (hasAny(['sip', 'mutual fund', 'mf', 'stock', 'zerodha', 'groww', 'angel', 'upstox']))
      return 'Investments';
    if (hasAny(['upi', 'imps', 'neft', 'rtgs']) && (e.payerId != null && e.payerId!.isNotEmpty))
      return 'Transfers (Self)';

    return 'Other';
  }

  String _expenseCategoryOf(ExpenseItem e) {
    final t = _cleanType(e.type);
    if (t == 'Other') return _guessExpenseCategory(e: e);
    return t;
  }

  String _guessIncomeCategory({String? label, String? note, String? source}) {
    final t = "${label ?? ''} ${note ?? ''} ${source ?? ''}".toLowerCase();
    bool hasAny(Iterable<String> keys) => keys.any((k) => t.contains(k));
    if (hasAny(['salary', 'payroll', 'wage', 'stipend', 'ctc', 'payout'])) return 'Salary';
    if (hasAny(['freelance', 'consult', 'contract', 'side hustle', 'upwork', 'fiverr'])) return 'Freelance';
    if (hasAny(['interest', 's/b interest', 'fd interest', 'rd interest', 'int.'])) return 'Interest';
    if (hasAny(['dividend', 'div.', 'payout dividend', 'dpsp'])) return 'Dividend';
    if (hasAny(['cashback', 'cash back', 'reward', 'promo', 'offer'])) return 'Cashback/Rewards';
    if (hasAny(['refund', 'reversal', 'chargeback', 'reimb'])) return 'Refund/Reimbursement';
    if (hasAny(['rent'])) return 'Rent Received';
    if (hasAny(['gift', 'gifting'])) return 'Gift';
    if (hasAny(['self transfer', 'from self', 'own account', 'sweep in'])) return 'Transfer In (Self)';
    if (hasAny(['sold', 'sale', 'proceeds', 'liquidation'])) return 'Sale Proceeds';
    if (hasAny(['loan disbursal', 'loan credit', 'emi refund', 'nbfc'])) return 'Loan Received';
    if (hasAny(['upi', 'imps', 'neft', 'rtgs', 'gpay', 'phonepe', 'paytm'])) return 'Transfer In (Self)';
    return 'Other';
  }

  // === Compute & cache ===
  void _recompute() {
    _currentRange = _rangeForFilter(_now, _selectedFilter);

    _filteredExpenses = _allExpenses.where((e) => _inRange(e.date, _currentRange)).toList();
    _filteredIncomes = _allIncomes.where((i) => _inRange(i.date, _currentRange)).toList();

    // invalidate caches
    _cacheExpCatAgg = null;
    _cacheIncCatAgg = null;
    _cacheFriendAgg = null;
    _cacheGroupAgg = null;
    _cacheMergedSorted = null;
    _cacheHvByDate = null;

    if (mounted) setState(() {});
  }

  // === Quick getters ===
  int get _incomeCount => _filteredIncomes.length;
  int get _expenseCount => _filteredExpenses.length;
  int get _txnCount => _incomeCount + _expenseCount;

  double get _incomeSum => _filteredIncomes.fold(0, (s, i) => s + i.amount);
  double get _expenseSum => _filteredExpenses.fold(0, (s, e) => s + e.amount);
  double get _netSum => _incomeSum - _expenseSum;

  double get _avgIncome => _incomeCount == 0 ? 0 : _incomeSum / _incomeCount;
  double get _avgExpense => _expenseCount == 0 ? 0 : _expenseSum / _expenseCount;

  Map<DateTime, List<ExpenseItem>> _hvGroupedByDate() {
    if (_cacheHvByDate != null) return _cacheHvByDate!;
    final hv = _filteredExpenses.where((e) => e.amount > _hvThreshold).toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    final m = <DateTime, List<ExpenseItem>>{};
    for (final e in hv) {
      final key = _d(e.date);
      (m[key] ??= []).add(e);
    }
    _cacheHvByDate = m;
    return m;
  }

  // Friend / Group helpers
  bool _looksGroupish(String text) {
    final t = text.toLowerCase();
    const keys = ['group', 'split', 'team', 'trip', 'flat', 'room', 'pool', 'party', 'rent'];
    return keys.any((k) => t.contains(k));
  }

  List<_Agg> _friendAgg() {
    if (_cacheFriendAgg != null) return _cacheFriendAgg!;
    final m = <String, List<ExpenseItem>>{};
    for (final e in _filteredExpenses) {
      final ids = (e.friendIds is List) ? List<String>.from(e.friendIds) : <String>[];
      if (ids.isNotEmpty) {
        for (final fid in ids) {
          final name = _friendsById[fid]?.name;
          final key = (name != null && name.trim().isNotEmpty) ? name : fid;
          (m[key] ??= []).add(e);
        }
        continue;
      }
      final text = "${e.label ?? ''} ${e.note}".toLowerCase();
      for (final f in _friendsById.values) {
        final name = (f.name ?? '').toLowerCase();
        final phone = (f.phone).toLowerCase();
        if ((name.isNotEmpty && text.contains(name)) || (phone.isNotEmpty && text.contains(phone))) {
          final key = (f.name?.isNotEmpty ?? false) ? f.name! : f.phone;
          (m[key] ??= []).add(e);
          break;
        }
      }
    }
    final out = <_Agg>[];
    m.forEach((k, list) {
      final sum = list.fold<double>(0, (s, e) => s + e.amount);
      out.add(_Agg(key: k, count: list.length, sum: sum, items: list));
    });
    out.sort((a, b) => b.sum.compareTo(a.sum));
    _cacheFriendAgg = out;
    return out;
  }

  List<_Agg> _groupAgg() {
    if (_cacheGroupAgg != null) return _cacheGroupAgg!;
    final m = <String, List<ExpenseItem>>{};
    for (final e in _filteredExpenses) {
      String? key;
      final gid = (e.groupId == null || e.groupId.toString().trim().isEmpty) ? null : e.groupId.toString();
      if (gid != null) {
        key = "Group • $gid";
      } else {
        final text = "${e.label ?? ''} ${e.note}".trim();
        if (_looksGroupish(text)) {
          key = (e.label?.isNotEmpty ?? false) ? e.label!.trim() : "Group";
        }
      }
      if (key != null) (m[key] ??= []).add(e);
    }
    final out = <_Agg>[];
    m.forEach((k, list) {
      final sum = list.fold<double>(0, (s, e) => s + e.amount);
      out.add(_Agg(key: k, count: list.length, sum: sum, items: list));
    });
    out.sort((a, b) => b.sum.compareTo(a.sum));
    _cacheGroupAgg = out;
    return out;
  }

  List<_Agg> _expenseCategoryAgg() {
    if (_cacheExpCatAgg != null) return _cacheExpCatAgg!;
    final m = <String, List<ExpenseItem>>{};
    for (final e in _filteredExpenses) {
      final key = _expenseCategoryOf(e);
      (m[key] ??= []).add(e);
    }
    final out = <_Agg>[];
    m.forEach((k, list) {
      final sum = list.fold<double>(0, (s, e) => s + e.amount);
      out.add(_Agg(key: k, count: list.length, sum: sum, items: list));
    });
    out.sort((a, b) => b.sum.compareTo(a.sum));
    _cacheExpCatAgg = out;
    return out;
  }

  List<_AggInc> _incomeCategoryAgg() {
    if (_cacheIncCatAgg != null) return _cacheIncCatAgg!;
    final m = <String, List<IncomeItem>>{};
    for (final i in _filteredIncomes) {
      final raw = (i.type.isEmpty || _noiseTypes.contains(i.type.toLowerCase()))
          ? _guessIncomeCategory(label: i.label, note: i.note, source: i.source?.toString())
          : i.type;
      final key = _cleanType(raw);
      (m[key] ??= []).add(i);
    }
    final out = <_AggInc>[];
    m.forEach((k, list) {
      final sum = list.fold<double>(0, (s, e) => s + e.amount);
      out.add(_AggInc(key: k, count: list.length, sum: sum, items: list));
    });
    out.sort((a, b) => b.sum.compareTo(a.sum));
    _cacheIncCatAgg = out;
    return out;
  }

  List<_TxnRow> _mergedSorted() {
    if (_cacheMergedSorted != null) return _cacheMergedSorted!;
    final rows = <_TxnRow>[
      ..._filteredExpenses.map((e) => _TxnRow.expense(e, _expenseCategoryOf(e))),
      ..._filteredIncomes.map((i) {
        final raw = (i.type.isEmpty || _noiseTypes.contains(i.type.toLowerCase()))
            ? _guessIncomeCategory(label: i.label, note: i.note, source: i.source?.toString())
            : i.type;
        return _TxnRow.income(i, _cleanType(raw));
      }),
    ];
    int cmpAmount(_TxnRow a, _TxnRow b) => a.amount.compareTo(b.amount);
    int cmpDate(_TxnRow a, _TxnRow b) => a.date.compareTo(b.date);

    switch (_sortBy) {
      case SortBy.amountDesc:
        rows.sort((a, b) => -cmpAmount(a, b));
        break;
      case SortBy.amountAsc:
        rows.sort(cmpAmount);
        break;
      case SortBy.dateDesc:
        rows.sort((a, b) => -cmpDate(a, b));
        break;
      case SortBy.dateAsc:
        rows.sort(cmpDate);
        break;
    }
    _cacheMergedSorted = rows;
    return rows;
  }

  // === UI ===
  @override
  Widget build(BuildContext context) {
    final rangeText =
        "${DateFormat('d MMM').format(_currentRange.start)} — ${DateFormat('d MMM').format(_currentRange.end)}";

    final catAgg = _expenseCategoryAgg();
    final incAgg = _incomeCategoryAgg();
    final friendAgg = _friendAgg();
    final groupAgg = _groupAgg();

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          const AnimatedMintBackground(),
          SafeArea(
            child: _buildBody(rangeText, catAgg, incAgg, friendAgg, groupAgg),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(
      String rangeText,
      List<_Agg> catAgg,
      List<_AggInc> incAgg,
      List<_Agg> friendAgg,
      List<_Agg> groupAgg,
      ) {
    final hasAnyCat = catAgg.isNotEmpty;
    final hasAnyIncCat = incAgg.isNotEmpty;

    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 12, 8),
            child: Row(
              children: [
                const Text(
                  "Clarity",
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 28,
                    letterSpacing: 0.5,
                    color: _cHeadline,
                  ),
                ),
                const Spacer(),
                _sortButton(),
                IconButton(
                  tooltip: "Pick custom date range",
                  icon: const Icon(Icons.calendar_month),
                  onPressed: _pickRange,
                ),
              ],
            ),
          ),
        ),

        // Filter Bar
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12.0),
            child: CustomDiamondCard(
              borderRadius: 18,
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
              glassGradient: [Colors.white.withOpacity(0.16), Colors.white.withOpacity(0.06)],
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _filterChip('Day'),
                        _filterChip('Yesterday'),
                        _filterChip('Week'),
                        _filterChip('Month'),
                        _filterChip('Quarter'),
                        _filterChip('Year'),
                        _filterChip('All'),
                        const SizedBox(width: 8),
                        OutlinedButton.icon(
                          onPressed: _pickRange,
                          icon: const Icon(Icons.date_range, size: 18),
                          label: const Text("Custom"),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(rangeText, style: const TextStyle(fontWeight: FontWeight.w600)),
                  if (_selectedFilter == 'Custom' && (_customFrom != null || _customTo != null))
                    Padding(
                      padding: const EdgeInsets.only(top: 4.0),
                      child: Wrap(
                        spacing: 8,
                        children: [
                          if (_customFrom != null)
                            _chip("From: ${DateFormat('d MMM').format(_customFrom!)}", () {
                              setState(() => _customFrom = null);
                              _recompute();
                            }),
                          if (_customTo != null)
                            _chip("To: ${DateFormat('d MMM').format(_customTo!)}", () {
                              setState(() => _customTo = null);
                              _recompute();
                            }),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),

        // KPI Strip
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
            child: CustomDiamondCard(
              borderRadius: 22,
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
              glassGradient: [Colors.white.withOpacity(0.23), Colors.white.withOpacity(0.09)],
              child: _ready
                  ? Column(
                children: [
                  Wrap(
                    spacing: 8, runSpacing: 8,
                    children: [
                      _kpiBox("Transactions", '$_txnCount'),
                      _kpiBox("Income #", '$_incomeCount'),
                      _kpiBox("Expense #", '$_expenseCount'),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8, runSpacing: 8,
                    children: [
                      _kpiMoney("Income", _incomeSum),
                      _kpiMoney("Expense", _expenseSum),
                      _kpiMoney("Net", _netSum, colorOverride: _netSum >= 0 ? _cHeadline : _cExpense),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8, runSpacing: 8,
                    children: [
                      _kpiSmall("Avg Income", _avgIncome),
                      _kpiSmall("Avg Expense", _avgExpense),
                    ],
                  ),
                ],
              )
                  : _skeleton(height: 60),
            ),
          ),
        ),

        // High-value block
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: CustomDiamondCard(
              borderRadius: 22,
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
              glassGradient: [Colors.white.withOpacity(0.23), Colors.white.withOpacity(0.09)],
              child: Column(
                children: [
                  Row(
                    children: [
                      const Text("High-value Expenses", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: _editThreshold,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.orange.withOpacity(0.10),
                            borderRadius: BorderRadius.circular(100),
                            border: Border.all(color: Colors.orange.withOpacity(0.25)),
                          ),
                          child: Text("> ₹$_hvThreshold",
                              style: const TextStyle(color: Colors.orange, fontWeight: FontWeight.w700)),
                        ),
                      ),
                      const Spacer(),
                      TextButton(onPressed: _openHvSheet, child: const Text("Open")),
                      IconButton(
                        tooltip: _hvCollapsed ? "Expand" : "Collapse",
                        icon: Icon(_hvCollapsed ? Icons.expand_more : Icons.expand_less),
                        onPressed: () => setState(() => _hvCollapsed = !_hvCollapsed),
                      ),
                    ],
                  ),
                  if (!_hvCollapsed)
                    (_ready ? _highValueListPreview() : _skeleton(height: 80)),
                ],
              ),
            ),
          ),
        ),

        // Friends & Groups
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: CustomDiamondCard(
              borderRadius: 22,
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
              glassGradient: [Colors.white.withOpacity(0.23), Colors.white.withOpacity(0.09)],
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("Friends & Groups", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 8),
                  _ready
                      ? Wrap(
                    spacing: 10, runSpacing: 8,
                    children: [
                      _tapBadge(
                        icon: Icons.person_2_rounded,
                        color: Colors.indigo,
                        label:
                        "Friends: ${friendAgg.fold<int>(0, (s, a) => s + a.count)}  •  ${_inr0.format(friendAgg.fold<double>(0, (s, a) => s + a.sum))}",
                        onTap: () => _openFriendsGroupsSheet(initialTab: 0),
                      ),
                      _tapBadge(
                        icon: Icons.groups_rounded,
                        color: Colors.deepPurple,
                        label:
                        "Groups: ${groupAgg.fold<int>(0, (s, a) => s + a.count)}  •  ${_inr0.format(groupAgg.fold<double>(0, (s, a) => s + a.sum))}",
                        onTap: () => _openFriendsGroupsSheet(initialTab: 1),
                      ),
                    ],
                  )
                      : _skeleton(height: 36),
                ],
              ),
            ),
          ),
        ),

        // Expense donut
        if (hasAnyCat)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: CustomDiamondCard(
                borderRadius: 22,
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
                glassGradient: [Colors.white.withOpacity(0.23), Colors.white.withOpacity(0.09)],
                child: _CategoryDonut(
                  aggs: catAgg,
                  total: _expenseSum,
                  onSlice: (agg) => _openTxnSheet(
                    "Category: ${agg.key}",
                    agg.items.map((e) => _TxnRow.expense(e, _expenseCategoryOf(e))).toList(),
                  ),
                ),
              ),
            ),
          ),

        // Income donut
        if (hasAnyIncCat)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: CustomDiamondCard(
                borderRadius: 22,
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
                glassGradient: [Colors.white.withOpacity(0.23), Colors.white.withOpacity(0.09)],
                child: _IncomeDonut(
                  aggs: incAgg,
                  total: _incomeSum,
                  onSlice: (agg) => _openTxnSheet(
                    "Category (Income): ${agg.key}",
                    agg.items.map((i) => _TxnRow.income(i, _cleanType(i.type))).toList(),
                  ),
                ),
              ),
            ),
          ),

        // Expense category chips
        if (hasAnyCat)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: CustomDiamondCard(
                borderRadius: 22,
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
                glassGradient: [Colors.white.withOpacity(0.23), Colors.white.withOpacity(0.09)],
                child: Wrap(
                  spacing: 8, runSpacing: 8,
                  children: catAgg.map((a) {
                    final c = a.key;
                    final chipColor = c.toLowerCase() == 'other' ? Colors.blueGrey : _cHeadline;
                    return _tapBadge(
                      icon: Icons.label_rounded,
                      color: chipColor,
                      label: "$c: ${a.count} • ${_inr0.format(a.sum)}",
                      onTap: () => _openTxnSheet(
                        "Category: $c",
                        a.items.map((e) => _TxnRow.expense(e, _expenseCategoryOf(e))).toList(),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
          ),

        // Transactions (single SliverList, fast)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: CustomDiamondCard(
              borderRadius: 22,
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
              glassGradient: [Colors.white.withOpacity(0.23), Colors.white.withOpacity(0.09)],
              child: Row(
                children: [
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 6),
                    child: Text("Transactions", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  ),
                  const Spacer(),
                  _sortButton(compact: true),
                ],
              ),
            ),
          ),
        ),
        if (!_ready)
          SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: _skeleton(height: 140)))
        else
          _buildTxnSliver(_mergedSorted()),
        const SliverToBoxAdapter(child: SizedBox(height: 24)),
      ],
    );
  }

  SliverList _buildTxnSliver(List<_TxnRow> rows) {
    if (rows.isEmpty) {
      return SliverList(
        delegate: SliverChildListDelegate.fixed([
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 18, vertical: 12),
            child: Text("No transactions in this period."),
          )
        ]),
      );
    }
    return SliverList(
      delegate: SliverChildBuilderDelegate(
            (context, i) {
          final r = rows[i];
          return Column(
            children: [
              if (i == 0) const SizedBox(height: 4),
              ListTile(
                dense: true,
                onTap: () => _openTxnActions(r),
                leading: CircleAvatar(
                  backgroundColor: (r.isIncome ? _cIncome : _cExpense).withOpacity(0.12),
                  child: Icon(r.isIncome ? Icons.arrow_downward : Icons.arrow_upward,
                      color: r.isIncome ? _cIncome : _cExpense),
                ),
                title: Text(
                  (r.label?.trim().isNotEmpty ?? false)
                      ? r.label!.trim()
                      : (r.note.trim().isNotEmpty ? r.note.trim() : (r.isIncome ? "Income" : "Expense")),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  "${DateFormat('d MMM, h:mm a').format(r.date)}  •  ${r.category}",
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
                trailing: Text(
                  _inr0.format(r.amount),
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: r.isIncome ? _cIncome : _cExpense,
                  ),
                ),
              ),
              const Divider(height: 8),
            ],
          );
        },
        childCount: rows.length,
      ),
    );
  }

  // === Small UI helpers ===
  Widget _filterChip(String label) {
    final active = _selectedFilter == label;
    return Padding(
      padding: const EdgeInsets.only(right: 8.0),
      child: ChoiceChip(
        label: Text(label),
        selected: active,
        onSelected: (_) {
          setState(() {
            _selectedFilter = label;
            if (label != 'Custom') {
              _customFrom = null;
              _customTo = null;
            }
          });
          _recompute();
        },
      ),
    );
  }

  Widget _kpiBox(String title, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.15),
        border: Border.all(color: Colors.white.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text("$title: ", style: const TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w600)),
          Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _kpiMoney(String title, double value, {Color? colorOverride}) {
    final txt = _inr0.format(value);
    final color = colorOverride ?? (title == "Expense" ? _cExpense : _cIncome);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.15),
        border: Border.all(color: Colors.white.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(title == "Expense" ? Icons.arrow_upward : Icons.arrow_downward, color: color, size: 18),
          const SizedBox(width: 6),
          Text("$title: ", style: const TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w600)),
          Text(txt, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _kpiSmall(String title, double v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Colors.white.withOpacity(0.10),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text("$title: ", style: const TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w600)),
          Text(_inr0.format(v), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _tapBadge({
    required IconData icon,
    required Color color,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(100),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(100),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.white.withOpacity(0.28), Colors.white.withOpacity(0.10)],
          ),
          border: Border.all(color: Colors.white.withOpacity(0.25)),
          boxShadow: [BoxShadow(color: color.withOpacity(0.12), blurRadius: 14, offset: const Offset(0, 6))],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 6),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 280),
              child: Text(label, overflow: TextOverflow.ellipsis, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(String label, VoidCallback onClear) {
    return InputChip(label: Text(label), onDeleted: onClear, deleteIcon: const Icon(Icons.close, size: 16));
  }

  // === High-value previews & sheet ===
  Widget _highValueListPreview() {
    final byDate = _hvGroupedByDate();
    final dates = byDate.keys.toList()..sort((a, b) => b.compareTo(a));
    if (dates.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(6.0),
        child: Align(alignment: Alignment.centerLeft, child: Text("No high-value expenses in this period.")),
      );
    }
    final preview = dates.take(3).toList();
    return Column(
      children: preview.map((d) {
        final items = [...byDate[d]!]..sort((a, b) => b.amount.compareTo(a.amount));
        final sum = items.fold<double>(0, (s, e) => s + e.amount);
        return ListTile(
          contentPadding: EdgeInsets.zero,
          dense: true,
          leading: const Icon(Icons.calendar_today, size: 18),
          title: Text(DateFormat('EEE, d MMM').format(d)),
          subtitle: Text("${items.length} transactions"),
          trailing: Text(_inr0.format(sum), style: const TextStyle(fontWeight: FontWeight.bold)),
          onTap: () => _openTxnSheet(DateFormat('EEE, d MMM').format(d),
              items.map((e) => _TxnRow.expense(e, _expenseCategoryOf(e))).toList()),
        );
      }).toList(),
    );
  }

  void _openHvSheet() {
    final allRows = _hvGroupedByDate()
        .entries
        .expand((e) => e.value.map((x) => _TxnRow.expense(x, _expenseCategoryOf(x))))
        .toList()
      ..sort((a, b) => -a.amount.compareTo(b.amount));

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) {
        return DraggableScrollableSheet(
          initialChildSize: 0.85,
          minChildSize: 0.25,
          maxChildSize: 0.95,
          expand: false,
          builder: (ctx, scrollController) {
            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 6, 8, 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text("High-value (> ₹$_hvThreshold)",
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                      ),
                      IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(ctx)),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView.separated(
                    controller: scrollController,
                    itemCount: allRows.length,
                    separatorBuilder: (_, __) => const Divider(height: 8),
                    itemBuilder: (_, i) => _txnTile(allRows[i]),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _txnTile(_TxnRow r) {
    final color = r.isIncome ? _cIncome : _cExpense;
    final icon = r.isIncome ? Icons.arrow_downward : Icons.arrow_upward;
    final title = (r.label?.trim().isNotEmpty ?? false)
        ? r.label!.trim()
        : (r.note.trim().isNotEmpty ? r.note.trim() : (r.isIncome ? "Income" : "Expense"));
    final subtitle = "${DateFormat('d MMM, h:mm a').format(r.date)}  •  ${r.category}";

    return ListTile(
      dense: true,
      onTap: () => _openTxnActions(r),
      leading: CircleAvatar(
        backgroundColor: color.withOpacity(0.12),
        child: Icon(icon, color: color),
      ),
      title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: Text(_inr0.format(r.amount), style: TextStyle(fontWeight: FontWeight.bold, color: color)),
    );
  }

  // === Txn actions (detail/edit/delete) ===
  void _openTxnActions(_TxnRow r) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) {
        final color = r.isIncome ? _cIncome : _cExpense;
        final isIncome = r.isIncome;
        final ExpenseItem? ex = isIncome ? null : (r.raw as ExpenseItem);
        final IncomeItem? inc = isIncome ? (r.raw as IncomeItem) : null;

        String friendsStr = '';
        if (ex != null && (ex.friendIds is List) && ex.friendIds.isNotEmpty) {
          final ids = List<String>.from(ex.friendIds);
          friendsStr = ids.map((fid) => _friendsById[fid]?.name ?? "Friend").join(', ');
        }

        final maxH = MediaQuery.of(context).size.height * 0.75;
        return ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxH),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  title: Text(isIncome ? "Income" : "Expense",
                      style: TextStyle(color: color, fontWeight: FontWeight.bold)),
                  subtitle: Text(
                    "${DateFormat('EEE, d MMM • h:mm a').format(r.date)}
${r.category}"
                        "${(ex?.groupId != null && ex!.groupId.toString().trim().isNotEmpty) ? "
Group: ${ex.groupId}" : ""}"
                        "${friendsStr.isNotEmpty ? "
With: $friendsStr" : ""}"
                        "${(inc?.source != null && inc!.source.toString().trim().isNotEmpty) ? "
Source: ${inc.source}" : ""}",
                  ),
                  trailing: Text(_inr2.format(r.amount), style: TextStyle(color: color, fontWeight: FontWeight.w700)),
                ),
                if ((r.label ?? '').toString().trim().isNotEmpty || r.note.trim().isNotEmpty)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(top: 6, bottom: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [_cGlassHi, _cGlassLo],
                      ),
                      border: Border.all(color: Colors.white.withOpacity(0.10)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if ((r.label ?? '').toString().trim().isNotEmpty)
                          Text("Label: ${r.label}", style: const TextStyle(fontWeight: FontWeight.w600)),
                        if (r.note.trim().isNotEmpty) ...[
                          if ((r.label ?? '').toString().trim().isNotEmpty) const SizedBox(height: 6),
                          const Text("Note:", style: TextStyle(fontWeight: FontWeight.w600)),
                          Text(r.note),
                        ]
                      ],
                    ),
                  ),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.edit),
                        label: const Text("Edit"),
                        onPressed: () {
                          Navigator.pop(context);
                          _openEditSheet(r);
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.delete_outline),
                        label: const Text("Delete"),
                        style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                        onPressed: () {
                          Navigator.pop(context);
                          _confirmDelete(r);
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _openEditSheet(_TxnRow r) {
    final isIncome = r.isIncome;
    final TextEditingController amountC = TextEditingController(text: r.amount.toStringAsFixed(0));
    final TextEditingController labelC = TextEditingController(text: r.label ?? "");
    final TextEditingController noteC = TextEditingController(text: r.note);
    DateTime date = r.date;
    String category = r.category;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) {
        return Padding(
          padding: EdgeInsets.only(
            left: 14, right: 14, top: 8,
            bottom: 14 + MediaQuery.of(context).viewInsets.bottom,
          ),
          child: StatefulBuilder(
            builder: (ctx, setLocal) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Text(isIncome ? "Edit Income" : "Edit Expense",
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                      const Spacer(),
                      IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(ctx)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    controller: amountC,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: "Amount"),
                  ),
                  TextField(
                    controller: labelC,
                    decoration: const InputDecoration(labelText: "Label / Merchant"),
                  ),
                  TextField(
                    controller: noteC,
                    decoration: const InputDecoration(labelText: "Note"),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.calendar_today, size: 18),
                          label: Text(DateFormat('d MMM, h:mm a').format(date)),
                          onPressed: () async {
                            final picked = await showDatePicker(
                              context: ctx,
                              initialDate: date,
                              firstDate: DateTime(2000),
                              lastDate: DateTime.now().add(const Duration(days: 365)),
                            );
                            if (picked != null) {
                              setLocal(() {
                                date = DateTime(picked.year, picked.month, picked.day, date.hour, date.minute);
                              });
                            }
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () async {
                            final cats = isIncome
                                ? kIncomeCategories
                                : const [
                              'Food & Dining','Groceries','Transport','Fuel','Shopping','Bills & Utilities',
                              'Rent','EMI & Loans','Subscriptions','Health','Education','Travel',
                              'Entertainment','Fees & Charges','Investments','Transfers (Self)','Other'
                            ];
                            final idx = max(0, cats.indexOf(category));
                            setLocal(() => category = cats[(idx + 1) % cats.length]);
                          },
                          child: Text("Category: $category"),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.save),
                      label: const Text("Save"),
                      onPressed: () async {
                        final amt = double.tryParse(amountC.text.trim()) ?? r.amount;
                        if (isIncome) {
                          final IncomeItem src = r.raw as IncomeItem;
                          final updated = IncomeItem(
                            id: src.id,
                            amount: amt,
                            date: date,
                            note: noteC.text,
                            label: labelC.text,
                            type: category,
                            source: src.source,
                          );
                          try { await IncomeService().updateIncome(widget.userPhone, updated); } catch (_) {}
                          final idx = _allIncomes.indexOf(src);
                          if (idx >= 0) _allIncomes[idx] = updated;
                        } else {
                          final ExpenseItem src = r.raw as ExpenseItem;
                          final updated = ExpenseItem(
                            id: src.id,
                            amount: amt,
                            date: date,
                            note: noteC.text,
                            label: labelC.text,
                            type: category,
                            payerId: src.payerId,
                            friendIds: src.friendIds,
                            groupId: src.groupId,
                            settledFriendIds: src.settledFriendIds,
                            customSplits: src.customSplits,
                            cardLast4: src.cardLast4,
                          );
                          try { await ExpenseService().updateExpense(widget.userPhone, updated); } catch (_) {}
                          final idx = _allExpenses.indexOf(src);
                          if (idx >= 0) _allExpenses[idx] = updated;
                        }
                        _recompute();
                        if (mounted) Navigator.pop(context);
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Transaction updated")));
                        }
                      },
                    ),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }

  void _confirmDelete(_TxnRow r) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Delete transaction?"),
        content: Text("This will remove the ${r.isIncome ? 'income' : 'expense'} permanently."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("Cancel")),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            onPressed: () async {
              Navigator.pop(context);
              if (r.isIncome) {
                final IncomeItem src = r.raw as IncomeItem;
                try { await IncomeService().deleteIncome(widget.userPhone, src.id); } catch (_) {}
                _allIncomes.remove(src);
              } else {
                final ExpenseItem src = r.raw as ExpenseItem;
                try { await ExpenseService().deleteExpense(widget.userPhone, src.id); } catch (_) {}
                _allExpenses.remove(src);
              }
              _recompute();
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Transaction deleted")));
              }
            },
            child: const Text("Delete"),
          ),
        ],
      ),
    );
  }

  // === Friends / Groups sheets ===
  void _openFriendsGroupsSheet({int initialTab = 0}) {
    final fAgg = _friendAgg();
    final gAgg = _groupAgg();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) {
        return DefaultTabController(
          initialIndex: initialTab.clamp(0, 1),
          length: 2,
          child: SizedBox(
            height: MediaQuery.of(context).size.height * 0.88,
            child: Column(
              children: [
                Row(
                  children: [
                    const SizedBox(width: 12),
                    const Expanded(child: Text("Friends & Groups", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18))),
                    IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
                  ],
                ),
                const TabBar(tabs: [Tab(text: "Friends"), Tab(text: "Groups")]),
                Expanded(
                  child: TabBarView(
                    children: [_aggPane(fAgg), _aggPane(gAgg)],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _aggPane(List<_Agg> aggs) {
    if (aggs.isEmpty) {
      return const Center(child: Text("No matching transactions."));
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 18),
      itemCount: aggs.length,
      separatorBuilder: (_, __) => const Divider(height: 10),
      itemBuilder: (_, i) {
        final a = aggs[i];
        return ListTile(
          title: Text(a.key, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text("${a.count} transactions"),
          trailing: Text(_inr0.format(a.sum), style: const TextStyle(fontWeight: FontWeight.bold)),
          onTap: () => _openTxnSheet(a.key, a.items.map((e) => _TxnRow.expense(e, _expenseCategoryOf(e))).toList()),
        );
      },
    );
  }

  // === Generic list sheet ===
  void _openTxnSheet(String title, List<_TxnRow> rows) {
    rows.sort((a, b) => -a.amount.compareTo(b.amount));
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) {
        final h = MediaQuery.of(context).size.height * 0.82;
        return SizedBox(
          height: h,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 18),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18))),
                    IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
                  ],
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: ListView.separated(
                    itemCount: rows.length,
                    separatorBuilder: (_, __) => const Divider(height: 8),
                    itemBuilder: (_, i) => _txnTile(rows[i]),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // === Sort UI ===
  Widget _sortButton({bool compact = false}) {
    final label = () {
      switch (_sortBy) {
        case SortBy.amountDesc: return "Amount ↓";
        case SortBy.amountAsc:  return "Amount ↑";
        case SortBy.dateDesc:   return "Date ↓";
        case SortBy.dateAsc:    return "Date ↑";
      }
    }();

    final button = PopupMenuButton<SortBy>(
      tooltip: "Sort",
      onSelected: (v) => setState(() {
        _sortBy = v;
        _cacheMergedSorted = null; // resort quickly
      }),
      itemBuilder: (_) => const [
        PopupMenuItem(value: SortBy.amountDesc, child: Text("Amount ↓")),
        PopupMenuItem(value: SortBy.amountAsc,  child: Text("Amount ↑")),
        PopupMenuItem(value: SortBy.dateDesc,   child: Text("Date ↓")),
        PopupMenuItem(value: SortBy.dateAsc,    child: Text("Date ↑")),
      ],
      child: compact
          ? Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8.0),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.sort, size: 18), const SizedBox(width: 6), Text(label),
        ]),
      )
          : OutlinedButton.icon(icon: const Icon(Icons.sort), label: Text(label), onPressed: null),
    );
    return button;
  }

  // === Date range picker ===
  Future<void> _pickRange() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDateRange: _selectedFilter == 'Custom' && _customFrom != null && _customTo != null
          ? DateTimeRange(start: _customFrom!, end: _customTo!)
          : null,
    );
    if (picked != null) {
      setState(() {
        _selectedFilter = 'Custom';
        _customFrom = _d(picked.start);
        _customTo = _d(picked.end);
      });
      _recompute();
    }
  }

  // === Threshold editor ===
  Future<void> _editThreshold() async {
    int temp = _hvThreshold;
    await showModalBottomSheet(
      context: context,
      showDragHandle: true,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text("High-value threshold", style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  Text("Current: ₹$temp"),
                  Slider(
                    value: temp.toDouble().clamp(50, 10000),
                    min: 50, max: 10000, divisions: 199, label: "₹$temp",
                    onChanged: (v) => setLocal(() => temp = v.round()),
                  ),
                  
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      TextButton(onPressed: () => Navigator.pop(context), child: const Text("Cancel")),
                      const Spacer(),
                      ElevatedButton(
                        onPressed: () {
                          setState(() => _hvThreshold = temp);
                          _cacheHvByDate = null;
                          Navigator.pop(context);
                        },
                        child: const Text("Apply"),
                      ),
                    ],
                  )
                ],
              ),
            );
          },
        );
      },
    );
  }

  // === tiny skeleton helper ===
  Widget _skeleton({double height = 80}) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.06),
        gradient: LinearGradient(
          colors: [Colors.white.withOpacity(0.06), Colors.white.withOpacity(0.09)],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
      ),
    );
  }
}

// ================= Donut — Expenses =================
class _CategoryDonut extends StatefulWidget {
  final List<_Agg> aggs;
  final double total;
  final void Function(_Agg agg) onSlice;

  const _CategoryDonut({required this.aggs, required this.total, required this.onSlice});

  @override
  State<_CategoryDonut> createState() => _CategoryDonutState();
}

class _CategoryDonutState extends State<_CategoryDonut> {
  final _inr0 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  _Agg? _selected;

  @override
  Widget build(BuildContext context) {
    final data = widget.aggs.where((a) => a.sum > 0).toList();
    final total = data.fold<double>(0, (s, a) => s + a.sum);
    if (total <= 0) {
      return const Padding(padding: EdgeInsets.all(12), child: Text("No expense split for this period."));
    }

    final List<Color> palette = <Color>[
      _AnalyticsScreenState._cHeadline, Colors.indigo, Colors.deepPurple, Colors.orange,
      Colors.cyan, Colors.pink, Colors.brown, Colors.teal, Colors.lime, Colors.blueGrey,
    ];

    const startAt = -pi / 2;
    double acc = 0.0;
    final slices = <_Slice>[];
    for (var i = 0; i < data.length; i++) {
      final a = data[i];
      final frac = (a.sum / total).clamp(0.0, 1.0);
      final sweep = frac * 2 * pi;
      final color = a.key.toLowerCase() == 'other' ? Colors.blueGrey : palette[i % palette.length];
      slices.add(_Slice(agg: a, start: startAt + acc, sweep: sweep, color: color));
      acc += sweep;
    }

    final sel = _selected;

    return Column(
      children: [
        SizedBox(
          height: 220,
          child: LayoutBuilder(
            builder: (ctx, c) {
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (d) {
                  final box = ctx.findRenderObject() as RenderBox;
                  final local = box.globalToLocal(d.globalPosition);
                  final tapped = _hitTestSlice(local, c.biggest, slices);
                  if (tapped != null) setState(() => _selected = tapped.agg);
                },
                onLongPressStart: (_) {
                  final s = _selected;
                  if (s != null) widget.onSlice(s);
                },
                child: CustomPaint(
                  painter: _DonutPainter(
                    slices: slices,
                    bgTrack: Colors.white.withOpacity(0.12),
                    stroke: 26,
                    selectedKey: sel?.key,
                  ),
                  child: Center(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      child: sel == null
                          ? Column(
                        key: const ValueKey('center-total'),
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text("Expense", style: TextStyle(fontWeight: FontWeight.w600, color: Colors.black54)),
                          Text(_inr0.format(widget.total), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                        ],
                      )
                          : Column(
                        key: const ValueKey('center-selected'),
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(sel.key, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 2),
                          Text(_inr0.format(sel.sum), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                          const SizedBox(height: 2),
                          Text("${sel.count} transactions",
                              style: const TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        if (sel != null)
          Align(
            alignment: Alignment.center,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.list_alt),
              label: const Text("View transactions"),
              onPressed: () => widget.onSlice(sel),
            ),
          ),
        if (slices.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 10, runSpacing: 8,
            children: slices.take(6).map((s) {
              final pct = (s.sweep / (2 * pi) * 100).toStringAsFixed(0);
              final isSel = sel?.key == s.agg.key;
              return InkWell(
                onTap: () => setState(() => _selected = s.agg),
                onLongPress: () => widget.onSlice(s.agg),
                borderRadius: BorderRadius.circular(100),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(100),
                    color: Colors.white.withOpacity(isSel ? 0.18 : 0.12),
                    border: Border.all(color: Colors.white.withOpacity(isSel ? 0.30 : 0.18)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(width: 10, height: 10, decoration: BoxDecoration(color: s.color, borderRadius: BorderRadius.circular(50))),
                      const SizedBox(width: 6),
                      Text("${s.agg.key} • $pct%", style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ],
    );
  }

  _Slice? _hitTestSlice(Offset p, Size size, List<_Slice> slices) {
    final center = Offset(size.width / 2, size.height / 2);
    final v = p - center;
    final r = v.distance;
    final outer = min(size.width, size.height) / 2 - 8;
    final inner = outer - 26;
    if (r < inner || r > outer) return null;

    double ang = atan2(v.dy, v.dx);
    ang = (ang + 2 * pi) % (2 * pi);
    double aFromTop = ang - (-pi / 2);
    if (aFromTop < 0) aFromTop += 2 * pi;

    double acc = 0.0;
    for (final s in slices) {
      if (aFromTop >= acc && aFromTop < acc + s.sweep) return s;
      acc += s.sweep;
    }
    return null;
  }
}

class _Slice {
  final _Agg agg;
  final double start;
  final double sweep;
  final Color color;
  _Slice({required this.agg, required this.start, required this.sweep, required this.color});
}

class _DonutPainter extends CustomPainter {
  final List<_Slice> slices;
  final double stroke;
  final Color bgTrack;
  final String? selectedKey;

  _DonutPainter({required this.slices, required this.stroke, required this.bgTrack, required this.selectedKey});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = min(size.width, size.height) / 2 - 8;
    final rect = Rect.fromCircle(center: center, radius: radius);

    final track = Paint()
      ..color = bgTrack
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.butt
      ..isAntiAlias = true;
    canvas.drawArc(rect, 0, 2 * pi, false, track);

    for (final s in slices) {
      final isSel = s.agg.key == selectedKey;
      final p = Paint()
        ..color = isSel ? s.color : s.color.withOpacity(0.75)
        ..style = PaintingStyle.stroke
        ..strokeWidth = isSel ? stroke + 6 : stroke
        ..strokeCap = StrokeCap.butt
        ..isAntiAlias = true;
      canvas.drawArc(rect, s.start, s.sweep, false, p);
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter old) =>
      old.slices != slices || old.stroke != stroke || old.bgTrack != bgTrack || old.selectedKey != selectedKey;
}

// ================= Donut — Incomes =================
class _IncomeDonut extends StatefulWidget {
  final List<_AggInc> aggs;
  final double total;
  final void Function(_AggInc agg) onSlice;
  const _IncomeDonut({required this.aggs, required this.total, required this.onSlice});
  @override
  State<_IncomeDonut> createState() => _IncomeDonutState();
}

class _IncomeDonutState extends State<_IncomeDonut> {
  final _inr0 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  _AggInc? _selected;

  @override
  Widget build(BuildContext context) {
    final data = widget.aggs.where((a) => a.sum > 0).toList();
    final total = data.fold<double>(0, (s, a) => s + a.sum);
    if (total <= 0) {
      return const Padding(padding: EdgeInsets.all(12), child: Text("No income split for this period."));
    }

    final List<Color> palette = <Color>[
      _AnalyticsScreenState._cIncome, Colors.indigo, Colors.deepPurple, Colors.orange,
      Colors.cyan, Colors.pink, Colors.brown, Colors.teal, Colors.lime, Colors.blueGrey,
    ];

    const startAt = -pi / 2;
    double acc = 0.0;
    final slices = <_SliceInc>[];
    for (var i = 0; i < data.length; i++) {
      final a = data[i];
      final frac = (a.sum / total).clamp(0.0, 1.0);
      final sweep = frac * 2 * pi;
      final color = a.key.toLowerCase() == 'other' ? Colors.blueGrey : palette[i % palette.length];
      slices.add(_SliceInc(agg: a, start: startAt + acc, sweep: sweep, color: color));
      acc += sweep;
    }

    final sel = _selected;

    return Column(
      children: [
        SizedBox(
          height: 220,
          child: LayoutBuilder(
            builder: (ctx, c) {
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (d) {
                  final box = ctx.findRenderObject() as RenderBox;
                  final local = box.globalToLocal(d.globalPosition);
                  final tapped = _hitTestSlice(local, c.biggest, slices);
                  if (tapped != null) setState(() => _selected = tapped.agg);
                },
                onLongPressStart: (_) {
                  final s = _selected;
                  if (s != null) widget.onSlice(s);
                },
                child: CustomPaint(
                  painter: _DonutPainterInc(
                    slices: slices,
                    bgTrack: Colors.white.withOpacity(0.12),
                    stroke: 26,
                    selectedKey: sel?.key,
                  ),
                  child: Center(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      child: sel == null
                          ? Column(
                        key: const ValueKey('inc-center-total'),
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text("Income", style: TextStyle(fontWeight: FontWeight.w600, color: Colors.black54)),
                          Text(_inr0.format(widget.total), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                        ],
                      )
                          : Column(
                        key: const ValueKey('inc-center-selected'),
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(sel.key, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 2),
                          Text(_inr0.format(sel.sum), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                          const SizedBox(height: 2),
                          Text("${sel.count} transactions",
                              style: const TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        if (sel != null)
          Align(
            alignment: Alignment.center,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.list_alt),
              label: const Text("View transactions"),
              onPressed: () => widget.onSlice(sel),
            ),
          ),
        if (slices.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 10, runSpacing: 8,
            children: slices.take(6).map((s) {
              final pct = (s.sweep / (2 * pi) * 100).toStringAsFixed(0);
              final isSel = sel?.key == s.agg.key;
              return InkWell(
                onTap: () => setState(() => _selected = s.agg),
                onLongPress: () => widget.onSlice(s.agg),
                borderRadius: BorderRadius.circular(100),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(100),
                    color: Colors.white.withOpacity(isSel ? 0.18 : 0.12),
                    border: Border.all(color: Colors.white.withOpacity(isSel ? 0.30 : 0.18)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(width: 10, height: 10, decoration: BoxDecoration(color: s.color, borderRadius: BorderRadius.circular(50))),
                      const SizedBox(width: 6),
                      Text("${s.agg.key} • $pct%", style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ],
    );
  }

  _SliceInc? _hitTestSlice(Offset p, Size size, List<_SliceInc> slices) {
    final center = Offset(size.width / 2, size.height / 2);
    final v = p - center;
    final r = v.distance;
    final outer = min(size.width, size.height) / 2 - 8;
    final inner = outer - 26;
    if (r < inner || r > outer) return null;

    double ang = atan2(v.dy, v.dx);
    ang = (ang + 2 * pi) % (2 * pi);
    double aFromTop = ang - (-pi / 2);
    if (aFromTop < 0) aFromTop += 2 * pi;

    double acc = 0.0;
    for (final s in slices) {
      if (aFromTop >= acc && aFromTop < acc + s.sweep) return s;
      acc += s.sweep;
    }
    return null;
  }
}

class _SliceInc {
  final _AggInc agg;
  final double start;
  final double sweep;
  final Color color;
  _SliceInc({required this.agg, required this.start, required this.sweep, required this.color});
}

class _DonutPainterInc extends CustomPainter {
  final List<_SliceInc> slices;
  final double stroke;
  final Color bgTrack;
  final String? selectedKey;

  _DonutPainterInc({required this.slices, required this.stroke, required this.bgTrack, required this.selectedKey});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = min(size.width, size.height) / 2 - 8;
    final rect = Rect.fromCircle(center: center, radius: radius);

    final track = Paint()
      ..color = bgTrack
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.butt
      ..isAntiAlias = true;
    canvas.drawArc(rect, 0, 2 * pi, false, track);

    for (final s in slices) {
      final isSel = s.agg.key == selectedKey;
      final p = Paint()
        ..color = isSel ? s.color : s.color.withOpacity(0.75)
        ..style = PaintingStyle.stroke
        ..strokeWidth = isSel ? stroke + 6 : stroke
        ..strokeCap = StrokeCap.butt
        ..isAntiAlias = true;
      canvas.drawArc(rect, s.start, s.sweep, false, p);
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainterInc old) =>
      old.slices != slices || old.stroke != stroke || old.bgTrack != bgTrack || old.selectedKey != selectedKey;
}
