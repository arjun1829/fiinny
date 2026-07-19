import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../../dashboard/data/dashboard_repository.dart';
import '../../dashboard/providers/dashboard_provider.dart';
import '../../marketplace/data/catalog_repository.dart';
import '../data/manufacturer_repository.dart';
import '../providers/manufacturer_provider.dart';

class ManufacturerCatalogScreen extends ConsumerWidget {
  const ManufacturerCatalogScreen({super.key});

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
        return _CatalogBody(manufacturerPhone: user.phone);
      },
    );
  }
}

class _CatalogBody extends ConsumerStatefulWidget {
  final String manufacturerPhone;
  const _CatalogBody({required this.manufacturerPhone});

  @override
  ConsumerState<_CatalogBody> createState() => _CatalogBodyState();
}

class _CatalogBodyState extends ConsumerState<_CatalogBody> {
  final _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final catalogAsync = ref.watch(
      manufacturerCatalogProvider(widget.manufacturerPhone),
    );
    final seatAsync = ref.watch(seatStatsProvider(widget.manufacturerPhone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text(
          'My Catalog',
          style: AppTextStyles.heading2.copyWith(color: Colors.white),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Colors.white),
            onPressed: () => _showAddSheet(context),
          ),
        ],
      ),
      body: catalogAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const ErrorView(message: 'Could not load catalog.'),
        data: (products) {
          final filteredProducts = products.where((p) {
            return p.name.toLowerCase().contains(_searchQuery.toLowerCase());
          }).toList();

          return Column(
            children: [
              // Seats Widget — real counts from subscriptions + seatListings
              seatAsync.when(
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
              // Products list
              Expanded(
                child: filteredProducts.isEmpty
                    ? EmptyState(
                        title: _searchQuery.isNotEmpty
                            ? 'No matches'
                            : 'No products yet',
                        subtitle: _searchQuery.isNotEmpty
                            ? 'Try another search query'
                            : 'Add products to your catalog',
                        icon: Icons.inventory_2_outlined,
                        actionLabel: _searchQuery.isNotEmpty
                            ? null
                            : 'Add Product',
                        onAction: _searchQuery.isNotEmpty
                            ? null
                            : () => _showAddSheet(context),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: filteredProducts.length,
                        itemBuilder: (_, i) => _CatalogTile(
                          product: filteredProducts[i],
                          manufacturerPhone: widget.manufacturerPhone,
                        ),
                      ),
              ),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddSheet(context),
        backgroundColor: AppColors.primary,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  void _showAddSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) =>
          _ProductSheet(manufacturerPhone: widget.manufacturerPhone),
    );
  }
}

class _CatalogTile extends StatelessWidget {
  final CatalogModel product;
  final String manufacturerPhone;
  const _CatalogTile({required this.product, required this.manufacturerPhone});

  @override
  Widget build(BuildContext context) {
    final lastUpdatedStr = product.updatedAt != null
        ? DateFormat('MMM d, yyyy, h:mm a').format(product.updatedAt!)
        : (product.createdAt != null
              ? DateFormat('MMM d, yyyy, h:mm a').format(product.createdAt!)
              : 'Not updated');

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
                    child: product.imageUrl.isNotEmpty
                        ? CachedNetworkImage(
                            memCacheWidth: 1000,
                            imageUrl: product.imageUrl,
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
                        product.name,
                        style: AppTextStyles.bodyMedium.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
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
                              product.category,
                              style: AppTextStyles.caption.copyWith(
                                color: AppColors.primary,
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
                              color: product.isActive
                                  ? AppColors.success.withValues(alpha: 0.1)
                                  : AppColors.error.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              product.isActive ? 'Active' : 'Inactive',
                              style: AppTextStyles.caption.copyWith(
                                color: product.isActive
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

            // Variants list
            if (product.variants != null && product.variants!.isNotEmpty) ...[
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
                children: product.variants!.map((v) {
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
                      '${v.label} · ₹${v.price.toStringAsFixed(0)}',
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
                    'MRP: ${CurrencyUtils.format(product.price)}',
                    style: AppTextStyles.bodyMedium.copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],

            // Last updated
            Text(
              'Last Updated: $lastUpdatedStr',
              style: AppTextStyles.caption.copyWith(
                color: AppColors.onSurfaceVariant.withValues(alpha: 0.8),
              ),
            ),

            const Divider(height: 24),

            // Actions
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                  onPressed: () {
                    showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      shape: const RoundedRectangleBorder(
                        borderRadius: BorderRadius.vertical(
                          top: Radius.circular(20),
                        ),
                      ),
                      builder: (_) => _ProductSheet(
                        manufacturerPhone: manufacturerPhone,
                        product: product,
                      ),
                    );
                  },
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: const Text('Edit'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
                const SizedBox(width: 4),
                TextButton.icon(
                  onPressed: () {
                    showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      shape: const RoundedRectangleBorder(
                        borderRadius: BorderRadius.vertical(
                          top: Radius.circular(20),
                        ),
                      ),
                      builder: (_) => _CatalogDiscountSheet(product: product),
                    );
                  },
                  icon: const Icon(Icons.local_offer_outlined, size: 16),
                  label: const Text('Discount'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.success,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
                const SizedBox(width: 4),
                TextButton.icon(
                  onPressed: () {
                    showDialog(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Delete Product'),
                        content: Text('Remove "${product.name}" from catalog?'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('Cancel'),
                          ),
                          FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.error,
                            ),
                            onPressed: () async {
                              Navigator.pop(ctx);
                              await ManufacturerRepository()
                                  .deleteCatalogProduct(
                                    product.id,
                                    collectionPath: product.collectionPath,
                                  );
                            },
                            child: const Text('Delete'),
                          ),
                        ],
                      ),
                    );
                  },
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
}

// ── Product Add/Edit Sheet ────────────────────────────────────────────────────

class _ProductSheet extends StatefulWidget {
  final String manufacturerPhone;
  final CatalogModel? product;
  const _ProductSheet({required this.manufacturerPhone, this.product});

  @override
  State<_ProductSheet> createState() => _ProductSheetState();
}

class _ProductSheetState extends State<_ProductSheet> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _priceCtrl;
  late final TextEditingController _descCtrl;
  late final TextEditingController _nCtrl;
  late final TextEditingController _pCtrl;
  late final TextEditingController _kCtrl;
  final _customUnitCtrl = TextEditingController();
  final _customSizeCtrl = TextEditingController();
  final _stockCtrl = TextEditingController();

  String _category = 'Fertilizers';
  String _selectedUnit = 'KG';
  String _selectedSize = '1';
  bool _saving = false;
  late bool _isActive;
  bool _gstApplicable = false;
  double _gstRate = 18.0;
  String _sellMode = 'online_delivery';


  // Catalog autofill
  final _catalogRepo = CatalogRepository();
  List<CatalogModel> _catalogOptions = [];
  List<CatalogModel> _nameSuggestions = [];

  final List<VariantModel> _variants = [];
  late List<TextEditingController> _imageUrlCtrls;
  final List<File?> _imageFiles = List.filled(5, null);

  static const _categories = [
    'Fertilizers',
    'Seeds',
    'Pesticides',
    'Irrigation',
    'Tools',
    'Organic',
    'Herbicides',
  ];

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    _nameCtrl = TextEditingController(text: p?.name ?? '');
    _priceCtrl = TextEditingController(
      text: p != null ? p.price.toStringAsFixed(0) : '',
    );
    _descCtrl = TextEditingController(text: p?.description ?? '');
    _nCtrl = TextEditingController(
      text: p?.nitrogen != null ? p!.nitrogen!.toStringAsFixed(0) : '',
    );
    _pCtrl = TextEditingController(
      text: p?.phosphorus != null ? p!.phosphorus!.toStringAsFixed(0) : '',
    );
    _kCtrl = TextEditingController(
      text: p?.potassium != null ? p!.potassium!.toStringAsFixed(0) : '',
    );
    _category = _matchCategory(p?.category);
    _isActive = p == null ? true : p.isActive;
    _gstApplicable = p?.gstApplicable ?? false;
    _gstRate = p?.gstRate ?? 18.0;
    _sellMode = p?.sellMode ?? 'online_delivery';


    // Load all products for name autofill (only when adding new)
    if (p == null) {
      _catalogRepo.fetchAllMergedProducts().then((list) {
        if (mounted) setState(() => _catalogOptions = list);
      });
    }

    if (p?.variants != null) {
      _variants.addAll(p!.variants!);
    }

    final existingImages = p?.images ?? [];
    _imageUrlCtrls = List.generate(
      5,
      (i) => TextEditingController(
        text: i < existingImages.length ? existingImages[i] : '',
      ),
    );
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _priceCtrl.dispose();
    _descCtrl.dispose();
    _nCtrl.dispose();
    _pCtrl.dispose();
    _kCtrl.dispose();
    _customUnitCtrl.dispose();
    _customSizeCtrl.dispose();
    _stockCtrl.dispose();
    for (final c in _imageUrlCtrls) {
      c.dispose();
    }
    super.dispose();
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

  void _addVariantSize() {
    final price = double.tryParse(_priceCtrl.text.trim());
    if (price == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid MRP price.')),
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
      _variants.add(VariantModel(label: label, price: price, stock: 1));
      _priceCtrl.clear();
      _customSizeCtrl.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.product != null;
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
                      isEdit ? 'Edit Catalog Product' : 'Add Catalog Product',
                      style: AppTextStyles.heading2,
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                if (isEdit) ...[
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
                            ? 'Visible to retailers'
                            : 'Hidden from catalog',
                        style: AppTextStyles.caption,
                      ),
                      value: _isActive,
                      activeThumbColor: AppColors.primary,
                      onChanged: (v) => setState(() => _isActive = v),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // ── GST & Sell Mode ──────────────────────────────────────
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.surfaceVariant,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    children: [
                      SwitchListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 4,
                        ),
                        title: Text(
                          'GST Applicable',
                          style: AppTextStyles.bodyMedium.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        subtitle: Text(
                          _gstApplicable
                              ? 'GST will be applied'
                              : 'No GST on this product',
                          style: AppTextStyles.caption,
                        ),
                        value: _gstApplicable,
                        activeThumbColor: AppColors.primary,
                        onChanged: (v) => setState(() => _gstApplicable = v),
                      ),
                      if (_gstApplicable)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                          child: DropdownButtonFormField<double>(
                            value: _gstRate,
                            decoration: InputDecoration(
                              labelText: 'GST Rate (%)',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 12,
                              ),
                            ),
                            items: [0.0, 5.0, 12.0, 18.0, 28.0]
                                .map(
                                  (rate) => DropdownMenuItem<double>(
                                    value: rate,
                                    child: Text('${rate.toInt()}%'),
                                  ),
                                )
                                .toList(),
                            onChanged: (v) {
                              if (v != null) setState(() => _gstRate = v);
                            },
                          ),
                        ),
                    ],
                  ),
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
                const SizedBox(height: 16),

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
                    hintText: 'Type to search existing products or enter new…',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onChanged: (val) {
                    final q = val.toLowerCase().trim();
                    setState(() {
                      _nameSuggestions = q.isEmpty
                          ? []
                          : _catalogOptions
                              .where((c) =>
                                  c.name.toLowerCase().contains(q))
                              .take(6)
                              .toList();
                    });
                  },
                ),
                if (_nameSuggestions.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Container(
                    constraints: const BoxConstraints(maxHeight: 160),
                    decoration: BoxDecoration(
                      border: Border.all(color: AppColors.divider),
                      borderRadius: BorderRadius.circular(12),
                      color: Colors.white,
                    ),
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: _nameSuggestions.length,
                      itemBuilder: (ctx, i) {
                        final cat = _nameSuggestions[i];
                        return ListTile(
                          dense: true,
                          leading: cat.images.isNotEmpty
                              ? ClipRRect(
                                  borderRadius: BorderRadius.circular(6),
                                  child: Image.network(
                                    cat.images.first,
                                    width: 36,
                                    height: 36,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, _, _) =>
                                        const Icon(Icons.agriculture, size: 28),
                                  ),
                                )
                              : const Icon(Icons.agriculture, size: 28),
                          title: Text(cat.name,
                              style: AppTextStyles.bodyMedium),
                          subtitle: Text(cat.category,
                              style: AppTextStyles.caption),
                          onTap: () => setState(() {
                            _nameCtrl.text = cat.name;
                            _category = _matchCategory(cat.category);
                            _descCtrl.text = cat.description ?? '';
                            for (int j = 0;
                                j < cat.images.length && j < 5;
                                j++) {
                              _imageUrlCtrls[j].text = cat.images[j];
                            }
                            _nameSuggestions = [];
                          }),
                        );
                      },
                    ),
                  ),
                ],
                const SizedBox(height: 16),

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
                  items: _categories
                      .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: (v) => setState(() => _category = v ?? _category),
                ),
                const SizedBox(height: 16),

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
                    hintText: 'Crop suitability, yield, dosage...',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                Text(
                  'NPK Composition (%)',
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: _npkField(_nCtrl, 'N')),
                    const SizedBox(width: 8),
                    Expanded(child: _npkField(_pCtrl, 'P')),
                    const SizedBox(width: 8),
                    Expanded(child: _npkField(_kCtrl, 'K')),
                  ],
                ),
                const SizedBox(height: 20),

                // Variants list
                Text(
                  'Pack Sizes & MRPs',
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
                        subtitle: Text('MRP: ₹${v.price.toStringAsFixed(0)}'),
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

                // Package MRP Price
                TextField(
                  controller: _priceCtrl,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'MRP Price (₹) *',
                    prefixText: '₹ ',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
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

                Text(
                  'Product Images (up to 5)',
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                ...List.generate(5, (i) => _buildImageRow(i)),
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
                      : Text(
                          isEdit ? 'Save Changes' : 'Add to Catalog',
                          style: const TextStyle(
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

  String _matchCategory(String? raw) {
    if (raw == null || raw.isEmpty) return 'Fertilizers';
    return _categories.firstWhere(
      (c) => c.toLowerCase() == raw.toLowerCase(),
      orElse: () => 'Fertilizers',
    );
  }

  Widget _npkField(TextEditingController ctrl, String label) => TextField(
    controller: ctrl,
    keyboardType: TextInputType.number,
    decoration: InputDecoration(
      labelText: label,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter product name.')),
      );
      return;
    }

    final priceInput = double.tryParse(_priceCtrl.text.trim());
    if (priceInput != null) {
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
            VariantModel(label: label, price: priceInput, stock: 1),
          );
        }
      }
    }

    double basePrice = 0.0;
    if (_variants.isNotEmpty) {
      basePrice = _variants.first.price;
    } else {
      if (priceInput == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please add at least one MRP price.')),
        );
        return;
      }
      basePrice = priceInput;
    }

    setState(() => _saving = true);
    try {
      final repo = ManufacturerRepository();
      final imageUrls = <String>[];
      for (int i = 0; i < 5; i++) {
        if (_imageFiles[i] != null) {
          final url = await DashboardRepository().uploadListingImage(
            _imageFiles[i]!,
            widget.manufacturerPhone,
          );
          imageUrls.add(url);
        } else if (_imageUrlCtrls[i].text.trim().isNotEmpty) {
          imageUrls.add(_imageUrlCtrls[i].text.trim());
        }
      }

      final nitrogen = double.tryParse(_nCtrl.text.trim());
      final phosphorus = double.tryParse(_pCtrl.text.trim());
      final potassium = double.tryParse(_kCtrl.text.trim());

      final data = <String, dynamic>{
        'name': name,
        'category': _category,
        'price': basePrice,
        if (_descCtrl.text.trim().isNotEmpty)
          'description': _descCtrl.text.trim(),
        // Only write NPK if user entered a value — avoids overwriting
        // previously-set values with null when the field is left blank on edit.
        if (nitrogen != null) 'nitrogen': nitrogen,
        if (phosphorus != null) 'phosphorus': phosphorus,
        if (potassium != null) 'potassium': potassium,
        'images': imageUrls,
        if (imageUrls.isNotEmpty) 'imageUrl': imageUrls.first,
        if (imageUrls.isNotEmpty) 'image': imageUrls.first,
        'variants': _variants.map((v) => v.toMap()).toList(),
        'isActive': _isActive,
        'sellMode': _sellMode,
        'gstApplicable': _gstApplicable,
        'gstRate': _gstRate,
      };

      if (widget.product != null) {
        await repo.updateCatalogProduct(
          widget.product!.id,
          data,
          collectionPath: widget.product!.collectionPath,
        );
      } else {
        await repo.addCatalogProduct(
          manufacturerPhone: widget.manufacturerPhone,
          name: name,
          category: _category,
          price: basePrice,
          description: _descCtrl.text.trim().isNotEmpty ? _descCtrl.text.trim() : null,
          nitrogen: nitrogen,
          phosphorus: phosphorus,
          potassium: potassium,
          variants: _variants,
          images: imageUrls,
          isActive: _isActive,
          sellMode: _sellMode,
          gstApplicable: _gstApplicable,
          gstRate: _gstRate,
        );
      }
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error saving product: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

// ── Catalog Discount Sheet ────────────────────────────────────────────────────

class _CatalogDiscountSheet extends StatefulWidget {
  final CatalogModel product;
  const _CatalogDiscountSheet({required this.product});

  @override
  State<_CatalogDiscountSheet> createState() => _CatalogDiscountSheetState();
}

class _CatalogDiscountSheetState extends State<_CatalogDiscountSheet> {
  late bool _isActive;
  late double _percentage;
  DateTime? _startDate;
  DateTime? _endDate;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // Initialise from the product's current effective discount
    _isActive = widget.product.maxDiscountPct > 0;
    _percentage = widget.product.maxDiscountPct > 0
        ? widget.product.maxDiscountPct
        : 10.0;
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
          Text(
            'Discount — ${widget.product.name}',
            style: AppTextStyles.heading2,
          ),
          const SizedBox(height: 4),
          Text(
            'Sets a discount on this product for all retailers.',
            style: AppTextStyles.caption.copyWith(
              color: AppColors.onSurfaceVariant,
            ),
          ),
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
                child: _DateField(
                  label: 'Start Date',
                  value: _startDate,
                  enabled: _isActive,
                  onPicked: (d) => setState(() => _startDate = d),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _DateField(
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
        widget.product.id,
        isActive: _isActive,
        percentage: _percentage,
        startDate: _startDate,
        endDate: _endDate,
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error saving discount: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _DateField extends StatelessWidget {
  final String label;
  final DateTime? value;
  final bool enabled;
  final ValueChanged<DateTime> onPicked;

  const _DateField({
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
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          suffixIcon: const Icon(Icons.calendar_today_outlined, size: 16),
        ),
        child: Text(
          value != null ? DateFormat('MMM d, yyyy').format(value!) : 'Optional',
          style: AppTextStyles.bodyMedium.copyWith(
            color: enabled ? AppColors.onSurface : AppColors.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}
