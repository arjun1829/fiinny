import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../providers/dashboard_provider.dart';
import '../../manufacturer/providers/manufacturer_provider.dart';

class DashboardHomeScreen extends ConsumerWidget {
  const DashboardHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);

    return userAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, _) => const Scaffold(
          body: Center(child: Text('Failed to load profile.'))),
      data: (user) {
        if (user == null) {
          return const Scaffold(
              body: Center(child: Text('Not logged in.')));
        }
        final isManufacturer = ref.watch(isManufacturerProvider);
        return _DashboardBody(
          sellerPhone: user.phone,
          sellerName: user.name,
          isManufacturer: isManufacturer,
        );
      },
    );
  }
}

class _DashboardBody extends ConsumerWidget {
  final String sellerPhone;
  final String sellerName;
  final bool isManufacturer;
  const _DashboardBody({
    required this.sellerPhone,
    required this.sellerName,
    required this.isManufacturer,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(dashboardStatsProvider(sellerPhone));
    final analyticsAsync = isManufacturer
        ? ref.watch(manufacturerAnalyticsProvider(sellerPhone))
        : null;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Dashboard',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline, color: Colors.white),
            onPressed: () => context.go('/profile'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dashboardStatsProvider(sellerPhone));
          if (isManufacturer) {
            ref.invalidate(manufacturerAnalyticsProvider(sellerPhone));
          }
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Greeting
            Text('Hello, ${sellerName.split(' ').first}!',
                style: AppTextStyles.heading2),
            Text('Manage your store',
                style: AppTextStyles.body
                    .copyWith(color: AppColors.onSurfaceVariant)),
            const SizedBox(height: 20),

            // Stats grid — manufacturers see catalog/retailer counts; retailers see listings/orders
            if (isManufacturer && analyticsAsync != null)
              analyticsAsync.when(
                loading: () => _StatsShimmer(),
                error: (_, _) => const SizedBox.shrink(),
                data: (analytics) => statsAsync.when(
                  loading: () => _StatsShimmer(),
                  error: (_, _) => const SizedBox.shrink(),
                  data: (stats) => GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.6,
                    children: [
                      _StatCard(
                        label: 'Catalog Products',
                        value: '${analytics['catalogProducts'] ?? 0}',
                        icon: Icons.inventory_2_outlined,
                        color: AppColors.primary,
                      ),
                      _StatCard(
                        label: 'Active Retailers',
                        value: '${analytics['activeRetailers'] ?? 0}',
                        icon: Icons.store_outlined,
                        color: AppColors.success,
                      ),
                      _StatCard(
                        label: 'Pending Orders',
                        value: '${stats['pendingOrders'] ?? 0}',
                        icon: Icons.pending_outlined,
                        color: AppColors.secondary,
                      ),
                      _StatCard(
                        label: 'Total Orders',
                        value: '${stats['totalOrders'] ?? 0}',
                        icon: Icons.receipt_long_outlined,
                        color: AppColors.info,
                      ),
                    ],
                  ),
                ),
              )
            else
              statsAsync.when(
                loading: () => _StatsShimmer(),
                error: (_, _) => const SizedBox.shrink(),
                data: (stats) => GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.6,
                  children: [
                    _StatCard(
                      label: 'Total Listings',
                      value: '${stats['totalListings'] ?? 0}',
                      icon: Icons.inventory_2_outlined,
                      color: AppColors.primary,
                    ),
                    _StatCard(
                      label: 'In Stock',
                      value: '${stats['inStock'] ?? 0}',
                      icon: Icons.check_circle_outline,
                      color: AppColors.success,
                    ),
                    _StatCard(
                      label: 'Pending Orders',
                      value: '${stats['pendingOrders'] ?? 0}',
                      icon: Icons.pending_outlined,
                      color: AppColors.secondary,
                    ),
                    _StatCard(
                      label: 'Total Orders',
                      value: '${stats['totalOrders'] ?? 0}',
                      icon: Icons.receipt_long_outlined,
                      color: AppColors.info,
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 24),

            // Quick actions
            Text('Quick Actions', style: AppTextStyles.heading3),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 2.2,
              children: [
                _ActionTile(
                  icon: Icons.add_box_outlined,
                  // Manufacturers go directly to their catalog
                  label: isManufacturer ? 'My Catalog' : 'My Inventory',
                  onTap: () => context.push(isManufacturer
                      ? '/dashboard/manufacturer/catalog'
                      : '/dashboard/inventory'),
                ),
                _ActionTile(
                  icon: Icons.receipt_outlined,
                  label: 'Orders',
                  onTap: () => context.push('/dashboard/orders'),
                ),
                _ActionTile(
                  icon: Icons.local_shipping_outlined,
                  label: 'Delivery Settings',
                  onTap: () => context.push('/dashboard/delivery'),
                ),
                _ActionTile(
                  icon: Icons.star_outline,
                  label: 'Subscription',
                  onTap: () => context.push('/subscription'),
                ),
              ],
            ),

            // Manufacturer section — only for manufacturer accounts
            if (isManufacturer) ...[
              const SizedBox(height: 24),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text('MANUFACTURER',
                        style: AppTextStyles.caption
                            .copyWith(color: Colors.white, letterSpacing: 1)),
                  ),
                  const SizedBox(width: 8),
                  Text('Tools', style: AppTextStyles.heading3),
                ],
              ),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 2.2,
                children: [
                  _ActionTile(
                    icon: Icons.people_outline,
                    label: 'Retailer Network',
                    onTap: () =>
                        context.push('/dashboard/manufacturer/retailers'),
                  ),
                  _ActionTile(
                    icon: Icons.inventory_2_outlined,
                    label: 'My Catalog',
                    onTap: () =>
                        context.push('/dashboard/manufacturer/catalog'),
                  ),
                  _ActionTile(
                    icon: Icons.assignment_outlined,
                    label: 'Assign Products',
                    onTap: () =>
                        context.push('/dashboard/manufacturer/assign'),
                  ),
                  _ActionTile(
                    icon: Icons.storefront_outlined,
                    label: 'Brand Page',
                    onTap: () =>
                        context.push('/dashboard/manufacturer/brand'),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow,
              blurRadius: 4,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(value,
                    style: AppTextStyles.heading2.copyWith(color: color)),
                Text(label,
                    style: AppTextStyles.caption,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionTile(
      {required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
        ),
        child: Row(
          children: [
            Icon(icon, color: AppColors.primary, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(label,
                  style: AppTextStyles.bodyMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ),
            const Icon(Icons.chevron_right,
                color: AppColors.onSurfaceVariant, size: 18),
          ],
        ),
      ),
    );
  }
}

class _StatsShimmer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.6,
      children: List.generate(
        4,
        (_) => Container(
          decoration: BoxDecoration(
            color: AppColors.shimmerBase,
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}
