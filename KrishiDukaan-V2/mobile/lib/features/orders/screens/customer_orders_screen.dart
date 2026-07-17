import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/order_model.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../providers/orders_provider.dart';

class CustomerOrdersScreen extends ConsumerWidget {
  const CustomerOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(customerOrdersProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('My Orders',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: ordersAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: 'Could not load orders.',
          onRetry: () => ref.invalidate(customerOrdersProvider),
        ),
        data: (orders) {
          if (orders.isEmpty) {
            return EmptyState(
              title: 'No orders yet',
              subtitle: 'Your order history will appear here',
              icon: Icons.receipt_outlined,
              actionLabel: 'Browse Products',
              onAction: () => context.go('/marketplace'),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: orders.length,
            itemBuilder: (_, i) => _OrderCard(order: orders[i]),
          );
        },
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  final OrderModel order;
  const _OrderCard({required this.order});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.go('/orders/${order.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
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
                  _StatusChip(status: order.status),
                ],
              ),
              const SizedBox(height: 8),
              Text(order.sellerName,
                  style: AppTextStyles.body
                      .copyWith(color: AppColors.onSurfaceVariant)),
              const SizedBox(height: 4),
              Text(
                '${order.items.length} item${order.items.length != 1 ? 's' : ''} · ${CurrencyUtils.format(order.total)}',
                style: AppTextStyles.bodyMedium,
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
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
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
