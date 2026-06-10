import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/providers/location_provider.dart';
import '../../../core/widgets/app_brand_icon.dart';
import '../../../core/widgets/product_card.dart';
import '../providers/marketplace_provider.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            floating: true,
            backgroundColor: AppColors.primary,
            titleSpacing: 16,
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    const AppBrandIcon(size: 28),
                    const SizedBox(width: 8),
                    Text(
                      'KrishiDukaan',
                      style: AppTextStyles.heading2.copyWith(color: Colors.white, fontSize: 18),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.only(left: 36),
                  child: GestureDetector(
                    onTap: () {
                      ref.invalidate(locationProvider);
                    },
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.location_on,
                          size: 12,
                          color: AppColors.secondary,
                        ),
                        const SizedBox(width: 2),
                        Flexible(
                          child: ref.watch(locationNameProvider).when(
                            data: (loc) => Text(
                              loc,
                              style: const TextStyle(
                                fontSize: 11,
                                color: Colors.white70,
                                fontWeight: FontWeight.w500,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            loading: () => const Text(
                              'Detecting location...',
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.white70,
                              ),
                            ),
                            error: (_, __) => const Text(
                              'Tap to retry location',
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.white70,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.search, color: Colors.white),
                onPressed: () => context.go('/marketplace'),
              ),
              IconButton(
                icon: const Icon(
                  Icons.notifications_outlined,
                  color: Colors.white,
                ),
                onPressed: () {},
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
                    data: (user) => Text(
                      user != null
                          ? 'Hello, ${user.name.split(' ').first}! 👋'
                          : 'Welcome to KrishiDukaan',
                      style: AppTextStyles.heading2,
                    ),
                    loading: () => const SizedBox(
                      height: 24,
                      width: 180,
                      child: LinearProgressIndicator(),
                    ),
                    error: (_, _) => Text(
                      'Welcome to KrishiDukaan',
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
                            onTap: () => context.go('/marketplace'),
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
                  const SizedBox(height: 28),

                  // Dashboard CTA for retailers
                  userAsync.maybeWhen(
                    data: (user) {
                      if (user != null && user.canAccessDashboard) {
                        return _DashboardBanner();
                      }
                      if (user != null && user.isConsumer) {
                        return _BecomeRetailerBanner();
                      }
                      return const SizedBox.shrink();
                    },
                    orElse: () => const SizedBox.shrink(),
                  ),

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
                child: Image.network(
                  category.imgUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => const Icon(
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
          const Icon(Icons.dashboard, color: Colors.white, size: 32),
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
                  'Manage inventory & orders',
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
              'Open',
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
                Text('Sell on KrishiDukaan', style: AppTextStyles.heading3),
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
