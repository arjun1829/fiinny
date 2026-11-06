import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/theme.dart';
import '../../core/access.dart';
import '../../core/format.dart';
import '../../core/parse.dart';
import '../../widgets/customer_actions.dart';
import '../../widgets/form_bits.dart';
import '../../widgets/kpi_card.dart';
import '../auth/auth_repository.dart';
import '../billing/b2b_invoice_screen.dart';
import '../billing/bill_detail_screen.dart';
import '../billing/pos_screen.dart';
import 'customer.dart';
import 'customer_form_screen.dart';
import 'customers_repository.dart';
import 'payment_sheet.dart';

class CustomerDetailScreen extends ConsumerWidget {
  const CustomerDetailScreen({super.key, required this.customerId});
  final String customerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(appUserProvider).valueOrNull;
    final access = ref.watch(accessProvider);
    final all = ref.watch(customersProvider).valueOrNull ?? const <Customer>[];
    final c = all.where((x) => x.id == customerId).firstOrNull;
    if (c == null || user == null) {
      return Scaffold(appBar: AppBar(), body: const Center(child: Text('Customer not found.')));
    }
    final ledger = ref.watch(customerLedgerProvider(c.id));
    final canCollect = c.isPosCustomer ? user.can.canCollectKhata : user.can.canRecordPayment;

    Future<void> openPayment() async {
      final ok = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        enableDrag: false,
        builder: (_) => PaymentSheet(customer: c, outstanding: ledger.valueOrNull?.outstanding ?? c.cachedDue),
      );
      if (ok == true) {
        ref.invalidate(customerLedgerProvider(c.id));
        ref.invalidate(customersProvider);
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(c.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          if (user.can.canEditCustomers)
            IconButton(
              tooltip: 'Edit',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => CustomerFormScreen(customer: c))),
            ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.accent,
        onRefresh: () async {
          ref.invalidate(customerLedgerProvider(c.id));
          await ref.read(customerLedgerProvider(c.id).future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 30),
          children: [
            Row(children: [
              Pill(c.isPosCustomer ? 'Counter customer' : 'B2B partner',
                  color: c.isPosCustomer ? AppColors.pos : AppColors.b2b),
              const Spacer(),
              CustomerActions(customerName: c.name, phone: c.phone, retailerId: c.id),
              if (c.phone.isNotEmpty) ...[
                const SizedBox(width: 8),
                IconButton.filledTonal(
                  visualDensity: VisualDensity.compact,
                  tooltip: 'WhatsApp',
                  icon: const Icon(Icons.chat_rounded, size: 18),
                  onPressed: () {
                    final p = phoneKey(c.phone);
                    final due = ledger.valueOrNull?.outstanding ?? 0;
                    final text = due > 0
                        ? 'Namaste ${c.name}, your outstanding balance with ${user.businessName} is ${fmtInr2(due)}. Kindly arrange payment.'
                        : 'Namaste ${c.name},';
                    launchUrl(
                        Uri.parse('https://wa.me/${p.length == 10 ? '91$p' : p}?text=${Uri.encodeComponent(text)}'),
                        mode: LaunchMode.externalApplication);
                  },
                ),
              ],
            ]),
            const SizedBox(height: 8),
            if (c.placeLine.isNotEmpty || c.phone.isNotEmpty || c.gstin.isNotEmpty)
              Text(
                [c.phone, c.placeLine, if (c.gstin.isNotEmpty) 'GSTIN ${c.gstin}']
                    .where((s) => s.isNotEmpty)
                    .join('  ·  '),
                style: TextStyle(fontSize: 12.5, color: AppColors.inkDim),
              ),
            const SizedBox(height: 14),
            ledger.when(
              loading: () => const Padding(
                  padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator())),
              error: (e, _) => EmptyNote('Could not load the ledger. Pull to retry.\n$e'),
              data: (l) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(
                    child: KpiCard(
                      label: 'Outstanding',
                      value: fmtInr(l.outstanding),
                      accent: l.outstanding > 0 ? AppColors.critical : AppColors.good,
                      sub: l.paymentsVisible ? 'live from bills & payments' : 'last synced balance',
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: KpiCard(
                        label: 'Billed', value: fmtInrCompact(l.totalBilled), sub: 'received ${fmtInrCompact(l.totalReceived)}'),
                  ),
                ]),
                const SizedBox(height: 12),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  if (canCollect && l.outstanding > 0)
                    FilledButton.icon(
                      onPressed: openPayment,
                      icon: const Icon(Icons.payments_rounded, size: 18),
                      label: Text(c.isPosCustomer ? 'Collect khata' : 'Record payment'),
                    ),
                  if (access?.pos ?? false)
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(context)
                          .push(MaterialPageRoute(builder: (_) => PosScreen(customer: c))),
                      icon: const Icon(Icons.point_of_sale_rounded, size: 18),
                      label: const Text('POS bill'),
                    ),
                  if ((access?.b2b ?? false) && !c.isPosCustomer)
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(context)
                          .push(MaterialPageRoute(builder: (_) => B2bInvoiceScreen(customer: c))),
                      icon: const Icon(Icons.receipt_long_rounded, size: 18),
                      label: const Text('B2B invoice'),
                    ),
                ]),
                SectionTitle('Ledger (${l.entries.length})'),
                if (!l.paymentsVisible)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text('Payments are visible to admins only.',
                        style: TextStyle(fontSize: 11.5, color: AppColors.inkMute)),
                  ),
                if (l.entries.isEmpty)
                  const EmptyNote('No bills or payments yet.')
                else
                  for (final e in l.entries) ...[
                    _LedgerTile(entry: e, khata: c.isPosCustomer),
                    const SizedBox(height: 6),
                  ],
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

class _LedgerTile extends StatelessWidget {
  const _LedgerTile({required this.entry, required this.khata});
  final LedgerEntry entry;
  final bool khata;

  @override
  Widget build(BuildContext context) {
    final e = entry;
    final color = e.isPayment ? AppColors.good : AppColors.ink;
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: e.billId == null
            ? null
            : () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => BillDetailScreen(orderId: e.billId!))),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(children: [
            Icon(e.isPayment ? Icons.south_west_rounded : Icons.receipt_outlined,
                size: 18, color: e.isPayment ? AppColors.good : AppColors.inkMute),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(e.title, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.ink)),
                Text(
                  [fmtFullDate(e.date), if (e.subtitle.isNotEmpty) e.subtitle].join('  ·  '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11.5, color: AppColors.inkMute),
                ),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('${e.isPayment ? '− ' : ''}${fmtInr2(e.amount)}',
                  style: kTabular.copyWith(fontSize: 13, color: color)),
              if (khata && !e.isPayment)
                Text(e.outstanding > 0 ? 'DUE ${fmtInr(e.outstanding)}' : 'PAID',
                    style: kMicro.copyWith(color: e.outstanding > 0 ? AppColors.critical : AppColors.good)),
            ]),
          ]),
        ),
      ),
    );
  }
}
