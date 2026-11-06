import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/constants/app_colors.dart';

/// "Share my stats": a story-size image (1080×1920) of the seller's numbers
/// for the selected period, for Instagram / WhatsApp status or a chat. Same
/// layout and choices as the website's app/dashboard/_lib/stats-share-card.ts.
class StatsShareData {
  final String shopName;
  final String? logoUrl;

  /// e.g. "Last 7 days" or "12 Sep – 18 Sep".
  final String periodLabel;

  /// krishidukan.com/shop/+91… (without https://), or null.
  final String? link;
  final int orders;
  final double revenue;
  final int productViews;
  final int calls;
  final int followers;
  final int reelViews;
  final String? bestSeller;

  /// Orders per day (or per bucket) across the period, oldest first.
  final List<int> trend;

  const StatsShareData({
    required this.shopName,
    this.logoUrl,
    required this.periodLabel,
    this.link,
    required this.orders,
    required this.revenue,
    required this.productViews,
    required this.calls,
    required this.followers,
    required this.reelViews,
    this.bestSeller,
    this.trend = const [],
  });
}

enum StatsShareMetric {
  orders('Orders', true),
  revenue('Sales (₹)', false), // the seller's business figure: off until chosen
  productViews('Product views', true),
  calls('Calls', true),
  followers('Followers', true),
  reelViews('Reel views', true),
  bestSeller('Best seller', true),
  trend('Orders chart', true),
  link('Shop link', true);

  final String label;
  final bool onByDefault;
  const StatsShareMetric(this.label, this.onByDefault);
}

/// 1,234 · 12.3K · 1.2L · 1.1Cr (Indian units above a lakh).
String compactNumber(num n) {
  final v = math.max(0, n.round());
  String trim(double x) => x >= 100
      ? '${x.round()}'
      : x.toStringAsFixed(1).replaceAll(RegExp(r'\.0$'), '');
  if (v >= 10000000) return '${trim(v / 10000000)}Cr';
  if (v >= 100000) return '${trim(v / 100000)}L';
  if (v >= 10000) return '${trim(v / 1000)}K';
  // Indian grouping below ten thousand is the same as western: 1,234.
  final s = '$v';
  return s.length > 3
      ? '${s.substring(0, s.length - 3)},${s.substring(s.length - 3)}'
      : s;
}

/// The tiles to draw: chosen metrics without zeroes (nothing to show off),
/// keeping orders if nothing else is left.
List<({String label, String value})> statTiles(
  StatsShareData d,
  Set<StatsShareMetric> show,
) {
  final all = <({StatsShareMetric key, String label, num n, String value})>[
    (
      key: StatsShareMetric.orders,
      label: 'Orders',
      n: d.orders,
      value: compactNumber(d.orders),
    ),
    (
      key: StatsShareMetric.revenue,
      label: 'Sales',
      n: d.revenue,
      value: '₹${compactNumber(d.revenue)}',
    ),
    (
      key: StatsShareMetric.productViews,
      label: 'Product views',
      n: d.productViews,
      value: compactNumber(d.productViews),
    ),
    (
      key: StatsShareMetric.calls,
      label: 'Calls from farmers',
      n: d.calls,
      value: compactNumber(d.calls),
    ),
    (
      key: StatsShareMetric.followers,
      label: 'Followers',
      n: d.followers,
      value: compactNumber(d.followers),
    ),
    (
      key: StatsShareMetric.reelViews,
      label: 'Reel views',
      n: d.reelViews,
      value: compactNumber(d.reelViews),
    ),
  ];
  final chosen = all.where((t) => show.contains(t.key)).toList();
  final nonZero = chosen.where((t) => t.n.round() > 0).toList();
  final tiles = nonZero.isNotEmpty
      ? nonZero
      : chosen.where((t) => t.key == StatsShareMetric.orders).toList();
  return [for (final t in tiles) (label: t.label, value: t.value)];
}

String _initials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  final first = parts.isEmpty ? 'K' : parts[0];
  return first.substring(0, math.min(2, first.length)).toUpperCase();
}

const _cardW = 360.0;
const _cardH = 640.0;

/// The card at 360×640; captured at 3× it is 1080×1920.
class StatsShareCard extends StatelessWidget {
  final StatsShareData data;
  final Set<StatsShareMetric> show;
  const StatsShareCard({super.key, required this.data, required this.show});

  @override
  Widget build(BuildContext context) {
    final tiles = statTiles(data, show);
    final showLink = show.contains(StatsShareMetric.link) && data.link != null;
    final best = show.contains(StatsShareMetric.bestSeller)
        ? data.bestSeller
        : null;
    final trend = data.trend.length > 14
        ? data.trend.sublist(data.trend.length - 14)
        : data.trend;
    final rows = (tiles.length / 2).ceil();
    // Room left for the chart once tiles and best seller are placed.
    final used = 233 + rows * 79 + (best != null ? 53 : 0);
    final footer = showLink ? 84 : 57;
    final chartRoom = _cardH - footer - used;
    final showChart =
        show.contains(StatsShareMetric.trend) &&
        trend.length > 1 &&
        trend.any((v) => v > 0) &&
        chartRoom > 80;

    // Material: text gets the app's font and no debug underline wherever the
    // card is drawn.
    return Material(
      type: MaterialType.transparency,
      child: SizedBox(
        width: _cardW,
        height: _cardH,
        // Merged, so the app's own font is kept.
        child: DefaultTextStyle.merge(
          style: const TextStyle(color: Colors.white, height: 1.15),
          child: Stack(
            children: [
              const Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Color(0xFF0A1F08),
                        Color(0xFF12401A),
                        Color(0xFF1B5E20),
                      ],
                      stops: [0, 0.55, 1],
                    ),
                  ),
                ),
              ),
              Positioned(right: -87, top: -13, child: _circle(100)),
              Positioned(left: -67, bottom: 13, child: _circle(87)),
              Padding(
                padding: const EdgeInsets.fromLTRB(27, 27, 27, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Row(
                      children: [
                        Text(
                          'KrishiDukan',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Spacer(),
                        Text(
                          'SELLER STATS',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFFF9A825),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 22),
                    Center(
                      child: _Avatar(
                        name: data.shopName,
                        logoUrl: data.logoUrl,
                      ),
                    ),
                    const SizedBox(height: 14),
                    // Long names shrink to fit, as on the website's card.
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        data.shopName,
                        maxLines: 1,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 11,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(11),
                        ),
                        child: Text(
                          data.periodLabel,
                          style: const TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFFE8F5E9),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 19),
                    for (var i = 0; i < tiles.length; i += 2) ...[
                      if (i > 0) const SizedBox(height: 9),
                      SizedBox(
                        height: 70,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              child: _Tile(tiles[i].value, tiles[i].label),
                            ),
                            if (i + 1 < tiles.length) ...[
                              const SizedBox(width: 9),
                              Expanded(
                                child: _Tile(
                                  tiles[i + 1].value,
                                  tiles[i + 1].label,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                    if (best != null) ...[
                      const SizedBox(height: 9),
                      Container(
                        height: 44,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF9A825),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text(
                              'BEST SELLER',
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF3E2723),
                              ),
                            ),
                            Text(
                              best,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF3E2723),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (showChart) ...[
                      const SizedBox(height: 16),
                      const Text(
                        'Orders',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFFC8E6C9),
                        ),
                      ),
                      const SizedBox(height: 6),
                      SizedBox(
                        height: math.min(107.0, chartRoom - 40),
                        child: _Bars(trend),
                      ),
                    ],
                  ],
                ),
              ),
              Positioned(
                left: 27,
                right: 27,
                bottom: showLink ? 33 : 30,
                child: Column(
                  children: [
                    const Text(
                      'Find us on KrishiDukan',
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (showLink) ...[
                      const SizedBox(height: 8),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          data.link!,
                          style: const TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFFC8E6C9),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static Widget _circle(double r) => Container(
    width: r * 2,
    height: r * 2,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: Colors.white.withValues(alpha: 0.05),
    ),
  );
}

class _Avatar extends StatelessWidget {
  final String name;
  final String? logoUrl;
  const _Avatar({required this.name, this.logoUrl});

  @override
  Widget build(BuildContext context) {
    final initials = Container(
      color: const Color(0xFF2E7D32),
      alignment: Alignment.center,
      child: Text(
        _initials(name),
        style: const TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w800,
          color: Colors.white,
        ),
      ),
    );
    final url = logoUrl;
    return Container(
      width: 76,
      height: 76,
      padding: const EdgeInsets.all(2.7),
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        color: Color(0xFFF9A825),
      ),
      child: ClipOval(
        child: url == null || url.isEmpty
            ? initials
            : ColoredBox(
                color: Colors.white,
                child: Image(
                  image: CachedNetworkImageProvider(url),
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => initials,
                ),
              ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  final String value;
  final String label;
  const _Tile(this.value, this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                height: 1.05,
              ),
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              color: Color(0xFFC8E6C9),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bars extends StatelessWidget {
  final List<int> values;
  const _Bars(this.values);

  @override
  Widget build(BuildContext context) {
    final maxV = values.fold<int>(1, (m, v) => v > m ? v : m);
    return LayoutBuilder(
      builder: (context, c) {
        final slot = c.maxWidth / values.length;
        final bw = math.min(19.0, slot * 0.6);
        return Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (final v in values)
              SizedBox(
                width: slot,
                child: Align(
                  alignment: Alignment.bottomCenter,
                  child: Container(
                    width: bw,
                    height: v > 0 ? math.max(5.0, c.maxHeight * v / maxV) : 1.5,
                    decoration: BoxDecoration(
                      color: v > 0
                          ? const Color(0xFF81C784)
                          : Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(v > 0 ? 4 : 0),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

const _prefsKey = 'statsShare.v1';

/// Opens the preview with the metric choices and a Share button (the system
/// share sheet: Instagram, WhatsApp, Save image…).
Future<void> showStatsShareSheet(BuildContext context, StatsShareData data) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _StatsShareSheet(data: data),
  );
}

class _StatsShareSheet extends StatefulWidget {
  final StatsShareData data;
  const _StatsShareSheet({required this.data});

  @override
  State<_StatsShareSheet> createState() => _StatsShareSheetState();
}

class _StatsShareSheetState extends State<_StatsShareSheet> {
  final _boundary = GlobalKey();
  Set<StatsShareMetric> _show = {
    for (final m in StatsShareMetric.values)
      if (m.onByDefault) m,
  };
  bool _logoReady = false;
  bool _sharing = false;

  @override
  void initState() {
    super.initState();
    _loadPrefs();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final url = widget.data.logoUrl;
    if (_logoReady) return;
    if (url == null || url.isEmpty) {
      _logoReady = true;
    } else {
      // Capture only once the logo is in (or has failed).
      precacheImage(
        CachedNetworkImageProvider(url),
        context,
        onError: (_, _) {},
      ).whenComplete(() => mounted ? setState(() => _logoReady = true) : null);
    }
  }

  Future<void> _loadPrefs() async {
    try {
      final saved = (await SharedPreferences.getInstance()).getStringList(
        _prefsKey,
      );
      if (saved == null || !mounted) return;
      setState(
        () => _show = {
          for (final m in StatsShareMetric.values)
            if (saved.contains(m.name)) m,
        },
      );
    } catch (_) {}
  }

  void _toggle(StatsShareMetric m) {
    setState(() {
      _show = {..._show};
      if (!_show.remove(m)) _show.add(m);
    });
    SharedPreferences.getInstance()
        .then(
          (p) => p.setStringList(_prefsKey, [for (final m in _show) m.name]),
        )
        .catchError((_) => false);
  }

  Future<void> _share(BuildContext buttonContext) async {
    final box = buttonContext.findRenderObject() as RenderBox?;
    final origin = box != null && box.hasSize
        ? box.localToGlobal(Offset.zero) & box.size
        : null;
    setState(() => _sharing = true);
    try {
      final boundary =
          _boundary.currentContext?.findRenderObject()
              as RenderRepaintBoundary?;
      if (boundary == null) return;
      final image = await boundary.toImage(pixelRatio: 1080 / _cardW);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (png == null) return;
      // The image alone: Instagram drops a share that also carries text. The
      // shop link is printed on the image.
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              png.buffer.asUint8List(),
              mimeType: 'image/png',
              name: 'krishidukan-stats.png',
            ),
          ],
          sharePositionOrigin: origin,
        ),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not create the image. Please try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final previewH = math.min(420.0, MediaQuery.sizeOf(context).height * 0.5);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.divider,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Share my stats',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            Text(
              '${widget.data.periodLabel} · story size, ready for Instagram and WhatsApp',
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: previewH,
              child: FittedBox(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: RepaintBoundary(
                    key: _boundary,
                    child: StatsShareCard(data: widget.data, show: _show),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Show on the image',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final m in StatsShareMetric.values)
                  FilterChip(
                    label: Text(m.label),
                    selected: _show.contains(m),
                    onSelected: (_) => _toggle(m),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Sales stay hidden unless you turn them on.',
              style: TextStyle(
                fontSize: 11.5,
                color: AppColors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            Builder(
              builder: (btnContext) => FilledButton.icon(
                onPressed: _logoReady && !_sharing
                    ? () => _share(btnContext)
                    : null,
                icon: _sharing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.share_rounded),
                label: const Text('Share image'),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  backgroundColor: AppColors.primary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
