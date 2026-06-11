import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/error_view.dart';
import '../data/dashboard_repository.dart';
import '../providers/dashboard_provider.dart';

class SellerOrdersScreen extends ConsumerWidget {
  const SellerOrdersScreen({super.key});

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
        return _SellerOrdersBody(sellerPhone: user.phone);
      },
    );
  }
}

class _SellerOrdersBody extends ConsumerWidget {
  final String sellerPhone;
  const _SellerOrdersBody({required this.sellerPhone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(sellerOrdersProvider(sellerPhone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('My Orders',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: ordersAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (_, _) =>
            const ErrorView(message: 'Could not load orders.'),
        data: (orders) {
          if (orders.isEmpty) {
            return const EmptyState(
              title: 'No orders yet',
              subtitle: 'New orders from customers will appear here',
              icon: Icons.receipt_long_outlined,
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: orders.length,
            itemBuilder: (_, i) => _SellerOrderCard(order: orders[i]),
          );
        },
      ),
    );
  }
}

class _SellerOrderCard extends StatelessWidget {
  final OrderModel order;
  const _SellerOrderCard({required this.order});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '#${order.id.substring(0, 8).toUpperCase()}',
                  style: AppTextStyles.bodyMedium,
                ),
                _StatusBadge(status: order.status),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${order.items.length} item${order.items.length != 1 ? 's' : ''} · ${CurrencyUtils.format(order.total)}',
              style: AppTextStyles.body,
            ),
            if (order.createdAt != null)
              Text(
                DateFormat('dd MMM yyyy, hh:mm a')
                    .format(order.createdAt!),
                style: AppTextStyles.caption
                    .copyWith(color: AppColors.onSurfaceVariant),
              ),
            const SizedBox(height: 12),

            // Delivery address preview
            if (order.customerAddress.isNotEmpty)
              Row(
                children: [
                  const Icon(Icons.location_on_outlined,
                      size: 14, color: AppColors.onSurfaceVariant),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      [
                        order.customerAddress['name'],
                        order.customerAddress['city'],
                      ]
                          .whereType<String>()
                          .join(', '),
                      style: AppTextStyles.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 12),

            // Action buttons
            _ActionButtons(order: order),
          ],
        ),
      ),
    );
  }
}

class _ActionButtons extends StatefulWidget {
  final OrderModel order;
  const _ActionButtons({required this.order});

  @override
  State<_ActionButtons> createState() => _ActionButtonsState();
}

class _ActionButtonsState extends State<_ActionButtons> {
  bool _loading = false;

  Future<void> _updateStatus(String newStatus) async {
    setState(() => _loading = true);
    try {
      await DashboardRepository()
          .updateOrderStatus(widget.order.id, newStatus);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
          height: 32,
          child: Center(
              child: CircularProgressIndicator(strokeWidth: 2)));
    }

    return switch (widget.order.status) {
      'pending' => Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => _updateStatus('cancelled'),
                style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.error,
                    side:
                        const BorderSide(color: AppColors.error)),
                child: const Text('Reject'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton(
                onPressed: () => _updateStatus('accepted'),
                style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary),
                child: const Text('Accept'),
              ),
            ),
          ],
        ),
      'accepted' => SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () => _updateStatus('dispatched'),
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.info),
            child: const Text('Mark Dispatched'),
          ),
        ),
      'dispatched' => SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () => _updateStatus('delivered'),
            style: FilledButton.styleFrom(
                backgroundColor: AppColors.success),
            child: const Text('Mark Delivered'),
          ),
        ),
      _ => Text(
          widget.order.status[0].toUpperCase() +
              widget.order.status.substring(1),
          style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.onSurfaceVariant),
        ),
    };
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

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
