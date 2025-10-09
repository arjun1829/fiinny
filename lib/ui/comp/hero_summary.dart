// lib/ui/comp/hero_summary.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lifemap/ui/tokens.dart';
import 'package:lifemap/ui/tonal/tonal_card.dart';
import 'package:lifemap/widgets/animated_slide_fade.dart';
import 'package:lifemap/widgets/animated_height_fade.dart';
import 'package:lifemap/services/subscriptions/subscriptions_service.dart';
import 'package:lifemap/ui/brand/brand_logo.dart';

/// Small struct you already use for filter chips.
class FilterOption {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const FilterOption({
    required this.label,
    required this.selected,
    required this.onTap,
  });
}

/// Upgraded summary header with:
/// - Subtle gradient banner + month progress ring
/// - KPI "pills" (This Month, Active, Paused, Closed, Overdue, Next due)
/// - Collapsible search with suggestions + filters
/// - Optional brand strip with logos and an "Add" chip
class HeroSummary extends StatefulWidget {
  final SubsBillsKpis kpis;

  final bool searchOpen;
  final TextEditingController searchController;
  final FocusNode searchFocus;

  final List<FilterOption> typeOptions;
  final List<FilterOption> statusOptions;

  final VoidCallback onToggleSearch;
  final VoidCallback onAddTap;

  final VoidCallback? onClearSearch;

  final List<String>? quickSuggestions;
  final void Function(String query)? onTapSuggestion;

  final String currencySymbol;
  final Widget? trailing;

  final List<String>? brands;
  final void Function(String brand)? onTapBrand;
  final VoidCallback? onTapAddBrand;

  final void Function(String action)? onQuickAction;

  const HeroSummary({
    super.key,
    required this.kpis,
    required this.searchOpen,
    required this.searchController,
    required this.searchFocus,
    required this.typeOptions,
    required this.statusOptions,
    required this.onToggleSearch,
    required this.onAddTap,
    this.onClearSearch,
    this.quickSuggestions,
    this.onTapSuggestion,
    this.currencySymbol = '₹',
    this.trailing,
    this.brands,
    this.onTapBrand,
    this.onTapAddBrand,
    this.onQuickAction,
  });

  @override
  State<HeroSummary> createState() => _HeroSummaryState();
}

class _HeroSummaryState extends State<HeroSummary> {
  @override
  Widget build(BuildContext context) {
    // color tokens
    const bg = Colors.white;
    final on = Colors.black.withOpacity(.92);
    final onSoft = Colors.black.withOpacity(.60);
    final border = Colors.black.withOpacity(.10);
    final mint = AppColors.mint;

    final k = widget.kpis;
    final monthPct = k.monthProgress.clamp(0.0, 1.0);

    return FocusableActionDetector(
      shortcuts: _shortcuts,
      actions: _actions(context),
      child: AnimatedSlideFade(
        delayMilliseconds: 20,
        child: TonalCard(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
          margin: const EdgeInsets.only(bottom: 12),
          borderRadius: const BorderRadius.all(Radius.circular(22)),
          surface: bg,
          elevation: .5,
          borderColor: border,
          child: DefaultTextStyle.merge(
            style: TextStyle(color: on),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ---------- Banner row ----------
                Container(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        AppColors.mintSoft,
                        Colors.white,
                      ],
                    ),
                    border: Border.all(color: Colors.black.withOpacity(.06)),
                  ),
                  child: Row(
                    children: [
                      // Icon + title
                      const Icon(Icons.account_balance_wallet_rounded, color: AppColors.mint),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Financial Overview',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              k.monthMeta, // "day/total days"
                              style: TextStyle(color: onSoft, fontWeight: FontWeight.w600, fontSize: 12),
                            ),
                          ],
                        ),
                      ),

                      // Month progress ring + Add button
                      _MonthRing(
                        value: monthPct,
                        size: 44,
                        stroke: 5,
                        color: AppColors.mint,
                        label: '${(monthPct * 100).round()}%',
                      ),
                      const SizedBox(width: 10),
                      FilledButton.icon(
                        onPressed: widget.onAddTap,
                        icon: const Icon(Icons.add, size: 18, color: Colors.white),
                        label: const Text('Add'),
                        style: FilledButton.styleFrom(
                          backgroundColor: mint,
                          foregroundColor: Colors.white,
                          textStyle: const TextStyle(fontWeight: FontWeight.w800),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        ),
                      ),
                      const SizedBox(width: 4),
                      IconButton(
                        tooltip: widget.searchOpen ? 'Hide search' : 'Search (/)',
                        onPressed: _toggleSearchWithFocus,
                        icon: Icon(
                          widget.searchOpen ? Icons.expand_less_rounded : Icons.search_rounded,
                          color: on,
                        ),
                      ),
                      if (widget.trailing != null) ...[
                        const SizedBox(width: 2),
                        widget.trailing!,
                      ],
                    ],
                  ),
                ),

                // ---------- Brand strip (optional) ----------
                if (_shouldShowBrandStrip) ...[
                  const SizedBox(height: 10),
                  _brandStrip(
                    brands: widget.brands!,
                    onTapBrand: widget.onTapBrand!,
                    onTapAdd: widget.onTapAddBrand!,
                  ),
                ],

                const SizedBox(height: 10),

                // ---------- KPI chips ----------
                _kpiChipsRow(on, onSoft),

                // ---------- Search + filters (collapsible) ----------
                AnimatedHeightFade(
                  visible: widget.searchOpen,
                  duration: const Duration(milliseconds: 240),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 12),
                      _searchField(
                        controller: widget.searchController,
                        focus: widget.searchFocus,
                        onClear: widget.onClearSearch,
                        hint: 'Search subscriptions, bills, EMIs…',
                      ),
                      const SizedBox(height: 10),
                      if ((widget.quickSuggestions ?? const []).isNotEmpty &&
                          widget.onTapSuggestion != null)
                        _suggestionsStrip(
                          suggestions: widget.quickSuggestions!,
                          onTap: widget.onTapSuggestion!,
                        ),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            if (widget.typeOptions.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(right: 10),
                                child: Text('Type', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: onSoft)),
                              ),
                            ...widget.typeOptions.map((o) => _filterChip(o, mint)),
                            const SizedBox(width: 14),
                            if (widget.statusOptions.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(right: 10),
                                child: Text('Status', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: onSoft)),
                              ),
                            ...widget.statusOptions.map((o) => _filterChip(o, mint)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Tip: try “overdue”, “emi”, “paused”, “subscription”',
                        style: TextStyle(color: onSoft, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ---------- KPI chips row ----------
  Widget _kpiChipsRow(Color on, Color onSoft) {
    final k = widget.kpis;

    Widget chip({
      required IconData icon,
      required String label,
      required String value,
      Color? tint,
      bool filled = false,
    }) {
      final c = tint ?? AppColors.mint;
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: filled ? c.withOpacity(.10) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: (tint ?? Colors.black).withOpacity(.16)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: c),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(color: onSoft, fontWeight: FontWeight.w700, fontSize: 12),
            ),
            const SizedBox(width: 8),
            Text(
              value,
              style: TextStyle(color: on, fontWeight: FontWeight.w900),
            ),
          ],
        ),
      );
    }

    final items = <Widget>[
      chip(
        icon: Icons.payments_rounded,
        label: 'This Month',
        value: '${widget.currencySymbol} ${_fmtAmount(k.monthTotal)}',
        tint: AppColors.mint,
        filled: true,
      ),
      chip(icon: Icons.check_circle_rounded, label: 'Active', value: '${k.active}', tint: AppColors.good),
      chip(icon: Icons.pause_circle_filled_rounded, label: 'Paused', value: '${k.paused}', tint: AppColors.warn),
      chip(icon: Icons.cancel_rounded, label: 'Closed', value: '${k.closed}', tint: AppColors.ink500),
      chip(icon: Icons.warning_amber_rounded, label: 'Overdue', value: '${k.overdue}', tint: Colors.red),
      if (k.nextDue != null)
        chip(
          icon: Icons.event_rounded,
          label: 'Next due',
          value: _fmtDate(k.nextDue!),
          tint: AppColors.mint,
        ),
    ];

    return LayoutBuilder(builder: (context, c) {
      final wrap = Wrap(
        spacing: 8,
        runSpacing: 8,
        children: items,
      );
      return wrap;
    });
  }

  // ---------- Search field ----------
  Widget _searchField({
    required TextEditingController controller,
    required FocusNode focus,
    required String hint,
    VoidCallback? onClear,
  }) {
    return Stack(
      alignment: Alignment.centerRight,
      children: [
        TextField(
          controller: controller,
          focusNode: focus,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: Colors.black45),
            prefixIcon: const Icon(Icons.search, color: Colors.black87),
            isDense: true,
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0x1F000000)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0x24000000)),
            ),
            focusedBorder: const OutlineInputBorder(
              borderRadius: BorderRadius.all(Radius.circular(14)),
              borderSide: BorderSide(color: AppColors.mint, width: 1.6),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
          style: const TextStyle(color: Colors.black87),
          cursorColor: Colors.black87,
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => focus.unfocus(),
        ),
        if (onClear != null)
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: controller,
            builder: (_, v, __) => v.text.isEmpty
                ? const SizedBox.shrink()
                : Padding(
              padding: const EdgeInsets.only(right: 6),
              child: IconButton(
                tooltip: 'Clear (Esc)',
                icon: const Icon(Icons.clear_rounded, size: 18, color: Colors.black87),
                onPressed: onClear,
              ),
            ),
          ),
      ],
    );
  }

  // ---------- Suggestions strip ----------
  Widget _suggestionsStrip({
    required List<String> suggestions,
    required void Function(String) onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: suggestions.map((s) {
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: () => onTap(s),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                  decoration: const ShapeDecoration(
                    color: Color(0x0F000000),
                    shape: StadiumBorder(side: BorderSide(color: Color(0x1F000000))),
                  ),
                  child: Text(
                    s,
                    style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.black87),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  // ---------- Filter chip ----------
  Widget _filterChip(FilterOption o, Color mint) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        selected: o.selected,
        showCheckmark: false,
        label: Text(o.label),
        onSelected: (_) {
          Feedback.forTap(context);
          o.onTap();
        },
        side: BorderSide(
          color: (o.selected ? mint : const Color(0x1F000000)).withOpacity(.7),
        ),
        backgroundColor: const Color(0x0F000000),
        selectedColor: mint.withOpacity(.16),
        labelStyle: TextStyle(
          fontWeight: FontWeight.w700,
          color: o.selected ? mint : Colors.black87,
        ),
      ),
    );
  }

  // ---------- Brand strip ----------
  bool get _shouldShowBrandStrip {
    final hasBrands = (widget.brands ?? const []).isNotEmpty;
    return hasBrands && widget.onTapBrand != null && widget.onTapAddBrand != null;
  }

  Widget _brandStrip({
    required List<String> brands,
    required void Function(String) onTapBrand,
    required VoidCallback onTapAdd,
  }) {
    final show = brands.take(4).toList();

    Widget chip({required Widget child, required VoidCallback onTap}) {
      return InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: const ShapeDecoration(
            color: Color(0x0F000000),
            shape: StadiumBorder(side: BorderSide(color: Color(0x1F000000))),
          ),
          child: child,
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          const SizedBox(width: 2),
          ...show.map(
                (name) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: chip(
                onTap: () => onTapBrand(name),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    BrandLogo(brand: name, size: 20, radius: 6),
                    const SizedBox(width: 6),
                    Text(name, style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.black87)),
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 2),
            child: chip(
              onTap: onTapAdd,
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.add_rounded, size: 16, color: Colors.black87),
                  SizedBox(width: 6),
                  Text('Add', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black87)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---------- Helpers ----------
  void _toggleSearchWithFocus() {
    widget.onToggleSearch();
    if (!widget.searchOpen) {
      Future.microtask(() => widget.searchFocus.requestFocus());
    } else {
      widget.searchFocus.unfocus();
    }
  }

  static String _fmtDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
  }

  static String _fmtAmount(double v) {
    final n = v.abs();
    String s;
    if (n >= 10000000) s = '${(n / 10000000).toStringAsFixed(1)}Cr';
    else if (n >= 100000) s = '${(n / 100000).toStringAsFixed(1)}L';
    else if (n >= 1000) s = '${(n / 1000).toStringAsFixed(1)}k';
    else s = n.toStringAsFixed(0);
    return v < 0 ? '-$s' : s;
  }

  // Keyboard shortcuts
  Map<LogicalKeySet, Intent> get _shortcuts => {
    LogicalKeySet(LogicalKeyboardKey.slash): ActivateIntent(),
    LogicalKeySet(LogicalKeyboardKey.escape): DismissIntent(),
  };

  Map<Type, Action<Intent>> _actions(BuildContext context) {
    return {
      ActivateIntent: CallbackAction<ActivateIntent>(onInvoke: (_) {
        if (!widget.searchOpen) widget.onToggleSearch();
        Future.microtask(() => widget.searchFocus.requestFocus());
        return null;
      }),
      DismissIntent: CallbackAction<DismissIntent>(onInvoke: (_) {
        if (widget.onClearSearch != null && widget.searchController.text.isNotEmpty) {
          widget.onClearSearch!();
        }
        widget.searchFocus.unfocus();
        return null;
      }),
    };
  }
}

/// Tiny month progress ring used in the banner.
class _MonthRing extends StatelessWidget {
  final double value; // 0..1
  final double size;
  final double stroke;
  final Color color;
  final String? label;

  const _MonthRing({
    required this.value,
    this.size = 44,
    this.stroke = 5,
    this.color = AppColors.mint,
    this.label,
  });

  @override
  Widget build(BuildContext context) {
    final bg = Colors.black.withOpacity(.08);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: Size.square(size),
            painter: _RingPainter(value: value, color: color, stroke: stroke, bg: bg),
          ),
          if (label != null)
            Text(
              label!,
              style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900),
            ),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final double value;
  final double stroke;
  final Color color;
  final Color bg;

  _RingPainter({required this.value, required this.color, required this.stroke, required this.bg});

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final center = rect.center;
    final radius = (size.shortestSide - stroke) / 2;

    final bgPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = bg
      ..strokeCap = StrokeCap.round;

    final fgPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = color
      ..strokeCap = StrokeCap.round;

    // background circle
    canvas.drawCircle(center, radius, bgPaint);

    // progress arc (start at -90°)
    final start = -90.0 * (3.1415926535 / 180.0);
    final sweep = (value.clamp(0.0, 1.0)) * 2 * 3.1415926535;
    final rectArc = Rect.fromCircle(center: center, radius: radius);
    canvas.drawArc(rectArc, start, sweep, false, fgPaint);
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) {
    return old.value != value || old.color != color || old.stroke != stroke || old.bg != bg;
  }
}
