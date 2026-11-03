import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../widgets/form_bits.dart';
import 'barcode_scanner_screen.dart';
import 'catalog_repository.dart';
import 'product.dart';

/// Which price the picker shows: the counter (selling) rate for POS, the
/// retailer (PTR) rate for B2B — the same split the web enforces.
enum PriceMode { pos, b2b }

/// Bottom-sheet product search. Pops with the chosen [Product].
Future<Product?> pickProduct(BuildContext context, PriceMode mode) =>
    showModalBottomSheet<Product>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => FractionallySizedBox(
        heightFactor: 0.92,
        child: _ProductPicker(mode: mode),
      ),
    );

/// Looks a scanned code up in the catalogue: exact barcode first, then
/// product number. Null when nothing matches.
Product? findByCode(List<Product> all, String code) {
  final c = code.trim().toLowerCase();
  if (c.isEmpty) return null;
  for (final p in all) {
    if (p.barcode.trim().toLowerCase() == c) return p;
  }
  for (final p in all) {
    if (p.productNumber.trim().toLowerCase() == c) return p;
  }
  return null;
}

class _ProductPicker extends ConsumerStatefulWidget {
  const _ProductPicker({required this.mode});
  final PriceMode mode;

  @override
  ConsumerState<_ProductPicker> createState() => _ProductPickerState();
}

class _ProductPickerState extends ConsumerState<_ProductPicker> {
  String _q = '';

  Future<void> _scan(List<Product> all) async {
    final code = await BarcodeScannerScreen.scan(context);
    if (code == null || !mounted) return;
    final p = findByCode(all, code);
    if (p != null) {
      Navigator.of(context).pop(p);
    } else {
      showError(context, 'No product has barcode $code');
    }
  }

  @override
  Widget build(BuildContext context) {
    final products = ref.watch(productsProvider);
    final all = products.valueOrNull ?? const <Product>[];
    final q = _q.trim().toLowerCase();
    final list = q.isEmpty
        ? all
        : all
            .where((p) =>
                p.name.toLowerCase().contains(q) ||
                p.barcode.toLowerCase() == q ||
                p.productNumber.toLowerCase() == q ||
                p.mfgCompany.toLowerCase().contains(q))
            .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  autofocus: true,
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
            ],
          ),
        ),
        Expanded(
          child: products.isLoading
              ? const Center(child: CircularProgressIndicator())
              : list.isEmpty
                  ? Center(
                      child: Text('No matching products',
                          style: TextStyle(color: AppColors.inkMute)))
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(14, 0, 14, 24),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 6),
                      itemBuilder: (_, i) => _ProductRow(
                        product: list[i],
                        mode: widget.mode,
                        onTap: () => Navigator.of(context).pop(list[i]),
                      ),
                    ),
        ),
      ],
    );
  }
}

class _ProductRow extends StatelessWidget {
  const _ProductRow(
      {required this.product, required this.mode, required this.onTap});

  final Product product;
  final PriceMode mode;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = product;
    final rate = mode == PriceMode.pos ? p.posRate : p.b2bRate;
    final stockColor = p.isOutOfStock
        ? AppColors.critical
        : (p.isLowStock ? AppColors.warning : AppColors.good);
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.name.isEmpty ? '(no name)' : p.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13.5,
                            color: AppColors.ink)),
                    const SizedBox(height: 3),
                    Text(
                      [
                        if (p.mfgCompany.isNotEmpty) p.mfgCompany,
                        'Stock ${fmtQty(p.stock)} ${p.baseUnit}',
                        'GST ${fmtQty(p.gstPct ?? 5)}%',
                      ].join('  ·  '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11.5, color: stockColor),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(rate > 0 ? fmtInr2(rate) : 'No price',
                  style: kTabular.copyWith(
                      fontSize: 13.5,
                      color: rate > 0 ? AppColors.ink : AppColors.critical)),
            ],
          ),
        ),
      ),
    );
  }
}
