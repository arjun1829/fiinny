import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';
import 'package:smooth_page_indicator/smooth_page_indicator.dart';

import '../../core/theme.dart';
import '../../data/firestore_repository.dart';
import '../../shared/design_data.dart';
import '../../shared/mock_data.dart';
import '../../shared/models.dart';
import '../cart/cart_provider.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productsAsync = ref.watch(productsStreamProvider);

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async => ref.refresh(productsStreamProvider),
          child: CustomScrollView(
            slivers: [
              const SliverToBoxAdapter(child: _TopBar()),
              const SliverToBoxAdapter(child: _SearchPill()),
              const SliverToBoxAdapter(child: SizedBox(height: 8)),
              const SliverToBoxAdapter(child: _HeroCarousel()),
              SliverToBoxAdapter(
                child: _SectionHeader(
                  'Shop by Category',
                  showViewAll: true,
                  onViewAll: () => context.go('/market'),
                ),
              ),
              const SliverToBoxAdapter(child: _CategoryGrid()),
              SliverToBoxAdapter(
                child: _SectionHeader(
                  'Shop by Crop',
                  showViewAll: true,
                  onViewAll: () => context.go('/hub'),
                ),
              ),
              const SliverToBoxAdapter(child: _CropStrip()),
              SliverToBoxAdapter(
                child: _SectionHeader(
                  'Trending Near You',
                  showViewAll: true,
                  onViewAll: () => context.go('/market'),
                ),
              ),
              productsAsync.when(
                loading: () => const SliverToBoxAdapter(child: _GridSkeleton()),
                error: (e, _) => SliverToBoxAdapter(
                  child: _ErrorBox(
                    msg: 'Could not load products: $e',
                    onRetry: () => ref.refresh(productsStreamProvider),
                  ),
                ),
                data: (live) {
                  final list = (live.isEmpty ? mockProducts : live).take(10).toList();
                  return SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                    sliver: SliverGrid(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        childAspectRatio: 0.58,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (_, i) => _TrendingCard(list[i]),
                        childCount: list.length,
                      ),
                    ),
                  );
                },
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 16)),
              const SliverToBoxAdapter(child: _PowerPlusBanner()),
              const SliverToBoxAdapter(child: SizedBox(height: 16)),
              const SliverToBoxAdapter(child: _FeatureCards()),
              const SliverToBoxAdapter(child: SizedBox(height: 32)),
              const SliverToBoxAdapter(child: _Footer()),
              const SliverToBoxAdapter(child: SizedBox(height: 24)),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Top bar ────────────────────────────────────────────────────────────────

class _TopBar extends ConsumerWidget {
  const _TopBar();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final qty = ref.watch(cartProvider).totalQty;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        children: [
          const Text(
            'Krishidukan',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
              letterSpacing: -0.3,
            ),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.surfaceAlt,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: const [
                Icon(Icons.location_on, size: 14, color: AppColors.primary),
                SizedBox(width: 6),
                Text(
                  'Nashik, MH',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Stack(
            clipBehavior: Clip.none,
            children: [
              IconButton(
                onPressed: () => context.push('/cart'),
                icon: const Icon(Icons.shopping_basket_outlined),
                color: AppColors.text,
                tooltip: 'Cart',
              ),
              if (qty > 0)
                Positioned(
                  right: 4,
                  top: 4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: AppColors.harvest,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                          color: AppColors.surface, width: 1.5),
                    ),
                    constraints:
                        const BoxConstraints(minWidth: 18, minHeight: 18),
                    child: Center(
                      child: Text(
                        qty > 9 ? '9+' : '$qty',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          InkWell(
            onTap: () => context.push('/profile'),
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.text,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                children: const [
                  Text(
                    'Account',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  SizedBox(width: 4),
                  Icon(Icons.keyboard_arrow_down,
                      size: 16, color: Colors.white),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SearchPill extends StatelessWidget {
  const _SearchPill();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: TextField(
        textInputAction: TextInputAction.search,
        onTap: () => context.go('/market'),
        onSubmitted: (_) => context.go('/market'),
        readOnly: true,
        decoration: InputDecoration(
          hintText: 'Search by product or shop name…',
          hintStyle: const TextStyle(color: AppColors.muted, fontSize: 14),
          prefixIcon: const Icon(Icons.search, color: AppColors.muted),
          contentPadding: const EdgeInsets.symmetric(vertical: 0),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(999),
            borderSide: const BorderSide(color: AppColors.border),
          ),
        ),
      ),
    );
  }
}

// ─── Hero carousel ──────────────────────────────────────────────────────────

class _HeroCarousel extends StatefulWidget {
  const _HeroCarousel();
  @override
  State<_HeroCarousel> createState() => _HeroCarouselState();
}

class _HeroCarouselState extends State<_HeroCarousel> {
  final _ctl = PageController();
  Timer? _timer;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !_ctl.hasClients) return;
      _page = (_page + 1) % heroSlides.length;
      _ctl.animateToPage(
        _page,
        duration: const Duration(milliseconds: 500),
        curve: Curves.easeInOut,
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        children: [
          AspectRatio(
            aspectRatio: 16 / 14,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: PageView.builder(
                controller: _ctl,
                onPageChanged: (i) => _page = i,
                itemCount: heroSlides.length,
                itemBuilder: (_, i) => _HeroSlideView(slide: heroSlides[i]),
              ),
            ),
          ),
          const SizedBox(height: 10),
          SmoothPageIndicator(
            controller: _ctl,
            count: heroSlides.length,
            effect: const ExpandingDotsEffect(
              activeDotColor: AppColors.primary,
              dotColor: AppColors.border,
              dotHeight: 6,
              dotWidth: 6,
              expansionFactor: 4,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroSlideView extends StatelessWidget {
  const _HeroSlideView({required this.slide});
  final HeroSlide slide;

  void _onCta(BuildContext context) {
    switch (slide.cta) {
      case HeroCta.market:
        context.go('/market');
        break;
      case HeroCta.hub:
        context.go('/hub');
        break;
      case HeroCta.powerPlus:
        context.go('/market');
        break;
      case HeroCta.retailer:
        context.push('/retailer');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        CachedNetworkImage(
          imageUrl: slide.bgImg,
          fit: BoxFit.cover,
          placeholder: (_, __) => Container(color: AppColors.primary),
          errorWidget: (_, __, ___) => Container(color: AppColors.primary),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                slide.gradient[0].withValues(alpha: 0.96),
                slide.gradient[0].withValues(alpha: 0.0),
              ],
              begin: Alignment.bottomCenter,
              end: Alignment.topCenter,
              stops: const [0.0, 0.65],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      slide.title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 36,
                        fontWeight: FontWeight.w800,
                        height: 1.05,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      slide.subtitle,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.85),
                        fontSize: 15,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: AppColors.primary,
                        minimumSize: const Size(0, 44),
                        padding:
                            const EdgeInsets.symmetric(horizontal: 18, vertical: 0),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(999)),
                      ),
                      onPressed: () => _onCta(context),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.arrow_forward, size: 16),
                          const SizedBox(width: 8),
                          Text(slide.ctaLabel),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (slide.overlayImg != null) ...[
                const SizedBox(width: 8),
                SizedBox(
                  width: 110,
                  height: 140,
                  child: CachedNetworkImage(
                    imageUrl: slide.overlayImg!,
                    fit: BoxFit.contain,
                    errorWidget: (_, __, ___) => const SizedBox.shrink(),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// ─── Section header ─────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(
    this.title, {
    this.showViewAll = false,
    this.onViewAll,
  });
  final String title;
  final bool showViewAll;
  final VoidCallback? onViewAll;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.text,
            ),
          ),
          const Spacer(),
          if (showViewAll)
            TextButton(
              style: TextButton.styleFrom(
                foregroundColor: AppColors.primary,
                padding: EdgeInsets.zero,
              ),
              onPressed: onViewAll ?? () {},
              child: Row(
                children: const [
                  Text('View All',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  SizedBox(width: 4),
                  Icon(Icons.arrow_forward, size: 16),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Category grid ──────────────────────────────────────────────────────────

class _CategoryGrid extends StatelessWidget {
  const _CategoryGrid();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 4,
          childAspectRatio: 0.85,
          crossAxisSpacing: 8,
          mainAxisSpacing: 12,
        ),
        itemCount: homeCategories.length,
        itemBuilder: (_, i) => _CategoryTile(c: homeCategories[i]),
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.c});
  final CategoryChip c;

  static const _catMap = <String, String>{
    'pesticides': 'Pesticide',
    'fertilizers': 'Fertilizer',
    'herbicides': 'Pesticide',
    'bio': 'all',
    'sprayers': 'Tools',
    'seeds': 'Seeds',
    'tools': 'Tools',
    'all': 'all',
  };

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        final cat = _catMap[c.id] ?? 'all';
        context.go('/market?cat=$cat');
      },
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [c.tint.withValues(alpha: 0.6), c.tint],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white, width: 1),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 6,
                  ),
                ],
              ),
              child: ClipOval(
                child: CachedNetworkImage(
                  imageUrl: c.imgUrl,
                  fit: BoxFit.cover,
                  errorWidget: (_, __, ___) => const Icon(
                      Icons.category_outlined,
                      color: AppColors.muted),
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              c.label,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: AppColors.text,
                height: 1.1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Crop strip ─────────────────────────────────────────────────────────────

class _CropStrip extends StatelessWidget {
  const _CropStrip();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 4,
          childAspectRatio: 0.85,
          crossAxisSpacing: 8,
          mainAxisSpacing: 12,
        ),
        itemCount: homeCrops.length,
        itemBuilder: (_, i) {
          final c = homeCrops[i];
          return InkWell(
            onTap: () => context.go('/hub'),
            borderRadius: BorderRadius.circular(20),
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.surfaceAlt,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.06),
                          blurRadius: 6,
                        ),
                      ],
                    ),
                    child: ClipOval(
                      child: CachedNetworkImage(
                        imageUrl: c.imageUrl,
                        fit: BoxFit.cover,
                        errorWidget: (_, __, ___) => Center(
                          child: Text(c.emoji,
                              style: const TextStyle(fontSize: 28)),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(c.name,
                      style: const TextStyle(
                          fontSize: 11, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── Trending card ──────────────────────────────────────────────────────────

String fallbackProductImage(Product p) {
  final key = '${p.category} ${p.name}'.toLowerCase();
  if (key.contains('power plus') || key.contains('biostim') || key.contains('bio-stim')) {
    return 'https://krishidukan-e8315.web.app/product-images/Product_Images/Power%20Plus.png';
  }
  if (key.contains('seed')) {
    return 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('fertil') || key.contains('npk') || key.contains('urea')) {
    return 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('pesticide') || key.contains('neem') || key.contains('insect') || key.contains('fungicide')) {
    return 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('spray') || key.contains('pump')) {
    return 'https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('drip') || key.contains('irrig') || key.contains('water')) {
    return 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('tomato')) {
    return 'https://images.unsplash.com/photo-1592924357229-e2b7e8d04e95?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('wheat')) {
    return 'https://images.unsplash.com/photo-1535912559178-2d4b1e95f6f5?auto=format&fit=crop&w=600&q=80';
  }
  if (key.contains('tool')) {
    return 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=600&q=80';
  }
  // Generic agri fallback.
  return 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=600&q=80';
}

class _TrendingCard extends ConsumerWidget {
  const _TrendingCard(this.p);
  final Product p;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final imgUrl = p.imageUrl.isNotEmpty ? p.imageUrl : fallbackProductImage(p);
    return InkWell(
      onTap: () => context.push('/product/${p.id}'),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surfaceAlt,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 1,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: ClipRRect(
                      borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(20)),
                      child: Container(
                        color: Colors.white,
                        padding: const EdgeInsets.all(10),
                        child: CachedNetworkImage(
                          imageUrl: imgUrl,
                          fit: BoxFit.cover,
                          errorWidget: (_, __, ___) {
                            final fb = fallbackProductImage(p);
                            if (fb == imgUrl) {
                              return const Center(
                                child: Icon(Icons.image_outlined,
                                    size: 56, color: AppColors.muted),
                              );
                            }
                            return CachedNetworkImage(
                              imageUrl: fb,
                              fit: BoxFit.cover,
                              errorWidget: (_, __, ___) => const Center(
                                child: Icon(Icons.image_outlined,
                                    size: 56, color: AppColors.muted),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.inStockBg,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'IN STOCK',
                        style: TextStyle(
                          color: AppColors.inStockFg,
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    p.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      height: 1.25,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        '₹${p.priceInr}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.text,
                        ),
                      ),
                      if (p.mrpInr > p.priceInr) ...[
                        const SizedBox(width: 6),
                        Text(
                          '₹${p.mrpInr}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.muted,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(34),
                        padding: EdgeInsets.zero,
                        textStyle: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      onPressed: () {
                        ref.read(cartProvider.notifier).add(p);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            duration: const Duration(seconds: 1),
                            content: Text('Added ${p.name} to cart'),
                            action: SnackBarAction(
                              label: 'View',
                              onPressed: () => context.push('/cart'),
                            ),
                          ),
                        );
                      },
                      child: const Text('+ Add'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Power Plus banner ──────────────────────────────────────────────────────

class _PowerPlusBanner extends ConsumerWidget {
  const _PowerPlusBanner();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productsAsync = ref.watch(productsStreamProvider);
    final packs = productsAsync.maybeWhen(
      data: (products) {
        final live = products
            .where((p) => p.name.toLowerCase().contains('power plus'))
            .map((p) => PowerPlusPack(p.unit, p.priceInr, p.mrpInr, p.imageUrl))
            .toList()
          ..sort((a, b) => a.priceInr.compareTo(b.priceInr));
        return live.isNotEmpty ? live : powerPlusPacks;
      },
      orElse: () => powerPlusPacks,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF0F3D14), Color(0xFF1F5A28)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(24),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(999),
                border:
                    Border.all(color: Colors.white.withValues(alpha: 0.35)),
              ),
              child: const Text(
                'DIRECT FROM MANUFACTURER',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              'KaranArjun\nPower Plus™',
              style: TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.w800,
                height: 1.1,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Premium biostimulant — stimulates deep root growth, improves fruit colour & weight, and uses advanced water-retention technology.',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.85),
                fontSize: 13,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 8),
            RichText(
              text: TextSpan(
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.85),
                  fontSize: 13,
                ),
                children: const [
                  TextSpan(text: 'Trusted by '),
                  TextSpan(
                    text: '75,800+ farmers',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  TextSpan(text: '.'),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                for (final p in packs) ...[
                  Expanded(child: _PackTile(p)),
                  if (p != packs.last) const SizedBox(width: 8),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PackTile extends ConsumerWidget {
  const _PackTile(this.pack);
  final PowerPlusPack pack;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () {
        final product = Product(
          id: 'powerplus-${pack.size.replaceAll(' ', '').toLowerCase()}',
          name: 'KaranArjun Power Plus™ ${pack.size}',
          brand: 'KaranArjun',
          category: 'Bio-Stimulant',
          priceInr: pack.priceInr,
          unit: 'bottle',
          imageUrl: pack.imageUrl,
          rating: 4.8,
          description:
              'Premium biostimulant. Stimulates deep root growth, improves fruit colour & weight.',
        );
        ref.read(cartProvider.notifier).add(product);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            duration: const Duration(seconds: 1),
            content: Text('Added Power Plus ${pack.size} to cart'),
            action: SnackBarAction(
              label: 'View',
              onPressed: () => context.push('/cart'),
            ),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 56,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: CachedNetworkImage(
                  imageUrl: pack.imageUrl,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  errorWidget: (_, __, ___) => const Center(
                    child:
                        Icon(Icons.eco, color: AppColors.primary, size: 36),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(pack.size,
                style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                    color: AppColors.muted)),
            const SizedBox(height: 2),
            RichText(
              text: TextSpan(
                children: [
                  TextSpan(
                    text: '₹${pack.priceInr}',
                    style: const TextStyle(
                      color: AppColors.text,
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                  TextSpan(
                    text: '  ₹${pack.mrpInr}',
                    style: const TextStyle(
                      color: AppColors.muted,
                      fontSize: 11,
                      decoration: TextDecoration.lineThrough,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Feature cards (3 promos) ───────────────────────────────────────────────

class _FeatureCards extends StatelessWidget {
  const _FeatureCards();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          for (final c in homeFeatureCards) ...[
            _FeatureCardView(c),
            if (c != homeFeatureCards.last) const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class _FeatureCardView extends StatelessWidget {
  const _FeatureCardView(this.c);
  final FeatureCard c;

  void _onTap(BuildContext context) {
    if (c.title.startsWith('Order Power')) {
      context.go('/market');
    } else if (c.title.startsWith('Become')) {
      context.push('/retailer');
    } else {
      context.go('/hub');
    }
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => _onTap(context),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: c.bg,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    c.title,
                    style: TextStyle(
                      color: c.fg,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    c.body,
                    style: TextStyle(
                      color: c.fg.withValues(alpha: 0.9),
                      fontSize: 13,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(c.cta,
                            style: TextStyle(
                              color: c.bg.first,
                              fontWeight: FontWeight.w800,
                            )),
                        const SizedBox(width: 6),
                        Icon(Icons.arrow_forward,
                            size: 14, color: c.bg.first),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Icon(c.icon, color: c.fg.withValues(alpha: 0.25), size: 80),
          ],
        ),
      ),
    );
  }
}

// ─── Footer ────────────────────────────────────────────────────────────────

class _Footer extends StatelessWidget {
  const _Footer();
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          Text('Krishidukan',
              style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primary)),
          SizedBox(height: 8),
          Text(
            'Connecting Indian farmers with verified retailers and trusted manufacturers.',
            style: TextStyle(color: AppColors.muted, fontSize: 13, height: 1.5),
          ),
          SizedBox(height: 16),
          _FooterRow('Get in touch', 'Karan Arjun Krushi Seva Kendra'),
          _FooterRow('Address',
              'Chatrapati Shivaji Nagar, 132 KV\nKarjat, Ahilyanagar — 414402'),
          _FooterRow('Phone', '+91 93071 99040'),
          SizedBox(height: 16),
          Text('© 2026 Krishidukan. All rights reserved.',
              style: TextStyle(color: AppColors.muted, fontSize: 11)),
        ],
      ),
    );
  }
}

class _FooterRow extends StatelessWidget {
  const _FooterRow(this.label, this.value);
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(
                fontSize: 10,
                color: AppColors.muted,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.0,
              )),
          const SizedBox(height: 4),
          Text(value,
              style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// ─── Loading / error helpers ───────────────────────────────────────────────

class _GridSkeleton extends StatelessWidget {
  const _GridSkeleton();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Shimmer.fromColors(
        baseColor: AppColors.border,
        highlightColor: AppColors.surface,
        child: GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            childAspectRatio: 0.62,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
          ),
          itemCount: 4,
          itemBuilder: (_, __) => Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.msg, required this.onRetry});
  final String msg;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Icon(Icons.cloud_off, size: 48, color: AppColors.muted),
          const SizedBox(height: 8),
          Text(msg,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.muted)),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
