import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
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
            title: Row(
              children: [
                const Icon(Icons.grass, color: Colors.white),
                const SizedBox(width: 8),
                Text(
                  'KrishiDukaan',
                  style: AppTextStyles.heading2.copyWith(color: Colors.white),
                ),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.search, color: Colors.white),
                onPressed: () => context.go('/marketplace'),
              ),
              IconButton(
                icon: const Icon(Icons.notifications_outlined, color: Colors.white),
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
                    style: AppTextStyles.body
                        .copyWith(color: AppColors.onSurfaceVariant),
                  ),
                  const SizedBox(height: 20),

                  // Search bar
                  GestureDetector(
                    onTap: () => context.go('/marketplace'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.divider),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.cardShadow,
                            blurRadius: 4,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.search,
                              color: AppColors.onSurfaceVariant),
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
                  const SizedBox(height: 24),

                  // Category chips
                  Text('Browse by Category', style: AppTextStyles.heading3),
                  const SizedBox(height: 12),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: _categories.map((cat) {
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: _CategoryChip(
                            label: cat['label']!,
                            emoji: cat['emoji']!,
                            onTap: () => context.go('/marketplace'),
                          ),
                        );
                      }).toList(),
                    ),
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
                                  onTap: () => context
                                      .go('/product/${products[i].id}'),
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

const _categories = [
  {'label': 'Fertilizers', 'emoji': '🌿'},
  {'label': 'Seeds', 'emoji': '🌾'},
  {'label': 'Pesticides', 'emoji': '🪲'},
  {'label': 'Irrigation', 'emoji': '💧'},
  {'label': 'Tools', 'emoji': '🔧'},
  {'label': 'Organic', 'emoji': '🌱'},
];

class _CategoryChip extends StatelessWidget {
  final String label;
  final String emoji;
  final VoidCallback onTap;

  const _CategoryChip({
    required this.label,
    required this.emoji,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.primaryContainer.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.primaryContainer),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 16)),
            const SizedBox(width: 6),
            Text(label, style: AppTextStyles.bodyMedium),
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
                Text('Your Dashboard',
                    style: AppTextStyles.heading3
                        .copyWith(color: Colors.white)),
                Text('Manage inventory & orders',
                    style: AppTextStyles.bodySmall
                        .copyWith(color: Colors.white70)),
              ],
            ),
          ),
          FilledButton(
            onPressed: () => context.go('/dashboard'),
            style: FilledButton.styleFrom(backgroundColor: Colors.white),
            child: Text('Open',
                style: AppTextStyles.button
                    .copyWith(color: AppColors.primary)),
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
                Text('Sell on KrishiDukaan',
                    style: AppTextStyles.heading3),
                Text('Reach farmers in your area',
                    style: AppTextStyles.bodySmall),
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
              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
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
                Text(
                  'Loading...',
                  style: AppTextStyles.price,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
