import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../widgets/customer_actions.dart';
import '../../widgets/kpi_card.dart';
import '../../widgets/range_selector.dart';
import 'analytics_repository.dart';
import 'metrics.dart';
import 'models.dart';

final _searchProvider = StateProvider.autoDispose((_) => '');

class BillsScreen extends ConsumerWidget {
  const BillsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final search = ref.watch(_searchProvider).trim().toLowerCase();
    final bills = ref.watch(filteredBillsProvider).where((b) {
      if (search.isEmpty) return true;
      return b.customerName.toLowerCase().contains(search) ||
          b.number.toLowerCase().contains(search);
    }).toList();

    final loading = ref.watch(billsProvider).isLoading;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('BILL LEDGER', style: kMicro),
                      const Spacer(),
                      Text('${bills.length} SHOWN', style: kMicro),
                    ],
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    style: TextStyle(fontSize: 14, color: AppColors.ink),
                    decoration: const InputDecoration(
                      hintText: 'Search customer or bill no.',
                      prefixIcon: Icon(Icons.search, size: 19),
                      isDense: true,
                    ),
                    onChanged: (v) =>
                        ref.read(_searchProvider.notifier).state = v,
                  ),
                  const SizedBox(height: 10),
                  const RangeSelector(),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: loading
                  ? const Center(child: CircularProgressIndicator())
                  : bills.isEmpty
                      ? Center(
                          child: Text(
                            'No bills found',
                            style: TextStyle(
                                color: AppColors.inkMute, fontSize: 13),
                          ),
                        )
                      : RefreshIndicator(
                          color: AppColors.accent,
                          backgroundColor: AppColors.cardHi,
                          onRefresh: () async {
                            ref.invalidate(billsProvider);
                            await ref.read(billsProvider.future);
                          },
                          child: ListView.separated(
                            padding: const EdgeInsets.fromLTRB(14, 0, 14, 96),
                            itemCount: bills.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 8),
                            itemBuilder: (_, i) => _BillTile(bill: bills[i]),
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BillTile extends StatelessWidget {
  const _BillTile({required this.bill});

  final Bill bill;

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(bill.paymentState);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => showModalBottomSheet<void>(
          context: context,
          showDragHandle: true,
          builder: (_) => _BillDetailSheet(bill: bill),
        ),
        child: Container(
          padding: const EdgeInsets.fromLTRB(0, 13, 14, 13),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // Status rail — identity beside the chip label, never alone.
                  Container(
                    width: 3,
                    height: 34,
                    margin: const EdgeInsets.only(right: 13),
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: const BorderRadius.horizontal(
                          right: Radius.circular(2)),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          bill.customerName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13.5,
                            color: AppColors.ink,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${bill.number}  ·  ${fmtFullDate(bill.date)}  ·  ${bill.channel.label}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: kMicro.copyWith(letterSpacing: 0.3),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        fmtInr(bill.amount),
                        style: kTabular.copyWith(
                            fontSize: 14, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        bill.paymentState.label.toUpperCase(),
                        style: kMicro.copyWith(color: color),
                      ),
                    ],
                  ),
                ],
              ),
              if (bill.canCall || bill.canNote) ...[
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsets.only(left: 16),
                  child: CustomerActions(
                    customerName: bill.customerName,
                    phone: bill.phone,
                    retailerId: bill.retailerId,
                    compact: true,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

Color _statusColor(PaymentState s) => switch (s) {
      PaymentState.paid => AppColors.good,
      PaymentState.partial => AppColors.warning,
      PaymentState.pending => AppColors.critical,
    };

class _BillDetailSheet extends StatelessWidget {
  const _BillDetailSheet({required this.bill});

  final Bill bill;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 34),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(bill.channel.label.toUpperCase(), style: kMicro),
          const SizedBox(height: 5),
          Text(
            bill.customerName,
            style: TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 3),
          Text(bill.number,
              style: TextStyle(color: AppColors.inkMute, fontSize: 12)),
          if (bill.canCall || bill.canNote) ...[
            const SizedBox(height: 14),
            CustomerActions(
              customerName: bill.customerName,
              phone: bill.phone,
              retailerId: bill.retailerId,
            ),
          ],
          const SizedBox(height: 20),
          Panel(
            child: Column(
              children: [
                _Row('Date', fmtFullDate(bill.date)),
                _Row('Bill amount', fmtInr(bill.amount)),
                _Row('Received', fmtInr(bill.amountPaid)),
                _Row('Outstanding', fmtInr(bill.outstanding),
                    color: bill.outstanding > 0 ? AppColors.critical : null),
                if (bill.paymentMode.isNotEmpty)
                  _Row('Payment mode', bill.paymentMode),
                _Row('Status', bill.paymentState.label,
                    color: _statusColor(bill.paymentState)),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Read-only. Edit bills in the web ERP.',
            style: TextStyle(fontSize: 11, color: AppColors.inkMute),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: TextStyle(color: AppColors.inkDim, fontSize: 12.5)),
          Text(
            value,
            style:
                kTabular.copyWith(fontSize: 13, color: color ?? AppColors.ink),
          ),
        ],
      ),
    );
  }
}
