import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
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
        return _SellerOrdersBody(
          sellerPhone: user.phone,
          sellerName: user.name,
        );
      },
    );
  }
}

class _SellerOrdersBody extends ConsumerStatefulWidget {
  final String sellerPhone;
  final String sellerName;
  const _SellerOrdersBody({
    required this.sellerPhone,
    required this.sellerName,
  });

  @override
  ConsumerState<_SellerOrdersBody> createState() => _SellerOrdersBodyState();
}

class _SellerOrdersBodyState extends ConsumerState<_SellerOrdersBody> {
  String _activeFilter = 'all';
  String _activeViewTab = 'orders'; // 'orders' or 'payments'

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(sellerOrdersProvider(widget.sellerPhone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('My Orders',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: () => ref.invalidate(sellerOrdersProvider(widget.sellerPhone)),
          ),
        ],
      ),
      body: ordersAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (err, stack) {
          debugPrint('SellerOrdersScreen error: $err\n$stack');
          return ErrorView(message: 'Could not load orders: $err');
        },
        data: (orders) {
          if (orders.isEmpty) {
            return const EmptyState(
              title: 'No orders yet',
              subtitle: 'New orders from customers will appear here',
              icon: Icons.receipt_long_outlined,
            );
          }

          // Count statuses
          final total = orders.length;
          final placedCount = orders.where((o) => o.status == 'pending').length;
          final dispatchedCount = orders.where((o) => o.status == 'dispatched').length;
          final deliveredCount = orders.where((o) => o.status == 'delivered').length;
          final rejectedCount = orders.where((o) => o.status == 'cancelled').length;
          final acceptedCount = orders.where((o) => o.status == 'accepted').length;

          final paidOrders = orders.where((o) => o.payment?.status == 'paid').toList();
          final paidOrdersCount = paidOrders.length;

          final filteredOrders = _activeFilter == 'all'
              ? orders
              : orders.where((o) {
                  if (_activeFilter == 'pending') return o.status == 'pending';
                  if (_activeFilter == 'dispatched') return o.status == 'dispatched';
                  if (_activeFilter == 'delivered') return o.status == 'delivered';
                  if (_activeFilter == 'cancelled') return o.status == 'cancelled';
                  if (_activeFilter == 'accepted') return o.status == 'accepted';
                  return true;
                }).toList();

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header description block from web
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Incoming Orders',
                      style: AppTextStyles.heading1,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Orders placed by farmers for your online-delivery products.',
                      style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant),
                    ),
                  ],
                ),
              ),

              // View tabs: Orders (5) | Payments
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _buildViewTab('orders', 'Orders ($total)'),
                      _buildViewTab('payments', 'Payments', badgeCount: paidOrdersCount),
                    ],
                  ),
                ),
              ),

              // View content
              Expanded(
                child: _activeViewTab == 'payments'
                    ? _buildPaymentsView(orders)
                    : Column(
                        children: [
                          // Filter chips row
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            child: Row(
                              children: [
                                _filterChip('all', 'All ($total)'),
                                _filterChip('pending', 'New ($placedCount)'),
                                _filterChip('dispatched', 'Dispatched ($dispatchedCount)'),
                                _filterChip('delivered', 'Delivered ($deliveredCount)'),
                                _filterChip('cancelled', 'Rejected ($rejectedCount)'),
                                if (acceptedCount > 0)
                                  _filterChip('accepted', 'Processing ($acceptedCount)'),
                              ],
                            ),
                          ),
                          Expanded(
                            child: filteredOrders.isEmpty
                                ? Center(
                                    child: Text(
                                      'No orders in this category',
                                      style: AppTextStyles.body.copyWith(
                                        color: AppColors.onSurfaceVariant,
                                      ),
                                    ),
                                  )
                                : ListView.builder(
                                    padding: const EdgeInsets.only(left: 16, right: 16, bottom: 16),
                                    itemCount: filteredOrders.length,
                                    itemBuilder: (_, i) => _SellerOrderCard(
                                      order: filteredOrders[i],
                                      sellerName: widget.sellerName,
                                      sellerPhone: widget.sellerPhone,
                                      onStatusChanged: () {
                                        ref.invalidate(sellerOrdersProvider(widget.sellerPhone));
                                      },
                                    ),
                                  ),
                          ),
                        ],
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildViewTab(String viewTabKey, String label, {int badgeCount = 0}) {
    final isSelected = _activeViewTab == viewTabKey;
    return GestureDetector(
      onTap: () {
        setState(() {
          _activeViewTab = viewTabKey;
          _activeFilter = 'all'; // Reset status filter when switching view tabs
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  )
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              viewTabKey == 'orders' ? Icons.shopping_bag_outlined : Icons.credit_card_outlined,
              size: 16,
              color: isSelected ? AppColors.onSurface : AppColors.onSurfaceVariant,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: AppTextStyles.bodyMedium.copyWith(
                fontWeight: FontWeight.bold,
                color: isSelected ? AppColors.onSurface : AppColors.onSurfaceVariant,
              ),
            ),
            if (badgeCount > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.green.shade100,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '$badgeCount',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: Colors.green.shade700,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildPaymentsView(List<OrderModel> orders) {
    final paidOrders = orders.where((o) => o.payment?.status == 'paid').toList();
    final paidOrdersCount = paidOrders.length;
    final totalRevenue = paidOrders.fold<double>(0.0, (sum, o) => sum + (o.payment?.amount ?? 0.0));

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      children: [
        // Summary cards row
        Row(
          children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.green.shade100),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: Colors.green.shade100,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.currency_rupee, color: AppColors.success, size: 18),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'TOTAL COLLECTED',
                            style: AppTextStyles.caption.copyWith(
                              color: Colors.green.shade700,
                              fontWeight: FontWeight.bold,
                              fontSize: 9,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            CurrencyUtils.format(totalRevenue),
                            style: AppTextStyles.heading3.copyWith(
                              color: Colors.green.shade800,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.primary.withValues(alpha: 0.1)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.verified_user_outlined, color: AppColors.primary, size: 18),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'PAID ORDERS',
                            style: AppTextStyles.caption.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.bold,
                              fontSize: 9,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '$paidOrdersCount / ${orders.length}',
                            style: AppTextStyles.heading3.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Payments list
        if (orders.isEmpty)
          const Center(child: Padding(
            padding: EdgeInsets.all(32.0),
            child: Text('No payment details available'),
          ))
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: orders.length,
            itemBuilder: (context, index) {
              final order = orders[index];
              return _PaymentCard(order: order);
            },
          ),
      ],
    );
  }

  Widget _filterChip(String filterKey, String label) {
    final isSelected = _activeFilter == filterKey;
    return Padding(
      padding: const EdgeInsets.only(right: 8.0),
      child: ChoiceChip(
        label: Text(label),
        selected: isSelected,
        onSelected: (selected) {
          if (selected) {
            setState(() {
              _activeFilter = filterKey;
            });
          }
        },
        selectedColor: AppColors.primary.withValues(alpha: 0.15),
        labelStyle: TextStyle(
          color: isSelected ? AppColors.primary : AppColors.onSurface,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
        ),
      ),
    );
  }
}

class _SellerOrderCard extends StatelessWidget {
  final OrderModel order;
  final String sellerName;
  final String sellerPhone;
  final VoidCallback onStatusChanged;
  const _SellerOrderCard({
    required this.order,
    required this.sellerName,
    required this.sellerPhone,
    required this.onStatusChanged,
  });

  @override
  Widget build(BuildContext context) {
    final addressName = order.customerAddress['name'] as String? ?? '';
    final addressText = order.customerAddress['address'] as String? ?? '';
    final addressCity = order.customerAddress['city'] as String? ?? '';
    final addressPincode = order.customerAddress['pincode'] as String? ?? '';

    final addressStr = [
      if (addressText.isNotEmpty) addressText else if (addressName.isNotEmpty) addressName,
      if (addressCity.isNotEmpty) addressCity,
      if (addressPincode.isNotEmpty) addressPincode
    ].join(', ');

    final statusConfig = switch (order.status) {
      'pending' => (
          label: 'Order Placed',
          icon: Icons.access_time,
          color: Colors.amber.shade800,
          bg: Colors.amber.shade50,
          border: Colors.amber.shade200
        ),
      'accepted' => (
          label: 'Processing',
          icon: Icons.check_circle_outline,
          color: Colors.blue.shade700,
          bg: Colors.blue.shade50,
          border: Colors.blue.shade200
        ),
      'dispatched' => (
          label: 'Out for Delivery',
          icon: Icons.local_shipping_outlined,
          color: Colors.purple.shade700,
          bg: Colors.purple.shade50,
          border: Colors.purple.shade200
        ),
      'delivered' => (
          label: 'Delivered',
          icon: Icons.done_all_outlined,
          color: Colors.green.shade700,
          bg: Colors.green.shade50,
          border: Colors.green.shade200
        ),
      'cancelled' => (
          label: 'Rejected',
          icon: Icons.cancel_outlined,
          color: Colors.red.shade700,
          bg: Colors.red.shade50,
          border: Colors.red.shade200
        ),
      _ => (
          label: order.status,
          icon: Icons.help_outline,
          color: AppColors.onSurfaceVariant,
          bg: Colors.grey.shade50,
          border: Colors.grey.shade200
        ),
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: statusConfig.border, width: 1),
      ),
      elevation: 2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Status banner
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: statusConfig.bg,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                topRight: Radius.circular(12),
              ),
              border: Border(
                bottom: BorderSide(color: statusConfig.border),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(statusConfig.icon, size: 16, color: statusConfig.color),
                    const SizedBox(width: 8),
                    Text(
                      statusConfig.label.toUpperCase(),
                      style: AppTextStyles.caption.copyWith(
                        color: statusConfig.color,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.1,
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    _PaymentBadge(payment: order.payment),
                    const SizedBox(width: 8),
                    if (order.createdAt != null)
                      Text(
                        DateFormat('dd MMM, hh:mm a').format(order.createdAt!),
                        style: AppTextStyles.caption.copyWith(fontSize: 10),
                      ),
                  ],
                ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ID and Price header row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '#${order.id.substring(0, 8).toUpperCase()}',
                      style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          CurrencyUtils.format(order.total),
                          style: AppTextStyles.heading3.copyWith(
                            fontWeight: FontWeight.bold,
                            color: AppColors.secondary,
                          ),
                        ),
                        if (order.deliveryCharge > 0)
                          Text(
                            'incl. ${CurrencyUtils.format(order.deliveryCharge)} delivery',
                            style: const TextStyle(fontSize: 9, color: AppColors.onSurfaceVariant),
                          ),
                        Text(
                          '${order.items.length} item${order.items.length != 1 ? "s" : ""}'
                          '${order.invoiceNumber != null ? " · ${order.invoiceNumber}" : ""}',
                          style: AppTextStyles.caption.copyWith(fontSize: 9),
                        ),
                      ],
                    ),
                  ],
                ),
                const Divider(height: 20),

                // Customer details
                Text('Customer details:', style: AppTextStyles.bodySmall.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.person_outline, size: 16, color: AppColors.onSurfaceVariant),
                    const SizedBox(width: 8),
                    Text(order.customerName, style: AppTextStyles.bodyMedium),
                    const Spacer(),
                    if (order.customerPhone.isNotEmpty)
                      IconButton(
                        icon: const Icon(Icons.phone, size: 18, color: AppColors.primary),
                        onPressed: () => launchUrl(Uri.parse('tel:${order.customerPhone}')),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                  ],
                ),
                if (addressStr.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.location_on_outlined, size: 16, color: AppColors.onSurfaceVariant),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          addressStr,
                          style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
                const Divider(height: 20),

                // Order items preview
                Text('Order Items:', style: AppTextStyles.bodySmall.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.grey.shade200),
                  ),
                  child: Column(
                    children: List.generate(order.items.length, (idx) {
                      final item = order.items[idx];
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          border: idx > 0
                              ? Border(top: BorderSide(color: Colors.grey.shade200))
                              : null,
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Row(
                                children: [
                                  Text(item.name, style: AppTextStyles.bodyMedium),
                                  if (item.variantLabel != null && item.variantLabel!.isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(left: 6.0),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: AppColors.primary.withValues(alpha: 0.08),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Text(
                                          item.variantLabel!,
                                          style: const TextStyle(fontSize: 10, color: AppColors.primary, fontWeight: FontWeight.bold),
                                        ),
                                      ),
                                    ),
                                  Text(' × ${item.quantity}', style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant)),
                                ],
                              ),
                            ),
                            Text(
                              CurrencyUtils.format(item.lineTotal),
                              style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      );
                    }),
                  ),
                ),
                const Divider(height: 20),

                // Order progress bar
                _OrderProgressBar(status: order.status),
                const SizedBox(height: 16),

                // Action buttons & Invoice download integrated
                _ActionButtons(
                  order: order,
                  sellerName: sellerName,
                  sellerPhone: sellerPhone,
                  onStatusChanged: onStatusChanged,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderProgressBar extends StatelessWidget {
  final String status;
  const _OrderProgressBar({required this.status});

  @override
  Widget build(BuildContext context) {
    if (status == 'cancelled') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.error.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.error.withValues(alpha: 0.15)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cancel_outlined, size: 16, color: AppColors.error),
            const SizedBox(width: 8),
            Text(
              'ORDER REJECTED',
              style: AppTextStyles.caption.copyWith(color: AppColors.error, fontWeight: FontWeight.bold, letterSpacing: 1.1),
            ),
          ],
        ),
      );
    }

    final steps = ['pending', 'dispatched', 'delivered'];
    final labels = ['Order Placed', 'Out for Delivery', 'Delivered'];
    final icons = [Icons.access_time, Icons.local_shipping_outlined, Icons.check_circle_outline];

    final currentIdx = switch (status) {
      'pending' => 0,
      'accepted' => 0,
      'dispatched' => 1,
      'delivered' => 2,
      _ => -1,
    };

    return Row(
      children: List.generate(steps.length, (idx) {
        final isReached = currentIdx >= idx;
        final isCurrent = currentIdx == idx;
        final isLast = idx == steps.length - 1;

        final stepColor = isCurrent
            ? AppColors.primary
            : isReached
                ? AppColors.success
                : AppColors.onSurfaceVariant.withValues(alpha: 0.3);

        return Expanded(
          child: Row(
            children: [
              Column(
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: isCurrent
                          ? AppColors.primary.withValues(alpha: 0.15)
                          : isReached
                              ? AppColors.success
                              : Colors.white,
                      border: Border.all(color: stepColor, width: 2),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      isReached && !isCurrent ? Icons.check : icons[idx],
                      size: 12,
                      color: isCurrent
                          ? AppColors.primary
                          : isReached
                              ? Colors.white
                              : AppColors.onSurfaceVariant.withValues(alpha: 0.3),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    labels[idx],
                    style: TextStyle(
                      fontSize: 8,
                      fontWeight: isReached ? FontWeight.bold : FontWeight.normal,
                      color: stepColor,
                    ),
                  ),
                ],
              ),
              if (!isLast)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 12.0),
                    child: Container(
                      height: 2,
                      color: currentIdx > idx
                          ? AppColors.success
                          : AppColors.onSurfaceVariant.withValues(alpha: 0.15),
                    ),
                  ),
                ),
            ],
          ),
        );
      }),
    );
  }
}

class _PaymentBadge extends StatelessWidget {
  final OrderPaymentModel? payment;
  const _PaymentBadge({this.payment});

  @override
  Widget build(BuildContext context) {
    if (payment == null) {
      const color = AppColors.onSurfaceVariant;
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.info_outline, size: 10, color: color),
            const SizedBox(width: 4),
            Text(
              'COD / UNPAID',
              style: AppTextStyles.caption.copyWith(color: color, fontWeight: FontWeight.bold, fontSize: 8),
            ),
          ],
        ),
      );
    }

    if (payment!.status == 'paid') {
      const color = AppColors.success;
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.verified_user_outlined, size: 10, color: color),
            const SizedBox(width: 4),
            Text(
              'PAID VIA RAZORPAY',
              style: AppTextStyles.caption.copyWith(color: color, fontWeight: FontWeight.bold, fontSize: 8),
            ),
          ],
        ),
      );
    }

    const color = AppColors.error;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cancel_outlined, size: 10, color: color),
          const SizedBox(width: 4),
          Text(
            payment!.status.toUpperCase(),
            style: AppTextStyles.caption.copyWith(color: color, fontWeight: FontWeight.bold, fontSize: 8),
          ),
        ],
      ),
    );
  }
}

class _ActionButtons extends StatefulWidget {
  final OrderModel order;
  final String sellerName;
  final String sellerPhone;
  final VoidCallback onStatusChanged;
  const _ActionButtons({
    required this.order,
    required this.sellerName,
    required this.sellerPhone,
    required this.onStatusChanged,
  });

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
      widget.onStatusChanged();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
          height: 48,
          child: Center(
              child: CircularProgressIndicator(strokeWidth: 2)));
    }

    final hasActions = widget.order.status == 'pending' ||
        widget.order.status == 'accepted' ||
        widget.order.status == 'dispatched';

    final invoiceButton = OutlinedButton.icon(
      onPressed: () => _showInvoiceDialog(
        context,
        widget.order,
        sellerName: widget.sellerName,
        sellerPhone: widget.sellerPhone,
      ),
      icon: const Icon(Icons.download, size: 16),
      label: const Text('Download Invoice'),
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        side: const BorderSide(color: AppColors.primary),
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );

    if (!hasActions) {
      return SizedBox(
        width: double.infinity,
        child: invoiceButton,
      );
    }

    return Column(
      children: [
        Row(
          children: [
            if (widget.order.status == 'pending') ...[
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _updateStatus('cancelled'),
                  icon: const Icon(Icons.cancel_outlined, size: 16),
                  label: const Text('Reject'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.error,
                    side: const BorderSide(color: AppColors.error),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _updateStatus('dispatched'),
                  icon: const Icon(Icons.local_shipping_outlined, size: 16),
                  label: const Text('Mark Dispatched'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ] else if (widget.order.status == 'accepted') ...[
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _updateStatus('dispatched'),
                  icon: const Icon(Icons.local_shipping_outlined, size: 16),
                  label: const Text('Mark Dispatched'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.info,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ] else if (widget.order.status == 'dispatched') ...[
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _updateStatus('delivered'),
                  icon: const Icon(Icons.done_all_outlined, size: 16),
                  label: const Text('Mark Delivered'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.success,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: invoiceButton,
        ),
      ],
    );
  }
}

class _PaymentCard extends StatelessWidget {
  final OrderModel order;
  const _PaymentCard({required this.order});

  @override
  Widget build(BuildContext context) {
    final payment = order.payment;
    final isPaid = payment?.status == 'paid';
    final cardBgColor = isPaid ? Colors.green.shade50.withValues(alpha: 0.3) : Colors.white;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: isPaid ? Colors.green.shade100 : Colors.grey.shade200, width: 1),
      ),
      elevation: 0,
      color: cardBgColor,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header banner
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: isPaid ? Colors.green.shade50 : Colors.grey.shade50,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
              ),
              border: Border(
                bottom: BorderSide(color: isPaid ? Colors.green.shade100 : Colors.grey.shade200),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(
                      isPaid ? Icons.verified_user : Icons.credit_card,
                      size: 16,
                      color: isPaid ? Colors.green.shade700 : Colors.grey.shade500,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isPaid ? 'Payment Received' : 'No Online Payment',
                      style: AppTextStyles.caption.copyWith(
                        color: isPaid ? Colors.green.shade700 : Colors.grey.shade700,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                _PaymentBadge(payment: payment),
              ],
            ),
          ),

          // Body
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Order ID & Price Row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '#${order.id.substring(0, 8).toUpperCase()}',
                          style: AppTextStyles.heading3.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Text(
                              order.customerName,
                              style: AppTextStyles.bodySmall.copyWith(fontWeight: FontWeight.bold, color: AppColors.onSurface),
                            ),
                            if (order.customerPhone.isNotEmpty) ...[
                              const SizedBox(width: 8),
                              InkWell(
                                onTap: () => launchUrl(Uri.parse('tel:${order.customerPhone}')),
                                child: Text(
                                  order.customerPhone,
                                  style: AppTextStyles.bodySmall.copyWith(
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.bold,
                                    decoration: TextDecoration.underline,
                                  ),
                                ),
                              ),
                            ]
                          ],
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          CurrencyUtils.format(order.total),
                          style: AppTextStyles.heading3.copyWith(
                            fontWeight: FontWeight.bold,
                            color: AppColors.secondary,
                          ),
                        ),
                        Text(
                          '${order.items.length} item(s)',
                          style: AppTextStyles.caption,
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Payment Details box
                if (isPaid && payment != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.green.shade50.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.green.shade100),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.shield_outlined, size: 14, color: AppColors.success),
                            const SizedBox(width: 6),
                            Text(
                              'Razorpay Payment Details',
                              style: AppTextStyles.caption.copyWith(
                                color: Colors.green.shade700,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        _buildPaymentDetailRow('Payment ID', payment.razorpayPaymentId ?? '—', isMono: true),
                        _buildPaymentDetailRow('Order ID', payment.razorpayOrderId ?? '—'),
                        _buildPaymentDetailRow('Amount Paid', CurrencyUtils.format(payment.amount), isBoldValue: true),
                        _buildPaymentDetailRow('Paid At', _formatIsoDateString(payment.paidAt)),
                      ],
                    ),
                  )
                else
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: const Column(
                      children: [
                        Icon(Icons.info_outline, size: 24, color: Colors.grey),
                        SizedBox(height: 6),
                        Text(
                          'No online payment for this order',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.onSurface),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Placed without Razorpay payment or payment is pending.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 10, color: AppColors.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),

                const Divider(height: 24),
                // Footer
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Order placed', style: AppTextStyles.bodySmall),
                    Text(
                      order.createdAt != null
                          ? DateFormat('d MMM yyyy, h:mm a').format(order.createdAt!)
                          : '—',
                      style: AppTextStyles.bodySmall.copyWith(fontWeight: FontWeight.bold, color: AppColors.onSurface),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentDetailRow(String label, String value, {bool isMono = false, bool isBoldValue = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant)),
          Text(
            value,
            style: isMono
                ? const TextStyle(fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.bold)
                : AppTextStyles.bodySmall.copyWith(
                    fontWeight: isBoldValue ? FontWeight.bold : FontWeight.normal,
                    color: isBoldValue ? AppColors.success : AppColors.onSurface,
                  ),
          ),
        ],
      ),
    );
  }

  String _formatIsoDateString(String? isoStr) {
    if (isoStr == null || isoStr.isEmpty) return '—';
    try {
      final dateTime = DateTime.parse(isoStr);
      return DateFormat('d MMM yyyy, h:mm a').format(dateTime);
    } catch (e) {
      return isoStr;
    }
  }
}

// Top-level Invoice dialog helper
void _showInvoiceDialog(BuildContext context, OrderModel order, {String? sellerName, String? sellerPhone}) {
  final addressName = order.customerAddress['name'] as String? ?? '';
  final addressText = order.customerAddress['address'] as String? ?? '';
  final addressCity = order.customerAddress['city'] as String? ?? '';
  final addressPincode = order.customerAddress['pincode'] as String? ?? '';

  final addressStr = [
    if (addressText.isNotEmpty) addressText else if (addressName.isNotEmpty) addressName,
    if (addressCity.isNotEmpty) addressCity,
    if (addressPincode.isNotEmpty) addressPincode
  ].join(', ');

  final invoiceNum = order.invoiceNumber ?? 'INV-${order.id.substring(0, 8).toUpperCase()}';
  final dateStr = order.createdAt != null
      ? DateFormat('dd MMM yyyy, hh:mm a').format(order.createdAt!)
      : '—';

  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
        ),
      ),
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Invoice Details',
                  style: AppTextStyles.heading2,
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const Divider(),
            const SizedBox(height: 10),

            // Header Info
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        sellerName ?? order.sellerName,
                        style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold),
                      ),
                      if (sellerPhone != null && sellerPhone.isNotEmpty)
                        Text(
                          'Phone: $sellerPhone',
                          style: AppTextStyles.bodySmall,
                        ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      invoiceNum,
                      style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: AppColors.primary),
                    ),
                    Text(
                      dateStr,
                      style: AppTextStyles.bodySmall,
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Bill To
            Text(
              'BILL TO:',
              style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              order.customerName,
              style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold),
            ),
            if (order.customerPhone.isNotEmpty)
              Text(
                'Phone: ${order.customerPhone}',
                style: AppTextStyles.bodySmall,
              ),
            if (addressStr.isNotEmpty)
              Text(
                addressStr,
                style: AppTextStyles.bodySmall,
              ),
            const SizedBox(height: 20),

            // Table Header
            Container(
              color: Colors.grey[100],
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              child: Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: Text('Item', style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.bold)),
                  ),
                  Expanded(
                    child: Text('Qty', textAlign: TextAlign.center, style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.bold)),
                  ),
                  Expanded(
                    child: Text('Price', textAlign: TextAlign.right, style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.bold)),
                  ),
                  Expanded(
                    child: Text('Total', textAlign: TextAlign.right, style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ),

            // Item rows
            ...order.items.map((item) {
              final variantLabelStr = item.variantLabel != null && item.variantLabel!.isNotEmpty
                  ? ' (${item.variantLabel})'
                  : '';
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                child: Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: Text(
                        '${item.name}$variantLabelStr',
                        style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurface),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        '${item.quantity}',
                        textAlign: TextAlign.center,
                        style: AppTextStyles.bodySmall,
                      ),
                    ),
                    Expanded(
                      child: Text(
                        CurrencyUtils.format(item.price),
                        textAlign: TextAlign.right,
                        style: AppTextStyles.bodySmall,
                      ),
                    ),
                    Expanded(
                      child: Text(
                        CurrencyUtils.format(item.lineTotal),
                        textAlign: TextAlign.right,
                        style: AppTextStyles.bodySmall.copyWith(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
              );
            }),

            const Divider(),

            // Totals
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Subtotal', style: AppTextStyles.bodySmall),
                  Text(CurrencyUtils.format(order.subtotal), style: AppTextStyles.bodySmall),
                ],
              ),
            ),
            if (order.deliveryCharge > 0)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Delivery Charge', style: AppTextStyles.bodySmall),
                    Text(CurrencyUtils.format(order.deliveryCharge), style: AppTextStyles.bodySmall),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Grand Total', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold)),
                  Text(
                    CurrencyUtils.format(order.total),
                    style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: AppColors.secondary),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // Copy invoice button
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () {
                  final textBuffer = StringBuffer();
                  textBuffer.writeln('=== INVOICE: $invoiceNum ===');
                  textBuffer.writeln('Date: $dateStr');
                  textBuffer.writeln('Seller: ${sellerName ?? order.sellerName}');
                  if (sellerPhone != null) textBuffer.writeln('Seller Phone: $sellerPhone');
                  textBuffer.writeln('--------------------------------');
                  textBuffer.writeln('BILL TO:');
                  textBuffer.writeln('Customer: ${order.customerName}');
                  textBuffer.writeln('Phone: ${order.customerPhone}');
                  textBuffer.writeln('Address: $addressStr');
                  textBuffer.writeln('--------------------------------');
                  textBuffer.writeln('ITEMS:');
                  for (final item in order.items) {
                    final variant = item.variantLabel != null ? ' (${item.variantLabel})' : '';
                    textBuffer.writeln('- ${item.name}$variant x${item.quantity}: ${CurrencyUtils.format(item.lineTotal)}');
                  }
                  textBuffer.writeln('--------------------------------');
                  textBuffer.writeln('Subtotal: ${CurrencyUtils.format(order.subtotal)}');
                  if (order.deliveryCharge > 0) {
                    textBuffer.writeln('Delivery Charge: ${CurrencyUtils.format(order.deliveryCharge)}');
                  }
                  textBuffer.writeln('Grand Total: ${CurrencyUtils.format(order.total)}');
                  textBuffer.writeln('================================');

                  Clipboard.setData(ClipboardData(text: textBuffer.toString())).then((_) {
                    if (context.mounted) {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Invoice details copied to clipboard!')),
                      );
                    }
                  });
                },
                icon: const Icon(Icons.copy),
                label: const Text('Copy Invoice Text'),
                style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
              ),
            ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    ),
  );
}
