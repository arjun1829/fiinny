// `lib/screens/dashboard_screen.dart`

import 'dart:async';
import 'dart:ui';
import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
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
import '../services/push/push_service.dart';
import '../widgets/smart_insights_card.dart';
import '../widgets/insight_feed_card.dart';
import '../widgets/smart_nudge_widget.dart';
import '../widgets/crisis_alert_banner.dart';
import '../widgets/loans_summary_card.dart';
import '../widgets/assets_summary_card.dart';
import '../widgets/tx_filter_bar.dart';
import '../widgets/dashboard/bank_overview_dialog.dart';
import '../widgets/hero_transaction_ring.dart';
import '../services/user_data.dart';
import '../widgets/dashboard_activity_tab.dart';
import '../widgets/dashboard/bank_cards_carousel.dart';
import '../models/activity_event.dart';
import 'dashboard_activity_screen.dart';
import 'insight_feed_screen.dart';
import '../widgets/transaction_count_card.dart';
import '../widgets/transaction_amount_card.dart';
import '../themes/tokens.dart';
import '../themes/glass_card.dart';
import '../themes/badge.dart';
import '../widgets/net_worth_panel.dart';
import '../core/formatters/inr.dart';
import 'loans_screen.dart';
import '../details/models/recurring_scope.dart';
import '../details/models/shared_item.dart';
import '../core/ads/ads_banner_card.dart';
import '../core/ui/snackbar_throttle.dart';
import '../widgets/empty_state_card.dart';
import '../widgets/shimmer.dart';
import '../widgets/gmail_backfill_banner.dart';
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
import '../services/notifs/social_events_watch.dart';

// (optional) quick monthly fees-only card if you also want it
import '../widgets/hidden_charges_card.dart';
import '../widgets/forex_charges_card.dart';
import '../widgets/salary_predictor_card.dart';

import '../brain/loan_detection_service.dart';
import '../widgets/loan_suggestions_sheet.dart';

import '../widgets/hidden_charges_review_sheet.dart';
import '../widgets/forex_findings_sheet.dart';

import '../screens/review_inbox_screen.dart';
import '../services/review_queue_service.dart';
import '../models/ingest_draft_model.dart';

import '../core/ads/ad_service.dart';

import '../core/notifications/local_notifications.dart'
    show SystemRecurringLocalScheduler;

import '../services/sms/sms_permission_helper.dart';


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

class _DashboardScreenState extends State<DashboardScreen>
    with WidgetsBindingObserver, TickerProviderStateMixin {
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
  UserData? _insightUserData;
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
  final _assetSvc   = AssetService();

  final _loanDetector = LoanDetectionService();
  int _loanSuggestionsCount = 0;
  bool _scanningLoans = false;
  late final AnimationController _ringShineController;
  bool _ringShineVisible = true;

  bool? _hasSmsPermission = SmsPermissionHelper.lastKnownStatus;
  bool _requestingSmsPermission = false;

  bool get _isAndroidPlatform => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
  bool get _showSmsPermissionBanner => _isAndroidPlatform && (_hasSmsPermission == false);

  // Animated dashboard numbers (ring + cards)
  late AnimationController _numbersCtrl;
  double _animCredit = 0.0;
  double _animDebit = 0.0;
  double _animAmount = 0.0;
  int _animTxCount = 0;
  VoidCallback? _numbersListener;

  // Toggle to render insight feed at the bottom of the dashboard
  static const bool _INSIGHTS_AT_BOTTOM = true;

  Widget _buildDashboardAdCard() {
    return AdsBannerCard(
      key: const ValueKey('ad-dashboard_summary'),
      placement: 'dashboard_summary',
      inline: true,
      inlineMaxHeight: 120,
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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

  Future<void> _refreshDashboardSmooth() async {
    final backgroundFuture = _refreshBackgroundJobs();
    await _fetchTransactionsAndAnimate();
    unawaited(backgroundFuture.then((_) async {
      await _fetchTransactionsAndAnimate(
        duration: const Duration(milliseconds: 600),
        showError: false,
      );
    }));
    unawaited(_refreshSecondaryBlocks());
  }

  Future<void> _fetchTransactionsAndAnimate({
    Duration duration = const Duration(milliseconds: 900),
    bool showError = true,
  }) async {
    try {
      final expenseFuture = _expenseSvc.getExpenses(widget.userPhone);
      final incomeFuture = _incomeSvc.getIncomes(widget.userPhone);
      final expenses = await expenseFuture;
      final incomes = await incomeFuture;
      if (!mounted) return;

      setState(() {
        allExpenses = expenses;
        allIncomes = incomes;
        _summaryRevision++;
        _summaryCache.clear();
        _barsRevision++;
        _amountBarsCache.clear();
        _countBarsCache.clear();
      });

      final summary = _getTxSummaryForPeriod(txPeriod);
      final credit = summary['credit'] ?? 0.0;
      final debit = summary['debit'] ?? 0.0;
      final total = credit + debit;
      final txCnt = periodTotalCount;
      _animateDashboardNumbersTo(
        credit: credit,
        debit: debit,
        txCount: txCnt,
        totalAmount: total,
        duration: duration,
      );
    } catch (e) {
      if (showError && mounted) {
        SnackThrottle.show(context, "Refresh error: $e", color: Colors.red);
      }
    }
  }

  Future<void> _refreshBackgroundJobs() async {
    try {
      if (_isEmailLinked && (_userEmail?.isNotEmpty ?? false)) {
        await OldGmail.GmailService().fetchAndStoreTransactionsFromGmail(widget.userPhone);
        if (mounted) {
          SnackThrottle.show(context, "Synced Gmail transactions", color: Colors.green);
        }
      } else {
        await _fetchEmailTx();
      }
    } catch (_) {}

    try {
      await _loanDetector.scanAndWrite(widget.userPhone, daysWindow: 360);
      _loanSuggestionsCount = await _loanDetector.pendingCount(widget.userPhone);
      if (mounted) {
        setState(() {});
      }
    } catch (_) {}
  }

  Future<void> _refreshSecondaryBlocks() async {
    try {
      final goalsList = await GoalService().getGoals(widget.userPhone);
      final loans = await LoanService().getLoans(widget.userPhone);
      final assetsForInsights = await _assetSvc.getAssets(widget.userPhone);
      await _loadPortfolioTotals();

      final openLoans = loans.where((l) => !(l.isClosed ?? false)).toList();
      final openLoanTotal =
          openLoans.fold<double>(0.0, (sum, loan) => sum + loan.amount);

      final userData = await FiinnyBrainService.createFromLiveData(
        widget.userPhone,
        incomes: allIncomes,
        expenses: allExpenses,
        goals: goalsList,
        loans: loans,
        assets: assetsForInsights,
      );
      final generated =
          FiinnyBrainService.generateInsights(userData, userId: widget.userPhone);

      if (!mounted) return;
      setState(() {
        goals = goalsList;
        currentGoal = goalsList.isNotEmpty ? goalsList.first : null;
        loanCount = openLoans.length;
        totalLoan = openLoanTotal;

        _insightUserData = userData;
        insights = generated;
        _generateSmartInsight();
      });

      await _loadPeriodLimit();
      unawaited(_checkLimitWarnings());
    } catch (_) {}
  }

  void _animateDashboardNumbersTo({
    required double credit,
    required double debit,
    required int txCount,
    required double totalAmount,
    Duration duration = const Duration(milliseconds: 900),
  }) {
    _numbersCtrl.stop();
    _numbersCtrl.duration = duration;

    final double fromCredit = _animCredit;
    final double fromDebit = _animDebit;
    final double fromAmount = _animAmount;
    final double fromCount = _animTxCount.toDouble();

    if (_numbersListener != null) {
      _numbersCtrl.removeListener(_numbersListener!);
    }

    void listener() {
      final t = Curves.easeOutCubic.transform(_numbersCtrl.value);
      setState(() {
        _animCredit = lerpDouble(fromCredit, credit, t)!;
        _animDebit = lerpDouble(fromDebit, debit, t)!;
        _animAmount = lerpDouble(fromAmount, totalAmount, t)!;
        _animTxCount = lerpDouble(fromCount, txCount.toDouble(), t)!.round();
      });
    }

    _numbersListener = listener;
    _numbersCtrl.addListener(listener);
    _numbersCtrl.forward(from: 0);
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

  void _onSmsPermissionStatusChanged() {
    if (!_isAndroidPlatform || !mounted) return;
    setState(() {
      _hasSmsPermission = SmsPermissionHelper.permissionStatus.value;
    });
  }

  Future<void> _updateSmsPermission({required bool requestPrompt}) async {
    if (!_isAndroidPlatform || _requestingSmsPermission) return;

    setState(() => _requestingSmsPermission = true);
    final bool granted = requestPrompt
        ? await SmsPermissionHelper.ensurePermissions()
        : await SmsPermissionHelper.hasPermissions();

    if (!mounted) return;

    setState(() => _requestingSmsPermission = false);

    if (granted) {
      SyncCoordinator.instance.onAppStop();
      await SyncCoordinator.instance.onAppStart(widget.userPhone);
      if (mounted) {
        SnackThrottle.show(context, 'SMS sync enabled!', color: Colors.green);
      }
    } else if (requestPrompt) {
      SnackThrottle.show(
        context,
        'Please allow SMS access so we can keep your spends up to date.',
        color: Colors.orange,
      );
    } else {
      SnackThrottle.show(
        context,
        'SMS permission is still disabled. Enable it from Settings to sync messages.',
        color: Colors.orange,
      );
    }
  }

  Widget _buildSmsPermissionBanner() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: const [
            BoxShadow(
              color: Color(0x14000000),
              blurRadius: 16,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.sms_failed_outlined, color: Colors.red.shade400, size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Turn on SMS sync',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Fx.mintDark,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Text(
              'Allow SMS access so we can automatically read bank alerts and keep your dashboard fresh.',
              style: TextStyle(fontSize: 13, color: Colors.black87, height: 1.4),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed:
                    _requestingSmsPermission ? null : () => _updateSmsPermission(requestPrompt: true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Fx.mintDark,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: _requestingSmsPermission
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation(Colors.white)),
                      )
                    : const Text('Enable SMS sync'),
              ),
            ),
            TextButton(
              onPressed:
                  _requestingSmsPermission ? null : () => _updateSmsPermission(requestPrompt: false),
              child: const Text('Already enabled? Refresh status'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    SmsPermissionHelper.permissionStatus.addListener(_onSmsPermissionStatusChanged);
    if (_isAndroidPlatform) {
      _hasSmsPermission = SmsPermissionHelper.permissionStatus.value ?? SmsPermissionHelper.lastKnownStatus;
    } else {
      _hasSmsPermission = null;
    }
    _ringShineController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..addStatusListener((status) {
        if (status == AnimationStatus.completed && mounted) {
          setState(() => _ringShineVisible = false);
        }
      });
    _ringShineController.forward();
    _numbersCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    _initDashboard();
    SyncCoordinator.instance.onAppStart(widget.userPhone);
    // 🔔 Start system recurring reminders (subs, SIPs, loans, card bills)
    _sysNotifs = SystemRecurringLocalScheduler(userId: widget.userPhone);
    _sysNotifs!.bind();
    unawaited(SocialEventsWatch.bind(widget.userPhone));
    unawaited(NotificationService().scheduleMonthlyWrapIfNeeded());

    Future.microtask(() async {
      await _fetchUserName();              // sets _isEmailLinked / _userEmail
      await _wirePipelines();              // trigger Gmail backfill after profile loads
      await SyncCoordinator.instance.onAppStart(widget.userPhone);
    });

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
    unawaited(SocialEventsWatch.unbind());
    _sysNotifs?.unbind();
    _ringShineController.dispose();
    if (_numbersListener != null) {
      _numbersCtrl.removeListener(_numbersListener!);
    }
    _numbersCtrl.dispose();
    SmsPermissionHelper.permissionStatus.removeListener(_onSmsPermissionStatusChanged);
    super.dispose();
  }



  void _openInsightFeed() {
    final data = _insightUserData;
    if (data == null) return;
    Navigator.pushNamed(
      context,
      '/insights',
      arguments: {
        'userId': widget.userPhone,
        'userData': data,
      },
    );
  }

  Widget _buildInsightFeedSection(EdgeInsets horizontalPadding) {
    final data = _insightUserData;
    if (data == null) return const SizedBox.shrink();

    if (insights.isEmpty) {
      return Padding(
        padding: horizontalPadding,
        child: EmptyStateCard(
          icon: Icons.psychology_alt_rounded,
          title: 'Fiinny Brain is warming up',
          subtitle: 'Add a few more transactions or fetch Gmail data to unlock personalised insights.',
          ctaText: 'Open Insights',
          onTap: _openInsightFeed,
        ),
      );
    }

    return Padding(
      padding: horizontalPadding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InsightFeedCard(
            insights: insights,
            userId: widget.userPhone,
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: _openInsightFeed,
              icon: const Icon(Icons.open_in_new_rounded),
              label: const Text('View all insights'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _fetchUserName() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userPhone)
          .get();
      final data = doc.data();

      final name = (data?['name'] as String?)?.trim();
      final photo = (data?['photo'] as String?)?.trim();
      final avatar = (data?['avatar'] as String?)?.trim();

      if (!mounted) return;
      setState(() {
        userName = (name?.isNotEmpty ?? false) ? name : "there";
        _userEmail = data?['email'];
        _isEmailLinked = (_userEmail != null && _userEmail!.isNotEmpty);

        final url = (photo != null && photo.isNotEmpty) ? photo : (avatar ?? "");
        userAvatar = url.isNotEmpty ? url : "assets/images/profile_default.png";
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        userName = "there";
        _isEmailLinked = false;
        userAvatar = "assets/images/profile_default.png";
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
    final range = _periodRange(period);
    if (range == null) return allExpenses;
    return allExpenses
        .where((e) => !e.date.isBefore(range.start) && e.date.isBefore(range.end))
        .toList();
  }

  List<IncomeItem> _filteredIncomesForPeriod(String period) {
    final range = _periodRange(period);
    if (range == null) return allIncomes;
    return allIncomes
        .where((e) => !e.date.isBefore(range.start) && e.date.isBefore(range.end))
        .toList();
  }

  // --- Limit helpers (SPENDING only) ---
  double get periodSpendOnly {
    return _filteredExpensesForPeriod(txPeriod).fold(0.0, (a, b) => a + b.amount);
  }

  void _resetLimitWarnings() {
    _warned80 = false;
    _warned100 = false;
  }

  Future<void> _checkLimitWarnings() async {
    if (_periodLimit == null || _periodLimit! <= 0) return;
    final used = periodSpendOnly;
    final ratio = used / _periodLimit!;
    final friendly = _friendlyPeriodLabel(txPeriod);
    if (!_warned80 && ratio >= 0.8 && ratio < 1.0) {
      _warned80 = true;
      final message = "You're at 80% of your $friendly spending limit.";
      SnackThrottle.show(
        context,
        message,
        color: Colors.orange,
      );
      await PushService.showLocalSmart(
        title: '⚠️ Close to limit',
        body:
            'You’ve reached 80% of your ${_friendlyPeriodLabel(txPeriod)} limit. Keep an eye on spending.',
        deeplink: 'app://budget',
        channelId: 'fiinny_critical',
      );
    }
    if (!_warned100 && ratio >= 1.0) {
      _warned100 = true;
      final message = "You've crossed the $friendly spending limit.";
      SnackThrottle.show(
        context,
        message,
        color: Colors.red,
      );
      await PushService.showLocalSmart(
        title: '⛔ Limit crossed',
        body:
            'You crossed the ${_friendlyPeriodLabel(txPeriod)} limit. Open Analytics for fixes & tips.',
        deeplink: 'app://analytics/monthly',
        channelId: 'fiinny_critical',
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

    if (txPeriod == "D" || txPeriod == "Today" || txPeriod == "Yesterday") {
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

    if (txPeriod == "D" || txPeriod == "Today" || txPeriod == "Yesterday") {
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

      final goalsList = await GoalService().getGoals(widget.userPhone);
      final loanService = LoanService();
      final loans = await loanService.getLoans(widget.userPhone);
      final assetsForInsights = await _assetSvc.getAssets(widget.userPhone);

      final openLoans = loans.where((l) => !(l.isClosed ?? false)).toList();
      final openLoanTotal = openLoans.fold<double>(0.0, (sum, loan) => sum + loan.amount);

      // ⬇️ NEW: compute assets from the Portfolio module store
      await _loadPortfolioTotals();

      final now = DateTime.now();
      final newTotalIncome = incomes
          .where((t) => t.date.month == now.month && t.date.year == now.year)
          .fold(0.0, (a, b) => a + b.amount);
      final newTotalExpense = expenses
          .where((t) => t.date.month == now.month && t.date.year == now.year)
          .fold(0.0, (a, b) => a + b.amount);
      final newSavings = newTotalIncome - newTotalExpense;

      final userData = await FiinnyBrainService.createFromLiveData(
        widget.userPhone,
        incomes: incomes,
        expenses: expenses,
        goals: goalsList,
        loans: loans,
        assets: assetsForInsights,
      );
      final generatedInsights =
          FiinnyBrainService.generateInsights(userData, userId: widget.userPhone);

      if (!mounted) return;
      setState(() {
        allExpenses = expenses;
        allIncomes = incomes;
        _summaryRevision++;
        _summaryCache.clear();
        _barsRevision++;
        _amountBarsCache.clear();
        _countBarsCache.clear();

        goals = goalsList;
        currentGoal = goalsList.isNotEmpty ? goalsList.first : null;
        loanCount = openLoans.length;
        totalLoan = openLoanTotal;

        totalIncome = newTotalIncome;
        totalExpense = newTotalExpense;
        savings = newSavings;
        _showFetchButton = incomes.isEmpty && expenses.isEmpty;

        _insightUserData = userData;
        insights = generatedInsights;

        _generateSmartInsight();
      });

      // Fetch current limit for this period
      await _loadPeriodLimit();

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
    unawaited(_checkLimitWarnings());
    final summary = _getTxSummaryForPeriod(txPeriod);
    final credit = summary['credit'] ?? 0.0;
    final debit = summary['debit'] ?? 0.0;
    final total = credit + debit;
    final txCnt = periodTotalCount;
    _animateDashboardNumbersTo(
      credit: credit,
      debit: debit,
      txCount: txCnt,
      totalAmount: total,
      duration: const Duration(milliseconds: 1100),
    );
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

  Future<void> _changePeriod(String period) async {
    if (!mounted) return;
    setState(() => txPeriod = period);
    await _loadPeriodLimit();
    _resetLimitWarnings();
    unawaited(_checkLimitWarnings());
    final summary = _getTxSummaryForPeriod(period);
    final credit = summary['credit'] ?? 0.0;
    final debit = summary['debit'] ?? 0.0;
    final total = credit + debit;
    final txCnt = periodTotalCount;
    _animateDashboardNumbersTo(
      credit: credit,
      debit: debit,
      txCount: txCnt,
      totalAmount: total,
    );
  }

  DateTime _startOfDay(DateTime dt) => DateTime(dt.year, dt.month, dt.day);

  DateTimeRange? _periodRange(String period) {
    final now = DateTime.now();
    final todayStart = _startOfDay(now);
    switch (period) {
      case 'D':
      case 'Today':
        return DateTimeRange(start: todayStart, end: todayStart.add(const Duration(days: 1)));
      case 'Yesterday':
        final start = todayStart.subtract(const Duration(days: 1));
        return DateTimeRange(start: start, end: todayStart);
      case 'Last 2 Days':
        final start = todayStart.subtract(const Duration(days: 1));
        return DateTimeRange(start: start, end: todayStart.add(const Duration(days: 1)));
      case 'Last 5 Days':
        final start = todayStart.subtract(const Duration(days: 4));
        return DateTimeRange(start: start, end: todayStart.add(const Duration(days: 1)));
      case 'W':
      case 'This Week':
        final start = todayStart.subtract(Duration(days: todayStart.weekday - 1));
        return DateTimeRange(start: start, end: start.add(const Duration(days: 7)));
      case 'M':
      case 'This Month':
        final start = DateTime(now.year, now.month);
        final end = DateTime(now.year, now.month + 1);
        return DateTimeRange(start: start, end: end);
      case 'Y':
      case 'This Year':
        final start = DateTime(now.year);
        final end = DateTime(now.year + 1);
        return DateTimeRange(start: start, end: end);
      case 'All Time':
        return null;
      default:
        return null;
    }
  }

  String _summaryTitle(String period) {
    final now = DateTime.now();
    final todayStart = _startOfDay(now);
    final dfFull = DateFormat('d MMM yyyy');
    String formatRange(DateTime start, DateTime end) =>
        '${dfFull.format(start)} - ${dfFull.format(end)}';

    switch (period) {
      case 'D':
      case 'Today':
        return 'Transactions for today (${dfFull.format(now)})';
      case 'Yesterday':
        final y = todayStart.subtract(const Duration(days: 1));
        return 'Transactions for yesterday (${dfFull.format(y)})';
      case 'Last 2 Days':
        final start = todayStart.subtract(const Duration(days: 1));
        return 'Transactions for last 2 days (${formatRange(start, now)})';
      case 'Last 5 Days':
        final start = todayStart.subtract(const Duration(days: 4));
        return 'Transactions for last 5 days (${formatRange(start, now)})';
      case 'W':
      case 'This Week':
        final start = todayStart.subtract(Duration(days: todayStart.weekday - 1));
        return 'Transactions for this week (${formatRange(start, now)})';
      case 'M':
      case 'This Month':
        final start = DateTime(now.year, now.month);
        final monthName = DateFormat('MMMM').format(now);
        return 'Transactions for $monthName (${formatRange(start, now)})';
      case 'Y':
      case 'This Year':
        final start = DateTime(now.year);
        return 'Transactions for this year (${formatRange(start, now)})';
      case 'All Time':
        return 'Transactions for all time';
      default:
        return 'Transactions for $period';
    }
  }

  String? _summarySubtitle(String period) {
    if (period == 'All Time') {
      final df = DateFormat('d MMM yyyy, hh:mm a');
      return 'Updated ${df.format(DateTime.now())}';
    }
    return null;
  }

  String _friendlyPeriodLabel(String period) {
    switch (period) {
      case 'D':
      case 'Today':
        return 'today';
      case 'Yesterday':
        return 'yesterday';
      case 'Last 2 Days':
        return 'the last 2 days';
      case 'Last 5 Days':
        return 'the last 5 days';
      case 'W':
      case 'This Week':
        return 'this week';
      case 'M':
      case 'This Month':
        return 'this month';
      case 'Y':
      case 'This Year':
        return 'this year';
      case 'All Time':
        return 'your entire history';
      default:
        return period.toLowerCase();
    }
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
    final result = await showModalBottomSheet<double>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        final bottomInset = MediaQuery.of(ctx).viewInsets.bottom;
        final theme = Theme.of(ctx);
        final periodName = _friendlyPeriodLabel(txPeriod);
        return Padding(
          padding: EdgeInsets.only(bottom: bottomInset),
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 42,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 20),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                  Text(
                    'Set a spending limit',
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Choose how much you want to spend for $periodName. We’ll alert you at 80% and 100% of the limit.',
                    style: theme.textTheme.bodyMedium?.copyWith(color: Colors.grey[700]),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: ctrl,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      labelText: 'Limit amount (₹)',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                      suffixIcon: ctrl.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () => ctrl.clear(),
                            )
                          : null,
                    ),
                  ),
                  if (p50 != null || p30 != null || p20 != null || suggested != null) ...[
                    const SizedBox(height: 16),
                    Text('Quick picks', style: theme.textTheme.labelLarge),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (p50 != null) _presetChip(ctx, '50% of income', p50, ctrl),
                        if (p30 != null) _presetChip(ctx, '30% of income', p30, ctrl),
                        if (p20 != null) _presetChip(ctx, '20% of income', p20, ctrl),
                        if (suggested != null)
                          ActionChip(
                            label: Text('Suggested ${INR.f(suggested)}'),
                            onPressed: () => ctrl.text = suggested.toStringAsFixed(0),
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, 0.0),
                        child: const Text('Remove limit'),
                      ),
                      const Spacer(),
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, null),
                        child: const Text('Cancel'),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        onPressed: () {
                          final entered = double.tryParse(ctrl.text.trim());
                          if (entered != null && entered > 0) {
                            Navigator.pop(ctx, entered);
                          }
                        },
                        child: const Text('Save limit'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
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
    unawaited(_checkLimitWarnings());
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

    final summaryTitle = _summaryTitle(txPeriod);
    final summarySubtitle = _summarySubtitle(txPeriod);
    final periodLimit = _periodLimit;
    final limitUsageText = periodLimit != null
        ? 'Limit ₹${periodLimit.toStringAsFixed(0)} • Used ₹${periodSpendOnly.toStringAsFixed(0)} '
            '(${((periodLimit > 0 ? (periodSpendOnly / periodLimit) : 0.0) * 100).toStringAsFixed(0)}%)'
        : null;

    const EdgeInsets horizontalPadding = EdgeInsets.symmetric(horizontal: 14);
    final String avatarValue = userAvatar ?? 'assets/images/profile_default.png';
    final bool isNetworkAvatar = avatarValue.startsWith('http');
    final ImageProvider<Object> avatarImage = isNetworkAvatar
        ? NetworkImage(avatarValue)
        : AssetImage(avatarValue) as ImageProvider<Object>;

    return Scaffold(
      backgroundColor: Colors.grey[50],
      extendBodyBehindAppBar: true,
      body: Stack(
        children: [
          const _AnimatedMintBackground(),
          SafeArea(
            top: true,
            bottom: false,
            child: RefreshIndicator(
              onRefresh: () async {
                await _refreshDashboardSmooth();
              },
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverAppBar(
                    automaticallyImplyLeading: false,
                    elevation: 0,
                    backgroundColor: Colors.transparent,
                    surfaceTintColor: Colors.transparent,
                    systemOverlayStyle: SystemUiOverlayStyle.dark,
                    toolbarHeight: 48,
                    pinned: false,
                    floating: true,
                    snap: true,
                    scrolledUnderElevation: 0,
                    titleSpacing: 16,
                    title: Text(
                      'Fiinny',
                      style: TextStyle(
                        color: Fx.mintDark,
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                        letterSpacing: 0.5,
                      ),
                    ),
                    actions: [
                      IconButton(
                        tooltip: 'Gmail Link',
                        icon: const Icon(Icons.mark_email_read_outlined, color: Fx.mintDark, size: 22),
                        onPressed: () {
                          Navigator.pushNamed(context, '/settings/gmail', arguments: widget.userPhone);
                        },
                      ),
                      IconButton(
                        icon: const Icon(Icons.notifications_active_rounded,
                            color: Fx.mintDark, size: 23),
                        tooltip: 'Notification settings',
                        onPressed: () async {
                          await NotifPrefsService.ensureDefaultPrefs();
                          if (!mounted) return;
                          Navigator.pushNamed(context, '/settings/notifications');
                        },
                      ),
                      IconButton(
                        tooltip: 'Analytics',
                        icon: const Icon(Icons.analytics_outlined, size: 22),
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
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.sync_rounded, color: Fx.mintDark, size: 22),
                        tooltip: 'Fetch Email Data',
                        onPressed: _isFetchingEmail
                            ? null
                            : () async {
                                if (!mounted) return;
                                setState(() => _isFetchingEmail = true);
                                try {
                                  await OldGmail.GmailService()
                                      .fetchAndStoreTransactionsFromGmail(widget.userPhone);
                                  await _initDashboard();
                                  if (mounted) {
                                    SnackThrottle.show(context, 'Fetched Gmail transactions!', color: Colors.green);
                                  }
                                } catch (e) {
                                  if (mounted) {
                                    SnackThrottle.show(context, 'Sync error: $e', color: Colors.red);
                                  }
                                } finally {
                                  if (mounted) setState(() => _isFetchingEmail = false);
                                }
                              },
                      ),
                      GestureDetector(
                        onTap: () {
                          Navigator.pushNamed(context, '/profile', arguments: widget.userPhone);
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: Container(
                            padding: const EdgeInsets.all(1.2),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: Colors.black.withOpacity(.10),
                                width: 1,
                              ),
                            ),
                            child: CircleAvatar(
                              radius: 18,
                              backgroundColor: Colors.white,
                              child: ClipOval(
                                child: Image(
                                  width: 36,
                                  height: 36,
                                  fit: BoxFit.cover,
                                  image: avatarImage,
                                  errorBuilder: (_, __, ___) {
                                    if (isNetworkAvatar) {
                                      return Image.asset(
                                        'assets/images/profile_default.png',
                                        width: 36,
                                        height: 36,
                                        fit: BoxFit.cover,
                                      );
                                    }
                                    return const Icon(
                                      Icons.person,
                                      size: 20,
                                      color: Colors.black54,
                                    );
                                  },
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                if (_loading)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(child: CircularProgressIndicator()),
                  )
                else
                  (() {
                    final sections = <Widget>[
                      const SizedBox(height: 6),
                      Padding(
                        padding: horizontalPadding,
                        child: _buildDashboardAdCard(),
                      ),
                      const SizedBox(height: 12),
                      Padding(
                        padding: horizontalPadding,
                        child: Text(
                          'Welcome, ${userName ?? '...'}',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: Fx.mintDark,
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Padding(
                        padding: horizontalPadding,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {
                            Navigator.pushNamed(
                              context,
                              '/tx-day-details',
                              arguments: widget.userPhone,
                            );
                          },
                          child: HeroTransactionRing(
                            credit: _animCredit,
                            debit: _animDebit,
                            period: txPeriod,
                            title: summaryTitle,
                            titleStyle: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w800, fontSize: 16),
                            subtitle: summarySubtitle,
                            onFilterTap: () async {
                              final result = await showModalBottomSheet<String>(
                                context: context,
                                builder: (ctx) => TxFilterBar(
                                  selected: txPeriod,
                                  onSelect: (period) => Navigator.pop(ctx, period),
                                ),
                              );
                              if (result != null && result != txPeriod) {
                                await _changePeriod(result);
                              }
                            },
                            limitInfo: limitUsageText,
                            onEditLimit: _savingLimit ? null : _editLimitDialog,
                            onLimitTap: _savingLimit ? null : _editLimitDialog,
                            showLimitButton: true,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Padding(
                        padding: horizontalPadding,
                        child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: SizedBox(
                                  height: 220,
                                  child: TransactionCountCard(
                                    key: ValueKey('count|$_barsRevision|$txPeriod'),
                                    count: _animTxCount,
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
                                        await _changePeriod(result);
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
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: SizedBox(
                                  height: 220,
                                  child: TransactionAmountCard(
                                    key: ValueKey('amount|$_barsRevision|$txPeriod'),
                                    label: 'Transaction Amount',
                                    amount: _animAmount,
                                    barData: _barDataAmount(),
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
                                        await _changePeriod(result);
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
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        Padding(
                          padding: horizontalPadding,
                          child: BankCardsCarousel(
                            expenses: filteredExpenses,
                            incomes: filteredIncomes,
                            userName: userName ?? 'User',
                            onAddCard: () {
                              SnackThrottle.show(context, "Add Card feature coming soon!");
                            },
                            onCardSelected: (slug) {
                               // Assuming we can get Bank Name from slug simply by capitalizing or mapped logic
                               // For display purposes, convert slug like 'hdfc' -> 'HDFC'
                               final bankName = slug.toUpperCase(); 

                               showDialog(
                                 context: context,
                                 builder: (_) => BankOverviewDialog(
                                   bankSlug: slug,
                                   bankName: bankName,
                                   allExpenses: filteredExpenses, // Use local filtered list or _expenses if available
                                   allIncomes: filteredIncomes,
                                   userPhone: widget.userPhone,
                                   userName: userName ?? 'User',
                                 ),
                               );
                            },
                          ),
                        ),
                        const SizedBox(height: 12),
                        Padding(
                          padding: horizontalPadding,
                          child: SmartNudgeWidget(userId: widget.userPhone),
                        ),
                        const SizedBox(height: 10),
                        Padding(
                          padding: horizontalPadding,
                          child: GmailBackfillBanner(
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
                        ),
                        const SizedBox(height: 10),
                        Padding(
                          padding: horizontalPadding,
                          child: CrisisAlertBanner(
                            userId: widget.userPhone,
                            totalIncome: totalIncome,
                            totalExpense: totalExpense,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Padding(
                          padding: horizontalPadding,
                          child: SmartInsightCard(
                            key: ValueKey('smart|$_summaryRevision|$txPeriod|body'),
                            income: totalIncome,
                            expense: totalExpense,
                            savings: savings,
                            goal: currentGoal,
                            totalLoan: totalLoan,
                            totalAssets: totalAssets,
                            insightText: smartInsight.trim().isEmpty ? null : smartInsight.trim(),
                            showToday: true,
                          ),
                        ),
                        const SizedBox(height: 12),
                        if (_insightUserData != null && !_INSIGHTS_AT_BOTTOM) ...[
                          _buildInsightFeedSection(horizontalPadding),
                          const SizedBox(height: 14),
                        ] else
                          const SizedBox(height: 14),
                        Padding(
                          padding: horizontalPadding,
                          child: LayoutBuilder(
                            builder: (context, constraints) {
                              final isNarrow = constraints.maxWidth < 640;
                              const double spacing = 12;
                              Widget wrapTile(Widget child) {
                                if (isNarrow) return child;
                                return SizedBox(height: 188, child: child);
                              }
                              final loansTile = wrapTile(_buildLoansTile());
                              final assetsTile = wrapTile(_buildAssetsTile());
                              if (isNarrow) {
                                return Column(
                                  children: [
                                    loansTile,
                                    SizedBox(height: spacing),
                                    assetsTile,
                                  ],
                                );
                              }
                              return Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(child: loansTile),
                                  SizedBox(width: spacing),
                                  Expanded(child: assetsTile),
                                ],
                              );
                            },
                          ),
                        ),
                        const SizedBox(height: 10),
                        Padding(
                          padding: horizontalPadding,
                          child: _buildGoalsTile(),
                        ),
                        const SizedBox(height: 10),
                        Padding(
                          padding: horizontalPadding,
                          child: NetWorthPanel(totalAssets: totalAssets, totalLoan: totalLoan),
                        ),
                        if (goals.isEmpty) ...[
                          const SizedBox(height: 10),
                          Padding(
                            padding: horizontalPadding,
                            child: EmptyStateCard(
                              icon: Icons.flag_rounded,
                              title: 'No goals yet',
                              subtitle: 'Set a saving goal and track progress effortlessly.',
                              ctaText: 'Add your first goal',
                              onTap: () async {
                                await Navigator.pushNamed(context, '/goals', arguments: widget.userPhone);
                                await _initDashboard();
                              },
                            ),
                          ),
                        ],
                        if (_showFetchButton && !_isEmailLinked) ...[
                          const SizedBox(height: 12),
                          Padding(
                            padding: horizontalPadding,
                            child: ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Fx.mintDark,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 13),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(15),
                                ),
                                elevation: 4,
                              ),
                              icon: const Icon(Icons.mail_rounded, color: Colors.white),
                              label: const Text(
                                'Fetch Email Data',
                                style: TextStyle(color: Colors.white, fontSize: 15),
                              ),
                              onPressed: _fetchEmailTx,
                            ),
                          ),
                        ],
                        const SizedBox(height: 18),
                        if (_insightUserData != null && _INSIGHTS_AT_BOTTOM) ...[
                          _buildInsightFeedSection(horizontalPadding),
                          const SizedBox(height: 14),
                        ],
                        const SizedBox(height: 48),
                      ];
                    final builtSections = List<Widget>.unmodifiable(sections);
                    return SliverPadding(
                      padding: const EdgeInsets.only(bottom: 32),
                      sliver: SliverList(
                        delegate: SliverChildListDelegate(
                          builtSections,
                          addAutomaticKeepAlives: false,
                          addRepaintBoundaries: true,
                          addSemanticIndexes: false,
                        ),
                      ),
                    );
                  })(),
                  if (_showSmsPermissionBanner)
                    SliverToBoxAdapter(
                      child: _buildSmsPermissionBanner(),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }


  Widget _buildLoansTile() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final card = LoansSummaryCard(
          userId: widget.userPhone,
          loanCount: loanCount,
          totalLoan: totalLoan,
          pendingSuggestions: _loanSuggestionsCount,
          onTap: () async {
            final changed = await Navigator.of(context).push<bool>(
              MaterialPageRoute(
                builder: (_) => LoansScreen(userId: widget.userPhone),
              ),
            );
            if (changed == true) {
              await _initDashboard();
            }
          },
          onReviewSuggestions: () async {
            if (!mounted) return;
            setState(() => _scanningLoans = true);
            try {
              await _loanDetector.scanAndWrite(widget.userPhone, daysWindow: 360);
              _loanSuggestionsCount = await _loanDetector.pendingCount(widget.userPhone);
            } finally {
              if (mounted) setState(() => _scanningLoans = false);
            }

            await showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              builder: (_) => SizedBox(
                height: MediaQuery.of(context).size.height * 0.70,
                child: LoanSuggestionsSheet(userId: widget.userPhone),
              ),
            );

            _loanSuggestionsCount = await _loanDetector.pendingCount(widget.userPhone);
            final ls = await LoanService().countOpenLoans(widget.userPhone);
            final sum = await LoanService().sumOutstanding(widget.userPhone);
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
        );
        if (constraints.maxHeight.isFinite) {
          return SizedBox.expand(child: card);
        }
        return card;
      },
    );
  }

  Widget _buildAssetsTile() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final card = Material(
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
        );
        if (constraints.maxHeight.isFinite) {
          return SizedBox.expand(child: card);
        }
        return card;
      },
    );
  }

  Widget _wrapRingWithShine(Widget child) {
    if (!_ringShineVisible) return child;
    return AnimatedBuilder(
      animation: _ringShineController,
      child: child,
      builder: (context, child) {
        final t = Curves.easeInOut.transform(_ringShineController.value);
        return Stack(
          children: [
            if (child != null) child,
            Positioned.fill(
              child: IgnorePointer(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    var width = constraints.maxWidth;
                    if (!width.isFinite || width <= 0) {
                      width = MediaQuery.of(context).size.width - 28; // approximate horizontal padding
                    }
                    if (width < 120) width = 120;
                    final shineWidth = width * 0.45;
                    final dx = (width + shineWidth) * t - shineWidth;
                    final opacity = (1 - t).clamp(0.0, 1.0) * 0.55;
                    return Opacity(
                      opacity: opacity,
                      child: Transform.translate(
                        offset: Offset(dx, 0),
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.centerLeft,
                              end: Alignment.centerRight,
                              colors: [
                                Colors.white.withOpacity(0.0),
                                Colors.white.withOpacity(0.75),
                                Colors.white.withOpacity(0.0),
                              ],
                              stops: const [0.0, 0.5, 1.0],
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildGoalsTile() {
    return Material(
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

  Map<String, double> _getTxSummaryForPeriod(String period) {
    final cacheKey = '${_summaryRevision}_$period';
    if (_summaryCache.containsKey(cacheKey)) {
      return _summaryCache[cacheKey]!;
    }

    final range = _periodRange(period);
    double credit;
    double debit;

    if (range == null) {
      credit = allIncomes.fold(0.0, (a, b) => a + b.amount);
      debit = allExpenses.fold(0.0, (a, b) => a + b.amount);
    } else {
      credit = _filteredIncomesForPeriod(period).fold(0.0, (a, b) => a + b.amount);
      debit = _filteredExpensesForPeriod(period).fold(0.0, (a, b) => a + b.amount);
    }

    final summary = {"credit": credit, "debit": debit, "net": credit - debit};
    _summaryCache[cacheKey] = summary;
    return summary;
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
