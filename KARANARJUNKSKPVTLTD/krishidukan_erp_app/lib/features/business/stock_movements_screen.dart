import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../core/parse.dart';
import '../../core/tenant_path.dart';
import '../../widgets/form_bits.dart';
import '../analytics/models.dart' show tsToDate;
import '../auth/auth_repository.dart';

class StockMove {
  const StockMove({
    required this.productName,
    required this.batchNumber,
    required this.qtyIn,
    required this.qtyOut,
    required this.remaining,
    required this.type,
    required this.source,
    required this.date,
  });
  final String productName;
  final String batchNumber;
  final double qtyIn;
  final double qtyOut;
  final double remaining;
  final String type;
  final String source;
  final DateTime date;
}

/// Latest 300 movements — the audit trail POS, B2B, purchases and returns
/// all append to (recordStockMovements in stockDeduction.ts).
final stockMovesProvider = StreamProvider.autoDispose<List<StockMove>>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return Stream.value(const []);
  return tenantCollection(ref.watch(firestoreProvider), user.tenantId, 'stockMovements')
      .orderBy('createdAt', descending: true)
      .limit(300)
      .snapshots()
      .map((s) => [
            for (final d in s.docs)
              StockMove(
                productName: str(d.data()['productName']),
                batchNumber: str(d.data()['batchNumber']),
                qtyIn: dbl(d.data()['qtyIn']),
                qtyOut: dbl(d.data()['qtyOut']),
                remaining: dbl(d.data()['remainingStock']),
                type: str(d.data()['type']),
                source: [str(d.data()['sourceType']), str(d.data()['sourceNumber'])]
                    .where((x) => x.isNotEmpty)
                    .join(' '),
                date: tsToDate(d.data()['createdAt']) ?? DateTime.tryParse(str(d.data()['date'])) ?? DateTime(2000),
              )
          ]);
});

const _typeLabels = {
  'all': 'All',
  'sale_pos': 'POS sale',
  'sale_b2b': 'B2B sale',
  'purchase': 'Purchase',
  'sales_return': 'Return',
};

class StockMovementsScreen extends ConsumerStatefulWidget {
  const StockMovementsScreen({super.key});

  @override
  ConsumerState<StockMovementsScreen> createState() => _StockMovementsScreenState();
}

class _StockMovementsScreenState extends ConsumerState<StockMovementsScreen> {
  String _type = 'all';
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(stockMovesProvider);
    final q = _q.trim().toLowerCase();
    final list = (async.valueOrNull ?? const <StockMove>[])
        .where((m) => _type == 'all' || m.type == _type)
        .where((m) => q.isEmpty || m.productName.toLowerCase().contains(q) || m.source.toLowerCase().contains(q))
        .toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Stock movement')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 10),
          child: Column(children: [
            TextField(
              decoration: const InputDecoration(
                  hintText: 'Search product or bill no.', prefixIcon: Icon(Icons.search, size: 19), isDense: true),
              onChanged: (v) => setState(() => _q = v),
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: ChoiceRow(
                options: _typeLabels.values.toList(),
                selected: _typeLabels[_type]!,
                onSelected: (s) => setState(() => _type = _typeLabels.entries.firstWhere((e) => e.value == s).key),
              ),
            ),
          ]),
        ),
        Expanded(
          child: async.isLoading
              ? const Center(child: CircularProgressIndicator())
              : async.hasError
                  ? Center(child: Text('Could not load stock movements.', style: TextStyle(color: AppColors.inkMute)))
                  : list.isEmpty
                      ? Center(child: Text('No movements', style: TextStyle(color: AppColors.inkMute)))
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(14, 0, 14, 30),
                          itemCount: list.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 6),
                          itemBuilder: (_, i) {
                            final m = list[i];
                            final inward = m.qtyIn > 0;
                            final color = inward ? AppColors.good : AppColors.critical;
                            return Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: AppColors.card,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: Row(children: [
                                Icon(inward ? Icons.south_west_rounded : Icons.north_east_rounded, size: 18, color: color),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text(m.productName,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.ink)),
                                    Text(
                                      [
                                        fmtDayMonth(m.date),
                                        _typeLabels[m.type] ?? m.type,
                                        if (m.source.isNotEmpty) m.source,
                                        if (m.batchNumber.isNotEmpty) 'B ${m.batchNumber}',
                                      ].join('  ·  '),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(fontSize: 11.5, color: AppColors.inkMute),
                                    ),
                                  ]),
                                ),
                                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                  Text('${inward ? '+' : '−'}${fmtQty(inward ? m.qtyIn : m.qtyOut)}',
                                      style: kTabular.copyWith(fontSize: 14, color: color)),
                                  Text('LEFT ${fmtQty(m.remaining)}', style: kMicro),
                                ]),
                              ]),
                            );
                          },
                        ),
        ),
      ]),
    );
  }
}
