import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/constants.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/firestore_repository.dart';
import '../../shared/models.dart';
import '../subscription/subscription_screen.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final _inventoryProvider =
    FutureProvider.family<List<InventoryRow>, String>((ref, uid) {
  return ref.watch(firestoreRepoProvider).fetchRetailerInventory(uid);
});

final _catalogueProvider =
    FutureProvider.family<List<ManufacturerProductRow>, String>((ref, uid) {
  return ref.watch(firestoreRepoProvider).fetchManufacturerCatalogue(uid);
});

final _subscriptionsProvider =
    FutureProvider.family<List<AppSubscription>, String>((ref, uid) {
  return ref.watch(firestoreRepoProvider).fetchSubscriptions(uid);
});

final _seatListingsProvider =
    FutureProvider.family<List<SeatListing>, String>((ref, uid) {
  return ref.watch(firestoreRepoProvider).fetchSeatListings(uid);
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    final isManufacturer =
        ref.read(sessionProvider).role == UserRole.manufacturer;
    _tabs = TabController(length: isManufacturer ? 4 : 3, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final uid = session.uid ?? '';
    final isManufacturer = session.role == UserRole.manufacturer;

    final tabs = [
      const Tab(icon: Icon(Icons.dashboard_outlined), text: 'Overview'),
      Tab(
        icon: Icon(isManufacturer
            ? Icons.factory_outlined
            : Icons.inventory_2_outlined),
        text: isManufacturer ? 'Catalogue' : 'Inventory',
      ),
      if (isManufacturer)
        const Tab(
            icon: Icon(Icons.people_alt_outlined), text: 'Retailer Network'),
      const Tab(icon: Icon(Icons.credit_card_outlined), text: 'Subscription'),
    ];

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: Text(isManufacturer
            ? 'Manufacturer Dashboard'
            : 'Retailer Dashboard'),
        backgroundColor: AppColors.surface,
        elevation: 0,
        actions: [
          if (isManufacturer)
            IconButton(
              icon: const Icon(Icons.add_circle_outline),
              tooltip: 'Add product',
              onPressed: () => _showAddProductSheet(context, uid),
            ),
          IconButton(
            icon: const Icon(Icons.person_outline),
            tooltip: 'Profile',
            onPressed: () => context.push('/profile'),
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          isScrollable: tabs.length > 3,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.muted,
          indicatorColor: AppColors.primary,
          indicatorWeight: 3,
          tabs: tabs,
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _OverviewTab(uid: uid, isManufacturer: isManufacturer),
          isManufacturer
              ? _CatalogueTab(uid: uid)
              : _InventoryTab(uid: uid),
          if (isManufacturer) _RetailerNetworkTab(uid: uid),
          _SubscriptionTab(uid: uid, isManufacturer: isManufacturer),
        ],
      ),
    );
  }

  void _showAddProductSheet(BuildContext context, String uid) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddProductSheet(uid: uid),
    );
  }
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

class _OverviewTab extends ConsumerWidget {
  const _OverviewTab({required this.uid, required this.isManufacturer});
  final String uid;
  final bool isManufacturer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subAsync = ref.watch(_subscriptionsProvider(uid));
    final seatAsync = ref.watch(_seatListingsProvider(uid));

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_subscriptionsProvider(uid));
        ref.invalidate(_seatListingsProvider(uid));
        if (isManufacturer) {
          ref.invalidate(_catalogueProvider(uid));
        } else {
          ref.invalidate(_inventoryProvider(uid));
        }
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Stat cards
          subAsync.when(
            data: (subs) => seatAsync.when(
              data: (listings) {
                final repo = ref.read(firestoreRepoProvider);
                final stats = repo.computeSeatStats(subs, listings);
                final hasSub =
                    subs.any((s) => s.isActive);
                return Column(
                  children: [
                    _SubscriptionBanner(
                        hasSub: hasSub,
                        stats: stats,
                        onBuySeats: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const SubscriptionScreen(),
                              ),
                            )),
                    const SizedBox(height: 16),
                    _StatsGrid(stats: stats, isManufacturer: isManufacturer),
                  ],
                );
              },
              loading: () => const _Loader(),
              error: (e, _) => _ErrorCard('$e'),
            ),
            loading: () => const _Loader(),
            error: (e, _) => _ErrorCard('$e'),
          ),
          const SizedBox(height: 20),

          // Quick actions
          const _SectionLabel('Quick Actions'),
          const SizedBox(height: 10),
          _QuickActions(isManufacturer: isManufacturer, uid: uid),
          const SizedBox(height: 20),

          // Inventory health for retailer
          if (!isManufacturer) ...[
            const _SectionLabel('Inventory Health'),
            const SizedBox(height: 10),
            _InventoryHealthCard(uid: uid),
          ],

          // Recent subscription info
          const SizedBox(height: 20),
          const _SectionLabel('Active Subscriptions'),
          const SizedBox(height: 10),
          subAsync.when(
            data: (subs) {
              final active = subs.where((s) => s.isActive).toList();
              if (active.isEmpty) {
                return _EmptyCard(
                  icon: Icons.credit_card_outlined,
                  title: 'No active subscription',
                  subtitle: 'Purchase seats to start listing products.',
                  actionLabel: 'Buy seats',
                  onAction: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const SubscriptionScreen()),
                  ),
                );
              }
              return Column(
                children: active
                    .take(2)
                    .map((s) => _SubSummaryTile(sub: s))
                    .toList(),
              );
            },
            loading: () => const _Loader(),
            error: (e, _) => _ErrorCard('$e'),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _SubscriptionBanner extends StatelessWidget {
  const _SubscriptionBanner(
      {required this.hasSub,
      required this.stats,
      required this.onBuySeats});
  final bool hasSub;
  final SeatStats stats;
  final VoidCallback onBuySeats;

  @override
  Widget build(BuildContext context) {
    if (!hasSub) {
      return InkWell(
        onTap: onBuySeats,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFFD49B14), Color(0xFFB07C10)],
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              const Icon(Icons.workspace_premium,
                  color: Colors.white, size: 32),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Activate your subscription',
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 15)),
                    SizedBox(height: 2),
                    Text('Purchase seats to list products',
                        style:
                            TextStyle(color: Colors.white70, fontSize: 12)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.white),
            ],
          ),
        ),
      );
    }
    // Seat usage card
    final pct = stats.totalPurchased > 0
        ? (stats.activeUsed / stats.totalPurchased).clamp(0.0, 1.0)
        : 0.0;
    final isExhausted = stats.available == 0 && stats.totalPurchased > 0;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('LISTING SEATS',
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                      letterSpacing: 0.8)),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isExhausted ? Colors.red : AppColors.primary,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('${stats.available} left',
                    style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: Colors.white)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text('${stats.activeUsed}',
                  style: const TextStyle(
                      fontSize: 28, fontWeight: FontWeight.w800)),
              Text(' / ${stats.totalPurchased} used',
                  style: const TextStyle(
                      color: AppColors.muted, fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 8),
          LinearProgressIndicator(
            value: pct,
            backgroundColor: AppColors.border,
            color: isExhausted ? Colors.red : AppColors.primary,
            borderRadius: BorderRadius.circular(999),
          ),
          if (stats.expiringSoon > 0) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.bolt, size: 13, color: Colors.amber),
                const SizedBox(width: 4),
                Text('${stats.expiringSoon} subscription(s) expiring soon',
                    style: const TextStyle(
                        fontSize: 11,
                        color: Colors.amber,
                        fontWeight: FontWeight.w600)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _StatsGrid extends StatelessWidget {
  const _StatsGrid(
      {required this.stats, required this.isManufacturer});
  final SeatStats stats;
  final bool isManufacturer;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.6,
      children: [
        _StatCard('Seats Purchased', '${stats.totalPurchased}',
            Icons.confirmation_num_outlined, AppColors.primary),
        _StatCard('Seats Used', '${stats.activeUsed}',
            Icons.inventory_2_outlined, AppColors.primary),
        _StatCard('Available', '${stats.available}',
            Icons.check_circle_outline,
            stats.available == 0 && stats.totalPurchased > 0
                ? Colors.red
                : Colors.green),
        _StatCard(
            'Expiring Soon',
            '${stats.expiringSoon}',
            Icons.timer_outlined,
            stats.expiringSoon > 0 ? Colors.amber.shade700 : AppColors.muted),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard(this.label, this.value, this.icon, this.color);
  final String label, value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.03), blurRadius: 8)
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Icon(icon, size: 20, color: color),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value,
                  style: TextStyle(
                      fontSize: 22, fontWeight: FontWeight.w800, color: color)),
              Text(label,
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.muted)),
            ],
          ),
        ],
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.isManufacturer, required this.uid});
  final bool isManufacturer;
  final String uid;

  @override
  Widget build(BuildContext context) {
    final actions = [
      if (isManufacturer)
        (Icons.add_box_outlined, 'Add Product',
            () => showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => _AddProductSheet(uid: uid),
                )),
      (Icons.storefront_outlined, 'View Store',
          () => context.go('/stores')),
      (Icons.shopping_bag_outlined, 'Marketplace',
          () => context.go('/market')),
      (Icons.bar_chart_outlined, 'Analytics', () {}),
    ];
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 2.4,
      children: actions
          .map((a) => InkWell(
                onTap: () => a.$3(),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      Icon(a.$1,
                          color: AppColors.primary, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(a.$2,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 12)),
                      ),
                    ],
                  ),
                ),
              ))
          .toList(),
    );
  }
}

class _InventoryHealthCard extends ConsumerWidget {
  const _InventoryHealthCard({required this.uid});
  final String uid;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invAsync = ref.watch(_inventoryProvider(uid));
    return invAsync.when(
      data: (rows) {
        if (rows.isEmpty) {
          return _EmptyCard(
            icon: Icons.inventory_2_outlined,
            title: 'No inventory yet',
            subtitle: 'Products assigned by manufacturers will appear here.',
          );
        }
        final inStock = rows.where((r) => r.status == 'in_stock').length;
        final lowStock = rows.where((r) => r.status == 'low_stock').length;
        final outOfStock =
            rows.where((r) => r.status == 'out_of_stock').length;
        final score = (inStock / rows.length * 100).round();
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Inventory Status',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: score >= 80
                          ? AppColors.inStockBg
                          : Colors.amber.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      score >= 80 ? 'Healthy' : 'Needs attention',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: score >= 80
                              ? AppColors.inStockFg
                              : Colors.amber.shade800),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _HealthDot(inStock, 'In Stock', Colors.green),
                  const SizedBox(width: 16),
                  _HealthDot(lowStock, 'Low Stock', Colors.amber.shade700),
                  const SizedBox(width: 16),
                  _HealthDot(outOfStock, 'Out of Stock', Colors.red),
                ],
              ),
              const SizedBox(height: 10),
              LinearProgressIndicator(
                value: score / 100,
                backgroundColor: AppColors.border,
                color: score >= 80 ? Colors.green : Colors.amber.shade600,
                borderRadius: BorderRadius.circular(999),
              ),
            ],
          ),
        );
      },
      loading: () => const _Loader(),
      error: (e, _) => _ErrorCard('$e'),
    );
  }
}

class _HealthDot extends StatelessWidget {
  const _HealthDot(this.count, this.label, this.color);
  final int count;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 5),
        Text('$count $label',
            style: const TextStyle(fontSize: 11, color: AppColors.muted)),
      ],
    );
  }
}

class _SubSummaryTile extends StatelessWidget {
  const _SubSummaryTile({required this.sub});
  final AppSubscription sub;

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd MMM yyyy');
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.credit_card,
                color: AppColors.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(sub.planName,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: 2),
                Text(
                    '${sub.seatsPurchased} seat${sub.seatsPurchased != 1 ? 's' : ''} · expires ${sub.expiryDate != null ? fmt.format(sub.expiryDate!) : 'N/A'}',
                    style: const TextStyle(
                        color: AppColors.muted, fontSize: 12)),
              ],
            ),
          ),
          _StatusPill(sub.isExpiringSoon
              ? 'Expiring'
              : sub.isActive
                  ? 'Active'
                  : 'Expired'),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    final isActive = label == 'Active';
    final isExpiring = label == 'Expiring';
    final color = isActive
        ? AppColors.primary
        : isExpiring
            ? Colors.amber.shade700
            : Colors.grey;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: color)),
    );
  }
}

// ─── Inventory Tab (Retailer) ─────────────────────────────────────────────────

class _InventoryTab extends ConsumerWidget {
  const _InventoryTab({required this.uid});
  final String uid;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invAsync = ref.watch(_inventoryProvider(uid));
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_inventoryProvider(uid)),
      child: invAsync.when(
        data: (rows) {
          if (rows.isEmpty) {
            return _EmptyStateCenter(
              icon: Icons.inventory_2_outlined,
              title: 'No inventory yet',
              subtitle:
                  'Manufacturers will assign products to your store here.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: rows.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (_, i) => _InventoryTile(
              row: rows[i],
              onEdit: () => _showEditSheet(context, rows[i], ref),
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorStateCenter('$e'),
      ),
    );
  }

  void _showEditSheet(
      BuildContext context, InventoryRow row, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EditInventorySheet(
        row: row,
        onSaved: () => ref.invalidate(_inventoryProvider(uid)),
      ),
    );
  }
}

class _InventoryTile extends StatelessWidget {
  const _InventoryTile({required this.row, required this.onEdit});
  final InventoryRow row;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final isInStock = row.status == 'in_stock';
    final isLow = row.status == 'low_stock';
    final statusColor = isInStock
        ? Colors.green
        : isLow
            ? Colors.amber.shade700
            : Colors.red;
    final statusLabel =
        isInStock ? 'In Stock' : isLow ? 'Low Stock' : 'Out of Stock';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppColors.surfaceAlt,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.inventory_2_outlined,
                color: AppColors.muted, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(row.productName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: 3),
                Text('${row.category} · ₹${row.sellingPrice.toStringAsFixed(0)}/${row.unit}',
                    style: const TextStyle(
                        color: AppColors.muted, fontSize: 12)),
                const SizedBox(height: 5),
                Row(
                  children: [
                    Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                            color: statusColor, shape: BoxShape.circle)),
                    const SizedBox(width: 5),
                    Text(
                        '$statusLabel · ${row.stockQuantity} ${row.unit}',
                        style: TextStyle(
                            fontSize: 11,
                            color: statusColor,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.edit_outlined, size: 18),
            color: AppColors.primary,
            onPressed: onEdit,
          ),
        ],
      ),
    );
  }
}

// ─── Catalogue Tab (Manufacturer) ────────────────────────────────────────────

class _CatalogueTab extends ConsumerWidget {
  const _CatalogueTab({required this.uid});
  final String uid;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catAsync = ref.watch(_catalogueProvider(uid));
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_catalogueProvider(uid)),
      child: catAsync.when(
        data: (rows) {
          if (rows.isEmpty) {
            return _EmptyStateCenter(
              icon: Icons.factory_outlined,
              title: 'No products yet',
              subtitle: 'Add products to your catalogue using the + button.',
              actionLabel: 'Add Product',
              onAction: () => showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => _AddProductSheet(uid: uid),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: rows.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (_, i) => _CatalogueTile(row: rows[i]),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorStateCenter('$e'),
      ),
    );
  }
}

class _CatalogueTile extends StatelessWidget {
  const _CatalogueTile({required this.row});
  final ManufacturerProductRow row;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.factory_outlined,
                color: AppColors.primary, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(row.productName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: 3),
                Text('${row.category} · ₹${row.price.toStringAsFixed(0)}/${row.unit}',
                    style: const TextStyle(
                        color: AppColors.muted, fontSize: 12)),
              ],
            ),
          ),
          _StatusPill(row.isActive ? 'Active' : 'Inactive'),
        ],
      ),
    );
  }
}

// ─── Retailer Network Tab (Manufacturer only) ─────────────────────────────────

class _RetailerNetworkTab extends ConsumerWidget {
  const _RetailerNetworkTab({required this.uid});
  final String uid;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final seatAsync = ref.watch(_seatListingsProvider(uid));
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_seatListingsProvider(uid)),
      child: seatAsync.when(
        data: (listings) {
          final assigned =
              listings.where((l) => l.listingType == 'assigned').toList();
          if (assigned.isEmpty) {
            return const _EmptyStateCenter(
              icon: Icons.people_alt_outlined,
              title: 'No retailers yet',
              subtitle:
                  'Retailers will appear here when you assign products to them.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: assigned.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (_, i) {
              final l = assigned[i];
              final fmt = DateFormat('dd MMM yyyy');
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.person_outline,
                          color: AppColors.primary, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l.retailerId ?? 'Retailer',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 14)),
                          if (l.assignedAt != null)
                            Text(
                                'Assigned ${fmt.format(l.assignedAt!)}',
                                style: const TextStyle(
                                    color: AppColors.muted, fontSize: 12)),
                          if (l.expiresAt != null)
                            Text(
                                'Expires ${fmt.format(l.expiresAt!)}',
                                style: const TextStyle(
                                    color: AppColors.muted, fontSize: 12)),
                        ],
                      ),
                    ),
                    _StatusPill(l.isActive ? 'Active' : 'Expired'),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorStateCenter('$e'),
      ),
    );
  }
}

// ─── Subscription Tab ─────────────────────────────────────────────────────────

class _SubscriptionTab extends ConsumerWidget {
  const _SubscriptionTab(
      {required this.uid, required this.isManufacturer});
  final String uid;
  final bool isManufacturer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subAsync = ref.watch(_subscriptionsProvider(uid));
    final seatAsync = ref.watch(_seatListingsProvider(uid));
    final fmt = DateFormat('dd MMM yyyy');

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_subscriptionsProvider(uid));
        ref.invalidate(_seatListingsProvider(uid));
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Seat stats header
          subAsync.when(
            data: (subs) => seatAsync.when(
              data: (listings) {
                final repo = ref.read(firestoreRepoProvider);
                final stats = repo.computeSeatStats(subs, listings);
                return _SeatStatCards(stats: stats);
              },
              loading: () => const _Loader(),
              error: (e, _) => _ErrorCard('$e'),
            ),
            loading: () => const _Loader(),
            error: (e, _) => _ErrorCard('$e'),
          ),
          const SizedBox(height: 16),

          // Buy more seats button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => const SubscriptionScreen()),
              ),
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Buy More Seats'),
              style: ElevatedButton.styleFrom(
                minimumSize: const Size.fromHeight(46),
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Subscription history
          const _SectionLabel('Subscription History'),
          const SizedBox(height: 10),
          subAsync.when(
            data: (subs) {
              if (subs.isEmpty) {
                return _EmptyCard(
                  icon: Icons.receipt_long_outlined,
                  title: 'No subscriptions yet',
                  subtitle: 'Purchase seats to start listing products.',
                );
              }
              return Column(
                children: subs.map((s) {
                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment:
                              MainAxisAlignment.spaceBetween,
                          children: [
                            Text(s.planName,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15)),
                            _StatusPill(s.isExpiringSoon
                                ? 'Expiring'
                                : s.isActive
                                    ? 'Active'
                                    : 'Expired'),
                          ],
                        ),
                        const SizedBox(height: 8),
                        _SubDetailRow('Seats', '${s.seatsPurchased}'),
                        _SubDetailRow('Amount',
                            '₹${s.amountPaid.toStringAsFixed(0)}'),
                        if (s.startDate != null)
                          _SubDetailRow('Started',
                              fmt.format(s.startDate!)),
                        if (s.expiryDate != null)
                          _SubDetailRow('Expires',
                              fmt.format(s.expiryDate!)),
                        if (s.razorpayPaymentId != null)
                          _SubDetailRow(
                              'Payment ID', s.razorpayPaymentId!,
                              mono: true),
                      ],
                    ),
                  );
                }).toList(),
              );
            },
            loading: () => const _Loader(),
            error: (e, _) => _ErrorCard('$e'),
          ),
          const SizedBox(height: 24),

          // Active seat listings
          const _SectionLabel('Active Listings'),
          const SizedBox(height: 10),
          seatAsync.when(
            data: (listings) {
              final active =
                  listings.where((l) => l.isActive).toList();
              if (active.isEmpty) {
                return _EmptyCard(
                  icon: Icons.list_outlined,
                  title: 'No active listings',
                  subtitle: isManufacturer
                      ? 'Create products or assign them to retailers.'
                      : 'Products assigned to your store will appear here.',
                );
              }
              return Column(
                children: active.map((l) {
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceAlt,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                              l.listingType == 'assigned'
                                  ? 'Assigned'
                                  : 'Own',
                              style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.muted)),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            l.expiresAt != null
                                ? 'Expires ${fmt.format(l.expiresAt!)}'
                                : 'Active',
                            style: const TextStyle(
                                fontSize: 12, color: AppColors.muted),
                          ),
                        ),
                        _StatusPill('Active'),
                      ],
                    ),
                  );
                }).toList(),
              );
            },
            loading: () => const _Loader(),
            error: (e, _) => _ErrorCard('$e'),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _SeatStatCards extends StatelessWidget {
  const _SeatStatCards({required this.stats});
  final SeatStats stats;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
            child: _SmallStatCard(
                'Purchased', '${stats.totalPurchased}', AppColors.text)),
        const SizedBox(width: 8),
        Expanded(
            child: _SmallStatCard(
                'Used', '${stats.activeUsed}', AppColors.primary)),
        const SizedBox(width: 8),
        Expanded(
            child: _SmallStatCard(
                'Available',
                '${stats.available}',
                stats.available == 0 && stats.totalPurchased > 0
                    ? Colors.red
                    : Colors.green)),
        const SizedBox(width: 8),
        Expanded(
            child: _SmallStatCard(
                'Expiring',
                '${stats.expiringSoon}',
                stats.expiringSoon > 0
                    ? Colors.amber.shade700
                    : AppColors.muted)),
      ],
    );
  }
}

class _SmallStatCard extends StatelessWidget {
  const _SmallStatCard(this.label, this.value, this.color);
  final String label, value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value,
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: color)),
          Text(label,
              style: const TextStyle(
                  fontSize: 10, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class _SubDetailRow extends StatelessWidget {
  const _SubDetailRow(this.label, this.value, {this.mono = false});
  final String label, value;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(
            width: 90,
            child: Text(label,
                style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.muted,
                    fontWeight: FontWeight.w600)),
          ),
          Expanded(
            child: Text(value,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    fontFamily: mono ? 'monospace' : null)),
          ),
        ],
      ),
    );
  }
}

// ─── Add Product Sheet (Manufacturer) ────────────────────────────────────────

class _AddProductSheet extends ConsumerStatefulWidget {
  const _AddProductSheet({required this.uid});
  final String uid;

  @override
  ConsumerState<_AddProductSheet> createState() => _AddProductSheetState();
}

class _AddProductSheetState extends ConsumerState<_AddProductSheet> {
  // Search
  final _searchCtrl = TextEditingController();
  List<Product> _allProducts = [];
  List<Product> _filtered = [];
  bool _loadingProducts = true;
  bool _showDropdown = false;
  Product? _selectedProduct;
  bool _creatingNew = false;

  // Form
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _categoryCtrl = TextEditingController();
  final _unitCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _descCtrl = TextEditingController();

  // Images
  final _picker = ImagePicker();
  final List<XFile> _images = [];
  bool _loading = false;
  bool _uploading = false;

  bool get _showForm => _selectedProduct != null || _creatingNew;

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _nameCtrl.dispose();
    _categoryCtrl.dispose();
    _unitCtrl.dispose();
    _priceCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadProducts() async {
    try {
      final products =
          await ref.read(firestoreRepoProvider).searchProducts('');
      if (mounted) {
        setState(() {
          _allProducts = products;
          _filtered = products;
          _loadingProducts = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingProducts = false);
    }
  }

  void _onSearchChanged(String query) {
    final q = query.trim().toLowerCase();
    setState(() {
      _showDropdown = true;
      _filtered = q.isEmpty
          ? _allProducts
          : _allProducts
              .where((p) =>
                  p.name.toLowerCase().contains(q) ||
                  p.category.toLowerCase().contains(q))
              .toList();
    });
  }

  void _selectProduct(Product p) {
    setState(() {
      _selectedProduct = p;
      _creatingNew = false;
      _showDropdown = false;
      _searchCtrl.text = p.name;
      _nameCtrl.text = p.name;
      _categoryCtrl.text = p.category;
      _unitCtrl.text = p.unit;
      _priceCtrl.text = p.priceInr > 0 ? '${p.priceInr}' : '';
      _descCtrl.text = p.description;
    });
  }

  void _createNew() {
    final suggestion = _searchCtrl.text.trim();
    setState(() {
      _selectedProduct = null;
      _creatingNew = true;
      _showDropdown = false;
      if (_nameCtrl.text.isEmpty) _nameCtrl.text = suggestion;
    });
  }

  Future<void> _pickImages() async {
    if (_images.length >= 5) return;
    final picked =
        await _picker.pickMultiImage(limit: 5 - _images.length);
    if (picked.isNotEmpty && mounted) {
      setState(() => _images.addAll(picked));
    }
  }

  Future<String> _uploadImage(XFile file) async {
    final bytes = await file.readAsBytes();
    final ext = file.name.contains('.') ? file.name.split('.').last : 'jpg';
    final name =
        '${DateTime.now().millisecondsSinceEpoch}.$ext';
    final storageRef = FirebaseStorage.instance
        .ref('product-images/${widget.uid}/$name');
    await storageRef.putData(bytes);
    return storageRef.getDownloadURL();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      setState(() => _uploading = true);
      final uploadedUrls = <String>[];
      for (final img in _images) {
        uploadedUrls.add(await _uploadImage(img));
      }
      // Fall back to the selected product's image when no new images chosen.
      if (uploadedUrls.isEmpty &&
          _selectedProduct != null &&
          _selectedProduct!.imageUrl.isNotEmpty) {
        uploadedUrls.add(_selectedProduct!.imageUrl);
      }
      setState(() => _uploading = false);

      await ref.read(firestoreRepoProvider).createManufacturerProduct(
            ownerId: widget.uid,
            name: _nameCtrl.text.trim(),
            category: _categoryCtrl.text.trim(),
            unit: _unitCtrl.text.trim(),
            price: double.parse(_priceCtrl.text.trim()),
            description: _descCtrl.text.trim(),
            images: uploadedUrls,
            sourceProductId: _selectedProduct?.id,
          );
      ref.invalidate(_catalogueProvider(widget.uid));
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Product added to catalogue')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _uploading = false;
        });
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.92),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.all(Radius.circular(28)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(999)),
          ),
          // Header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _showForm
                      ? (_creatingNew
                          ? 'Create New Product'
                          : 'Add to Catalogue')
                      : 'Add Product',
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w800),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                  style: IconButton.styleFrom(
                      backgroundColor: AppColors.surfaceAlt),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Flexible(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                  20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Product search / picker ──────────────────────────
                  if (!_showForm) ...[
                    TextField(
                      controller: _searchCtrl,
                      decoration: InputDecoration(
                        labelText: 'Search existing products',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: _loadingProducts
                            ? const Padding(
                                padding: EdgeInsets.all(12),
                                child: SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2)))
                            : null,
                      ),
                      onChanged: _onSearchChanged,
                      onTap: () => setState(() => _showDropdown = true),
                    ),
                    const SizedBox(height: 6),
                    AnimatedSize(
                      duration: const Duration(milliseconds: 180),
                      child: _showDropdown
                          ? Container(
                              constraints:
                                  const BoxConstraints(maxHeight: 260),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border:
                                    Border.all(color: AppColors.border),
                                boxShadow: [
                                  BoxShadow(
                                      color: Colors.black
                                          .withValues(alpha: 0.06),
                                      blurRadius: 8,
                                      offset: const Offset(0, 2))
                                ],
                              ),
                              child: ListView(
                                shrinkWrap: true,
                                children: [
                                  ..._filtered.take(8).map((p) => ListTile(
                                        dense: true,
                                        leading: p.imageUrl.isNotEmpty
                                            ? ClipRRect(
                                                borderRadius:
                                                    BorderRadius.circular(6),
                                                child: CachedNetworkImage(
                                                  width: 36,
                                                  height: 36,
                                                  fit: BoxFit.cover,
                                                  imageUrl: p.imageUrl,
                                                  errorWidget: (_, _, _) =>
                                                      const Icon(
                                                          Icons
                                                              .image_not_supported_outlined,
                                                          size: 20,
                                                          color:
                                                              AppColors.muted),
                                                ))
                                            : const Icon(
                                                Icons.inventory_2_outlined,
                                                size: 24,
                                                color: AppColors.muted),
                                        title: Text(p.name,
                                            style: const TextStyle(
                                                fontSize: 13,
                                                fontWeight: FontWeight.w600)),
                                        subtitle: Text(p.category,
                                            style: const TextStyle(
                                                fontSize: 11,
                                                color: AppColors.muted)),
                                        onTap: () => _selectProduct(p),
                                      )),
                                  ListTile(
                                    dense: true,
                                    leading: const Icon(
                                        Icons.add_circle_outline,
                                        color: AppColors.primary,
                                        size: 22),
                                    title: Text(
                                      _searchCtrl.text.trim().isNotEmpty
                                          ? 'Create "${_searchCtrl.text.trim()}"'
                                          : 'Create new product',
                                      style: const TextStyle(
                                          color: AppColors.primary,
                                          fontWeight: FontWeight.w700,
                                          fontSize: 13),
                                    ),
                                    onTap: _createNew,
                                  ),
                                ],
                              ),
                            )
                          : const SizedBox.shrink(),
                    ),
                    if (!_showDropdown) ...[
                      const SizedBox(height: 32),
                      Center(
                        child: Column(
                          children: [
                            const Icon(Icons.search,
                                size: 56, color: AppColors.muted),
                            const SizedBox(height: 12),
                            const Text(
                              'Search for an existing product\nor create a new one',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                  color: AppColors.muted, fontSize: 14),
                            ),
                            const SizedBox(height: 16),
                            OutlinedButton.icon(
                              onPressed: _createNew,
                              icon: const Icon(Icons.add),
                              label: const Text('Create new product'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],

                  // ── Form ─────────────────────────────────────────────
                  if (_showForm) ...[
                    // Linked-product chip
                    if (_selectedProduct != null) ...[
                      GestureDetector(
                        onTap: () => setState(() {
                          _selectedProduct = null;
                          _creatingNew = false;
                          _showDropdown = false;
                          _searchCtrl.clear();
                        }),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: AppColors.primary
                                .withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.link,
                                  size: 13,
                                  color: AppColors.primary),
                              const SizedBox(width: 5),
                              Text(_selectedProduct!.name,
                                  style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.primary)),
                              const SizedBox(width: 5),
                              const Icon(Icons.close,
                                  size: 13, color: AppColors.primary),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _Field('Product name', _nameCtrl, required: true),
                          _Field('Category (e.g. Fertilizer)',
                              _categoryCtrl,
                              required: true),
                          Row(children: [
                            Expanded(
                                child: _Field('Unit (e.g. kg)', _unitCtrl,
                                    required: true)),
                            const SizedBox(width: 12),
                            Expanded(
                                child: _Field('Price (₹)', _priceCtrl,
                                    number: true, required: true)),
                          ]),
                          _Field('Description', _descCtrl, maxLines: 2),

                          // Image picker
                          const SizedBox(height: 4),
                          Row(
                            mainAxisAlignment:
                                MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('Product Images',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14,
                                      color: AppColors.text)),
                              Text('${_images.length}/5',
                                  style: const TextStyle(
                                      color: AppColors.muted,
                                      fontSize: 12)),
                            ],
                          ),
                          const SizedBox(height: 8),
                          SizedBox(
                            height: 88,
                            child: ListView(
                              scrollDirection: Axis.horizontal,
                              children: [
                                ..._images.asMap().entries.map((e) =>
                                    _ImageThumb(
                                      file: e.value,
                                      onRemove: () => setState(
                                          () => _images.removeAt(e.key)),
                                    )),
                                if (_images.length < 5)
                                  GestureDetector(
                                    onTap: _pickImages,
                                    child: Container(
                                      width: 80,
                                      height: 80,
                                      margin: const EdgeInsets.only(
                                          right: 8),
                                      decoration: BoxDecoration(
                                        color: AppColors.surfaceAlt,
                                        borderRadius:
                                            BorderRadius.circular(12),
                                        border: Border.all(
                                            color: AppColors.border),
                                      ),
                                      child: const Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Icon(
                                              Icons
                                                  .add_photo_alternate_outlined,
                                              color: AppColors.primary,
                                              size: 26),
                                          SizedBox(height: 4),
                                          Text('Add',
                                              style: TextStyle(
                                                  fontSize: 10,
                                                  color: AppColors.primary,
                                                  fontWeight:
                                                      FontWeight.w600)),
                                        ],
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 20),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _loading ? null : _submit,
                              style: ElevatedButton.styleFrom(
                                  minimumSize:
                                      const Size.fromHeight(48)),
                              child: _loading
                                  ? Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        const SizedBox(
                                            width: 18,
                                            height: 18,
                                            child:
                                                CircularProgressIndicator(
                                                    strokeWidth: 2,
                                                    color: Colors.white)),
                                        const SizedBox(width: 10),
                                        Text(
                                          _uploading
                                              ? 'Uploading images…'
                                              : 'Saving…',
                                          style: const TextStyle(
                                              color: Colors.white),
                                        ),
                                      ],
                                    )
                                  : const Text('Add to Catalogue'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ImageThumb extends StatelessWidget {
  const _ImageThumb({required this.file, required this.onRemove});
  final XFile file;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 80,
          height: 80,
          margin: const EdgeInsets.only(right: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            image: DecorationImage(
              image: FileImage(File(file.path)),
              fit: BoxFit.cover,
            ),
          ),
        ),
        Positioned(
          top: -4,
          right: 4,
          child: GestureDetector(
            onTap: onRemove,
            child: Container(
              width: 20,
              height: 20,
              decoration: const BoxDecoration(
                  color: Colors.black54, shape: BoxShape.circle),
              child:
                  const Icon(Icons.close, size: 13, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  const _Field(this.label, this.ctrl,
      {this.required = false,
      this.number = false,
      this.maxLines = 1});
  final String label;
  final TextEditingController ctrl;
  final bool required;
  final bool number;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: ctrl,
        maxLines: maxLines,
        keyboardType:
            number ? TextInputType.number : TextInputType.text,
        decoration: InputDecoration(labelText: label),
        validator: required
            ? (v) => (v == null || v.trim().isEmpty) ? 'Required' : null
            : null,
      ),
    );
  }
}

// ─── Edit Inventory Sheet (Retailer) ─────────────────────────────────────────

class _EditInventorySheet extends ConsumerStatefulWidget {
  const _EditInventorySheet(
      {required this.row, required this.onSaved});
  final InventoryRow row;
  final VoidCallback onSaved;

  @override
  ConsumerState<_EditInventorySheet> createState() =>
      _EditInventorySheetState();
}

class _EditInventorySheetState
    extends ConsumerState<_EditInventorySheet> {
  late final TextEditingController _qtyCtrl;
  late final TextEditingController _priceCtrl;
  late final TextEditingController _reorderCtrl;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _qtyCtrl =
        TextEditingController(text: '${widget.row.stockQuantity}');
    _priceCtrl =
        TextEditingController(text: '${widget.row.sellingPrice}');
    _reorderCtrl =
        TextEditingController(text: '${widget.row.reorderThreshold}');
  }

  @override
  void dispose() {
    _qtyCtrl.dispose();
    _priceCtrl.dispose();
    _reorderCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final qty = int.tryParse(_qtyCtrl.text) ?? widget.row.stockQuantity;
    final price =
        double.tryParse(_priceCtrl.text) ?? widget.row.sellingPrice;
    final reorder =
        int.tryParse(_reorderCtrl.text) ?? widget.row.reorderThreshold;
    setState(() => _loading = true);
    try {
      await ref
          .read(firestoreRepoProvider)
          .updateInventoryStock(widget.row.inventoryId, qty, price, reorder);
      widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28)),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
            20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(widget.row.productName,
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w800)),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                  style: IconButton.styleFrom(
                      backgroundColor: AppColors.surfaceAlt),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _Field('Stock quantity', _qtyCtrl, number: true),
            _Field('Selling price (₹)', _priceCtrl, number: true),
            _Field('Reorder at (qty)', _reorderCtrl, number: true),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _save,
                style: ElevatedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48)),
                child: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Text('Save Changes'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(text,
        style: const TextStyle(
            fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.text));
  }
}

class _Loader extends StatelessWidget {
  const _Loader();
  @override
  Widget build(BuildContext context) =>
      const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()));
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard(this.msg);
  final String msg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Text(msg,
          style: TextStyle(color: Colors.red.shade700, fontSize: 12)),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.actionLabel,
    this.onAction,
  });
  final IconData icon;
  final String title, subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: AppColors.border,
            style: BorderStyle.solid),
      ),
      child: Column(
        children: [
          Icon(icon, size: 36, color: AppColors.muted),
          const SizedBox(height: 8),
          Text(title,
              style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(subtitle,
              textAlign: TextAlign.center,
              style:
                  const TextStyle(color: AppColors.muted, fontSize: 12)),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 12),
            OutlinedButton(
                onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    );
  }
}

class _EmptyStateCenter extends StatelessWidget {
  const _EmptyStateCenter({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.actionLabel,
    this.onAction,
  });
  final IconData icon;
  final String title, subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 64, color: AppColors.muted),
            const SizedBox(height: 16),
            Text(title,
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(subtitle,
                textAlign: TextAlign.center,
                style:
                    const TextStyle(color: AppColors.muted, fontSize: 14)),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 16),
              ElevatedButton(
                  onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

class _ErrorStateCenter extends StatelessWidget {
  const _ErrorStateCenter(this.msg);
  final String msg;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 56, color: AppColors.muted),
            const SizedBox(height: 12),
            Text(msg,
                textAlign: TextAlign.center,
                style:
                    const TextStyle(color: AppColors.muted, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}
