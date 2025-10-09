// lib/ui/comp/upcoming_section.dart
import 'package:flutter/material.dart';
import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/ui/tokens.dart';
import 'package:lifemap/ui/tonal/tonal_card.dart';
import 'package:lifemap/ui/atoms/brand_avatar.dart';
import 'package:lifemap/screens/subs_bills/widgets/brand_avatar_registry.dart';

class UpcomingSection extends StatelessWidget {
  /// All items (some may not be due soon; we filter internally)
  final List<SharedItem> items;

  /// Window in days starting today (inclusive). Title adapts automatically.
  final int daysWindow;

  /// Optional: tap handler for a row.
  final void Function(SharedItem item)? onTapItem;

  /// Optional: "See all" action in the header.
  final VoidCallback? onSeeAll;

  /// Optional: override header title.
  final String? title;

  /// Optional: override leading header icon.
  final IconData headerIcon;

  /// If true, attempt to remove duplicates by id/title+date.
  final bool dedupe;

  const UpcomingSection({
    Key? key,
    required this.items,
    this.daysWindow = 7,
    this.onTapItem,
    this.onSeeAll,
    this.title,
    this.headerIcon = Icons.upcoming_outlined,
    this.dedupe = true,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final darkText = Colors.black.withOpacity(.92);
    final subText  = Colors.black.withOpacity(.70);

    final startOfToday = _startOfDay(DateTime.now());
    final endOfWindow = _endOfDay(startOfToday.add(Duration(days: daysWindow)));

    // Build, filter, sort, de-dup
    final filtered = items
        .where((e) => e.nextDueAt != null)
        .where((e) => (e.rule.status != 'ended'))
        .where((e) {
      final d = e.nextDueAt!;
      // Include if within [startOfToday, endOfWindow]
      return !d.isBefore(startOfToday) && !d.isAfter(endOfWindow);
    })
        .toList()
      ..sort((a, b) => a.nextDueAt!.compareTo(b.nextDueAt!));

    final list = dedupe ? _dedupe(filtered) : filtered;

    return TonalCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Header(
            icon: headerIcon,
            titleText: title ?? 'Upcoming (next $daysWindow days)',
            count: list.length,
            onSeeAll: onSeeAll,
            darkText: darkText,
          ),
          const SizedBox(height: 12),

          if (list.isEmpty)
            _emptyState(daysWindow)
          else
            ...List.generate(list.length, (i) {
              final e = list[i];
              final due = e.nextDueAt!;
              final asset = BrandAvatarRegistry.assetFor(e.title ?? '');
              final isOverdue = _startOfDay(due).isBefore(startOfToday); // should normally be false
              return _InkRow(
                onTap: onTapItem == null ? null : () => onTapItem!(e),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    const SizedBox(width: 10),
                    BrandAvatar(
                      assetPath: asset,
                      label: e.title ?? 'Item',
                      size: 40,
                      radius: 12,
                    ),
                    const SizedBox(width: 12),

                    // text block
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // title + overdue pill
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  e.title ?? 'Untitled',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: darkText,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 14.5,
                                    height: 1.1,
                                  ),
                                ),
                              ),
                              if (isOverdue)
                                _chipPill(
                                  color: Colors.red.withOpacity(.08),
                                  borderColor: Colors.red.withOpacity(.25),
                                  child: const Text(
                                    'Overdue',
                                    style: TextStyle(
                                      color: Colors.red,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 11.5,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 4),

                          // meta: due date
                          Text(
                            'Due ${_fmtDate(due)}',
                            style: TextStyle(
                              fontSize: 12,
                              color: subText,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(width: 6),
                    Icon(Icons.chevron_right_rounded, color: Colors.black.withOpacity(.55)),
                    const SizedBox(width: 6),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  // ---------- Helpers ----------

  static DateTime _startOfDay(DateTime d) => DateTime(d.year, d.month, d.day);

  static DateTime _endOfDay(DateTime d) =>
      DateTime(d.year, d.month, d.day, 23, 59, 59, 999);

  static String _fmtDate(DateTime d) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final mm = months[d.month - 1];
    final dd = d.day.toString().padLeft(2, '0');
    return '$mm $dd';
  }

  List<SharedItem> _dedupe(List<SharedItem> list) {
    final seen = <String>{};
    final out = <SharedItem>[];
    for (final e in list) {
      final key = _dedupeKey(e);
      if (seen.add(key)) out.add(e);
    }
    return out;
  }

  String _dedupeKey(SharedItem e) {
    // Prefer id if your model exposes it; else fallback to title+date
    final id = _maybeId(e);
    if (id != null && id.isNotEmpty) return 'id:$id';
    final t = (e.title ?? '').trim();
    final d = e.nextDueAt?.millisecondsSinceEpoch ?? 0;
    return 't:$t|d:$d';
  }

  String? _maybeId(SharedItem e) {
    // If your model has `id`, expose it here; otherwise return null
    try {
      final dynamic any = e;
      final v = any.id;
      if (v is String && v.isNotEmpty) return v;
    } catch (_) {}
    return null;
  }
}

/// Header styled like SubscriptionCard (mint title + chip-pills + See all)
class _Header extends StatelessWidget {
  final String titleText;
  final IconData icon;
  final int count;
  final VoidCallback? onSeeAll;
  final Color darkText;

  const _Header({
    required this.titleText,
    required this.icon,
    required this.count,
    required this.onSeeAll,
    required this.darkText,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: AppColors.mint),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            titleText,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppColors.mint,
              fontWeight: FontWeight.w900,
              fontSize: 16,
            ),
          ),
        ),
        _chipPill(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.schedule_rounded, size: 14),
              const SizedBox(width: 6),
              Text(
                '$count',
                style: TextStyle(
                  color: darkText,
                  fontWeight: FontWeight.w900,
                  letterSpacing: .2,
                ),
              ),
            ],
          ),
        ),
        if (onSeeAll != null) ...[
          const SizedBox(width: 8),
          TextButton(
            onPressed: onSeeAll,
            style: TextButton.styleFrom(
              foregroundColor: darkText,
              textStyle: const TextStyle(fontWeight: FontWeight.w800),
            ),
            child: const Text('See all'),
          ),
        ],
      ],
    );
  }
}

/// Row container with ripple + stronger border (like SubscriptionCard)
class _InkRow extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  const _InkRow({required this.child, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white, // crisp white row
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 6),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.black.withOpacity(.18)),
          ),
          child: child,
        ),
      ),
    );
  }
}

class _chipPill extends StatelessWidget {
  final Widget child;
  final Color? color;
  final Color? borderColor;
  const _chipPill({required this.child, this.color, this.borderColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color ?? Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: borderColor ?? Colors.black.withOpacity(.18)),
      ),
      child: child,
    );
  }
}

Widget _emptyState(int daysWindow) {
  return Row(
    children: [
      Icon(Icons.inbox_outlined, size: 18, color: Colors.black.withOpacity(.45)),
      const SizedBox(width: 8),
      Text(
        'Nothing due in the next $daysWindow days',
        style: TextStyle(
          color: Colors.black.withOpacity(.70),
          fontWeight: FontWeight.w600,
        ),
      ),
    ],
  );
}
