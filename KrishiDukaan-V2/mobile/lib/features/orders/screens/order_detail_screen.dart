import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/utils/order_status_label.dart';
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
                      if (order.totalGst > 0)
                        _PriceRow('GST', CurrencyUtils.format(order.totalGst)),
                      const Divider(),
                      _PriceRow('Total', CurrencyUtils.format(order.total),
                          bold: true),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // The original seller rejected this order and it is being
                // offered to other sellers — explain the wait, and that
                // cancelling (below) refunds straight away.
                if (order.status == 'reassigning') ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.warning.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color: AppColors.warning.withValues(alpha: 0.4)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.sync, color: AppColors.warning),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'The seller couldn\'t fulfil this order, so we are '
                            'finding another seller for you. If no one takes it '
                            'within 24 hours you will be refunded in full. You '
                            'can also cancel now for an immediate refund.',
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.onSurface),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Seller info — hidden while reassigning: the seller named on
                // the order is the one who rejected it.
                if (order.status != 'reassigning') ...[
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

                ],

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
                // Self-service cancel — only while the seller hasn't
                // dispatched yet, matching the seller's own reject window
                // (seller_orders_screen.dart) and the check the server
                // enforces (POST /api/orders/cancel). Also while the order is
                // being offered to other sellers: the server closes the offers
                // and refunds in one step.
                if (order.status == 'placed' ||
                    order.status == 'accepted' ||
                    order.status == 'reassigning') ...[
                  const SizedBox(height: 16),
                  _CancelOrderButton(
                    orderId: order.id,
                    onCancelled: () =>
                        ref.invalidate(orderDetailProvider(orderId)),
                  ),
                ],

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
      'placed' => AppColors.statusPending,
      'accepted' => AppColors.statusAccepted,
      'dispatched' => AppColors.statusDispatched,
      'out_for_delivery' => AppColors.statusDispatched,
      'delivered' => AppColors.statusDelivered,
      'rejected' => AppColors.statusCancelled,
      'cancelled' => AppColors.statusCancelled,
      'reassigning' => AppColors.warning,
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
        orderStatusLabel(status),
        style: AppTextStyles.caption
            .copyWith(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// "Cancel Order" — full self-service refund via POST /api/orders/cancel.
/// Only shown while the order is still "placed" or "accepted"; the server
/// enforces the same window, so this button never gets a stale 409.
class _CancelOrderButton extends StatefulWidget {
  final String orderId;
  final VoidCallback onCancelled;
  const _CancelOrderButton({required this.orderId, required this.onCancelled});

  @override
  State<_CancelOrderButton> createState() => _CancelOrderButtonState();
}

class _CancelOrderButtonState extends State<_CancelOrderButton> {
  bool _busy = false;

  Future<void> _cancel() async {
    final reasonCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this order?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
                "If you paid online, you'll be refunded automatically."),
            const SizedBox(height: 12),
            TextField(
              controller: reasonCtrl,
              decoration: const InputDecoration(
                labelText: 'Reason (optional)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Keep order')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Cancel order'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      final res = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/api/orders/cancel'),
        headers: {
          'Content-Type': 'application/json',
          if (token != null) 'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'orderId': widget.orderId,
          'reason': reasonCtrl.text.trim(),
        }),
      );
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode != 200) {
        throw Exception(body['error'] ?? 'Could not cancel the order.');
      }
      widget.onCancelled();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(body['refunded'] == true
                ? 'Order cancelled and refunded.'
                : 'Order cancelled.'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: _busy ? null : _cancel,
        icon: _busy
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.cancel_outlined, size: 18),
        label: Text(_busy ? 'Cancelling…' : 'Cancel Order'),
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.error,
          side: const BorderSide(color: AppColors.error),
          padding: const EdgeInsets.symmetric(vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
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
