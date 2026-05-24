import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:smooth_page_indicator/smooth_page_indicator.dart';

import '../../core/i18n.dart';
import '../../core/theme.dart';

// ─── Data ─────────────────────────────────────────────────────────────────────

class _Slide {
  const _Slide({
    this.assetImage,
    required this.titleKey,
    required this.subKey,
  });
  final String? assetImage; // null → custom illustration
  final String titleKey;
  final String subKey;
}

const _kSlides = [
  _Slide(
    assetImage: 'asset/images/regenerated_image_1778300850830.png',
    titleKey: 'welcome_1_title',
    subKey: 'welcome_1_sub',
  ),
  _Slide(
    assetImage: 'asset/images/regenerated_image_1778304077291.png',
    titleKey: 'welcome_2_title',
    subKey: 'welcome_2_sub',
  ),
  _Slide(
    assetImage: null,
    titleKey: 'welcome_3_title',
    subKey: 'welcome_3_sub',
  ),
];

// ─── Screen ───────────────────────────────────────────────────────────────────

class WelcomeScreen extends ConsumerStatefulWidget {
  const WelcomeScreen({super.key});
  @override
  ConsumerState<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends ConsumerState<WelcomeScreen> {
  final _pc = PageController();
  int _i = 0;

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  void _advance() {
    if (_i < _kSlides.length - 1) {
      _pc.nextPage(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeInOut,
      );
    } else {
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = ref.watch(localeProvider);
    final topPad = MediaQuery.paddingOf(context).top;
    final bottomPad = MediaQuery.paddingOf(context).bottom;
    final screenH = MediaQuery.sizeOf(context).height;

    // Image panel is 58% of total screen height (including status bar).
    final imageH = screenH * 0.58;

    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          // ── Pages ───────────────────────────────────────────────────────
          PageView.builder(
            controller: _pc,
            onPageChanged: (i) => setState(() => _i = i),
            itemCount: _kSlides.length,
            itemBuilder: (_, i) => _SlideView(
              slide: _kSlides[i],
              loc: loc,
              imageH: imageH,
              topPad: topPad,
            ),
          ),

          // ── Skip pill ────────────────────────────────────────────────────
          Positioned(
            top: topPad + 12,
            right: 16,
            child: GestureDetector(
              onTap: () => context.go('/login'),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.28),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  Strings.t('skip', loc),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          ),

          // ── Bottom controls ──────────────────────────────────────────────
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Padding(
              padding: EdgeInsets.fromLTRB(24, 0, 24, bottomPad + 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SmoothPageIndicator(
                    controller: _pc,
                    count: _kSlides.length,
                    effect: const ExpandingDotsEffect(
                      activeDotColor: AppColors.primary,
                      dotColor: AppColors.border,
                      dotHeight: 8,
                      dotWidth: 8,
                      expansionFactor: 3,
                    ),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: _advance,
                    child: Text(
                      _i < _kSlides.length - 1
                          ? Strings.t('continue_btn', loc)
                          : Strings.t('get_started', loc),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Single slide view ────────────────────────────────────────────────────────

class _SlideView extends StatelessWidget {
  const _SlideView({
    required this.slide,
    required this.loc,
    required this.imageH,
    required this.topPad,
  });
  final _Slide slide;
  final AppLocale loc;
  final double imageH;
  final double topPad;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Image / illustration ─────────────────────────────────────────
        SizedBox(
          height: imageH,
          child: slide.assetImage != null
              ? Image.asset(slide.assetImage!, fit: BoxFit.cover)
              : const _BusinessIllustration(),
        ),

        // ── Text section ─────────────────────────────────────────────────
        Expanded(
          child: Padding(
            // Leave 140px at the bottom so dots + button don't overlap text.
            padding: const EdgeInsets.fromLTRB(28, 28, 28, 140),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  Strings.t(slide.titleKey, loc),
                  style: const TextStyle(
                    fontSize: 25,
                    fontWeight: FontWeight.w800,
                    height: 1.2,
                    color: AppColors.text,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  Strings.t(slide.subKey, loc),
                  style: const TextStyle(
                    fontSize: 15,
                    color: AppColors.muted,
                    height: 1.6,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Slide 3 illustration ─────────────────────────────────────────────────────

// 6 product assets displayed as a 3×2 grid on a dark-green background.
class _BusinessIllustration extends StatelessWidget {
  const _BusinessIllustration();

  static const _tiles = [
    'asset/product-images/Product_Images/Biozyme.jpg',
    'asset/product-images/Product_Images/Nano Urea.webp',
    'asset/product-images/Product_Images/Karate.jpg',
    'asset/product-images/Product_Images/NPK 151515.jpg',
    'asset/product-images/Product_Images/humi gold.png',
    'asset/product-images/Product_Images/Sultan 505.jpg',
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primaryDark, AppColors.primarySoft],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Subtle dot grid decoration
          Positioned.fill(child: CustomPaint(painter: _DotGridPainter())),

          // Product mosaic
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 32, 28, 28),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    crossAxisSpacing: 14,
                    mainAxisSpacing: 14,
                  ),
                  itemCount: _tiles.length,
                  itemBuilder: (_, i) => Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    padding: const EdgeInsets.all(10),
                    child: Image.asset(_tiles[i], fit: BoxFit.contain),
                  ),
                ),
              ],
            ),
          ),

          // Fade to white at the bottom
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 72,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.white.withValues(alpha: 0.9)],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DotGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.07)
      ..style = PaintingStyle.fill;
    const spacing = 28.0;
    const r = 2.0;
    for (double x = spacing; x < size.width; x += spacing) {
      for (double y = spacing; y < size.height; y += spacing) {
        canvas.drawCircle(Offset(x, y), r, paint);
      }
    }
  }

  @override
  bool shouldRepaint(_) => false;
}
