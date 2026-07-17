import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
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

class _CatalogBody extends ConsumerWidget {
  final String manufacturerPhone;
  const _CatalogBody({required this.manufacturerPhone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalogAsync =
        ref.watch(manufacturerCatalogProvider(manufacturerPhone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('My Catalog',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Colors.white),
            onPressed: () => _showAddSheet(context),
          ),
        ],
      ),
      body: catalogAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (_, _) =>
            const ErrorView(message: 'Could not load catalog.'),
        data: (products) {
          if (products.isEmpty) {
            return EmptyState(
              title: 'No products yet',
              subtitle: 'Add products to your catalog',
              icon: Icons.inventory_2_outlined,
              actionLabel: 'Add Product',
              onAction: () => _showAddSheet(context),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: products.length,
            itemBuilder: (_, i) => _CatalogTile(
              product: products[i],
              manufacturerPhone: manufacturerPhone,
            ),
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
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) =>
          _ProductSheet(manufacturerPhone: manufacturerPhone),
    );
  }
}

class _CatalogTile extends StatelessWidget {
  final CatalogModel product;
  final String manufacturerPhone;
  const _CatalogTile(
      {required this.product, required this.manufacturerPhone});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: const Icon(Icons.inventory_2_outlined,
            color: AppColors.primaryLight),
        title: Text(product.name, style: AppTextStyles.bodyMedium),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(product.category, style: AppTextStyles.caption),
            Text(CurrencyUtils.format(product.price),
                style: AppTextStyles.price),
          ],
        ),
        trailing: PopupMenuButton<String>(
          onSelected: (action) {
            if (action == 'edit') {
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                shape: const RoundedRectangleBorder(
                    borderRadius: BorderRadius.vertical(
                        top: Radius.circular(20))),
                builder: (_) => _ProductSheet(
                  manufacturerPhone: manufacturerPhone,
                  product: product,
                ),
              );
            } else if (action == 'delete') {
              showDialog(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Delete Product'),
                  content: Text(
                      'Remove "${product.name}" from catalog?'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Cancel')),
                    FilledButton(
                      style: FilledButton.styleFrom(
                          backgroundColor: AppColors.error),
                      onPressed: () async {
                        Navigator.pop(ctx);
                        await ManufacturerRepository()
                            .deleteCatalogProduct(product.id);
                      },
                      child: const Text('Delete'),
                    ),
                  ],
                ),
              );
            }
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(
                value: 'delete',
                child: Text('Delete',
                    style: TextStyle(color: AppColors.error))),
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
  const _ProductSheet(
      {required this.manufacturerPhone, this.product});

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
  String _category = 'Fertilizers';
  bool _saving = false;

  static const _categories = [
    'Fertilizers',
    'Seeds',
    'Pesticides',
    'Irrigation',
    'Tools',
    'Organic',
  ];

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    _nameCtrl = TextEditingController(text: p?.name ?? '');
    _priceCtrl = TextEditingController(
        text: p != null ? p.price.toStringAsFixed(0) : '');
    _descCtrl =
        TextEditingController(text: p?.description ?? '');
    _nCtrl = TextEditingController(
        text: p?.nitrogen != null
            ? p!.nitrogen!.toStringAsFixed(0)
            : '');
    _pCtrl = TextEditingController(
        text: p?.phosphorus != null
            ? p!.phosphorus!.toStringAsFixed(0)
            : '');
    _kCtrl = TextEditingController(
        text: p?.potassium != null
            ? p!.potassium!.toStringAsFixed(0)
            : '');
    _category = p?.category ?? 'Fertilizers';
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _priceCtrl.dispose();
    _descCtrl.dispose();
    _nCtrl.dispose();
    _pCtrl.dispose();
    _kCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.product != null;
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
            Text(isEdit ? 'Edit Product' : 'Add Product',
                style: AppTextStyles.heading2),
            const SizedBox(height: 16),
            TextField(
              controller: _nameCtrl,
              decoration: const InputDecoration(
                labelText: 'Product Name *',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              // ignore: deprecated_member_use
              value: _category,
              decoration: const InputDecoration(
                  labelText: 'Category', border: OutlineInputBorder()),
              items: _categories
                  .map((c) =>
                      DropdownMenuItem(value: c, child: Text(c)))
                  .toList(),
              onChanged: (v) =>
                  setState(() => _category = v ?? _category),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _priceCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'MRP (₹) *',
                border: OutlineInputBorder(),
                prefixText: '₹ ',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _descCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Description',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            Text('NPK Composition (%)',
                style: AppTextStyles.bodyMedium),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                    child: _npkField(_nCtrl, 'N (Nitrogen)')),
                const SizedBox(width: 8),
                Expanded(
                    child: _npkField(_pCtrl, 'P (Phosphorus)')),
                const SizedBox(width: 8),
                Expanded(
                    child: _npkField(_kCtrl, 'K (Potassium)')),
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
                    : Text(isEdit
                        ? 'Save Changes'
                        : 'Add to Catalog'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _npkField(TextEditingController ctrl, String label) =>
      TextField(
        controller: ctrl,
        keyboardType: TextInputType.number,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          isDense: true,
        ),
      );

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    final price = double.tryParse(_priceCtrl.text.trim());
    if (name.isEmpty || price == null) return;

    setState(() => _saving = true);
    try {
      final repo = ManufacturerRepository();
      final data = {
        'name': name,
        'category': _category,
        'price': price,
        'description': _descCtrl.text.trim().isNotEmpty
            ? _descCtrl.text.trim()
            : null,
        'nitrogen': double.tryParse(_nCtrl.text.trim()),
        'phosphorus': double.tryParse(_pCtrl.text.trim()),
        'potassium': double.tryParse(_kCtrl.text.trim()),
      };

      if (widget.product != null) {
        await repo.updateCatalogProduct(widget.product!.id, data);
      } else {
        await repo.addCatalogProduct(
          manufacturerPhone: widget.manufacturerPhone,
          name: name,
          category: _category,
          price: price,
          description: data['description'] as String?,
          nitrogen: data['nitrogen'] as double?,
          phosphorus: data['phosphorus'] as double?,
          potassium: data['potassium'] as double?,
        );
      }
      if (mounted) Navigator.pop(context);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}
