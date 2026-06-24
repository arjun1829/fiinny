import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../../marketplace/data/catalog_repository.dart';
import '../data/dashboard_repository.dart';
import '../providers/dashboard_provider.dart';
// SeatStats is defined in dashboard_repository.dart

class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key});

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
        return _InventoryBody(sellerPhone: user.phone, sellerName: user.name);
      },
    );
  }
}

class _InventoryBody extends ConsumerStatefulWidget {
  final String sellerPhone;
  final String sellerName;
  const _InventoryBody({required this.sellerPhone, required this.sellerName});

  @override
  ConsumerState<_InventoryBody> createState() => _InventoryBodyState();
}

class _InventoryBodyState extends ConsumerState<_InventoryBody> {
  final _searchController = TextEditingController();
  String _searchQuery = '';

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
    final sourceLabel = isAssigned ? 'Assigned' : 'Own Catalogue';

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
                      '${v.label} · ₹${v.price.toStringAsFixed(0)} (${v.stock})',
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
  File? _imageFile;

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

  Future<void> _pickImage() async {
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
      setState(() => _imageFile = File(xFile.path));
    }
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
                      'Add Product to Catalogue',
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
                DropdownButtonFormField<String>(
                  // ignore: deprecated_member_use
                  value: _category,
                  decoration: InputDecoration(
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  items:
                      [
                            'Fertilizers',
                            'Seeds',
                            'Pesticides',
                            'Irrigation',
                            'Tools',
                            'Organic',
                            'Herbicides',
                          ]
                          .map(
                            (c) => DropdownMenuItem(value: c, child: Text(c)),
                          )
                          .toList(),
                  onChanged: (v) => setState(() => _category = v ?? _category),
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
                  decoration: InputDecoration(
                    hintText: 'Crop suitability, yield, dosage, soil type...',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
                const SizedBox(height: 20),

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
                          'Price: ₹${v.price.toStringAsFixed(0)} · Stock: ${v.stock}',
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

                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _imageUrlCtrls[0],
                        decoration: InputDecoration(
                          labelText: 'Main image URL',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    GestureDetector(
                      onTap: _pickImage,
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: AppColors.surfaceVariant,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.divider),
                        ),
                        child: _imageFile != null
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: Image.file(
                                  _imageFile!,
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
                const SizedBox(height: 12),
                ...List.generate(
                  4,
                  (i) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: TextField(
                      controller: _imageUrlCtrls[i + 1],
                      decoration: InputDecoration(
                        labelText: 'Image ${i + 2} URL',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

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
                          'Add to Catalogue / Inventory',
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
      totalStock = _variants.fold(0, (acc, v) => acc + v.stock);
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
      final imageUrls = _imageUrlCtrls
          .map((c) => c.text.trim())
          .where((s) => s.isNotEmpty)
          .toList();

      if (_imageFile != null) {
        final url = await DashboardRepository().uploadListingImage(
          _imageFile!,
          widget.sellerPhone,
        );
        imageUrls.insert(0, url);
      }

      final catalogId =
          _selectedCatalog?.id ??
          FirebaseFirestore.instance.collection('catalog').doc().id;

      await DashboardRepository().addListing(
        sellerPhone: widget.sellerPhone,
        sellerName: widget.sellerName,
        catalogId: catalogId,
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
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error saving: $e')));
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
  File? _imageFile;
  bool _saving = false;

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
    _isActive = widget.listing.isActive;
    _variants = widget.listing.variants
        .map(
          (v) => _VariantEntry(label: v.label, price: v.price, stock: v.stock),
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
  }

  @override
  void dispose() {
    _priceCtrl.dispose();
    _stockCtrl.dispose();
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
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _imageUrlCtrls[0],
                    decoration: InputDecoration(
                      labelText: 'Main image URL',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                GestureDetector(
                  onTap: _pickImage,
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceVariant,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.divider),
                    ),
                    child: _imageFile != null
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Image.file(_imageFile!, fit: BoxFit.cover),
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
            const SizedBox(height: 12),
            ...List.generate(
              4,
              (i) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  controller: _imageUrlCtrls[i + 1],
                  decoration: InputDecoration(
                    labelText: 'Image ${i + 2} URL',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    isDense: true,
                  ),
                ),
              ),
            ),
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

  Future<void> _pickImage() async {
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
      setState(() => _imageFile = File(xFile.path));
    }
  }

  Future<void> _save() async {
    final price = double.tryParse(_priceCtrl.text.trim());
    final stock = int.tryParse(_stockCtrl.text.trim());
    if (price == null || stock == null) return;

    setState(() => _saving = true);
    try {
      // Collect image URLs (non-empty)
      final imageUrls = _imageUrlCtrls
          .map((c) => c.text.trim())
          .where((s) => s.isNotEmpty)
          .toList();

      // Upload picked file if any, replace or prepend to URLs
      if (_imageFile != null) {
        final url = await DashboardRepository().uploadListingImage(
          _imageFile!,
          widget.listing.sellerPhone,
        );
        if (imageUrls.isEmpty || imageUrls.first.isEmpty) {
          if (imageUrls.isEmpty) {
            imageUrls.insert(0, url);
          } else {
            imageUrls[0] = url;
          }
        } else {
          imageUrls.insert(0, url);
          if (imageUrls.length > 5) imageUrls.removeLast();
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

      final effectiveDiscountPct = _discountActive ? _discountPct : 0.0;
      final updates = <String, dynamic>{
        'price': price,
        'stock': stock > 0 ? 'In Stock' : 'Out of Stock',
        'stockQuantity': stock,
        'isActive': _isActive,
        if (imageUrls.isNotEmpty) 'images': imageUrls,
        if (imageUrls.isNotEmpty) 'imageUrl': imageUrls.first,
        'variants': variants.map((v) => v.toMap()).toList(),
        // Canonical FLAT discount schema (shared with web).
        'discountEnabled': _discountActive,
        'discountType': 'percentage',
        'discountPct': _discountPct,
        'effectiveDiscountPct': effectiveDiscountPct,
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
          stockLevel: stock > 0 ? 'In Stock' : 'Out of Stock',
          discountPct: effectiveDiscountPct,
          isProductActive: _isActive,
        );
        await repo.syncInventoryDoc(
          widget.listing.id,
          sellingPrice: price,
          stockQuantity: stock,
          isProductActive: _isActive,
          discountEnabled: _discountActive,
          discountPct: _discountPct,
          effectiveDiscountPct: effectiveDiscountPct,
        );
      }
      if (mounted) Navigator.pop(context);
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
  DateTime? _startDate;
  DateTime? _endDate;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _isActive = widget.listing.discount?.isActive ?? false;
    _percentage = widget.listing.discount?.percentage ?? 10;
    _startDate = widget.listing.discount?.startDate;
    _endDate = widget.listing.discount?.endDate;
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

          Row(
            children: [
              Text(
                'Discount: ${_percentage.toInt()}%',
                style: AppTextStyles.bodyMedium,
              ),
              Expanded(
                child: Slider(
                  value: _percentage,
                  min: 1,
                  max: 80,
                  divisions: 79,
                  activeColor: AppColors.primary,
                  onChanged: _isActive
                      ? (v) => setState(() => _percentage = v)
                      : null,
                ),
              ),
            ],
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
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await DashboardRepository().setDiscount(
        widget.listing.id,
        isActive: _isActive,
        percentage: _percentage,
        startDate: _startDate,
        endDate: _endDate,
      );
      if (mounted) Navigator.pop(context);
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
