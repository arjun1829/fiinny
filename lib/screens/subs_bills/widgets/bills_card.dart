// lib/screens/subs_bills/widgets/bills_card.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/ui/tokens.dart';
import 'package:lifemap/ui/atoms/progress_tiny.dart';
import 'package:lifemap/screens/subs_bills/widgets/brand_avatar_registry.dart';
import 'package:lifemap/ui/atoms/brand_avatar.dart';
import 'package:lifemap/ui/glass/glass_card.dart';

class BillsCard extends StatelessWidget {
  final List<SharedItem> top; // raw list; we’ll bucket & sort
  final double totalThisMonth;
  final double paidRatio; // 0..1
  final VoidCallback? onViewAll;

  /// Accent override (defaults to AppColors.richOrange, or theme secondary if you switch later).
  final Color? accentColor;

  /// Optional hooks (used by rows + sheet buttons)
  final void Function(SharedItem item)? onOpenItem;
  final void Function(SharedItem item)? onPay;
  final void Function(SharedItem item)? onManage;
  final void Function(SharedItem item)? onReminder;
  final void Function(SharedItem item)? onMarkPaid;

  const BillsCard({
    super.key,
    required this.top,
    required this.totalThisMonth,
    required this.paidRatio,
    this.onViewAll,
    this.accentColor,
    this.onOpenItem,
    this.onPay,
    this.onManage,
    this.onReminder,
    this.onMarkPaid,
  });

  @override
  Widget build(BuildContext context) {
    final tint = accentColor ?? AppColors.richOrange;
    final dark = Colors.black.withOpacity(.92);
    final buckets = _bucketize(top);
    final isTight = MediaQuery.sizeOf(context).width < 360;
    final safePaid = (paidRatio.isNaN ? 0.0 : paidRatio).clamp(0.0, 1.0);

    return GlassCard(
      radius: 22,
      padding: const EdgeInsets.all(AppSpacing.l),
      showGloss: true,
      glassGradient: [
        Colors.white.withOpacity(.30),
        Colors.white.withOpacity(.12),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header
          Semantics(
            header: true,
            child: Row(
              children: [
                Icon(Icons.receipt_long_rounded, color: tint),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Bills Due This Month',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: tint,
                      fontWeight: FontWeight.w900,
                      fontSize: 16,
                    ),
                  ),
                ),
                if (!isTight)
                  _pill(
                    border: tint.withOpacity(.25),
                    child: Text(
                      '₹ ${_fmtAmount(totalThisMonth)}',
                      style: TextStyle(color: dark, fontWeight: FontWeight.w900),
                    ),
                  ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: onViewAll,
                  style: TextButton.styleFrom(foregroundColor: tint),
                  child: Text(isTight ? 'All' : 'View All'),
                ),
              ],
            ),
          ),

          const SizedBox(height: 10),

          // Grouped sections
          for (final b in buckets.entries) ...[
            if (b.value.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.only(top: 2, bottom: 6),
                child: Text(
                  b.key, // Today / This Week / Later / Overdue
                  style: const TextStyle(
                    fontSize: 12,
                    color: Colors.black54,
                    fontWeight: FontWeight.w700,
                    letterSpacing: .2,
                  ),
                ),
              ),
              ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: b.value.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) => _billRow(context, b.value[i], tint),
              ),
              const SizedBox(height: 8),
            ],
          ],

          // Footer progress
          Row(
            children: [
              Expanded(
                child: ProgressTiny(
                  value: safePaid,
                  color: tint,
                  animate: true,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${(safePaid * 100).round()}% Paid',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ---- Rows ----

  Widget _billRow(BuildContext context, SharedItem e, Color tint) {
    final title = e.title ?? 'Bill';
    final amt = (e.rule.amount ?? 0).toDouble();
    final due = e.nextDueAt;
    final asset = BrandAvatarRegistry.assetFor(title);
    final isOverdue = due != null && _isOverdue(due);

    final row = Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          HapticFeedback.selectionClick();
          if (onOpenItem != null) {
            onOpenItem!(e);
          } else {
            _openSheet(context, e, tint);
          }
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.black.withOpacity(.12)),
          ),
          child: Row(
            children: [
              Hero(
                tag: 'bill-avatar-${e.id}',
                child: BrandAvatar(assetPath: asset, label: title, size: 36, radius: 10),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                      if (isOverdue)
                        Container(
                          margin: const EdgeInsets.only(left: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.red.withOpacity(.08),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: Colors.red.withOpacity(.25)),
                          ),
                          child: const Text(
                            'Overdue',
                            style: TextStyle(color: Colors.red, fontWeight: FontWeight.w800, fontSize: 11.5),
                          ),
                        ),
                    ]),
                    const SizedBox(height: 2),
                    Text(
                      '₹ ${_fmtAmount(amt)} • ${due != null ? (isOverdue ? 'Was due ${_fmtDate(due)}' : 'Due ${_fmtDate(due)}') : '--'}',
                      style: const TextStyle(fontSize: 12, color: Colors.black54),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () {
                  HapticFeedback.lightImpact();
                  if (onPay != null) {
                    onPay!(e);
                  } else {
                    _openSheet(context, e, tint, jumpToActions: true);
                  }
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: tint,
                  side: BorderSide(color: tint.withOpacity(.4)),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                ),
                child: const Text('Pay'),
              ),
              PopupMenuButton<String>(
                tooltip: 'More',
                onSelected: (v) {
                  switch (v) {
                    case 'manage':
                      onManage?.call(e);
                      break;
                    case 'remind':
                      onReminder?.call(e);
                      break;
                    case 'paid':
                      onMarkPaid?.call(e);
                      break;
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'manage', child: _MenuRow(icon: Icons.tune_rounded, label: 'Manage')),
                  PopupMenuItem(value: 'remind', child: _MenuRow(icon: Icons.alarm_add_rounded, label: 'Remind me')),
                  PopupMenuItem(value: 'paid', child: _MenuRow(icon: Icons.check_circle_outline_rounded, label: 'Mark paid')),
                ],
                icon: Icon(Icons.more_vert_rounded, color: Colors.black.withOpacity(.70)),
              ),
            ],
          ),
        ),
      ),
    );

    // Swipe actions: left = Mark paid, right = Remind
    return Dismissible(
      key: ValueKey('bill-${e.id}'),
      background: _swipeBg(Icons.check_circle_outline_rounded, 'Mark paid', Colors.green),
      secondaryBackground: _swipeBg(Icons.alarm_add_rounded, 'Remind', tint),
      confirmDismiss: (dir) async {
        HapticFeedback.selectionClick();
        try {
          if (dir == DismissDirection.startToEnd) {
            onMarkPaid?.call(e);
          } else {
            onReminder?.call(e);
          }
        } catch (err) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Action failed: $err')),
            );
          }
        }
        return false; // action only; don’t remove
      },
      child: row,
    );
  }

  // ---- Bottom Sheet (opaque + glossy) ----

  void _openSheet(BuildContext context, SharedItem item, Color tint, {bool jumpToActions = false}) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withOpacity(.35),
      builder: (_) {
        return _BillDetailsSheet(
          item: item,
          tint: tint,
          onPay: onPay,
          onManage: onManage,
          onReminder: onReminder,
          onMarkPaid: onMarkPaid,
          initialSnapToActions: jumpToActions,
        );
      },
    );
  }

  // ---- utils ----

  Widget _swipeBg(IconData icon, String text, Color color) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(.25)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(children: [Icon(icon, color: color), const SizedBox(width: 6), Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w800))]),
          Row(children: [Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w800)), const SizedBox(width: 6), Icon(icon, color: color)]),
        ],
      ),
    );
  }

  static Widget _pill({required Widget child, Color? border}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: border ?? Colors.black.withOpacity(.18)),
      ),
      child: child,
    );
  }

  Map<String, List<SharedItem>> _bucketize(List<SharedItem> items) {
    final now = DateTime.now();
    DateTime justDate(DateTime d) => DateTime(d.year, d.month, d.day);

    final today = justDate(now);
    final weekEnd = justDate(now.add(const Duration(days: 7)));

    final list = items.where((e) => e.nextDueAt != null).toList()
      ..sort((a, b) => (a.nextDueAt!).compareTo(b.nextDueAt!));

    final overdue = <SharedItem>[];
    final todayList = <SharedItem>[];
    final weekList = <SharedItem>[];
    final later = <SharedItem>[];

    for (final e in list) {
      final d = justDate(e.nextDueAt!);
      if (d.isBefore(today)) {
        overdue.add(e);
      } else if (d == today) {
        todayList.add(e);
      } else if (d.isAfter(today) && !d.isAfter(weekEnd)) {
        weekList.add(e);
      } else {
        later.add(e);
      }
    }

    return {
      if (overdue.isNotEmpty) 'Overdue': overdue,
      if (todayList.isNotEmpty) 'Today': todayList,
      if (weekList.isNotEmpty) 'This Week': weekList,
      if (later.isNotEmpty) 'Later': later,
    };
  }

  static bool _isOverdue(DateTime d) {
    final now = DateTime.now();
    final dd = DateTime(d.year, d.month, d.day);
    final today = DateTime(now.year, now.month, now.day);
    return dd.isBefore(today);
  }

  static String _fmtAmount(double v) {
    final neg = v < 0; final n = v.abs();
    String s;
    if (n >= 10000000)      s = '${(n / 10000000).toStringAsFixed(1)}Cr';
    else if (n >= 100000)   s = '${(n / 100000).toStringAsFixed(1)}L';
    else if (n >= 1000)     s = '${(n / 1000).toStringAsFixed(1)}k';
    else                    s = n % 1 == 0 ? n.toStringAsFixed(0) : n.toStringAsFixed(2);
    return neg ? '-$s' : s;
  }

  static String _fmtDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
  }

  static Widget _chip(String text, Color c, {bool filled = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: filled ? c.withOpacity(.12) : Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(.25)),
      ),
      child: Text(
        text,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
    );
  }

  static Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(width: 96, child: Text(k, style: const TextStyle(color: Colors.black54))),
          const SizedBox(width: 8),
          Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w700))),
        ],
      ),
    );
  }
}

// ---------------------- Bottom Sheet Page ----------------------

class _BillDetailsSheet extends StatefulWidget {
  final SharedItem item;
  final Color tint;

  final void Function(SharedItem item)? onPay;
  final void Function(SharedItem item)? onManage;
  final void Function(SharedItem item)? onReminder;
  final void Function(SharedItem item)? onMarkPaid;

  final bool initialSnapToActions;

  const _BillDetailsSheet({
    required this.item,
    required this.tint,
    this.onPay,
    this.onManage,
    this.onReminder,
    this.onMarkPaid,
    this.initialSnapToActions = false,
  });

  @override
  State<_BillDetailsSheet> createState() => _BillDetailsSheetState();
}

class _BillDetailsSheetState extends State<_BillDetailsSheet> {
  final _controller = DraggableScrollableController();

  @override
  void initState() {
    super.initState();
    if (widget.initialSnapToActions) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _controller.animateTo(
          .75,
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final i = widget.item;
    final tint = widget.tint;
    final title = i.title ?? 'Bill';
    final amt = (i.rule?.amount ?? 0).toDouble();
    final due = i.nextDueAt;
    final isOverdue = due != null && BillsCard._isOverdue(due);
    final asset = BrandAvatarRegistry.assetFor(title);

    return DraggableScrollableSheet(
      controller: _controller,
      snap: true,
      initialChildSize: .55,
      minChildSize: .45,
      maxChildSize: .95,
      expand: false,
      builder: (context, scroll) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.transparent,
            borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
          ),
          child: ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
            child: Stack(
              children: [
                // Body (OPAQUE cards inside)
                CustomScrollView(
                  controller: scroll,
                  slivers: [
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 100), // space for bottom bar
                        child: Column(
                          children: [
                            // drag handle
                            Container(
                              width: 42,
                              height: 4,
                              margin: const EdgeInsets.only(bottom: 10),
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(.15),
                                borderRadius: BorderRadius.circular(99),
                              ),
                            ),

                            // HERO CARD (opaque Material + subtle top gloss)
                            Material(
                              color: Colors.white,
                              elevation: 12,
                              shadowColor: Colors.black.withOpacity(.14),
                              borderRadius: BorderRadius.circular(22),
                              child: Stack(
                                children: [
                                  // gloss layer
                                  Positioned(
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: 80,
                                    child: IgnorePointer(
                                      child: Container(
                                        decoration: const BoxDecoration(
                                          gradient: LinearGradient(
                                            begin: Alignment.topCenter,
                                            end: Alignment.bottomCenter,
                                            colors: [Color(0x66FFFFFF), Color(0x00FFFFFF)],
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.all(14),
                                    child: Row(
                                      children: [
                                        Hero(
                                          tag: 'bill-avatar-${i.id}',
                                          child: BrandAvatar(
                                            assetPath: asset,
                                            label: title,
                                            size: 48,
                                            radius: 14,
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                title,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  fontSize: 18,
                                                  fontWeight: FontWeight.w900,
                                                ),
                                              ),
                                              const SizedBox(height: 4),
                                              Wrap(
                                                spacing: 8,
                                                crossAxisAlignment: WrapCrossAlignment.center,
                                                children: [
                                                  BillsCard._chip('₹ ${BillsCard._fmtAmount(amt)}', tint, filled: true),
                                                  if (due != null)
                                                    Text(
                                                      isOverdue ? 'Was due ${BillsCard._fmtDate(due)}' : 'Due ${BillsCard._fmtDate(due)}',
                                                      style: const TextStyle(fontSize: 12, color: Colors.black54),
                                                    ),
                                                  if (isOverdue) BillsCard._chip('Overdue', Colors.red),
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),

                            // DETAILS (opaque)
                            Material(
                              color: Colors.white,
                              elevation: 6,
                              shadowColor: Colors.black.withOpacity(.10),
                              borderRadius: BorderRadius.circular(18),
                              child: Padding(
                                padding: const EdgeInsets.all(14),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('Details', style: TextStyle(fontWeight: FontWeight.w900)),
                                    const SizedBox(height: 8),
                                    BillsCard._kv('Frequency', i.rule.frequency ?? '--'),
                                    BillsCard._kv('Status', i.rule.status ?? 'active'),
                                    if ((i.note ?? '').trim().isNotEmpty)
                                      BillsCard._kv('Note', i.note!.trim()),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),

                            // HISTORY (opaque)
                            Material(
                              color: Colors.white,
                              elevation: 6,
                              shadowColor: Colors.black.withOpacity(.10),
                              borderRadius: BorderRadius.circular(18),
                              child: const Padding(
                                padding: EdgeInsets.all(14),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Recent Activity', style: TextStyle(fontWeight: FontWeight.w900)),
                                    SizedBox(height: 8),
                                    _HistoryRow(icon: Icons.check_circle_rounded, label: 'Payment recorded', meta: 'Last month'),
                                    _HistoryRow(icon: Icons.notifications_active_rounded, label: 'Reminder sent', meta: '2 weeks ago'),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),

                // sticky action bar
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: SafeArea(
                    top: false,
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(.98),
                        border: Border(top: BorderSide(color: Colors.black.withOpacity(.08))),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(.08),
                            blurRadius: 18,
                            offset: const Offset(0, -8),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: FilledButton(
                              onPressed: () => widget.onPay?.call(i),
                              style: FilledButton.styleFrom(
                                backgroundColor: tint,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                textStyle: const TextStyle(fontWeight: FontWeight.w800),
                              ),
                              child: const Text('Pay Now'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton.outlined(
                            onPressed: () => widget.onManage?.call(i),
                            icon: const Icon(Icons.tune_rounded),
                            tooltip: 'Manage',
                          ),
                          const SizedBox(width: 4),
                          IconButton.outlined(
                            onPressed: () => widget.onReminder?.call(i),
                            icon: const Icon(Icons.alarm_add_rounded),
                            tooltip: 'Remind',
                          ),
                          const SizedBox(width: 4),
                          IconButton.outlined(
                            onPressed: () => widget.onMarkPaid?.call(i),
                            icon: const Icon(Icons.check_circle_outline_rounded),
                            tooltip: 'Mark paid',
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _MenuRow extends StatelessWidget {
  final IconData icon;
  final String label;
  const _MenuRow({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: Colors.black87),
        const SizedBox(width: 10),
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _HistoryRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String meta;
  const _HistoryRow({required this.icon, required this.label, required this.meta});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.black54),
          const SizedBox(width: 8),
          Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700))),
          Text(meta, style: const TextStyle(fontSize: 12, color: Colors.black45)),
        ],
      ),
    );
  }
}
