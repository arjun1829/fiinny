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
import '../themes/tokens.dart';
import '../themes/glass_card.dart';
import '../themes/badge.dart';
import '../widgets/hero_transaction_ring.dart';
import '../widgets/net_worth_panel.dart';
import '../core/formatters/inr.dart';
import '../widgets/subscriptions/subs_bills_card.dart';
import '../widgets/subscriptions/subs_suggestions_sheet.dart';
import '../widgets/subscriptions_review_sheet.dart';
import '../core/ads/ads_banner_card.dart';
import '../core/ui/snackbar_throttle.dart';
import '../widgets/empty_state_card.dart';
import '../widgets/shimmer.dart';
import '../widgets/gmail_backfill_banner.dart';
import '../widgets/premium/premium_chip.dart';
import '../core/flags/premium_gate.dart';
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

  Map<String, List<double>> _amountBarsCache = {};
  Map<String, List<int>> _countBarsCache = {};
  int _barsRevision = 0;

  final Map<String, Map<String, double>> _summaryCache = {};
  int _summaryRevision = 0;


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

  Widget _buildDashboardAdCard() {
    return AdsBannerCard(
      placement: 'dashboard_summary',
      inline: true,
      inlineMaxHeight: 120,
      margin: const EdgeInsets.fromLTRB(18, 8, 18, 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      minHeight: 96,
      backgroundColor: Colors.white,
      borderRadius: BorderRadius.circular(16),
      boxShadow: const [
        BoxShadow(
          color: Color(0x14000000),
          blurRadius: 16,
          offset: Offset(0, 8),
        ),
      ],
      placeholder: _dashboardAdPlaceholder(),
    );
  }

  Widget _dashboardAdPlaceholder() {
    return SizedBox(
      width: double.infinity,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.05),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Text(
              'Sponsored',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: Colors.black54,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            height: 56,
            decoration: BoxDecoration(
              color: const Color(0xFFE5E7EB),
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initDashboard();
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
      if (!mounted) return;
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
    if (!mounted) return;
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
        if (!mounted) return;
        setState(() {
          userName = doc.data()!['name'];
          _userEmail = doc.data()!['email'];
          _isEmailLinked = (_userEmail != null && _userEmail!.isNotEmpty);
        });
      } else {
        if (!mounted) return;
        setState(() {
          userName = "there";
          _isEmailLinked = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
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

  Future<void> _setGmailStatus(String status, {String? error}) async {
    final docRef = FirebaseFirestore.instance.collection('users').doc(_userDocId);
    await docRef.set({
      'gmailBackfillStatus': status,
      if (error != null) 'gmailBackfillError': error,
      'gmailBackfillUpdatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
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
      await _setGmailStatus('running');
      await OldGmail.GmailService().fetchAndStoreTransactionsFromGmail(widget.userPhone);
      await docRef.set({
        'gmailBackfillDone': true,
        'gmailBackfillUpdatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      await _setGmailStatus('ok');
      await _initDashboard(); // refresh UI
    } catch (e) {
      debugPrint('Gmail backfill error: $e');
      await _setGmailStatus('error', error: e.toString());
    }
  }

  Future<void> _fetchEmailTx() async {
    if (!mounted) return;
    await _setGmailStatus('running');
    setState(() => _isFetchingEmail = true);
    try {
      await OldGmail.GmailService().fetchAndStoreTransactionsFromGmail(widget.userPhone);
      await _initDashboard();
      await _setGmailStatus('ok');
      if (mounted) {
        SnackThrottle.show(context, "Fetched Gmail transactions!", color: Colors.green);
      }
    } catch (e) {
      await _setGmailStatus('error', error: e.toString());
      if (mounted) {
        SnackThrottle.show(context, "Failed to fetch email data: $e", color: Colors.red);
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

    if (!mounted) return;
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
      SnackThrottle.show(
        context,
        "Heads up: You’ve crossed 80% of this period’s spending limit.",
        color: Colors.orange,
      );
    }
    if (!_warned100 && ratio >= 1.0) {
      _warned100 = true;
      SnackThrottle.show(
        context,
        "Limit exceeded: You’ve spent over the limit for this period.",
        color: Colors.red,
      );
    }
  }

  // 2️⃣ --- Bar Data for Amount ---
  List<double> _barDataAmount() {
    if (_amountBarsCache.containsKey(txPeriod)) {
      return _amountBarsCache[txPeriod]!;
    }

    final expenses = _filteredExpensesForPeriod(txPeriod);
    final incomes = _filteredIncomesForPeriod(txPeriod);
    final now = DateTime.now();

    List<double> bars;

    if (txPeriod == "D" || txPeriod == "Today") {
      // 24h bar
      bars = List<double>.filled(24, 0.0);
      for (var e in expenses) {
        bars[e.date.hour] += e.amount;
      }
      for (var i in incomes) {
        bars[i.date.hour] += i.amount;
      }
    } else if (txPeriod == "W" || txPeriod == "This Week") {
      // 7 days, Mon-Sun
      bars = List<double>.filled(7, 0.0);
      for (var e in expenses) {
        bars[e.date.weekday - 1] += e.amount;
      }
      for (var i in incomes) {
        bars[i.date.weekday - 1] += i.amount;
      }
    } else if (txPeriod == "M" || txPeriod == "This Month") {
      // N days in this month
      final days = DateTime(now.year, now.month + 1, 0).day;
      bars = List<double>.filled(days, 0.0);
      for (var e in expenses) {
        bars[e.date.day - 1] += e.amount;
      }
      for (var i in incomes) {
        bars[i.date.day - 1] += i.amount;
      }
    } else if (txPeriod == "Y" || txPeriod == "This Year") {
      // 12 months
      bars = List<double>.filled(12, 0.0);
      for (var e in expenses) {
        bars[e.date.month - 1] += e.amount;
      }
      for (var i in incomes) {
        bars[i.date.month - 1] += i.amount;
      }
    } else if (txPeriod == "Last 2 Days") {
      // 2 bars: yesterday & today
      bars = List<double>.filled(2, 0.0);
      final yesterday = now.subtract(const Duration(days: 1));
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
    } else if (txPeriod == "Last 5 Days") {
      // 5 bars: today, yesterday, etc.
      bars = List<double>.filled(5, 0.0);
      for (var d = 0; d < 5; d++) {
        final targetDay = now.subtract(Duration(days: 4 - d));
        for (var e in expenses) {
          if (_isSameDay(e.date, targetDay)) bars[d] += e.amount;
        }
        for (var i in incomes) {
          if (_isSameDay(i.date, targetDay)) bars[d] += i.amount;
        }
      }
    } else if (txPeriod == "All Time") {
      // Each bar = a month (from oldest tx to newest)
      if (expenses.isEmpty && incomes.isEmpty) {
        bars = <double>[];
      } else {
        DateTime? minDate, maxDate;
        for (var e in expenses) {
          if (minDate == null || e.date.isBefore(minDate)) minDate = e.date;
          if (maxDate == null || e.date.isAfter(maxDate)) maxDate = e.date;
        }
        for (var i in incomes) {
          if (minDate == null || i.date.isBefore(minDate)) minDate = i.date;
          if (maxDate == null || i.date.isAfter(maxDate)) maxDate = i.date;
        }
        if (minDate == null || maxDate == null) {
          bars = <double>[];
        } else {
          final months =
              (maxDate.year - minDate.year) * 12 + (maxDate.month - minDate.month) + 1;
          bars = List<double>.filled(months, 0.0);
          for (var e in expenses) {
            final idx = (e.date.year - minDate.year) * 12 +
                (e.date.month - minDate.month);
            bars[idx] += e.amount;
          }
          for (var i in incomes) {
            final idx = (i.date.year - minDate.year) * 12 +
                (i.date.month - minDate.month);
            bars[idx] += i.amount;
          }
        }
      }
    } else {
      bars = <double>[];
    }

    _amountBarsCache[txPeriod] = bars;
    return bars;
  }

  List<int> _barDataCount() {
    if (_countBarsCache.containsKey(txPeriod)) {
      return _countBarsCache[txPeriod]!;
    }

    final expenses = _filteredExpensesForPeriod(txPeriod);
    final incomes = _filteredIncomesForPeriod(txPeriod);
    final now = DateTime.now();

    List<int> bars;

    if (txPeriod == "D" || txPeriod == "Today") {
      bars = List<int>.filled(24, 0);
      for (var e in expenses) {
        bars[e.date.hour] += 1;
      }
      for (var i in incomes) {
        bars[i.date.hour] += 1;
      }
    } else if (txPeriod == "W" || txPeriod == "This Week") {
      bars = List<int>.filled(7, 0);
      for (var e in expenses) {
        bars[e.date.weekday - 1] += 1;
      }
      for (var i in incomes) {
        bars[i.date.weekday - 1] += 1;
      }
    } else if (txPeriod == "M" || txPeriod == "This Month") {
      final days = DateTime(now.year, now.month + 1, 0).day;
      bars = List<int>.filled(days, 0);
      for (var e in expenses) {
        bars[e.date.day - 1] += 1;
      }
      for (var i in incomes) {
        bars[i.date.day - 1] += 1;
      }
    } else if (txPeriod == "Y" || txPeriod == "This Year") {
      bars = List<int>.filled(12, 0);
      for (var e in expenses) {
        bars[e.date.month - 1] += 1;
      }
      for (var i in incomes) {
        bars[i.date.month - 1] += 1;
      }
    } else if (txPeriod == "Last 2 Days") {
      bars = List<int>.filled(2, 0);
      final yesterday = now.subtract(const Duration(days: 1));
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
    } else if (txPeriod == "Last 5 Days") {
      bars = List<int>.filled(5, 0);
      for (var d = 0; d < 5; d++) {
        final targetDay = now.subtract(Duration(days: 4 - d));
        for (var e in expenses) {
          if (_isSameDay(e.date, targetDay)) bars[d] += 1;
        }
        for (var i in incomes) {
          if (_isSameDay(i.date, targetDay)) bars[d] += 1;
        }
      }
    } else if (txPeriod == "All Time") {
      if (expenses.isEmpty && incomes.isEmpty) {
        bars = <int>[];
      } else {
        DateTime? minDate, maxDate;
        for (var e in expenses) {
          if (minDate == null || e.date.isBefore(minDate)) minDate = e.date;
          if (maxDate == null || e.date.isAfter(maxDate)) maxDate = e.date;
        }
        for (var i in incomes) {
          if (minDate == null || i.date.isBefore(minDate)) minDate = i.date;
          if (maxDate == null || i.date.isAfter(maxDate)) maxDate = i.date;
        }
        if (minDate == null || maxDate == null) {
          bars = <int>[];
        } else {
          final months =
              (maxDate.year - minDate.year) * 12 + (maxDate.month - minDate.month) + 1;
          bars = List<int>.filled(months, 0);
          for (var e in expenses) {
            final idx = (e.date.year - minDate.year) * 12 +
                (e.date.month - minDate.month);
            bars[idx] += 1;
          }
          for (var i in incomes) {
            final idx = (i.date.year - minDate.year) * 12 +
                (i.date.month - minDate.month);
            bars[idx] += 1;
          }
        }
      }
    } else {
      bars = <int>[];
    }

    _countBarsCache[txPeriod] = bars;
    return bars;
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
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      final expenses = await _expenseSvc.getExpenses(widget.userPhone);
      final incomes  = await _incomeSvc.getIncomes(widget.userPhone);

      allExpenses = expenses;
      allIncomes = incomes;
      _summaryRevision++;
      _summaryCache.clear();

      if (!mounted) return;
      setState(() {
        _barsRevision++;
        _amountBarsCache.clear();
        _countBarsCache.clear();
      });

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
      SnackThrottle.show(context, "Dashboard error: $e");
    }

    // 🔎 NEW: refresh "new loan detected" badge count
    try {
      _loanSuggestionsCount =
      await _loanDetector.pendingCount(widget.userPhone);
    } catch (e) {
      debugPrint('[Dashboard] loan suggestions count error: $e');
    }

    if (!mounted) return;
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
    if (!mounted) return;
    setState(() {});
  }

  double? _suggestedLimitForPeriod() {
    // Suggest median spend over last 90 days, rounded to nearest 1000.
    // If period is "This Month", suggest from last 90d; else use current-period spend as hint.
    // For simplicity and low-cost, compute from allExpenses last 90 days.
    final now = DateTime.now();
    final from = now.subtract(const Duration(days: 90));
    final recent = allExpenses
        .where((e) => !e.date.isBefore(from))
        .map((e) => e.amount)
        .toList()
      ..sort();
    if (recent.isEmpty) return null;
    final med = recent.length.isOdd
        ? recent[recent.length ~/ 2]
        : (recent[recent.length ~/ 2 - 1] + recent[recent.length ~/ 2]) / 2.0;
    final rounded = (med / 1000).round() * 1000;
    return rounded > 0 ? rounded.toDouble() : null;
  }

  double _incomeBaseForPresets() {
    final now = DateTime.now();
    // current month income
    final thisMonthIncome = allIncomes
        .where((t) => t.date.year == now.year && t.date.month == now.month)
        .fold<double>(0.0, (a, b) => a + b.amount);
    if (thisMonthIncome > 0) return thisMonthIncome;

    // fallback: last 3 months avg
    final months = <String, double>{};
    for (final i in allIncomes) {
      final key = '${i.date.year}-${i.date.month}';
      months[key] = (months[key] ?? 0) + i.amount;
    }
    if (months.isEmpty) return 0.0;
    final vals = months.values.toList()..sort();
    final take = vals.length >= 3 ? vals.sublist(vals.length - 3) : vals;
    final avg = take.fold<double>(0.0, (a, b) => a + b) / take.length;
    return avg;
  }

  Future<void> _editLimitDialog() async {
    final suggested = _suggestedLimitForPeriod();
    final baseIncome = _incomeBaseForPresets();
    final p50 = baseIncome > 0 ? ((baseIncome * 0.50) / 1000).round() * 1000 : null;
    final p30 = baseIncome > 0 ? ((baseIncome * 0.30) / 1000).round() * 1000 : null;
    final p20 = baseIncome > 0 ? ((baseIncome * 0.20) / 1000).round() * 1000 : null;
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
            if (p50 != null || p30 != null || p20 != null) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (p50 != null) _presetChip(ctx, '50%', p50, ctrl),
                  if (p30 != null) _presetChip(ctx, '30%', p30, ctrl),
                  if (p20 != null) _presetChip(ctx, '20%', p20, ctrl),
                ],
              ),
            ],
          ],
        ),
        actions: [
          if (suggested != null)
            TextButton(
              child: Text("Use suggested (${INR.f(suggested)})"),
              onPressed: () => Navigator.pop(ctx, suggested),
            ),
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
      if (!mounted) return;
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
        SnackThrottle.show(context, "Failed to save limit: $e");
      }
      if (!mounted) return;
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

    return Scaffold(
      extendBodyBehindAppBar: true,
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
            color: Fx.mintDark,
            fontWeight: FontWeight.bold,
            fontSize: 20,
            letterSpacing: 0.7,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Gmail Link',
            icon: const Icon(Icons.mark_email_read_outlined, color: Fx.mintDark),
            onPressed: () {
              Navigator.pushNamed(context, '/settings/gmail', arguments: widget.userPhone);
            },
          ),
          IconButton(
            icon: const Icon(Icons.notifications_active_rounded,
                color: Fx.mintDark, size: 25),
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
                : const Icon(Icons.sync_rounded, color: Fx.mintDark, size: Fx.s24),
            tooltip: 'Fetch Email Data',
            onPressed: _isFetchingEmail ? null : () async {
              if (!mounted) return;
              setState(() => _isFetchingEmail = true);
              try {
                await OldGmail.GmailService().fetchAndStoreTransactionsFromGmail(widget.userPhone);
                await _initDashboard();
                if (mounted) {
                  SnackThrottle.show(context, 'Fetched Gmail transactions!', color: Colors.green);
                }
              } catch (e) {
                if (mounted) {
                  SnackThrottle.show(context, 'Email fetch failed: $e', color: Colors.red);
                }
              } finally {
                if (mounted) setState(() => _isFetchingEmail = false);
              }
            },
          ),
          // 👇 Profile Avatar on right
          GestureDetector(
            onTap: () {
              Navigator.pushNamed(context, '/profile', arguments: widget.userPhone);
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: Fx.s10),
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
                    radius: Fx.r20,
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
                    SnackThrottle.show(context, "Synced Gmail transactions", color: Colors.green);
                  }
                } else {
                  await _fetchEmailTx(); // already shows snackbar
                }
              } catch (e, st) {
                debugPrint('[onRefresh] error: $e\n$st');
                if (mounted) {
                  SnackThrottle.show(context, "Sync error: $e", color: Colors.red);
                }
              }
              // 🔁 NEW: scan for loan suggestions on manual refresh
              try {
                await _loanDetector.scanAndWrite(widget.userPhone, daysWindow: 360);
                _loanSuggestionsCount =
                await _loanDetector.pendingCount(widget.userPhone);
                if (!mounted) return;
                setState(() {}); // update the chip count
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
                              left: Fx.s20, top: Fx.s2, bottom: Fx.s8),
                          child: Text(
                            "Welcome, ${userName ?? '...'}",
                            style: const TextStyle(
                              fontSize: 21,
                              fontWeight: FontWeight.bold,
                              color: Fx.mintDark,
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
                              HeroTransactionRing(
                                credit: txSummary["credit"]!,
                                debit:  txSummary["debit"]!,
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
                                    _recomputeAutopayCount();
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
                                key: ValueKey('count|$_barsRevision|$txPeriod'),
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
                                    if (!mounted) return;
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
                                key: ValueKey('amount|$_barsRevision|$txPeriod'),
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
                                    if (!mounted) return;
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
                        _buildDashboardAdCard(),

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
                          GmailBackfillBanner(
                            userId: widget.userPhone,
                            isLinked: _isEmailLinked,
                            onRetry: _isFetchingEmail
                                ? null
                                : () async {
                                    try {
                                      setState(() => _isFetchingEmail = true);
                                      await _setGmailStatus('running');
                                      await OldGmail.GmailService()
                                          .fetchAndStoreTransactionsFromGmail(widget.userPhone);
                                      await _setGmailStatus('ok');
                                      await _initDashboard();
                                    } catch (e) {
                                      await _setGmailStatus('error', error: e.toString());
                                    } finally {
                                      if (mounted) {
                                        setState(() => _isFetchingEmail = false);
                                      }
                                    }
                                  },
                          ),
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
                          FutureBuilder<bool>(
                            future: PremiumGate.instance.isPremium(widget.userPhone),
                            builder: (_, snap) {
                              final isPro = snap.data == true;
                              if (isPro) {
                                return const SizedBox.shrink();
                              }
                              return Padding(
                                padding: const EdgeInsets.only(top: 8.0),
                                child: Align(
                                  alignment: Alignment.centerRight,
                                  child: PremiumChip(
                                    onTap: () => Navigator.pushNamed(
                                      context,
                                      '/premium',
                                      arguments: widget.userPhone,
                                    ),
                                    label: 'Unlock deeper insights',
                                  ),
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: 14),
                          FiinnyBrainDiagnosisCard(
                            userPhone: widget.userPhone,
                            daysWindow: 180,
                            initiallyExpanded: false,
                            salaryEarlyDays: 3,
                          ),
                          const SizedBox(height: 14),

                          if (_loading)
                            Row(children: const [
                              Expanded(child: ShimmerBox(height: 120)),
                              SizedBox(width: 10),
                              Expanded(child: ShimmerBox(height: 120)),
                            ])
                          else
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
                                          if (!mounted) return;
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

                          Row(
                            children: [
                              Expanded(
                                child: SubsBillsCard(
                                  userPhone: widget.userPhone,
                                  activeCount: _activeSubs + _activeSips,
                                  overdueCount: _cardsDue,
                                  monthTotal: _filteredExpensesForPeriod(txPeriod)
                                      .where((e) => (e.tags ?? const []).contains('autopay') ||
                                          (e.tags ?? const []).contains('bill'))
                                      .fold<double>(0.0, (a, b) => a + b.amount),
                                  nextDue: null,
                                  onOpen: () => _openSubscriptionsAndBills(context),
                                  onAdd: () async {
                                    await showModalBottomSheet(
                                      context: context,
                                      isScrollControlled: true,
                                      shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(16)),
                                      builder: (_) => SubsSuggestionsSheet(
                                        userId: widget.userPhone,
                                        onReview: () async {
                                          Navigator.pop(context);
                                          await showModalBottomSheet(
                                            context: context,
                                            isScrollControlled: true,
                                            shape: RoundedRectangleBorder(
                                                borderRadius: BorderRadius.circular(16)),
                                            builder: (_) => SizedBox(
                                              height: MediaQuery.of(context).size.height * 0.8,
                                              child: SubscriptionsReviewSheet(userId: widget.userPhone),
                                            ),
                                          );
                                        },
                                      ),
                                    );
                                    await _initDashboard();
                                  },
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
                                      totalGoalAmount: goals.fold<double>(0.0, (sum, g) => sum + g.targetAmount),
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

                          const SizedBox(height: Fx.s16),
                          NetWorthPanel(totalAssets: totalAssets, totalLoan: totalLoan),
                          const SizedBox(height: 18),
                          if (goals.isEmpty)
                            EmptyStateCard(
                              icon: Icons.flag_rounded,
                              title: "No goals yet",
                              subtitle: "Set a saving goal and track progress effortlessly.",
                              ctaText: "Add your first goal",
                              onTap: () async {
                                await Navigator.pushNamed(context, '/goals', arguments: widget.userPhone);
                                await _initDashboard();
                              },
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
                                insights: insights,
                                userId: widget.userPhone,
                              ),
                            ),
                          const SizedBox(height: Fx.s18),
                          if (_showFetchButton)
                            if (!_isEmailLinked)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: Fx.s4),
                                child: ElevatedButton.icon(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Fx.mintDark,
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

  Widget _presetChip(BuildContext ctx, String label, num amount, TextEditingController ctrl) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () => ctrl.text = amount.toStringAsFixed(0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.teal.withOpacity(0.10),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.teal.withOpacity(0.25)),
        ),
        child: Text('$label • ₹${amount.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  Widget _kpiBadge(IconData icon, Color color, String title, String value) {
    final w = MediaQuery.of(context).size.width;
    final dense = w < 360;
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: dense ? 8 : 12,
        vertical: dense ? 6 : 8,
      ),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(0.15),
        border: Border.all(color: Colors.white.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: dense ? 14 : 16),
          SizedBox(width: dense ? 4 : 6),
          Text(
            "$title: ",
            style: TextStyle(
              fontSize: dense ? 11 : 12,
              color: Colors.black54,
              fontWeight: FontWeight.w600,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: dense ? 13 : 15,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Map<String, double> _getTxSummaryForPeriod(String period) {
    final cacheKey = '${_summaryRevision}_$period';
    if (_summaryCache.containsKey(cacheKey)) {
      return _summaryCache[cacheKey]!;
    }

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

    final summary = {"credit": credit, "debit": debit, "net": credit - debit};
    _summaryCache[cacheKey] = summary;
    return summary;
  }
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
