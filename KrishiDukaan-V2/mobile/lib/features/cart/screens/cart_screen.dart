import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/cart_model.dart';
import '../../../core/providers/cart_provider.dart';
import '../../../core/utils/delivery_utils.dart';
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
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              itemBuilder: (_, i) => _CartItemTile(item: items[i]),
            ),
      // In the Scaffold's bottomNavigationBar slot (not the body's Column) so
      // the floating "Added to cart" SnackBar — which dodges bottomNavigationBar
      // but not in-body widgets — no longer renders on top of the Checkout
      // button and blocks it from being tapped for the snackbar's duration.
      bottomNavigationBar: items.isEmpty ? null : const _CheckoutBar(),
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

  /// Removes this line and offers a one-tap Undo — a lighter-weight,
  /// immediately-reversible alternative to a confirmation dialog, matching
  /// how a single-line removal (unlike the whole-cart "Clear") is cheap to
  /// reverse and doesn't need to interrupt the user.
  void _remove(BuildContext context, WidgetRef ref) {
    final removed = item;
    ref
        .read(cartProvider.notifier)
        .removeItem(item.listingId, item.variantLabel);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('Removed ${removed.catalogName}'),
          action: SnackBarAction(
            label: 'Undo',
            onPressed: () => ref.read(cartProvider.notifier).addItem(removed),
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storeName = item.sellerName.trim().isNotEmpty
        ? item.sellerName.trim()
        : 'Store';

    return Dismissible(
      key: ValueKey('${item.listingId}_${item.variantLabel}'),
      direction: DismissDirection.endToStart,
      background: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        alignment: Alignment.centerRight,
        decoration: BoxDecoration(
          color: AppColors.error,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Icon(Icons.delete_outline, color: Colors.white),
      ),
      onDismissed: (_) => _remove(context, ref),
      child: Card(
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
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            item.catalogName,
                            style: AppTextStyles.bodyMedium,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        InkWell(
                          onTap: () => _remove(context, ref),
                          borderRadius: BorderRadius.circular(16),
                          child: const Padding(
                            padding: EdgeInsets.all(4),
                            child: Icon(
                              Icons.delete_outline,
                              size: 20,
                              color: AppColors.onSurfaceVariant,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (item.variantLabel != null)
                      Text(item.variantLabel!, style: AppTextStyles.caption),
                    // This product ships free — same badge as the website's cart.
                    if (item.freeDelivery)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.local_shipping_outlined,
                                size: 13, color: Color(0xFF15803D)),
                            const SizedBox(width: 4),
                            Text('Free Delivery',
                                style: AppTextStyles.caption.copyWith(
                                    color: const Color(0xFF15803D),
                                    fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
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
      // Keep the size the line was bought at — changing store must not
      // silently re-price a 5L line at the 1L price.
      variantLabel: item.variantLabel,
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
    // GST and delivery are per store — look up the NEW store's own settings.
    unawaited(ref.read(cartProvider.notifier).resolveCommercial(item.copyWith(
          listingId: picked.listing.id,
          sellerPhone: picked.listing.sellerPhone,
        )));

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
    final cart = ref.watch(cartProvider);
    final subtotal = ref.watch(cartTotalProvider);
    final savings = ref.watch(cartSavingsProvider);
    final gstIncluded = ref.watch(cartGstIncludedProvider);
    final customerState = ref.watch(deliveryStateProvider).trim();
    final deliveryState = ref.watch(deliveryChargeProvider);
    // Same rows as the website's cart summary.
    final mrpSubtotal = cart.fold(0.0, (s, i) => s + i.originalPrice * i.quantity);

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
          final gstAdded = delivery.gstAdded;
          // items + GST added on top + delivery — the figure the server will
          // charge (it recomputes all three at payment).
          final grandTotal = subtotal + gstAdded + delivery.totalCharge;
          final deliveryType = delivery.slabType;
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildSummaryRow('Subtotal (MRP)', mrpSubtotal),
              if (savings > 0) ...[
                _buildSummaryRow('Product Discounts', -savings, isDiscount: true),
                _buildSummaryRow('Discounted Subtotal', subtotal),
              ],
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
                  badge: deliveryType == null
                      ? null
                      : (deliveryType == DeliveryType.inState
                          ? 'Within-State'
                          : 'Outside-State'),
                ),
              if (customerState.isNotEmpty && !deliveryState.isLoading)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Deliver to: $customerState',
                      style: AppTextStyles.caption
                          .copyWith(color: Colors.black54, fontSize: 10),
                    ),
                  ),
                ),
              if (delivery.totalWeight > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Text(
                        'Est. weight: ${delivery.totalWeight.toStringAsFixed(2)} kg',
                        style: AppTextStyles.caption.copyWith(
                          color: Colors.black54,
                        ),
                      ),
                    ],
                  ),
                ),
              // Exclusive GST is a real charge on top of the price.
              if (gstAdded > 0) _buildSummaryRow('GST', gstAdded, plus: true),
              // Included GST is already inside the prices — informational only.
              if (gstIncluded > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Incl. GST (in price)',
                          style: AppTextStyles.caption
                              .copyWith(color: Colors.black54)),
                      Text(CurrencyUtils.format(gstIncluded),
                          style: AppTextStyles.caption
                              .copyWith(color: Colors.black54)),
                    ],
                  ),
                ),
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
                        const Text(
                          'Grand Total',
                          style: AppTextStyles.bodySmall,
                        ),
                        Text(
                          CurrencyUtils.format(grandTotal),
                          style: AppTextStyles.priceLarge,
                        ),
                      ],
                    ),
                  ),
                  FilledButton(
                    onPressed: deliveryState.isLoading
                        ? null
                        : () => context.push('/checkout'),
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

  Widget _buildSummaryRow(
    String label,
    double amount, {
    bool isFree = false,
    bool isDiscount = false,
    bool plus = false,
    String? badge,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label,
                    style: AppTextStyles.bodySmall.copyWith(
                        color: isDiscount ? const Color(0xFF15803D) : null)),
                if (badge != null) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                          color: AppColors.primary.withValues(alpha: 0.2)),
                    ),
                    child: Text(badge,
                        style: AppTextStyles.caption.copyWith(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                            fontSize: 10)),
                  ),
                ],
              ],
            ),
          ),
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
              '${plus ? '+ ' : ''}${isDiscount ? '-' : ''}${CurrencyUtils.format(amount.abs())}',
              style: AppTextStyles.bodyMedium.copyWith(
                fontWeight: FontWeight.w600,
                color: isDiscount ? const Color(0xFF15803D) : null,
              ),
            ),
        ],
      ),
    );
  }
}
