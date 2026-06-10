import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../dashboard/providers/dashboard_provider.dart';
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
    final ordersAsync = ref.watch(sellerOrdersProvider(phone));
    final seatsAsync = ref.watch(seatStatsProvider(phone));

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
          ref.invalidate(seatStatsProvider(phone));
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Profile header — matches the main dashboard's overview style
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppColors.primary,
                    AppColors.primary.withValues(alpha: 0.82),
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: Colors.white,
                    child: const Icon(Icons.factory_outlined,
                        color: AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Hello, ${name.split(' ').first}!',
                          style: AppTextStyles.heading2
                              .copyWith(color: Colors.white),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            'MANUFACTURER',
                            style: AppTextStyles.caption.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
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
                    _StatCard(
                      label: 'Pending Orders',
                      value:
                          '${(ordersAsync.valueOrNull ?? []).where((o) => o.status == 'pending').length}',
                      icon: Icons.pending_actions_outlined,
                      color: AppColors.secondary,
                    ),
                    _StatCard(
                      label: 'Revenue',
                      value: CurrencyUtils.format(
                        (ordersAsync.valueOrNull ?? [])
                            .where((o) => o.status != 'cancelled')
                            .fold<double>(0, (sum, o) => sum + o.total),
                      ),
                      icon: Icons.currency_rupee,
                      color: AppColors.primary,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Seats — real counts from subscriptions + seat listings
            seatsAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (_, _) => const SizedBox.shrink(),
              data: (seats) {
                final total = seats.totalPurchased;
                final used = seats.activeUsed;
                final fraction =
                    total > 0 ? (used / total).clamp(0.0, 1.0) : 0.0;
                return Container(
                  padding: const EdgeInsets.all(16),
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.event_seat_outlined,
                              size: 18, color: AppColors.primary),
                          const SizedBox(width: 6),
                          Text('Listing Seats',
                              style: AppTextStyles.bodyMedium
                                  .copyWith(fontWeight: FontWeight.w700)),
                          const Spacer(),
                          Text(
                            '${seats.available} left · $used / $total used',
                            style: AppTextStyles.caption
                                .copyWith(fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: fraction,
                          minHeight: 8,
                          backgroundColor: AppColors.surfaceVariant,
                          valueColor: AlwaysStoppedAnimation(
                            seats.available > 0
                                ? AppColors.primary
                                : AppColors.error,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 20),

            // Recent incoming orders
            Row(
              children: [
                Text('Recent Orders', style: AppTextStyles.heading3),
                const Spacer(),
                TextButton(
                  onPressed: () => context.push('/dashboard/orders'),
                  child: const Text('View all'),
                ),
              ],
            ),
            ordersAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (_, _) => const SizedBox.shrink(),
              data: (orders) => _RecentOrdersList(orders: orders),
            ),
            const SizedBox(height: 20),

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

class _RecentOrdersList extends StatelessWidget {
  final List<OrderModel> orders;
  const _RecentOrdersList({required this.orders});

  static const _statusColors = {
    'pending': AppColors.secondary,
    'confirmed': AppColors.info,
    'dispatched': AppColors.info,
    'delivered': AppColors.success,
    'cancelled': AppColors.error,
  };

  @override
  Widget build(BuildContext context) {
    if (orders.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
        ),
        child: Center(
          child: Column(
            children: [
              const Icon(Icons.receipt_long_outlined,
                  size: 36, color: AppColors.onSurfaceVariant),
              const SizedBox(height: 8),
              Text('No orders yet', style: AppTextStyles.bodyMedium),
            ],
          ),
        ),
      );
    }

    final sorted = [...orders]..sort((a, b) {
        final ad = a.createdAt ?? DateTime(2000);
        final bd = b.createdAt ?? DateTime(2000);
        return bd.compareTo(ad);
      });
    final recent = sorted.take(3).toList();

    return Container(
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
      child: Column(
        children: [
          for (var i = 0; i < recent.length; i++) ...[
            if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
            Builder(builder: (context) {
              final order = recent[i];
              final color =
                  _statusColors[order.status] ?? AppColors.onSurfaceVariant;
              final itemSummary = order.items.isNotEmpty
                  ? '${order.items.first.name}${order.items.length > 1 ? ' +${order.items.length - 1} more' : ''}'
                  : 'Order';
              return ListTile(
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 4),
                onTap: () => context.push('/dashboard/orders'),
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child:
                      Icon(Icons.receipt_outlined, color: color, size: 20),
                ),
                title: Text(
                  order.customerName.isNotEmpty
                      ? order.customerName
                      : 'Customer',
                  style: AppTextStyles.bodyMedium
                      .copyWith(fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(itemSummary,
                    style: AppTextStyles.caption,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(CurrencyUtils.format(order.total),
                        style: AppTextStyles.bodyMedium
                            .copyWith(fontWeight: FontWeight.w700)),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        order.status.toUpperCase(),
                        style: AppTextStyles.caption.copyWith(
                          color: color,
                          fontWeight: FontWeight.w700,
                          fontSize: 9,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
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
