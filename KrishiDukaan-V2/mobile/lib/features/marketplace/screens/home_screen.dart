import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../core/utils/image_utils.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../../core/widgets/product_card.dart';
import '../../notifications/notifications.dart';
import '../providers/marketplace_provider.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  /// Opens the marketplace with the search field already focused. A fresh token
  /// on each tap guarantees the keyboard pops up even when the marketplace tab
  /// is already alive in the shell's IndexedStack.
  void _openSearch(BuildContext context) {
    context.go('/marketplace?focus=${DateTime.now().millisecondsSinceEpoch}');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            floating: true,
            toolbarHeight: AppTopBar.height,
            titleSpacing: 16,
            elevation: 0,
            backgroundColor: Colors.transparent,
            flexibleSpace: Container(
              decoration: BoxDecoration(gradient: topBarGradient()),
            ),
            foregroundColor: Colors.white,
            title: const TopBarTitle(title: 'KrishiDukan'),
            actions: [
              TopBarAction(
                icon: Icons.search,
                tooltip: 'Search products',
                onPressed: () => _openSearch(context),
              ),
              const NotificationBell(),
            ],
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Greeting
                  userAsync.when(
                    data: (user) => Text(
                      user != null
                          ? 'Hello, ${user.name.split(' ').first}! 👋'
                          : 'Welcome to KrishiDukan',
                      style: AppTextStyles.heading2,
                    ),
                    loading: () => const SizedBox(
                      height: 24,
                      width: 180,
                      child: LinearProgressIndicator(),
                    ),
                    error: (_, _) => Text(
                      'Welcome to KrishiDukan',
                      style: AppTextStyles.heading2,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Find the best agri products near you',
                    style: AppTextStyles.body.copyWith(
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 20),

                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          AppColors.primary.withValues(alpha: 0.08),
                          Colors.white,
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: AppColors.primaryContainer.withValues(
                          alpha: 0.6,
                        ),
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Quick product search',
                            style: AppTextStyles.heading3.copyWith(
                              color: AppColors.primary,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Search by product type, crop need, or nearby availability.',
                            style: AppTextStyles.bodySmall,
                          ),
                          const SizedBox(height: 14),
                          GestureDetector(
                            onTap: () => _openSearch(context),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 14,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                boxShadow: [
                                  BoxShadow(
                                    color: AppColors.cardShadow,
                                    blurRadius: 8,
                                    offset: const Offset(0, 3),
                                  ),
                                ],
                              ),
                              child: Row(
                                children: [
                                  const Icon(
                                    Icons.search,
                                    color: AppColors.onSurfaceVariant,
                                  ),
                                  const SizedBox(width: 12),
                                  Text(
                                    'Search fertilizers, seeds, pesticides...',
                                    style: AppTextStyles.body.copyWith(
                                      color: AppColors.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Rotating promo banners — gives the page a lively hero strip
                  const _PromoCarousel(),
                  const SizedBox(height: 24),

                  // Category cards grid
                  Text('Shop by Category', style: AppTextStyles.heading3),
                  const SizedBox(height: 12),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 4,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8,
                      childAspectRatio: 0.76,
                    ),
                    itemCount: _categories.length,
                    itemBuilder: (context, index) {
                      final cat = _categories[index];
                      return _CategoryCard(
                        category: cat,
                        onTap: () {
                          if (cat.id == 'all') {
                            context.go('/marketplace');
                          } else {
                            context.go('/marketplace?category=${cat.id}');
                          }
                        },
                      );
                    },
                  ),
                  const SizedBox(height: 24),
                  const _BenefitsStrip(),
                  const SizedBox(height: 28),

                  // Dashboard CTA for retailers
                  userAsync.maybeWhen(
                    data: (user) {
                      if (user != null && user.isSeller) {
                        return _DashboardBanner(
                          canAccess: user.canAccessDashboard,
                        );
                      }
                      if (user != null && user.isConsumer) {
                        return _BecomeRetailerBanner();
                      }
                      return const SizedBox.shrink();
                    },
                    orElse: () => const SizedBox.shrink(),
                  ),

                  // Top deals — horizontal rail of the biggest discounts
                  const _TopDealsRail(),

                  // Featured products (real Firestore data)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Featured Products', style: AppTextStyles.heading3),
                      TextButton(
                        onPressed: () => context.go('/marketplace'),
                        child: const Text('See all'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Consumer(
                    builder: (context, ref, _) {
                      final featured = ref.watch(featuredProductsProvider);
                      return featured.when(
                        loading: () => GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 2,
                                childAspectRatio: 0.75,
                                crossAxisSpacing: 12,
                                mainAxisSpacing: 12,
                              ),
                          itemCount: 4,
                          itemBuilder: (_, _) => _PlaceholderProductCard(),
                        ),
                        error: (_, _) => const SizedBox.shrink(),
                        data: (products) => products.isEmpty
                            ? const SizedBox.shrink()
                            : GridView.builder(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                gridDelegate:
                                    const SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: 2,
                                      childAspectRatio: 0.75,
                                      crossAxisSpacing: 12,
                                      mainAxisSpacing: 12,
                                    ),
                                itemCount: products.length,
                                itemBuilder: (_, i) => ProductCard(
                                  product: products[i],
                                  onTap: () =>
                                      context.go('/product/${products[i].id}'),
                                ),
                              ),
                      );
                    },
                  ),
                  const SizedBox(height: 28),

                  // Friendly closing card so the page ends on a helpful note
                  const _HelpFooter(),
                  const SizedBox(height: 80),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryItem {
  final String id;
  final String label;
  final String imgUrl;
  final Color startColor;
  final Color endColor;

  const _CategoryItem({
    required this.id,
    required this.label,
    required this.imgUrl,
    required this.startColor,
    required this.endColor,
  });
}

const _categories = [
  _CategoryItem(
    id: 'Pesticides',
    label: 'Pesticides',
    imgUrl: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFE8F5E9), // emerald-50
    endColor: Color(0xFFC8E6C9),   // emerald-100
  ),
  _CategoryItem(
    id: 'Fertilizers',
    label: 'Fertilizers',
    imgUrl: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFFFF8E1), // amber-50
    endColor: Color(0xFFFFE0B2),   // orange-100
  ),
  _CategoryItem(
    id: 'Herbicides',
    label: 'Herbicides',
    imgUrl: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFFFF1F2), // rose-50
    endColor: Color(0xFFFCE7F3),   // pink-100
  ),
  _CategoryItem(
    id: 'Bio Pesticides',
    label: 'Bio-Stimulants',
    imgUrl: 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFE0F2F1), // teal-50
    endColor: Color(0xFFE0F7FA),   // cyan-100
  ),
  _CategoryItem(
    id: 'Sprayers',
    label: 'Sprayers',
    imgUrl: 'https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFE0F2FE), // sky-50
    endColor: Color(0xFFDBEAFE),   // blue-100
  ),
  _CategoryItem(
    id: 'Seeds',
    label: 'Seeds',
    imgUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFFEFCE8), // yellow-50
    endColor: Color(0xFFFEF3C7),   // amber-100
  ),
  _CategoryItem(
    id: 'Tools',
    label: 'Tools',
    imgUrl: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFF8FAFC), // slate-50
    endColor: Color(0xFFF1F5F9),   // gray-100
  ),
  _CategoryItem(
    id: 'all',
    label: 'View All',
    imgUrl: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFF1F5F9), // slate-100
    endColor: Color(0xFFE2E8F0),   // slate-200
  ),
];

class _CategoryCard extends StatelessWidget {
  final _CategoryItem category;
  final VoidCallback onTap;

  const _CategoryCard({
    required this.category,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [category.startColor, category.endColor],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white, width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 2,
                    offset: const Offset(0, 1),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(22),
                child: CachedNetworkImage(
                  imageUrl: resolveImageUrl(category.imgUrl),
                  fit: BoxFit.cover,
                  memCacheWidth: 200,
                  errorWidget: (context, url, error) => const Icon(
                    Icons.image_not_supported_outlined,
                    size: 20,
                    color: Colors.grey,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              category.label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppTextStyles.caption.copyWith(
                fontSize: 10,
                fontWeight: FontWeight.bold,
                color: AppColors.onSurface,
                height: 1.1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashboardBanner extends StatelessWidget {
  // Paid sellers open the dashboard directly; unpaid sellers are routed to the
  // subscription paywall by the router guard on /dashboard.
  final bool canAccess;
  const _DashboardBanner({required this.canAccess});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.primary, AppColors.primaryLight],
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(
            canAccess ? Icons.dashboard : Icons.workspace_premium,
            color: Colors.white,
            size: 32,
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Your Dashboard',
                  style: AppTextStyles.heading3.copyWith(color: Colors.white),
                ),
                Text(
                  canAccess
                      ? 'Manage inventory & orders'
                      : 'Subscribe to start selling',
                  style: AppTextStyles.bodySmall.copyWith(
                    color: Colors.white70,
                  ),
                ),
              ],
            ),
          ),
          FilledButton(
            onPressed: () => context.go('/dashboard'),
            style: FilledButton.styleFrom(backgroundColor: Colors.white),
            child: Text(
              canAccess ? 'Open' : 'Subscribe',
              style: AppTextStyles.button.copyWith(color: AppColors.primary),
            ),
          ),
        ],
      ),
    );
  }
}

class _BecomeRetailerBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.secondaryContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.secondary.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Text('🏪', style: TextStyle(fontSize: 32)),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Sell on KrishiDukan', style: AppTextStyles.heading3),
                Text(
                  'Reach farmers in your area',
                  style: AppTextStyles.bodySmall,
                ),
              ],
            ),
          ),
          OutlinedButton(
            onPressed: () => context.go('/become-retailer'),
            child: const Text('Start'),
          ),
        ],
      ),
    );
  }
}

class _PlaceholderProductCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 120,
            decoration: BoxDecoration(
              color: AppColors.surfaceVariant,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(12),
              ),
            ),
            child: const Center(
              child: Icon(Icons.grass, size: 48, color: AppColors.primaryLight),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 14,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: AppColors.shimmerBase,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  height: 12,
                  width: 80,
                  decoration: BoxDecoration(
                    color: AppColors.shimmerBase,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 8),
                Text('Loading...', style: AppTextStyles.price),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────── Promo carousel ────────────────────────────────

class _Promo {
  final String title;
  final String subtitle;
  final String cta;
  final IconData icon;
  final List<Color> colors;
  final String route;

  const _Promo({
    required this.title,
    required this.subtitle,
    required this.cta,
    required this.icon,
    required this.colors,
    required this.route,
  });
}

const _promos = <_Promo>[
  _Promo(
    title: 'Best prices on\nfertilizers & seeds',
    subtitle: 'Compare nearby stores and save on every order',
    cta: 'Shop deals',
    icon: Icons.local_offer,
    colors: [AppColors.primary, AppColors.primaryLight],
    route: '/marketplace',
  ),
  _Promo(
    title: '100% genuine\nagri products',
    subtitle: 'Verified sellers, premium-grade inputs for your farm',
    cta: 'Browse catalog',
    icon: Icons.verified,
    colors: [Color(0xFF0E7490), Color(0xFF22D3EE)],
    route: '/marketplace',
  ),
  _Promo(
    title: 'Find a trusted\nstore near you',
    subtitle: 'Locate krishi stores around your village',
    cta: 'Open store locator',
    icon: Icons.storefront,
    colors: [Color(0xFFB45309), Color(0xFFF59E0B)],
    route: '/stores',
  ),
];

class _PromoCarousel extends StatefulWidget {
  const _PromoCarousel();

  @override
  State<_PromoCarousel> createState() => _PromoCarouselState();
}

class _PromoCarouselState extends State<_PromoCarousel> {
  final _controller = PageController(viewportFraction: 0.92);
  Timer? _timer;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !_controller.hasClients) return;
      final next = (_page + 1) % _promos.length;
      _controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeInOut,
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          height: 150,
          child: PageView.builder(
            controller: _controller,
            itemCount: _promos.length,
            onPageChanged: (i) => setState(() => _page = i),
            itemBuilder: (_, i) => _PromoCard(promo: _promos[i]),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(_promos.length, (i) {
            final active = i == _page;
            return AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: active ? 18 : 6,
              height: 6,
              decoration: BoxDecoration(
                color: active ? AppColors.primary : AppColors.divider,
                borderRadius: BorderRadius.circular(3),
              ),
            );
          }),
        ),
      ],
    );
  }
}

class _PromoCard extends StatelessWidget {
  final _Promo promo;
  const _PromoCard({required this.promo});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: GestureDetector(
        onTap: () => context.go(promo.route),
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: promo.colors,
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: promo.colors.first.withValues(alpha: 0.3),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Stack(
            children: [
              Positioned(
                right: -12,
                bottom: -12,
                child: Icon(
                  promo.icon,
                  size: 120,
                  color: Colors.white.withValues(alpha: 0.12),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      promo.title,
                      style: AppTextStyles.heading2.copyWith(
                        color: Colors.white,
                        height: 1.15,
                        fontSize: 20,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      promo.subtitle,
                      style: AppTextStyles.bodySmall.copyWith(
                        color: Colors.white.withValues(alpha: 0.9),
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            promo.cta,
                            style: AppTextStyles.caption.copyWith(
                              color: AppColors.onSurface,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(width: 4),
                          const Icon(Icons.arrow_forward,
                              size: 14, color: AppColors.onSurface),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────── Benefits strip ────────────────────────────────

class _BenefitsStrip extends StatelessWidget {
  const _BenefitsStrip();

  static const _items = <(IconData, String)>[
    (Icons.verified_user_outlined, 'Genuine\nproducts'),
    (Icons.local_offer_outlined, 'Best\nprices'),
    (Icons.local_shipping_outlined, 'Doorstep\ndelivery'),
    (Icons.support_agent_outlined, 'Expert\nsupport'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: AppColors.primaryContainer.withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: _items.map((it) {
          return Expanded(
            child: Column(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(it.$1, color: AppColors.primary, size: 22),
                ),
                const SizedBox(height: 6),
                Text(
                  it.$2,
                  textAlign: TextAlign.center,
                  style: AppTextStyles.caption.copyWith(
                    fontWeight: FontWeight.w700,
                    height: 1.1,
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ─────────────────────────── Top deals rail ────────────────────────────────

class _TopDealsRail extends ConsumerWidget {
  const _TopDealsRail();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dealsAsync = ref.watch(topDealsProvider);
    return dealsAsync.maybeWhen(
      data: (deals) {
        if (deals.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.local_fire_department,
                        color: AppColors.secondary, size: 20),
                    const SizedBox(width: 6),
                    Text('Top Deals', style: AppTextStyles.heading3),
                  ],
                ),
                TextButton(
                  onPressed: () => context.go('/marketplace'),
                  child: const Text('See all'),
                ),
              ],
            ),
            const SizedBox(height: 4),
            SizedBox(
              height: 250,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(vertical: 4),
                itemCount: deals.length,
                separatorBuilder: (_, _) => const SizedBox(width: 12),
                itemBuilder: (_, i) => SizedBox(
                  width: 160,
                  child: ProductCard(
                    product: deals[i],
                    onTap: () => context.go('/product/${deals[i].id}'),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

// ─────────────────────────── Help footer ───────────────────────────────────

class _HelpFooter extends StatelessWidget {
  const _HelpFooter();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primary.withValues(alpha: 0.08), Colors.white],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: AppColors.primaryContainer.withValues(alpha: 0.6),
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.5),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.support_agent, color: AppColors.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Need farming advice?',
                      style: AppTextStyles.bodyMedium
                          .copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Get crop tips, Q&A and expert guidance on Krishi Hubs.',
                      style: AppTextStyles.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => context.go('/hubs'),
              icon: const Icon(Icons.forum_outlined, size: 18),
              label: const Text('Explore Krishi Hubs'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primary,
                side: const BorderSide(color: AppColors.primary),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'KrishiDukan • आपके खेत की हर ज़रूरत',
            style: AppTextStyles.caption
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
