import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/utils/product_validation.dart';
import '../../../core/widgets/online_delivery_prompt.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../../marketplace/data/catalog_repository.dart';
import '../data/dashboard_repository.dart';
import '../widgets/gst_delivery_fields.dart';
import '../providers/dashboard_provider.dart';
import '../../../core/data/product_schema_repository.dart';
import '../widgets/product_form_sections.dart';
// SeatStats is defined in dashboard_repository.dart

/// Mirrors DEFAULT_LOW_STOCK_THRESHOLD in
/// functions/src/notifications/inventory.ts — shown as the hint on the
/// per-product override so the seller knows what they get by leaving it blank.
const _kDefaultLowStockThreshold = 10;

class InventoryScreen extends ConsumerWidget {
  // Set when arriving via the Profile screen's "Add Product" shortcut
  // (?autoAdd=1) so the add-product sheet opens immediately instead of
  // requiring a second tap on the in-page + button.
  final bool autoOpenAdd;

  /// Product id from an `inventory_added` or `low_stock` notification. Once
  /// the inventory list has loaded, that product's edit sheet opens on its
  /// own — a restock prompt that still needed the seller to find the product
  /// in a long list would not be much of a shortcut.
  final String? focusProductId;

  const InventoryScreen({
    super.key,
    this.autoOpenAdd = false,
    this.focusProductId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);
    return userAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, _) =>
          const Scaffold(body: ErrorView(message: 'Not logged in.')),
      data: (user) {
        if (user == null) {
          return const Scaffold(body: ErrorView(message: 'Not logged in.'));
        }
        return _InventoryBody(
          sellerPhone: user.phone,
          sellerName: user.name,
          autoOpenAdd: autoOpenAdd,
          focusProductId: focusProductId,
        );
      },
    );
  }
}

class _InventoryBody extends ConsumerStatefulWidget {
  final String sellerPhone;
  final String sellerName;
  final bool autoOpenAdd;
  final String? focusProductId;
  const _InventoryBody({
    required this.sellerPhone,
    required this.sellerName,
    this.autoOpenAdd = false,
    this.focusProductId,
  });

  @override
  ConsumerState<_InventoryBody> createState() => _InventoryBodyState();
}

class _InventoryBodyState extends ConsumerState<_InventoryBody> {
  final _searchController = TextEditingController();
  String _searchQuery = '';

  /// Guards the one-shot deep-link open — the listings stream emits on every
  /// Firestore change, and re-opening the sheet on each emission (including
  /// the one caused by saving the edit) would trap the user in it.
  bool _focusHandled = false;

  @override
  void initState() {
    super.initState();
    if (widget.autoOpenAdd) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showAddListingSheet(context, ref);
      });
    }
  }

  /// Opens the edit sheet for [widget.focusProductId] the first time that
  /// product appears in the loaded listings.
  void _maybeOpenFocused(List<ListingModel> listings) {
    final id = widget.focusProductId;
    if (id == null || id.isEmpty || _focusHandled) return;

    ListingModel? match;
    for (final l in listings) {
      // The notification carries the products/{id} doc id, which is the
      // listing id for a seller's own inventory copy.
      if (l.id == id) {
        match = l;
        break;
      }
    }
    if (match == null) return;

    _focusHandled = true;
    final listing = match;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (_) => _EditListingSheet(listing: listing),
      );
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final listingsAsync = ref.watch(myListingsProvider(widget.sellerPhone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text(
          'My Inventory',
          style: AppTextStyles.heading2.copyWith(color: Colors.white),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Colors.white),
            onPressed: () => _showAddListingSheet(context, ref),
          ),
        ],
      ),
      body: listingsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const ErrorView(message: 'Could not load inventory.'),
        data: (listings) {
          _maybeOpenFocused(listings);

          final filteredListings = listings.where((l) {
            final name = (l.productName ?? '').toLowerCase();
            return name.contains(_searchQuery.toLowerCase());
          }).toList();

          return Column(
            children: [
              // Seats Widget — uses real subscription + seatListing counts
              ref
                  .watch(seatStatsProvider(widget.sellerPhone))
                  .when(
                    data: (stats) => Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                      child: Card(
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                          side: BorderSide(
                            color: AppColors.divider.withValues(alpha: 0.5),
                          ),
                        ),
                        color: Colors.white,
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Listing Seats',
                                      style: AppTextStyles.bodyMedium.copyWith(
                                        fontWeight: FontWeight.bold,
                                        color: AppColors.onSurface,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${stats.available} Left',
                                      style: AppTextStyles.heading2.copyWith(
                                        color: AppColors.primary,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${stats.activeUsed} / ${stats.totalPurchased} Used',
                                      style: AppTextStyles.caption.copyWith(
                                        color: AppColors.onSurfaceVariant,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              ElevatedButton.icon(
                                onPressed: () => context.push('/subscription'),
                                icon: const Icon(
                                  Icons.add_shopping_cart,
                                  size: 16,
                                  color: Colors.white,
                                ),
                                label: const Text(
                                  'Buy More Seats',
                                  style: TextStyle(color: Colors.white),
                                ),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.primary,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 16,
                                    vertical: 12,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    loading: () => const SizedBox.shrink(),
                    error: (_, _) => const SizedBox.shrink(),
                  ),
              // Search bar
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search by product name…',
                    prefixIcon: const Icon(
                      Icons.search,
                      color: AppColors.onSurfaceVariant,
                    ),
                    suffixIcon: _searchQuery.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _searchQuery = '');
                            },
                          )
                        : null,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: AppColors.divider),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(
                        color: AppColors.primary,
                        width: 2,
                      ),
                    ),
                    fillColor: Colors.white,
                    filled: true,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                  ),
                  onChanged: (val) {
                    setState(() => _searchQuery = val.trim());
                  },
                ),
              ),
              // List of listings
              Expanded(
                child: filteredListings.isEmpty
                    ? EmptyState(
                        title: _searchQuery.isNotEmpty
                            ? 'No matches'
                            : 'No listings yet',
                        subtitle: _searchQuery.isNotEmpty
                            ? 'Try another search query'
                            : 'Tap + to add your first product',
                        icon: Icons.inventory_2_outlined,
                        actionLabel: _searchQuery.isNotEmpty
                            ? null
                            : 'Add Listing',
                        onAction: _searchQuery.isNotEmpty
                            ? null
                            : () => _showAddListingSheet(context, ref),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: filteredListings.length,
                        itemBuilder: (_, i) => _ListingTile(
                          listing: filteredListings[i],
                          sellerPhone: widget.sellerPhone,
                          ref: ref,
                        ),
                      ),
              ),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddListingSheet(context, ref),
        backgroundColor: AppColors.primary,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  void _showAddListingSheet(BuildContext context, WidgetRef ref) {
    final seatStatsAsync = ref.read(seatStatsProvider(widget.sellerPhone));
    final stats = seatStatsAsync.asData?.value;
    if (stats != null && (stats.totalPurchased <= 0 || stats.available <= 0)) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Seat Limit Reached'),
          content: Text(
            stats.totalPurchased <= 0
                ? 'You do not have an active subscription. Please purchase seats to add products to your store.'
                : 'You have used all ${stats.totalPurchased} available seats. Please purchase additional seats to add more products.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(ctx);
                context.push('/subscription');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
              ),
              child: const Text(
                'Buy More Seats',
                style: TextStyle(color: Colors.white),
              ),
            ),
          ],
        ),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _AddListingSheet(
        sellerPhone: widget.sellerPhone,
        sellerName: widget.sellerName,
      ),
    );
  }
}

class _ListingTile extends StatelessWidget {
  final ListingModel listing;
  final String sellerPhone;
  final WidgetRef ref;

  const _ListingTile({
    required this.listing,
    required this.sellerPhone,
    required this.ref,
  });

  @override
  Widget build(BuildContext context) {
    final lastUpdatedStr = listing.updatedAt != null
        ? DateFormat('MMM d, yyyy, h:mm a').format(listing.updatedAt!)
        : 'Not updated';

    final isAssigned = listing.assignedByManufacturerPhone != null;
    final sourceLabel = isAssigned ? 'Assigned' : 'Own Inventory';

    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: AppColors.divider.withValues(alpha: 0.5)),
      ),
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: SizedBox(
                    width: 60,
                    height: 60,
                    child: listing.imageUrl != null
                        ? CachedNetworkImage(
                            memCacheWidth: 1000,
                            imageUrl: listing.imageUrl!,
                            fit: BoxFit.cover,
                            placeholder: (_, _) => const Icon(
                              Icons.inventory_2_outlined,
                              color: AppColors.primaryLight,
                            ),
                            errorWidget: (_, _, _) => const Icon(
                              Icons.inventory_2_outlined,
                              color: AppColors.primaryLight,
                            ),
                          )
                        : const Icon(
                            Icons.inventory_2_outlined,
                            color: AppColors.primaryLight,
                          ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        listing.productName ??
                            'Product ${listing.catalogId.substring(0, 8)}...',
                        style: AppTextStyles.bodyMedium.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          if (listing.category != null) ...[
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.primaryContainer.withValues(
                                  alpha: 0.5,
                                ),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                listing.category!,
                                style: AppTextStyles.caption.copyWith(
                                  color: AppColors.primary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                          ],
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: isAssigned
                                  ? Colors.blue.withValues(alpha: 0.1)
                                  : Colors.orange.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              sourceLabel,
                              style: AppTextStyles.caption.copyWith(
                                color: isAssigned
                                    ? Colors.blue[700]
                                    : Colors.orange[800],
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: listing.isActive
                                  ? AppColors.success.withValues(alpha: 0.1)
                                  : AppColors.error.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              listing.isActive ? 'Active' : 'Inactive',
                              style: AppTextStyles.caption.copyWith(
                                color: listing.isActive
                                    ? AppColors.success
                                    : AppColors.error,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Variants and prices
            if (listing.variants.isNotEmpty) ...[
              Text(
                'Variants:',
                style: AppTextStyles.caption.copyWith(
                  fontWeight: FontWeight.bold,
                  color: AppColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: listing.variants.map((v) {
                  return Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceVariant.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: AppColors.divider.withValues(alpha: 0.5),
                      ),
                    ),
                    child: Text(
                      '${v.label} · ₹${v.price.toStringAsFixed(0)} (${v.stock ?? 0})',
                      style: AppTextStyles.caption.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 8),
            ] else ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Price: ${CurrencyUtils.format(listing.price)}',
                    style: AppTextStyles.bodyMedium.copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppColors.primary,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: listing.isInStock
                          ? AppColors.success.withValues(alpha: 0.1)
                          : AppColors.error.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      listing.isInStock
                          ? 'In Stock (${listing.stockQuantity})'
                          : 'Out of Stock',
                      style: AppTextStyles.caption.copyWith(
                        color: listing.isInStock
                            ? AppColors.success
                            : AppColors.error,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],

            // Last updated and discount info
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Last Updated: $lastUpdatedStr',
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.onSurfaceVariant.withValues(alpha: 0.8),
                  ),
                ),
                if (listing.discount != null && listing.discount!.isActive)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.secondary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      '${listing.discount!.percentage.toInt()}% OFF',
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.secondary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
            ),
            const Divider(height: 24),

            // Actions
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                  onPressed: () => _handleAction('discount', context),
                  icon: const Icon(Icons.percent, size: 16),
                  label: const Text('Discount'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.secondary,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton.icon(
                  onPressed: () => _handleAction('edit', context),
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: const Text('Edit'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton.icon(
                  onPressed: () => _handleAction('delete', context),
                  icon: const Icon(Icons.delete_outline, size: 16),
                  label: const Text('Delete'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.error,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _handleAction(String action, BuildContext context) {
    switch (action) {
      case 'edit':
        showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          builder: (_) => _EditListingSheet(listing: listing),
        );
      case 'discount':
        showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          builder: (_) => _DiscountSheet(listing: listing),
        );
      case 'delete':
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Delete Listing'),
            content: const Text('Remove this product from your store?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: AppColors.error),
                onPressed: () async {
                  Navigator.pop(ctx);
                  await DashboardRepository().deleteListing(
                    listing.id,
                    collectionPath: listing.collectionPath,
                  );
                },
                child: const Text('Delete'),
              ),
            ],
          ),
        );
    }
  }
}

// ── Add Listing Sheet ─────────────────────────────────────────────────────────

class _AddListingSheet extends ConsumerStatefulWidget {
  final String sellerPhone;
  final String sellerName;
  const _AddListingSheet({required this.sellerPhone, required this.sellerName});

  @override
  ConsumerState<_AddListingSheet> createState() => _AddListingSheetState();
}

class _AddListingSheetState extends ConsumerState<_AddListingSheet> {
  final _nameCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _stockCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _customUnitCtrl = TextEditingController();
  final _customSizeCtrl = TextEditingController();

  CatalogModel? _selectedCatalog;
  String _category = 'Fertilizers';
  String _selectedUnit = 'KG';
  String _selectedSize = '1';

  final List<VariantModel> _variants = [];
  List<TextEditingController> _imageUrlCtrls = [];
  final List<File?> _imageFiles = List.filled(5, null);

  bool _gstApplicable = false;
  double _gstRate = 18.0;
  // GST is INCLUDED in the entered price by default (web's business rule).
  bool _gstIncluded = true;
  bool _freeDelivery = false;
  final _extraDeliveryCtrl = TextEditingController();
  // Matches web's add-product-inventory-form.tsx exactly: "New products
  // default to offline; seller opts in when account delivery is enabled."
  // This used to default to 'online_delivery', so every product added from
  // the app went live for home delivery — GST or not, account delivery
  // switched on or not — the moment a seller tapped Add, without them ever
  // touching this field.
  String _sellMode = 'offline_store_only';

  // Account-level "Online Delivery" flag (users/{phone}.onlineDelivery,
  // toggled from Settings, gated there behind a GST number). null while
  // loading. Mirrors web's `accountDeliveryEnabled`: the GST/Sell Mode
  // section below only appears once this is true, so a seller who never
  // turned delivery on never sees a toggle that would silently commit them
  // to it.
  bool? _accountDeliveryEnabled;

  // Web-parity product detail fields (see product_form_sections.dart).
  // categoryInfo values are String, except `chips` fields which are
  // List<String> — the same shape web writes.
  final Map<String, dynamic> _categoryInfo = {};
  List<Map<String, String>> _composition = [];
  List<Map<String, String>> _customFields = [];
  String _videoUrl = '';

  bool _saving = false;
  final _catalogRepo = CatalogRepository();
  List<CatalogModel> _catalogOptions = [];
  List<CatalogModel> _suggestions = [];

  @override
  void initState() {
    super.initState();
    _imageUrlCtrls = List.generate(5, (_) => TextEditingController());
    _catalogRepo.fetchAllMergedProducts().then((list) {
      if (mounted) {
        setState(() {
          _catalogOptions = list;
        });
      }
    });
    _refreshAccountDelivery();
  }

  Future<void> _refreshAccountDelivery() async {
    final isManufacturer =
        ref.read(currentUserProvider).value?.isManufacturer ?? false;
    final enabled = await DashboardRepository().fetchAccountOnlineDelivery(
      widget.sellerPhone,
      isManufacturer: isManufacturer,
    );
    if (mounted) setState(() => _accountDeliveryEnabled = enabled);
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _descCtrl.dispose();
    _priceCtrl.dispose();
    _stockCtrl.dispose();
    _addressCtrl.dispose();
    _customUnitCtrl.dispose();
    _customSizeCtrl.dispose();
    _extraDeliveryCtrl.dispose();
    for (final c in _imageUrlCtrls) {
      c.dispose();
    }
    super.dispose();
  }

  void _addVariantSize() {
    final price = double.tryParse(_priceCtrl.text.trim());
    final stock = int.tryParse(_stockCtrl.text.trim());
    if (price == null || stock == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter valid Price and Stock.')),
      );
      return;
    }

    final unit = _selectedUnit == 'Custom'
        ? _customUnitCtrl.text.trim()
        : _selectedUnit;
    final size = _selectedSize == 'Custom'
        ? _customSizeCtrl.text.trim()
        : _selectedSize;
    if (unit.isEmpty || size.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please choose unit and package size.')),
      );
      return;
    }

    final label = '$size $unit';
    setState(() {
      _variants.add(VariantModel(label: label, price: price, stock: stock));
      _priceCtrl.clear();
      _stockCtrl.clear();
      _customSizeCtrl.clear();
    });
  }

  Future<void> _pickImage(int index) async {
    final picker = ImagePicker();
    final source = await showDialog<ImageSource>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Select image source'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, ImageSource.camera),
            child: const Text('Camera'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, ImageSource.gallery),
            child: const Text('Gallery'),
          ),
        ],
      ),
    );
    if (source == null) return;
    final xFile = await picker.pickImage(
      source: source,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (xFile != null && mounted) {
      final file = File(xFile.path);
      final bytes = await file.length();
      if (bytes > 5 * 1024 * 1024) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Image must be less than 5MB')),
          );
        }
        return;
      }
      setState(() => _imageFiles[index] = file);
    }
  }

  Widget _buildImageRow(int index) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _imageUrlCtrls[index],
              decoration: InputDecoration(
                labelText: index == 0 ? 'Main image URL' : 'Image ${index + 1} URL',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          GestureDetector(
            onTap: () => _pickImage(index),
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.surfaceVariant,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.divider),
              ),
              child: _imageFiles[index] != null
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.file(
                        _imageFiles[index]!,
                        fit: BoxFit.cover,
                      ),
                    )
                  : const Icon(
                      Icons.add_photo_alternate_outlined,
                      size: 24,
                      color: AppColors.onSurfaceVariant,
                    ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Stack(
        children: [
          SingleChildScrollView(
            padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 20,
              bottom: MediaQuery.of(context).viewInsets.bottom + 100,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Add Product',
                      style: AppTextStyles.heading2,
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Product Name Autofill
                Text(
                  'Product Name *',
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _nameCtrl,
                  decoration: InputDecoration(
                    hintText: 'Search existing catalogue to auto-fill...',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onChanged: (val) {
                    setState(() {
                      final query = val.toLowerCase().trim();
                      if (query.isEmpty) {
                        _suggestions = [];
                      } else {
                        _suggestions = _catalogOptions
                            .where((c) => c.name.toLowerCase().contains(query))
                            .toList();
                      }
                    });
                  },
                ),
                if (_suggestions.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    constraints: const BoxConstraints(maxHeight: 150),
                    decoration: BoxDecoration(
                      border: Border.all(color: AppColors.divider),
                      borderRadius: BorderRadius.circular(12),
                      color: Colors.grey[50],
                    ),
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: _suggestions.length,
                      itemBuilder: (ctx, idx) {
                        final cat = _suggestions[idx];
                        return ListTile(
                          title: Text(cat.name),
                          subtitle: Text(cat.category),
                          onTap: () {
                            setState(() {
                              _selectedCatalog = cat;
                              _nameCtrl.text = cat.name;
                              _category = cat.category;
                              _descCtrl.text = cat.description ?? '';
                              if (cat.images.isNotEmpty) {
                                for (
                                  int i = 0;
                                  i < cat.images.length && i < 5;
                                  i++
                                ) {
                                  _imageUrlCtrls[i].text = cat.images[i];
                                }
                              }
                              _suggestions = [];
                            });
                          },
                        );
                      },
                    ),
                  ),
                ],
                const SizedBox(height: 16),

                // Category
                Text(
                  'Category *',
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                // Categories come from `settings/productSchema` — the same doc
                // the web dashboard reads — so the two platforms can never
                // drift apart again, and a new category doesn't need an app
                // release. This list used to be hardcoded here and had already
                // diverged from web's: it offered Irrigation/Organic (which no
                // product uses) while missing Bio-Stimulants, and neither
                // platform offered Adjuvants despite 333 products using it.
                Builder(
                  builder: (context) {
                    final schema = ref.watch(productSchemaProvider).value ??
                        ProductSchemaRepository.fallback;
                    final categories = schema.categories;
                    // A product saved under a category no longer in the list
                    // (legacy 'Irrigation', a free-text value, or a category
                    // added on web after this build) must still round-trip
                    // rather than silently resetting the seller's choice.
                    final options = categories.contains(_category)
                        ? categories
                        : [_category, ...categories];
                    return DropdownButtonFormField<String>(
                      // ignore: deprecated_member_use
                      value: _category,
                      isExpanded: true,
                      decoration: InputDecoration(
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      items: options
                          .map(
                            (c) => DropdownMenuItem(value: c, child: Text(c)),
                          )
                          .toList(),
                      onChanged: (v) =>
                          setState(() => _category = v ?? _category),
                    );
                  },
                ),
                const SizedBox(height: 16),

                // Description
                Text(
                  'Description',
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _descCtrl,
                  maxLines: 2,
                  // Rebuild on every keystroke so the counter below tracks live,
                  // the same feedback the web form gives.
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Crop suitability, yield, dosage, soil type...',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    errorText: validateDescription(_descCtrl.text),
                    counterText: '',
                  ),
                ),
                const SizedBox(height: 4),
                Align(
                  alignment: Alignment.centerRight,
                  child: Text(
                    '${_descCtrl.text.length}/$kDescriptionMaxLength',
                    style: AppTextStyles.caption.copyWith(
                      color: isDescriptionInvalid(_descCtrl.text)
                          ? AppColors.error
                          : AppColors.onSurfaceVariant,
                      fontWeight: isDescriptionInvalid(_descCtrl.text)
                          ? FontWeight.w700
                          : FontWeight.w400,
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // ── Web-parity sections ─────────────────────────────────
                // Order matches the web Add Product form: Category Info →
                // Composition → Additional Information, between Description
                // and Pack Sizes.
                Builder(
                  builder: (context) {
                    final schema = ref.watch(productSchemaProvider).value ??
                        ProductSchemaRepository.fallback;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        CategoryInfoSection(
                          schema: schema,
                          category: _category,
                          values: _categoryInfo,
                          onChanged: (key, value) {
                            // No setState: the editors hold their own text
                            // state, and rebuilding here would fight the
                            // cursor position while typing.
                            _categoryInfo[key] = value;
                          },
                        ),
                        if (schema.showsComposition(_category))
                          KeyValueRowsSection(
                            title: 'Composition',
                            subtitle:
                                'Ingredients & nutrients shown on the product page',
                            keyName: 'name',
                            valueName: 'value',
                            keyLabel: 'Component / Ingredient',
                            valueLabel: 'Value / %',
                            addLabel: 'Add component',
                            rows: _composition,
                            onChanged: (rows) => _composition = rows,
                          ),
                        KeyValueRowsSection(
                          title: 'Additional Information',
                          subtitle: 'Any other detail buyers should see',
                          keyName: 'title',
                          valueName: 'value',
                          keyLabel: 'Title',
                          valueLabel: 'Value',
                          addLabel: 'Add information',
                          rows: _customFields,
                          onChanged: (rows) => _customFields = rows,
                        ),
                      ],
                    );
                  },
                ),

                // Variants list
                Text(
                  'Pack Sizes & Prices',
                  style: AppTextStyles.heading3.copyWith(
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(height: 12),

                if (_variants.isNotEmpty) ...[
                  ..._variants.asMap().entries.map((e) {
                    final i = e.key;
                    final v = e.value;
                    return Card(
                      color: AppColors.primaryContainer.withValues(alpha: 0.1),
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        title: Text(
                          v.label,
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: Text(
                          'Price: ₹${v.price.toStringAsFixed(0)} · Stock: ${v.stock ?? 0}',
                        ),
                        trailing: IconButton(
                          icon: const Icon(
                            Icons.delete_outline,
                            color: AppColors.error,
                          ),
                          onPressed: () =>
                              setState(() => _variants.removeAt(i)),
                        ),
                      ),
                    );
                  }),
                  const SizedBox(height: 12),
                ],

                // Step 1: Unit
                Text(
                  'Step 1 — Unit',
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children:
                      [
                        'gm',
                        'KG',
                        'ml',
                        'L',
                        'Packet',
                        'Piece',
                        'Bottle',
                        'Can',
                        'Custom',
                      ].map((u) {
                        return ChoiceChip(
                          label: Text(u),
                          selected: _selectedUnit == u,
                          selectedColor: AppColors.primaryContainer,
                          onSelected: (_) => setState(() => _selectedUnit = u),
                        );
                      }).toList(),
                ),
                if (_selectedUnit == 'Custom') ...[
                  const SizedBox(height: 8),
                  TextField(
                    controller: _customUnitCtrl,
                    decoration: InputDecoration(
                      labelText: 'Custom Unit',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 16),

                // Step 2: Package Size
                Text(
                  'Step 2 — Package Size',
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: ['1', '2', '5', '10', '25', '50', 'Custom'].map((
                    sz,
                  ) {
                    return ChoiceChip(
                      label: Text(sz),
                      selected: _selectedSize == sz,
                      selectedColor: AppColors.primaryContainer,
                      onSelected: (_) => setState(() => _selectedSize = sz),
                    );
                  }).toList(),
                ),
                if (_selectedSize == 'Custom') ...[
                  const SizedBox(height: 8),
                  TextField(
                    controller: _customSizeCtrl,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: 'Custom Package Size',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 16),

                // Package Price & Stock
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _priceCtrl,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          labelText: 'Price (₹) *',
                          prefixText: '₹ ',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _stockCtrl,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          labelText: 'Stock Qty *',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                OutlinedButton.icon(
                  onPressed: _addVariantSize,
                  icon: const Icon(Icons.add),
                  label: const Text('Add another size'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(color: AppColors.primary),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // Product Images
                Text(
                  'Product Images (up to 5)',
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),

                ...List.generate(5, (i) => _buildImageRow(i)),
                const SizedBox(height: 16),

                // Matches web's field order: video comes right after images,
                // before GST & Delivery. Used to sit above Pack Sizes instead.
                ProductVideoSection(
                  initialValue: _videoUrl,
                  onChanged: (v) => _videoUrl = v,
                ),

                // Store Address
                Text(
                  'Store Address (Optional)',
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _addressCtrl,
                  decoration: InputDecoration(
                    hintText: 'Store location/address...',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
                // ── GST & Sell Mode ──────────────────────────────────────
                // Matches web exactly: this whole section is hidden until
                // Online Delivery is switched on for the ACCOUNT (Settings),
                // which itself requires a GST number. A seller who hasn't
                // done that never sees a toggle that could commit them to
                // online selling — the product is simply created offline.
                const SizedBox(height: 16),
                if (_accountDeliveryEnabled == true) ...[
                  GstDeliveryFields(
                    gstApplicable: _gstApplicable,
                    gstRate: _gstRate,
                    gstIncluded: _gstIncluded,
                    freeDelivery: _freeDelivery,
                    extraDeliveryCtrl: _extraDeliveryCtrl,
                    price: double.tryParse(_priceCtrl.text.trim()) ?? 0,
                    onGstApplicable: (v) => setState(() => _gstApplicable = v),
                    onGstRate: (v) => setState(() => _gstRate = v),
                    onGstIncluded: (v) => setState(() => _gstIncluded = v),
                    onFreeDelivery: (v) => setState(() => _freeDelivery = v),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.surfaceVariant,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      child: DropdownButtonFormField<String>(
                        value: _sellMode,
                        decoration: InputDecoration(
                          labelText: 'Sell Mode',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 12,
                          ),
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'online_delivery',
                            child: Text('Online Delivery'),
                          ),
                          DropdownMenuItem(
                            value: 'offline_store_only',
                            child: Text('Offline Store Only'),
                          ),
                        ],
                        onChanged: (v) {
                          if (v != null) setState(() => _sellMode = v);
                        },
                      ),
                    ),
                  ),
                ] else if (_accountDeliveryEnabled == false)
                  OnlineDeliveryPrompt(onReturned: _refreshAccountDelivery),

                const SizedBox(height: 80),
              ],
            ),
          ),

          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              color: Colors.white,
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                height: 50,
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _saving
                      ? const Center(
                          child: SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          ),
                        )
                      : const Text(
                          'Add to Inventory',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter product name.')),
      );
      return;
    }

    // Same rule the web enforces. Without it an over-long description was
    // accepted here and only failed later, with nothing telling the seller why.
    final descError = validateDescription(_descCtrl.text);
    if (descError != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(descError)),
      );
      return;
    }

    // The video field is optional, but a non-empty value that isn't a
    // YouTube link renders nothing on the product page — so reject it here
    // rather than saving something the buyer will never see. Checked
    // explicitly because this sheet is a plain Column, not a Form, so
    // TextFormField validators never run on their own.
    if (_videoUrl.trim().isNotEmpty && extractYouTubeId(_videoUrl) == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter a valid YouTube link, or leave the video empty.'),
        ),
      );
      return;
    }

    // Enforce seat limit before writing
    final seatStats = ref.read(seatStatsProvider(widget.sellerPhone)).value;
    if (seatStats != null && seatStats.available <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
            'No listing seats available. Buy more seats to add this product.',
          ),
          backgroundColor: Colors.orange,
          action: SnackBarAction(
            label: 'Buy seats',
            textColor: Colors.white,
            onPressed: () => context.push('/subscription'),
          ),
        ),
      );
      return;
    }

    final priceInput = double.tryParse(_priceCtrl.text.trim());
    final stockInput = int.tryParse(_stockCtrl.text.trim());
    if (priceInput != null && stockInput != null) {
      final unit = _selectedUnit == 'Custom'
          ? _customUnitCtrl.text.trim()
          : _selectedUnit;
      final size = _selectedSize == 'Custom'
          ? _customSizeCtrl.text.trim()
          : _selectedSize;
      if (unit.isNotEmpty && size.isNotEmpty) {
        final label = '$size $unit';
        if (!_variants.any((v) => v.label == label)) {
          _variants.add(
            VariantModel(label: label, price: priceInput, stock: stockInput),
          );
        }
      }
    }

    double basePrice = 0.0;
    int totalStock = 0;
    if (_variants.isNotEmpty) {
      basePrice = _variants.first.price;
      totalStock = _variants.fold(0, (acc, v) => acc + (v.stock ?? 0));
    } else {
      if (priceInput == null || stockInput == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Please add at least one variant size with price and stock.',
            ),
          ),
        );
        return;
      }
      basePrice = priceInput;
      totalStock = stockInput;
    }

    setState(() => _saving = true);
    try {
      final imageUrls = <String>[];
      for (int i = 0; i < 5; i++) {
        if (_imageFiles[i] != null) {
          final url = await DashboardRepository().uploadListingImage(
            _imageFiles[i]!,
            widget.sellerPhone,
          );
          imageUrls.add(url);
        } else if (_imageUrlCtrls[i].text.trim().isNotEmpty) {
          imageUrls.add(_imageUrlCtrls[i].text.trim());
        }
      }

      final isCopy = _selectedCatalog != null;
      final catalogId =
          _selectedCatalog?.id ??
          FirebaseFirestore.instance.collection('catalog').doc().id;

      await DashboardRepository().addListing(
        sellerPhone: widget.sellerPhone,
        sellerName: widget.sellerName,
        catalogId: catalogId,
        isCopy: isCopy,
        originalProductId: isCopy ? catalogId : null,
        price: basePrice,
        stockQuantity: totalStock,
        sellerAddress: _addressCtrl.text.trim().isNotEmpty
            ? _addressCtrl.text.trim()
            : null,
        variants: _variants,
        images: imageUrls,
        productName: name,
        category: _category,
        description: _descCtrl.text.trim(),
        isActive: true,
        sellMode: _sellMode,
        gstApplicable: _gstApplicable,
        gstRate: _gstApplicable ? _gstRate : 0.0,
        gstIncluded: _gstIncluded,
        freeDelivery: _freeDelivery,
        extraDeliveryCharge: GstDeliveryFields.parseExtra(_extraDeliveryCtrl.text),
        // Drop empty values so a product never carries a blank map/array.
        categoryInfo: Map<String, dynamic>.fromEntries(
          _categoryInfo.entries.where((e) {
            final v = e.value;
            if (v is List) return v.isNotEmpty;
            return v != null && v.toString().trim().isNotEmpty;
          }),
        ),
        composition: _composition,
        customFields: _customFields,
        videoUrl: _videoUrl,
      );

      // No account-level write here on purpose. The ACCOUNT flag
      // (users/{phone}.onlineDelivery) is only ever switched on via the
      // gated toggle in Settings, which requires a GST number first — same
      // as web, where Add Product never touches it either. This form can
      // only produce sellMode: 'online_delivery' at all when that flag is
      // already true (see the GST & Sell Mode section above), so there is
      // nothing left to sync here; the auto-write this used to do was
      // exactly how a product silently enabled online delivery for the
      // whole account with no GST and no confirmation.

      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        final msg = e.toString().replaceAll('Exception: ', '');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor: Colors.red.shade700,
            duration: const Duration(seconds: 4),
            action: msg.toLowerCase().contains('seat')
                ? SnackBarAction(
                    label: 'Buy Seats',
                    textColor: Colors.white,
                    onPressed: () => context.push('/subscription'),
                  )
                : null,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

// ── Edit Listing Sheet ────────────────────────────────────────────────────────

const _kUnitTypes = [
  'gm',
  'KG',
  'ml',
  'L',
  'Packet',
  'Piece',
  'Bottle',
  'Can',
  'Custom',
];

class _EditListingSheet extends StatefulWidget {
  final ListingModel listing;
  const _EditListingSheet({required this.listing});

  @override
  State<_EditListingSheet> createState() => _EditListingSheetState();
}

class _EditListingSheetState extends State<_EditListingSheet> {
  late final TextEditingController _priceCtrl;
  late final TextEditingController _stockCtrl;
  late final TextEditingController _lowStockCtrl;
  final List<File?> _imageFiles = List.filled(5, null);

  bool _gstApplicable = false;
  double _gstRate = 18.0;
  bool _gstIncluded = true;
  bool _freeDelivery = false;
  late final TextEditingController _extraDeliveryCtrl;
  String _sellMode = 'online_delivery';
  bool _saving = false;

  // Same account-level gate as the Add Listing sheet — see its comment.
  // null while loading.
  bool? _accountDeliveryEnabled;

  // Active toggle
  late bool _isActive;

  // Variants
  late List<_VariantEntry> _variants;
  String _selectedUnit = 'KG';

  // Image URLs (up to 5)
  late List<TextEditingController> _imageUrlCtrls;

  // Discount
  late bool _discountActive;
  late double _discountPct;

  @override
  void initState() {
    super.initState();
    _priceCtrl = TextEditingController(
      text: widget.listing.price.toStringAsFixed(0),
    );
    _stockCtrl = TextEditingController(text: '${widget.listing.stockQuantity}');
    // Blank means "unset" — the server's default of 10 applies until the
    // seller picks a number of their own.
    _lowStockCtrl = TextEditingController(
      text: widget.listing.lowStockThreshold?.toString() ?? '',
    );
    _isActive = widget.listing.isActive;
    _gstApplicable = widget.listing.gstApplicable ?? false;
    // A stored rate of 0 with GST off means "never set": offer 18 as the start.
    _gstRate = (widget.listing.gstRate ?? 0) > 0 ? widget.listing.gstRate! : 18.0;
    _gstIncluded = widget.listing.gstIncluded;
    _freeDelivery = widget.listing.freeDelivery;
    _extraDeliveryCtrl = TextEditingController(
      text: widget.listing.extraDeliveryCharge > 0
          ? widget.listing.extraDeliveryCharge.toString().replaceFirst(RegExp(r'\.0$'), '')
          : '',
    );
    _sellMode = widget.listing.sellMode ?? 'online_delivery';
    _variants = widget.listing.variants
        .map(
          (v) => _VariantEntry(label: v.label, price: v.price, stock: v.stock ?? 0),
        )
        .toList();
    // Initialize image URL controllers from existing images
    final existingUrls = widget.listing.images;
    _imageUrlCtrls = List.generate(5, (i) {
      return TextEditingController(
        text: i < existingUrls.length ? existingUrls[i] : '',
      );
    });
    _discountActive = widget.listing.discount?.isActive ?? false;
    _discountPct = widget.listing.discount?.percentage ?? 10;

    _refreshAccountDelivery();
  }

  Future<void> _refreshAccountDelivery() async {
    final enabled = await DashboardRepository().fetchAccountOnlineDelivery(
      widget.listing.sellerPhone,
      isManufacturer: widget.listing.sellerType == 'manufacturer',
    );
    if (mounted) setState(() => _accountDeliveryEnabled = enabled);
  }

  @override
  void dispose() {
    _priceCtrl.dispose();
    _stockCtrl.dispose();
    _lowStockCtrl.dispose();
    _extraDeliveryCtrl.dispose();
    for (final c in _imageUrlCtrls) {
      c.dispose();
    }
    for (final v in _variants) {
      v.dispose();
    }
    super.dispose();
  }

  void _addVariant() {
    setState(() => _variants.add(_VariantEntry(label: '', price: 0, stock: 0)));
  }

  void _removeVariant(int i) {
    setState(() => _variants.removeAt(i));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Edit Listing', style: AppTextStyles.heading2),
            const SizedBox(height: 12),

            // Active/Inactive toggle
            Container(
              decoration: BoxDecoration(
                color: AppColors.surfaceVariant,
                borderRadius: BorderRadius.circular(12),
              ),
              child: SwitchListTile(
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 4,
                ),
                title: Text(
                  _isActive ? 'Active' : 'Inactive',
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: Text(
                  _isActive
                      ? 'Visible to customers'
                      : 'Hidden from marketplace',
                  style: AppTextStyles.caption,
                ),
                value: _isActive,
                activeThumbColor: AppColors.primary,
                onChanged: (v) => setState(() => _isActive = v),
              ),
            ),
            const SizedBox(height: 16),

            // ── GST & Sell Mode ──────────────────────────────────────
            // Same account-level gate as Add Listing — see its comment.
            if (_accountDeliveryEnabled == true) ...[
              GstDeliveryFields(
                gstApplicable: _gstApplicable,
                gstRate: _gstRate,
                gstIncluded: _gstIncluded,
                freeDelivery: _freeDelivery,
                extraDeliveryCtrl: _extraDeliveryCtrl,
                price: double.tryParse(_priceCtrl.text.trim()) ?? 0,
                discountPct: _discountActive ? _discountPct : 0,
                onGstApplicable: (v) => setState(() => _gstApplicable = v),
                onGstRate: (v) => setState(() => _gstRate = v),
                onGstIncluded: (v) => setState(() => _gstIncluded = v),
                onFreeDelivery: (v) => setState(() => _freeDelivery = v),
              ),
              const SizedBox(height: 12),
              Container(
                decoration: BoxDecoration(
                  color: AppColors.surfaceVariant,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: DropdownButtonFormField<String>(
                    value: _sellMode,
                    decoration: InputDecoration(
                      labelText: 'Sell Mode',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 12,
                      ),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'online_delivery',
                        child: Text('Online Delivery'),
                      ),
                      DropdownMenuItem(
                        value: 'offline_store_only',
                        child: Text('Offline Store Only'),
                      ),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _sellMode = v);
                    },
                  ),
                ),
              ),
            ] else if (_accountDeliveryEnabled == false)
              OnlineDeliveryPrompt(onReturned: _refreshAccountDelivery),
            const SizedBox(height: 16),

            // Base price & stock
            TextField(
              controller: _priceCtrl,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Base Price (₹)',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                prefixText: '₹ ',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _stockCtrl,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Stock Quantity',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Drives the low_stock notification (notifyLowStock, Cloud
            // Functions). Left blank, the server default of 10 applies.
            TextField(
              controller: _lowStockCtrl,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Low stock alert at',
                hintText: '$_kDefaultLowStockThreshold',
                helperText:
                    'Get notified when stock drops to this level or below.',
                helperMaxLines: 2,
                prefixIcon: const Icon(Icons.notifications_active_outlined),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ── Pack sizes / variants ──────────────────────────────────────
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Pack Sizes', style: AppTextStyles.bodyMedium),
                TextButton.icon(
                  onPressed: _addVariant,
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Add Size'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.primary,
                  ),
                ),
              ],
            ),
            // Unit type chips
            Wrap(
              spacing: 6,
              children: _kUnitTypes
                  .map(
                    (u) => ChoiceChip(
                      label: Text(u, style: AppTextStyles.caption),
                      selected: _selectedUnit == u,
                      selectedColor: AppColors.primaryContainer,
                      onSelected: (_) => setState(() => _selectedUnit = u),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 8),
            ..._variants.asMap().entries.map((e) {
              final i = e.key;
              final v = e.value;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: TextField(
                        controller: v.labelCtrl,
                        decoration: InputDecoration(
                          labelText: 'Size (e.g. 1 $_selectedUnit)',
                          border: const OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      flex: 2,
                      child: TextField(
                        controller: v.priceCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: '₹ Price',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      flex: 2,
                      child: TextField(
                        controller: v.stockCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Stock',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(
                        Icons.remove_circle_outline,
                        color: AppColors.error,
                        size: 20,
                      ),
                      onPressed: () => _removeVariant(i),
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: 16),

            // ── Product images ─────────────────────────────────────────────
            Text(
              'Product Images (up to 5)',
              style: AppTextStyles.bodyMedium.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 12),
            // Main image — file picker or URL
            ...List.generate(5, (i) => _buildImageRow(i)),
            const SizedBox(height: 16),

            // ── Discount ───────────────────────────────────────────────────
            Text('Discount', style: AppTextStyles.bodyMedium),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                _discountActive
                    ? '${_discountPct.toInt()}% off'
                    : 'No discount',
                style: AppTextStyles.body,
              ),
              value: _discountActive,
              activeThumbColor: AppColors.primary,
              onChanged: (v) => setState(() => _discountActive = v),
            ),
            if (_discountActive)
              Slider(
                value: _discountPct,
                min: 1,
                max: 80,
                divisions: 79,
                label: '${_discountPct.toInt()}%',
                activeColor: AppColors.primary,
                onChanged: (v) => setState(() => _discountPct = v),
              ),
            const SizedBox(height: 20),

            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                ),
                child: _saving
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Save Changes'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickImage(int index) async {
    final picker = ImagePicker();
    final source = await showDialog<ImageSource>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Select image source'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, ImageSource.camera),
            child: const Text('Camera'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, ImageSource.gallery),
            child: const Text('Gallery'),
          ),
        ],
      ),
    );
    if (source == null) return;
    final xFile = await picker.pickImage(
      source: source,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (xFile != null && mounted) {
      final file = File(xFile.path);
      final bytes = await file.length();
      if (bytes > 5 * 1024 * 1024) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Image must be less than 5MB')),
          );
        }
        return;
      }
      setState(() => _imageFiles[index] = file);
    }
  }

  Widget _buildImageRow(int index) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _imageUrlCtrls[index],
              decoration: InputDecoration(
                labelText: index == 0 ? 'Main image URL' : 'Image ${index + 1} URL',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          GestureDetector(
            onTap: () => _pickImage(index),
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.surfaceVariant,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.divider),
              ),
              child: _imageFiles[index] != null
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.file(
                        _imageFiles[index]!,
                        fit: BoxFit.cover,
                      ),
                    )
                  : const Icon(
                      Icons.add_photo_alternate_outlined,
                      size: 24,
                      color: AppColors.onSurfaceVariant,
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final price = double.tryParse(_priceCtrl.text.trim());
    final stock = int.tryParse(_stockCtrl.text.trim());
    if (price == null || stock == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid price and stock quantity.')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final imageUrls = <String>[];
      for (int i = 0; i < 5; i++) {
        if (_imageFiles[i] != null) {
          final url = await DashboardRepository().uploadListingImage(
            _imageFiles[i]!,
            widget.listing.sellerPhone,
          );
          imageUrls.add(url);
        } else if (_imageUrlCtrls[i].text.trim().isNotEmpty) {
          imageUrls.add(_imageUrlCtrls[i].text.trim());
        }
      }

      // Collect variants
      final variants = _variants
          .map((v) {
            final label = v.labelCtrl.text.trim();
            final vPrice = double.tryParse(v.priceCtrl.text.trim()) ?? 0;
            final vStock = int.tryParse(v.stockCtrl.text.trim()) ?? 0;
            return VariantModel(label: label, price: vPrice, stock: vStock);
          })
          .where((v) => v.label.isNotEmpty)
          .toList();

      // stockQuantity is the AGGREGATE across pack sizes, so when variants exist
      // it is their sum rather than the flat field. Using the flat number hid the
      // whole product whenever it read 0, even with stock left in other sizes,
      // because availability is derived from it. Matches addListing (totalStock)
      // and the web seller dashboard.
      final effectiveStock = variants.isNotEmpty
          ? variants.fold<int>(0, (acc, v) => acc + (v.stock ?? 0))
          : stock;

      // A blank or non-positive entry means "use the default", stored as null.
      final parsedThreshold = int.tryParse(_lowStockCtrl.text.trim());
      final lowStockThreshold =
          (parsedThreshold != null && parsedThreshold > 0) ? parsedThreshold : null;

      final effectiveDiscountPct = _discountActive ? _discountPct : 0.0;
      // Matches web's edit-product-modal.tsx exactly: if the ACCOUNT's
      // Online Delivery is off, the product is written as offline/no-GST
      // regardless of whatever this sheet's fields currently hold — the
      // section above is hidden in that case, but a stale 'online_delivery'
      // value could otherwise survive from before delivery was turned off.
      final accountGateOpen = _accountDeliveryEnabled != false;
      final effectiveSellMode =
          accountGateOpen ? _sellMode : 'offline_store_only';
      final effectiveGstApplicable = accountGateOpen && _gstApplicable;
      final updates = <String, dynamic>{
        'price': price,
        'stock': effectiveStock > 0 ? 'In Stock' : 'Out of Stock',
        'stockQuantity': effectiveStock,
        'isActive': _isActive,
        // Null clears any per-product override, putting the product back on
        // the server default rather than pinning it at some stale number.
        'lowStockThreshold': lowStockThreshold,
        if (imageUrls.isNotEmpty) 'images': imageUrls,
        if (imageUrls.isNotEmpty) 'imageUrl': imageUrls.first,
        'variants': variants.map((v) => v.toMap()).toList(),
        // Canonical FLAT discount schema (shared with web).
        //
        // `discountType` is deliberately NOT written here. This sheet edits
        // price/stock/percentage and has no type or fixed-amount control, so
        // hardcoding 'percentage' — as it used to — silently converted a
        // seller's fixed-amount (₹) discount set on web into a percentage one
        // every time they edited anything else about the product, leaving a
        // stale discountFixedAmt behind and making the ₹ discount vanish for
        // buyers. Omitting the key leaves whatever type is stored intact; the
        // Discount sheet is where the type is actually chosen.
        'discountEnabled': _discountActive,
        'discountPct': _discountPct,
        'effectiveDiscountPct': effectiveDiscountPct,
        'sellMode': effectiveSellMode,
        'gstApplicable': effectiveGstApplicable,
        'gstRate': effectiveGstApplicable ? _gstRate : 0.0,
        // Same rules as the web's Edit Product: included only when GST applies,
        // and Free Delivery zeroes the extra charge.
        'gstIncluded': effectiveGstApplicable ? _gstIncluded : false,
        'freeDelivery': accountGateOpen && _freeDelivery,
        'extraDeliveryCharge': (accountGateOpen && !_freeDelivery)
            ? GstDeliveryFields.parseExtra(_extraDeliveryCtrl.text)
            : 0.0,
        'isOnline': effectiveSellMode != 'offline_store_only',
      };

      final repo = DashboardRepository();
      await repo.updateListing(
        widget.listing.id,
        updates,
        collectionPath: widget.listing.collectionPath,
      );
      // Keep the marketplace availability[] mirror and the seller's inventory
      // doc (read by the web dashboard) in sync (price/stock/discount).
      if (widget.listing.collectionPath == 'products') {
        await repo.syncMarketMirror(
          widget.listing.id,
          sellingPrice: price,
          stockLevel: effectiveStock > 0 ? 'In Stock' : 'Out of Stock',
          discountPct: effectiveDiscountPct,
          isProductActive: _isActive,
          isOnline: effectiveSellMode != 'offline_store_only',
        );
        await repo.syncInventoryDoc(
          widget.listing.id,
          sellingPrice: price,
          stockQuantity: effectiveStock,
          isProductActive: _isActive,
          discountEnabled: _discountActive,
          discountPct: _discountPct,
          effectiveDiscountPct: effectiveDiscountPct,
          gstApplicable: effectiveGstApplicable,
          gstRate: effectiveGstApplicable ? _gstRate : 0.0,
          gstIncluded: _gstIncluded,
          extraDeliveryCharge: GstDeliveryFields.parseExtra(_extraDeliveryCtrl.text),
          freeDelivery: accountGateOpen && _freeDelivery,
        );
      }

      // No account-level write here — same reasoning as Add Listing. The
      // ACCOUNT flag only ever changes via the gated Settings toggle
      // (GST required first); this sheet can only produce
      // effectiveSellMode: 'online_delivery' when that flag is already
      // true, so there is nothing to sync, and auto-writing it here was
      // exactly how editing an unrelated field (price, stock…) could
      // silently commit the whole account to online selling.

      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        final msg = e.toString().replaceAll('Exception: ', '');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor: Colors.red.shade700,
            duration: const Duration(seconds: 4),
            action: msg.toLowerCase().contains('seat')
                ? SnackBarAction(
                    label: 'Buy Seats',
                    textColor: Colors.white,
                    onPressed: () => context.push('/subscription'),
                  )
                : null,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _VariantEntry {
  final TextEditingController labelCtrl;
  final TextEditingController priceCtrl;
  final TextEditingController stockCtrl;

  _VariantEntry({
    required String label,
    required double price,
    required int stock,
  }) : labelCtrl = TextEditingController(text: label),
       priceCtrl = TextEditingController(
         text: price > 0 ? price.toStringAsFixed(0) : '',
       ),
       stockCtrl = TextEditingController(text: stock > 0 ? '$stock' : '');

  void dispose() {
    labelCtrl.dispose();
    priceCtrl.dispose();
    stockCtrl.dispose();
  }
}

// ── Discount Sheet ────────────────────────────────────────────────────────────

class _DiscountSheet extends StatefulWidget {
  final ListingModel listing;
  const _DiscountSheet({required this.listing});

  @override
  State<_DiscountSheet> createState() => _DiscountSheetState();
}

class _DiscountSheetState extends State<_DiscountSheet> {
  late bool _isActive;
  late double _percentage;
  /// 'percentage' | 'fixed_amount' — matches web's discount-panel type
  /// selector. The app previously offered percentage only, and its save path
  /// hardcoded the type, which silently converted a seller's ₹ discount set
  /// on web into a percentage one.
  late String _type;
  late final TextEditingController _fixedCtrl;
  DateTime? _startDate;
  DateTime? _endDate;
  bool _saving = false;

  // ── Bulk (quantity-tier) discount — independent of the base discount ────
  late bool _bulkEnabled;
  late List<BulkDiscountTierModel> _bulkTiers;

  @override
  void initState() {
    super.initState();
    final d = widget.listing.discount;
    _isActive = d?.isActive ?? false;
    _percentage = d?.percentage ?? 10;
    _type = d?.type ?? 'percentage';
    _fixedCtrl = TextEditingController(
      text: (d?.fixedAmount ?? 0) > 0
          ? (d!.fixedAmount % 1 == 0
              ? d.fixedAmount.toInt().toString()
              : d.fixedAmount.toString())
          : '',
    );
    _startDate = d?.startDate;
    _endDate = d?.endDate;
    _bulkEnabled = widget.listing.bulkDiscountEnabled;
    _bulkTiers = List.of(widget.listing.bulkDiscountTiers);
  }

  void _addTier() {
    final existingQtys = _bulkTiers.map((t) => t.minQty);
    final nextQty = existingQtys.isEmpty
        ? 5
        : existingQtys.reduce((a, b) => a > b ? a : b) + 5;
    final nextPct = _bulkTiers.isEmpty
        ? 5.0
        : (_bulkTiers.last.discountPct + 5).clamp(1, 99).toDouble();
    setState(() => _bulkTiers = [
          ..._bulkTiers,
          BulkDiscountTierModel(minQty: nextQty, discountPct: nextPct),
        ]);
  }

  void _removeTier(int i) =>
      setState(() => _bulkTiers = [..._bulkTiers]..removeAt(i));

  void _updateTier(int i, {int? minQty, double? discountPct}) {
    setState(() {
      final t = _bulkTiers[i];
      _bulkTiers = [..._bulkTiers];
      _bulkTiers[i] = BulkDiscountTierModel(
        minQty: minQty ?? t.minQty,
        discountPct: discountPct ?? t.discountPct,
      );
    });
  }

  @override
  void dispose() {
    _fixedCtrl.dispose();
    super.dispose();
  }

  double get _fixedAmount => double.tryParse(_fixedCtrl.text.trim()) ?? 0;

  /// Live preview of what a buyer pays — the same feedback web's panel gives.
  double get _previewPrice {
    final base = widget.listing.price;
    if (!_isActive) return base;
    final off = _type == 'fixed_amount'
        ? _fixedAmount.clamp(0, base)
        : base * _percentage / 100;
    return (base - off).clamp(0, base);
  }

  /// Mirrors web's validation so the app can't save a discount web rejects.
  String? get _validationError {
    if (_isActive) {
      if (_type == 'fixed_amount') {
        final amt = _fixedAmount;
        if (amt <= 0) return 'Enter a discount amount greater than 0.';
        if (amt >= widget.listing.price) {
          return 'Discount must be less than the price '
              '(₹${widget.listing.price.toStringAsFixed(0)}).';
        }
      } else if (_percentage < 1 || _percentage > 99) {
        return 'Percentage must be between 1 and 99.';
      }
      if (_startDate != null && _endDate != null &&
          !_endDate!.isAfter(_startDate!)) {
        return 'End date must be after the start date.';
      }
    }
    // Bulk tiers are independent of the base discount toggle, so this check
    // runs regardless of _isActive — matches web's discount-panel.
    if (_bulkEnabled && _bulkTiers.isNotEmpty) {
      for (final t in _bulkTiers) {
        if (t.minQty < 1) return 'Bulk tier quantity must be at least 1.';
        if (t.discountPct <= 0 || t.discountPct > 99) {
          return 'Bulk tier discount must be 1–99%.';
        }
      }
      final qtys = _bulkTiers.map((t) => t.minQty).toSet();
      if (qtys.length != _bulkTiers.length) {
        return 'Bulk tiers cannot have duplicate quantities.';
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      // Must scroll: with the base discount, dates, preview AND the bulk tier
      // ladder this sheet is taller than a phone screen, and a bare Column
      // silently clips everything past the fold — including the Save button.
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Discount Settings', style: AppTextStyles.heading2),
            const SizedBox(height: 16),

            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Enable Discount'),
              value: _isActive,
              activeThumbColor: AppColors.primary,
              onChanged: (v) => setState(() => _isActive = v),
            ),
            const SizedBox(height: 12),

            // Type selector — web offers percentage OR a flat rupee amount.
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'percentage', label: Text('Percentage')),
                ButtonSegment(value: 'fixed_amount', label: Text('Fixed ₹')),
              ],
              selected: {_type},
              onSelectionChanged: _isActive
                  ? (sel) => setState(() => _type = sel.first)
                  : null,
              showSelectedIcon: false,
            ),
            const SizedBox(height: 12),

            if (_type == 'percentage')
              Row(
                children: [
                  Text(
                    'Discount: ${_percentage.toInt()}%',
                    style: AppTextStyles.bodyMedium,
                  ),
                  Expanded(
                    child: Slider(
                      value: _percentage.clamp(1, 99),
                      min: 1,
                      // Web validates 1–99; the app's old 80 cap silently
                      // refused discounts web allows.
                      max: 99,
                      divisions: 98,
                      activeColor: AppColors.primary,
                      onChanged: _isActive
                          ? (v) => setState(() => _percentage = v)
                          : null,
                    ),
                  ),
                ],
              )
            else
              TextField(
                controller: _fixedCtrl,
                enabled: _isActive,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'Discount amount (₹)',
                  prefixText: '₹ ',
                  isDense: true,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            const SizedBox(height: 12),

            // Live price preview, same as web's panel.
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surfaceVariant,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Text('Buyer pays', style: AppTextStyles.bodySmall),
                  const Spacer(),
                  if (_isActive && _previewPrice < widget.listing.price) ...[
                    Text(
                      '₹${widget.listing.price.toStringAsFixed(0)}',
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.onSurfaceVariant,
                        decoration: TextDecoration.lineThrough,
                      ),
                    ),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    '₹${_previewPrice.toStringAsFixed(0)}',
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),

            Row(
              children: [
                Expanded(
                  child: _DatePickerField(
                    label: 'Start Date',
                    value: _startDate,
                    enabled: _isActive,
                    onPicked: (d) => setState(() => _startDate = d),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _DatePickerField(
                    label: 'End Date',
                    value: _endDate,
                    enabled: _isActive,
                    onPicked: (d) => setState(() => _endDate = d),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // ── Bulk (quantity-tier) discounts — matches web's Bulk Discounts
            // panel exactly. Independent of the base discount above: a seller
            // can run one, the other, or both at once.
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _bulkEnabled
                    ? AppColors.primary.withValues(alpha: 0.05)
                    : AppColors.surfaceVariant,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _bulkEnabled
                      ? AppColors.primary.withValues(alpha: 0.3)
                      : AppColors.divider,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.layers_outlined,
                          size: 18, color: AppColors.onSurfaceVariant),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text('Bulk Discounts',
                            style: AppTextStyles.bodyMedium
                                .copyWith(fontWeight: FontWeight.w600)),
                      ),
                      Switch(
                        value: _bulkEnabled,
                        activeThumbColor: AppColors.primary,
                        onChanged: (v) => setState(() => _bulkEnabled = v),
                      ),
                    ],
                  ),
                  if (_bulkEnabled) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Customers buying more units get a bigger discount. '
                      'Higher tiers override lower ones.',
                      style: AppTextStyles.bodySmall
                          .copyWith(color: AppColors.onSurfaceVariant),
                    ),
                    const SizedBox(height: 10),
                    ...List.generate(_bulkTiers.length, (i) {
                      final t = _bulkTiers[i];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            const Text('Buy'),
                            const SizedBox(width: 6),
                            SizedBox(
                              width: 56,
                              child: TextFormField(
                                key: ValueKey('tier-qty-$i-${t.minQty}'),
                                initialValue: t.minQty.toString(),
                                keyboardType: TextInputType.number,
                                textAlign: TextAlign.center,
                                decoration: const InputDecoration(isDense: true),
                                onChanged: (v) {
                                  final n = int.tryParse(v);
                                  if (n != null && n >= 1) {
                                    _updateTier(i, minQty: n);
                                  }
                                },
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Text('+ units →'),
                            const SizedBox(width: 6),
                            SizedBox(
                              width: 56,
                              child: TextFormField(
                                key: ValueKey('tier-pct-$i-${t.discountPct}'),
                                initialValue: t.discountPct.toInt().toString(),
                                keyboardType: TextInputType.number,
                                textAlign: TextAlign.center,
                                decoration: const InputDecoration(isDense: true),
                                onChanged: (v) {
                                  final n = double.tryParse(v);
                                  if (n != null && n >= 1 && n <= 99) {
                                    _updateTier(i, discountPct: n);
                                  }
                                },
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Text('% off'),
                            const Spacer(),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, size: 18),
                              color: AppColors.error,
                              onPressed: () => _removeTier(i),
                            ),
                          ],
                        ),
                      );
                    }),
                    if (_bulkTiers.length < 6)
                      TextButton.icon(
                        onPressed: _addTier,
                        icon: const Icon(Icons.add, size: 16),
                        label: const Text('Add tier'),
                      ),
                    if (_bulkTiers.isNotEmpty && widget.listing.price > 0) ...[
                      const SizedBox(height: 4),
                      ...(List.of(_bulkTiers)
                            ..sort((a, b) => a.minQty - b.minQty))
                          .map((t) {
                        final finalPrice = (widget.listing.price *
                                (1 - t.discountPct / 100))
                            .clamp(0, widget.listing.price);
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Row(
                            children: [
                              Text('Buy ${t.minQty}+ units',
                                  style: AppTextStyles.bodySmall
                                      .copyWith(color: AppColors.onSurfaceVariant)),
                              const Spacer(),
                              Text(
                                '₹${finalPrice.toStringAsFixed(0)}',
                                style: AppTextStyles.bodySmall.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.success),
                              ),
                              const SizedBox(width: 6),
                              Text('${t.discountPct.toInt()}% OFF',
                                  style: AppTextStyles.caption
                                      .copyWith(color: AppColors.success)),
                            ],
                          ),
                        );
                      }),
                    ],
                  ],
                ],
              ),
            ),
            const SizedBox(height: 20),

            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
                child: _saving
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Save Discount'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    // Same rules web's panel enforces, so a discount saved here can't be one
    // web would have rejected.
    final error = _validationError;
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error), backgroundColor: AppColors.error),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await DashboardRepository().setDiscount(
        widget.listing.id,
        isActive: _isActive,
        percentage: _percentage,
        discountType: _type,
        fixedAmount: _fixedAmount,
        startDate: _startDate,
        endDate: _endDate,
        bulkEnabled: _bulkEnabled,
        bulkTiers: _bulkEnabled
            ? _bulkTiers.map((t) => t.toMap()).toList()
            : const [],
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not save discount: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _DatePickerField extends StatelessWidget {
  final String label;
  final DateTime? value;
  final bool enabled;
  final ValueChanged<DateTime> onPicked;

  const _DatePickerField({
    required this.label,
    required this.value,
    required this.enabled,
    required this.onPicked,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: enabled
          ? () async {
              final d = await showDatePicker(
                context: context,
                initialDate: value ?? DateTime.now(),
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 365)),
              );
              if (d != null) onPicked(d);
            }
          : null,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          border: Border.all(color: AppColors.divider),
          borderRadius: BorderRadius.circular(8),
          color: enabled ? Colors.white : AppColors.surfaceVariant,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: AppTextStyles.caption),
            const SizedBox(height: 2),
            Text(
              value != null
                  ? '${value!.day}/${value!.month}/${value!.year}'
                  : 'Not set',
              style: AppTextStyles.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
