import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/models/review_model.dart';
import '../data/dashboard_repository.dart' show SeatStats;
import '../providers/dashboard_provider.dart' show productStatsTotalsProvider;

/// Shared "seller overview" widgets rendered on the Profile tab, which is
/// the seller's Overview — the single seller-facing overview screen (see
/// profile_screen.dart).

/// "Add Product" tap behaviour, shared by `QuickActionsCard` and Profile's
/// standalone Add Product button: paid sellers go straight to their
/// add-product form (auto-opened via ?autoAdd=1); unpaid sellers/non-sellers
/// are nudged to the same /subscription?reason=paywall destination the
/// router-level dashboard guard already uses, so there's only one paywall
/// flow/copy in the app, not two slightly-different ones.
void goToAddProduct(
  BuildContext context, {
  required bool canAccessDashboard,
  required bool isManufacturer,
}) {
  if (canAccessDashboard) {
    context.push(
      isManufacturer
          ? '/dashboard/manufacturer/catalog?autoAdd=1'
          : '/dashboard/inventory?autoAdd=1',
    );
    return;
  }
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(content: Text('Upgrade to add products')),
  );
  context.push('/subscription?reason=paywall');
}

// ─── Quick actions ───────────────────────────────────────────────────────────

/// Mirrors web's dashboard "Quick actions" card (krishidukan.com/dashboard)
/// exactly — same 4 shortcuts, same copy, same order.
class QuickActionsCard extends StatelessWidget {
  final bool isManufacturer;
  final bool canAccessDashboard;
  /// Which shortcuts to show — a shop helper only gets what the owner
  /// ticked (UserModel.staffCan). Owners see all four.
  final bool Function(String permission) can;
  const QuickActionsCard({
    super.key,
    required this.isManufacturer,
    required this.canAccessDashboard,
    this.can = _always,
  });

  static bool _always(String _) => true;

  @override
  Widget build(BuildContext context) {
    if (!can('products') && !can('analytics') && !can('orders')) {
      return const SizedBox.shrink();
    }
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
          Text('Quick actions', style: AppTextStyles.heading3),
          const SizedBox(height: 2),
          Text('Shortcuts to common shop tasks', style: AppTextStyles.caption),
          const SizedBox(height: 12),
          if (can('products')) ...[
          _QuickActionRow(
            icon: Icons.add_circle_outline,
            color: AppColors.primary,
            title: 'Add product',
            subtitle: 'Create a new listing',
            onTap: () => goToAddProduct(
              context,
              canAccessDashboard: canAccessDashboard,
              isManufacturer: isManufacturer,
            ),
          ),
          const SizedBox(height: 8),
          _QuickActionRow(
            icon: Icons.inventory_2_outlined,
            color: AppColors.secondary,
            title: 'Adjust stock',
            subtitle: 'Update quantities',
            onTap: () => context.push(isManufacturer
                ? '/dashboard/manufacturer/catalog'
                : '/dashboard/inventory'),
          ),
          const SizedBox(height: 8),
          ],
          if (can('analytics')) ...[
          _QuickActionRow(
            icon: Icons.bar_chart_outlined,
            color: AppColors.info,
            title: 'View analytics',
            subtitle: 'Traffic & calls',
            onTap: () => context.push('/dashboard/analytics'),
          ),
          const SizedBox(height: 8),
          ],
          if (can('orders'))
          _QuickActionRow(
            icon: Icons.local_shipping_outlined,
            color: AppColors.success,
            title: 'Manage orders',
            subtitle: 'Incoming delivery orders',
            onTap: () => context.push('/dashboard/orders'),
          ),
        ],
      ),
    );
  }
}

class _QuickActionRow extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _QuickActionRow({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: AppTextStyles.bodyMedium
                          .copyWith(fontWeight: FontWeight.w700, color: color)),
                  Text(subtitle, style: AppTextStyles.caption),
                ],
              ),
            ),
            const Icon(Icons.chevron_right,
                color: AppColors.onSurfaceVariant, size: 18),
          ],
        ),
      ),
    );
  }
}

// ─── Overview metric grid ────────────────────────────────────────────────────

/// Mirrors web's dashboard Overview cards exactly (`app/dashboard/page.tsx`):
/// Total Views (impressions), Interactions (clicks), Directions
/// (directionRequests) — all summed across the seller's own listings, same
/// sources web's fetchRetailerAnalytics reads (productStats plus legacy
/// counters on the `products` docs) — and Products Listed (catalog count).
/// Web hardcodes the "vs last week" deltas to +0.0%/0.0%/0 today (no real
/// trend computation yet), so this matches that rather than fabricating a
/// number web itself doesn't have.
class OverviewGrid extends ConsumerWidget {
  final AsyncValue<List<dynamic>> listingsAsync;
  final AsyncValue<Map<String, int>>? analyticsAsync;
  final bool isManufacturer;

  const OverviewGrid({
    super.key,
    required this.listingsAsync,
    required this.analyticsAsync,
    required this.isManufacturer,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (listingsAsync.isLoading) return const StatsShimmer();
    final listings =
        listingsAsync.value?.cast<ListingModel>() ?? const <ListingModel>[];

    final idsKey = (listings.map((l) => l.id).toSet().toList()..sort()).join(',');
    final stats = ref.watch(productStatsTotalsProvider(idsKey)).value ??
        const <String, int>{};

    final totalViews = listings.fold<int>(0, (sum, l) => sum + l.impressions) +
        (stats['impressions'] ?? 0);
    final interactions = listings.fold<int>(0, (sum, l) => sum + l.clicks) +
        (stats['clicks'] ?? 0);
    final directions =
        listings.fold<int>(0, (sum, l) => sum + l.directionRequests) +
            (stats['directionRequests'] ?? 0);
    final productsListed = isManufacturer
        ? (analyticsAsync?.value?['catalogProducts'] ?? listings.length)
        : listings.length;

    final tiles = <Widget>[
      StatCard(
        label: 'Total Views',
        value: '$totalViews',
        icon: Icons.visibility_outlined,
        color: AppColors.primary,
        delta: '+0.0% vs last week',
      ),
      StatCard(
        label: 'Interactions',
        value: '$interactions',
        icon: Icons.touch_app_outlined,
        color: AppColors.success,
        delta: '+0.0% vs last week',
      ),
      StatCard(
        label: 'Directions',
        value: '$directions',
        icon: Icons.directions_outlined,
        color: AppColors.info,
        delta: '0.0% vs last week',
      ),
      StatCard(
        label: 'Products Listed',
        value: '$productsListed',
        icon: Icons.inventory_2_outlined,
        color: AppColors.secondary,
        delta: '0 vs last week',
      ),
    ];

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.35,
      children: tiles,
    );
  }
}

// ─── Inventory health ────────────────────────────────────────────────────────

class InventoryHealthCard extends StatelessWidget {
  final List<ListingModel> listings;
  final VoidCallback onManageInventory;
  const InventoryHealthCard({
    super.key,
    required this.listings,
    required this.onManageInventory,
  });

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
              Text('Inventory health', style: AppTextStyles.heading3),
              const Spacer(),
              TextButton(
                onPressed: onManageInventory,
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 24),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('Manage inventory'),
              ),
            ],
          ),
          Text('Snapshot of stock levels across your catalog',
              style: AppTextStyles.caption),
          const SizedBox(height: 12),
          Row(
            children: [
              HealthChip(
                  label: 'In stock SKUs',
                  count: inStock,
                  color: AppColors.success),
              const SizedBox(width: 8),
              HealthChip(
                  label: 'Low stock',
                  count: lowStock,
                  color: AppColors.secondary),
              const SizedBox(width: 8),
              HealthChip(
                  label: 'Out of Stock',
                  count: outOfStock,
                  color: AppColors.error),
            ],
          ),
          const SizedBox(height: 12),
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
          const SizedBox(height: 8),
          Row(
            children: [
              Text('Health score',
                  style: AppTextStyles.bodyMedium
                      .copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(width: 8),
              Text(
                total == 0
                    ? 'No products'
                    : '$score% — ${healthy ? 'Healthy' : 'Attention needed'}',
                style: AppTextStyles.caption.copyWith(
                  color: healthy ? AppColors.success : AppColors.error,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class HealthChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  const HealthChip(
      {super.key, required this.label, required this.count, required this.color});

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

class SeatsCard extends StatelessWidget {
  final SeatStats seats;
  const SeatsCard({super.key, required this.seats});

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
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () => context.push('/subscription'),
              icon: const Icon(Icons.add_circle_outline, size: 18),
              label: const Text('Buy more seats'),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.primary,
                padding: EdgeInsets.zero,
                minimumSize: const Size(0, 32),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Recent reviews ──────────────────────────────────────────────────────────

/// Mirrors web's "Recent reviews" dashboard card — same title/subtitle copy
/// and empty state, showing the 3 most recent reviews.
class RecentReviewsCard extends StatelessWidget {
  final List<ReviewModel> reviews;
  final VoidCallback onViewAll;
  const RecentReviewsCard({
    super.key,
    required this.reviews,
    required this.onViewAll,
  });

  @override
  Widget build(BuildContext context) {
    final sorted = [...reviews]..sort((a, b) {
        final ad = a.createdAt ?? DateTime(2000);
        final bd = b.createdAt ?? DateTime(2000);
        return bd.compareTo(ad);
      });
    final recent = sorted.take(3).toList();

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
              Text('Recent reviews', style: AppTextStyles.heading3),
              const Spacer(),
              TextButton(
                onPressed: onViewAll,
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 24),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('Reviews'),
              ),
            ],
          ),
          Text('Latest shopper feedback', style: AppTextStyles.caption),
          const SizedBox(height: 12),
          if (recent.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Column(
                children: [
                  const Icon(Icons.star_outline,
                      size: 32, color: AppColors.onSurfaceVariant),
                  const SizedBox(height: 8),
                  Text('No reviews yet', style: AppTextStyles.bodyMedium),
                  Text('Customer reviews will appear here',
                      style: AppTextStyles.caption),
                ],
              ),
            )
          else
            for (var i = 0; i < recent.length; i++) ...[
              if (i > 0) const Divider(height: 16),
              _ReviewRow(review: recent[i]),
            ],
        ],
      ),
    );
  }
}

class _ReviewRow extends StatelessWidget {
  final ReviewModel review;
  const _ReviewRow({required this.review});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: List.generate(
            5,
            (i) => Icon(
              i < review.rating.round() ? Icons.star : Icons.star_border,
              size: 14,
              color: AppColors.secondary,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(review.reviewerName,
                  style: AppTextStyles.bodyMedium
                      .copyWith(fontWeight: FontWeight.w600)),
              if ((review.reviewText ?? '').isNotEmpty)
                Text(review.reviewText!,
                    style: AppTextStyles.caption,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── Shared small widgets ────────────────────────────────────────────────────

class StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  /// Optional "+0.0% vs last week"-style line under the label, matching
  /// web's dashboard stat cards.
  final String? delta;

  const StatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.delta,
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
                if (delta != null)
                  Text(delta!,
                      style: AppTextStyles.caption.copyWith(fontSize: 9),
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

class StatsShimmer extends StatelessWidget {
  const StatsShimmer({super.key});

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

class CardShimmer extends StatelessWidget {
  final double height;
  const CardShimmer({super.key, required this.height});

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
