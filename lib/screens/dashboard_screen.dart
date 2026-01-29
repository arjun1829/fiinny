// `lib/screens/dashboard_screen.dart`

import 'dart:async';
import 'dart:ui';
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
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

import '../widgets/critical_alert_banner.dart';

import '../widgets/tx_filter_bar.dart';
import '../widgets/dashboard/bank_overview_dialog.dart';
import '../widgets/hero_transaction_ring.dart';
import '../services/user_data.dart';
import '../widgets/dashboard/bank_cards_carousel.dart';
import '../models/activity_event.dart';
import '../widgets/transaction_count_card.dart';
import '../widgets/transaction_amount_card.dart';

import '../themes/tokens.dart';

import '../core/formatters/inr.dart';

import '../core/ads/ads_banner_card.dart';
import '../core/ui/snackbar_throttle.dart';
import '../widgets/empty_state_card.dart';
import '../widgets/gmail_backfill_banner.dart';
import '../widgets/loan_suggestions_sheet.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
// NEW portfolio module imports (aliased so they don't clash with your old service/model)
import '../fiinny_assets/modules/portfolio/services/asset_service.dart'
    as p_asset_service;
import '../fiinny_assets/modules/portfolio/models/asset_model.dart'
    as p_asset_model;
import '../fiinny_assets/modules/portfolio/models/price_quote.dart';
import '../fiinny_assets/modules/portfolio/services/market_data_yahoo.dart';
import 'package:provider/provider.dart';
import '../services/notifs/social_events_watch.dart';
// ✅ NEW
import '../services/subscription_service.dart'; // ✅ NEW
// import '../models/subscription_item.dart'; unused
import '../services/subscriptions/subscription_notifier.dart';
import '../models/bank_account_model.dart';
import '../models/credit_card_model.dart';

import '../services/bank_account_service.dart';
import '../services/credit_card_service.dart';

import '../brain/loan_detection_service.dart';

import 'fiinny_brain_chat_screen.dart';

import '../core/ads/ad_service.dart';

import '../core/notifications/local_notifications.dart'
    show SystemRecurringLocalScheduler;

import '../services/sms/sms_permission_helper.dart';
import '../services/gmail_service.dart' as old_gmail;
import '../services/sms/sms_ingestor.dart';
import '../services/sync/sync_coordinator.dart';
import '../widgets/loans_summary_card.dart';
import '../widgets/assets_summary_card.dart';
import '../widgets/goals_summary_card.dart';
import '../widgets/net_worth_panel.dart';
import '../widgets/dashboard/subscriptions_summary_card.dart';

// --- Helper getters for dynamic model ---
DateTime getTxDate(dynamic tx) =>
    tx is IncomeItem ? tx.date : (tx as ExpenseItem).date;
double getTxAmount(dynamic tx) =>
    tx is IncomeItem ? tx.amount : (tx as ExpenseItem).amount;

class DashboardScreen extends StatefulWidget {
  final String userPhone;
  const DashboardScreen({required this.userPhone, super.key});

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
  // Subscriptions unused removed

  List<GoalModel> goals = [];
  GoalModel? currentGoal;
  List<InsightModel> insights = [];
  List<ActivityEvent> dashboardEvents = [];
  String smartInsight = "";
  String? userAvatar = "assets/images/profile_default.png";
  String txPeriod = "Today"; // D, W, M, Y, etc.
  List<ExpenseItem> allExpenses = [];
  List<IncomeItem> allIncomes = [];

  // Real Account Models (Phase 4)
  List<BankAccountModel> _bankAccounts = [];
  List<CreditCardModel> _creditCards = [];
  // _loans is already fetched as 'loans' variable below, will alias it later

  UserData? _insightUserData;
  String? userName; // will be fetched from Firestore
  bool _isEmailLinked = false;
  String? _userEmail;
  // Helper: Firestore doc ID for this user
  String get _userDocId => widget.userPhone;

  bool _isFetchingEmail = false;
  SystemRecurringLocalScheduler? _sysNotifs;

  final Map<String, List<double>> _amountBarsCache = {};
  final Map<String, List<int>> _countBarsCache = {};
  int _barsRevision = 0;

  final Map<String, Map<String, double>> _summaryCache = {};
  int _summaryRevision = 0;

  // --- Limit logic ---
  double? _periodLimit;
  bool _savingLimit = false;
  bool _warned80 = false;
  bool _warned100 = false;
  final _expenseSvc = ExpenseService();
  final _incomeSvc = IncomeService();
  final _assetSvc = AssetService();

  final _loanDetector = LoanDetectionService();
  int _pendingLoanSuggestions = 0;

  // _scanningLoans removed
  // _ringShineController removed
  // _ringShineVisible removed

  bool? _hasSmsPermission = SmsPermissionHelper.lastKnownStatus;
  bool _requestingSmsPermission = false;

  bool get _isAndroidPlatform =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
  bool get _showSmsPermissionBanner =>
      _isAndroidPlatform && (_hasSmsPermission == false);

  // Animated dashboard numbers (ring + cards)
  late AnimationController _numbersCtrl;
  double _animCredit = 0.0;
  double _animDebit = 0.0;
  double _animAmount = 0.0;
  int _animTxCount = 0;
  VoidCallback? _numbersListener;

  // Toggle to render insight feed at the bottom of the dashboard
  static const bool _insightsAtBottom = true;

  Widget _buildDashboardAdCard() {
    return AdsBannerCard(
      key: const ValueKey('ad-dashboard_summary'),
      placement: 'dashboard_summary',
      inline: false,
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

  Widget _buildPremiumCTA(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.amber.shade700, Colors.amber.shade500],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.amber.withValues(alpha: 0.3),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => Navigator.pushNamed(context, '/premium',
              arguments: widget.userPhone),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.star_rounded,
                      color: Colors.white, size: 24),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Upgrade to Premium",
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        "Remove ads & unlock AI Insights",
                        style: TextStyle(
                          color: Colors.white70,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    "Try Now",
                    style: TextStyle(
                      color: Colors.amber.shade800,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
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
      if (!mounted) {
        return;
      }

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
        // Use unified handler
        await _handleManualSync();
      } else {
        // Just try manual sync (which handles both, but primarily SMS if email not linked)
        await _handleManualSync();
      }
    } catch (_) {}

    try {
      await _loanDetector.scanAndWrite(widget.userPhone, daysWindow: 360);
      await _loanDetector.pendingCount(widget.userPhone);

      // Run subscription discovery
      if (mounted) {
        // Fire and forget
        Provider.of<SubscriptionService>(context, listen: false)
            .runDiscovery(widget.userPhone)
            .ignore();
      }

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

      // Subscriptions calculation removed

      // Sync reminders given fresh data
      SubscriptionNotifier.instance.syncReminders(widget.userPhone);

      final openLoans = loans.where((l) => !l.isClosed).toList();
      final openLoanTotal =
          openLoans.fold<double>(0.0, (prev, loan) => prev + loan.amount);

      final userData = await FiinnyBrainService.createFromLiveData(
        widget.userPhone,
        incomes: allIncomes,
        expenses: allExpenses,
        goals: goalsList,
        loans: loans,
        assets: assetsForInsights,
      );
      final generated = FiinnyBrainService.generateInsights(userData,
          userId: widget.userPhone);

      if (!mounted) {
        return;
      }
      setState(() {
        goals = goalsList;
        currentGoal = goalsList.isNotEmpty ? goalsList.first : null;
        loanCount = openLoans.length;
        totalLoan = openLoanTotal;
        // _subsCount = subs.length; // unused
        // _subsTotal = subTotal; // unused

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
    return const SizedBox(
      height: 60,
      width: double.infinity,
      child: Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.grey),
        ),
      ),
    );
  }

  void _onSmsPermissionStatusChanged() {
    if (!_isAndroidPlatform || !mounted) {
      return;
    }
    setState(() {
      _hasSmsPermission = SmsPermissionHelper.permissionStatus.value;
    });
  }

  Future<void> _updateSmsPermission({required bool requestPrompt}) async {
    if (!_isAndroidPlatform || _requestingSmsPermission) {
      return;
    }

    if (!requestPrompt) {
      // Just refresh status without prompting
      setState(() => _requestingSmsPermission = true);
      final bool granted = await SmsPermissionHelper.hasPermissions();
      if (!mounted) {
        return;
      }
      setState(() => _requestingSmsPermission = false);
      if (granted) {
        _onPermissionGranted();
      } else {
        SnackThrottle.show(context, 'SMS permission is disabled.',
            color: Colors.orange);
      }
      return;
    }

    // --- PROMINENT DISCLOSURE (Google Play Policy Requirement) ---
    // We must show a disclosure *before* the system permission dialog.
    final bool? agreed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Enable Expense Tracking'),
        content: const SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'To automatically track your expenses, Fiinny needs access to your SMS messages.',
                style: TextStyle(height: 1.4),
              ),
              SizedBox(height: 12),
              Text(
                '• What we read: Only transaction alerts from banks and cards.\n'
                '• What we ignore: Personal chats, OTPs, and promotional messages.\n'
                '• Privacy: Your data is processed locally on your device.',
                style:
                    TextStyle(fontSize: 13, color: Colors.black87, height: 1.5),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () =>
                Navigator.pop(context, false), // User declined disclosure
            child:
                const Text('No thanks', style: TextStyle(color: Colors.grey)),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(context, true), // User agreed to disclosure
            style: FilledButton.styleFrom(backgroundColor: Fx.mintDark),
            child: const Text('Agree & Continue'),
          ),
        ],
      ),
    );

    if (agreed != true) {
      return;
    }

    // Now it is safe to show the system prompt
    setState(() => _requestingSmsPermission = true);
    final bool granted = await SmsPermissionHelper.ensurePermissions();
    if (!mounted) {
      return;
    }
    setState(() => _requestingSmsPermission = false);

    if (granted) {
      _onPermissionGranted();
    } else {
      SnackThrottle.show(
        context,
        'Permission denied. We cannot sync your expenses without it.',
        color: Colors.orange,
      );
    }
  }

  Future<void> _onPermissionGranted() async {
    SyncCoordinator.instance.onAppStop();
    await SyncCoordinator.instance.onAppStart(widget.userPhone);
    if (mounted) {
      SnackThrottle.show(context, 'SMS sync enabled!', color: Colors.green);
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
                Icon(Icons.sms_failed_outlined,
                    color: Colors.red.shade400, size: 22),
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
              style:
                  TextStyle(fontSize: 13, color: Colors.black87, height: 1.4),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _requestingSmsPermission
                    ? null
                    : () => _updateSmsPermission(requestPrompt: true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Fx.mintDark,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: _requestingSmsPermission
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation(Colors.white)),
                      )
                    : const Text('Enable SMS sync'),
              ),
            ),
            TextButton(
              onPressed: _requestingSmsPermission
                  ? null
                  : () => _updateSmsPermission(requestPrompt: false),
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
    SmsPermissionHelper.permissionStatus
        .addListener(_onSmsPermissionStatusChanged);
    if (_isAndroidPlatform) {
      _hasSmsPermission = SmsPermissionHelper.permissionStatus.value ??
          SmsPermissionHelper.lastKnownStatus;
    } else {
      _hasSmsPermission = null;
    }
    // _ringShineController init removed
    _numbersCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 900));
    _initDashboard();
    SyncCoordinator.instance.onAppStart(widget.userPhone);
    // 🔔 Start system recurring reminders (subs, SIPs, loans, card bills)
    _sysNotifs = SystemRecurringLocalScheduler(userId: widget.userPhone);
    _sysNotifs!.bind();
    unawaited(SocialEventsWatch.bind(widget.userPhone));
    unawaited(NotificationService().scheduleMonthlyWrapIfNeeded());

    Future.microtask(() async {
      await _fetchUserName(); // sets _isEmailLinked / _userEmail
      await _wirePipelines(); // trigger Gmail backfill after profile loads
      await SyncCoordinator.instance.onAppStart(widget.userPhone);
    });

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      await NotificationService.initFull();
      await AdService.initLater();
    });

    // 🔔 Listen for global expense updates (e.g. from Expenses Tab)
    ExpenseService.globalUpdate.addListener(_handleGlobalUpdate);
  }

  void _handleGlobalUpdate() {
    if (mounted) {
      // Small debounce or direct refresh
      unawaited(_refreshDashboardSmooth());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    SyncCoordinator.instance.onAppStop();
    unawaited(SocialEventsWatch.unbind());
    _sysNotifs?.unbind();
    // _ringShineController dispose removed
    if (_numbersListener != null) {
      _numbersCtrl.removeListener(_numbersListener!);
    }
    _numbersCtrl.dispose();
    SmsPermissionHelper.permissionStatus
        .removeListener(_onSmsPermissionStatusChanged);
    ExpenseService.globalUpdate.removeListener(_handleGlobalUpdate);
    super.dispose();
  }

  void _openInsightFeed() {
    final data = _insightUserData;
    if (data == null) {
      return;
    }
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
          subtitle:
              'Add a few more transactions or fetch Gmail data to unlock personalised insights.',
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

      if (!mounted) {
        return;
      }
      setState(() {
        userName = (name?.isNotEmpty ?? false) ? name : "there";
        _userEmail = data?['email'];
        _isEmailLinked = (_userEmail != null && _userEmail!.isNotEmpty);

        final url =
            (photo != null && photo.isNotEmpty) ? photo : (avatar ?? "");
        userAvatar = url.isNotEmpty ? url : "assets/images/profile_default.png";
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
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
    final docRef =
        FirebaseFirestore.instance.collection('users').doc(_userDocId);
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
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      SyncCoordinator.instance.onAppStop();
    }
    super.didChangeAppLifecycleState(state);
  }

  Future<void> _maybeRunGmailBackfillOnce() async {
    final docRef =
        FirebaseFirestore.instance.collection('users').doc(_userDocId);
    bool already = false;
    try {
      final snapshot = await docRef.get();
      already = (snapshot.data()?['gmailBackfillDone'] == true);
    } catch (e) {
      debugPrint('Gmail backfill flag read failed: $e');
    }

    if (already) {
      return;
    }

    try {
      await _setGmailStatus('running');
      await old_gmail.GmailService()
          .fetchAndStoreTransactionsFromGmail(widget.userPhone);
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

  // UNIFIED MANUAL SYNC (GMAIL + SMS)
  // Limited to 3 free syncs/day, then Ad-gated.
  Future<void> _handleManualSync() async {
    if (!mounted) {
      return;
    }

    // --- MANUAL SYNC LIMIT LOGIC ---
    try {
      final prefs = await SharedPreferences.getInstance();
      final now = DateTime.now();
      final todayKey = 'manual_sync_count_${now.year}_${now.month}_${now.day}';
      final int count = prefs.getInt(todayKey) ?? 0;

      if (!mounted) return;

      final isPremium =
          Provider.of<SubscriptionService>(context, listen: false).isPremium;

      // Limit: 3 free syncs per day (unless Premium)
      if (count >= 3 && !isPremium) {
        // Force watch Ad
        final shown = await AdService.I.showInterstitialForce();
        if (shown) {
          // Success (monetized)
        } else {
          // Ad not ready or failed? Let them sync anyway (generous).
        }
      } else {
        // Free sync
        await prefs.setInt(todayKey, count + 1);
      }
    } catch (_) {
      // ignore prefs error (always allow if storage fails)
    }
    // -------------------------------

    // Trigger UI State
    await _setGmailStatus('running');
    setState(() {
      _isFetchingEmail = true; // Use same flag for spinner
    });

    final List<String> errors = [];

    // 1. Gmail Fetch
    try {
      await old_gmail.GmailService()
          .fetchAndStoreTransactionsFromGmail(widget.userPhone);
    } catch (e) {
      errors.add("Gmail: $e");
    }

    // 2. SMS Realtime Sync (Delta)
    try {
      // Delta sync checks recent messages since last sync
      await SmsIngestor.instance
          .syncDelta(userPhone: widget.userPhone, lookbackHours: 24);
    } catch (e) {
      if (kIsWeb || (defaultTargetPlatform != TargetPlatform.android)) {
        // Ignore SMS error on non-Android
      } else {
        errors.add("SMS: $e");
      }
    }

    // Refresh Dashboard Data
    await _initDashboard();

    // Status update
    if (errors.isEmpty) {
      await _setGmailStatus('ok');
      if (mounted) {
        SnackThrottle.show(context, "Synced Gmail & SMS transactions!",
            color: Colors.green);
      }
    } else {
      await _setGmailStatus('error', error: errors.join(', '));
      if (mounted) {
        SnackThrottle.show(
            context, "Sync completed with warnings: ${errors.join(', ')}",
            color: Colors.orange);
      }
    }

    if (mounted) setState(() => _isFetchingEmail = false);
  }

  Future<void> _loadPortfolioTotals() async {
    final pService = p_asset_service.AssetService();
    final market = MarketDataYahoo();

    // Load new holdings from the Firestore-backed portfolio module
    final List<p_asset_model.AssetModel> assets = await pService.loadAssets();

    // Build symbols to quote
    final symbols = <String>{
      for (final a in assets) a.type == 'stock' ? a.name.toUpperCase() : 'GOLD',
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

    if (!mounted) {
      return;
    }
    setState(() {
      assetCount = assets.length;
      totalAssets = total;
    });
  }

  // 1️⃣ --- Filtering Helpers ---
  List<ExpenseItem> _filteredExpensesForPeriod(String period) {
    final range = _periodRange(period);

    // Filter exclusions (Self-Transfer, CC Bills) + Date Range
    return allExpenses.where((e) {
      if (e.hasTag('self_transfer')) return false;
      if (e.hasTag('credit_card_bill')) return false;
      if (e.hasTag('repayment') && e.hasTag('credit_card'))
        return false; // Redundant safety

      if (range == null) return true;
      return !e.date.isBefore(range.start) && e.date.isBefore(range.end);
    }).toList();
  }

  List<IncomeItem> _filteredIncomesForPeriod(String period) {
    final range = _periodRange(period);
    if (range == null) {
      return allIncomes;
    }
    return allIncomes
        .where(
            (e) => !e.date.isBefore(range.start) && e.date.isBefore(range.end))
        .toList();
  }

  // --- Limit helpers (SPENDING only) ---
  double get periodSpendOnly {
    return _filteredExpensesForPeriod(txPeriod)
        .fold(0.0, (a, b) => a + b.amount);
  }

  void _resetLimitWarnings() {
    _warned80 = false;
    _warned100 = false;
  }

  Future<void> _checkLimitWarnings() async {
    if (_periodLimit == null || _periodLimit! <= 0) {
      return;
    }
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
    if (!mounted) return;

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
          final months = (maxDate.year - minDate.year) * 12 +
              (maxDate.month - minDate.month) +
              1;
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
          final months = (maxDate.year - minDate.year) * 12 +
              (maxDate.month - minDate.month) +
              1;
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
    final exp =
        _filteredExpensesForPeriod(txPeriod).fold(0.0, (a, b) => a + b.amount);
    final inc =
        _filteredIncomesForPeriod(txPeriod).fold(0.0, (a, b) => a + b.amount);
    return exp + inc;
  }

  int get periodTotalCount {
    final exp = _filteredExpensesForPeriod(txPeriod).length;
    final inc = _filteredIncomesForPeriod(txPeriod).length;
    return exp + inc;
  }

  Future<void> _initDashboard() async {
    if (!mounted) {
      return;
    }
    setState(() => _loading = true);
    try {
      final expenses = await _expenseSvc.getExpenses(widget.userPhone);
      final incomes = await _incomeSvc.getIncomes(widget.userPhone);

      final goalsList = await GoalService().getGoals(widget.userPhone);
      final loanService = LoanService();
      final loans = await loanService.getLoans(widget.userPhone);
      final assetsForInsights = await _assetSvc.getAssets(widget.userPhone);

      final openLoans = loans.where((l) => !l.isClosed).toList();
      final openLoanTotal =
          openLoans.fold<double>(0.0, (prev, loan) => prev + loan.amount);

      // ⬇️ NEW: compute assets from the Portfolio module store
      await _loadPortfolioTotals();

      // ✅ Phase 4: Fetch Real Accounts
      final bankAccounts =
          await BankAccountService().getAccounts(widget.userPhone);
      final creditCards =
          await CreditCardService().getUserCards(widget.userPhone);

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
      final generatedInsights = FiinnyBrainService.generateInsights(userData,
          userId: widget.userPhone);

      if (!mounted) {
        return;
      }
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
        _bankAccounts = bankAccounts;
        _creditCards = creditCards;

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
      debugPrint('[Dashboard] ERROR: $e');
      if (mounted) {
        SnackThrottle.show(context, "Dashboard error: $e");
      }
    }

    // 🔎 NEW: refresh "new loan detected" badge count
    try {
      final p = await _loanDetector.pendingCount(widget.userPhone);
      if (mounted) setState(() => _pendingLoanSuggestions = p);
    } catch (e) {
      debugPrint('[Dashboard] loan suggestions count error: $e');
    }

    if (!mounted) {
      return;
    }
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
    if (!mounted) {
      return;
    }
    setState(() {});
  }

  Future<void> _changePeriod(String period) async {
    if (!mounted) {
      return;
    }
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
        return DateTimeRange(
            start: todayStart, end: todayStart.add(const Duration(days: 1)));
      case 'Yesterday':
        final start = todayStart.subtract(const Duration(days: 1));
        return DateTimeRange(start: start, end: todayStart);
      case 'Last 2 Days':
        final start = todayStart.subtract(const Duration(days: 1));
        return DateTimeRange(
            start: start, end: todayStart.add(const Duration(days: 1)));
      case 'Last 5 Days':
        final start = todayStart.subtract(const Duration(days: 4));
        return DateTimeRange(
            start: start, end: todayStart.add(const Duration(days: 1)));
      case 'W':
      case 'This Week':
        final start =
            todayStart.subtract(Duration(days: todayStart.weekday - 1));
        return DateTimeRange(
            start: start, end: start.add(const Duration(days: 7)));
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
        final start =
            todayStart.subtract(Duration(days: todayStart.weekday - 1));
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
    final p50 =
        baseIncome > 0 ? ((baseIncome * 0.50) / 1000).round() * 1000 : null;
    final p30 =
        baseIncome > 0 ? ((baseIncome * 0.30) / 1000).round() * 1000 : null;
    final p20 =
        baseIncome > 0 ? ((baseIncome * 0.20) / 1000).round() * 1000 : null;
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
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Choose how much you want to spend for $periodName. We’ll alert you at 80% and 100% of the limit.',
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(color: Colors.grey[700]),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: ctrl,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      labelText: 'Limit amount (₹)',
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14)),
                      suffixIcon: ctrl.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () => ctrl.clear(),
                            )
                          : null,
                    ),
                  ),
                  if (p50 != null ||
                      p30 != null ||
                      p20 != null ||
                      suggested != null) ...[
                    const SizedBox(height: 16),
                    Text('Quick picks', style: theme.textTheme.labelLarge),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (p50 != null)
                          _presetChip(ctx, '50% of income', p50, ctrl),
                        if (p30 != null)
                          _presetChip(ctx, '30% of income', p30, ctrl),
                        if (p20 != null)
                          _presetChip(ctx, '20% of income', p20, ctrl),
                        if (suggested != null)
                          ActionChip(
                            label: Text('Suggested ${INR.f(suggested)}'),
                            onPressed: () =>
                                ctrl.text = suggested.toStringAsFixed(0),
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
      if (!mounted) {
        return;
      }
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
        if (mounted) {
          SnackThrottle.show(context, "Failed to save limit: $e");
        }
      }
      if (!mounted) {
        return;
      }
      setState(() => _savingLimit = false);
    }
    _resetLimitWarnings();
    unawaited(_checkLimitWarnings());
  }

  void _generateSmartInsight() {
    if (totalAssets > 0 || totalLoan > 0) {
      final double netWorth = totalAssets - totalLoan;
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
      final double months =
          ((currentGoal!.targetAmount - currentGoal!.savedAmount) /
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
    final String avatarValue =
        userAvatar ?? 'assets/images/profile_default.png';
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
                        icon: const Icon(Icons.mark_email_read_outlined,
                            color: Fx.mintDark, size: 22),
                        onPressed: () {
                          Navigator.pushNamed(context, '/settings/gmail',
                              arguments: widget.userPhone);
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
                      // NEW Animated Gemini-style Icon
                      Padding(
                        padding: const EdgeInsets.only(right: 4),
                        child: _GeminiAiIcon(
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) => FiinnyBrainChatScreen(
                                    userPhone: widget.userPhone),
                              ),
                            );
                          },
                        ),
                      ),
                      IconButton(
                        icon: _isFetchingEmail
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.sync_rounded,
                                color: Fx.mintDark, size: 22),
                        tooltip: 'Fetch Email Data',
                        onPressed: _isFetchingEmail ? null : _handleManualSync,
                      ),

                      GestureDetector(
                        onTap: () {
                          Navigator.pushNamed(context, '/profile',
                              arguments: widget.userPhone);
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: Container(
                            padding: const EdgeInsets.all(1.2),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: Colors.black.withValues(alpha: .10),
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
                      final sub = Provider.of<SubscriptionService>(context);
                      final sections = <Widget>[
                        const SizedBox(height: 6),
                        CriticalAlertBanner(userId: widget.userPhone),
                        if (!sub.isPremium) ...[
                          Padding(
                            padding: horizontalPadding,
                            child: _buildPremiumCTA(context),
                          ),
                          const SizedBox(height: 12),
                        ],
                        if (!sub.isPremium)
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
                                  ?.copyWith(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 16),
                              subtitle: summarySubtitle,
                              onFilterTap: () async {
                                final result =
                                    await showModalBottomSheet<String>(
                                  context: context,
                                  builder: (ctx) => TxFilterBar(
                                    selected: txPeriod,
                                    onSelect: (period) =>
                                        Navigator.pop(ctx, period),
                                  ),
                                );
                                if (result != null && result != txPeriod) {
                                  await _changePeriod(result);
                                }
                              },
                              limitInfo: limitUsageText,
                              onEditLimit:
                                  _savingLimit ? null : _editLimitDialog,
                              onLimitTap:
                                  _savingLimit ? null : _editLimitDialog,
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
                                    key: ValueKey(
                                        'count|$_barsRevision|$txPeriod'),
                                    count: _animTxCount,
                                    period: txPeriod,
                                    barData: _barDataCount(),
                                    onFilterTap: () async {
                                      final result =
                                          await showModalBottomSheet<String>(
                                        context: context,
                                        builder: (ctx) => TxFilterBar(
                                          selected: txPeriod,
                                          onSelect: (period) =>
                                              Navigator.pop(ctx, period),
                                        ),
                                      );
                                      if (result != null &&
                                          result != txPeriod) {
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
                                    key: ValueKey(
                                        'amount|$_barsRevision|$txPeriod'),
                                    label: 'Transaction Amount',
                                    amount: _animAmount,
                                    barData: _barDataAmount(),
                                    period: txPeriod,
                                    onFilterTap: () async {
                                      final result =
                                          await showModalBottomSheet<String>(
                                        context: context,
                                        builder: (ctx) => TxFilterBar(
                                          selected: txPeriod,
                                          onSelect: (period) =>
                                              Navigator.pop(ctx, period),
                                        ),
                                      );
                                      if (result != null &&
                                          result != txPeriod) {
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
                            bankAccounts: _bankAccounts,
                            creditCards: _creditCards,
                            onAddCard: () {
                              SnackThrottle.show(
                                  context, "Add Card feature coming soon!");
                            },
                            onViewAll: () {
                              Navigator.pushNamed(
                                context,
                                '/cards-management',
                                arguments: widget.userPhone,
                              );
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
                                  allExpenses:
                                      filteredExpenses, // Use local filtered list or _expenses if available
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
                            onRetry:
                                _isFetchingEmail ? null : _handleManualSync,
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
                            key: ValueKey(
                                'smart|$_summaryRevision|$txPeriod|body'),
                            income: totalIncome,
                            expense: totalExpense,
                            savings: savings,
                            goal: currentGoal,
                            totalLoan: totalLoan,
                            totalAssets: totalAssets,
                            insightText: smartInsight.trim().isEmpty
                                ? null
                                : smartInsight.trim(),
                            showToday: true,
                          ),
                        ),
                        const SizedBox(height: 12),
                        if (_insightUserData != null && !_insightsAtBottom) ...[
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
                              final subsTile = wrapTile(
                                  SubscriptionsSummaryCard(
                                      userId: widget.userPhone));

                              if (isNarrow) {
                                return Column(
                                  children: [
                                    subsTile, // Inserted first for visibility
                                    SizedBox(height: spacing),
                                    loansTile,
                                    SizedBox(height: spacing),
                                    assetsTile,
                                  ],
                                );
                              }
                              return Wrap(
                                spacing: spacing,
                                runSpacing: spacing,
                                children: [
                                  // Use Fractions or constrained width if using Wrap
                                  // Or just stick to Row if only 2 items per row
                                  // Let's refactor to a cleaner layout
                                  SizedBox(
                                      width:
                                          (constraints.maxWidth - spacing) / 2,
                                      child: subsTile),
                                  SizedBox(
                                      width:
                                          (constraints.maxWidth - spacing) / 2,
                                      child: loansTile),
                                  SizedBox(
                                      width:
                                          (constraints.maxWidth - spacing) / 2,
                                      child: assetsTile),
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
                          child: NetWorthPanel(
                              totalAssets: totalAssets, totalLoan: totalLoan),
                        ),
                        if (goals.isEmpty) ...[
                          const SizedBox(height: 10),
                          Padding(
                            padding: horizontalPadding,
                            child: EmptyStateCard(
                              icon: Icons.flag_rounded,
                              title: 'No goals yet',
                              subtitle:
                                  'Set a saving goal and track progress effortlessly.',
                              ctaText: 'Add your first goal',
                              onTap: () async {
                                await Navigator.pushNamed(context, '/goals',
                                    arguments: widget.userPhone);
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
                                padding:
                                    const EdgeInsets.symmetric(vertical: 13),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(15),
                                ),
                                elevation: 4,
                              ),
                              icon: const Icon(Icons.mail_rounded,
                                  color: Colors.white),
                              label: const Text(
                                'Fetch Email Data',
                                style: TextStyle(
                                    color: Colors.white, fontSize: 15),
                              ),
                              onPressed: _handleManualSync,
                            ),
                          ),
                        ],
                        const SizedBox(height: 18),
                        if (_insightUserData != null && _insightsAtBottom) ...[
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

  // _wrapRingWithShine removed

  Widget _presetChip(
      BuildContext ctx, String label, num amount, TextEditingController ctrl) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () => ctrl.text = amount.toStringAsFixed(0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.teal.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.teal.withValues(alpha: 0.25)),
        ),
        child: Text('$label • ₹${amount.toStringAsFixed(0)}',
            style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  // --- Missing Builder Methods ---

  Widget _buildLoansTile() {
    return LoansSummaryCard(
      userId: widget.userPhone,
      loanCount: loanCount,
      totalLoan: totalLoan,
      onAddLoan: () async {
        await Navigator.pushNamed(context, '/add_loan',
            arguments: widget.userPhone);
        await _initDashboard();
      },
      pendingSuggestions: _pendingLoanSuggestions,
      onReviewSuggestions: () => _showLoanSuggestions(context),
      onTap: () async {
        await Navigator.pushNamed(context, '/loans',
            arguments: widget.userPhone);
        await _initDashboard();
      },
    );
  }

  void _showLoanSuggestions(BuildContext context) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => LoanSuggestionsSheet(
        userId: widget.userPhone,
      ),
    );
    if (!mounted) return;
    await _initDashboard();
  }

  Widget _buildAssetsTile() {
    return AssetsSummaryCard(
      userId: widget.userPhone,
      assetCount: assetCount,
      totalAssets: totalAssets,
      onAddAsset: () async {
        await Navigator.pushNamed(context, '/add_asset',
            arguments: widget.userPhone);
        await _initDashboard();
      },
    );
  }

  Widget _buildGoalsTile() {
    return GoalsSummaryCard(
      userId: widget.userPhone,
      goalCount: goals.length,
      totalGoalAmount: goals.fold(0, (acc, item) => acc + item.targetAmount),
      onAddGoal: () async {
        await Navigator.pushNamed(context, '/goals',
            arguments: widget.userPhone);
        await _initDashboard();
      },
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
      credit =
          _filteredIncomesForPeriod(period).fold(0.0, (a, b) => a + b.amount);
      debit =
          _filteredExpensesForPeriod(period).fold(0.0, (a, b) => a + b.amount);
    }

    final summary = {"credit": credit, "debit": debit, "net": credit - debit};
    _summaryCache[cacheKey] = summary;
    return summary;
  }
}

class _AnimatedMintBackground extends StatelessWidget {
  const _AnimatedMintBackground();
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
                Colors.tealAccent.withValues(alpha: 0.2),
                Colors.teal.withValues(alpha: 0.1),
                Colors.white.withValues(alpha: 0.6),
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

class _GeminiAiIcon extends StatefulWidget {
  final VoidCallback onTap;
  const _GeminiAiIcon({required this.onTap});

  @override
  State<_GeminiAiIcon> createState() => _GeminiAiIconState();
}

class _GeminiAiIconState extends State<_GeminiAiIcon>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Fiinny AI',
      child: InkWell(
        onTap: widget.onTap,
        borderRadius: BorderRadius.circular(50),
        child: Container(
          padding: const EdgeInsets.all(10), // Touch target padding
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              return ShaderMask(
                blendMode: BlendMode.srcIn,
                shaderCallback: (bounds) {
                  return LinearGradient(
                    colors: const [
                      Color(0xFF1E88E5), // Blue
                      Color(0xFF8E24AA), // Purple
                      Color(0xFFE91E63), // Pink
                      Color(0xFF1E88E5), // Loop back to Blue
                    ],
                    // Rotate the gradient to create the "alive" shimmering effect
                    transform:
                        GradientRotation(_controller.value * 2 * 3.14159),
                  ).createShader(bounds);
                },
                child: const Icon(
                  Icons.auto_awesome, // The "Gemini" style sparkle
                  size: 26,
                  color: Colors.white, // Base color for mask
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
