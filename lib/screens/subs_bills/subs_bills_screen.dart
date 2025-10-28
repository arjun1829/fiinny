// lib/screens/subs_bills/subs_bills_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show TextPosition, TextSelection;

import 'package:lifemap/details/models/shared_item.dart';
import '../../services/subscriptions/subscriptions_service.dart';

// visual tokens/components
import 'package:lifemap/ui/tokens.dart';
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

  const SubsBillsScreen({
    Key? key,
    this.userPhone,
    this.source,
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
  late final SubsBillsViewModel _vm;
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

  @override
  void initState() {
    super.initState();
    _svc = SubscriptionsService();
    _vm = SubsBillsViewModel(_svc);

    _resolvedStream = widget.source ??
        (widget.userPhone != null
            ? _svc.watchUnified(widget.userPhone!)
            : _svc.safeEmptyStream);

    // debounce typing — avoid rebuild per keystroke
    _search.addListener(() {
      _debounce(() {
        if (!mounted) return;
        setState(() {});
      });
    });
  }

  @override
  void dispose() {
    _search.dispose();
    _searchFocus.dispose();
    _scroll.dispose();
    _debounce.dispose();
    super.dispose();
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
        title: const Padding(
          padding: EdgeInsets.only(left: 8),
          child: Row(
            children: [
              Icon(Icons.receipt_long_rounded, color: AppColors.mint),
              SizedBox(width: 8),
              Text('Financial Overview',
                  style: TextStyle(fontWeight: FontWeight.w900)),
            ],
          ),
        ),
        actions: [
          if (widget.userPhone != null)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _ReviewChipsCompact(
                userId: widget.userPhone!,
                onOpenSubs: () => _openReviewSheet(isLoans: false),
                onOpenLoans: () => _openReviewSheet(isLoans: true),
              ),
            ),
          const Padding(
            padding: EdgeInsets.only(right: 12),
            child: Icon(Icons.notifications_none_rounded, color: AppColors.mint),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          if (widget.userPhone != null) {
            _svc.openQuickAddForSubs(context, userId: widget.userPhone!);
          } else {
            _svc.openAddEntry(context);
          }
        },
        icon: const Icon(Icons.add),
        label: const Text('Add'),
        backgroundColor: AppColors.mint,
        foregroundColor: Colors.white,
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
                final baseBottom = viewPadding.bottom + 80.0;
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
                          onAddTap: () => _svc.openAddEntry(context),
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
                          child: _CardsDueSection(userId: widget.userPhone!),
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
                            onEdit: (item) => _svc.openEdit(context, item),
                            onManage: (item) => _svc.openManage(context, item),
                            onReminder: (item) => _svc.openReminder(context, item),
                            onMarkPaid: (item) async {
                              _locallyPaid.add(item.id);
                              if (mounted) setState(() {});
                              try {
                                await _svc.markPaid(context, item);
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
                            onManage: (e) => _svc.openManage(context, e),
                            onReminder: (e) => _svc.openReminder(context, e),
                            onMarkPaid: (e) async {
                              _locallyPaid.add(e.id);
                              if (mounted) setState(() {});
                              try {
                                await _svc.markPaid(context, e);
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
                        _emptyCard(onAdd: () => _svc.openAddEntry(context))
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
        _svc.openAddFromType(context, key);
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
        _svc.openAddEntry(context);
    }
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
          icon: const Icon(Icons.add),
          label: const Text('Add first one'),
          style: TextButton.styleFrom(foregroundColor: AppColors.mint),
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
                onPressed: () => _svc.openAddEntry(context),
                icon: const Icon(Icons.add),
                label: const Text('Add new item'),
                style: TextButton.styleFrom(foregroundColor: AppColors.mint),
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
class _CardsDueSection extends StatelessWidget {
  final String userId;
  const _CardsDueSection({required this.userId});

  @override
  Widget build(BuildContext context) {
    final cardsCol = FirebaseFirestore.instance
        .collection('users').doc(userId).collection('cards');

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: cardsCol.snapshots(),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const GlassCard(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 14),
              child: Center(child: SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))),
            ),
          );
        }
        if (!snap.hasData || snap.data!.docs.isEmpty) {
          return GlassCard(
            showGloss: true,
            glassGradient: [
              Colors.white.withOpacity(.26),
              Colors.white.withOpacity(.10),
            ],
            child: const Text(
              'No card bills found',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          );
        }

        // Build a simple list of due cards, sorted by due date (soonest first)
        final now = DateTime.now();
        final items = snap.data!.docs.map((d) {
          final data = d.data();
          final issuer = (data['issuer'] ?? data['issuerBank'] ?? 'CARD').toString();
          final last4 = (data['last4'] ?? '').toString();
          final status = (data['status'] ?? '').toString().toLowerCase();
          final lastBill = (data['lastBill'] is Map) ? Map<String, dynamic>.from(data['lastBill']) : null;
          final dueDate = _asDate(lastBill?['dueDate']);
          final totalDue = (lastBill?['totalDue'] is num) ? (lastBill!['totalDue'] as num).toDouble() : null;
          final minDue = (lastBill?['minDue'] is num) ? (lastBill!['minDue'] as num).toDouble() : null;
          final spendThisCycle = (data['spendThisCycle'] is num) ? (data['spendThisCycle'] as num).toDouble() : null;

          final label = last4.isNotEmpty ? '${issuer.toUpperCase()} ••••$last4' : issuer.toUpperCase();
          final overdue = dueDate != null && DateTime(dueDate.year, dueDate.month, dueDate.day).isBefore(DateTime(now.year, now.month, now.day));

          return _CardLite(
            id: d.id,
            label: label,
            dueDate: dueDate,
            totalDue: totalDue,
            minDue: minDue,
            spendThisCycle: spendThisCycle,
            isDue: status == 'due' || (dueDate != null && !now.isBefore(dueDate)),
            isOverdue: overdue,
          );
        }).toList()
          ..sort((a, b) {
            final ad = a.dueDate ?? DateTime(9999);
            final bd = b.dueDate ?? DateTime(9999);
            return ad.compareTo(bd);
          });

        // Limit to top 3 for compactness
        final top = items.take(3).toList();

        return GlassCard(
          showGloss: true,
          glassGradient: [
            Colors.white.withOpacity(.26),
            Colors.white.withOpacity(.10),
          ],
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          child: Column(
            children: [
              for (int i = 0; i < top.length; i++) ...[
                if (i > 0)
                  Divider(
                    height: 1,
                    thickness: 1,
                    color: Colors.white.withOpacity(0.18),
                  ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: _CardRow(top[i]),
                ),
              ],
              if (items.length > 3) ...[
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: () {
                      // For now, just show all in a simple dialog; later you can deep-link to a dedicated Cards screen.
                      showModalBottomSheet(
                        context: context,
                        isScrollControlled: true,
                        shape: const RoundedRectangleBorder(
                          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
                        ),
                        builder: (_) => SafeArea(
                          child: ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                            itemCount: items.length,
                            separatorBuilder: (_, __) => Divider(
                              height: 1,
                              thickness: 1,
                              color: Colors.black.withOpacity(0.08),
                            ),
                            itemBuilder: (_, i) => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: _CardRow(items[i]),
                            ),
                          ),
                        ),
                      );
                    },
                    icon: const Icon(Icons.list_alt_rounded, size: 18, color: AppColors.mint),
                    label: const Text('View all', style: TextStyle(color: AppColors.mint, fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  static DateTime? _asDate(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
    if (v is String) return DateTime.tryParse(v);
    return null;
  }
}

class _CardLite {
  final String id;
  final String label;
  final DateTime? dueDate;
  final double? totalDue;
  final double? minDue;
  final double? spendThisCycle;
  final bool isDue;
  final bool isOverdue;

  _CardLite({
    required this.id,
    required this.label,
    required this.dueDate,
    required this.totalDue,
    required this.minDue,
    required this.spendThisCycle,
    required this.isDue,
    required this.isOverdue,
  });
}

class _CardRow extends StatelessWidget {
  final _CardLite c;
  const _CardRow(this.c);

  @override
  Widget build(BuildContext context) {
    final dueStr = c.dueDate != null ? _fmtDate(c.dueDate!) : '—';
    final totalStr = c.totalDue != null ? _fmtInr(c.totalDue!) : '—';
    final minStr = c.minDue != null ? _fmtInr(c.minDue!) : '—';
    final cycStr = c.spendThisCycle != null ? _fmtInr(c.spendThisCycle!) : '—';

    final color = c.isOverdue
        ? AppColors.bad
        : (c.isDue ? AppColors.warn : AppColors.mint);

    final secondary =
        'Due: $dueStr  ·  Total: $totalStr  ·  Min: $minStr  ·  Cycle spend: $cycStr';

    return SizedBox(
      height: 60,
      child: Row(
        children: [
          Container(
            height: 44,
            width: 44,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(Icons.credit_card, size: 20, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  c.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  secondary,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.black.withOpacity(0.65),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          TextButton(
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Open ${c.label} details')),
              );
            },
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              foregroundColor: color,
              textStyle: const TextStyle(fontWeight: FontWeight.w700),
            ),
            child: const Text('Open'),
          ),
        ],
      ),
    );
  }

  static String _fmtInr(double v) {
    final n = v.abs();
    if (n >= 10000000) return '${(n / 10000000).toStringAsFixed(1)}Cr';
    if (n >= 100000) return '${(n / 100000).toStringAsFixed(1)}L';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return v % 1 == 0 ? v.toStringAsFixed(0) : v.toStringAsFixed(2);
  }

  static String _fmtDate(DateTime d) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${months[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
  }
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
          TextButton(
            onPressed: onAdd,
            style: TextButton.styleFrom(
              foregroundColor: AppColors.mint,
              textStyle: const TextStyle(fontWeight: FontWeight.w800),
            ),
            child: const Text('+ Add New'),
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
    return Row(
      children: [
        _ReviewChip(userId: userId, isLoans: false, onTap: onOpenSubs),
        const SizedBox(width: 8),
        _ReviewChip(userId: userId, isLoans: true, onTap: onOpenLoans),
      ],
    );
  }
}

/// AppBar-friendly compact cluster (shows only if any pending exists)
class _ReviewChipsCompact extends StatelessWidget {
  final String userId;
  final VoidCallback onOpenSubs;
  final VoidCallback onOpenLoans;
  const _ReviewChipsCompact({
    super.key,
    required this.userId,
    required this.onOpenSubs,
    required this.onOpenLoans,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _ReviewChip.small(userId: userId, isLoans: false, onTap: onOpenSubs),
        const SizedBox(width: 6),
        _ReviewChip.small(userId: userId, isLoans: true, onTap: onOpenLoans),
      ],
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
