import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/network_retailer_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/error_view.dart';
import '../data/manufacturer_repository.dart';
import '../providers/manufacturer_provider.dart';

class AssignProductScreen extends ConsumerStatefulWidget {
  final String? initialRetailerPhone;
  const AssignProductScreen({super.key, this.initialRetailerPhone});

  @override
  ConsumerState<AssignProductScreen> createState() =>
      _AssignProductScreenState();
}

class _AssignProductScreenState
    extends ConsumerState<AssignProductScreen> {
  CatalogModel? _selectedProduct;
  final Set<String> _selectedRetailers = {};
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.initialRetailerPhone != null) {
      _selectedRetailers.add(widget.initialRetailerPhone!);
    }
  }

  @override
  Widget build(BuildContext context) {
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
        return _buildScaffold(user.phone, user.name);
      },
    );
  }

  Widget _buildScaffold(String phone, String name) {
    final catalogAsync = ref.watch(manufacturerCatalogProvider(phone));
    final networkAsync = ref.watch(retailerNetworkProvider(phone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Assign Products',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Step 1: Choose product
            _StepHeader(
                number: '1', title: 'Choose a product to assign'),
            const SizedBox(height: 12),
            catalogAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (_, _) =>
                  const ErrorView(message: 'Could not load catalog.'),
              data: (products) {
                if (products.isEmpty) {
                  return const Text(
                    'No products in catalog. Add products first.',
                    style: TextStyle(color: AppColors.onSurfaceVariant),
                  );
                }
                return Column(
                  children: products
                      .map((p) => _ProductSelectionTile(
                            product: p,
                            isSelected: _selectedProduct?.id == p.id,
                            onTap: () =>
                                setState(() => _selectedProduct = p),
                          ))
                      .toList(),
                );
              },
            ),
            const SizedBox(height: 24),

            // Step 2: Choose retailers
            _StepHeader(
                number: '2',
                title: 'Select retailers to assign to'),
            const SizedBox(height: 12),
            networkAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (_, _) =>
                  const ErrorView(message: 'Could not load network.'),
              data: (retailers) {
                final active =
                    retailers.where((r) => r.isActive).toList();
                if (active.isEmpty) {
                  return const Text(
                    'No active retailers. Add and activate retailers first.',
                    style: TextStyle(color: AppColors.onSurfaceVariant),
                  );
                }
                return Column(
                  children: active
                      .map((r) => _RetailerSelectionTile(
                            retailer: r,
                            isSelected:
                                _selectedRetailers.contains(r.phone),
                            onToggle: () => setState(() {
                              if (_selectedRetailers
                                  .contains(r.phone)) {
                                _selectedRetailers.remove(r.phone);
                              } else {
                                _selectedRetailers.add(r.phone);
                              }
                            }),
                          ))
                      .toList(),
                );
              },
            ),
            const SizedBox(height: 24),

            // Assign button
            if (_selectedProduct != null &&
                _selectedRetailers.isNotEmpty)
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _saving ? null : () => _assign(phone),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding:
                        const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _saving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : Text(
                          'Assign to ${_selectedRetailers.length} retailer${_selectedRetailers.length != 1 ? 's' : ''}',
                          style: AppTextStyles.button,
                        ),
                ),
              ),
            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }

  Future<void> _assign(String manufacturerPhone) async {
    final product = _selectedProduct!;
    final networkAsync =
        ref.read(retailerNetworkProvider(manufacturerPhone));
    final retailers = networkAsync.valueOrNull ?? [];

    setState(() => _saving = true);
    try {
      final repo = ManufacturerRepository();
      for (final phone in _selectedRetailers) {
        final retailer = retailers.firstWhere((r) => r.phone == phone);
        await repo.assignProductToRetailer(
          catalogId: product.id,
          catalogName: product.name,
          retailerPhone: phone,
          retailerName: retailer.shopName,
          manufacturerPhone: manufacturerPhone,
          price: product.price,
        );
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'Assigned "${product.name}" to ${_selectedRetailers.length} retailer(s)'),
            backgroundColor: AppColors.success,
          ),
        );
        setState(() {
          _selectedProduct = null;
          _selectedRetailers.clear();
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _StepHeader extends StatelessWidget {
  final String number;
  final String title;
  const _StepHeader({required this.number, required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: const BoxDecoration(
            color: AppColors.primary,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(number,
                style: AppTextStyles.bodyMedium
                    .copyWith(color: Colors.white)),
          ),
        ),
        const SizedBox(width: 10),
        Text(title, style: AppTextStyles.heading3),
      ],
    );
  }
}

class _ProductSelectionTile extends StatelessWidget {
  final CatalogModel product;
  final bool isSelected;
  final VoidCallback onTap;
  const _ProductSelectionTile(
      {required this.product,
      required this.isSelected,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color:
              isSelected ? AppColors.primaryContainer.withValues(alpha: 0.3) : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? AppColors.primary : AppColors.divider,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              isSelected
                  ? Icons.check_circle
                  : Icons.radio_button_unchecked,
              color: isSelected
                  ? AppColors.primary
                  : AppColors.onSurfaceVariant,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.name, style: AppTextStyles.bodyMedium),
                  Text(product.category,
                      style: AppTextStyles.caption),
                ],
              ),
            ),
            Text(CurrencyUtils.format(product.price),
                style: AppTextStyles.price),
          ],
        ),
      ),
    );
  }
}

class _RetailerSelectionTile extends StatelessWidget {
  final NetworkRetailerModel retailer;
  final bool isSelected;
  final VoidCallback onToggle;
  const _RetailerSelectionTile(
      {required this.retailer,
      required this.isSelected,
      required this.onToggle});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onToggle,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primaryContainer.withValues(alpha: 0.3)
              : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? AppColors.primary : AppColors.divider,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              isSelected
                  ? Icons.check_box
                  : Icons.check_box_outline_blank,
              color: isSelected
                  ? AppColors.primary
                  : AppColors.onSurfaceVariant,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(retailer.shopName,
                      style: AppTextStyles.bodyMedium),
                  Text(retailer.ownerName,
                      style: AppTextStyles.caption),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
