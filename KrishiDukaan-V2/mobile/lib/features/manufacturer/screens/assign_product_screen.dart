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

  final _productSearchCtrl = TextEditingController();
  final _retailerSearchCtrl = TextEditingController();
  String _productQuery = '';
  String _retailerQuery = '';

  // Reveal-more pagination for the retailer list — a manufacturer with a
  // large network only pays the render cost for the retailers actually
  // shown, not the whole list at once. Resets whenever the search query
  // changes so "Show more" always starts fresh against the new filter.
  static const _kRetailerPageSize = 10;
  int _retailerRevealCount = _kRetailerPageSize;

  /// `retailerDocId|manufacturerProductId` pairs already assigned and active.
  ///
  /// Derived from seat listings, exactly as web's assign-product modal does —
  /// NOT from a product query. Without this the screen let a manufacturer
  /// re-assign a product a retailer already stocks, with no indication it was
  /// already theirs; the duplicate was then rejected server-side with a bare
  /// error.
  /// Full seat-listing docs behind [_assignedPairs] — kept so the "currently
  /// assigned" section (shown when opened from a specific retailer) can list
  /// what they already have, with a Remove action per row. Web's per-retailer
  /// assign modal shows this same list; the app previously only prevented
  /// re-assigning a duplicate with no way to see or undo an assignment.
  List<Map<String, dynamic>> _assignedListings = [];
  Set<String> _assignedPairs = {};
  bool _assignedLoading = true;

  /// Seat listing id currently being removed, so only that row shows a
  /// spinner and the rest of the screen stays interactive.
  String? _removingListingId;

  @override
  void initState() {
    super.initState();
    if (widget.initialRetailerPhone != null) {
      _selectedRetailers.add(widget.initialRetailerPhone!);
    }
  }

  Future<void> _loadAssigned(String manufacturerPhone) async {
    final listings =
        await ManufacturerRepository().fetchActiveAssignedListings(
      manufacturerPhone,
    );
    if (!mounted) return;
    setState(() {
      _assignedListings = listings;
      _assignedPairs = listings
          .map((l) =>
              '${l['retailerDocId'] ?? ''}|${l['manufacturerProductId'] ?? ''}')
          .toSet();
      _assignedLoading = false;
    });
  }

  bool _isAssigned(String retailerPhone) {
    final productId = _selectedProduct?.id;
    if (productId == null) return false;
    return _assignedPairs.contains('$retailerPhone|$productId');
  }

  /// Removes one currently-assigned product, with a confirmation dialog —
  /// this frees the seat and (per [ManufacturerRepository.removeProductAssignment])
  /// takes the retailer's copy offline and off the marketplace.
  Future<void> _removeAssignment(
    String manufacturerPhone,
    Map<String, dynamic> listing,
    String productName,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove assignment?'),
        content: Text(
          'This frees the seat and takes "$productName" offline for this '
          'retailer. They can be re-assigned any product again afterwards.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final listingId = listing['id'] as String;
    setState(() => _removingListingId = listingId);
    try {
      await ManufacturerRepository().removeProductAssignment(listingId);
      await _loadAssigned(manufacturerPhone);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Removed "$productName".')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not remove assignment: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _removingListingId = null);
    }
  }

  @override
  void dispose() {
    _productSearchCtrl.dispose();
    _retailerSearchCtrl.dispose();
    super.dispose();
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
    // Load the already-assigned set once, on the first build that knows the
    // manufacturer's phone.
    if (_assignedLoading && _assignedPairs.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _assignedLoading) _loadAssigned(phone);
      });
    }
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
            // Opened for one specific retailer: show what they already have
            // before asking what to add — this is the view the checklist
            // called "Assign Products tab doesn't show assigned products".
            if (widget.initialRetailerPhone != null)
              catalogAsync.when(
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
                data: (products) => _CurrentlyAssignedSection(
                  loading: _assignedLoading,
                  listings: _assignedListings
                      .where((l) =>
                          l['retailerDocId'] == widget.initialRetailerPhone)
                      .toList(),
                  products: products,
                  removingListingId: _removingListingId,
                  onRemove: (listing, name) => _removeAssignment(phone, listing, name),
                ),
              ),
            if (widget.initialRetailerPhone != null)
              const SizedBox(height: 24),

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
                final q = _productQuery.trim().toLowerCase();
                final filtered = q.isEmpty
                    ? products
                    : products
                        .where((p) =>
                            p.name.toLowerCase().contains(q) ||
                            p.category.toLowerCase().contains(q))
                        .toList();
                return Column(
                  children: [
                    _SearchField(
                      controller: _productSearchCtrl,
                      hintText: 'Search products...',
                      onChanged: (v) => setState(() => _productQuery = v),
                    ),
                    const SizedBox(height: 10),
                    if (filtered.isEmpty)
                      Text(
                        'No products match "$_productQuery"',
                        style: const TextStyle(color: AppColors.onSurfaceVariant),
                      )
                    else
                      ...filtered.map((p) => _ProductSelectionTile(
                            product: p,
                            isSelected: _selectedProduct?.id == p.id,
                            onTap: () =>
                                setState(() => _selectedProduct = p),
                          )),
                  ],
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
                // Every non-revoked retailer, active or still invited —
                // assignProductToRetailer writes purely by phone number, no
                // existing account required, so the assignment is already
                // waiting for an invited retailer the moment they sign in
                // and open their store/profile. Hiding them here was a
                // mobile-only restriction; web imposes none.
                if (retailers.isEmpty) {
                  return const Text(
                    'No retailers in your network yet. Invite retailers first.',
                    style: TextStyle(color: AppColors.onSurfaceVariant),
                  );
                }
                final q = _retailerQuery.trim().toLowerCase();
                final filtered = q.isEmpty
                    ? retailers
                    : retailers
                        .where((r) =>
                            r.shopName.toLowerCase().contains(q) ||
                            r.ownerName.toLowerCase().contains(q) ||
                            r.phone.toLowerCase().contains(q))
                        .toList();
                return Column(
                  children: [
                    _SearchField(
                      controller: _retailerSearchCtrl,
                      hintText: 'Search retailers...',
                      onChanged: (v) => setState(() {
                        _retailerQuery = v;
                        _retailerRevealCount = _kRetailerPageSize;
                      }),
                    ),
                    const SizedBox(height: 10),
                    if (filtered.isEmpty)
                      Text(
                        'No retailers match "$_retailerQuery"',
                        style: const TextStyle(color: AppColors.onSurfaceVariant),
                      )
                    else ...[
                      ...filtered
                          .take(_retailerRevealCount)
                          .map((r) => _RetailerSelectionTile(
                                retailer: r,
                                isSelected:
                                    _selectedRetailers.contains(r.phone),
                                // Already stocks the selected product — shown
                                // as such and not re-selectable, matching
                                // web's assign modal.
                                isAlreadyAssigned: _isAssigned(r.phone),
                                onToggle: () => setState(() {
                                  if (_selectedRetailers
                                      .contains(r.phone)) {
                                    _selectedRetailers.remove(r.phone);
                                  } else {
                                    _selectedRetailers.add(r.phone);
                                  }
                                }),
                              )),
                      if (_retailerRevealCount < filtered.length)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: OutlinedButton(
                            onPressed: () => setState(() {
                              _retailerRevealCount +=
                                  _kRetailerPageSize;
                            }),
                            child: Text(
                              'Show ${(filtered.length - _retailerRevealCount).clamp(0, _kRetailerPageSize)} more',
                            ),
                          ),
                        ),
                    ],
                  ],
                );
              },
            ),
            const SizedBox(height: 24),

            // Assign button — always visible so the user knows it exists
            Builder(builder: (context) {
              final canAssign = _selectedProduct != null &&
                  _selectedRetailers.isNotEmpty &&
                  !_saving;
              String label;
              if (_saving) {
                label = 'Assigning…';
              } else if (_selectedProduct == null &&
                  _selectedRetailers.isEmpty) {
                label = 'Select a product and retailer(s) above';
              } else if (_selectedProduct == null) {
                label = 'Select a product first (Step 1)';
              } else if (_selectedRetailers.isEmpty) {
                label = 'Select at least one retailer (Step 2)';
              } else {
                label =
                    'Assign to ${_selectedRetailers.length} retailer${_selectedRetailers.length != 1 ? 's' : ''}';
              }
              return SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: canAssign ? () => _assign(phone) : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    disabledBackgroundColor:
                        AppColors.primary.withValues(alpha: 0.4),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _saving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : Text(label, style: AppTextStyles.button),
                ),
              );
            }),
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
    final retailers = networkAsync.value ?? [];

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

class _SearchField extends StatelessWidget {
  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String> onChanged;
  const _SearchField({
    required this.controller,
    required this.hintText,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      decoration: InputDecoration(
        hintText: hintText,
        prefixIcon: const Icon(Icons.search, size: 20),
        suffixIcon: controller.text.isNotEmpty
            ? IconButton(
                icon: const Icon(Icons.clear, size: 18),
                onPressed: () {
                  controller.clear();
                  onChanged('');
                },
              )
            : null,
        isDense: true,
        filled: true,
        fillColor: AppColors.surfaceVariant,
        contentPadding:
            const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
      ),
    );
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
  /// This retailer already stocks the selected product.
  final bool isAlreadyAssigned;
  final VoidCallback onToggle;
  const _RetailerSelectionTile(
      {required this.retailer,
      required this.isSelected,
      this.isAlreadyAssigned = false,
      required this.onToggle});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      // Re-assigning is rejected server-side by the duplicate guard, so the
      // tap is disabled rather than letting it fail with a bare error.
      onTap: isAlreadyAssigned ? null : onToggle,
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
              isAlreadyAssigned
                  ? Icons.check_circle
                  : isSelected
                      ? Icons.check_box
                      : Icons.check_box_outline_blank,
              color: isAlreadyAssigned
                  ? AppColors.success
                  : isSelected
                      ? AppColors.primary
                      : AppColors.onSurfaceVariant,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(retailer.shopName,
                            style: AppTextStyles.bodyMedium,
                            overflow: TextOverflow.ellipsis),
                      ),
                      if (isAlreadyAssigned) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: AppColors.success.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'Assigned',
                            style: AppTextStyles.caption.copyWith(
                              color: AppColors.success,
                              fontWeight: FontWeight.w700,
                              fontSize: 9,
                            ),
                          ),
                        ),
                      ],
                      if (!retailer.isActive) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: Colors.orange.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            retailer.isInvited ? 'Invited' : retailer.status,
                            style: AppTextStyles.caption.copyWith(
                              color: Colors.orange.shade800,
                              fontWeight: FontWeight.w700,
                              fontSize: 9,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
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

/// "Currently assigned" list shown above the picker when this screen was
/// opened for one specific retailer — mirrors web's per-retailer assign
/// modal, which always shows what a retailer already stocks alongside what
/// can still be added.
class _CurrentlyAssignedSection extends StatelessWidget {
  final bool loading;
  final List<Map<String, dynamic>> listings;
  final List<CatalogModel> products;
  final String? removingListingId;
  final void Function(Map<String, dynamic> listing, String productName) onRemove;

  const _CurrentlyAssignedSection({
    required this.loading,
    required this.listings,
    required this.products,
    required this.removingListingId,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Currently assigned', style: AppTextStyles.heading3),
          const SizedBox(height: 2),
          Text(
            listings.isEmpty
                ? 'No products assigned to this retailer yet.'
                : '${listings.length} product${listings.length == 1 ? '' : 's'} '
                    'assigned — remove one to free the seat.',
            style: AppTextStyles.bodySmall
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
          if (listings.isNotEmpty) ...[
            const SizedBox(height: 10),
            ...listings.map((listing) {
              final mfrProductId = listing['manufacturerProductId'] as String?;
              CatalogModel? product;
              for (final p in products) {
                if (p.id == mfrProductId) {
                  product = p;
                  break;
                }
              }
              final name = product?.name ?? 'Unknown product';
              final removing = removingListingId == listing['id'];
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name,
                              style: AppTextStyles.bodyMedium
                                  .copyWith(fontWeight: FontWeight.w600)),
                          if (product != null)
                            Text(
                              CurrencyUtils.format(product.price),
                              style: AppTextStyles.bodySmall.copyWith(
                                  color: AppColors.onSurfaceVariant),
                            ),
                        ],
                      ),
                    ),
                    if (removing)
                      const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    else
                      TextButton(
                        onPressed: () => onRemove(listing, name),
                        style: TextButton.styleFrom(
                            foregroundColor: AppColors.error),
                        child: const Text('Remove'),
                      ),
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}
