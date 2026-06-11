import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/error_view.dart';
import '../providers/orders_provider.dart';

class OrderDetailScreen extends ConsumerWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orderAsync = ref.watch(orderDetailProvider(orderId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Order Details',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: orderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) =>
            const ErrorView(message: 'Failed to load order.'),
        data: (order) {
          if (order == null) {
            return const ErrorView(message: 'Order not found.');
          }
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Status card
                _SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Order #${order.id.substring(0, 8).toUpperCase()}',
                            style: AppTextStyles.bodyMedium,
                          ),
                          _statusChip(order.status),
                        ],
                      ),
                      if (order.createdAt != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          DateFormat('dd MMM yyyy, hh:mm a')
                              .format(order.createdAt!),
                          style: AppTextStyles.caption,
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Order items
                Text('Items', style: AppTextStyles.heading3),
                const SizedBox(height: 8),
                _SectionCard(
                  child: Column(
                    children: order.items.map((item) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(item.name,
                                      style: AppTextStyles.bodyMedium),
                                  if (item.variantLabel != null)
                                    Text(item.variantLabel!,
                                        style: AppTextStyles.caption),
                                  Text('Qty: ${item.quantity}',
                                      style: AppTextStyles.bodySmall),
                                ],
                              ),
                            ),
                            Text(
                              CurrencyUtils.format(item.lineTotal),
                              style: AppTextStyles.bodyMedium,
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 16),

                // Price breakdown
                _SectionCard(
                  child: Column(
                    children: [
                      _PriceRow('Subtotal',
                          CurrencyUtils.format(order.subtotal)),
                      _PriceRow('Delivery',
                          order.deliveryCharge == 0
                              ? 'Free'
                              : CurrencyUtils.format(order.deliveryCharge)),
                      const Divider(),
                      _PriceRow('Total', CurrencyUtils.format(order.total),
                          bold: true),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Seller info
                Text('Seller', style: AppTextStyles.heading3),
                const SizedBox(height: 8),
                _SectionCard(
                  child: Row(
                    children: [
                      const Icon(Icons.store_outlined,
                          color: AppColors.primary),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(order.sellerName,
                            style: AppTextStyles.bodyMedium),
                      ),
                      IconButton(
                        icon: const Icon(Icons.phone_outlined,
                            color: AppColors.primary),
                        onPressed: () => launchUrl(
                          Uri.parse('tel:${order.sellerId}'),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Delivery address
                Text('Delivery Address', style: AppTextStyles.heading3),
                const SizedBox(height: 8),
                _SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (order.customerAddress['name'] != null)
                        Text(order.customerAddress['name'] as String,
                            style: AppTextStyles.bodyMedium),
                      if (order.customerAddress['address'] != null)
                        Text(order.customerAddress['address'] as String,
                            style: AppTextStyles.body),
                      if (order.customerAddress['city'] != null)
                        Text(
                          '${order.customerAddress['city']}, ${order.customerAddress['pincode'] ?? ''}',
                          style: AppTextStyles.body,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _statusChip(String status) {
    final color = switch (status) {
      'pending' => AppColors.statusPending,
      'accepted' => AppColors.statusAccepted,
      'dispatched' => AppColors.statusDispatched,
      'delivered' => AppColors.statusDelivered,
      'cancelled' => AppColors.statusCancelled,
      _ => AppColors.onSurfaceVariant,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        status[0].toUpperCase() + status.substring(1),
        style: AppTextStyles.caption
            .copyWith(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final Widget child;
  const _SectionCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _PriceRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;

  const _PriceRow(this.label, this.value, {this.bold = false});

  @override
  Widget build(BuildContext context) {
    final style =
        bold ? AppTextStyles.bodyMedium : AppTextStyles.body;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: style),
          Text(value, style: bold ? AppTextStyles.price : style),
        ],
      ),
    );
  }
}
