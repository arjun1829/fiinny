import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../widgets/form_bits.dart';
import '../../widgets/kpi_card.dart';
import '../auth/auth_repository.dart';
import 'barcode_scanner_screen.dart';
import 'catalog_repository.dart';
import 'product.dart';
import 'product_form_screen.dart';
import 'product_picker_sheet.dart' show findByCode;

enum _StockFilter { all, low, out }

class ProductsScreen extends ConsumerStatefulWidget {
  const ProductsScreen({super.key});

  @override
  ConsumerState<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends ConsumerState<ProductsScreen> {
  String _q = '';
  _StockFilter _filter = _StockFilter.all;

  Future<void> _scan(List<Product> all) async {
    final code = await BarcodeScannerScreen.scan(context);
    if (code == null || !mounted) return;
    final p = findByCode(all, code);
    if (p == null) {
      showError(context, 'No product has barcode $code');
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProductDetailScreen(productId: p.id)));
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(appUserProvider).valueOrNull;
    final async = ref.watch(productsProvider);
    final all = async.valueOrNull ?? const <Product>[];
    final q = _q.trim().toLowerCase();
    final list = all.where((p) {
      if (_filter == _StockFilter.low && !(p.isLowStock && !p.isOutOfStock)) return false;
      if (_filter == _StockFilter.out && !p.isOutOfStock) return false;
      if (q.isEmpty) return true;
      return p.name.toLowerCase().contains(q) ||
          p.mfgCompany.toLowerCase().contains(q) ||
          p.barcode.toLowerCase() == q ||
          p.productNumber.toLowerCase() == q;
    }).toList();
    final lowCount = all.where((p) => p.isLowStock && !p.isOutOfStock).length;
    final outCount = all.where((p) => p.isOutOfStock).length;
    final canEdit = user?.can.canEditProducts ?? false;

    return Scaffold(
      floatingActionButton: canEdit
          ? Padding(
              padding: const EdgeInsets.only(bottom: 80),
              child: FloatingActionButton.extended(
                heroTag: 'add-product',
                onPressed: () => Navigator.of(context)
                    .push(MaterialPageRoute(builder: (_) => const ProductFormScreen())),
                icon: const Icon(Icons.add_rounded),
                label: const Text('Product'),
              ),
            )
          : null,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text('PRODUCTS & STOCK', style: kMicro),
                const Spacer(),
                Text('${list.length} SHOWN', style: kMicro),
              ]),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                  child: TextField(
                    style: TextStyle(fontSize: 14, color: AppColors.ink),
                    decoration: const InputDecoration(
                      hintText: 'Search product, company or code',
                      prefixIcon: Icon(Icons.search, size: 19),
                      isDense: true,
                    ),
                    onChanged: (v) => setState(() => _q = v),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filledTonal(
                  tooltip: 'Scan barcode',
                  onPressed: () => _scan(all),
                  icon: const Icon(Icons.qr_code_scanner_rounded),
                ),
              ]),
              const SizedBox(height: 10),
              ChoiceRow(
                options: ['All (${all.length})', 'Low ($lowCount)', 'Out ($outCount)'],
                selected: switch (_filter) {
                  _StockFilter.all => 'All (${all.length})',
                  _StockFilter.low => 'Low ($lowCount)',
                  _StockFilter.out => 'Out ($outCount)',
                },
                onSelected: (o) => setState(() => _filter = o.startsWith('Low')
                    ? _StockFilter.low
                    : o.startsWith('Out')
                        ? _StockFilter.out
                        : _StockFilter.all),
              ),
            ]),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: async.isLoading
                ? const Center(child: CircularProgressIndicator())
                : async.hasError
                    ? Center(child: Text('Could not load products.', style: TextStyle(color: AppColors.inkMute)))
                    : list.isEmpty
                        ? Center(child: Text('No products found', style: TextStyle(color: AppColors.inkMute)))
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(14, 0, 14, 160),
                            itemCount: list.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (_, i) => _ProductTile(product: list[i]),
                          ),
          ),
        ]),
      ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({required this.product});
  final Product product;

  @override
  Widget build(BuildContext context) {
    final p = product;
    final color = p.isOutOfStock
        ? AppColors.critical
        : (p.isLowStock ? AppColors.warning : AppColors.good);
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => ProductDetailScreen(productId: p.id))),
        child: Container(
          padding: const EdgeInsets.fromLTRB(0, 12, 14, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(children: [
            Container(
              width: 3,
              height: 34,
              margin: const EdgeInsets.only(right: 13),
              decoration: BoxDecoration(
                color: color,
                borderRadius: const BorderRadius.horizontal(right: Radius.circular(2)),
              ),
            ),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p.name.isEmpty ? '(no name)' : p.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: AppColors.ink)),
                const SizedBox(height: 3),
                Text(
                  [if (p.mfgCompany.isNotEmpty) p.mfgCompany, 'MRP ${fmtInr2(p.mrp)}', 'Sell ${fmtInr2(p.posRate)}']
                      .join('  ·  '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: kMicro.copyWith(letterSpacing: 0.3),
                ),
              ]),
            ),
            const SizedBox(width: 10),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(fmtQty(p.stock), style: kTabular.copyWith(fontSize: 15, fontWeight: FontWeight.w800, color: color)),
              Text(p.baseUnit.toUpperCase(), style: kMicro),
            ]),
          ]),
        ),
      ),
    );
  }
}

class ProductDetailScreen extends ConsumerWidget {
  const ProductDetailScreen({super.key, required this.productId});
  final String productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(appUserProvider).valueOrNull;
    final all = ref.watch(productsProvider).valueOrNull ?? const <Product>[];
    final p = all.where((x) => x.id == productId).firstOrNull;
    if (p == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('This product no longer exists.')),
      );
    }
    final canBatches = user?.can.canViewBatches ?? false;
    final batches = canBatches ? ref.watch(productBatchesProvider(p.id)) : null;
    final canEdit = user?.can.canEditProducts ?? false;
    final hasBatches = (batches?.valueOrNull ?? const []).isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          if (canEdit)
            IconButton(
              tooltip: 'Edit',
              icon: const Icon(Icons.edit_outlined),
              onPressed: batches != null && batches.isLoading
                  ? null
                  : () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => ProductFormScreen(product: p, stockLocked: hasBatches))),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 4, 14, 30),
        children: [
          Row(children: [
            Expanded(child: KpiCard(label: 'In stock', value: '${fmtQty(p.stock)} ${p.baseUnit}',
                accent: p.isOutOfStock ? AppColors.critical : (p.isLowStock ? AppColors.warning : AppColors.good))),
            const SizedBox(width: 10),
            Expanded(child: KpiCard(label: 'Stock value', value: fmtInr(p.stock > 0 ? p.stock * p.posRate : 0), sub: 'at selling price')),
          ]),
          const SectionTitle('Prices'),
          Panel(
            child: Column(children: [
              KvRow('MRP', fmtInr2(p.mrp)),
              KvRow('Selling (POS)', fmtInr2(p.posRate)),
              KvRow('Retailer / PTR (B2B)', fmtInr2(p.b2bRate)),
              if (canEdit) KvRow('Purchase', fmtInr2(p.purchasePrice)),
              KvRow('GST', p.gstPct == null ? 'Not set (bills use 5%)' : '${fmtQty(p.gstPct!)}%'),
            ]),
          ),
          const SectionTitle('Details'),
          Panel(
            child: Column(children: [
              if (p.productNumber.isNotEmpty) KvRow('Code', p.productNumber),
              if (p.barcode.isNotEmpty) KvRow('Barcode', p.barcode),
              if (p.mfgCompany.isNotEmpty) KvRow('Company', p.mfgCompany),
              if (p.type.isNotEmpty) KvRow('Type', p.type),
              KvRow('Unit', p.baseUnit),
              if (p.boxCapacity > 1) KvRow('Box', '${fmtQty(p.quantity)} × ${fmtQty(p.boxCapacity)} + ${fmtQty(p.loosePieces)} loose'),
            ]),
          ),
          if (batches != null) ...[
            const SectionTitle('Batches (first-expiry first)'),
            batches.when(
              loading: () => const Padding(
                  padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator())),
              error: (_, __) => const EmptyNote('Could not load batches.'),
              data: (list) {
                final live = list.where((b) => b.quantity != 0).toList()
                  ..sort((a, b) {
                    if (a.expiryDate.isEmpty && b.expiryDate.isEmpty) return 0;
                    if (a.expiryDate.isEmpty) return 1;
                    if (b.expiryDate.isEmpty) return -1;
                    return a.expiryDate.compareTo(b.expiryDate);
                  });
                if (live.isEmpty) return const EmptyNote('No batches with stock. Stock is tracked on the product.');
                return Panel(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  child: Column(children: [
                    for (final b in live)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 7),
                        child: Row(children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(b.batchNumber.isEmpty ? '(no batch no.)' : b.batchNumber,
                                  style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
                              Text(b.expiryDate.isEmpty ? 'No expiry' : 'Exp ${b.expiryDate}',
                                  style: TextStyle(
                                      fontSize: 11.5,
                                      color: b.expiresSoon ? AppColors.critical : AppColors.inkMute)),
                            ]),
                          ),
                          Text(fmtQty(b.quantity), style: kTabular.copyWith(fontSize: 14)),
                        ]),
                      ),
                  ]),
                );
              },
            ),
          ],
          const SizedBox(height: 12),
          Text('Purchases and stock adjustments are recorded in the web ERP (Supplier invoice / Inventory).',
              style: TextStyle(fontSize: 11, color: AppColors.inkMute)),
        ],
      ),
    );
  }
}
