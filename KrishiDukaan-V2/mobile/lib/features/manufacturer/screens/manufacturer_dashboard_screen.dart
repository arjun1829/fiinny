import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../providers/manufacturer_provider.dart';

class ManufacturerDashboardScreen extends ConsumerWidget {
  const ManufacturerDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);
    return userAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, _) =>
          const Scaffold(body: Center(child: Text('Not logged in.'))),
      data: (user) {
        if (user == null || !user.isManufacturer) {
          return const Scaffold(
              body: Center(child: Text('Not a manufacturer account.')));
        }
        return _ManufacturerBody(phone: user.phone, name: user.name);
      },
    );
  }
}

class _ManufacturerBody extends ConsumerWidget {
  final String phone;
  final String name;
  const _ManufacturerBody({required this.phone, required this.name});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(networkStatsProvider(phone));
    final analyticsAsync = ref.watch(manufacturerAnalyticsProvider(phone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Manufacturer Hub',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.language, color: Colors.white),
            tooltip: 'Brand Page',
            onPressed: () => context.push('/dashboard/manufacturer/brand'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(networkStatsProvider(phone));
          ref.invalidate(manufacturerAnalyticsProvider(phone));
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Hello, ${name.split(' ').first}!',
                style: AppTextStyles.heading2),
            Text('Manufacturer Dashboard',
                style: AppTextStyles.body
                    .copyWith(color: AppColors.onSurfaceVariant)),
            const SizedBox(height: 20),

            // Network stats
            statsAsync.when(
              loading: () => _shimmerGrid(),
              error: (_, _) => const SizedBox.shrink(),
              data: (stats) => analyticsAsync.when(
                loading: () => _shimmerGrid(),
                error: (_, _) => const SizedBox.shrink(),
                data: (analytics) => GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.5,
                  children: [
                    _StatCard(
                      label: 'Active Retailers',
                      value: '${stats['active'] ?? 0}',
                      icon: Icons.store_outlined,
                      color: AppColors.success,
                    ),
                    _StatCard(
                      label: 'Invited',
                      value: '${stats['invited'] ?? 0}',
                      icon: Icons.pending_outlined,
                      color: AppColors.secondary,
                    ),
                    _StatCard(
                      label: 'Catalog Products',
                      value:
                          '${analytics['catalogProducts'] ?? 0}',
                      icon: Icons.inventory_2_outlined,
                      color: AppColors.primary,
                    ),
                    _StatCard(
                      label: 'Assignments',
                      value:
                          '${analytics['totalAssignments'] ?? 0}',
                      icon: Icons.assignment_outlined,
                      color: AppColors.info,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Quick actions
            Text('Manage', style: AppTextStyles.heading3),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 2.0,
              children: [
                _ActionTile(
                  icon: Icons.group_outlined,
                  label: 'Retailer Network',
                  onTap: () => context
                      .push('/dashboard/manufacturer/retailers'),
                ),
                _ActionTile(
                  icon: Icons.inventory_2_outlined,
                  label: 'My Catalog',
                  onTap: () =>
                      context.push('/dashboard/manufacturer/catalog'),
                ),
                _ActionTile(
                  icon: Icons.assignment_turned_in_outlined,
                  label: 'Assign Products',
                  onTap: () =>
                      context.push('/dashboard/manufacturer/assign'),
                ),
                _ActionTile(
                  icon: Icons.brush_outlined,
                  label: 'Brand Page',
                  onTap: () =>
                      context.push('/dashboard/manufacturer/brand'),
                ),
                _ActionTile(
                  icon: Icons.receipt_long_outlined,
                  label: 'Incoming Orders',
                  onTap: () =>
                      context.push('/dashboard/orders'),
                ),
                _ActionTile(
                  icon: Icons.local_shipping_outlined,
                  label: 'Delivery Settings',
                  onTap: () =>
                      context.push('/dashboard/delivery'),
                ),
              ],
            ),
            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }

  Widget _shimmerGrid() => GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 1.5,
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
        padding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
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
                color: AppColors.onSurfaceVariant, size: 16),
          ],
        ),
      ),
    );
  }
}
