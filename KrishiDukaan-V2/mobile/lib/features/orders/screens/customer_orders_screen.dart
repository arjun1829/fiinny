import 'package:flutter/material.dart';
import '../refund_stage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/back_or_home_button.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/utils/order_status_label.dart';
import '../../../core/models/order_model.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/load_more_tile.dart';
import '../providers/orders_provider.dart';

class CustomerOrdersScreen extends ConsumerWidget {
  const CustomerOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(customerOrdersProvider);
    final isSeller = ref.watch(currentUserProvider).value?.isSeller ?? false;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        // After checkout this screen is opened with go() — nothing to pop —
        // so the default arrow never appeared. This one always does.
        leading: const BackOrHomeButton(color: Colors.white),
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
            if (isSeller) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const _PersonalOrdersNote(),
                  const SizedBox(height: 40),
                  EmptyState(
                    title: 'No orders yet',
                    subtitle: 'Products you buy will appear here',
                    icon: Icons.receipt_outlined,
                    actionLabel: 'Browse Products',
                    onAction: () => context.go('/marketplace'),
                  ),
                ],
              );
            }
            return EmptyState(
              title: 'No orders yet',
              subtitle: 'Your order history will appear here',
              icon: Icons.receipt_outlined,
              actionLabel: 'Browse Products',
              onAction: () => context.go('/marketplace'),
            );
          }
          // The newest 30 per query are live; "Load more" reads older ones.
          final feed = ref.read(customerOrdersFeedProvider);
          final lead = isSeller ? 1 : 0;
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: orders.length + 1 + lead,
            itemBuilder: (_, i) {
              if (isSeller && i == 0) return const _PersonalOrdersNote();
              final j = i - lead;
              return j == orders.length
                  ? LoadMoreTile(feed: feed, label: 'Load older orders')
                  : _OrderCard(order: orders[j]);
            },
          );
        },
      ),
    );
  }
}

/// For sellers, who have two order lists: this one is what THEY bought.
class _PersonalOrdersNote extends StatelessWidget {
  const _PersonalOrdersNote();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
      decoration: BoxDecoration(
        color: AppColors.primaryContainer.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 18, color: AppColors.primary),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'These are products you bought for yourself. Orders customers '
              'place with your shop are in Customer Orders.',
              style: TextStyle(fontSize: 12.5, height: 1.35),
            ),
          ),
          TextButton(
            onPressed: () => context.push('/dashboard/orders'),
            child: const Text('Open'),
          ),
        ],
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
              // Refund at a glance; details on the order screen.
              if (RefundStage.of(order) case final refund?) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      refund.kind == RefundKind.failed
                          ? Icons.error_outline
                          : refund.kind == RefundKind.findingSeller
                              ? Icons.sync
                              : Icons.currency_rupee,
                      size: 16,
                      color: refund.kind == RefundKind.failed
                          ? AppColors.error
                          : refund.kind == RefundKind.findingSeller
                              ? AppColors.warning
                              : AppColors.success,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        refundSummary(refund),
                        style: AppTextStyles.caption.copyWith(
                            fontWeight: FontWeight.w600, color: AppColors.onSurface),
                      ),
                    ),
                  ],
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
