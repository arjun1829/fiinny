import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/access.dart';
import '../../core/format.dart';
import '../../core/parse.dart';
import '../../core/tenant_path.dart';
import '../../widgets/kpi_card.dart';
import '../analytics/models.dart';
import '../auth/auth_repository.dart';
import 'b2b_invoice_screen.dart';
import 'bill_detail_screen.dart';
import 'pos_screen.dart';

/// Latest bills, live. Small window — this is a "what just happened" strip,
/// the full history is the Bills tab.
final recentBillsProvider = StreamProvider.autoDispose<List<Bill>>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return Stream.value(const []);
  return tenantCollection(ref.watch(firestoreProvider), user.tenantId, 'salesOrders')
      .orderBy('createdAt', descending: true)
      .limit(25)
      .snapshots()
      .map((s) => [
            for (final d in s.docs)
              if (d.data()['deleted'] != true) Bill.fromSalesOrder(d.id, d.data())
          ]);
});

/// Today's bills by invoiceDate (the business date both clients write).
final todayBillsProvider = StreamProvider.autoDispose<List<QueryDocumentSnapshot<Map<String, dynamic>>>>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return Stream.value(const []);
  return tenantCollection(ref.watch(firestoreProvider), user.tenantId, 'salesOrders')
      .where('invoiceDate', isEqualTo: isoDay(DateTime.now()))
      .snapshots()
      .map((s) => s.docs);
});

class SellScreen extends ConsumerWidget {
  const SellScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final access = ref.watch(accessProvider);
    final user = ref.watch(appUserProvider).valueOrNull;
    final today = ref.watch(todayBillsProvider).valueOrNull ?? const [];
    final live = today.where((d) {
      final e = d.data();
      return e['deleted'] != true && str(e['status']).toLowerCase() != 'cancelled';
    });
    var total = 0.0, received = 0.0, pos = 0, b2b = 0;
    for (final d in live) {
      final e = d.data();
      final amt = dbl(e['grandTotal'] ?? e['netAmount']);
      total += amt;
      received += dbl(e['amountPaid']).clamp(0, amt);
      if (str(e['invoiceType']) == 'B2B_GST') {
        b2b++;
      } else {
        pos++;
      }
    }
    final recent = ref.watch(recentBillsProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 110),
          children: [
            Text('SELL', style: kMicro),
            const SizedBox(height: 4),
            Text(user?.businessName ?? '',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink)),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(
                child: KpiCard(
                    label: 'Billed today', value: fmtInrCompact(total), sub: '$pos POS · $b2b B2B'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: KpiCard(
                  label: 'Credit today',
                  value: fmtInrCompact((total - received).clamp(0, double.infinity)),
                  accent: AppColors.warning,
                  sub: 'received ${fmtInrCompact(received)}',
                ),
              ),
            ]),
            const SizedBox(height: 14),
            if (access == null || !access.planLoaded)
              const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
            else if (!access.anyBilling)
              EmptyNote(_whyNoBilling(access))
            else
              Row(children: [
                if (access.pos)
                  Expanded(
                    child: _BigAction(
                      icon: Icons.point_of_sale_rounded,
                      title: 'POS bill',
                      sub: 'Counter sale · KA-',
                      color: AppColors.pos,
                      onTap: () => Navigator.of(context)
                          .push(MaterialPageRoute(builder: (_) => const PosScreen())),
                    ),
                  ),
                if (access.pos && access.b2b) const SizedBox(width: 10),
                if (access.b2b)
                  Expanded(
                    child: _BigAction(
                      icon: Icons.receipt_long_rounded,
                      title: 'B2B invoice',
                      sub: 'GST wholesale · SIPL/',
                      color: AppColors.b2b,
                      onTap: () => Navigator.of(context)
                          .push(MaterialPageRoute(builder: (_) => const B2bInvoiceScreen())),
                    ),
                  ),
              ]),
            const SectionTitle('Recent bills'),
            recent.when(
              loading: () => const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator())),
              error: (_, __) => const EmptyNote('Could not load recent bills.'),
              data: (list) => list.isEmpty
                  ? const EmptyNote('No bills yet.')
                  : Column(children: [
                      for (final b in list) ...[
                        _RecentTile(bill: b),
                        const SizedBox(height: 6),
                      ],
                    ]),
            ),
          ],
        ),
      ),
    );
  }

  String _whyNoBilling(Access a) {
    if (!a.can.canBill) {
      return 'Billing saves stock changes, which only an admin or analyst account can do. '
          'Ask your admin to bill, or to change your role.';
    }
    if (a.sub == null || a.sub!.planId == null) {
      return 'No active plan is assigned to this business, so billing is locked. Contact support.';
    }
    return 'Your current plan does not include POS or B2B billing.';
  }
}

class _BigAction extends StatelessWidget {
  const _BigAction({
    required this.icon,
    required this.title,
    required this.sub,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String sub;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: color.withValues(alpha: 0.4)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 14),
            Text(title, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.ink)),
            const SizedBox(height: 2),
            Text(sub, style: TextStyle(fontSize: 11.5, color: AppColors.inkDim)),
          ]),
        ),
      ),
    );
  }
}

class _RecentTile extends StatelessWidget {
  const _RecentTile({required this.bill});
  final Bill bill;

  @override
  Widget build(BuildContext context) {
    final b = bill;
    final color = switch (b.paymentState) {
      PaymentState.paid => AppColors.good,
      PaymentState.partial => AppColors.warning,
      PaymentState.pending => AppColors.critical,
    };
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => BillDetailScreen(orderId: b.id))),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(b.customerName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.ink)),
                Text('${b.number}  ·  ${b.channel.label}  ·  ${fmtDayMonth(b.date)}',
                    style: TextStyle(fontSize: 11.5, color: AppColors.inkMute)),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(fmtInr(b.amount), style: kTabular.copyWith(fontSize: 13.5)),
              Text(b.paymentState.label.toUpperCase(), style: kMicro.copyWith(color: color)),
            ]),
          ]),
        ),
      ),
    );
  }
}
