import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../data/dashboard_repository.dart' show SeatStats;
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
    // Live streams — every overview number is computed from the actual docs,
    // not denormalized counters, so it can never drift from reality.
    final listingsAsync = ref.watch(myListingsProvider(sellerPhone));
    final ordersAsync = ref.watch(sellerOrdersProvider(sellerPhone));
    final seatsAsync = ref.watch(seatStatsProvider(sellerPhone));
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
          ref.invalidate(seatStatsProvider(sellerPhone));
          if (isManufacturer) {
            ref.invalidate(manufacturerAnalyticsProvider(sellerPhone));
          }
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
          children: [
            // ── Profile summary header ────────────────────────────────────
            _ProfileHeader(
              sellerName: sellerName,
              isManufacturer: isManufacturer,
            ),
            const SizedBox(height: 16),

            // ── Overview metrics ──────────────────────────────────────────
            Text('Overview', style: AppTextStyles.heading3),
            const SizedBox(height: 12),
            _OverviewGrid(
              listingsAsync: listingsAsync,
              ordersAsync: ordersAsync,
              analyticsAsync: analyticsAsync,
              isManufacturer: isManufacturer,
            ),
            const SizedBox(height: 16),

            // ── Inventory health ──────────────────────────────────────────
            listingsAsync.when(
              loading: () => const _CardShimmer(height: 120),
              error: (_, _) => const SizedBox.shrink(),
              data: (listings) =>
                  _InventoryHealthCard(listings: listings.cast()),
            ),
            const SizedBox(height: 12),

            // ── Seats ─────────────────────────────────────────────────────
            seatsAsync.when(
              loading: () => const _CardShimmer(height: 90),
              error: (_, _) => const SizedBox.shrink(),
              data: (seats) => _SeatsCard(seats: seats),
            ),
            const SizedBox(height: 20),

            // ── Recent orders ─────────────────────────────────────────────
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
              loading: () => const _CardShimmer(height: 160),
              error: (_, _) => const SizedBox.shrink(),
              data: (orders) => _RecentOrders(orders: orders.cast()),
            ),
            const SizedBox(height: 20),

            // ── Quick actions ─────────────────────────────────────────────
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
          ],
        ),
      ),
    );
  }
}

// ─── Profile header ──────────────────────────────────────────────────────────

class _ProfileHeader extends StatelessWidget {
  final String sellerName;
  final bool isManufacturer;
  const _ProfileHeader({
    required this.sellerName,
    required this.isManufacturer,
  });

  String get _initials {
    final parts =
        sellerName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    return parts.take(2).map((p) => p[0].toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primary, AppColors.primary.withValues(alpha: 0.82)],
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
            child: Text(
              _initials.isNotEmpty ? _initials : '?',
              style: AppTextStyles.heading3.copyWith(color: AppColors.primary),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Hello, ${sellerName.split(' ').first}!',
                  style:
                      AppTextStyles.heading2.copyWith(color: Colors.white),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    isManufacturer ? 'MANUFACTURER' : 'RETAILER',
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
          IconButton(
            onPressed: () => context.go('/profile'),
            icon: const Icon(Icons.edit_outlined,
                color: Colors.white, size: 20),
            tooltip: 'Edit profile',
          ),
        ],
      ),
    );
  }
}

// ─── Overview metric grid ────────────────────────────────────────────────────

class _OverviewGrid extends StatelessWidget {
  final AsyncValue<List<dynamic>> listingsAsync;
  final AsyncValue<List<dynamic>> ordersAsync;
  final AsyncValue<Map<String, int>>? analyticsAsync;
  final bool isManufacturer;

  const _OverviewGrid({
    required this.listingsAsync,
    required this.ordersAsync,
    required this.analyticsAsync,
    required this.isManufacturer,
  });

  @override
  Widget build(BuildContext context) {
    final listings =
        listingsAsync.valueOrNull?.cast<ListingModel>() ?? const <ListingModel>[];
    final orders =
        ordersAsync.valueOrNull?.cast<OrderModel>() ?? const <OrderModel>[];
    final loading = listingsAsync.isLoading || ordersAsync.isLoading;

    if (loading) return _StatsShimmer();

    final pendingOrders =
        orders.where((o) => o.status == 'pending').length;
    // Revenue counts every order that wasn't cancelled — money actually flowing
    // through the store, matching the orders screen totals.
    final revenue = orders
        .where((o) => o.status != 'cancelled')
        .fold<double>(0, (sum, o) => sum + o.total);

    final tiles = <Widget>[
      if (isManufacturer) ...[
        _StatCard(
          label: 'Catalog Products',
          value: '${analyticsAsync?.valueOrNull?['catalogProducts'] ?? listings.length}',
          icon: Icons.inventory_2_outlined,
          color: AppColors.primary,
        ),
        _StatCard(
          label: 'Active Retailers',
          value: '${analyticsAsync?.valueOrNull?['activeRetailers'] ?? 0}',
          icon: Icons.store_outlined,
          color: AppColors.success,
        ),
      ] else ...[
        _StatCard(
          label: 'Total Products',
          value: '${listings.length}',
          icon: Icons.inventory_2_outlined,
          color: AppColors.primary,
        ),
        _StatCard(
          label: 'In Stock',
          value: '${listings.where((l) => l.isInStock).length}',
          icon: Icons.check_circle_outline,
          color: AppColors.success,
        ),
      ],
      _StatCard(
        label: 'Pending Orders',
        value: '$pendingOrders',
        icon: Icons.pending_outlined,
        color: AppColors.secondary,
      ),
      _StatCard(
        label: 'Revenue',
        value: CurrencyUtils.format(revenue),
        icon: Icons.currency_rupee,
        color: AppColors.info,
      ),
    ];

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.6,
      children: tiles,
    );
  }
}

// ─── Inventory health ────────────────────────────────────────────────────────

class _InventoryHealthCard extends StatelessWidget {
  final List<ListingModel> listings;
  const _InventoryHealthCard({required this.listings});

  @override
  Widget build(BuildContext context) {
    final total = listings.length;
    // qty == 1 is also the placeholder ListingModel assigns to web docs that
    // only store stock as an "In Stock" string — count it as in-stock, not low.
    final lowStock = listings
        .where((l) => l.stockQuantity >= 2 && l.stockQuantity <= 5)
        .length;
    final outOfStock = listings.where((l) => l.stockQuantity <= 0).length;
    final inStock = total - lowStock - outOfStock;
    final score =
        total > 0 ? (((inStock + lowStock) / total) * 100).round() : 100;
    final healthy = score >= 80;

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
              const Icon(Icons.monitor_heart_outlined,
                  size: 18, color: AppColors.primary),
              const SizedBox(width: 6),
              Text('Inventory Health', style: AppTextStyles.bodyMedium
                  .copyWith(fontWeight: FontWeight.w700)),
              const Spacer(),
              Text(
                total == 0
                    ? 'No products'
                    : healthy
                        ? 'Healthy'
                        : 'Attention needed',
                style: AppTextStyles.caption.copyWith(
                  color: healthy ? AppColors.success : AppColors.error,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: score / 100,
              minHeight: 8,
              backgroundColor: AppColors.surfaceVariant,
              valueColor: AlwaysStoppedAnimation(
                  healthy ? AppColors.success : AppColors.error),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _HealthChip(
                  label: 'In Stock', count: inStock, color: AppColors.success),
              const SizedBox(width: 8),
              _HealthChip(
                  label: 'Low Stock',
                  count: lowStock,
                  color: AppColors.secondary),
              const SizedBox(width: 8),
              _HealthChip(
                  label: 'Out of Stock',
                  count: outOfStock,
                  color: AppColors.error),
            ],
          ),
        ],
      ),
    );
  }
}

class _HealthChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  const _HealthChip(
      {required this.label, required this.count, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          children: [
            Text('$count',
                style: AppTextStyles.heading3.copyWith(color: color)),
            Text(label,
                style: AppTextStyles.caption,
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}

// ─── Seats card ──────────────────────────────────────────────────────────────

class _SeatsCard extends StatelessWidget {
  final SeatStats seats;
  const _SeatsCard({required this.seats});

  @override
  Widget build(BuildContext context) {
    final total = seats.totalPurchased;
    final used = seats.activeUsed;
    final fraction = total > 0 ? (used / total).clamp(0.0, 1.0) : 0.0;

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
                seats.available > 0 ? AppColors.primary : AppColors.error,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Recent orders ───────────────────────────────────────────────────────────

class _RecentOrders extends StatelessWidget {
  final List<OrderModel> orders;
  const _RecentOrders({required this.orders});

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
              Text('New orders will appear here',
                  style: AppTextStyles.caption),
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
            _OrderRow(
              order: recent[i],
              statusColor:
                  _statusColors[recent[i].status] ?? AppColors.onSurfaceVariant,
            ),
          ],
        ],
      ),
    );
  }
}

class _OrderRow extends StatelessWidget {
  final OrderModel order;
  final Color statusColor;
  const _OrderRow({required this.order, required this.statusColor});

  @override
  Widget build(BuildContext context) {
    final itemSummary = order.items.isNotEmpty
        ? '${order.items.first.name}${order.items.length > 1 ? ' +${order.items.length - 1} more' : ''}'
        : 'Order';

    return ListTile(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      onTap: () => context.push('/dashboard/orders'),
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: statusColor.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(Icons.receipt_outlined, color: statusColor, size: 20),
      ),
      title: Text(
        order.customerName.isNotEmpty ? order.customerName : 'Customer',
        style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600),
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
            padding:
                const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              order.status.toUpperCase(),
              style: AppTextStyles.caption.copyWith(
                color: statusColor,
                fontWeight: FontWeight.w700,
                fontSize: 9,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Shared widgets ──────────────────────────────────────────────────────────

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
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(value,
                      style: AppTextStyles.heading2.copyWith(color: color)),
                ),
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

class _CardShimmer extends StatelessWidget {
  final double height;
  const _CardShimmer({required this.height});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: AppColors.shimmerBase,
        borderRadius: BorderRadius.circular(12),
      ),
    );
  }
}
