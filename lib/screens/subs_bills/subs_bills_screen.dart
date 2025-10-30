// lib/screens/subs_bills/subs_bills_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show TextPosition, TextSelection;

import 'package:lifemap/details/models/shared_item.dart';
import '../../services/cards/card_due_notifier.dart';
import '../../services/credit_card_service.dart';
import '../../services/notification_service.dart';
import '../../services/subscriptions/subscriptions_service.dart';
import 'package:lifemap/details/services/subscriptions_service.dart'
    as user_subs;
import 'package:lifemap/details/subs_bills/add_subs_custom_reminder_sheet.dart'
    show AddSubsCustomReminderSheet, ReminderSelection;
import 'package:lifemap/details/subs_bills/add_subs_hub_sheet.dart';
import 'package:lifemap/details/shared/partner_capabilities.dart';

// visual tokens/components
import 'package:lifemap/ui/tokens.dart';
import 'package:lifemap/themes/tokens.dart';
import 'package:lifemap/ui/glass/glass_card.dart';
import 'package:lifemap/ui/tonal/tonal_card.dart';

// VM + cards
import 'vm/subs_bills_viewmodel.dart';
import 'widgets/subscription_card.dart' show SubscriptionCard;
import 'widgets/bills_card.dart';
import 'widgets/recurring_card.dart';
import 'widgets/emis_card.dart';
import 'widgets/upcoming_timeline.dart' show UpcomingTimeline;

// helper
import 'package:lifemap/utils/debounce.dart';
import 'package:lifemap/ui/comp/hero_summary.dart';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'review_pending_sheet.dart';

class SubsBillsScreen extends StatefulWidget {
  final String? userPhone;
  final Stream<List<SharedItem>>? source;
  final String? friendId;
  final String? friendName;
  final String? groupId;
  final List<String> participantUserIds;
  final bool mirrorToFriend;
  final PartnerCapabilities? partnerCapabilities;

  const SubsBillsScreen({
    Key? key,
    this.userPhone,
    this.source,
    this.friendId,
    this.friendName,
    this.groupId,
    this.participantUserIds = const <String>[],
    this.mirrorToFriend = true,
    this.partnerCapabilities,
  }) : super(key: key);

  @override
  State<SubsBillsScreen> createState() => _SubsBillsScreenState();
}

enum _TypeFilter { all, recurring, subscription, emi, reminder }
enum _StatusFilter { all, active, paused, ended }

/// Soft dynamic gradient background (local; no missing imports)
class _Subs_Bg extends StatefulWidget {
  const _Subs_Bg({super.key});
  @override
  State<_Subs_Bg> createState() => _Subs_BgState();
}

class _Subs_BgState extends State<_Subs_Bg> with SingleTickerProviderStateMixin {
  late final AnimationController _t =
  AnimationController(vsync: this, duration: const Duration(seconds: 6))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _t.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bool lowGpu = AppPerf.lowGpuMode;
    if (lowGpu) {
      // Static background when low-GPU mode is on.
      return Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF00D2D3), Color(0xFFFDFBFB)],
          ),
        ),
      );
    }
    return AnimatedBuilder(
      animation: _t,
      builder: (_, __) {
        final a = 0.06 + 0.04 * _t.value;
        return Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                const Color(0xFF00D2D3).withOpacity(.22 + a), // teal wash
                const Color(0xFFFDFBFB).withOpacity(.95),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _SubsBillsScreenState extends State<SubsBillsScreen> {
  late final SubscriptionsService _svc;
  late final user_subs.UserSubscriptionsService _userSubsService;
  late final SubsBillsViewModel _vm;
  late final CreditCardService _cardService;
  final NotificationService _notificationService = NotificationService();
  final _locallyPaid = <String>{}; // local hide after “Paid?” (optimistic)

  final TextEditingController _search = TextEditingController();
  final FocusNode _searchFocus = FocusNode();
  bool _searchOpen = false;

  Stream<List<SharedItem>>? _resolvedStream;
  final _scroll = ScrollController();

  _TypeFilter _type = _TypeFilter.all;
  _StatusFilter _status = _StatusFilter.all;

  // anchors for scroll-to-section
  final GlobalKey _cardsKey = GlobalKey(debugLabel: 'cards');
  final GlobalKey _subsKey = GlobalKey(debugLabel: 'subs');
  final GlobalKey _billsKey = GlobalKey(debugLabel: 'bills');
  final GlobalKey _recurKey = GlobalKey(debugLabel: 'recur');
  final GlobalKey _emisKey = GlobalKey(debugLabel: 'emis');

  // perf helper
  final Debouncer _debounce = Debouncer(const Duration(milliseconds: 220));
  bool _cardRemindersQueued = false;

  @override
  void initState() {
    super.initState();
    _svc = SubscriptionsService(
      defaultUserPhone: widget.userPhone,
      defaultFriendId: widget.friendId,
      defaultGroupId: widget.groupId,
      defaultParticipantUserIds: widget.participantUserIds,
      defaultMirrorToFriend: widget.mirrorToFriend,
    );
    _cardService = CreditCardService();
    _userSubsService = user_subs.UserSubscriptionsService();
    _vm = SubsBillsViewModel(_svc);

    Stream<List<SharedItem>> resolved;
    if (widget.source != null) {
      resolved = widget.source!;
    } else if (widget.userPhone != null) {
      resolved = _svc.watchUnified(widget.userPhone!);
    } else {
      resolved = _svc.safeEmptyStream;
    }

    if (widget.source == null &&
        widget.userPhone != null &&
        widget.friendId == null &&
        widget.groupId == null) {
      final personal = _userSubsService.watchAsSharedItems(widget.userPhone!);
      resolved = _combineSharedStreams(resolved, personal);
    }

    _resolvedStream = resolved;

    // debounce typing — avoid rebuild per keystroke
    _search.addListener(() {
      _debounce(() {
        if (!mounted) return;
        setState(() {});
      });
    });

    if (widget.userPhone != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _ensureCardReminders();
      });
    }
  }

  @override
  void dispose() {
    _search.dispose();
    _searchFocus.dispose();
    _scroll.dispose();
    _debounce.dispose();
    super.dispose();
  }

  Future<void> _ensureCardReminders() async {
    if (_cardRemindersQueued || widget.userPhone == null) return;
    _cardRemindersQueued = true;
    try {
      final notifier = CardDueNotifier(_cardService, _notificationService);
      await notifier.scheduleAll(widget.userPhone!);
    } catch (err, stack) {
      debugPrint('[SubsBills] Failed to schedule card reminders: $err\n$stack');
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final viewInsets = media.viewInsets;
    final viewPadding = media.viewPadding;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 0,
        title: Padding(
          padding: const EdgeInsets.only(left: 8),
          child: Row(
            children: const [
              Icon(Icons.receipt_long_rounded, color: AppColors.mint),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Financial Overview',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  softWrap: false,
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
        ),
        actions: [
          if (widget.userPhone != null)
            _ReviewBadgeAction(
              userId: widget.userPhone!,
              onOpenSubs: () => _openReviewSheet(isLoans: false),
              onOpenLoans: () => _openReviewSheet(isLoans: true),
            ),
          IconButton(
            tooltip: 'Add subscription or bill',
            onPressed: _onTapPrimaryAdd,
            icon: const Icon(Icons.add_circle_outline_rounded,
                color: AppColors.mint),
          ),
          IconButton(
            tooltip: 'Notifications',
            onPressed: () {},
            icon: const Icon(Icons.notifications_none_rounded,
                color: AppColors.mint),
          ),
        ],
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: _MintAddButton(
          onTap: _onTapPrimaryAdd,
          showShadow: true,
        ),
      ),
      body: Stack(
        children: [
          // Soft gradient background (local; no missing imports)
          const Positioned.fill(
            child: RepaintBoundary(child: _Subs_Bg()),
          ),
          Positioned.fill(
            child: StreamBuilder<List<SharedItem>>(
              stream: _resolvedStream,
              builder: (context, snap) {
                final hasError = snap.hasError;
                final itemsRaw = snap.data ?? const <SharedItem>[];
                final isLoading =
                    snap.connectionState == ConnectionState.waiting &&
                        itemsRaw.isEmpty;

                // cleanup local paid set if stream no longer has those ids
                _locallyPaid.removeWhere((id) => !itemsRaw.any((e) => e.id == id));

                // search + filters
                final q = _search.text.trim().toLowerCase();
                final itemsFiltered = itemsRaw.where((e) {
                  if (_locallyPaid.contains(e.id)) return false; // hide immediately
                  // type filter
                  if (_type != _TypeFilter.all) {
                    final t = (e.type ?? '').toLowerCase();
                    final want = {
                      _TypeFilter.recurring: 'recurring',
                      _TypeFilter.subscription: 'subscription',
                      _TypeFilter.emi: 'emi',
                      _TypeFilter.reminder: 'reminder',
                    }[_type]!;
                    if (t != want) return false;
                  }
                  // status filter (guard null rule)
                  if (_status != _StatusFilter.all) {
                    final s = (e.rule.status ?? 'active').toLowerCase();
                    final want = {
                      _StatusFilter.active: 'active',
                      _StatusFilter.paused: 'paused',
                      _StatusFilter.ended: 'ended',
                    }[_status]!;
                    if (s != want) return false;
                  }
                  // search
                  if (q.isEmpty) return true;
                  final t = (e.title ?? '').toLowerCase();
                  final note = (e.note ?? '').toLowerCase();
                  final type = (e.type ?? '').toLowerCase();
                  final status = (e.rule?.status ?? '').toLowerCase();
                  return t.contains(q) ||
                      note.contains(q) ||
                      type.contains(q) ||
                      status.contains(q);
                }).toList();

                // aggregates (compute on filtered list)
                final kpis = _svc.computeKpis(itemsFiltered);
                final subs = _vm.subscriptions(itemsFiltered);
                final bills = _vm.bills(itemsFiltered);
                final recur = _vm.recurringNonMonthly(itemsFiltered);
                final emis = _vm.emis(itemsFiltered);

                // Bottom padding that plays nice with keyboard + FAB + safe area
                final baseBottom = viewPadding.bottom + 110.0;
                final kbOpen = viewInsets.bottom > 0;
                final kbPad = kbOpen ? 12.0 : 0.0;
                final listBottomPad = baseBottom + kbPad;

                return RefreshIndicator(
                  onRefresh: () async {
                    if (!mounted) return;
                    setState(() {});
                  },
                  child: ListView(
                    controller: _scroll,
                    padding: EdgeInsets.fromLTRB(16, 16, 16, listBottomPad),
                    cacheExtent: 300,
                    addAutomaticKeepAlives: false,
                    addRepaintBoundaries: true,
                    addSemanticIndexes: false,
                    children: [
                      // === Hero Summary ===
                      _SlideIn(
                        direction: AxisDirection.down,
                        delay: 40,
                        child: HeroSummary(
                          kpis: kpis,
                          searchOpen: _searchOpen,
                          searchController: _search,
                          searchFocus: _searchFocus,
                          onClearSearch: _clearSearch,
                          onToggleSearch: () {
                            setState(() {
                              _searchOpen = !_searchOpen;
                              if (_searchOpen) {
                                Future.microtask(() => _searchFocus.requestFocus());
                              } else {
                                _searchFocus.unfocus();
                              }
                            });
                          },
                          onAddTap: _openAddEntry,
                          onQuickAction: _handleQuickAction,
                          quickSuggestions: const ['overdue', 'paused', 'subscription', 'emi', 'annual'],
                          onTapSuggestion: _applySuggestion,
                          typeOptions: [
                            FilterOption(
                                label: 'All',
                                selected: _type == _TypeFilter.all,
                                onTap: () => _debounce(
                                        () => setState(() => _type = _TypeFilter.all))),
                            FilterOption(
                                label: 'Recurring',
                                selected: _type == _TypeFilter.recurring,
                                onTap: () => _debounce(
                                        () => setState(() => _type = _TypeFilter.recurring))),
                            FilterOption(
                                label: 'Subs',
                                selected: _type == _TypeFilter.subscription,
                                onTap: () => _debounce(
                                        () => setState(() => _type = _TypeFilter.subscription))),
                            FilterOption(
                                label: 'EMIs',
                                selected: _type == _TypeFilter.emi,
                                onTap: () => _debounce(
                                        () => setState(() => _type = _TypeFilter.emi))),
                            FilterOption(
                                label: 'Rem',
                                selected: _type == _TypeFilter.reminder,
                                onTap: () => _debounce(
                                        () => setState(() => _type = _TypeFilter.reminder))),
                          ],
                          statusOptions: [
                            FilterOption(
                                label: 'Active',
                                selected: _status == _StatusFilter.active,
                                onTap: () => _debounce(
                                        () => setState(() => _status = _StatusFilter.active))),
                            FilterOption(
                                label: 'Paused',
                                selected: _status == _StatusFilter.paused,
                                onTap: () => _debounce(
                                        () => setState(() => _status = _StatusFilter.paused))),
                            FilterOption(
                                label: 'Ended',
                                selected: _status == _StatusFilter.ended,
                                onTap: () => _debounce(
                                        () => setState(() => _status = _StatusFilter.ended))),
                          ],
                        ),
                      ),

                      // compact inline Review chips
                      if (widget.userPhone != null) ...[
                        const SizedBox(height: 8),
                        _SlideIn(
                          direction: AxisDirection.down,
                          delay: 90,
                          child: _InlineReviewRow(
                            userId: widget.userPhone!,
                            onOpenSubs: () => _openReviewSheet(isLoans: false),
                            onOpenLoans: () => _openReviewSheet(isLoans: true),
                          ),
                        ),
                      ],

                        const SizedBox(height: 16),

                      // === NEW: Credit Cards (Bills & Spend) ===
                      if (widget.userPhone != null) ...[
                        const _SectionTitle(
                          icon: Icons.credit_card,
                          label: 'Credit Cards',
                          color: AppColors.mint,
                        ),
                        _SlideIn(
                          key: _cardsKey,
                          direction: AxisDirection.left,
                          delay: 100,
                          child: _CardsDueSection(
                            userId: widget.userPhone!,
                            cardService: _cardService,
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // --- Subscriptions ---
                      if ((subs['items'] as List).isNotEmpty) ...[
                        _SubscriptionsHeader(
                          amountLabel:
                              '₹ ${_fmtAmount(subs['monthlyTotal'] as double)} / mo',
                          onAdd: () => _svc.openAddFromType(context, 'subscription'),
                        ),
                        const SizedBox(height: 12),
                        _SlideIn(
                          key: _subsKey,
                          direction: AxisDirection.left,
                          delay: 110,
                          child: SubscriptionCard(
                            top: subs['top'] as List<SharedItem>,
                            monthlyTotal: subs['monthlyTotal'] as double,
                            onAdd: () => _svc.openAddFromType(context, 'subscription'),
                            onOpen: (item) => _openDebitSheet(context, item),
                            onEdit: _handleEdit,
                            onManage: _handleManage,
                            onReminder: _handleReminder,
                            onMarkPaid: (item) async {
                              _locallyPaid.add(item.id);
                              if (mounted) setState(() {});
                              try {
                                await _handleMarkPaid(item);
                              } catch (err) {
                                _locallyPaid.remove(item.id);
                                if (mounted) {
                                  setState(() {});
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('Failed to mark paid: $err')),
                                  );
                                }
                              }
                            },
                            showHeader: false,
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // --- Bills (generic non-card) ---
                      if ((bills['items'] as List).isNotEmpty) ...[
                        _OverviewSectionHeader(
                          icon: Icons.receipt_long_rounded,
                          title: 'Bills Due This Month',
                          color: Colors.black87,
                          amountLabel:
                              '₹ ${_fmtAmount(bills['totalThisMonth'] as double)}',
                          actionLabel: 'View all',
                          onActionTap: () => _scrollTo(_billsKey),
                        ),
                        const SizedBox(height: 12),
                        _BillsProgressBar(
                          value: (bills['paidRatio'] as double),
                          color: Colors.black87,
                        ),
                        const SizedBox(height: 12),
                        _SlideIn(
                          key: _billsKey,
                          direction: AxisDirection.right,
                          delay: 160,
                          child: BillsCard(
                            top: (bills['top'] as List<SharedItem>),
                            items: (bills['items'] as List<SharedItem>),
                            totalThisMonth: (bills['totalThisMonth'] as double),
                            paidRatio: (bills['paidRatio'] as double),
                            onViewAll: () => _scrollTo(_billsKey),
                            accentColor: Colors.black87,
                            onPay: (e) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('Pay ${e.title ?? 'bill'}')));
                            },
                            onManage: _handleManage,
                            onReminder: _handleReminder,
                            onMarkPaid: (e) async {
                              _locallyPaid.add(e.id);
                              if (mounted) setState(() {});
                              try {
                                await _handleMarkPaid(e);
                              } catch (err) {
                                _locallyPaid.remove(e.id);
                                if (mounted) {
                                  setState(() {});
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('Failed to mark paid: $err')),
                                  );
                                }
                              }
                            },
                            showHeader: false,
                            showProgress: false,
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // --- Recurring (non-monthly) ---
                      if ((recur['items'] as List).isNotEmpty) ...[
                        const _SectionTitle(
                          icon: Icons.repeat_rounded,
                          label: 'Recurring Payments',
                          color: AppColors.electricPurple,
                        ),
                        _SlideIn(
                          key: _recurKey,
                          direction: AxisDirection.left,
                          delay: 210,
                          child: RecurringCard(
                            top: (recur['top'] as List<SharedItem>),
                            annualTotal: (recur['annualTotal'] as double),
                            onManage: () => _scrollTo(_recurKey),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // --- EMIs ---
                      if ((emis['items'] as List).isNotEmpty) ...[
                        const _SectionTitle(
                          icon: Icons.account_balance_rounded,
                          label: 'Loans & EMIs',
                          color: AppColors.teal,
                        ),
                        _SlideIn(
                          key: _emisKey,
                          direction: AxisDirection.right,
                          delay: 240,
                          child: EmisCard(
                            top: (emis['top'] as List<SharedItem>),
                            nextTotal: (emis['nextTotal'] as double),
                            onManage: () => _scrollTo(_emisKey),
                            onAdd: () => _svc.openAddFromType(context, 'emi'),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // --- Upcoming (10 days) ---
                      const _OverviewSectionHeader(
                        icon: Icons.upcoming_rounded,
                        title: 'Upcoming (10 days)',
                        color: AppColors.mint,
                      ),
                      const SizedBox(height: 12),
                      _SlideIn(
                        direction: AxisDirection.up,
                        delay: 280,
                        child: GlassCard(
                          showGloss: true,
                          glassGradient: [
                            Colors.white.withOpacity(.26),
                            Colors.white.withOpacity(.10),
                          ],
                          // Keep Upcoming consistent with current filters
                          child: UpcomingTimeline(
                            items: itemsFiltered,
                            daysWindow: 10,
                            onSeeAll: () {
                              // TODO: wire up Upcoming list route
                            },
                          ),
                        ),
                      ),

                      const SizedBox(height: 16),

                      if (hasError)
                        _errorCard(snap.error)
                      else if (isLoading)
                        _loadingCard()
                      else if (itemsRaw.isEmpty)
                        _emptyCard(onAdd: _openAddEntry)
                      else if (itemsFiltered.isEmpty)
                        _filteredEmptyCard(
                          hasQuery: q.isNotEmpty,
                          hasTypeFilter: _type != _TypeFilter.all,
                          hasStatusFilter: _status != _StatusFilter.all,
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  // ---- helpers ----

  void _clearSearch() {
    if (_search.text.isEmpty) return;
    setState(() {
      _search.clear();
    });
  }

  void _resetFilters() {
    if (_type == _TypeFilter.all && _status == _StatusFilter.all) return;
    setState(() {
      _type = _TypeFilter.all;
      _status = _StatusFilter.all;
    });
  }

  void _applySuggestion(String suggestion) {
    setState(() {
      _searchOpen = true;
      _search.text = suggestion;
      _search.selection = TextSelection.fromPosition(
        TextPosition(offset: _search.text.length),
      );
    });
    Future.microtask(() => _searchFocus.requestFocus());
  }

  void _handleQuickAction(String key) {
    switch (key) {
      case 'subscription':
      case 'recurring':
      case 'reminder':
      case 'emi':
        _svc.openAddFromType(
          context,
          key,
          userPhone: widget.userPhone,
          friendId: widget.friendId,
          friendName: widget.friendName,
          groupId: widget.groupId,
          participantUserIds: widget.participantUserIds,
          mirrorToFriend: widget.mirrorToFriend,
        );
        break;
      case 'review':
        if (widget.userPhone != null) {
          _openReviewSheet(isLoans: false);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Link a profile to review pending items.')),
          );
        }
        break;
      default:
        _openAddEntry();
    }
  }

  void _onTapPrimaryAdd() {
    if (widget.userPhone != null) {
      _svc.openQuickAddForSubs(
        context,
        userId: widget.userPhone!,
        friendId: widget.friendId,
        friendName: widget.friendName,
        groupId: widget.groupId,
        participantUserIds: widget.participantUserIds,
        mirrorToFriend: widget.mirrorToFriend,
        capabilities: widget.partnerCapabilities,
      );
      return;
    }

    _openAddEntry();
  }

  void _openAddEntry() {
    final userPhone = widget.userPhone;
    final isPersonalContext =
        userPhone != null && widget.friendId == null && widget.groupId == null;
    if (isPersonalContext) {
      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => AddSubsHubSheet(
          userPhone: userPhone!,
          service: _userSubsService,
          onCreated: () {
            final messenger = ScaffoldMessenger.maybeOf(context);
            messenger?.showSnackBar(
              const SnackBar(content: Text('Saved to Subscriptions & Bills.')),
            );
          },
          onOpenLegacy: () => _svc.openAddEntry(
            context,
            capabilities: widget.partnerCapabilities,
            userPhone: widget.userPhone,
            friendId: widget.friendId,
            friendName: widget.friendName,
            groupId: widget.groupId,
            participantUserIds: widget.participantUserIds,
            mirrorToFriend: widget.mirrorToFriend,
          ),
          onLinkToEmi: () => _svc.openAddFromType(
            context,
            'emi',
            userPhone: widget.userPhone,
            friendId: widget.friendId,
            friendName: widget.friendName,
            groupId: widget.groupId,
            participantUserIds: widget.participantUserIds,
            mirrorToFriend: widget.mirrorToFriend,
          ),
        ),
      );
      return;
    }

    _svc.openAddEntry(
      context,
      capabilities: widget.partnerCapabilities,
      userPhone: widget.userPhone,
      friendId: widget.friendId,
      friendName: widget.friendName,
      groupId: widget.groupId,
      participantUserIds: widget.participantUserIds,
      mirrorToFriend: widget.mirrorToFriend,
    );
  }

  void _openReviewSheet({required bool isLoans}) {
    if (widget.userPhone == null) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => ReviewPendingSheet(
        userId: widget.userPhone!,
        isLoans: isLoans,
      ),
    );
  }

  void _scrollTo(GlobalKey key) {
    final ctx = key.currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(
      ctx,
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeOutCubic,
      alignment: .08,
    );
  }

  Stream<List<SharedItem>> _combineSharedStreams(
    Stream<List<SharedItem>> a,
    Stream<List<SharedItem>> b,
  ) {
    List<SharedItem> latestA = const [];
    List<SharedItem> latestB = const [];
    final controller = StreamController<List<SharedItem>>.broadcast();

    void emit() {
      final combined = <SharedItem>[...latestA, ...latestB];
      combined.sort((x, y) {
        final ax = x.nextDueAt?.millisecondsSinceEpoch ?? 0;
        final ay = y.nextDueAt?.millisecondsSinceEpoch ?? 0;
        return ax.compareTo(ay);
      });
      controller.add(combined);
    }

    final subA = a.listen(
      (data) {
        latestA = data;
        emit();
      },
      onError: controller.addError,
    );

    final subB = b.listen(
      (data) {
        latestB = data;
        emit();
      },
      onError: controller.addError,
    );

    controller.onCancel = () {
      subA.cancel();
      subB.cancel();
    };

    return controller.stream;
  }

  bool _isUserSubscription(SharedItem item) =>
      widget.userPhone != null &&
      _userSubsService.isUserSubscription(item);

  String? _timeOfDayToString(TimeOfDay? time) {
    if (time == null) return null;
    final h = time.hour.toString().padLeft(2, '0');
    final m = time.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  TimeOfDay? _timeOfDayFromString(String? value) {
    if (value == null || value.isEmpty) return null;
    final parts = value.split(':');
    if (parts.length != 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null) return null;
    return TimeOfDay(hour: h.clamp(0, 23), minute: m.clamp(0, 59));
  }

  Future<void> _handleMarkPaid(SharedItem item) async {
    if (_isUserSubscription(item) && widget.userPhone != null) {
      await _userSubsService.markPaid(
        userPhone: widget.userPhone!,
        item: item,
      );
      return;
    }
    await _svc.markPaid(context, item);
  }

  Future<void> _handleReminder(SharedItem item) async {
    if (!_isUserSubscription(item) || widget.userPhone == null) {
      _svc.openReminder(context, item);
      return;
    }

    final currentDays = item.notify?['daysBefore'] as int?;
    final currentTime = _timeOfDayFromString(item.notify?['time'] as String?);
    final result = await showModalBottomSheet<ReminderSelection>(
      context: context,
      isScrollControlled: true,
      builder: (_) => AddSubsCustomReminderSheet(
        initial: ReminderSelection(
          daysBefore: currentDays,
          timeOfDay: currentTime,
        ),
      ),
    );
    if (!mounted) return;
    if (result != null) {
      await _userSubsService.setReminder(
        userPhone: widget.userPhone!,
        item: item,
        daysBefore: result.daysBefore,
        time: _timeOfDayToString(result.timeOfDay),
      );
    }
  }

  Future<void> _handleManage(SharedItem item) async {
    if (!_isUserSubscription(item) || widget.userPhone == null) {
      _svc.openManage(context, item);
      return;
    }

    final userPhone = widget.userPhone!;
    final isPaused = (item.rule.status ?? 'active') == 'paused';
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(isPaused
                  ? Icons.play_arrow_rounded
                  : Icons.pause_rounded),
              title: Text(isPaused ? 'Resume' : 'Pause'),
              onTap: () => Navigator.pop(sheetContext, 'toggle'),
            ),
            ListTile(
              leading: const Icon(Icons.delete_forever_rounded),
              title: const Text('Delete'),
              onTap: () => Navigator.pop(sheetContext, 'delete'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;

    if (action == 'toggle') {
      if (isPaused) {
        await _userSubsService.resume(userPhone: userPhone, item: item);
      } else {
        await _userSubsService.pause(userPhone: userPhone, item: item);
      }
    } else if (action == 'delete') {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Delete entry?'),
          content: Text(
              'Remove ${item.title ?? 'this entry'} from your subscriptions?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete'),
            ),
          ],
        ),
      );
      if (!mounted) return;
      if (confirmed == true) {
        await _userSubsService.deleteSubscription(
          userPhone: userPhone,
          item: item,
        );
      }
    }
  }

  void _handleEdit(SharedItem item) {
    if (_isUserSubscription(item)) {
      final messenger = ScaffoldMessenger.maybeOf(context);
      messenger?.showSnackBar(
        const SnackBar(
          content: Text('Editing coming soon. Use delete + add to revise.'),
        ),
      );
      return;
    }
    _svc.openEdit(context, item);
  }

  Widget _loadingCard() => const GlassCard(
    child: Padding(
      padding: EdgeInsets.symmetric(vertical: 16),
      child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
    ),
  );

  Widget _emptyCard({required VoidCallback onAdd}) => GlassCard(
    showGloss: true,
    glassGradient: [
      Colors.white.withOpacity(.26),
      Colors.white.withOpacity(.10),
    ],
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('No subscriptions or bills yet',
            style: TextStyle(fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        const Text('Add recurring payments, subscriptions, EMIs or simple reminders.'),
        const SizedBox(height: 8),
        TextButton.icon(
          onPressed: onAdd,
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Add first one'),
          style: TextButton.styleFrom(
            backgroundColor: Fx.mint.withOpacity(.12),
            foregroundColor: Fx.mintDark,
            padding: const EdgeInsets.symmetric(
              horizontal: Fx.s14,
              vertical: Fx.s8,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            textStyle: Fx.label.copyWith(fontWeight: FontWeight.w800),
          ),
        ),
      ],
    ),
  );

  Widget _filteredEmptyCard({
    required bool hasQuery,
    required bool hasTypeFilter,
    required bool hasStatusFilter,
  }) {
    final hasFilters = hasQuery || hasTypeFilter || hasStatusFilter;
    return GlassCard(
      showGloss: true,
      glassGradient: [
        Colors.white.withOpacity(.26),
        Colors.white.withOpacity(.10),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            hasFilters
                ? 'No items match your filters'
                : 'All clear — nothing scheduled here yet',
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(
            hasFilters
                ? 'Tweak the filters or clear the search to reveal more items.'
                : 'Add a subscription, recurring payment, reminder or EMI to get started.',
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (hasQuery)
                TextButton.icon(
                  onPressed: _clearSearch,
                  icon: const Icon(Icons.backspace_outlined),
                  label: const Text('Clear search'),
                  style: TextButton.styleFrom(foregroundColor: AppColors.mint),
                ),
              if (hasTypeFilter || hasStatusFilter)
                TextButton.icon(
                  onPressed: _resetFilters,
                  icon: const Icon(Icons.filter_alt_off_rounded),
                  label: const Text('Reset filters'),
                  style: TextButton.styleFrom(foregroundColor: AppColors.mint),
                ),
              TextButton.icon(
                onPressed: _openAddEntry,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add new item'),
                style: TextButton.styleFrom(
                  backgroundColor: Fx.mint.withOpacity(.12),
                  foregroundColor: Fx.mintDark,
                  padding: const EdgeInsets.symmetric(
                    horizontal: Fx.s14,
                    vertical: Fx.s8,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  textStyle: Fx.label.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _errorCard(Object? err) => GlassCard(
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.error_outline, color: Colors.redAccent),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            'Could not load subscriptions.\n${err ?? ''}',
            style: const TextStyle(color: Colors.redAccent),
          ),
        ),
      ],
    ),
  );

  // Shiny debit-card style sheet for SubscriptionCard taps
  void _openDebitSheet(BuildContext context, SharedItem e, {Color? accent}) {
    final amt = (e.rule.amount ?? 0).toDouble();
    final title = e.title ?? (e.type ?? 'Item');
    final due = e.nextDueAt;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final isOverdue =
        due != null && DateTime(due.year, due.month, due.day).isBefore(today);
    final c = accent ?? AppColors.mint;

    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.62,
        minChildSize: 0.52,
        maxChildSize: 0.92,
        snap: true,
        builder: (context, controller) {
          return Container(
            color: Colors.transparent,
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(24),
                  child: GlassCard(
                    showGloss: true,
                    glassGradient: [
                      Colors.white.withOpacity(.30),
                      Colors.white.withOpacity(.08),
                    ],
                    padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
                    child: ListView(
                      controller: controller,
                      children: [
                        Center(
                          child: Container(
                            width: 44,
                            height: 5,
                            margin: const EdgeInsets.only(top: 6, bottom: 12),
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(.18),
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        ),
                        Row(
                          children: [
                            Icon(Icons.credit_card_rounded, color: c),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.black.withOpacity(.92),
                                  fontWeight: FontWeight.w900,
                                  fontSize: 18,
                                ),
                              ),
                            ),
                            if (isOverdue)
                              const _StatusChip('Overdue', AppColors.bad),
                          ],
                        ),
                        const SizedBox(height: 14),
                        // Big amount
                        TonalCard(
                          borderRadius: BorderRadius.circular(18),
                          surface: Colors.white,
                          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                          child: Row(
                            children: [
                              Icon(Icons.currency_rupee_rounded, color: c, size: 18),
                              const SizedBox(width: 4),
                              Text(
                                _fmtAmount(amt),
                                style: TextStyle(
                                  color: c,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 26,
                                  letterSpacing: .2,
                                ),
                              ),
                              const Spacer(),
                              if (due != null)
                                Text(
                                  isOverdue
                                      ? 'Was due ${_fmtDate(due)}'
                                      : 'Due ${_fmtDate(due)}',
                                  style: const TextStyle(
                                      color: Colors.black54,
                                      fontWeight: FontWeight.w600),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        // Actions
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            FilledButton.icon(
                              onPressed: () {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('Pay ${e.title ?? "item"}')),
                                );
                              },
                              style: FilledButton.styleFrom(
                                backgroundColor: c,
                                foregroundColor: Colors.white,
                              ),
                              icon: const Icon(Icons.payments_rounded),
                              label: const Text('Pay now'),
                            ),
                            OutlinedButton.icon(
                              onPressed: () => _svc.openManage(context, e),
                              icon: const Icon(Icons.tune_rounded),
                              label: const Text('Manage'),
                            ),
                            OutlinedButton.icon(
                              onPressed: () => _svc.openReminder(context, e),
                              icon: const Icon(Icons.alarm_add_rounded),
                              label: const Text('Remind me'),
                            ),
                            if (isOverdue)
                              OutlinedButton.icon(
                                onPressed: () async {
                                  _locallyPaid.add(e.id);
                                  if (mounted) setState(() {});
                                  try {
                                    await _svc.markPaid(context, e);
                                    if (context.mounted) {
                                      Navigator.of(context).maybePop();
                                    }
                                  } catch (err) {
                                    _locallyPaid.remove(e.id);
                                    if (mounted) {
                                      setState(() {});
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(content: Text('Failed to mark paid: $err')),
                                      );
                                    }
                                  }
                                },
                                icon: const Icon(Icons.check_circle_outline_rounded),
                                label: const Text('Mark paid'),
                              ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        // Notes (if any)
                        if ((e.note ?? '').trim().isNotEmpty)
                          TonalCard(
                            surface: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            padding: const EdgeInsets.all(12),
                            child: Text(
                              e.note!,
                              style: const TextStyle(color: Colors.black87),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  String _fmtDate(DateTime d) {
    const months = [
      'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'
    ];
    return '${months[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
  }

  String _fmtAmount(double v) {
    final neg = v < 0;
    final n = v.abs();
    String s;
    if (n >= 10000000) {
      s = '${(n / 10000000).toStringAsFixed(1)}Cr';
    } else if (n >= 100000) {
      s = '${(n / 100000).toStringAsFixed(1)}L';
    } else if (n >= 1000) {
      s = '${(n / 1000).toStringAsFixed(1)}k';
    } else {
      s = n % 1 == 0 ? n.toStringAsFixed(0) : n.toStringAsFixed(2);
    }
    return neg ? '-$s' : s;
  }
}

// ---------- Cards section (inline, no extra files) ----------
class _CardsDueSection extends StatefulWidget {
  final String userId;
  final CreditCardService cardService;

  const _CardsDueSection({
    required this.userId,
    required this.cardService,
    super.key,
  });

  @override
  State<_CardsDueSection> createState() => _CardsDueSectionState();
}

class _CardsDueSectionState extends State<_CardsDueSection> {
  late final CollectionReference<Map<String, dynamic>> _cardsRef;
  late final CollectionReference<Map<String, dynamic>> _expensesRef;
  final PageController _page = PageController(viewportFraction: 0.86);
  int _index = 0;

  @override
  void initState() {
    super.initState();
    final userRef =
        FirebaseFirestore.instance.collection('users').doc(widget.userId);
    _cardsRef = userRef.collection('credit_cards');
    _expensesRef = userRef.collection('expenses');
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _cardsRef.orderBy('bankName').snapshots(),
      builder: (context, cardSnap) {
        if (cardSnap.connectionState == ConnectionState.waiting) {
          return _buildLoading();
        }
        if (!cardSnap.hasData || cardSnap.data!.docs.isEmpty) {
          return _buildEmpty(context);
        }

        final cards = cardSnap.data!.docs
            .map((doc) => _CardLens.fromSnapshot(doc))
            .whereType<_CardLens>()
            .toList();

        if (cards.isEmpty) {
          return _buildEmpty(context);
        }

        cards.sort((a, b) => a.dueDate.compareTo(b.dueDate));

        return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: _expensesRef
              .orderBy('date', descending: true)
              .limit(400)
              .snapshots(),
          builder: (context, expenseSnap) {
            final merged = _attachSpend(cards, expenseSnap.data);
            return _buildCarousel(context, merged);
          },
        );
      },
    );
  }

  Widget _buildLoading() {
    return GlassCard(
      showGloss: true,
      glassGradient: [
        Colors.white.withOpacity(.22),
        Colors.white.withOpacity(.08),
      ],
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: const Center(
        child: SizedBox(
          height: 24,
          width: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }

  Widget _buildEmpty(BuildContext context) {
    return GlassCard(
      showGloss: true,
      glassGradient: [
        Colors.white.withOpacity(.24),
        Colors.white.withOpacity(.08),
      ],
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Link a credit card',
            style: TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Track statements, daily spend and due reminders in one place.',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 12.5,
              color: Colors.black.withOpacity(.6),
            ),
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content:
                      Text('Use the + button to add your first credit card'),
                ),
              );
            },
            icon: const Icon(Icons.add_card_rounded),
            label: const Text('Add card'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.mint,
              side: const BorderSide(color: AppColors.mint, width: 1.4),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCarousel(BuildContext context, List<_CardLens> cards) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 290,
          child: PageView.builder(
            controller: _page,
            itemCount: cards.length,
            onPageChanged: (value) => setState(() => _index = value),
            itemBuilder: (context, index) {
              final card = cards[index];
              return _CardShowcase(
                card: card,
                onPay: () => _openDetail(card),
                onStatement: () => _shareStatement(card),
                onViewMore: () => _openDetail(card),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        _CardPagerIndicator(
          count: cards.length,
          index: _index,
        ),
      ],
    );
  }

  void _openDetail(_CardLens card) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) {
        return _CardDetailSheet(
          card: card,
          service: widget.cardService,
          userId: widget.userId,
        );
      },
    );
  }

  void _shareStatement(_CardLens card) {
    final messenger = ScaffoldMessenger.of(context);
    final due = _formatShortDate(card.dueDate);
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          'The latest ${card.bank} statement will be mailed shortly. Due $due.',
        ),
      ),
    );
  }

  List<_CardLens> _attachSpend(
    List<_CardLens> cards,
    QuerySnapshot<Map<String, dynamic>>? expenseSnap,
  ) {
    if (expenseSnap == null) return cards;

    final acc = {for (final card in cards) card.idUpper: _CardAccumulator()};

    for (final doc in expenseSnap.docs) {
      final data = doc.data();
      final amount = (data['amount'] as num?)?.toDouble() ?? 0;
      if (amount <= 0) continue;
      final when = _coerceDate(data['date']);
      if (when == null) continue;

      final identity = _ExpenseIdentity.fromMap(data);
      if (!identity.isCredit) continue;

      for (final card in cards) {
        if (!_matchesCard(card, identity)) continue;

        final inclusiveEnd = card.cycleEnd.add(const Duration(days: 1));
        if (when.isBefore(card.cycleStart) || when.isAfter(inclusiveEnd)) {
          continue;
        }

        final bucket = acc[card.idUpper]!;
        bucket.cycleSpend += amount;
        if (bucket.recent.length < 5) {
          bucket.recent.add(
            _CardTxn(
              label: identity.merchant ?? identity.description ?? 'Card spend',
              amount: amount,
              date: when,
            ),
          );
        }
        break;
      }
    }

    return cards.map((card) {
      final bucket = acc[card.idUpper]!;
      final spend = bucket.cycleSpend > 0 ? bucket.cycleSpend : card.cycleSpend;
      final txns =
          bucket.recent.isNotEmpty ? bucket.recent : card.recentTxns;

      final available = card.availableCredit ??
          (card.creditLimit != null
              ? (card.creditLimit! - spend).clamp(0.0, card.creditLimit!)
              : null);

      return card.copyWith(
        cycleSpend: spend,
        recentTxns: txns,
        availableCredit: available,
      );
    }).toList();
  }

  bool _matchesCard(_CardLens card, _ExpenseIdentity identity) {
    final cardId = identity.cardId;
    if (cardId != null && cardId.isNotEmpty) {
      if (cardId == card.idUpper) return true;
    }

    final last4 = identity.last4;
    if (last4 != null && last4.isNotEmpty) {
      if (last4 == card.last4Upper) {
        final issuer = identity.issuer;
        if (issuer == null || issuer.isEmpty) return true;
        final cardIssuer = card.bank.toUpperCase();
        if (cardIssuer.contains(issuer) || issuer.contains(cardIssuer)) {
          return true;
        }
      }
    }

    final instrument = identity.instrument ?? '';
    if (instrument.contains('credit')) {
      if (instrument.contains(card.bank.toLowerCase())) return true;
    }
    return false;
  }
}

class _CardAccumulator {
  double cycleSpend = 0;
  final List<_CardTxn> recent = [];
}

class _CardTxn {
  final String label;
  final double amount;
  final DateTime date;

  const _CardTxn({
    required this.label,
    required this.amount,
    required this.date,
  });
}

class _ExpenseIdentity {
  final String? cardId;
  final String? last4;
  final String? issuer;
  final String? instrument;
  final String? merchant;
  final String? description;
  final bool isCredit;

  _ExpenseIdentity({
    this.cardId,
    this.last4,
    this.issuer,
    this.instrument,
    this.merchant,
    this.description,
    required this.isCredit,
  });

  factory _ExpenseIdentity.fromMap(Map<String, dynamic> data) {
    String? _string(dynamic value) =>
        value == null ? null : value.toString().trim();

    String? normalize(String? value) {
      if (value == null) return null;
      final cleaned = value.replaceAll(RegExp(r'[^0-9A-Za-z]'), '');
      return cleaned.toUpperCase();
    }

    final instrumentRaw = (_string(data['instrument']) ??
            _string(data['cardType']) ??
            _string(data['type']) ??
            '')
        .toLowerCase();
    final tags = data['tags'];
    bool credit = instrumentRaw.contains('credit');
    if (!credit && tags is Iterable) {
      for (final tag in tags) {
        if (tag.toString().toLowerCase().contains('credit')) {
          credit = true;
          break;
        }
      }
    }

    return _ExpenseIdentity(
      cardId: normalize(_string(data['cardId']) ??
          _string(data['cardDocId']) ??
          _string(data['card'])),
      last4: normalize(_string(data['cardLast4']) ??
          _string(data['last4']) ??
          _string(data['instrumentLast4']) ??
          _string(data['maskedLast4'])),
      issuer: normalize(_string(data['issuerBank']) ??
          _string(data['issuer']) ??
          _string(data['bank']) ??
          _string(data['cardIssuer'])),
      instrument: instrumentRaw,
      merchant: _string(data['merchant']) ?? _string(data['title']),
      description: _string(data['note']) ?? _string(data['description']),
      isCredit: credit,
    );
  }
}

class _CardLens {
  final String id;
  final String bank;
  final String cardType;
  final String last4;
  final String displayName;
  final DateTime dueDate;
  final DateTime cycleStart;
  final DateTime cycleEnd;
  final double totalDue;
  final double minDue;
  final double paidAmount;
  final bool autopayEnabled;
  final bool isPaid;
  final double? creditLimit;
  final double? availableCredit;
  final DateTime? statementDate;
  final double cycleSpend;
  final List<_CardTxn> recentTxns;

  const _CardLens({
    required this.id,
    required this.bank,
    required this.cardType,
    required this.last4,
    required this.displayName,
    required this.dueDate,
    required this.cycleStart,
    required this.cycleEnd,
    required this.totalDue,
    required this.minDue,
    required this.paidAmount,
    required this.autopayEnabled,
    required this.isPaid,
    this.creditLimit,
    this.availableCredit,
    this.statementDate,
    this.cycleSpend = 0,
    List<_CardTxn>? recentTxns,
  }) : recentTxns = recentTxns ?? const [];

  factory _CardLens.fromSnapshot(
      QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final model = CreditCardModel.fromJson({'id': doc.id, ...data});
    final cycleRaw = data['latestCycle'];
    final cycle =
        cycleRaw is Map ? Map<String, dynamic>.from(cycleRaw as Map) : null;
    final dueDate = _coerceDate(cycle?['dueDate']) ?? model.dueDate;
    final totalDue = (cycle?['totalDue'] as num?)?.toDouble() ?? model.totalDue;
    final minDue = (cycle?['minDue'] as num?)?.toDouble() ?? model.minDue;
    final paidAmount =
        (cycle?['paidAmount'] as num?)?.toDouble() ?? (model.isPaid ? totalDue : 0);
    final status = (cycle?['status'] ?? (model.isPaid ? 'paid' : 'open'))
        .toString();
    final isPaid = status == 'paid';
    final periodStart = _coerceDate(cycle?['periodStart']) ??
        model.statementDate?.subtract(const Duration(days: 30)) ??
        dueDate.subtract(const Duration(days: 30));
    final periodEnd = _coerceDate(cycle?['periodEnd']) ??
        _coerceDate(cycle?['statementDate']) ??
        model.statementDate ??
        dueDate;
    final alias = (data['cardAlias'] ?? model.cardAlias ?? '').toString().trim();
    final autopay = (data['autopayEnabled'] as bool?) ??
        (cycle?['autopayEnabled'] as bool?) ??
        model.autopayEnabled ??
        false;
    final creditLimit = (data['creditLimit'] as num?)?.toDouble() ??
        model.creditLimit ??
        (cycle?['creditLimitSnapshot'] as num?)?.toDouble();
    final availableCredit = (data['availableCredit'] as num?)?.toDouble() ??
        (cycle?['availableCreditSnapshot'] as num?)?.toDouble() ??
        model.availableCredit;
    final statementDate =
        _coerceDate(cycle?['statementDate']) ?? model.statementDate;

    return _CardLens(
      id: model.id,
      bank: model.bankName,
      cardType: model.cardType,
      last4: model.last4Digits,
      displayName:
          alias.isNotEmpty ? alias : '${model.bankName} ••••${model.last4Digits}',
      dueDate: dueDate,
      cycleStart: periodStart,
      cycleEnd: periodEnd.isBefore(periodStart) ? dueDate : periodEnd,
      totalDue: totalDue,
      minDue: minDue,
      paidAmount: paidAmount,
      autopayEnabled: autopay,
      isPaid: isPaid,
      creditLimit: creditLimit,
      availableCredit: availableCredit,
      statementDate: statementDate,
      cycleSpend: (data['spendThisCycle'] as num?)?.toDouble() ?? 0,
    );
  }

  _CardLens copyWith({
    double? cycleSpend,
    List<_CardTxn>? recentTxns,
    double? availableCredit,
  }) {
    return _CardLens(
      id: id,
      bank: bank,
      cardType: cardType,
      last4: last4,
      displayName: displayName,
      dueDate: dueDate,
      cycleStart: cycleStart,
      cycleEnd: cycleEnd,
      totalDue: totalDue,
      minDue: minDue,
      paidAmount: paidAmount,
      autopayEnabled: autopayEnabled,
      isPaid: isPaid,
      creditLimit: creditLimit,
      availableCredit: availableCredit ?? this.availableCredit,
      statementDate: statementDate,
      cycleSpend: cycleSpend ?? this.cycleSpend,
      recentTxns: recentTxns ?? this.recentTxns,
    );
  }

  String get idUpper => id.toUpperCase();

  String get last4Upper =>
      last4.replaceAll(RegExp(r'[^0-9A-Za-z]'), '').toUpperCase();

  int get daysToDue => dueDate.difference(DateTime.now()).inDays;

  bool get isOverdue => !isPaid && DateTime.now().isAfter(dueDate);

  bool get dueSoon => !isPaid && !isOverdue && daysToDue <= 3;

  double get remainingDue => (totalDue - paidAmount).clamp(0.0, totalDue);

  double get paymentProgress =>
      totalDue <= 0 ? 1.0 : (paidAmount / totalDue).clamp(0.0, 1.0);

  double get timelineProgress {
    final total = cycleEnd.difference(cycleStart).inMilliseconds;
    if (total <= 0) return 1.0;
    final elapsed = DateTime.now().difference(cycleStart).inMilliseconds;
    return (elapsed / total).clamp(0.0, 1.0);
  }

  String get rangeLabel =>
      '${_formatShortDate(cycleStart)} – ${_formatShortDate(cycleEnd)}';
}

DateTime? _coerceDate(dynamic value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  final type = value.runtimeType.toString();
  if (type == 'Timestamp') {
    final dynamic ts = value;
    return ts.toDate() as DateTime;
  }
  if (value is num) {
    if (value > 1000000000000) {
      return DateTime.fromMillisecondsSinceEpoch(value.toInt());
    }
    return DateTime.fromMillisecondsSinceEpoch((value * 1000).toInt());
  }
  if (value is String) {
    return DateTime.tryParse(value);
  }
  return null;
}

String _formatInr(num value) {
  final double v = value.toDouble();
  final double n = v.abs();
  String result;
  if (n >= 10000000) {
    result = '${(n / 10000000).toStringAsFixed(1)}Cr';
  } else if (n >= 100000) {
    result = '${(n / 100000).toStringAsFixed(1)}L';
  } else if (n >= 1000) {
    result = '${(n / 1000).toStringAsFixed(1)}k';
  } else {
    result = n % 1 == 0 ? n.toStringAsFixed(0) : n.toStringAsFixed(2);
  }
  return v < 0 ? '-$result' : result;
}

String _formatShortDate(DateTime d) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];
  return '${months[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
}

String _plural(int count, String word) {
  final abs = count.abs();
  final suffix = abs == 1 ? word : '${word}s';
  return '$abs $suffix';
}

List<Color> _cardPalette(_CardLens card) {
  if (card.isOverdue) {
    return const [Color(0xFFF5515F), Color(0xFFFFA985)];
  }
  if (card.isPaid || card.remainingDue <= 0.5) {
    return const [Color(0xFF43E97B), Color(0xFF38F9D7)];
  }
  if (card.dueSoon) {
    return const [Color(0xFFFF9966), Color(0xFFFF5E62)];
  }
  return const [Color(0xFF36D1DC), Color(0xFF5B86E5)];
}

String _dueHeadline(_CardLens card) {
  if (card.isPaid || card.remainingDue <= 0.5) {
    return 'Next due ${_formatShortDate(card.dueDate)}';
  }
  if (card.isOverdue) {
    final days = DateTime.now().difference(card.dueDate).inDays;
    return 'Overdue by ${_plural(days == 0 ? 1 : days, 'day')}';
  }
  final days = card.daysToDue;
  if (days <= 0) {
    return 'Due today';
  }
  if (days == 1) {
    return 'Due tomorrow';
  }
  return 'Due in ${_plural(days, 'day')}';
}

String _paymentStatus(_CardLens card) {
  if (card.isPaid || card.remainingDue <= 0.5) {
    return 'Bill cleared';
  }
  if (card.paidAmount > 0) {
    return '₹${_formatInr(card.paidAmount)} paid • ₹${_formatInr(card.remainingDue)} left';
  }
  return 'No payment logged yet';
}

class _CardPagerIndicator extends StatelessWidget {
  final int count;
  final int index;

  const _CardPagerIndicator({
    required this.count,
    required this.index,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    if (count <= 1) return const SizedBox.shrink();
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(count, (i) {
        final active = i == index;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 240),
          margin: const EdgeInsets.symmetric(horizontal: 4),
          height: 8,
          width: active ? 20 : 8,
          decoration: BoxDecoration(
            color: active
                ? AppColors.mint
                : Colors.black.withOpacity(.18),
            borderRadius: BorderRadius.circular(999),
          ),
        );
      }),
    );
  }
}

class _CardShowcase extends StatelessWidget {
  final _CardLens card;
  final VoidCallback onPay;
  final VoidCallback onStatement;
  final VoidCallback onViewMore;

  const _CardShowcase({
    required this.card,
    required this.onPay,
    required this.onStatement,
    required this.onViewMore,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final palette = _cardPalette(card);
    final accent = palette.last;
    final hasRecent = card.recentTxns.isNotEmpty;

    return InkWell(
      onTap: onViewMore,
      borderRadius: BorderRadius.circular(28),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        padding: const EdgeInsets.fromLTRB(22, 22, 22, 20),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          gradient: LinearGradient(
            colors: palette,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          boxShadow: [
            BoxShadow(
              color: palette.last.withOpacity(.28),
              blurRadius: 24,
              offset: const Offset(0, 16),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  height: 48,
                  width: 48,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(.18),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(
                    Icons.credit_card_rounded,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        card.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                          fontSize: 16,
                          letterSpacing: .2,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        [card.bank.toUpperCase(), card.cardType.toUpperCase()]
                            .where((element) => element.isNotEmpty)
                            .join(' • '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white.withOpacity(.72),
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _MiniBadge(
                  icon: card.autopayEnabled
                      ? Icons.bolt_rounded
                      : Icons.alarm_rounded,
                  label: card.autopayEnabled ? 'Autopay' : 'Reminders',
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              '₹${_formatInr(card.remainingDue > 0.5 ? card.remainingDue : card.totalDue)}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 30,
                fontWeight: FontWeight.w900,
                letterSpacing: .3,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _dueHeadline(card),
              style: TextStyle(
                color: Colors.white.withOpacity(.86),
                fontWeight: FontWeight.w700,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              _paymentStatus(card),
              style: TextStyle(
                color: Colors.white.withOpacity(.65),
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 8,
              children: [
                _MiniStatChip(
                  label: 'Min due',
                  value: '₹${_formatInr(card.minDue)}',
                ),
                _MiniStatChip(
                  label: 'Cycle spend',
                  value: card.cycleSpend > 0
                      ? '₹${_formatInr(card.cycleSpend)}'
                      : '₹0',
                ),
                if (card.availableCredit != null)
                  _MiniStatChip(
                    label: 'Avail credit',
                    value:
                        '₹${_formatInr(card.availableCredit!.clamp(0, double.infinity))}',
                  ),
              ],
            ),
            const SizedBox(height: 14),
            _CardTimelineProgress(card: card),
            if (hasRecent) ...[
              const SizedBox(height: 12),
              _RecentTxnPill(txn: card.recentTxns.first),
            ],
            const Spacer(),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: onPay,
                    icon: const Icon(Icons.account_balance_wallet_rounded),
                    label: Text(card.isPaid ? 'View bill' : 'Pay now'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: accent,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onStatement,
                    icon: const Icon(Icons.description_outlined),
                    label: const Text('Statement'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: BorderSide(color: Colors.white.withOpacity(.36)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniBadge extends StatelessWidget {
  final IconData icon;
  final String label;

  const _MiniBadge({
    required this.icon,
    required this.label,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(.18),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniStatChip extends StatelessWidget {
  final String label;
  final String value;

  const _MiniStatChip({
    required this.label,
    required this.value,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(.18),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label.toUpperCase(),
            style: TextStyle(
              color: Colors.white.withOpacity(.72),
              fontWeight: FontWeight.w700,
              fontSize: 10,
              letterSpacing: .5,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

class _CardTimelineProgress extends StatelessWidget {
  final _CardLens card;

  const _CardTimelineProgress({required this.card, super.key});

  @override
  Widget build(BuildContext context) {
    final progress = card.timelineProgress.clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              card.rangeLabel,
              style: TextStyle(
                color: Colors.white.withOpacity(.72),
                fontWeight: FontWeight.w600,
                fontSize: 11,
              ),
            ),
            const Spacer(),
            Text(
              '${(progress * 100).round()}%',
              style: TextStyle(
                color: Colors.white.withOpacity(.65),
                fontWeight: FontWeight.w600,
                fontSize: 11,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 6,
            backgroundColor: Colors.white.withOpacity(.18),
            valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
          ),
        ),
      ],
    );
  }
}

class _RecentTxnPill extends StatelessWidget {
  final _CardTxn txn;

  const _RecentTxnPill({required this.txn, super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(.18),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const Icon(Icons.local_activity_outlined, color: Colors.white, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '${txn.label} · ₹${_formatInr(txn.amount)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            _formatShortDate(txn.date),
            style: TextStyle(
              color: Colors.white.withOpacity(.78),
              fontWeight: FontWeight.w600,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _CardDetailSheet extends StatelessWidget {
  final _CardLens card;
  final CreditCardService service;
  final String userId;

  const _CardDetailSheet({
    required this.card,
    required this.service,
    required this.userId,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final textColor = theme.colorScheme.onSurface;
    final accent = _cardPalette(card).last;
    final bottom = MediaQuery.of(context).padding.bottom;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 12,
          bottom: bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                height: 4,
                width: 44,
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(.12),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              card.displayName,
              style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w900,
                  ) ??
                  const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              _detailSubtitle(card),
              style: theme.textTheme.bodyMedium?.copyWith(
                    color: textColor.withOpacity(.7),
                  ) ??
                  TextStyle(color: textColor.withOpacity(.7)),
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 16,
              runSpacing: 12,
              children: [
                _DetailStat(
                  label: 'Total due',
                  value: '₹${_formatInr(card.totalDue)}',
                ),
                _DetailStat(
                  label: 'Min due',
                  value: '₹${_formatInr(card.minDue)}',
                ),
                _DetailStat(
                  label: 'Cycle',
                  value: card.rangeLabel,
                ),
                _DetailStat(
                  label: 'Status',
                  value: card.isPaid
                      ? 'Paid'
                      : (card.isOverdue ? 'Overdue' : 'Open'),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Text(
              'Recent spend',
              style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ) ??
                  const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 8),
            if (card.recentTxns.isEmpty)
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  'We will surface new credit card transactions here as they sync.',
                  style: theme.textTheme.bodySmall?.copyWith(
                        color: textColor.withOpacity(.7),
                      ) ??
                      TextStyle(color: textColor.withOpacity(.7)),
                ),
              )
            else
              ...card.recentTxns.take(5).map(
                (txn) => ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 0),
                  leading: CircleAvatar(
                    backgroundColor: accent.withOpacity(.12),
                    foregroundColor: accent,
                    child: const Icon(Icons.local_activity_outlined, size: 18),
                  ),
                  title: Text(
                    txn.label,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Text(
                    _formatShortDate(txn.date),
                    style: TextStyle(color: textColor.withOpacity(.6)),
                  ),
                  trailing: Text(
                    '₹${_formatInr(txn.amount)}',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: () => _handleMarkPaid(context),
              icon: const Icon(Icons.verified_rounded),
              label: Text(
                card.isPaid ? 'Bill already cleared' : 'Mark bill as paid',
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: accent,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => _shareStatement(context),
              icon: const Icon(Icons.download_rounded),
              label: const Text('Send latest statement'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                foregroundColor: accent,
                side: BorderSide(color: accent.withOpacity(.45)),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Smart reminders go out on statement day and 7/3/1 days before the due date automatically.',
              style: theme.textTheme.bodySmall?.copyWith(
                    color: textColor.withOpacity(.6),
                  ) ??
                  TextStyle(color: textColor.withOpacity(.6)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleMarkPaid(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    if (card.isPaid || card.remainingDue <= 0.5) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Latest bill is already settled.')),
      );
      return;
    }
    final navigator = Navigator.of(context);
    try {
      await service.markCardBillPaid(userId, card.id, DateTime.now());
      navigator.pop();
      messenger.showSnackBar(
        SnackBar(content: Text('${card.displayName} marked as paid.')),
      );
    } catch (err) {
      messenger.showSnackBar(
        SnackBar(content: Text('Could not mark paid: $err')),
      );
    }
  }

  void _shareStatement(BuildContext context) {
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Statement request queued for ${card.displayName}.',
        ),
      ),
    );
  }
}

class _DetailStat extends StatelessWidget {
  final String label;
  final String value;

  const _DetailStat({
    required this.label,
    required this.value,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final textColor = Theme.of(context).colorScheme.onSurface;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label.toUpperCase(),
            style: TextStyle(
              color: textColor.withOpacity(.6),
              fontWeight: FontWeight.w700,
              fontSize: 11,
              letterSpacing: .5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

String _detailSubtitle(_CardLens card) {
  if (card.isPaid || card.remainingDue <= 0.5) {
    return 'Next cycle closes ${_formatShortDate(card.cycleEnd)}';
  }
  if (card.isOverdue) {
    return 'Overdue since ${_formatShortDate(card.dueDate)} · ₹${_formatInr(card.remainingDue)} pending';
  }
  return 'Due ${_formatShortDate(card.dueDate)} · ₹${_formatInr(card.remainingDue)} remaining';
}

// ---------- tiny local widgets (no external deps) ----------

class _StatusChip extends StatelessWidget {
  final String text;
  final Color base;

  const _StatusChip(this.text, this.base, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: base.withOpacity(.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: base.withOpacity(.24)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: base,
          fontWeight: FontWeight.w800,
          fontSize: 11.5,
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String text;

  const _Pill(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      radius: 999,
      showGloss: true,
      glassGradient: [
        Colors.white.withOpacity(.30),
        Colors.white.withOpacity(.10),
      ],
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Text(
        text,
        style: TextStyle(
          color: Colors.black.withOpacity(.82),
          fontWeight: FontWeight.w800,
          letterSpacing: .2,
        ),
      ),
    );
  }
}

class _OverviewSectionHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  final Color color;
  final String? amountLabel;
  final String? actionLabel;
  final VoidCallback? onActionTap;

  const _OverviewSectionHeader({
    required this.icon,
    required this.title,
    required this.color,
    this.amountLabel,
    this.actionLabel,
    this.onActionTap,
  });

  @override
  Widget build(BuildContext context) {
    final textStyle = TextStyle(
      fontSize: 16,
      fontWeight: FontWeight.w900,
      color: color,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              title,
              style: textStyle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (amountLabel != null) ...[
            _Pill(amountLabel!),
            const SizedBox(width: 8),
          ],
          if (onActionTap != null)
            TextButton(
              onPressed: onActionTap,
              style: TextButton.styleFrom(foregroundColor: color),
              child: Text(actionLabel ?? 'View all'),
            ),
        ],
      ),
    );
  }
}

class _SubscriptionsHeader extends StatelessWidget {
  final String amountLabel;
  final VoidCallback? onAdd;

  const _SubscriptionsHeader({
    required this.amountLabel,
    this.onAdd,
  });

  @override
  Widget build(BuildContext context) {
    final textColor = Colors.black.withOpacity(.88);
    return Row(
      children: [
        const Icon(Icons.subscriptions_rounded, color: AppColors.mint),
        const SizedBox(width: 8),
        const Text(
          'Subscriptions',
          style: TextStyle(
            color: AppColors.mint,
            fontWeight: FontWeight.w900,
            fontSize: 16,
          ),
        ),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: Colors.black.withOpacity(.08)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(.04),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Text(
            amountLabel,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: textColor,
              letterSpacing: .2,
            ),
          ),
        ),
        if (onAdd != null) ...[
          const SizedBox(width: 12),
          TextButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add'),
            style: TextButton.styleFrom(
              backgroundColor: Fx.mint.withOpacity(.12),
              foregroundColor: Fx.mintDark,
              padding: const EdgeInsets.symmetric(
                horizontal: Fx.s14,
                vertical: Fx.s8,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              textStyle: Fx.label.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ],
    );
  }
}

class _BillsProgressBar extends StatelessWidget {
  final double value;
  final Color color;

  const _BillsProgressBar({
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final safeValue = (value.isNaN ? 0.0 : value).clamp(0.0, 1.0);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: LinearProgressIndicator(
                minHeight: 8,
                value: safeValue,
                backgroundColor: color.withOpacity(.12),
                valueColor: AlwaysStoppedAnimation<Color>(color),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            '${(safeValue * 100).round()}% Paid',
            style: const TextStyle(
              fontWeight: FontWeight.w700,
            ),
            textAlign: TextAlign.right,
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onJump;
  final Color color;

  const _SectionTitle({
    required this.icon,
    required this.label,
    required this.color,
    this.onJump,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 2, 4, 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                letterSpacing: .2,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          ),
          if (onJump != null)
            TextButton(
              onPressed: onJump,
              style: TextButton.styleFrom(foregroundColor: color),
              child: const Text('Jump'),
            ),
        ],
      ),
    );
  }
}

class _MintAddButton extends StatelessWidget {
  final VoidCallback onTap;
  final bool compact;
  final bool showShadow;
  final String label;
  final IconData icon;

  const _MintAddButton({
    required this.onTap,
    this.compact = false,
    this.showShadow = false,
    this.label = 'Add',
    this.icon = Icons.add,
  });

  @override
  Widget build(BuildContext context) {
    final radius = compact ? 16.0 : 20.0;
    final padding = compact
        ? const EdgeInsets.symmetric(horizontal: 12, vertical: 8)
        : const EdgeInsets.symmetric(horizontal: 20, vertical: 14);

    Widget button = TextButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: compact ? 18 : 20),
      label: Text(label),
      style: TextButton.styleFrom(
        padding: padding,
        backgroundColor: Fx.mint.withOpacity(.12),
        foregroundColor: Fx.mintDark,
        textStyle: Fx.label.copyWith(fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
        ),
      ),
    );

    if (showShadow) {
      button = DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          boxShadow: [
            BoxShadow(
              color: Fx.mint.withOpacity(.18),
              blurRadius: 24,
              offset: const Offset(0, 14),
            ),
          ],
        ),
        child: button,
      );
    }

    return button;
  }
}

/// Compact inline row with two review chips.
class _InlineReviewRow extends StatelessWidget {
  final String userId;
  final VoidCallback onOpenSubs;
  final VoidCallback onOpenLoans;
  const _InlineReviewRow({
    required this.userId,
    required this.onOpenSubs,
    required this.onOpenLoans,
  });

  @override
  Widget build(BuildContext context) {
    final svc = SubscriptionsService();

    return StreamBuilder<int>(
      stream: svc.pendingCount(userId: userId, isLoans: false),
      builder: (_, subsSnap) {
        final subsCount = subsSnap.data ?? 0;
        return StreamBuilder<int>(
          stream: svc.pendingCount(userId: userId, isLoans: true),
          builder: (_, loansSnap) {
            final loansCount = loansSnap.data ?? 0;
            if (subsCount == 0 && loansCount == 0) {
              return const SizedBox.shrink();
            }

            return GlassCard(
              glassGradient: [
                AppColors.mintSoft.withOpacity(.95),
                Colors.white.withOpacity(.80),
              ],
              borderOpacityOverride: .14,
              showShadow: false,
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        height: 38,
                        width: 38,
                        decoration: BoxDecoration(
                          color: AppColors.mint.withOpacity(.14),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(
                          Icons.rate_review_rounded,
                          color: AppColors.mint,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: const [
                            Text(
                              'Review pending',
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 15,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              'Confirm items we auto-detected for you',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.black54,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      if (subsCount > 0)
                        _ReviewCalloutChip(
                          label: 'Subscriptions',
                          count: subsCount,
                          color: AppColors.mint,
                          onTap: onOpenSubs,
                        ),
                      if (loansCount > 0)
                        _ReviewCalloutChip(
                          label: 'Loans & EMIs',
                          count: loansCount,
                          color: AppColors.teal,
                          onTap: onOpenLoans,
                        ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

class _ReviewCalloutChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  final VoidCallback onTap;

  const _ReviewCalloutChip({
    required this.label,
    required this.count,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: color.withOpacity(.12),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: color.withOpacity(.28)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '$count',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'Tap to review',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.black54,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 10),
            Icon(Icons.chevron_right_rounded, color: color),
          ],
        ),
      ),
    );
  }
}

/// AppBar-friendly compact cluster (shows only if any pending exists)
class _ReviewBadgeAction extends StatelessWidget {
  final String userId;
  final VoidCallback onOpenSubs;
  final VoidCallback onOpenLoans;

  const _ReviewBadgeAction({
    super.key,
    required this.userId,
    required this.onOpenSubs,
    required this.onOpenLoans,
  });

  @override
  Widget build(BuildContext context) {
    final svc = SubscriptionsService();
    final subsStream = svc.pendingCount(userId: userId, isLoans: false);
    final loansStream = svc.pendingCount(userId: userId, isLoans: true);

    return StreamBuilder<int>(
      stream: subsStream,
      builder: (context, subsSnap) {
        final subsCount = subsSnap.data ?? 0;
        return StreamBuilder<int>(
          stream: loansStream,
          builder: (context, loansSnap) {
            final loansCount = loansSnap.data ?? 0;
            final total = subsCount + loansCount;

            return IconButton(
              tooltip: total > 0
                  ? 'Review $total pending item${total == 1 ? '' : 's'}'
                  : 'No pending reviews',
              onPressed: () => _handleTap(context, subsCount, loansCount),
              icon: Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.center,
                children: [
                  const Icon(Icons.fact_check_outlined, color: AppColors.mint),
                  if (total > 0)
                    Positioned(
                      right: -6,
                      top: -6,
                      child: _MiniBadge(count: total),
                    ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _handleTap(BuildContext context, int subsCount, int loansCount) {
    if (subsCount <= 0 && loansCount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('All caught up! Nothing to review.')),
      );
      return;
    }
    if (subsCount > 0 && loansCount == 0) {
      onOpenSubs();
      return;
    }
    if (loansCount > 0 && subsCount == 0) {
      onOpenLoans();
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: const [
                  Icon(Icons.fact_check_outlined, color: AppColors.mint),
                  SizedBox(width: 8),
                  Text(
                    'Review pending',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _ReviewChip(
                    userId: userId,
                    isLoans: false,
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      onOpenSubs();
                    },
                  ),
                  _ReviewChip(
                    userId: userId,
                    isLoans: true,
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      onOpenLoans();
                    },
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Text(
                'Tap a chip to jump into the pending queue.',
                style: TextStyle(fontSize: 12.5, color: Colors.black54),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _MiniBadge extends StatelessWidget {
  final int count;

  const _MiniBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    final display = count > 99 ? '99+' : '$count';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.mint,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white, width: 1),
      ),
      child: Text(
        display,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

/// Single chip with live count; hides itself when count == 0.
class _ReviewChip extends StatelessWidget {
  final String userId;
  final bool isLoans;
  final VoidCallback onTap;
  final bool compact;

  const _ReviewChip({
    super.key,
    required this.userId,
    required this.isLoans,
    required this.onTap,
    this.compact = false,
  });

  factory _ReviewChip.small({
    required String userId,
    required bool isLoans,
    required VoidCallback onTap,
  }) =>
      _ReviewChip(userId: userId, isLoans: isLoans, onTap: onTap, compact: true);

  @override
  Widget build(BuildContext context) {
    final svc = SubscriptionsService();
    final stream = svc.pendingCount(userId: userId, isLoans: isLoans);
    final label = isLoans ? 'Loans' : 'Subs';

    return StreamBuilder<int>(
      stream: stream,
      builder: (_, snap) {
        final n = snap.data ?? 0;
        if (n == 0) return const SizedBox.shrink();

        final bg = (isLoans ? AppColors.teal : AppColors.mint).withOpacity(0.12);
        final border = (isLoans ? AppColors.teal : AppColors.mint).withOpacity(0.25);
        final textColor = (isLoans ? AppColors.teal : AppColors.mint);

        return InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: EdgeInsets.symmetric(
              horizontal: compact ? 8 : 12,
              vertical: compact ? 4 : 6,
            ),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: border),
            ),
            child: Text(
              'Review ($n) $label',
              style: TextStyle(
                color: textColor,
                fontWeight: FontWeight.w700,
                fontSize: compact ? 11.5 : 13,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Simple slide-in + fade wrapper. Direction = where it comes *from*.
class _SlideIn extends StatefulWidget {
  final Widget child;
  final AxisDirection direction;
  final int delay; // ms
  final Duration duration;

  const _SlideIn({
    super.key,
    required this.child,
    required this.direction,
    this.delay = 0,
    this.duration = const Duration(milliseconds: 450),
  });

  @override
  State<_SlideIn> createState() => _SlideInState();
}

class _SlideInState extends State<_SlideIn> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: widget.duration,
  );
  late final Animation<double> _a =
  CurvedAnimation(parent: _c, curve: Curves.easeOutCubic);

  @override
  void initState() {
    super.initState();
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final beginOffset = () {
      switch (widget.direction) {
        case AxisDirection.left:
          return const Offset(0.08, 0); // from right to left
        case AxisDirection.right:
          return const Offset(-0.08, 0); // from left to right
        case AxisDirection.up:
          return const Offset(0, 0.08); // from bottom
        case AxisDirection.down:
          return const Offset(0, -0.08); // from top
      }
    }();

    return FadeTransition(
      opacity: _a,
      child: SlideTransition(
        position: Tween<Offset>(begin: beginOffset, end: Offset.zero).animate(_a),
        child: widget.child,
      ),
    );
  }
}
