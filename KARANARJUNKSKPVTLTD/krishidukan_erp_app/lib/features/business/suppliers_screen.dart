import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../core/parse.dart';
import '../../core/tenant_path.dart';
import '../../widgets/form_bits.dart';
import '../../widgets/kpi_card.dart';
import '../analytics/models.dart' show tsToDate;
import '../auth/auth_repository.dart';

class Supplier {
  const Supplier(this.id, this.name, this.phone, this.invoiced, this.paid, this.outstanding, this.isTransporter);
  final String id;
  final String name;
  final String phone;
  final double invoiced;
  final double paid;
  final double outstanding;
  final bool isTransporter;
}

/// suppliers/* with the cached totals syncSupplierTotals keeps current.
final suppliersProvider = StreamProvider.autoDispose<List<Supplier>>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return Stream.value(const []);
  return tenantCollection(ref.watch(firestoreProvider), user.tenantId, 'suppliers').snapshots().map((s) {
    final list = [
      for (final d in s.docs)
        if (d.data()['deleted'] != true)
          Supplier(
            d.id,
            str(d.data()['name']).isEmpty ? 'Unnamed' : str(d.data()['name']),
            str(d.data()['phone']),
            dbl(d.data()['totalInvoiced']),
            dbl(d.data()['totalPaid']),
            dbl(d.data()['outstandingBalance']),
            str(d.data()['supplierType']) == 'Transporter',
          )
    ]..sort((a, b) => b.outstanding.compareTo(a.outstanding));
    return list;
  });
});

class SuppliersScreen extends ConsumerStatefulWidget {
  const SuppliersScreen({super.key});

  @override
  ConsumerState<SuppliersScreen> createState() => _SuppliersScreenState();
}

class _SuppliersScreenState extends ConsumerState<SuppliersScreen> {
  String _q = '';
  String _kind = 'All';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(suppliersProvider);
    final all = async.valueOrNull ?? const <Supplier>[];
    final q = _q.trim().toLowerCase();
    final list = all
        .where((s) => _kind == 'All' || (_kind == 'Transporters') == s.isTransporter)
        .where((s) => q.isEmpty || s.name.toLowerCase().contains(q) || s.phone.contains(q))
        .toList();
    final due = all.fold<double>(0, (s, x) => s + x.outstanding);
    final invoiced = all.fold<double>(0, (s, x) => s + x.invoiced);

    return Scaffold(
      appBar: AppBar(title: const Text('Supplier ledger')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 4, 14, 30),
        children: [
          Row(children: [
            Expanded(child: KpiCard(label: 'We owe', value: fmtInrCompact(due), accent: AppColors.critical, sub: '${all.length} suppliers')),
            const SizedBox(width: 10),
            Expanded(child: KpiCard(label: 'Total invoiced', value: fmtInrCompact(invoiced))),
          ]),
          const SizedBox(height: 10),
          TextField(
            decoration: const InputDecoration(hintText: 'Search supplier', prefixIcon: Icon(Icons.search, size: 19), isDense: true),
            onChanged: (v) => setState(() => _q = v),
          ),
          const SizedBox(height: 10),
          ChoiceRow(
            options: const ['All', 'Suppliers', 'Transporters'],
            selected: _kind,
            onSelected: (k) => setState(() => _kind = k),
          ),
          const SizedBox(height: 10),
          if (async.isLoading)
            const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator()))
          else if (async.hasError)
            const EmptyNote('Could not load suppliers.')
          else if (list.isEmpty)
            const EmptyNote('No suppliers.')
          else
            for (final s in list) ...[
              Material(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(14),
                child: ListTile(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: AppColors.border)),
                  title: Text(s.name, style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
                  subtitle: Text('Invoiced ${fmtInrCompact(s.invoiced)}  ·  Paid ${fmtInrCompact(s.paid)}',
                      style: TextStyle(fontSize: 11.5, color: AppColors.inkMute)),
                  trailing: Text(fmtInr(s.outstanding),
                      style: kTabular.copyWith(fontSize: 13.5, color: s.outstanding > 0 ? AppColors.critical : AppColors.good)),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => SupplierDetailScreen(supplier: s))),
                ),
              ),
              const SizedBox(height: 6),
            ],
          const SizedBox(height: 8),
          Text('Purchase invoices and supplier payments are entered in the web ERP, which posts stock and keeps these totals in sync.',
              style: TextStyle(fontSize: 11, color: AppColors.inkMute)),
        ],
      ),
    );
  }
}

class _Entry {
  const _Entry(this.title, this.sub, this.amount, this.date, this.isPayment);
  final String title;
  final String sub;
  final double amount;
  final DateTime date;
  final bool isPayment;
}

class _SupplierLedger {
  const _SupplierLedger(this.entries, this.invoiced, this.paid);
  final List<_Entry> entries;
  final double invoiced;
  final double paid;
}

/// Live supplier ledger, computed the way SupplierLedgerDetailPage does:
/// POs + supplier invoices − payments, matched by supplierId OR the current
/// name (older docs only carry the name), deleted docs skipped.
final _supplierLedgerProvider = FutureProvider.autoDispose.family<_SupplierLedger, Supplier>((ref, s) async {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) throw StateError('Not signed in');
  final db = ref.watch(firestoreProvider);
  CollectionReference<Map<String, dynamic>> c(String n) => tenantCollection(db, user.tenantId, n);
  final r = await Future.wait([
    c('purchaseOrders').where('supplierId', isEqualTo: s.id).get(),
    c('purchaseOrders').where('supplierName', isEqualTo: s.name).get(),
    c('supplierPayments').where('supplierId', isEqualTo: s.id).get(),
    c('supplierPayments').where('supplierName', isEqualTo: s.name).get(),
    c('supplierInvoices').where('supplierId', isEqualTo: s.id).get(),
  ]);
  Map<String, Map<String, dynamic>> merge(QuerySnapshot<Map<String, dynamic>> a, QuerySnapshot<Map<String, dynamic>> b) => {
        for (final d in [...a.docs, ...b.docs])
          if (d.data()['deleted'] != true) d.id: d.data()
      };
  final pos = merge(r[0], r[1]);
  final pmts = merge(r[2], r[3]);
  final invs = {for (final d in r[4].docs) if (d.data()['deleted'] != true) d.id: d.data()};

  final entries = <_Entry>[];
  var invoiced = 0.0, paid = 0.0;
  for (final p in pos.values) {
    final amt = dbl(p['totalAmount'] ?? p['amount']);
    invoiced += amt;
    entries.add(_Entry(str(p['poNumber']).isNotEmpty ? str(p['poNumber']) : 'Purchase order', 'PO', amt,
        tsToDate(p['poDate'] ?? p['date'] ?? p['createdAt']) ?? DateTime(2000), false));
  }
  for (final i in invs.values) {
    final amt = dbl(i['netAmount']);
    invoiced += amt;
    final no = str(i['supplierInvoiceNumber']).isNotEmpty ? str(i['supplierInvoiceNumber']) : str(i['internalPurchaseId']);
    entries.add(_Entry(no.isNotEmpty ? no : 'Supplier invoice', 'Purchase invoice', amt,
        tsToDate(i['invoiceDate'] ?? i['createdAt']) ?? DateTime(2000), false));
  }
  for (final p in pmts.values) {
    final amt = dbl(p['amount']);
    paid += amt;
    // Legacy (mode/paymentMode/reference/date) and new (paymentMethod/
    // accountDetails/paymentDate) field names both exist — see Payment in
    // SupplierLedgerDetailPage.tsx.
    final ref = p['accountDetails'] is Map ? str((p['accountDetails'] as Map)['transactionRef']) : '';
    entries.add(_Entry(str(p['paymentId']).isNotEmpty ? str(p['paymentId']) : 'Payment',
        [str(p['paymentMethod'] ?? p['paymentMode'] ?? p['mode']), ref.isNotEmpty ? ref : str(p['reference'])]
            .where((x) => x.isNotEmpty)
            .join(' · '),
        amt, tsToDate(p['paymentDate'] ?? p['date'] ?? p['createdAt']) ?? DateTime(2000), true));
  }
  entries.sort((a, b) => b.date.compareTo(a.date));
  return _SupplierLedger(entries, invoiced, paid);
});

class SupplierDetailScreen extends ConsumerWidget {
  const SupplierDetailScreen({super.key, required this.supplier});
  final Supplier supplier;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ledger = ref.watch(_supplierLedgerProvider(supplier));
    return Scaffold(
      appBar: AppBar(
        title: Text(supplier.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          if (supplier.phone.isNotEmpty)
            IconButton(
              tooltip: 'Call',
              icon: const Icon(Icons.call_rounded),
              onPressed: () => launchUrl(Uri(scheme: 'tel', path: supplier.phone)),
            ),
        ],
      ),
      body: ledger.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load this ledger.\n$e', textAlign: TextAlign.center)),
        data: (l) => ListView(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 30),
          children: [
            Row(children: [
              Expanded(child: KpiCard(label: 'Outstanding', value: fmtInr(l.invoiced - l.paid),
                  accent: l.invoiced - l.paid > 0 ? AppColors.critical : AppColors.good, sub: 'live from ledger')),
              const SizedBox(width: 10),
              Expanded(child: KpiCard(label: 'Invoiced', value: fmtInrCompact(l.invoiced), sub: 'paid ${fmtInrCompact(l.paid)}')),
            ]),
            SectionTitle('Ledger (${l.entries.length})'),
            if (l.entries.isEmpty) const EmptyNote('No purchases or payments yet.'),
            for (final e in l.entries) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(children: [
                  Icon(e.isPayment ? Icons.north_east_rounded : Icons.receipt_outlined, size: 18,
                      color: e.isPayment ? AppColors.good : AppColors.inkMute),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(e.title, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.ink)),
                      Text([fmtFullDate(e.date), if (e.sub.isNotEmpty) e.sub].join('  ·  '),
                          style: TextStyle(fontSize: 11.5, color: AppColors.inkMute)),
                    ]),
                  ),
                  Text('${e.isPayment ? '− ' : ''}${fmtInr2(e.amount)}',
                      style: kTabular.copyWith(fontSize: 13, color: e.isPayment ? AppColors.good : AppColors.ink)),
                ]),
              ),
              const SizedBox(height: 6),
            ],
          ],
        ),
      ),
    );
  }
}
