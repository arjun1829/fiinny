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
import '../../../core/widgets/section_header.dart';
import '../../../core/widgets/shimmer_product_card.dart';
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

  /// Time-of-day greeting makes the first line feel personal instead of a
  /// static template — small touch, disproportionate warmth.
  static (String, String) _greetingFor(DateTime now) {
    final h = now.hour;
    if (h < 12) return ('Good morning', '🌱');
    if (h < 17) return ('Good afternoon', '☀️');
    return ('Good evening', '🌾');
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
            scrolledUnderElevation: 4,
            shadowColor: const Color(0x22000000),
            surfaceTintColor: Colors.transparent,
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(18)),
            ),
            backgroundColor: Colors.transparent,
            clipBehavior: Clip.antiAlias,
            flexibleSpace: const TopBarBackdrop(),
            foregroundColor: AppColors.onSurface,
            systemOverlayStyle: topBarOverlayStyle,
            title: const TopBarTitle(title: 'KrishiDukan'),
            actions: [
              TopBarAction(
                icon: Icons.search,
                tooltip: 'Search products',
                onPressed: () => _openSearch(context),
              ),
              const NotificationBell(),
              TopBarAction(
                icon: Icons.person_outline,
                tooltip: 'Profile',
                onPressed: () => context.push('/profile'),
              ),
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
                    data: (user) {
                      final (greeting, emoji) = _greetingFor(DateTime.now());
                      return Text(
                        user != null
                            ? '$greeting, ${user.name.split(' ').first} $emoji'
                            : 'Welcome to KrishiDukan 🌱',
                        style: AppTextStyles.heading2.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.3,
                        ),
                      );
                    },
                    loading: () => const SizedBox(
                      height: 24,
                      width: 180,
                      child: LinearProgressIndicator(),
                    ),
                    error: (_, _) => Text(
                      'Welcome to KrishiDukan 🌱',
                      style: AppTextStyles.heading2.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                      ),
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

                  // Rotating promo banners — gives the page a lively hero strip
                  const _PromoCarousel(),
                  const SizedBox(height: 24),

                  // Trending Near You
                  SectionHeader(
                    title: 'Trending Near You',
                    icon: Icons.trending_up_rounded,
                    actionLabel: 'See all',
                    onAction: () => context.go('/marketplace'),
                  ),
                  const SizedBox(height: 12),
                  Consumer(
                    builder: (context, ref, _) {
                      final trending = ref.watch(trendingProductsProvider);
                      final products = trending.value;
                      if (products != null && products.isNotEmpty) {
                        return GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 3,
                                childAspectRatio: 0.54,
                                crossAxisSpacing: 12,
                                mainAxisSpacing: 12,
                              ),
                          itemCount: products.length > 3 ? 3 : products.length,
                          itemBuilder: (_, i) => ProductCard(
                            product: products[i],
                            onTap: () =>
                                context.push('/product/${products[i].id}'),
                          ),
                        );
                      }
                      if (trending.isLoading) {
                        return const ShimmerProductGrid(
                          itemCount: 3,
                          padding: EdgeInsets.zero,
                        );
                      }
                      return const SizedBox.shrink();
                    },
                  ),
                  const SizedBox(height: 28),

                  // Category cards grid
                  const SectionHeader(
                    title: 'Shop by Category',
                    icon: Icons.grid_view_rounded,
                  ),
                  const SizedBox(height: 12),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
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
                  SectionHeader(
                    title: 'Featured Products',
                    icon: Icons.auto_awesome_rounded,
                    iconColor: AppColors.secondary,
                    actionLabel: 'See all',
                    onAction: () => context.go('/marketplace'),
                  ),
                  const SizedBox(height: 12),
                  Consumer(
                    builder: (context, ref, _) {
                      final featured = ref.watch(featuredProductsProvider);
                      final products = featured.value;
                      if (products != null && products.isNotEmpty) {
                        return GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 3,
                                childAspectRatio: 0.54,
                                crossAxisSpacing: 12,
                                mainAxisSpacing: 12,
                              ),
                          itemCount: products.length > 3 ? 3 : products.length,
                          itemBuilder: (_, i) => ProductCard(
                            product: products[i],
                            onTap: () =>
                                context.push('/product/${products[i].id}'),
                          ),
                        );
                      }
                      if (featured.isLoading) {
                        return const ShimmerProductGrid(
                          itemCount: 3,
                          padding: EdgeInsets.zero,
                        );
                      }
                      return const SizedBox.shrink();
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
    imgUrl:
        'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFE8F5E9), // emerald-50
    endColor: Color(0xFFC8E6C9), // emerald-100
  ),
  _CategoryItem(
    id: 'Fertilizers',
    label: 'Fertilizers',
    imgUrl:
        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFFFF8E1), // amber-50
    endColor: Color(0xFFFFE0B2), // orange-100
  ),
  _CategoryItem(
    id: 'Herbicides',
    label: 'Herbicides',
    imgUrl:
        'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFFFF1F2), // rose-50
    endColor: Color(0xFFFCE7F3), // pink-100
  ),
  _CategoryItem(
    id: 'Bio Pesticides',
    label: 'Bio-Stimulants',
    imgUrl:
        'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFE0F2F1), // teal-50
    endColor: Color(0xFFE0F7FA), // cyan-100
  ),
  _CategoryItem(
    id: 'Sprayers',
    label: 'Sprayers',
    imgUrl:
        'https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFE0F2FE), // sky-50
    endColor: Color(0xFFDBEAFE), // blue-100
  ),
  _CategoryItem(
    id: 'Seeds',
    label: 'Seeds',
    imgUrl:
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFFEFCE8), // yellow-50
    endColor: Color(0xFFFEF3C7), // amber-100
  ),
  _CategoryItem(
    id: 'Tools',
    label: 'Tools',
    imgUrl:
        'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFF8FAFC), // slate-50
    endColor: Color(0xFFF1F5F9), // gray-100
  ),
  _CategoryItem(
    id: 'all',
    label: 'View All',
    imgUrl:
        'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=120&h=120&q=80',
    startColor: Color(0xFFF1F5F9), // slate-100
    endColor: Color(0xFFE2E8F0), // slate-200
  ),
];

class _CategoryCard extends StatefulWidget {
  final _CategoryItem category;
  final VoidCallback onTap;

  const _CategoryCard({required this.category, required this.onTap});

  @override
  State<_CategoryCard> createState() => _CategoryCardState();
}

class _CategoryCardState extends State<_CategoryCard> {
  bool _pressed = false;

  _CategoryItem get category => widget.category;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.93 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
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
                    fit: BoxFit.contain,
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
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: AppColors.onSurface,
                  height: 1.1,
                ),
              ),
            ],
          ),
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

// ─────────────────────────── Promo carousel ────────────────────────────────

class _Promo {
  final String title;
  final String subtitle;
  final String cta;
  final String image; // background photo
  final List<Color> colors; // brand tint painted over the photo (+ fallback)
  final String route;

  const _Promo({
    required this.title,
    required this.subtitle,
    required this.cta,
    required this.image,
    required this.colors,
    required this.route,
  });
}

// Banner photos are easy to swap — just change the `image` URL. The `colors`
// tint keeps the white text readable over any photo and acts as the fallback
// if the image fails to load.
const _promos = <_Promo>[
  _Promo(
    title: 'Best prices on\nfertilizers & seeds',
    subtitle: 'Compare nearby stores and save on every order',
    cta: 'Shop deals',
    image:
        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=800&q=80',
    colors: [AppColors.primary, AppColors.primaryLight],
    route: '/marketplace',
  ),
  _Promo(
    title: '100% genuine\nagri products',
    subtitle: 'Verified sellers, premium-grade inputs for your farm',
    cta: 'Browse catalog',
    image:
        'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=800&q=80',
    colors: [Color(0xFF0E7490), Color(0xFF22D3EE)],
    route: '/marketplace',
  ),
  _Promo(
    title: 'Find a trusted\nstore near you',
    subtitle: 'Locate krishi stores around your village',
    cta: 'Open store locator',
    image:
        'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=800&q=80',
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
    return LayoutBuilder(
      builder: (context, constraints) {
        // Responsive hero height instead of a flat 150px — that read as
        // uniformly thin on wider/taller phones (notably iPhones, where the
        // fixed height looked especially cramped next to the rest of the
        // page). Scales with the available width, clamped to a sane range.
        final cardHeight = (constraints.maxWidth * 0.55).clamp(190.0, 230.0);
        return Column(
          children: [
            SizedBox(
              height: cardHeight,
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
      },
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
            // Solid base = fallback colour shown while/if the photo can't load.
            color: promo.colors.first,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: promo.colors.first.withValues(alpha: 0.3),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Stack(
              fit: StackFit.expand,
              children: [
                // Real photo background
                CachedNetworkImage(
                  imageUrl: resolveImageUrl(promo.image),
                  fit: BoxFit.cover,
                  memCacheWidth: 800,
                  fadeInDuration: const Duration(milliseconds: 250),
                  placeholder: (_, _) => _tintGradient(),
                  errorWidget: (_, _, _) => _tintGradient(),
                ),
                // Brand-coloured tint so the white text stays readable over
                // any photo (strongest on the left where the text sits).
                _tintGradient(),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        promo.title,
                        style: AppTextStyles.heading1.copyWith(
                          color: Colors.white,
                          height: 1.15,
                          fontSize: 24,
                          shadows: const [
                            Shadow(color: Colors.black45, blurRadius: 6),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        promo.subtitle,
                        style: AppTextStyles.bodyMedium.copyWith(
                          color: Colors.white.withValues(alpha: 0.95),
                          shadows: const [
                            Shadow(color: Colors.black38, blurRadius: 5),
                          ],
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      // Pushes the CTA to the bottom so the extra hero height
                      // reads as deliberate whitespace, not empty padding.
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 9,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(22),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              promo.cta,
                              style: AppTextStyles.bodyMedium.copyWith(
                                color: AppColors.onSurface,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Icon(
                              Icons.arrow_forward,
                              size: 16,
                              color: AppColors.onSurface,
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
        ),
      ),
    );
  }

  Widget _tintGradient() => DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          promo.colors.first.withValues(alpha: 0.92),
          promo.colors.last.withValues(alpha: 0.45),
        ],
      ),
    ),
  );
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
            SectionHeader(
              title: 'Top Deals',
              icon: Icons.local_fire_department,
              iconColor: AppColors.secondary,
              actionLabel: 'See all',
              onAction: () => context.go('/marketplace'),
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
                    onTap: () => context.push('/product/${deals[i].id}'),
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
                child: const Icon(
                  Icons.support_agent,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Need farming advice?',
                      style: AppTextStyles.bodyMedium.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
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
            style: AppTextStyles.caption.copyWith(
              color: AppColors.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
