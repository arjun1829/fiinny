import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../core/erp_links.dart';
import '../core/format.dart';
import '../features/analytics/models.dart';
import 'customer_actions.dart';
import 'ui.dart';

Color paymentColor(PaymentState s) => switch (s) {
      PaymentState.paid => AppColors.good,
      PaymentState.partial => AppColors.warning,
      PaymentState.pending => AppColors.critical,
    };

Color channelColor(Channel c) => switch (c) {
      Channel.b2b => AppColors.b2b,
      Channel.b2c => AppColors.pos,
      Channel.online => AppColors.online,
    };

IconData channelIcon(Channel c) => switch (c) {
      Channel.b2b => Icons.storefront_outlined,
      Channel.b2c => Icons.point_of_sale_outlined,
      Channel.online => Icons.shopping_bag_outlined,
    };

/// One bill as a card row: customer, bill no · date, amount, status chip, and
/// a ⋮ menu with Call / Add note / Details — so the common follow-ups are one
/// tap from the list, never a separate screen.
class BillTile extends StatelessWidget {
  const BillTile({super.key, required this.bill});

  final Bill bill;

  @override
  Widget build(BuildContext context) {
    final status = paymentColor(bill.paymentState);
    return AppCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 4, 12),
      onTap: () => showBillDetails(context, bill),
      child: Row(
        children: [
          IconBadge(
            icon: channelIcon(bill.channel),
            color: channelColor(bill.channel),
            size: 40,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  bill.customerName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 3),
                Text(
                  '${bill.number} · ${fmtDayMonth(bill.date)} · ${bill.channel.label}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.small,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(fmtInr(bill.amount), style: AppText.amount),
              const SizedBox(height: 5),
              StatusChip(bill.paymentState.label, color: status),
            ],
          ),
          _BillMenu(bill: bill),
        ],
      ),
    );
  }
}

enum _BillAction { call, note, details }

class _BillMenu extends StatelessWidget {
  const _BillMenu({required this.bill});

  final Bill bill;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<_BillAction>(
      tooltip: 'More',
      icon: Icon(Icons.more_vert_rounded, size: 20, color: AppColors.inkMute),
      padding: EdgeInsets.zero,
      onSelected: (a) => switch (a) {
        _BillAction.call => callCustomer(context, bill.phone),
        _BillAction.note => addCustomerNote(
            context,
            customerName: bill.customerName,
            retailerId: bill.retailerId!,
          ),
        _BillAction.details => showBillDetails(context, bill),
      },
      itemBuilder: (_) => [
        if (bill.canCall)
          _item(_BillAction.call, Icons.call_outlined, 'Call customer',
              AppColors.good),
        if (bill.canNote)
          _item(_BillAction.note, Icons.edit_note_rounded, 'Add note',
              AppColors.primary),
        _item(_BillAction.details, Icons.receipt_long_outlined, 'View details',
            AppColors.inkDim),
      ],
    );
  }

  PopupMenuItem<_BillAction> _item(
          _BillAction a, IconData icon, String label, Color color) =>
      PopupMenuItem(
        value: a,
        height: 44,
        child: Row(
          children: [
            Icon(icon, size: 19, color: color),
            const SizedBox(width: 12),
            Text(label),
          ],
        ),
      );
}

Future<void> showBillDetails(BuildContext context, Bill bill) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _BillDetailSheet(bill: bill),
  );
}

class _BillDetailSheet extends StatelessWidget {
  const _BillDetailSheet({required this.bill});

  final Bill bill;

  @override
  Widget build(BuildContext context) {
    final status = paymentColor(bill.paymentState);
    final paidShare = bill.amount <= 0
        ? 0.0
        : (bill.amountPaid / bill.amount).clamp(0.0, 1.0);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconBadge(
                  icon: channelIcon(bill.channel),
                  color: channelColor(bill.channel),
                  size: 44,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(bill.customerName,
                          style: AppText.title.copyWith(fontSize: 18)),
                      const SizedBox(height: 2),
                      Text('${bill.channel.label} bill · ${bill.number}',
                          style: AppText.label),
                    ],
                  ),
                ),
                StatusChip(bill.paymentState.label, color: status),
              ],
            ),
            const SizedBox(height: 18),
            AppCard(
              color: AppColors.cardHi,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Bill amount', style: AppText.label),
                  const SizedBox(height: 4),
                  Text(fmtInr(bill.amount),
                      style: AppText.figure.copyWith(fontSize: 26)),
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: paidShare,
                      minHeight: 6,
                      backgroundColor: AppColors.border,
                      valueColor: AlwaysStoppedAnimation(AppColors.good),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    bill.outstanding > 0
                        ? '${fmtInr(bill.amountPaid)} received · ${fmtInr(bill.outstanding)} due'
                        : 'Fully received',
                    style: AppText.small,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            InfoRow('Date', fmtFullDate(bill.date)),
            const Divider(),
            InfoRow('Received', fmtInr(bill.amountPaid), color: AppColors.good),
            const Divider(),
            InfoRow('Outstanding', fmtInr(bill.outstanding),
                color: bill.outstanding > 0 ? AppColors.critical : null,
                bold: true),
            if (bill.paymentMode.isNotEmpty) ...[
              const Divider(),
              InfoRow('Payment mode', bill.paymentMode),
            ],
            if (bill.canCall || bill.canNote) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  if (bill.canCall)
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => callCustomer(context, bill.phone),
                        icon: Icon(Icons.call_outlined,
                            size: 18, color: AppColors.good),
                        label: const Text('Call'),
                      ),
                    ),
                  if (bill.canCall && bill.canNote) const SizedBox(width: 10),
                  if (bill.canNote)
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => addCustomerNote(
                          context,
                          customerName: bill.customerName,
                          retailerId: bill.retailerId!,
                        ),
                        icon: Icon(Icons.edit_note_rounded,
                            size: 20, color: AppColors.primary),
                        label: const Text('Add note'),
                      ),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => openErp(context, '/order-history'),
                icon: const Icon(Icons.open_in_new_rounded, size: 18),
                label: const Text('Edit in web ERP'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
