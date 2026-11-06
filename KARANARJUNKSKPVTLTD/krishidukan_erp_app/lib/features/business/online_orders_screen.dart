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

/// onlineOrders (OnlineOrdersPage.tsx). Read-only here: courier booking and
/// status changes stay on the web, where the dispatch flow lives.
final _onlineOrdersProvider = StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return Stream.value(const []);
  return tenantCollection(ref.watch(firestoreProvider), user.tenantId, 'onlineOrders').snapshots().map((s) {
    final list = [
      for (final d in s.docs)
        if (d.data()['deleted'] != true) {...d.data(), '_id': d.id}
    ];
    list.sort((a, b) => (tsToDate(b['createdAt']) ?? DateTime(2000)).compareTo(tsToDate(a['createdAt']) ?? DateTime(2000)));
    return list;
  });
});

class OnlineOrdersScreen extends ConsumerStatefulWidget {
  const OnlineOrdersScreen({super.key});

  @override
  ConsumerState<OnlineOrdersScreen> createState() => _OnlineOrdersScreenState();
}

class _OnlineOrdersScreenState extends ConsumerState<OnlineOrdersScreen> {
  String _filter = 'All';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_onlineOrdersProvider);
    final all = async.valueOrNull ?? const <Map<String, dynamic>>[];
    final list = all.where((o) {
      final paid = str(o['paymentStatus']);
      return switch (_filter) {
        'Unpaid' => paid != 'Paid',
        'Not shipped' => str(o['courierSent']) != 'Yes',
        _ => true,
      };
    }).toList();
    final value = list.fold<double>(0, (s, o) => s + dbl(o['amount'] ?? o['grandTotal']));

    return Scaffold(
      appBar: AppBar(title: const Text('Online orders')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 4, 14, 30),
        children: [
          KpiCard(label: 'Order value', value: fmtInr(value), sub: '${list.length} orders', accent: AppColors.online),
          const SizedBox(height: 10),
          ChoiceRow(options: const ['All', 'Unpaid', 'Not shipped'], selected: _filter, onSelected: (f) => setState(() => _filter = f)),
          const SizedBox(height: 10),
          if (async.isLoading)
            const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator()))
          else if (async.hasError)
            const EmptyNote('Could not load online orders.')
          else if (list.isEmpty)
            const EmptyNote('No online orders.')
          else
            for (final o in list) ...[
              _OrderTile(o: o),
              const SizedBox(height: 6),
            ],
        ],
      ),
    );
  }
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.o});
  final Map<String, dynamic> o;

  @override
  Widget build(BuildContext context) {
    final paid = str(o['paymentStatus']);
    final shipped = str(o['courierSent']) == 'Yes';
    final date = tsToDate(o['createdAt']);
    final products = (o['products'] is List ? o['products'] as List : const []).whereType<Map>().toList();
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => showModalBottomSheet<void>(
          context: context,
          showDragHandle: true,
          isScrollControlled: true,
          builder: (_) => Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(str(o['customerName']), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.ink)),
              Text([str(o['phoneNumber']), str(o['address'])].where((s) => s.isNotEmpty).join('  ·  '),
                  style: TextStyle(fontSize: 12.5, color: AppColors.inkDim)),
              const SizedBox(height: 12),
              for (final p in products)
                KvRow('${str(p['productName'])} × ${fmtQty(dbl(p['quantity']))}', fmtInr2(dbl(p['subTotal']))),
              const Divider(),
              KvRow('Order value', fmtInr2(dbl(o['amount'] ?? o['grandTotal'])), bold: true),
              KvRow('Payment', '${str(o['paymentMethod'])} · ${paid.isEmpty ? '—' : paid}'),
              KvRow('Courier', shipped ? 'Sent ${str(o['courierSendDate'])}' : 'Not sent'),
              if (str(o['trackingId']).isNotEmpty) KvRow('Tracking', str(o['trackingId'])),
              const SizedBox(height: 10),
              if (str(o['phoneNumber']).isNotEmpty)
                OutlinedButton.icon(
                  onPressed: () => launchUrl(Uri(scheme: 'tel', path: str(o['phoneNumber']))),
                  icon: const Icon(Icons.call_rounded, size: 18),
                  label: const Text('Call customer'),
                ),
              const SizedBox(height: 6),
              Text('Courier booking and status changes are done in the web ERP.',
                  style: TextStyle(fontSize: 11, color: AppColors.inkMute)),
            ]),
          ),
        ),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(str(o['customerName']).isEmpty ? 'Online customer' : str(o['customerName']),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: AppColors.ink)),
                Text([if (date != null) fmtDayMonth(date), '${products.length} items', shipped ? 'Shipped' : 'Not shipped'].join('  ·  '),
                    style: TextStyle(fontSize: 11.5, color: AppColors.inkMute)),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(fmtInr(dbl(o['amount'] ?? o['grandTotal'])), style: kTabular.copyWith(fontSize: 13.5)),
              Text((paid.isEmpty ? 'Unpaid' : paid).toUpperCase(),
                  style: kMicro.copyWith(color: paid == 'Paid' ? AppColors.good : AppColors.warning)),
            ]),
          ]),
        ),
      ),
    );
  }
}
