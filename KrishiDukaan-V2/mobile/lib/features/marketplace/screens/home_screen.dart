import 'dart:async';
import 'dart:math';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../core/utils/image_utils.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// StateProvider moved to the legacy export in Riverpod 3.
import 'package:flutter_riverpod/legacy.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/models/home_banner_model.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/services/product_analytics_service.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../../core/widgets/product_card.dart';
import '../../../core/widgets/section_header.dart';
import '../../../core/widgets/shimmer_product_card.dart';
import '../../notifications/notifications.dart';
import '../providers/marketplace_provider.dart';
import '../../reels/providers/reels_provider.dart';
import '../../reels/screens/shop_profile_screen.dart' show StandaloneReelsFeed;
import '../../../core/models/reel_model.dart';
import '../../../core/utils/format_count.dart';

/// Re-rolled on every pull-to-refresh so Home's two reel rails show a
/// different pick each time. Lives at module level so BOTH rails read the
/// same value — they shuffle one shared list with it and then take disjoint
/// slices, which is what guarantees a reel never shows up in both sections.
final homeReelsShuffleProvider =
    StateProvider<int>((ref) => DateTime.now().millisecondsSinceEpoch);

/// The slice of the feed one reel rail shows: shuffle the whole feed with
/// [seed], then take 4 starting at [skipCount]. Both rails call this with the
/// same list and seed but different offsets (0 and 4), so their results are
/// disjoint by construction — that's what keeps the same reel out of both
/// sections. Generic so the invariant can be unit-tested without building
/// ReelModels.
@visibleForTesting
List<T> homeRailSlice<T>(List<T> feed, int seed, int skipCount) {
  final shuffled = [...feed]..shuffle(Random(seed));
  return shuffled.skip(skipCount).take(4).toList();
}

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

  /// Pull-to-refresh. Re-rolls the reel shuffle and refetches what Home
  /// renders, awaiting the new futures so the spinner stays up until the
  /// fresh data has actually landed instead of snapping away instantly.
  Future<void> _refresh(WidgetRef ref) async {
    ref.read(homeReelsShuffleProvider.notifier).state =
        DateTime.now().millisecondsSinceEpoch;
    ref.invalidate(reelsFeedProvider);
    ref.invalidate(rawHomeRailProductsProvider);
    try {
      await Future.wait([
        ref.read(reelsFeedProvider.future),
        ref.read(rawHomeRailProductsProvider.future),
      ]);
    } catch (_) {
      // Each rail renders its own empty/error state — a failed refetch should
      // just end the spinner, not throw out of the refresh gesture.
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => _refresh(ref),
        child: CustomScrollView(
        // Always scrollable so the pull gesture still works on a short page.
        physics: const AlwaysScrollableScrollPhysics(),
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

                  // Latest Reels (Added horizontally before trending)
                  const _ReelsRail(),

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
                        return _ProductRail(products: products);
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
                        return _ProductRail(products: products);
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

                  // More Reels at the bottom
                  const _ReelsRail(skipCount: 4, title: 'More Reels'),
                  
                  // Friendly closing card so the page ends on a helpful note
                  const _HelpFooter(),
                  const SizedBox(height: 80),
                ],
              ),
            ),
          ),
        ],
        ),
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
            // Paying for seats on /subscription is what upgrades a consumer to
            // retailer (subscription_screen.dart); /become-retailer was never
            // an app route, so this button opened go_router's error page.
            onPressed: () => context.push('/subscription'),
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
  /// Button label; empty hides the button (image-only admin banners).
  final String cta;
  final String image; // background photo
  /// Tint painted over the photo, left to right. Null = no overlay.
  final List<Color>? colors;
  /// Optional product image shown on the right (admin banners only).
  final String? foreground;
  /// `app` — [route] is an app route; `internal` — a website route from
  /// Admin > Banners, mapped by [_openPromo]; `external` — a full URL.
  final String linkType;
  final String route;

  const _Promo({
    required this.title,
    required this.subtitle,
    required this.cta,
    required this.image,
    required this.colors,
    this.foreground,
    this.linkType = 'app',
    required this.route,
  });

  factory _Promo.fromBanner(HomeBannerModel b) => _Promo(
        title: b.title,
        subtitle: b.subtitle,
        cta: b.ctaEnabled ? b.ctaLabel : '',
        image: b.image,
        colors: b.overlay,
        foreground: b.foregroundImage,
        linkType: b.linkType,
        route: b.linkValue,
      );
}

// Fallback only — shown when Admin > Banners has no published banners (or
// they can't be loaded), so the home screen never opens on an empty hero.
final _defaultPromos = <_Promo>[
  _Promo(
    title: 'Best prices on\nfertilizers & seeds',
    subtitle: 'Compare nearby stores and save on every order',
    cta: 'Shop deals',
    image:
        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=800&q=80',
    colors: [
      AppColors.primary.withValues(alpha: 0.92),
      AppColors.primaryLight.withValues(alpha: 0.45),
    ],
    route: '/marketplace',
  ),
  _Promo(
    title: '100% genuine\nagri products',
    subtitle: 'Verified sellers, premium-grade inputs for your farm',
    cta: 'Browse catalog',
    image:
        'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=800&q=80',
    colors: [
      const Color(0xFF0E7490).withValues(alpha: 0.92),
      const Color(0xFF22D3EE).withValues(alpha: 0.45),
    ],
    route: '/marketplace',
  ),
  _Promo(
    title: 'Find a trusted\nstore near you',
    subtitle: 'Locate krishi stores around your village',
    cta: 'Open store locator',
    image:
        'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=800&q=80',
    colors: [
      const Color(0xFFB45309).withValues(alpha: 0.92),
      const Color(0xFFF59E0B).withValues(alpha: 0.45),
    ],
    route: '/stores',
  ),
];

/// Bottom-nav tabs — reached with go() so the shell switches tab; every
/// other route is pushed so Back returns to Home.
const _tabRoutes = {'/', '/marketplace', '/hubs', '/stores', '/reels'};

/// Opens a banner's link. Admin > Banners stores WEBSITE routes (`/market`,
/// `/hub/{id}`, …, see navigateToRoute in app/page.tsx); they are mapped to
/// the app's own screens here. A route the app has no screen for opens on
/// the website rather than dead-ending the tap.
Future<void> _openPromo(BuildContext context, WidgetRef ref, _Promo p) async {
  final value = p.route.trim();
  if (value.isEmpty) return;

  Future<void> openWeb(Uri uri) async {
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {}
  }

  if (p.linkType == 'external') {
    final uri = Uri.tryParse(value);
    if (uri != null && uri.hasScheme) await openWeb(uri);
    return;
  }

  String? appRoute;
  if (p.linkType == 'app') {
    appRoute = value;
  } else {
    final uri = Uri.parse(value.startsWith('/') ? value : '/$value');
    final seg = uri.pathSegments;
    final id = seg.length > 1 ? seg[1] : null;
    final loggedIn = ref.read(currentUserProvider).value != null;
    switch (seg.isEmpty ? '' : seg[0]) {
      case '':
        appRoute = '/';
      case 'market':
      case 'marketplace':
        final category = uri.queryParameters['category'];
        appRoute = category != null && category.isNotEmpty
            ? '/marketplace?category=${Uri.encodeComponent(category)}'
            : '/marketplace';
      case 'hub':
      case 'hubs':
        appRoute = id != null ? '/hubs/$id' : '/hubs';
      case 'product':
      case 'products':
        if (id != null) appRoute = '/product/$id';
      case 'brand':
        if (id != null) appRoute = '/brand/$id';
      case 'stores':
      case 'map':
        appRoute = '/stores';
      case 'reels':
        appRoute = '/reels';
      case 'cart':
        appRoute = '/cart';
      // The web's "become a seller" banners link to /login (sign-up picks
      // the role there). A signed-in user is past that step: in the app,
      // buying seats is what turns them into a seller.
      case 'become-retailer':
      case 'sell':
      case 'subscription':
      case 'login':
        appRoute = loggedIn ? '/subscription' : '/login';
    }
    if (appRoute == null) {
      await openWeb(Uri.parse('${AppConfig.apiBaseUrl}${uri.toString()}'));
      return;
    }
  }

  if (!context.mounted) return;
  final path = Uri.parse(appRoute).path;
  if (_tabRoutes.contains(path)) {
    context.go(appRoute);
  } else {
    context.push(appRoute);
  }
}

class _PromoCarousel extends ConsumerStatefulWidget {
  const _PromoCarousel();

  @override
  ConsumerState<_PromoCarousel> createState() => _PromoCarouselState();
}

class _PromoCarouselState extends ConsumerState<_PromoCarousel> {
  final _controller = PageController(viewportFraction: 0.92);
  Timer? _timer;
  int _page = 0;
  int _count = 0;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !_controller.hasClients || _count < 2) return;
      final next = (_page + 1) % _count;
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
    final bannersAsync = ref.watch(homeBannersProvider);
    // Admin banners once any are live; the built-in slides otherwise (none
    // published, or the read failed). While the first read is in flight a
    // plain card holds the space, so the defaults don't flash and get swapped.
    final List<_Promo>? promos = bannersAsync.when(
      data: (b) => b.isEmpty ? _defaultPromos : b.map(_Promo.fromBanner).toList(),
      error: (_, _) => _defaultPromos,
      loading: () => null,
    );
    _count = promos?.length ?? 0;
    if (_page >= _count && _count > 0) _page = 0;

    return LayoutBuilder(
      builder: (context, constraints) {
        // Responsive hero height instead of a flat 150px — that read as
        // uniformly thin on wider/taller phones (notably iPhones, where the
        // fixed height looked especially cramped next to the rest of the
        // page). Scales with the available width, clamped to a sane range.
        final cardHeight = (constraints.maxWidth * 0.55).clamp(190.0, 230.0);
        if (promos == null) {
          return Column(
            children: [
              Container(
                height: cardHeight,
                margin: EdgeInsets.symmetric(
                    horizontal: constraints.maxWidth * 0.04 + 4),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
              const SizedBox(height: 16),
            ],
          );
        }
        return Column(
          children: [
            SizedBox(
              height: cardHeight,
              child: PageView.builder(
                controller: _controller,
                itemCount: promos.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (_, i) => _PromoCard(
                  promo: promos[i],
                  onTap: () => _openPromo(context, ref, promos[i]),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(promos.length, (i) {
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
  final VoidCallback onTap;
  const _PromoCard({required this.promo, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final base = promo.colors?.first.withValues(alpha: 1) ?? AppColors.primary;
    final hasTitle = promo.title.isNotEmpty;
    final hasSubtitle = promo.subtitle.isNotEmpty;
    final hasCta = promo.cta.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: GestureDetector(
        // The whole card follows the link, not just the button — image-only
        // banners have no button at all.
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            // Solid base = fallback colour shown while/if the photo can't load.
            color: base,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: base.withValues(alpha: 0.3),
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
                  memCacheWidth: 1000,
                  fadeInDuration: const Duration(milliseconds: 250),
                  placeholder: (_, _) => _tintGradient(),
                  errorWidget: (_, _, _) => _tintGradient(),
                ),
                // Tint so the white text stays readable over any photo
                // (strongest on the left where the text sits).
                _tintGradient(),
                if (promo.foreground != null)
                  Positioned(
                    right: 12,
                    top: 16,
                    bottom: 16,
                    width: 120,
                    child: CachedNetworkImage(
                      imageUrl: resolveImageUrl(promo.foreground!),
                      fit: BoxFit.contain,
                      memCacheWidth: 400,
                      errorWidget: (_, _, _) => const SizedBox.shrink(),
                    ),
                  ),
                Padding(
                  padding: EdgeInsets.fromLTRB(
                      20, 20, promo.foreground != null ? 140 : 20, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (hasTitle)
                        Text(
                          promo.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppTextStyles.heading1.copyWith(
                            color: Colors.white,
                            height: 1.15,
                            fontSize: 24,
                            shadows: const [
                              Shadow(color: Colors.black45, blurRadius: 6),
                            ],
                          ),
                        ),
                      if (hasTitle && hasSubtitle) const SizedBox(height: 8),
                      if (hasSubtitle)
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
                      if (hasCta)
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
                              Flexible(
                                child: Text(
                                  promo.cta,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppTextStyles.bodyMedium.copyWith(
                                    color: AppColors.onSurface,
                                    fontWeight: FontWeight.w800,
                                  ),
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

  Widget _tintGradient() {
    final colors = promo.colors;
    if (colors == null || colors.isEmpty) return const SizedBox.shrink();
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: colors.length == 1 ? [colors.first, colors.first] : colors,
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
            SectionHeader(
              title: 'Top Deals',
              icon: Icons.local_fire_department,
              iconColor: AppColors.secondary,
              actionLabel: 'See all',
              onAction: () => context.go('/marketplace'),
            ),
            const SizedBox(height: 4),
            // Already a rail — routed through _ProductRail so its cards report
            // impressions like every other Home section.
            _ProductRail(products: deals),
            const SizedBox(height: 24),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

// ─────────────────────────── Product Rail ──────────────────────────────────

/// Horizontal, side-scrolling row of products used by every product section
/// on Home.
///
/// These sections used to be 3-column vertical grids capped at 3 items, so 7
/// of the 10 products each provider already returned were simply discarded and
/// never seen by a shopper — and never counted as a view for the seller. A
/// rail shows all 10 in the same vertical space.
///
/// Each card reports an impression the first time it is BUILT, which for a
/// lazy ListView means the first time it actually scrolls into view — a
/// product sitting off the right edge is not counted until the shopper
/// reaches it. Dedup + batching live in ProductAnalyticsService.
class _ProductRail extends StatelessWidget {
  final List<CatalogModel> products;

  const _ProductRail({required this.products});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 250,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(vertical: 4),
        itemCount: products.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (_, i) => SizedBox(
          width: 160,
          child: _TrackedProductCard(
            product: products[i],
            // 1-based, matching web's trackProductImpression(p.id, index + 1)
            // so positionSum/avg-position means the same thing on both.
            position: i + 1,
          ),
        ),
      ),
    );
  }
}

/// A [ProductCard] that reports one impression when it first appears.
///
/// Stateful purely so the report fires once per mounted card in initState
/// rather than on every rebuild; the service also dedups per session, so a
/// rebuild or a scroll back and forth cannot double-count.
class _TrackedProductCard extends StatefulWidget {
  final CatalogModel product;
  final int position;

  const _TrackedProductCard({required this.product, required this.position});

  @override
  State<_TrackedProductCard> createState() => _TrackedProductCardState();
}

class _TrackedProductCardState extends State<_TrackedProductCard> {
  @override
  void initState() {
    super.initState();
    ProductAnalyticsService.instance
        .recordImpression(widget.product.id, position: widget.position);
  }

  @override
  Widget build(BuildContext context) {
    return ProductCard(
      product: widget.product,
      onTap: () => context.push('/product/${widget.product.id}'),
    );
  }
}

// ─────────────────────────── Reels Rail ────────────────────────────────────

class _ReelsRail extends ConsumerWidget {
  final int skipCount;
  final String title;

  const _ReelsRail({
    this.skipCount = 0,
    this.title = 'Latest Reels',
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reelsAsync = ref.watch(reelsFeedProvider);
    final shuffleSeed = ref.watch(homeReelsShuffleProvider);
    return reelsAsync.maybeWhen(
      data: (reels) {
        if (reels.isEmpty) return const SizedBox.shrink();

        // Both rails shuffle the SAME feed with the SAME seed and then take
        // disjoint windows out of it — [0..4) up top, [4..8) at the bottom —
        // so a reel can never land in both sections. The old code took the
        // feed's first 4 for the top rail (so it never changed at all) and
        // shuffled the rest with a seed derived from the feed's contents (so
        // it never changed either), and when fewer than 5 reels existed the
        // bottom rail re-shuffled the whole list and repeated the top four.
        //
        // The seed only moves on pull-to-refresh, so the cards stay put while
        // the page is scrolled: an unseeded shuffle re-rolled on every
        // rebuild, and a tapped thumbnail then opened a different reel than
        // the one it was showing.
        final displayReels = homeRailSlice(reels, shuffleSeed, skipCount);

        if (displayReels.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionHeader(
              title: title,
              icon: Icons.play_circle_fill_rounded,
              iconColor: AppColors.primary,
              actionLabel: 'See all',
              onAction: () {
                ref.invalidate(reelsFeedProvider);
                // Was a bare navigate to the reels feed — the same tap in the
                // Reels tab's own search icon opens a "Explore Reels" search
                // sheet on top of the feed, but "See all" skipped straight
                // past that discovery step. Fresh token per tap (see
                // ReelsFeedScreen.searchToken) so a second tap re-opens it
                // even if the reels tab was already visited this session.
                context.go(
                  '/reels?search=${DateTime.now().millisecondsSinceEpoch}',
                );
              },
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 200,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 4),
                itemCount: displayReels.length,
                separatorBuilder: (_, _) => const SizedBox(width: 12),
                itemBuilder: (_, i) => SizedBox(
                  width: 120,
                  child: _ReelRailCard(reel: displayReels[i], allReels: reels),
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

/// A reel's poster: its own thumbnail, else the image of the product it
/// links to. Null when neither exists, so the caller can skip the image
/// entirely rather than request an empty URL.
String? _reelThumb(ReelModel reel) {
  final thumb = reel.thumbnailUrl;
  if (thumb != null && thumb.isNotEmpty) return thumb;
  final product = reel.linkedProductImageUrl;
  if (product != null && product.isNotEmpty) return product;
  return null;
}

class _ReelRailCard extends ConsumerWidget {
  final ReelModel reel;

  /// The rail's full (ranked) list — the fullscreen feed opens over it at the
  /// tapped reel's position, so the reel shown is exactly the thumbnail
  /// tapped. Routing through the /reels tab instead was racy: the tab's feed
  /// re-ranks on open, so it frequently started on a different reel.
  final List<ReelModel> allReels;

  const _ReelRailCard({required this.reel, required this.allReels});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () {
        final index = allReels.indexWhere((r) => r.id == reel.id);
        final user = ref.read(currentUserProvider).value;
        Navigator.of(context, rootNavigator: true).push(
          MaterialPageRoute(
            fullscreenDialog: true,
            builder: (_) => ProviderScope(
              child: StandaloneReelsFeed(
                reels: allReels,
                initialIndex: index < 0 ? 0 : index,
                currentUserId: user?.phone,
                currentUserName: user?.businessName ?? user?.name ?? '',
              ),
            ),
          ),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          gradient: const LinearGradient(
            colors: [AppColors.primaryDark, AppColors.primary],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Falls back to the linked product image the way the reels feed
            // already does (reels_feed_screen.dart). Reels uploaded before
            // server-side poster generation shipped carry no thumbnailUrl, and
            // without a fallback those cards render as a bare gradient.
            if (_reelThumb(reel) != null) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: CachedNetworkImage(
                  imageUrl: resolveImageUrl(_reelThumb(reel)),
                  fit: BoxFit.cover,
                  errorWidget: (context, url, error) => const SizedBox.shrink(),
                ),
              ),
              Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: Colors.black.withValues(alpha: 0.3),
                ),
              ),
            ],
            const Center(
              child: Icon(
                Icons.play_circle_outline_rounded,
                color: Colors.white70,
                size: 32,
              ),
            ),
            Positioned(
              left: 8,
              right: 8,
              bottom: 8,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (reel.caption.isNotEmpty)
                    Text(
                      reel.caption,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        shadows: [Shadow(color: Colors.black87, blurRadius: 4)],
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.remove_red_eye_rounded, size: 10, color: Colors.white70),
                      const SizedBox(width: 4),
                      Text(
                        formatCount(reel.viewsCount),
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 9,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
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
