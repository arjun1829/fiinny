import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/theme.dart';
import '../../core/parse.dart';
import '../../core/tenant_path.dart';
import '../../widgets/form_bits.dart';
import '../../widgets/kpi_card.dart';
import '../analytics/models.dart';
import '../auth/auth_repository.dart';
import 'invoice_pdf.dart';

final _orderProvider = StreamProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, id) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return Stream.value(null);
  return tenantCollection(ref.watch(firestoreProvider), user.tenantId, 'salesOrders')
      .doc(id)
      .snapshots()
      .map((s) => s.data());
});

/// One saved bill (POS or B2B): its lines and totals as stored, plus share /
/// print / WhatsApp. Read-only — corrections stay in the web ERP, which owns
/// the edit-and-reverse logic.
class BillDetailScreen extends ConsumerStatefulWidget {
  const BillDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  ConsumerState<BillDetailScreen> createState() => _BillDetailScreenState();
}

class _BillDetailScreenState extends ConsumerState<BillDetailScreen> {
  bool _busy = false;

  Future<void> _withPdf(Map<String, dynamic> o, Future<void> Function(Uint8List bytes, String name) f) async {
    final user = ref.read(appUserProvider).valueOrNull;
    if (user == null) return;
    setState(() => _busy = true);
    try {
      final branding = await InvoiceBranding.load(
          ref.read(firestoreProvider), user.tenantId, user.businessName);
      final bytes = await buildInvoicePdf(o, branding);
      final name = 'Invoice-${str(o['orderNumber']).replaceAll(RegExp(r'[^A-Za-z0-9-]'), '_')}.pdf';
      await f(bytes, name);
    } catch (e) {
      if (mounted) showError(context, 'Could not create the PDF: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _whatsApp(Map<String, dynamic> o) async {
    final isB2b = str(o['invoiceType']) == 'B2B_GST';
    final phone = phoneKey(isB2b ? o['buyerContact'] : o['phoneNumber']);
    final user = ref.read(appUserProvider).valueOrNull;
    final total = dbl(o['grandTotal'] ?? o['netAmount']);
    final due = (total - dbl(o['amountPaid'])).clamp(0, double.infinity);
    final msg = StringBuffer()
      ..writeln('Namaste ${str(o['retailerName'])},')
      ..writeln('Bill ${str(o['orderNumber'])} dated ${str(o['invoiceDate'])}')
      ..writeln('Amount: ${fmtInr2(total)}');
    if (due > 0) msg.writeln('Balance due: ${fmtInr2(due)}');
    msg.write('— ${user?.businessName ?? ''}');
    final to = phone.length == 10 ? '91$phone' : phone;
    final uri = Uri.parse('https://wa.me/$to?text=${Uri.encodeComponent(msg.toString())}');
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) {
      showError(context, 'WhatsApp is not available on this device.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_orderProvider(widget.orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('Invoice')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load this bill.\n$e', textAlign: TextAlign.center)),
        data: (o) => o == null
            ? const Center(child: Text('This bill no longer exists.'))
            : _body(o),
      ),
    );
  }

  Widget _body(Map<String, dynamic> o) {
    final bill = Bill.fromSalesOrder(widget.orderId, o);
    final isB2b = str(o['invoiceType']) == 'B2B_GST';
    final items = (o['lineItems'] is List ? o['lineItems'] as List : const [])
        .whereType<Map>()
        .map((m) => m.cast<String, dynamic>())
        .toList();
    final void_ = o['deleted'] == true || str(o['status']).toLowerCase() == 'cancelled';
    final stateColor = switch (bill.paymentState) {
      PaymentState.paid => AppColors.good,
      PaymentState.partial => AppColors.warning,
      PaymentState.pending => AppColors.critical,
    };

    return Column(children: [
      Expanded(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 24),
          children: [
            Row(children: [
              Pill(isB2b ? 'B2B GST' : 'POS', color: isB2b ? AppColors.b2b : AppColors.pos),
              const SizedBox(width: 8),
              Pill(void_ ? 'Cancelled' : bill.paymentState.label,
                  color: void_ ? AppColors.inkMute : stateColor),
            ]),
            const SizedBox(height: 10),
            Text(bill.customerName,
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink)),
            const SizedBox(height: 3),
            Text('${bill.number}  ·  ${str(o['invoiceDate'])}',
                style: TextStyle(color: AppColors.inkMute, fontSize: 12.5)),
            if (bill.phone.isNotEmpty)
              Text('Ph ${bill.phone}', style: TextStyle(color: AppColors.inkMute, fontSize: 12.5)),
            const SectionTitle('Items'),
            Panel(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              child: Column(children: [
                for (final li in items)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 7),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(str(isB2b ? li['itemDescription'] : li['productName']),
                              style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink, fontSize: 13)),
                          Text(
                            '${fmtQty(dbl(li['quantity']))} ${str(isB2b ? li['per'] : li['unit'])} × ${fmtInr2(dbl(isB2b ? li['rate'] : li['mrp']))}'
                            '${str(li['batchNo']).isNotEmpty ? '  ·  B ${str(li['batchNo'])}' : ''}',
                            style: TextStyle(fontSize: 11.5, color: AppColors.inkMute),
                          ),
                        ]),
                      ),
                      Text(fmtInr2(dbl(isB2b ? li['grossAmount'] : li['amount'])),
                          style: kTabular.copyWith(fontSize: 13)),
                    ]),
                  ),
              ]),
            ),
            const SectionTitle('Totals'),
            Panel(
              child: Column(children: [
                if (isB2b) ...[
                  KvRow('Taxable value', fmtInr2(dbl(o['taxableValue']))),
                  KvRow('CGST + SGST', fmtInr2(dbl(o['totalTax']))),
                  if (dbl(o['discountAmount']) > 0) KvRow('Discount', '− ${fmtInr2(dbl(o['discountAmount']))}'),
                  if (dbl(o['roundOff']) != 0) KvRow('Round off', fmtInr2(dbl(o['roundOff']))),
                ] else ...[
                  KvRow('Bill total', fmtInr2(dbl(o['subtotal']))),
                  if (dbl(o['transportCharges']) > 0) KvRow('Transport', fmtInr2(dbl(o['transportCharges']))),
                  if (dbl(o['laborCharges']) > 0) KvRow('Labour', fmtInr2(dbl(o['laborCharges']))),
                  if (dbl(o['discount']) > 0) KvRow('Discount', '− ${fmtInr2(dbl(o['discount']))}'),
                ],
                const Divider(height: 16),
                KvRow('Net amount', fmtInr2(bill.amount), bold: true, size: 15),
                KvRow('Received', fmtInr2(bill.amountPaid)),
                KvRow('Outstanding on this bill', fmtInr2(bill.outstanding),
                    color: bill.outstanding > 0 ? AppColors.critical : null),
                if (dbl(o['previousBalance']) > 0)
                  KvRow('Previous balance (at billing)', fmtInr2(dbl(o['previousBalance']))),
                KvRow('Payment', bill.paymentMode),
                if (str(o['salesmanName']).isNotEmpty) KvRow('Salesperson', str(o['salesmanName'])),
              ]),
            ),
            const SizedBox(height: 12),
            Text('To correct or cancel a bill, use the web ERP — it reverses stock and balances safely.',
                style: TextStyle(fontSize: 11, color: AppColors.inkMute)),
          ],
        ),
      ),
      BottomActionBar(
        child: Row(children: [
          Expanded(
            child: FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: _busy
                  ? null
                  : () => _withPdf(o, (bytes, name) => Printing.sharePdf(bytes: bytes, filename: name)),
              icon: const Icon(Icons.picture_as_pdf_rounded, size: 18),
              label: Text(_busy ? 'Preparing…' : 'Share PDF'),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filledTonal(
            tooltip: 'Print',
            onPressed: _busy
                ? null
                : () => _withPdf(o, (bytes, name) => Printing.layoutPdf(
                    name: name, onLayout: (_) async => bytes)),
            icon: const Icon(Icons.print_rounded),
          ),
          if (bill.phone.isNotEmpty)
            IconButton.filledTonal(
              tooltip: 'WhatsApp',
              onPressed: () => _whatsApp(o),
              icon: const Icon(Icons.chat_rounded),
            ),
        ]),
      ),
    ]);
  }
}
