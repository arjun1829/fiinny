import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/cart_model.dart';
import '../../../core/providers/cart_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/empty_state.dart';
import '../../marketplace/widgets/store_selector_sheet.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(cartProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text(
          'Cart (${items.length})',
          style: AppTextStyles.heading2.copyWith(color: Colors.white),
        ),
        actions: [
          if (items.isNotEmpty)
            TextButton(
              onPressed: () => _confirmClear(context, ref),
              child: const Text(
                'Clear',
                style: TextStyle(color: Colors.white70),
              ),
            ),
        ],
      ),
      body: items.isEmpty
          ? EmptyState(
              title: 'Your cart is empty',
              subtitle: 'Browse the marketplace and add products',
              icon: Icons.shopping_cart_outlined,
              actionLabel: 'Browse Products',
              onAction: () => context.go('/marketplace'),
            )
          : Column(
              children: [
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: items.length,
                    itemBuilder: (_, i) => _CartItemTile(item: items[i]),
                  ),
                ),
                const _CheckoutBar(),
              ],
            ),
    );
  }

  void _confirmClear(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Clear cart?'),
        content: const Text('All items will be removed from your cart.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              ref.read(cartProvider.notifier).clear();
            },
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Clear'),
          ),
        ],
      ),
    );
  }
}

class _CartItemTile extends ConsumerWidget {
  final CartItemModel item;
  const _CartItemTile({required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storeName = item.sellerName.trim().isNotEmpty
        ? item.sellerName.trim()
        : 'Store';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 60,
                height: 60,
                child: item.catalogImage != null
                    ? CachedNetworkImage(
                        memCacheWidth: 1000,
                        imageUrl: item.catalogImage!,
                        fit: BoxFit.cover,
                        errorWidget: (_, _, _) => _imgPlaceholder(),
                      )
                    : _imgPlaceholder(),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.catalogName,
                    style: AppTextStyles.bodyMedium,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (item.variantLabel != null)
                    Text(item.variantLabel!, style: AppTextStyles.caption),
                  const SizedBox(height: 6),

                  // ── Selected store + change ──────────────────────────────
                  Row(
                    children: [
                      const Icon(
                        Icons.storefront_outlined,
                        size: 14,
                        color: AppColors.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          storeName,
                          style: AppTextStyles.bodySmall.copyWith(
                            color: AppColors.onSurfaceVariant,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 6),
                      InkWell(
                        onTap: () => _changeStore(context, ref),
                        borderRadius: BorderRadius.circular(6),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.swap_horiz,
                                size: 15,
                                color: AppColors.primary,
                              ),
                              const SizedBox(width: 2),
                              Text(
                                'Change',
                                style: AppTextStyles.caption.copyWith(
                                  color: AppColors.primary,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),

                  // ── Unit price + discount ────────────────────────────────
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 6,
                    children: [
                      Text(
                        CurrencyUtils.format(item.price),
                        style: AppTextStyles.price.copyWith(
                          color: item.hasDiscount
                              ? const Color(0xFF15803D)
                              : null,
                        ),
                      ),
                      if (item.hasDiscount) ...[
                        Text(
                          CurrencyUtils.format(item.originalPrice),
                          style: AppTextStyles.caption.copyWith(
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                        _discountBadge(),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),

                  // ── Line subtotal + quantity ─────────────────────────────
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('Subtotal', style: AppTextStyles.caption),
                          Text(
                            CurrencyUtils.format(item.lineTotal),
                            style: AppTextStyles.bodyMedium.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      _QtyControl(item: item),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _discountBadge() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    decoration: BoxDecoration(
      color: const Color(0xFF16A34A),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      item.discountPct > 0
          ? '${item.discountPct.toStringAsFixed(0)}% OFF'
          : 'Save ${CurrencyUtils.format(item.unitSavings)}',
      style: const TextStyle(
        color: Colors.white,
        fontSize: 9,
        fontWeight: FontWeight.w800,
      ),
    ),
  );

  /// Opens the store picker for this product and re-points the line to the
  /// chosen store, applying that store's price + discount.
  Future<void> _changeStore(BuildContext context, WidgetRef ref) async {
    final picked = await showStoreSelector(
      context,
      catalogId: item.catalogId,
      title: 'Change store',
      subtitle: 'Nearest stores first — pick where to buy',
      currentListingId: item.listingId,
    );
    if (picked == null || !context.mounted) return;

    ref
        .read(cartProvider.notifier)
        .updateStore(
          item,
          listingId: picked.listing.id,
          sellerPhone: picked.listing.sellerPhone,
          sellerName: picked.listing.sellerName,
          price: picked.effectivePrice,
          originalPrice: picked.originalPrice,
          discountPct: picked.discountPct,
        );

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Now buying from ${picked.listing.sellerName.trim().isNotEmpty ? picked.listing.sellerName.trim() : 'the selected store'}',
        ),
        backgroundColor: AppColors.primary,
      ),
    );
  }

  Widget _imgPlaceholder() => Container(
    color: AppColors.surfaceVariant,
    child: const Icon(Icons.grass, color: AppColors.primaryLight),
  );
}

class _QtyControl extends ConsumerWidget {
  final CartItemModel item;
  const _QtyControl({required this.item});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          icon: const Icon(Icons.remove_circle_outline, size: 22),
          color: AppColors.primary,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(),
          onPressed: () => ref
              .read(cartProvider.notifier)
              .updateQuantity(
                item.listingId,
                item.variantLabel,
                item.quantity - 1,
              ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Text('${item.quantity}', style: AppTextStyles.bodyMedium),
        ),
        IconButton(
          icon: const Icon(Icons.add_circle_outline, size: 22),
          color: AppColors.primary,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(),
          onPressed: () => ref
              .read(cartProvider.notifier)
              .updateQuantity(
                item.listingId,
                item.variantLabel,
                item.quantity + 1,
              ),
        ),
      ],
    );
  }
}

class _CheckoutBar extends ConsumerWidget {
  const _CheckoutBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subtotal = ref.watch(cartTotalProvider);
    final savings = ref.watch(cartSavingsProvider);
    final totalGst = ref.watch(cartGstProvider);
    final deliveryState = ref.watch(deliveryChargeProvider);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: deliveryState.when(
        data: (delivery) {
          final grandTotal = subtotal + totalGst + delivery.totalCharge;
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Breakdown
              _buildSummaryRow('Subtotal (MRP)', subtotal),
              if (deliveryState.isLoading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Delivery Charges', style: AppTextStyles.bodySmall),
                      SizedBox(
                        width: 12,
                        height: 12,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ],
                  ),
                )
              else
                _buildSummaryRow(
                  'Delivery Charges',
                  delivery.totalCharge,
                  isFree: delivery.totalCharge == 0,
                ),
              if (delivery.totalWeight > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Text(
                        'Est. weight: ${delivery.totalWeight.toStringAsFixed(2)} kg',
                        style: AppTextStyles.caption.copyWith(color: Colors.black54),
                      ),
                    ],
                  ),
                ),
              if (totalGst > 0) _buildSummaryRow('Total GST', totalGst),
              const Divider(height: 16),
              // Grand Total & Checkout button
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (savings > 0)
                          Text(
                            'You save ${CurrencyUtils.format(savings)}',
                            style: AppTextStyles.caption.copyWith(
                              color: const Color(0xFF15803D),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        const Text('Grand Total', style: AppTextStyles.bodySmall),
                        Text(
                          CurrencyUtils.format(grandTotal),
                          style: AppTextStyles.priceLarge,
                        ),
                      ],
                    ),
                  ),
                  FilledButton(
                    onPressed: deliveryState.isLoading ? null : () => context.push('/checkout'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      minimumSize: const Size(160, 48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Checkout', style: AppTextStyles.button),
                  ),
                ],
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Text('Error loading delivery: $e'),
      ),
    );
  }

  Widget _buildSummaryRow(String label, double amount, {bool isFree = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: AppTextStyles.bodySmall),
          if (isFree)
            Text(
              'FREE',
              style: AppTextStyles.bodySmall.copyWith(
                color: const Color(0xFF15803D),
                fontWeight: FontWeight.w600,
              ),
            )
          else
            Text(
              CurrencyUtils.format(amount),
              style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600),
            ),
        ],
      ),
    );
  }
}
