// `lib/screens/dashboard_screen.dart`

import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../models/goal_model.dart';
import '../models/insight_model.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../services/goal_service.dart';
import '../services/loan_service.dart';
import '../services/asset_service.dart';
import '../services/fiinny_brain_service.dart';
import '../services/notification_service.dart';
import '../widgets/smart_insights_card.dart';
import '../widgets/insight_feed_card.dart';
import '../widgets/smart_nudge_widget.dart';
import '../widgets/crisis_alert_banner.dart';
import '../themes/custom_card.dart';
import '../widgets/loans_summary_card.dart';
import '../widgets/assets_summary_card.dart';
import '../widgets/tx_filter_bar.dart';
import '../widgets/transactions_summary_card.dart';
import '../services/user_data.dart';
import '../screens/insight_feed_screen.dart';
import '../widgets/dashboard_activity_tab.dart';
import '../models/activity_event.dart';
import 'dashboard_activity_screen.dart';
import '../widgets/transaction_count_card.dart';
import '../widgets/transaction_amount_card.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
// NEW portfolio module imports (aliased so they don't clash with your old service/model)
import '../fiinny_assets/modules/portfolio/services/asset_service.dart' as PAssetService;
import '../fiinny_assets/modules/portfolio/models/asset_model.dart' as PAssetModel;
import '../fiinny_assets/modules/portfolio/models/price_quote.dart';
import '../fiinny_assets/modules/portfolio/services/market_data_yahoo.dart';

import '../services/sync/sync_coordinator.dart';

// Use your **old** Gmail service (the snippet-based one you pasted)
import '../services/gmail_service.dart' as OldGmail;
import '../widgets/goals_summary_card.dart';
import '../widgets/add_goal_dialog.dart';
import '../services/notif_prefs_service.dart';

// Fiinnny Brain cards
import '../widgets/fiinny_brain_diagnosis_card.dart';
// (optional) quick monthly fees-only card if you also want it
import '../widgets/hidden_charges_card.dart';
import '../widgets/forex_charges_card.dart';
import '../widgets/salary_predictor_card.dart';

import '../brain/loan_detection_service.dart';
import '../widgets/loan_suggestions_sheet.dart';

import '../widgets/fiinny_brain_diagnosis_card.dart';
import '../widgets/hidden_charges_review_sheet.dart';
import '../widgets/forex_findings_sheet.dart';

import '../screens/review_inbox_screen.dart';
import '../services/review_queue_service.dart';
import '../models/ingest_draft_model.dart';

// Adds Imports
import 'package:lifemap/core/ads/adaptive_banner.dart';
import 'package:lifemap/core/ads/ad_ids.dart';
import '../core/ads/ad_service.dart';

import '../core/notifications/local_notifications.dart'
    show SystemRecurringLocalScheduler;


// --- Helper getters for dynamic model ---
DateTime getTxDate(dynamic tx) =>
    tx is IncomeItem ? tx.date : (tx as ExpenseItem).date;
double getTxAmount(dynamic tx) =>
    tx is IncomeItem ? tx.amount : (tx as ExpenseItem).amount;

class DashboardScreen extends StatefulWidget {
  final String userPhone;
  const DashboardScreen({required this.userPhone, Key? key}) : super(key: key);

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> with WidgetsBindingObserver {
  bool _loading = true;
  bool _showFetchButton = true;
  double totalIncome = 0.0;
  double totalExpense = 0.0;
  double savings = 0.0;
  double totalLoan = 0.0;
  int loanCount = 0;
  double totalAssets = 0.0;
  int assetCount = 0;
  List<GoalModel> goals = [];
  GoalModel? currentGoal;
  List<InsightModel> insights = [];
  List<ActivityEvent> dashboardEvents = [];
  String smartInsight = "";
  String? userAvatar = "assets/images/profile_default.png";
  String txPeriod = "Today"; // D, W, M, Y, etc.
  List<ExpenseItem> allExpenses = [];
  List<IncomeItem> allIncomes = [];
  late UserData _mockUserData;
  String? userName; // will be fetched from Firestore
  bool _isEmailLinked = false;
  String? _userEmail;
  // Helper: Firestore doc ID for this user
  String get _userDocId => widget.userPhone;

  bool _isFetchingEmail = false;
  SystemRecurringLocalScheduler? _sysNotifs;


  // --- Limit logic ---
  double? _periodLimit;
  bool _savingLimit = false;
  bool _warned80 = false;
  bool _warned100 = false;
  final _expenseSvc = ExpenseService();
  final _incomeSvc  = IncomeService();

  final _loanDetector = LoanDetectionService();
  int _loanSuggestionsCount = 0;
  bool _scanningLoans = false;

  // 🔴 NEW: live counters from Firestore
  StreamSubscription? _subsSub, _sipsSub, _cardsSub;
  int _activeSubs = 0;
  int _activeSips = 0;
  int _cardsDue = 0;
  int _autopayCount = 0; // derived from current period

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initDashboard();
    _wirePipelines(); // kick off Gmail backfill (if linked)
    SyncCoordinator.instance.onAppStart(widget.userPhone);
    // 🔔 Start system recurring reminders (subs, SIPs, loans, card bills)
    _sysNotifs = SystemRecurringLocalScheduler(userId: widget.userPhone);
    _sysNotifs!.bind();

    Future.microtask(() async {
      await _fetchUserName();              // sets _isEmailLinked / _userEmail
      await _wirePipelines();              // trigger Gmail backfill after profile loads
      await SyncCoordinator.instance.onAppStart(widget.userPhone);
    });

    _wireLiveCounters(); // 🔴 start Firestore listeners

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      await NotificationService.initFull();
      await AdService.initLater();
    });
  }


  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    SyncCoordinator.instance.onAppStop();
    _subsSub?.cancel();
    _sysNotifs?.unbind();
    _sipsSub?.cancel();
    _cardsSub?.cancel();
    super.dispose();
  }


  // 🔴 Firestore listeners for Subscriptions / SIPs / Cards
  void _wireLiveCounters() {
    final db = FirebaseFirestore.instance;
    _subsSub = db
        .collection('users').doc(widget.userPhone)
        .collection('subscriptions')
        .where('active', isEqualTo: true)
        .snapshots()
        .listen((snap) {
      if (!mounted) return;
      setState(() => _activeSubs = snap.size);
    });

    _sipsSub = db
        .collection('users').doc(widget.userPhone)
        .collection('sips')
        .where('active', isEqualTo: true)
        .snapshots()
        .listen((snap) {
      if (!mounted) return;
      setState(() => _activeSips = snap.size);
    });

    _cardsSub = db
        .collection('users').doc(widget.userPhone)
        .collection('cards')
        .snapshots()
        .listen((snap) {
      if (!mounted) return;
      int due = 0;
      final now = DateTime.now();
      for (final d in snap.docs) {
        final data = d.data();
        final status = (data['status'] ?? '').toString().toLowerCase();
        final lastBill = data['lastBill'] as Map<String, dynamic>?;
        DateTime? dueDate;
        if (lastBill != null && lastBill['dueDate'] is Timestamp) {
          dueDate = (lastBill['dueDate'] as Timestamp).toDate();
        }
        if (status == 'due') {
          due++;
        } else if (dueDate != null && !now.isBefore(dueDate)) {
          // if dueDate is today/past and status not set, still count as due
          due++;
        }
      }
      setState(() => _cardsDue = due);
    });
  }

  Future<void> _openSubscriptionsAndBills(BuildContext context) async {
    await Navigator.pushNamed(
      context,
      '/subs-bills',
      arguments: {'userPhone': widget.userPhone},
    );
    if (!mounted) return;
    await _initDashboard();
  }

  // --- recompute derived autopay count for current period filter
  void _recomputeAutopayCount() {
    final list = _filteredExpensesForPeriod(txPeriod);
    setState(() {
      _autopayCount = list.where((e) => (e.tags ?? const []).contains('autopay')).length;
    });
  }

  Future<void> _fetchUserName() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userPhone)
          .get();
      if (doc.exists && doc.data()?['name'] != null) {
        setState(() {
          userName = doc.data()!['name'];
          _userEmail = doc.data()!['email'];
          _isEmailLinked = (_userEmail != null && _userEmail!.isNotEmpty);
        });
      } else {
        setState(() {
          userName = "there";
          _isEmailLinked = false;
        });
      }
    } catch (e) {
      setState(() {
        userName = "there";
        _isEmailLinked = false;
      });
    }
  }

  Future<void> _wirePipelines() async {
    if (_isEmailLinked == true && (_userEmail?.isNotEmpty ?? false)) {
      await _maybeRunGmailBackfillOnce();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      SyncCoordinator.instance.onAppResume(widget.userPhone);
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.detached) {
      SyncCoordinator.instance.onAppStop();
    }
    super.didChangeAppLifecycleState(state);
  }

  Future<void> _maybeRunGmailBackfillOnce() async {
    final docRef = FirebaseFirestore.instance.collection('users').doc(_userDocId);
    bool already = false;
    try {
      final snapshot = await docRef.get();
      already = (snapshot.data()?['gmailBackfillDone'] == true);
    } catch (e) {
      debugPrint('Gmail backfill flag read failed: $e');
    }

    if (already) return;

    try {
      await OldGmail.GmailService().fetchAndStoreTransactionsFromGmail(widget.userPhone);
      await docRef.set({
        'gmailBackfillDone': true,
        'gmailBackfillUpdatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      await _initDashboard(); // refresh UI
    } catch (e) {
      debugPrint('Gmail backfill error: $e');
    }
  }

  Future<void> _fetchEmailTx() async {
    setState(() => _isFetchingEmail = true);
    try {
      await OldGmail.GmailService().fetchAndStoreTransactionsFromGmail(widget.userPhone);
      await _initDashboard();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Fetched Gmail transactions!"), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Failed to fetch email data: $e"), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isFetchingEmail = false);
    }
  }

  Future<void> _loadPortfolioTotals() async {
    final pService = PAssetService.AssetService();
    final market = MarketDataYahoo();

    // Load new holdings from the Firestore-backed portfolio module
    final List<PAssetModel.AssetModel> assets = await pService.loadAssets();

    // Build symbols to quote
    final symbols = <String>{
      for (final a in assets)
        a.type == 'stock' ? a.name.toUpperCase() : 'GOLD',
    }.toList();

    Map<String, PriceQuote> quotes = {};
    if (symbols.isNotEmpty) {
      quotes = await market.fetchQuotes(symbols);
    }

    // Sum current value using latest price (fallback: avgBuyPrice)
    double total = 0.0;
    for (final a in assets) {
      final key = a.type == 'stock' ? a.name.toUpperCase() : 'GOLD';
      final ltp = quotes[key]?.ltp ?? a.avgBuyPrice;
      total += a.quantity * ltp;
    }

    setState(() {
      assetCount = assets.length;
      totalAssets = total;
    });
  }

  // 1️⃣ --- Filtering Helpers ---
  List<ExpenseItem> _filteredExpensesForPeriod(String period) {
    DateTime now = DateTime.now();
    if (period == "D" || period == "Today") {
      return allExpenses
          .where((e) =>
      e.date.year == now.year &&
          e.date.month == now.month &&
          e.date.day == now.day)
          .toList();
    } else if (period == "W" || period == "This Week") {
      DateTime startOfWeek = now.subtract(Duration(days: now.weekday - 1));
      DateTime endOfWeek = startOfWeek.add(const Duration(days: 6));
      return allExpenses
          .where((e) =>
      e.date.isAfter(startOfWeek.subtract(const Duration(days: 1))) &&
          e.date.isBefore(endOfWeek.add(const Duration(days: 1))))
          .toList();
    } else if (period == "M" || period == "This Month") {
      return allExpenses
          .where((e) => e.date.year == now.year && e.date.month == now.month)
          .toList();
    } else if (period == "Y" || period == "This Year") {
      return allExpenses.where((e) => e.date.year == now.year).toList();
    } else if (period == "Last 2 Days") {
      DateTime start = now.subtract(const Duration(days: 1));
      return allExpenses
          .where((e) => e.date.isAfter(start.subtract(const Duration(days: 1))))
          .toList();
    } else if (period == "Last 5 Days") {
      DateTime start = now.subtract(const Duration(days: 4));
      return allExpenses
          .where((e) => e.date.isAfter(start.subtract(const Duration(days: 1))))
          .toList();
    } else if (period == "All Time") {
      return allExpenses;
    }
    // fallback (just in case)
    return allExpenses;
  }

  List<IncomeItem> _filteredIncomesForPeriod(String period) {
    DateTime now = DateTime.now();
    if (period == "D" || period == "Today") {
      return allIncomes
          .where((e) =>
      e.date.year == now.year &&
          e.date.month == now.month &&
          e.date.day == now.day)
          .toList();
    } else if (period == "W" || period == "This Week") {
      DateTime startOfWeek = now.subtract(Duration(days: now.weekday - 1));
      DateTime endOfWeek = startOfWeek.add(const Duration(days: 6));
      return allIncomes
          .where((e) =>
      e.date.isAfter(startOfWeek.subtract(const Duration(days: 1))) &&
          e.date.isBefore(endOfWeek.add(const Duration(days: 1))))
          .toList();
    } else if (period == "M" || period == "This Month") {
      return allIncomes
          .where((e) => e.date.year == now.year && e.date.month == now.month)
          .toList();
    } else if (period == "Y" || period == "This Year") {
      return allIncomes.where((e) => e.date.year == now.year).toList();
    } else if (period == "Last 2 Days") {
      DateTime start = now.subtract(const Duration(days: 1));
      return allIncomes
          .where((e) => e.date.isAfter(start.subtract(const Duration(days: 1))))
          .toList();
    } else if (period == "Last 5 Days") {
      DateTime start = now.subtract(const Duration(days: 4));
      return allIncomes
          .where((e) => e.date.isAfter(start.subtract(const Duration(days: 1))))
          .toList();
    } else if (period == "All Time") {
      return allIncomes;
    }
    // fallback (just in case)
    return allIncomes;
  }

  // --- Limit helpers (SPENDING only) ---
  double get periodSpendOnly {
    return _filteredExpensesForPeriod(txPeriod).fold(0.0, (a, b) => a + b.amount);
  }

  void _resetLimitWarnings() {
    _warned80 = false;
    _warned100 = false;
  }

  void _checkLimitWarnings() {
    if (_periodLimit == null || _periodLimit! <= 0) return;
    final used = periodSpendOnly;
    final ratio = used / _periodLimit!;
    if (!_warned80 && ratio >= 0.8 && ratio < 1.0) {
      _warned80 = true;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Heads up: You’ve crossed 80% of this period’s spending limit."),
          backgroundColor: Colors.orange,
        ),
      );
    }
    if (!_warned100 && ratio >= 1.0) {
      _warned100 = true;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Limit exceeded: You’ve spent over the limit for this period."),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  // 2️⃣ --- Bar Data for Amount ---
  List<double> _barDataAmount() {
    final expenses = _filteredExpensesForPeriod(txPeriod);
    final incomes = _filteredIncomesForPeriod(txPeriod);
    final now = DateTime.now();

    if (txPeriod == "D" || txPeriod == "Today") {
      // 24h bar
      List<double> bars = List.filled(24, 0.0);
      for (var e in expenses) {
        bars[e.date.hour] += e.amount;
      }
      for (var i in incomes) {
        bars[i.date.hour] += i.amount;
      }
      return bars;
    } else if (txPeriod == "W" || txPeriod == "This Week") {
      // 7 days, Mon-Sun
      List<double> bars = List.filled(7, 0.0);
      for (var e in expenses) {
        bars[e.date.weekday - 1] += e.amount;
      }
      for (var i in incomes) {
        bars[i.date.weekday - 1] += i.amount;
      }
      return bars;
    } else if (txPeriod == "M" || txPeriod == "This Month") {
      // N days in this month
      int days = DateTime(now.year, now.month + 1, 0).day;
      List<double> bars = List.filled(days, 0.0);
      for (var e in expenses) {
        bars[e.date.day - 1] += e.amount;
      }
      for (var i in incomes) {
        bars[i.date.day - 1] += i.amount;
      }
      return bars;
    } else if (txPeriod == "Y" || txPeriod == "This Year") {
      // 12 months
      List<double> bars = List.filled(12, 0.0);
      for (var e in expenses) {
        bars[e.date.month - 1] += e.amount;
      }
      for (var i in incomes) {
        bars[i.date.month - 1] += i.amount;
      }
      return bars;
    } else if (txPeriod == "Last 2 Days") {
      // 2 bars: yesterday & today
      List<double> bars = List.filled(2, 0.0);
      DateTime yesterday = now.subtract(const Duration(days: 1));
      for (var e in expenses) {
        if (_isSameDay(e.date, now)) {
          bars[1] += e.amount;
        } else if (_isSameDay(e.date, yesterday)) {
          bars[0] += e.amount;
        }
      }
      for (var i in incomes) {
        if (_isSameDay(i.date, now)) {
          bars[1] += i.amount;
        } else if (_isSameDay(i.date, yesterday)) {
          bars[0] += i.amount;
        }
      }
      return bars;
    } else if (txPeriod == "Last 5 Days") {
      // 5 bars: today, yesterday, etc.
      List<double> bars = List.filled(5, 0.0);
      for (var d = 0; d < 5; d++) {
        final targetDay = now.subtract(Duration(days: 4 - d));
        for (var e in expenses) {
          if (_isSameDay(e.date, targetDay)) bars[d] += e.amount;
        }
        for (var i in incomes) {
          if (_isSameDay(i.date, targetDay)) bars[d] += i.amount;
        }
      }
      return bars;
    } else if (txPeriod == "All Time") {
      // Each bar = a month (from oldest tx to newest)
      if (expenses.isEmpty && incomes.isEmpty) return [];
      // Find min & max month/year
      DateTime? minDate, maxDate;
      for (var e in expenses) {
        if (minDate == null || e.date.isBefore(minDate)) minDate = e.date;
        if (maxDate == null || e.date.isAfter(maxDate)) maxDate = e.date;
      }
      for (var i in incomes) {
        if (minDate == null || i.date.isBefore(minDate)) minDate = i.date;
        if (maxDate == null || i.date.isAfter(maxDate)) maxDate = i.date;
      }
      if (minDate == null || maxDate == null) return [];
      int months = (maxDate.year - minDate.year) * 12 +
          (maxDate.month - minDate.month) +
          1;
      List<double> bars = List.filled(months, 0.0);
      for (var e in expenses) {
        int idx = (e.date.year - minDate.year) * 12 +
            (e.date.month - minDate.month);
        bars[idx] += e.amount;
      }
      for (var i in incomes) {
        int idx = (i.date.year - minDate.year) * 12 +
            (i.date.month - minDate.month);
        bars[idx] += i.amount;
      }
      return bars;
    }
    return [];
  }

  List<int> _barDataCount() {
    final expenses = _filteredExpensesForPeriod(txPeriod);
    final incomes = _filteredIncomesForPeriod(txPeriod);
    final now = DateTime.now();

    if (txPeriod == "D" || txPeriod == "Today") {
      List<int> bars = List.filled(24, 0);
      for (var e in expenses) {
        bars[e.date.hour] += 1;
      }
      for (var i in incomes) {
        bars[i.date.hour] += 1;
      }
      return bars;
    } else if (txPeriod == "W" || txPeriod == "This Week") {
      List<int> bars = List.filled(7, 0);
      for (var e in expenses) {
        bars[e.date.weekday - 1] += 1;
      }
      for (var i in incomes) {
        bars[i.date.weekday - 1] += 1;
      }
      return bars;
    } else if (txPeriod == "M" || txPeriod == "This Month") {
      int days = DateTime(now.year, now.month + 1, 0).day;
      List<int> bars = List.filled(days, 0);
      for (var e in expenses) {
        bars[e.date.day - 1] += 1;
      }
      for (var i in incomes) {
        bars[i.date.day - 1] += 1;
      }
      return bars;
    } else if (txPeriod == "Y" || txPeriod == "This Year") {
      List<int> bars = List.filled(12, 0);
      for (var e in expenses) {
        bars[e.date.month - 1] += 1;
      }
      for (var i in incomes) {
        bars[i.date.month - 1] += 1;
      }
      return bars;
    } else if (txPeriod == "Last 2 Days") {
      List<int> bars = List.filled(2, 0);
      DateTime yesterday = now.subtract(const Duration(days: 1));
      for (var e in expenses) {
        if (_isSameDay(e.date, now)) {
          bars[1] += 1;
        } else if (_isSameDay(e.date, yesterday)) {
          bars[0] += 1;
        }
      }
      for (var i in incomes) {
        if (_isSameDay(i.date, now)) {
          bars[1] += 1;
        } else if (_isSameDay(i.date, yesterday)) {
          bars[0] += 1;
        }
      }
      return bars;
    } else if (txPeriod == "Last 5 Days") {
      List<int> bars = List.filled(5, 0);
      for (var d = 0; d < 5; d++) {
        final targetDay = now.subtract(Duration(days: 4 - d));
        for (var e in expenses) {
          if (_isSameDay(e.date, targetDay)) bars[d] += 1;
        }
        for (var i in incomes) {
          if (_isSameDay(i.date, targetDay)) bars[d] += 1;
        }
      }
      return bars;
    } else if (txPeriod == "All Time") {
      if (expenses.isEmpty && incomes.isEmpty) return [];
      DateTime? minDate, maxDate;
      for (var e in expenses) {
        if (minDate == null || e.date.isBefore(minDate)) minDate = e.date;
        if (maxDate == null || e.date.isAfter(maxDate)) maxDate = e.date;
      }
      for (var i in incomes) {
        if (minDate == null || i.date.isBefore(minDate)) minDate = i.date;
        if (maxDate == null || i.date.isAfter(maxDate)) maxDate = i.date;
      }
      if (minDate == null || maxDate == null) return [];
      int months = (maxDate.year - minDate.year) * 12 +
          (maxDate.month - minDate.month) +
          1;
      List<int> bars = List.filled(months, 0);
      for (var e in expenses) {
        int idx = (e.date.year - minDate.year) * 12 +
            (e.date.month - minDate.month);
        bars[idx] += 1;
      }
      for (var i in incomes) {
        int idx = (i.date.year - minDate.year) * 12 +
            (i.date.month - minDate.month);
        bars[idx] += 1;
      }
      return bars;
    }
    return [];
  }

  // --- Utility for date comparison ---
  bool _isSameDay(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  // 4️⃣ --- Get Total For Current Period ---
  double get periodTotalAmount {
    final exp = _filteredExpensesForPeriod(txPeriod)
        .fold(0.0, (a, b) => a + b.amount);
    final inc = _filteredIncomesForPeriod(txPeriod)
        .fold(0.0, (a, b) => a + b.amount);
    return exp + inc;
  }

  int get periodTotalCount {
    final exp = _filteredExpensesForPeriod(txPeriod).length;
    final inc = _filteredIncomesForPeriod(txPeriod).length;
    return exp + inc;
  }

  Future<void> _initDashboard() async {
    setState(() => _loading = true);
    try {
      final expenses = await _expenseSvc.getExpenses(widget.userPhone);
      final incomes  = await _incomeSvc.getIncomes(widget.userPhone);

      allExpenses = expenses;
      allIncomes = incomes;

      goals = await GoalService().getGoals(widget.userPhone);
      currentGoal = goals.isNotEmpty ? goals.first : null;

      final loanService = LoanService();

      // ⬇️ Updated to new LoanService API
      loanCount = await loanService.countOpenLoans(widget.userPhone);
      totalLoan = await loanService.sumOutstanding(widget.userPhone);

      // ⬇️ NEW: compute assets from the Portfolio module store
      await _loadPortfolioTotals();

      totalIncome = incomes
          .where((t) =>
      t.date.month == DateTime.now().month &&
          t.date.year == DateTime.now().year)
          .fold(0.0, (a, b) => a + b.amount);

      totalExpense = expenses
          .where((t) =>
      t.date.month == DateTime.now().month &&
          t.date.year == DateTime.now().year)
          .fold(0.0, (a, b) => a + b.amount);

      savings = totalIncome - totalExpense;
      _showFetchButton = incomes.isEmpty && expenses.isEmpty;
      _generateSmartInsight();

      _mockUserData = UserData(
        incomes: allIncomes,
        expenses: allExpenses,
        goals: goals,
        loans: [],
        assets: [],
      );
      insights = FiinnyBrainService.generateInsights(_mockUserData,
          userId: widget.userPhone);

      // Fetch current limit for this period
      await _loadPeriodLimit();

      // 🔴 recompute autopay derived count for the chosen period
      _recomputeAutopayCount();
    } catch (e) {
      print('[Dashboard] ERROR: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Dashboard error: $e")),
      );
    }

    // 🔎 NEW: refresh "new loan detected" badge count
    try {
      _loanSuggestionsCount =
      await _loanDetector.pendingCount(widget.userPhone);
    } catch (e) {
      debugPrint('[Dashboard] loan suggestions count error: $e');
    }

    setState(() => _loading = false);
    _checkLimitWarnings();
  }

  // --- Limit Firestore Logic ---
  String get _limitDocId => "${widget.userPhone}_$txPeriod";
  Future<void> _loadPeriodLimit() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('limits')
          .doc(_limitDocId)
          .get();
      if (doc.exists && doc.data()?['limit'] != null) {
        _periodLimit = (doc.data()!['limit'] as num?)?.toDouble();
      } else {
        _periodLimit = null;
      }
    } catch (e) {
      _periodLimit = null;
    }
    setState(() {});
  }

  Future<void> _editLimitDialog() async {
    final ctrl = TextEditingController(
      text: _periodLimit != null ? _periodLimit!.toStringAsFixed(0) : '',
    );
    final result = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text("Set Limit for $txPeriod"),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Set a maximum SPENDING limit for the selected period. You’ll get alerts at 80% and 100% of the limit.\n",
              style: TextStyle(fontSize: 14, color: Colors.grey[800]),
            ),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                hintText: "Enter limit amount (₹)",
                suffixIcon: ctrl.text.isNotEmpty
                    ? IconButton(
                  icon: Icon(Icons.clear),
                  onPressed: () => ctrl.clear(),
                )
                    : null,
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            child: Text("Remove"),
            onPressed: () => Navigator.pop(ctx, 0.0),
          ),
          TextButton(
            child: Text("Cancel"),
            onPressed: () => Navigator.pop(ctx, null),
          ),
          ElevatedButton(
            child: Text("Save"),
            onPressed: () {
              final entered = double.tryParse(ctrl.text.trim());
              if (entered != null && entered > 0) {
                Navigator.pop(ctx, entered);
              }
            },
          ),
        ],
      ),
    );

    if (result != null) {
      setState(() => _savingLimit = true);
      try {
        if (result == 0.0) {
          await FirebaseFirestore.instance
              .collection('limits')
              .doc(_limitDocId)
              .delete();
          _periodLimit = null;
        } else {
          await FirebaseFirestore.instance
              .collection('limits')
              .doc(_limitDocId)
              .set({
            'limit': result,
            'userId': widget.userPhone,
            'period': txPeriod,
            'updatedAt': FieldValue.serverTimestamp(),
          });
          _periodLimit = result;
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Failed to save limit: $e")),
        );
      }
      setState(() => _savingLimit = false);
    }
    _resetLimitWarnings();
    _checkLimitWarnings();
  }

  void _generateSmartInsight() {
    if (totalAssets > 0 || totalLoan > 0) {
      double netWorth = totalAssets - totalLoan;
      if (netWorth > 0) {
        smartInsight =
        "Your net worth is ₹${netWorth.toStringAsFixed(0)}. You're building real wealth! 💰";
      } else {
        smartInsight =
        "Your net worth is negative (₹${netWorth.toStringAsFixed(0)}). Focus on reducing loans and growing assets! 🔄";
      }
    } else if (totalIncome == 0 && totalExpense == 0) {
      smartInsight =
      "Add your first transaction or fetch from Gmail to get insights!";
    } else if (totalExpense > totalIncome) {
      smartInsight =
      "You're spending more than you earn this month. Be careful!";
    } else if (totalIncome > 0 && (savings / totalIncome) > 0.3) {
      smartInsight = "Great! You’ve saved over 30% of your income this month.";
    } else if (currentGoal != null &&
        currentGoal!.targetAmount > 0 &&
        savings > 0) {
      double months = ((currentGoal!.targetAmount - currentGoal!.savedAmount) /
          (savings == 0 ? 1 : savings))
          .clamp(1, 36);
      smartInsight =
      "At this pace, you'll reach your goal '${currentGoal!.title}' in about ${months.toStringAsFixed(0)} months!";
    } else {
      smartInsight = "Keep tracking your expenses and save more!";
    }
  }

  // --- FILTER BAR DATA ---

  @override
  Widget build(BuildContext context) {
    final filteredIncomes = _filteredIncomesForPeriod(txPeriod);
    final filteredExpenses = _filteredExpensesForPeriod(txPeriod);
    final txSummary = _getTxSummaryForPeriod(txPeriod);
    final netWorth = totalAssets - totalLoan;
    final totalPlans = _activeSubs + _activeSips;
    final dueLabel = _cardsDue == 1 ? 'bill' : 'bills';
    final autopayLabel = _autopayCount == 1 ? 'autopay' : 'autopays';
    final subsLabel = _activeSubs == 1 ? 'subscription' : 'subscriptions';
    final sipLabel = _activeSips == 1 ? 'SIP' : 'SIPs';

    return Scaffold(
      extendBodyBehindAppBar: true,
      bottomNavigationBar: AdaptiveBanner(adUnitId: AdIds.banner),
      floatingActionButton: _MintFab(
        onRefresh: _initDashboard,
        userPhone: widget.userPhone,
      ),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        toolbarHeight: 64,
        title: Text(
          "Fiinny",
          style: TextStyle(
            color: Color(0xFF09857a),
            fontWeight: FontWeight.bold,
            fontSize: 20,
            letterSpacing: 0.7,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_active_rounded,
                color: Color(0xFF09857a), size: 25),
            tooltip: 'Notification settings',
            onPressed: () async {
              await NotifPrefsService.ensureDefaultPrefs(); // make sure doc exists
              if (!mounted) return;
              Navigator.pushNamed(context, '/settings/notifications');
            },
          ),
          IconButton(
            tooltip: 'Analytics',
            icon: const Icon(Icons.analytics_outlined),
            onPressed: () {
              Navigator.pushNamed(
                context,
                '/analytics',
                arguments: widget.userPhone,
              );
            },
          ),
          IconButton(
            icon: _isFetchingEmail
                ? const SizedBox(
              width: 22, height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
                : const Icon(Icons.sync_rounded, color: Color(0xFF09857a), size: 24),
            tooltip: 'Fetch Email Data',
            onPressed: _isFetchingEmail ? null : () async {
              setState(()=>_isFetchingEmail = true);
              try {
                await OldGmail.GmailService().fetchAndStoreTransactionsFromGmail(widget.userPhone);
                await _initDashboard();
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Fetched Gmail transactions!')),
                  );
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Email fetch failed: $e')),
                  );
                }
              } finally {
                if (mounted) setState(()=>_isFetchingEmail=false);
              }
            },
          ),
          // 👇 Profile Avatar on right
          GestureDetector(
            onTap: () {
              Navigator.pushNamed(context, '/profile', arguments: widget.userPhone);
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: FutureBuilder<DocumentSnapshot>(
                future: FirebaseFirestore.instance
                    .collection('users')
                    .doc(widget.userPhone)
                    .get(),
                builder: (context, snap) {
                  String? avatar = "assets/images/profile_default.png";
                  if (snap.hasData && snap.data!.data() != null) {
                    final data = snap.data!.data() as Map<String, dynamic>;
                    if (data['avatar'] != null &&
                        data['avatar'].toString().isNotEmpty) {
                      avatar = data['avatar'];
                    }
                  }
                  // Show network image if it's a URL, else asset
                  return CircleAvatar(
                    radius: 20,
                    backgroundImage: (avatar!.startsWith('http'))
                        ? NetworkImage(avatar)
                        : AssetImage(avatar) as ImageProvider,
                  );
                },
              ),
            ),
          ),
          SizedBox(width: 5),
        ],
      ),
      body: Stack(
        children: [
          const _AnimatedMintBackground(),
          _loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
            onRefresh: () async {
              try {
                // Gmail fetch (old service)
                if (_isEmailLinked && (_userEmail?.isNotEmpty ?? false)) {
                  await OldGmail.GmailService().fetchAndStoreTransactionsFromGmail(widget.userPhone);
                  await _initDashboard();
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text("Synced Gmail transactions")),
                    );
                  }
                } else {
                  await _fetchEmailTx(); // already shows snackbar
                }
              } catch (e, st) {
                debugPrint('[onRefresh] error: $e\n$st');
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text("Sync error: $e")),
                  );
                }
              }
              // 🔁 NEW: scan for loan suggestions on manual refresh
              try {
                await _loanDetector.scanAndWrite(widget.userPhone, daysWindow: 360);
                _loanSuggestionsCount =
                await _loanDetector.pendingCount(widget.userPhone);
                setState((){}); // update the chip count
              } catch (e) {
                debugPrint('[onRefresh] loan scan error: $e');
              }
            },
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                // --- HERO SECTION: NUDGE, HELLO, HERO RING ---
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(
                      0,
                      MediaQuery.of(context).padding.top + kToolbarHeight,
                      0,
                      0,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SmartNudgeWidget(userId: widget.userPhone),
                        Padding(
                          padding: const EdgeInsets.only(
                              left: 20, top: 2, bottom: 8),
                          child: Text(
                            "Welcome, ${userName ?? '...'}",
                            style: const TextStyle(
                              fontSize: 21,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF09857a),
                            ),
                          ),
                        ),
                        // --- Dashboard Hero Ring With Limit Icon ---
                        GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {
                            Navigator.pushNamed(
                              context,
                              '/tx-day-details',
                              arguments: widget.userPhone,
                            );
                          },
                          child: Stack(
                            children: [
                              DashboardHeroRing(
                                credit: txSummary["credit"]!,
                                debit: txSummary["debit"]!,
                                period: txPeriod,
                                onFilterTap: () async {
                                  final result = await showModalBottomSheet<String>(
                                    context: context,
                                    builder: (ctx) => TxFilterBar(
                                      selected: txPeriod,
                                      onSelect: (period) => Navigator.pop(ctx, period),
                                    ),
                                  );
                                  if (result != null && result != txPeriod) {
                                    setState(() => txPeriod = result);
                                    await _loadPeriodLimit();
                                    _resetLimitWarnings();
                                    _checkLimitWarnings();
                                    _recomputeAutopayCount(); // 🔴
                                  }
                                },
                              ),
                              // Limit icon (top-right)
                              Positioned(
                                top: 10,
                                right: 24,
                                child: GestureDetector(
                                  onTap: _savingLimit ? null : _editLimitDialog,
                                  child: CircleAvatar(
                                    radius: 16,
                                    backgroundColor: Colors.teal.withOpacity(0.09),
                                    child: const Icon(Icons.edit_rounded, size: 17, color: Colors.teal),
                                  ),
                                ),
                              ),
                              // Show current limit if set
                              if (_periodLimit != null)
                                Positioned(
                                  right: 30,
                                  bottom: 22,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: Colors.teal.withOpacity(0.12),
                                      borderRadius: BorderRadius.circular(11),
                                    ),
                                    child: Builder(
                                      builder: (_) {
                                        final limit = _periodLimit!;
                                        final used  = periodSpendOnly;
                                        final pct = limit > 0 ? (used / limit) : 0.0;
                                        return Text(
                                          "Limit ₹${limit.toStringAsFixed(0)} • Used ₹${used.toStringAsFixed(0)} (${(pct * 100).toStringAsFixed(0)}%)",
                                          style: TextStyle(
                                            color: Colors.teal[900],
                                            fontWeight: FontWeight.w700,
                                            fontSize: 12,
                                          ),
                                        );
                                      },
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 4),
                        // --- NEW CARDS: Transaction Count & Amount ---
                        Row(
                          children: [
                            Expanded(
                              child: TransactionCountCard(
                                count: filteredIncomes.length + filteredExpenses.length,
                                period: txPeriod,
                                barData: _barDataCount(),
                                onFilterTap: () async {
                                  final result = await showModalBottomSheet<String>(
                                    context: context,
                                    builder: (ctx) => TxFilterBar(
                                      selected: txPeriod,
                                      onSelect: (period) => Navigator.pop(ctx, period),
                                    ),
                                  );
                                  if (result != null && result != txPeriod) {
                                    setState(() => txPeriod = result);
                                    await _loadPeriodLimit();
                                    _resetLimitWarnings();
                                    _checkLimitWarnings();
                                    _recomputeAutopayCount(); // 🔴
                                  }
                                },
                                onViewAllTap: () {
                                  Navigator.pushNamed(
                                    context,
                                    '/transactionCount',
                                    arguments: widget.userPhone,
                                  );
                                },
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: TransactionAmountCard(
                                label: "Transaction Amount",
                                amount: filteredIncomes.fold(0.0, (a, b) => a + b.amount) +
                                    filteredExpenses.fold(0.0, (a, b) => a + b.amount),
                                period: txPeriod,
                                barData: _barDataAmount(),
                                onFilterTap: () async {
                                  final result = await showModalBottomSheet<String>(
                                    context: context,
                                    builder: (ctx) => TxFilterBar(
                                      selected: txPeriod,
                                      onSelect: (period) => Navigator.pop(ctx, period),
                                    ),
                                  );
                                  if (result != null && result != txPeriod) {
                                    setState(() => txPeriod = result);
                                    await _loadPeriodLimit();
                                    _resetLimitWarnings();
                                    _checkLimitWarnings();
                                    _recomputeAutopayCount(); // 🔴
                                  }
                                },
                                onViewAllTap: () {
                                  Navigator.pushNamed(
                                    context,
                                    '/transactionAmount',
                                    arguments: widget.userPhone,
                                  );
                                },
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),

                        // 🔴 NEW: parser-sourced KPI badges row
                        Padding(
                          padding: const EdgeInsets.fromLTRB(18, 0, 18, 6),
                          child: Wrap(
                            spacing: 8, runSpacing: 8,
                            children: [
                              _kpiBadge(Icons.subscriptions, Colors.purple, "Subscriptions", '$_activeSubs'),
                              _kpiBadge(Icons.savings, Colors.orange, "SIPs", '$_activeSips'),
                              _kpiBadge(Icons.credit_card, Colors.redAccent, "Cards Due", '$_cardsDue'),
                              _kpiBadge(Icons.autorenew, Colors.teal, "Autopay", '$_autopayCount'),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // --- SCROLLABLE MAIN WHITE PANEL ---
                SliverToBoxAdapter(
                  child: Container(
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.vertical(top: Radius.circular(36)),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black12,
                          blurRadius: 24,
                          offset: Offset(0, -4),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(18, 38, 18, 90),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CrisisAlertBanner(
                            userId: widget.userPhone,
                            totalIncome: totalIncome,
                            totalExpense: totalExpense,
                          ),
                          SmartInsightCard(
                            key: ValueKey('$totalLoan|$totalAssets|$totalIncome|$totalExpense|$savings'),
                            income: totalIncome,
                            expense: totalExpense,
                            savings: savings,
                            goal: currentGoal,
                            totalLoan: totalLoan,
                            totalAssets: totalAssets,
                          ),
                          const SizedBox(height: 14),
                          FiinnyBrainDiagnosisCard(
                            userPhone: widget.userPhone,
                            daysWindow: 180,
                            initiallyExpanded: false,
                            salaryEarlyDays: 3,
                          ),
                          const SizedBox(height: 14),

                          Row(
                            children: [
                              // ⬇️ Make Loans card tappable
                              Expanded(
                                child: Material(
                                  color: Colors.transparent,
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(16),
                                    onTap: () async {
                                      final changed = await Navigator.pushNamed<bool>(
                                        context,
                                        '/loans',
                                        arguments: {'userId': widget.userPhone},
                                      );
                                      if (changed == true) {
                                        await _initDashboard();
                                      }
                                    },
                                    child: LoansSummaryCard(
                                      userId: widget.userPhone,
                                      loanCount: loanCount,
                                      totalLoan: totalLoan,

                                      // 🆕 show detected loans + review handler
                                      pendingSuggestions: _loanSuggestionsCount,
                                      onReviewSuggestions: () async {
                                        setState(() => _scanningLoans = true);
                                        try {
                                          await _loanDetector.scanAndWrite(
                                              widget.userPhone,
                                              daysWindow: 360);
                                          _loanSuggestionsCount =
                                          await _loanDetector.pendingCount(
                                              widget.userPhone);
                                        } finally {
                                          if (mounted) setState(() => _scanningLoans = false);
                                        }

                                        await showModalBottomSheet(
                                          context: context,
                                          isScrollControlled: true,
                                          shape: RoundedRectangleBorder(
                                              borderRadius: BorderRadius.circular(16)),
                                          builder: (_) => SizedBox(
                                            height: MediaQuery.of(context).size.height * 0.70,
                                            child: LoanSuggestionsSheet(userId: widget.userPhone),
                                          ),
                                        );

                                        // refresh badge + totals after sheet actions
                                        _loanSuggestionsCount =
                                        await _loanDetector.pendingCount(widget.userPhone);
                                        final ls = await LoanService()
                                            .countOpenLoans(widget.userPhone);
                                        final sum = await LoanService()
                                            .sumOutstanding(widget.userPhone);
                                        if (mounted) {
                                          setState(() {
                                            loanCount = ls;
                                            totalLoan = sum;
                                          });
                                        }
                                      },
                                      onAddLoan: () async {
                                        final added = await Navigator.pushNamed<bool>(
                                          context,
                                          '/addLoan',
                                          arguments: widget.userPhone,
                                        );
                                        if (added == true) {
                                          await _initDashboard();
                                        }
                                      },
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              // ⬇️ Make Assets card tappable
                              Expanded(
                                child: Material(
                                  color: Colors.transparent,
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(16),
                                    onTap: () async {
                                      await Navigator.pushNamed(context, '/portfolio');
                                      await _loadPortfolioTotals();
                                    },
                                    child: AssetsSummaryCard(
                                      userId: widget.userPhone,
                                      assetCount: assetCount,
                                      totalAssets: totalAssets,
                                      onAddAsset: () async {
                                        await Navigator.pushNamed(context, '/asset-type-picker');
                                        await _loadPortfolioTotals();
                                      },
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),

                          // 🆕 Subscriptions & Bills card (full-width)
                          Row(
                            children: [
                              Expanded(
                                child: Card(
                                  elevation: 3,
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(18)),
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(18),
                                    onTap: () => _openSubscriptionsAndBills(context),
                                    child: Padding(
                                      padding: const EdgeInsets.all(13),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            mainAxisAlignment:
                                                MainAxisAlignment.spaceBetween,
                                            children: [
                                              Expanded(
                                                child: Text(
                                                  "Subscriptions & Bills",
                                                  style: TextStyle(
                                                    fontWeight: FontWeight.bold,
                                                    color: Colors.teal[800],
                                                    fontSize: 16,
                                                  ),
                                                ),
                                              ),
                                              const Icon(Icons.receipt_long_rounded,
                                                  color: Color(0xFF09857a)),
                                            ],
                                          ),
                                          const SizedBox(height: 7),
                                          Text(
                                            totalPlans > 0
                                                ? "$totalPlans active"
                                                : "No active plans yet",
                                            style: TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 18,
                                              color: Colors.green[700],
                                            ),
                                          ),
                                          const SizedBox(height: 6),
                                          Text(
                                            "$_cardsDue $dueLabel due soon • $_autopayCount $autopayLabel",
                                            style: const TextStyle(fontSize: 13),
                                          ),
                                          const SizedBox(height: 6),
                                          Row(
                                            mainAxisAlignment:
                                                MainAxisAlignment.spaceBetween,
                                            children: [
                                              Expanded(
                                                child: Text(
                                                  "$_activeSubs $subsLabel • $_activeSips $sipLabel",
                                                  style: const TextStyle(fontSize: 13),
                                                ),
                                              ),
                                              IconButton(
                                                icon: const Icon(Icons.add_circle,
                                                    color: Colors.teal),
                                                tooltip:
                                                    "Add subscription or bill",
                                                onPressed: () async {
                                                  await _openSubscriptionsAndBills(
                                                      context);
                                                },
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),

                          // ⬇️ Goals card
                          Row(
                            children: [
                              Expanded(
                                child: Material(
                                  color: Colors.transparent,
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(16),
                                    onTap: () async {
                                      await Navigator.pushNamed(
                                        context,
                                        '/goals',
                                        arguments: widget.userPhone,
                                      );
                                      await _initDashboard();
                                    },
                                    child: GoalsSummaryCard(
                                      userId: widget.userPhone,
                                      goalCount: goals.length,
                                      totalGoalAmount: goals.fold(0.0, (sum, g) => sum + g.targetAmount),
                                      onAddGoal: () async {
                                        final added = await showDialog<bool>(
                                          context: context,
                                          builder: (ctx) => AddGoalDialog(
                                            onAdd: (goal) {
                                              GoalService().addGoal(widget.userPhone, goal);
                                            },
                                          ),
                                        );
                                        if (added == true) {
                                          await _initDashboard();
                                        }
                                      },
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(height: 16),
                          CustomDiamondCard(
                            isDiamondCut: false,
                            borderRadius: 24,
                            glassGradient: [
                              Colors.white.withOpacity(0.23),
                              Colors.white.withOpacity(0.09)
                            ],
                            child: ListTile(
                              leading: Icon(Icons.equalizer,
                                  color: Color(0xFF09857a), size: 33),
                              title: Text(
                                "Net Worth",
                                style: TextStyle(
                                  color: Color(0xFF09857a),
                                  fontWeight: FontWeight.bold,
                                  fontSize: 17,
                                ),
                              ),
                              subtitle: Text(
                                "₹${netWorth.toStringAsFixed(0)}",
                                style: TextStyle(
                                  color: netWorth >= 0
                                      ? Colors.teal
                                      : Colors.red,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 19,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 18),
                          if (goals.isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 10),
                              child: Text(
                                "No goals added yet! Tap to add your first.",
                                style: TextStyle(color: Colors.teal),
                              ),
                            ),
                          if (insights.isNotEmpty)
                            GestureDetector(
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (ctx) => InsightFeedScreen(
                                      userId: widget.userPhone,
                                      userData: _mockUserData,
                                    ),
                                  ),
                                );
                              },
                              child: InsightFeedCard(
                                  insights: insights.take(3).toList()),
                            ),
                          const SizedBox(height: 18),
                          if (_showFetchButton)
                            if (!_isEmailLinked)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 4.0),
                                child: ElevatedButton.icon(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Color(0xFF09857a),
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 13),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(15),
                                    ),
                                    elevation: 8,
                                  ),
                                  icon: const Icon(Icons.mail_rounded, color: Colors.white),
                                  label: const Text(
                                    "Fetch Email Data",
                                    style: TextStyle(color: Colors.white, fontSize: 16),
                                  ),
                                  onPressed: _fetchEmailTx,
                                ),
                              ),
                          const SizedBox(height: 80),
                        ],
                      ),
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

  // small KPI badge
  Widget _kpiBadge(IconData icon, Color color, String title, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.15),
        border: Border.all(color: Colors.white.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 6),
          Text("$title: ", style: const TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w600)),
          Text(value, style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: color)),
        ],
      ),
    );
  }

  Map<String, double> _getTxSummaryForPeriod(String period) {
    DateTime now = DateTime.now();
    DateTime start;
    DateTime end = now;

    if (period == "Today" || period == "D") {
      start = DateTime(now.year, now.month, now.day);
      end = start.add(const Duration(days: 1));
    } else if (period == "This Week" || period == "W") {
      start = now.subtract(Duration(days: now.weekday - 1));
      end = start.add(const Duration(days: 7));
    } else if (period == "This Month" || period == "M") {
      start = DateTime(now.year, now.month, 1);
      end = DateTime(now.year, now.month + 1, 1);
    } else if (period == "This Year" || period == "Y") {
      start = DateTime(now.year, 1, 1);
      end = DateTime(now.year + 1, 1, 1);
    } else if (period == "Last 2 Days") {
      start = now.subtract(const Duration(days: 1));
      end = now.add(const Duration(days: 1));
    } else if (period == "Last 5 Days") {
      start = now.subtract(const Duration(days: 4));
      end = now.add(const Duration(days: 1));
    } else if (period == "All Time") {
      start = DateTime(2000, 1, 1); // Arbitrary early date
      end = now.add(const Duration(days: 1));
    } else {
      // Default to today
      start = DateTime(now.year, now.month, now.day);
      end = start.add(const Duration(days: 1));
    }

    double credit = allIncomes
        .where((t) =>
    t.date.isAfter(start.subtract(const Duration(milliseconds: 1))) &&
        t.date.isBefore(end))
        .fold(0.0, (a, b) => a + b.amount);
    double debit = allExpenses
        .where((t) =>
    t.date.isAfter(start.subtract(const Duration(milliseconds: 1))) &&
        t.date.isBefore(end))
        .fold(0.0, (a, b) => a + b.amount);

    return {"credit": credit, "debit": debit, "net": credit - debit};
  }
}

// --- HERO RING FOR DASHBOARD (no appbar) ---
class DashboardHeroRing extends StatelessWidget {
  final double credit;
  final double debit;
  final String period;
  final VoidCallback onFilterTap;

  const DashboardHeroRing({
    required this.credit,
    required this.debit,
    required this.period,
    required this.onFilterTap,
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    double maxValue = (credit > debit ? credit : debit);
    if (maxValue == 0) maxValue = 1.0;
    final percentCredit = (credit / maxValue).clamp(0.0, 1.0).toDouble();
    final percentDebit = (debit / maxValue).clamp(0.0, 1.0).toDouble();

    return Container(
      height: 200,
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(36),
        boxShadow: [
          BoxShadow(
            color: Colors.teal.withOpacity(0.10),
            blurRadius: 18,
            offset: const Offset(0, 7),
          ),
        ],
      ),
      child: Row(
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              _AnimatedRing(
                percent: percentDebit,
                color: Colors.red,
                size: 150,
                strokeWidth: 15,
              ),
              _AnimatedRing(
                percent: percentCredit,
                color: Colors.green,
                size: 120,
                strokeWidth: 11,
              ),
            ],
          ),
          const SizedBox(width: 36),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Transaction Ring",
                  style: TextStyle(
                    color: Color(0xFF09857a),
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
                Row(
                  children: [
                    Text(
                      "₹${credit.toStringAsFixed(0)}",
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.green,
                        fontSize: 25,
                        letterSpacing: 0.1,
                      ),
                    ),
                    const SizedBox(width: 5),
                    const Text(
                      "Credit",
                      style: TextStyle(
                        color: Colors.green,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    Text(
                      "₹${debit.toStringAsFixed(0)}",
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.red,
                        fontSize: 25,
                        letterSpacing: 0.1,
                      ),
                    ),
                    const SizedBox(width: 5),
                    const Text(
                      "Debit",
                      style: TextStyle(
                        color: Colors.red,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 7),
                GestureDetector(
                  onTap: onFilterTap,
                  child: Container(
                    padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.teal.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          period,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF09857a),
                            fontSize: 14,
                          ),
                        ),
                        const Icon(Icons.expand_more_rounded,
                            size: 21, color: Color(0xFF09857a)),
                      ],
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

class _AnimatedRing extends StatelessWidget {
  final double percent;
  final Color color;
  final double size;
  final double strokeWidth;

  const _AnimatedRing({
    required this.percent,
    required this.color,
    this.size = 60,
    this.strokeWidth = 8,
    Key? key,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: percent),
      duration: const Duration(milliseconds: 850),
      curve: Curves.easeOutCubic,
      builder: (context, val, child) => CustomPaint(
        painter: _RingPainter(
          color: color,
          percent: val,
          strokeWidth: strokeWidth,
        ),
        size: Size(size, size),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final Color color;
  final double percent;
  final double strokeWidth;

  _RingPainter({
    required this.color,
    required this.percent,
    this.strokeWidth = 8,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final Paint bg = Paint()
      ..color = color.withOpacity(0.11)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    final Paint fg = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    // BG arc (full)
    canvas.drawArc(
      Rect.fromCircle(center: size.center(Offset.zero), radius: size.width / 2),
      0,
      2 * 3.1415926535,
      false,
      bg,
    );
    // FG arc (progress)
    canvas.drawArc(
      Rect.fromCircle(center: size.center(Offset.zero), radius: size.width / 2),
      -3.1415926535 / 2,
      2 * 3.1415926535 * percent,
      false,
      fg,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.percent != percent || old.color != color || old.strokeWidth != strokeWidth;
}

class _MintFab extends StatelessWidget {
  final Future<void> Function() onRefresh;
  final String userPhone;
  const _MintFab({required this.onRefresh, required this.userPhone, super.key});
  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      heroTag: "dashboard-fab-$userPhone", // unique => avoids Hero collisions
      tooltip: "Add Transaction",
      child: const Icon(Icons.add, size: 29),
      onPressed: () async {
        final added = await Navigator.pushNamed<bool>(
          context,
          '/add',
          arguments: userPhone,
        );
        if (added == true) {
          await onRefresh();
        }
      },
    );
  }
}

class _AnimatedMintBackground extends StatelessWidget {
  const _AnimatedMintBackground({super.key});
  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      ignoring: true,
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: 0.0, end: 1.0),
        duration: const Duration(seconds: 2),
        builder: (context, v, _) => Container(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              colors: [
                Colors.tealAccent.withOpacity(0.2),
                Colors.teal.withOpacity(0.1),
                Colors.white.withOpacity(0.6),
              ],
              center: Alignment.topLeft,
              radius: 0.8 + 0.4 * v,
            ),
          ),
        ),
      ),
    );
  }
}
