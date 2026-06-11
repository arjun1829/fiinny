import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
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
          return const Scaffold(
              body: ErrorView(message: 'Not logged in.'));
        }
        return _InventoryBody(sellerPhone: user.phone, sellerName: user.name);
      },
    );
  }
}

class _InventoryBody extends ConsumerWidget {
  final String sellerPhone;
  final String sellerName;
  const _InventoryBody(
      {required this.sellerPhone, required this.sellerName});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listingsAsync = ref.watch(myListingsProvider(sellerPhone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('My Inventory',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Colors.white),
            onPressed: () => _showAddListingSheet(context, ref),
          ),
        ],
      ),
      body: listingsAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (_, _) =>
            const ErrorView(message: 'Could not load inventory.'),
        data: (listings) {
          if (listings.isEmpty) {
            return EmptyState(
              title: 'No listings yet',
              subtitle: 'Tap + to add your first product',
              icon: Icons.inventory_2_outlined,
              actionLabel: 'Add Listing',
              onAction: () => _showAddListingSheet(context, ref),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: listings.length,
            itemBuilder: (_, i) => _ListingTile(
              listing: listings[i],
              sellerPhone: sellerPhone,
              ref: ref,
            ),
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
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _AddListingSheet(
        sellerPhone: sellerPhone,
        sellerName: sellerName,
      ),
    );
  }
}

class _ListingTile extends StatelessWidget {
  final ListingModel listing;
  final String sellerPhone;
  final WidgetRef ref;

  const _ListingTile(
      {required this.listing,
      required this.sellerPhone,
      required this.ref});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            width: 50,
            height: 50,
            child: const Icon(Icons.inventory_2_outlined,
                color: AppColors.primaryLight),
          ),
        ),
        title: Text('Catalog: ${listing.catalogId.substring(0, 8)}...',
            style: AppTextStyles.bodyMedium),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(CurrencyUtils.format(listing.price),
                style: AppTextStyles.price),
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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
                if (listing.discount != null && listing.discount!.isActive) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.secondary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      '${listing.discount!.percentage.toInt()}% off',
                      style: AppTextStyles.caption.copyWith(
                        color: AppColors.secondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
        trailing: PopupMenuButton<String>(
          onSelected: (action) => _handleAction(action, context),
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(value: 'discount', child: Text('Discount')),
            PopupMenuItem(
                value: 'delete',
                child: Text('Delete',
                    style: TextStyle(color: AppColors.error))),
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
              borderRadius:
                  BorderRadius.vertical(top: Radius.circular(20))),
          builder: (_) => _EditListingSheet(listing: listing),
        );
      case 'discount':
        showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          shape: const RoundedRectangleBorder(
              borderRadius:
                  BorderRadius.vertical(top: Radius.circular(20))),
          builder: (_) => _DiscountSheet(listing: listing),
        );
      case 'delete':
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Delete Listing'),
            content:
                const Text('Remove this product from your store?'),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel')),
              FilledButton(
                style: FilledButton.styleFrom(
                    backgroundColor: AppColors.error),
                onPressed: () async {
                  Navigator.pop(ctx);
                  await DashboardRepository()
                      .deleteListing(listing.id);
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
  const _AddListingSheet(
      {required this.sellerPhone, required this.sellerName});

  @override
  ConsumerState<_AddListingSheet> createState() => _AddListingSheetState();
}

class _AddListingSheetState extends ConsumerState<_AddListingSheet> {
  final _priceCtrl = TextEditingController();
  final _stockCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  CatalogModel? _selectedCatalog;
  bool _saving = false;
  final _catalogRepo = CatalogRepository();
  List<CatalogModel> _catalogOptions = [];
  bool _loadingCatalog = true;

  @override
  void initState() {
    super.initState();
    _catalogRepo.fetchFeatured().then((list) {
      if (mounted) {
        setState(() {
          _catalogOptions = list;
          _loadingCatalog = false;
        });
      }
    });
  }

  @override
  void dispose() {
    _priceCtrl.dispose();
    _stockCtrl.dispose();
    _addressCtrl.dispose();
    super.dispose();
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
          Text('Add Listing', style: AppTextStyles.heading2),
          const SizedBox(height: 16),

          // Catalog picker
          _loadingCatalog
              ? const LinearProgressIndicator()
              : DropdownButtonFormField<CatalogModel>(
                  // ignore: deprecated_member_use
                  value: _selectedCatalog,
                  decoration: const InputDecoration(
                    labelText: 'Select Product',
                    border: OutlineInputBorder(),
                  ),
                  items: _catalogOptions
                      .map((c) => DropdownMenuItem(
                            value: c,
                            child: Text(c.name,
                                overflow: TextOverflow.ellipsis),
                          ))
                      .toList(),
                  onChanged: (v) =>
                      setState(() => _selectedCatalog = v),
                ),
          const SizedBox(height: 12),
          TextField(
            controller: _priceCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Price (₹)',
              border: OutlineInputBorder(),
              prefixText: '₹ ',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _stockCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Stock Quantity',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _addressCtrl,
            decoration: const InputDecoration(
              labelText: 'Store Address',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary),
              child: _saving
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Add to Inventory'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    if (_selectedCatalog == null) return;
    final price = double.tryParse(_priceCtrl.text.trim());
    final stock = int.tryParse(_stockCtrl.text.trim());
    if (price == null || stock == null) return;

    setState(() => _saving = true);
    try {
      await DashboardRepository().addListing(
        sellerPhone: widget.sellerPhone,
        sellerName: widget.sellerName,
        catalogId: _selectedCatalog!.id,
        price: price,
        stockQuantity: stock,
        sellerAddress: _addressCtrl.text.trim().isNotEmpty
            ? _addressCtrl.text.trim()
            : null,
      );
      if (mounted) Navigator.pop(context);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

// ── Edit Listing Sheet ────────────────────────────────────────────────────────

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

  @override
  void initState() {
    super.initState();
    _priceCtrl = TextEditingController(
        text: widget.listing.price.toStringAsFixed(0));
    _stockCtrl = TextEditingController(
        text: '${widget.listing.stockQuantity}');
  }

  @override
  void dispose() {
    _priceCtrl.dispose();
    _stockCtrl.dispose();
    super.dispose();
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
          Text('Edit Listing', style: AppTextStyles.heading2),
          const SizedBox(height: 16),

          // Image picker
          GestureDetector(
            onTap: _pickImage,
            child: Container(
              height: 100,
              width: double.infinity,
              decoration: BoxDecoration(
                color: AppColors.surfaceVariant,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.divider),
              ),
              child: _imageFile != null
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.file(_imageFile!, fit: BoxFit.cover),
                    )
                  : Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.add_photo_alternate_outlined,
                            size: 32, color: AppColors.onSurfaceVariant),
                        Text('Add Image',
                            style: AppTextStyles.bodySmall),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 12),

          TextField(
            controller: _priceCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Price (₹)',
              border: OutlineInputBorder(),
              prefixText: '₹ ',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _stockCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Stock Quantity',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary),
              child: _saving
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Save Changes'),
            ),
          ),
        ],
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
        source: source, maxWidth: 1024, imageQuality: 85);
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
      final updates = <String, dynamic>{
        'price': price,
        'stockQuantity': stock,
      };

      if (_imageFile != null) {
        final url = await DashboardRepository()
            .uploadListingImage(_imageFile!, widget.listing.sellerPhone);
        updates['imageUrl'] = url;
      }

      await DashboardRepository()
          .updateListing(widget.listing.id, updates);
      if (mounted) Navigator.pop(context);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
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
              Text('Discount: ${_percentage.toInt()}%',
                  style: AppTextStyles.bodyMedium),
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
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary),
              child: _saving
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
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
                lastDate:
                    DateTime.now().add(const Duration(days: 365)),
              );
              if (d != null) onPicked(d);
            }
          : null,
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
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
