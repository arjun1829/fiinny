import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/network_retailer_model.dart';
import '../../../core/models/subscription_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../manufacturer/data/manufacturer_repository.dart';
import '../../manufacturer/providers/manufacturer_provider.dart';
import '../providers/dashboard_provider.dart';

/// Seller-facing subscription management — the app's equivalent of web's
/// `/dashboard/subscription` page, which the app had no counterpart for at
/// all: `/subscription` on mobile goes straight to the PURCHASE screen, so a
/// seller could buy seats but never see what they had bought or what was
/// using them.
///
/// Three sections, matching web: seat summary, Subscription History, and
/// Active Listings (with per-row release).
class SubscriptionDashboardScreen extends ConsumerWidget {
  const SubscriptionDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const AppTopBar(title: 'Subscription'),
      body: userAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const Center(child: Text('Not logged in.')),
        data: (user) {
          if (user == null) {
            return const Center(child: Text('Not logged in.'));
          }
          return _Body(phone: user.phone);
        },
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final String phone;
  const _Body({required this.phone});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(seatStatsProvider(phone));
    ref.invalidate(subscriptionHistoryProvider(phone));
    ref.invalidate(activeSeatListingsProvider(phone));
    await Future.wait([
      ref.read(seatStatsProvider(phone).future),
      ref.read(subscriptionHistoryProvider(phone).future),
      ref.read(activeSeatListingsProvider(phone).future),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(seatStatsProvider(phone));
    final historyAsync = ref.watch(subscriptionHistoryProvider(phone));
    final listingsAsync = ref.watch(activeSeatListingsProvider(phone));

    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Seat summary ───────────────────────────────────────────────
          statsAsync.when(
            loading: () => const _SeatSkeleton(),
            error: (_, _) => const SizedBox.shrink(),
            data: (stats) => GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              // Slightly shorter than before (was 2.1) to fit the new sub
              // line under each tile's label without overflowing.
              childAspectRatio: 1.7,
              children: [
                _StatTile(
                  label: 'Seats purchased',
                  value: '${stats.totalPurchased}',
                  sub: 'From active subs',
                ),
                _StatTile(
                  label: 'Seats used',
                  value: '${stats.activeUsed}',
                  sub: 'Active product listings',
                ),
                _StatTile(
                  label: 'Available',
                  value: '${stats.available}',
                  highlight: stats.available > 0,
                  sub: 'Ready to use',
                ),
                _StatTile(
                  label: 'Expiring soon',
                  value: '${stats.expiringSoon}',
                  // Only worth drawing the eye when there's something to act on.
                  warning: stats.expiringSoon > 0,
                  sub: 'Subscriptions in 30 days',
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => context.push('/subscription'),
              icon: const Icon(Icons.add_shopping_cart, size: 18),
              label: const Text('Buy more seats'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),

          // ── Subscription history ───────────────────────────────────────
          Text('Subscription History', style: AppTextStyles.heading3),
          const SizedBox(height: 8),
          historyAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, _) => const _ErrorNote('Could not load your subscriptions.'),
            data: (subs) => subs.isEmpty
                ? const _EmptyNote(
                    icon: Icons.receipt_long_outlined,
                    text: 'No subscriptions yet.',
                  )
                : Column(
                    children: [for (final s in subs) _SubscriptionCard(sub: s)],
                  ),
          ),
          const SizedBox(height: 24),

          // ── Active listings ────────────────────────────────────────────
          _ActiveListingsSection(
            phone: phone,
            listingsAsync: listingsAsync,
            onRefresh: () => _refresh(ref),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

// ── Pieces ───────────────────────────────────────────────────────────────────

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;
  final bool warning;
  // Matches web's SeatStatTile `sub` line (e.g. "Subscriptions in 30 days")
  // — without it, the count alone doesn't say what window it covers.
  final String? sub;

  const _StatTile({
    required this.label,
    required this.value,
    this.highlight = false,
    this.warning = false,
    this.sub,
  });

  @override
  Widget build(BuildContext context) {
    final color = warning
        ? Colors.orange.shade800
        : highlight
            ? AppColors.primary
            : AppColors.onSurface;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(value,
              style: AppTextStyles.heading2.copyWith(color: color)),
          const SizedBox(height: 2),
          Text(label,
              style: AppTextStyles.bodySmall
                  .copyWith(color: AppColors.onSurfaceVariant)),
          if (sub != null) ...[
            const SizedBox(height: 1),
            Text(sub!,
                style: AppTextStyles.caption
                    .copyWith(color: AppColors.onSurfaceVariant, fontSize: 10)),
          ],
        ],
      ),
    );
  }
}

class _SeatSkeleton extends StatelessWidget {
  const _SeatSkeleton();
  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      );
}

String _fmtDate(DateTime? d) {
  if (d == null) return '—';
  return '${d.day.toString().padLeft(2, '0')}/'
      '${d.month.toString().padLeft(2, '0')}/${d.year}';
}

class _SubscriptionCard extends StatelessWidget {
  final SubscriptionModel sub;
  const _SubscriptionCard({required this.sub});

  @override
  Widget build(BuildContext context) {
    final (badgeText, badgeColor) = sub.isExpired
        ? ('Expired', AppColors.onSurfaceVariant)
        : sub.status == 'active'
            ? ('Active', AppColors.success)
            : (sub.status, Colors.orange.shade800);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  sub.planName,
                  style: AppTextStyles.bodyMedium
                      .copyWith(fontWeight: FontWeight.bold),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: badgeColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  badgeText,
                  style: AppTextStyles.caption.copyWith(
                    color: badgeColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 14,
            runSpacing: 4,
            children: [
              _Fact(
                label: 'Seats',
                value: '${sub.seatsPurchased}',
              ),
              if (sub.durationMonths > 0)
                _Fact(label: 'Duration', value: '${sub.durationMonths} mo'),
              if (sub.amountPaid > 0)
                _Fact(
                  label: 'Paid',
                  value: CurrencyUtils.format(sub.amountPaid),
                ),
              _Fact(label: 'Start', value: _fmtDate(sub.startDate)),
              _Fact(label: 'Expires', value: _fmtDate(sub.expiryDate)),
            ],
          ),
          if (sub.activatedByAdmin || sub.razorpayPaymentId != null) ...[
            const SizedBox(height: 6),
            Text(
              sub.activatedByAdmin
                  ? 'Activated by admin'
                  : 'Payment ${sub.razorpayPaymentId}',
              style: AppTextStyles.caption
                  .copyWith(color: AppColors.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  final String label;
  final String value;
  const _Fact({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: TextSpan(
        style: AppTextStyles.bodySmall,
        children: [
          TextSpan(
            text: '$label: ',
            style: AppTextStyles.bodySmall
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
          TextSpan(
            text: value,
            style: AppTextStyles.bodySmall
                .copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

/// Filter type for Active Listings — matches web's typeFilter
/// ("all" | "own" | "assigned") on app/dashboard/subscription/page.tsx.
enum _ListingTypeFilter { all, own, assigned }

/// Active Listings with the same filter set web has: text search, type
/// (Own/Assigned), Shop/Retailer (manufacturer only), and Assigned/Expires
/// date ranges. Previously the app just dumped every listing in one flat
/// list with no way to narrow it down at all.
class _ActiveListingsSection extends ConsumerStatefulWidget {
  final String phone;
  final AsyncValue<List<SeatListingModel>> listingsAsync;
  final VoidCallback onRefresh;
  const _ActiveListingsSection({
    required this.phone,
    required this.listingsAsync,
    required this.onRefresh,
  });

  @override
  ConsumerState<_ActiveListingsSection> createState() =>
      _ActiveListingsSectionState();
}

class _ActiveListingsSectionState
    extends ConsumerState<_ActiveListingsSection> {
  bool _showFilters = false;
  String _search = '';
  _ListingTypeFilter _typeFilter = _ListingTypeFilter.all;
  String _shopFilter = 'all';
  DateTime? _assignedFrom;
  DateTime? _assignedTo;
  DateTime? _expiresFrom;
  DateTime? _expiresTo;

  bool get _hasActiveFilters =>
      _typeFilter != _ListingTypeFilter.all ||
      _shopFilter != 'all' ||
      _assignedFrom != null ||
      _assignedTo != null ||
      _expiresFrom != null ||
      _expiresTo != null ||
      _search.trim().isNotEmpty;

  void _clearAll() {
    setState(() {
      _search = '';
      _typeFilter = _ListingTypeFilter.all;
      _shopFilter = 'all';
      _assignedFrom = null;
      _assignedTo = null;
      _expiresFrom = null;
      _expiresTo = null;
    });
  }

  List<SeatListingModel> _applyFilters(
    List<SeatListingModel> listings,
    Map<String, String> shopNames,
  ) {
    return listings.where((l) {
      if (_typeFilter == _ListingTypeFilter.own && l.isAssigned) return false;
      if (_typeFilter == _ListingTypeFilter.assigned && !l.isAssigned) {
        return false;
      }
      final shopName = l.retailerDocId != null
          ? (shopNames[l.retailerDocId] ?? '')
          : '';
      if (_shopFilter != 'all' && shopName != _shopFilter) return false;
      if (_assignedFrom != null &&
          l.assignedAt != null &&
          l.assignedAt!.isBefore(_assignedFrom!)) {
        return false;
      }
      if (_assignedTo != null &&
          l.assignedAt != null &&
          l.assignedAt!.isAfter(
              _assignedTo!.add(const Duration(days: 1)))) {
        return false;
      }
      if (_expiresFrom != null &&
          l.expiresAt != null &&
          l.expiresAt!.isBefore(_expiresFrom!)) {
        return false;
      }
      if (_expiresTo != null &&
          l.expiresAt != null &&
          l.expiresAt!.isAfter(_expiresTo!.add(const Duration(days: 1)))) {
        return false;
      }
      if (_search.trim().isNotEmpty) {
        final q = _search.trim().toLowerCase();
        final hit = (l.productName ?? '').toLowerCase().contains(q) ||
            l.listingType.toLowerCase().contains(q) ||
            l.status.toLowerCase().contains(q) ||
            shopName.toLowerCase().contains(q);
        if (!hit) return false;
      }
      return true;
    }).toList();
  }

  Future<void> _pickDate(ValueChanged<DateTime?> onPicked, DateTime? current) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? now,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 5),
    );
    if (picked != null) onPicked(picked);
  }

  @override
  Widget build(BuildContext context) {
    final isManufacturer = ref.watch(isManufacturerProvider);
    // retailerDocId -> shop name, for the Shop/Retailer filter + display —
    // manufacturer-only, mirroring web's retailerMap (built from the same
    // retailer network the Retailer Network screen already shows).
    final networkAsync = isManufacturer
        ? ref.watch(retailerNetworkProvider(widget.phone))
        : const AsyncValue<List<NetworkRetailerModel>>.data([]);
    final shopNames = <String, String>{
      for (final r in networkAsync.value ?? const <NetworkRetailerModel>[])
        r.retailerDocId: r.shopName.isNotEmpty ? r.shopName : r.ownerName,
    };
    final shopOptions = shopNames.values.toSet().toList()..sort();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Active Listings', style: AppTextStyles.heading3),
            ),
            widget.listingsAsync.maybeWhen(
              data: (l) {
                final filtered = _applyFilters(l, shopNames);
                return Text(
                  filtered.length == l.length
                      ? '${l.length}'
                      : '${filtered.length} of ${l.length}',
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.onSurfaceVariant),
                );
              },
              orElse: () => const SizedBox.shrink(),
            ),
            const SizedBox(width: 8),
            InkWell(
              onTap: () => setState(() => _showFilters = !_showFilters),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: (_showFilters || _hasActiveFilters)
                      ? AppColors.primary.withValues(alpha: 0.1)
                      : Colors.transparent,
                  border: Border.all(
                    color: (_showFilters || _hasActiveFilters)
                        ? AppColors.primary.withValues(alpha: 0.4)
                        : AppColors.divider,
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.filter_list,
                        size: 14,
                        color: (_showFilters || _hasActiveFilters)
                            ? AppColors.primary
                            : AppColors.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Text(
                      _hasActiveFilters ? 'Filters •' : 'Filters',
                      style: AppTextStyles.caption.copyWith(
                        color: (_showFilters || _hasActiveFilters)
                            ? AppColors.primary
                            : AppColors.onSurfaceVariant,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          'Each of these is using one of your seats.',
          style: AppTextStyles.bodySmall
              .copyWith(color: AppColors.onSurfaceVariant),
        ),
        if (_showFilters) ...[
          const SizedBox(height: 10),
          _FilterPanel(
            search: _search,
            onSearchChanged: (v) => setState(() => _search = v),
            typeFilter: _typeFilter,
            onTypeChanged: (v) => setState(() => _typeFilter = v),
            isManufacturer: isManufacturer,
            shopFilter: _shopFilter,
            shopOptions: shopOptions,
            onShopChanged: (v) => setState(() => _shopFilter = v),
            assignedFrom: _assignedFrom,
            assignedTo: _assignedTo,
            expiresFrom: _expiresFrom,
            expiresTo: _expiresTo,
            onPickAssignedFrom: () => _pickDate(
                (d) => setState(() => _assignedFrom = d), _assignedFrom),
            onPickAssignedTo: () => _pickDate(
                (d) => setState(() => _assignedTo = d), _assignedTo),
            onPickExpiresFrom: () => _pickDate(
                (d) => setState(() => _expiresFrom = d), _expiresFrom),
            onPickExpiresTo: () => _pickDate(
                (d) => setState(() => _expiresTo = d), _expiresTo),
            onClearAssignedFrom: () => setState(() => _assignedFrom = null),
            onClearAssignedTo: () => setState(() => _assignedTo = null),
            onClearExpiresFrom: () => setState(() => _expiresFrom = null),
            onClearExpiresTo: () => setState(() => _expiresTo = null),
          ),
          if (_hasActiveFilters) ...[
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _clearAll,
                icon: const Icon(Icons.close, size: 14),
                label: const Text('Clear filters'),
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  foregroundColor: AppColors.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ],
        const SizedBox(height: 8),
        widget.listingsAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, _) => const _ErrorNote('Could not load active listings.'),
          data: (listings) {
            if (listings.isEmpty) {
              return const _EmptyNote(
                icon: Icons.inventory_2_outlined,
                text: 'No seats in use right now.',
              );
            }
            final filtered = _applyFilters(listings, shopNames);
            if (filtered.isEmpty) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _EmptyNote(
                    icon: Icons.search_off,
                    text: 'No listings match your filters.',
                  ),
                  TextButton(
                    onPressed: _clearAll,
                    style: TextButton.styleFrom(padding: EdgeInsets.zero),
                    child: const Text('Clear all filters'),
                  ),
                ],
              );
            }
            return Column(
              children: [
                for (final l in filtered)
                  _SeatListingCard(
                    listing: l,
                    shopName: l.retailerDocId != null
                        ? shopNames[l.retailerDocId]
                        : null,
                    onReleased: widget.onRefresh,
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

/// The expandable filter form itself — search, type, shop (manufacturer
/// only), and the two date ranges. Kept as a dumb widget driven entirely by
/// the parent's state so the parent owns filtering logic in one place.
class _FilterPanel extends StatelessWidget {
  final String search;
  final ValueChanged<String> onSearchChanged;
  final _ListingTypeFilter typeFilter;
  final ValueChanged<_ListingTypeFilter> onTypeChanged;
  final bool isManufacturer;
  final String shopFilter;
  final List<String> shopOptions;
  final ValueChanged<String> onShopChanged;
  final DateTime? assignedFrom;
  final DateTime? assignedTo;
  final DateTime? expiresFrom;
  final DateTime? expiresTo;
  final VoidCallback onPickAssignedFrom;
  final VoidCallback onPickAssignedTo;
  final VoidCallback onPickExpiresFrom;
  final VoidCallback onPickExpiresTo;
  final VoidCallback onClearAssignedFrom;
  final VoidCallback onClearAssignedTo;
  final VoidCallback onClearExpiresFrom;
  final VoidCallback onClearExpiresTo;

  const _FilterPanel({
    required this.search,
    required this.onSearchChanged,
    required this.typeFilter,
    required this.onTypeChanged,
    required this.isManufacturer,
    required this.shopFilter,
    required this.shopOptions,
    required this.onShopChanged,
    required this.assignedFrom,
    required this.assignedTo,
    required this.expiresFrom,
    required this.expiresTo,
    required this.onPickAssignedFrom,
    required this.onPickAssignedTo,
    required this.onPickExpiresFrom,
    required this.onPickExpiresTo,
    required this.onClearAssignedFrom,
    required this.onClearAssignedTo,
    required this.onClearExpiresFrom,
    required this.onClearExpiresTo,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            onChanged: onSearchChanged,
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Search product, status, shop…',
              prefixIcon: const Icon(Icons.search, size: 18),
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 10),
          Text('Type',
              style: AppTextStyles.caption
                  .copyWith(color: AppColors.onSurfaceVariant)),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            children: [
              _ChoiceChip(
                label: 'All',
                selected: typeFilter == _ListingTypeFilter.all,
                onTap: () => onTypeChanged(_ListingTypeFilter.all),
              ),
              _ChoiceChip(
                label: 'Own',
                selected: typeFilter == _ListingTypeFilter.own,
                onTap: () => onTypeChanged(_ListingTypeFilter.own),
              ),
              _ChoiceChip(
                label: 'Assigned',
                selected: typeFilter == _ListingTypeFilter.assigned,
                onTap: () => onTypeChanged(_ListingTypeFilter.assigned),
              ),
            ],
          ),
          if (isManufacturer && shopOptions.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text('Shop / Retailer',
                style: AppTextStyles.caption
                    .copyWith(color: AppColors.onSurfaceVariant)),
            const SizedBox(height: 4),
            DropdownButtonFormField<String>(
              initialValue: shopFilter,
              isDense: true,
              decoration: InputDecoration(
                isDense: true,
                filled: true,
                fillColor: Colors.white,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10)),
              ),
              items: [
                const DropdownMenuItem(value: 'all', child: Text('All retailers')),
                for (final name in shopOptions)
                  DropdownMenuItem(value: name, child: Text(name)),
              ],
              onChanged: (v) => onShopChanged(v ?? 'all'),
            ),
          ],
          const SizedBox(height: 10),
          Text('Assigned date',
              style: AppTextStyles.caption
                  .copyWith(color: AppColors.onSurfaceVariant)),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: _DateField(
                  hint: 'From',
                  date: assignedFrom,
                  onTap: onPickAssignedFrom,
                  onClear: onClearAssignedFrom,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _DateField(
                  hint: 'To',
                  date: assignedTo,
                  onTap: onPickAssignedTo,
                  onClear: onClearAssignedTo,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text('Expires date',
              style: AppTextStyles.caption
                  .copyWith(color: AppColors.onSurfaceVariant)),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: _DateField(
                  hint: 'From',
                  date: expiresFrom,
                  onTap: onPickExpiresFrom,
                  onClear: onClearExpiresFrom,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _DateField(
                  hint: 'To',
                  date: expiresTo,
                  onTap: onPickExpiresTo,
                  onClear: onClearExpiresTo,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ChoiceChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _ChoiceChip(
      {required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: AppColors.primary.withValues(alpha: 0.15),
      labelStyle: TextStyle(
          color: selected ? AppColors.primary : AppColors.onSurfaceVariant,
          fontWeight: FontWeight.w700),
      side: BorderSide(color: selected ? AppColors.primary : AppColors.divider),
      backgroundColor: Colors.white,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
    );
  }
}

class _DateField extends StatelessWidget {
  final String hint;
  final DateTime? date;
  final VoidCallback onTap;
  final VoidCallback onClear;
  const _DateField({
    required this.hint,
    required this.date,
    required this.onTap,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.divider),
        ),
        child: Row(
          children: [
            Icon(Icons.calendar_today_outlined,
                size: 13, color: AppColors.onSurfaceVariant),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                date != null ? _fmtDate(date) : hint,
                style: AppTextStyles.caption.copyWith(
                  color: date != null
                      ? AppColors.onSurface
                      : AppColors.onSurfaceVariant,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (date != null)
              InkWell(
                onTap: onClear,
                child: const Icon(Icons.close, size: 13,
                    color: AppColors.onSurfaceVariant),
              ),
          ],
        ),
      ),
    );
  }
}

class _SeatListingCard extends StatefulWidget {
  final SeatListingModel listing;
  final VoidCallback onReleased;
  // Resolved from the manufacturer's retailer network — null for a
  // retailer's own view (there's no "shop" to show, it's their own listing)
  // or when the assigned retailer isn't in the network map.
  final String? shopName;
  const _SeatListingCard({
    required this.listing,
    required this.onReleased,
    this.shopName,
  });

  @override
  State<_SeatListingCard> createState() => _SeatListingCardState();
}

class _SeatListingCardState extends State<_SeatListingCard> {
  bool _releasing = false;

  Future<void> _confirmRelease() async {
    final l = widget.listing;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Release this seat?'),
        content: Text(
          l.isAssigned
              ? 'This removes "${l.productName ?? 'the product'}" from that '
                  'retailer and frees the seat. The product itself is not deleted.'
              : 'This frees the seat used by "${l.productName ?? 'this product'}". '
                  'The product itself is not deleted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Release'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() => _releasing = true);
    try {
      // Full release, not just a status flip: this also takes the retailer's
      // copy of the product offline and off the marketplace. Web's
      // subscription page calls the same removeProductAssignment — using a
      // bare status update here left the product live and orderable from a
      // retailer whose seat had just been revoked.
      await ManufacturerRepository().removeProductAssignment(l.id);
      if (mounted) widget.onReleased();
    } catch (e) {
      if (mounted) {
        setState(() => _releasing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not release: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.listing;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 46,
              height: 46,
              child: (l.productImage ?? '').isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: l.productImage!,
                      fit: BoxFit.cover,
                      memCacheWidth: 140,
                      errorWidget: (_, _, _) => _placeholder(),
                      placeholder: (_, _) => _placeholder(),
                    )
                  : _placeholder(),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l.productName?.isNotEmpty == true
                      ? l.productName!
                      : 'Product removed',
                  style: AppTextStyles.bodyMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (widget.shopName?.isNotEmpty == true) ...[
                  const SizedBox(height: 1),
                  Text(
                    widget.shopName!,
                    style: AppTextStyles.caption
                        .copyWith(color: AppColors.onSurfaceVariant),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: (l.isAssigned
                                ? AppColors.secondary
                                : AppColors.primary)
                            .withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        l.isAssigned ? 'Assigned' : 'Own',
                        style: AppTextStyles.caption.copyWith(
                          color: l.isAssigned
                              ? AppColors.secondary
                              : AppColors.primary,
                          fontWeight: FontWeight.w800,
                          fontSize: 9,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'Expires ${_fmtDate(l.expiresAt)}',
                        style: AppTextStyles.caption
                            .copyWith(color: AppColors.onSurfaceVariant),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          _releasing
              ? const Padding(
                  padding: EdgeInsets.all(8),
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : IconButton(
                  tooltip: 'Release seat',
                  icon: const Icon(Icons.link_off, size: 20),
                  color: AppColors.error,
                  onPressed: _confirmRelease,
                ),
        ],
      ),
    );
  }

  Widget _placeholder() => Container(
        color: AppColors.primaryContainer.withValues(alpha: 0.3),
        child: const Icon(Icons.image_outlined,
            color: AppColors.primary, size: 20),
      );
}

class _EmptyNote extends StatelessWidget {
  final IconData icon;
  final String text;
  const _EmptyNote({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.divider),
        ),
        child: Column(
          children: [
            Icon(icon, size: 34, color: AppColors.onSurfaceVariant),
            const SizedBox(height: 8),
            Text(text,
                style: AppTextStyles.bodySmall
                    .copyWith(color: AppColors.onSurfaceVariant)),
          ],
        ),
      );
}

class _ErrorNote extends StatelessWidget {
  final String message;
  const _ErrorNote(this.message);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Text(message,
            style: AppTextStyles.bodySmall.copyWith(color: AppColors.error)),
      );
}
