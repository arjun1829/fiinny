import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/constants/app_colors.dart';

/// "Share my shop": a 1080×1350 image (Instagram portrait / WhatsApp status)
/// of the shop's brand page that reads on its own — no app or link needed —
/// with the number and shop link printed for anyone who wants to follow up.
/// Same layout as the website's app/lib/brand-poster.ts.
class BrandPosterData {
  final String shopName;
  final String tagline;
  final String place;
  final String phone;
  final String? logoUrl;
  final String? bannerUrl;
  final List<String> photos;
  final List<String> highlights;

  /// Up to three (value, label) numbers to flex, e.g. ('145', 'Products') —
  /// only counts the calling screen has already loaded. Empty hides the row.
  final List<(String, String)> stats;

  /// e.g. krishidukan.com/shop/+91… (shown without https://).
  final String link;

  const BrandPosterData({
    required this.shopName,
    required this.tagline,
    required this.place,
    required this.phone,
    required this.logoUrl,
    required this.bannerUrl,
    required this.photos,
    required this.highlights,
    required this.link,
    this.stats = const [],
  });

  BrandPosterData withStats(List<(String, String)> stats) => BrandPosterData(
        shopName: shopName,
        tagline: tagline,
        place: place,
        phone: phone,
        logoUrl: logoUrl,
        bannerUrl: bannerUrl,
        photos: photos,
        highlights: highlights,
        link: link,
        stats: stats,
      );

  List<String> get _imageUrls => [
        if (logoUrl?.isNotEmpty == true) logoUrl!,
        if (bannerUrl?.isNotEmpty == true) bannerUrl!,
        ...photos.take(3),
      ];
}

const _w = 360.0;
const _h = 450.0;
/// Compact count for the poster's stats row: 145, 1.2K, 12K.
String posterCount(int n) {
  if (n < 1000) return '$n';
  final k = n / 1000;
  return '${k >= 10 ? k.round() : k.toStringAsFixed(1).replaceFirst(RegExp(r'\.0$'), '')}K';
}

const _green = Color(0xFF0F391B);
const _green2 = Color(0xFF184B25);
const _cream = Color(0xFFFBF9F7);

class BrandPoster extends StatelessWidget {
  final BrandPosterData data;
  const BrandPoster({super.key, required this.data});

  String get _initials {
    final parts = data.shopName.trim().split(RegExp(r'\s+'));
    if (parts.length > 1 && parts[0].isNotEmpty && parts[1].isNotEmpty) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    final p = parts.first;
    return (p.isEmpty ? 'K' : p.substring(0, math.min(2, p.length)))
        .toUpperCase();
  }

  Widget _img(String url, {BoxFit fit = BoxFit.cover}) => CachedNetworkImage(
        imageUrl: url,
        fit: fit,
        fadeInDuration: Duration.zero,
        errorWidget: (_, _, _) => const ColoredBox(color: _green2),
      );

  @override
  Widget build(BuildContext context) {
    const bannerH = 156.0;
    const logo = 84.0;
    final photos = data.photos.take(3).toList();
    final chips = data.highlights.take(3).toList();
    final stats = data.stats.take(3).toList();

    return SizedBox(
      width: _w,
      height: _h,
      child: ColoredBox(
        color: _cream,
        child: Stack(
          children: [
            // Banner
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              height: bannerH,
              child: data.bannerUrl?.isNotEmpty == true
                  ? _img(data.bannerUrl!)
                  : const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [_green2, _green],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                      ),
                    ),
            ),
            const Positioned(
              left: 0,
              right: 0,
              top: bannerH * 0.45,
              height: bannerH * 0.55,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0x00000000), Color(0x59000000)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
              ),
            ),
            Positioned(
              top: 14,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    '●  NOW ONLINE ON KRISHIDUKAN',
                    style: TextStyle(
                      color: _green,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ),
            ),
            // Logo
            Positioned(
              top: bannerH - logo / 2 - 6,
              left: (_w - logo) / 2,
              child: Container(
                width: logo,
                height: logo,
                padding: const EdgeInsets.all(3.5),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(19),
                  boxShadow: const [
                    BoxShadow(color: Color(0x40000000), blurRadius: 10),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: data.logoUrl?.isNotEmpty == true
                      ? _img(data.logoUrl!)
                      : ColoredBox(
                          color: _green2,
                          child: Center(
                            child: Text(
                              _initials,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 30,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                ),
              ),
            ),
            // Text block
            Positioned(
              top: bannerH + logo / 2 + 2,
              left: 20,
              right: 20,
              bottom: 74,
              child: Column(
                children: [
                  Text(
                    data.shopName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF1B1C1B),
                    ),
                  ),
                  if (data.tagline.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      data.tagline,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF42493E),
                      ),
                    ),
                  ],
                  if (data.place.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.location_on, size: 13, color: _green),
                        const SizedBox(width: 2),
                        Flexible(
                          child: Text(
                            data.place,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: _green,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (stats.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (var i = 0; i < stats.length; i++) ...[
                          if (i > 0)
                            Container(
                              width: 1,
                              height: 26,
                              margin: const EdgeInsets.symmetric(horizontal: 14),
                              color: const Color(0xFFD5DDD2),
                            ),
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                stats[i].$1,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                  color: _green,
                                  height: 1.1,
                                ),
                              ),
                              Text(
                                stats[i].$2,
                                style: const TextStyle(
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF42493E),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ],
                  if (chips.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (final c in chips)
                          Flexible(
                            child: Container(
                              margin:
                                  const EdgeInsets.symmetric(horizontal: 3),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 9, vertical: 4),
                              decoration: BoxDecoration(
                                color: const Color(0xFFE6F0E3),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                c,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: _green,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                  if (photos.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Expanded(
                      child: LayoutBuilder(
                        builder: (_, c) {
                          final size = math.min(
                            c.maxHeight,
                            (c.maxWidth - 6.0 * (photos.length - 1)) /
                                photos.length,
                          ).clamp(0.0, 74.0);
                          if (size < 36) return const SizedBox.shrink();
                          return Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              for (var i = 0; i < photos.length; i++) ...[
                                if (i > 0) const SizedBox(width: 6),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: SizedBox(
                                    width: size,
                                    height: size,
                                    child: _img(photos[i]),
                                  ),
                                ),
                              ],
                            ],
                          );
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ),
            // Footer
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: 74,
              child: ColoredBox(
                color: _green,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text(
                        'Order on the KrishiDukan app',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Call / WhatsApp ${data.phone}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFFBCE6C1),
                          fontSize: 10.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          data.link,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
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
  }
}

/// Preview + Share (the system sheet: Instagram, WhatsApp, Save image…).
/// [title] is the sheet heading: the owner shares "my shop"; a visitor
/// sharing someone's page sees "Share this page".
Future<void> showBrandPosterSheet(
  BuildContext context,
  BrandPosterData data, {
  String title = 'Share my shop',
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _BrandPosterSheet(data: data, title: title),
  );
}

/// The share button on a public brand / shop page: an image poster (for
/// WhatsApp status, Instagram, Facebook) or just the link. Built only from
/// what the page has already loaded — no reads.
Future<void> showBrandShareChoice(
  BuildContext context, {
  required BrandPosterData? poster,
  required VoidCallback onShareLink,
}) {
  return showModalBottomSheet(
    context: context,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (sheetContext) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          if (poster != null)
            ListTile(
              leading: const Icon(Icons.image_outlined, color: AppColors.primary),
              title: const Text('Share as image'),
              subtitle: const Text('A banner for WhatsApp status, Instagram, Facebook'),
              onTap: () {
                Navigator.pop(sheetContext);
                showBrandPosterSheet(context, poster, title: 'Share this page');
              },
            ),
          ListTile(
            leading: const Icon(Icons.link, color: AppColors.primary),
            title: const Text('Share link'),
            onTap: () {
              Navigator.pop(sheetContext);
              onShareLink();
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}

class _BrandPosterSheet extends StatefulWidget {
  final BrandPosterData data;
  final String title;
  const _BrandPosterSheet({required this.data, required this.title});

  @override
  State<_BrandPosterSheet> createState() => _BrandPosterSheetState();
}

class _BrandPosterSheetState extends State<_BrandPosterSheet> {
  final _boundary = GlobalKey();
  bool _ready = false;
  bool _sharing = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    // Capture only once every image is in (or has failed) — a capture taken
    // mid-load would post a poster with blank boxes.
    Future.wait([
      for (final url in widget.data._imageUrls)
        precacheImage(
          CachedNetworkImageProvider(url),
          context,
          onError: (_, _) {},
        ),
    ]).whenComplete(() {
      if (mounted) setState(() => _ready = true);
    });
  }

  Future<void> _share(BuildContext buttonContext) async {
    final box = buttonContext.findRenderObject() as RenderBox?;
    final origin = box != null && box.hasSize
        ? box.localToGlobal(Offset.zero) & box.size
        : null;
    setState(() => _sharing = true);
    try {
      final boundary = _boundary.currentContext?.findRenderObject()
          as RenderRepaintBoundary?;
      if (boundary == null) return;
      final image = await boundary.toImage(pixelRatio: 1080 / _w);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (png == null) return;
      final safe = widget.data.shopName
          .toLowerCase()
          .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
          .replaceAll(RegExp(r'^-+|-+$'), '');
      // The image alone: Instagram drops a share that also carries text. The
      // number and shop link are printed on the image.
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              png.buffer.asUint8List(),
              mimeType: 'image/png',
              name: '${safe.isEmpty ? 'shop' : safe}-krishidukan.png',
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
    final previewH = math.min(440.0, MediaQuery.sizeOf(context).height * 0.55);
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
            Text(
              widget.title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const Text(
              'Ready for Instagram, WhatsApp status and Facebook',
              style: TextStyle(
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
                    child: BrandPoster(data: widget.data),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Builder(
              builder: (btnContext) => FilledButton.icon(
                onPressed:
                    _ready && !_sharing ? () => _share(btnContext) : null,
                icon: _sharing || !_ready
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
