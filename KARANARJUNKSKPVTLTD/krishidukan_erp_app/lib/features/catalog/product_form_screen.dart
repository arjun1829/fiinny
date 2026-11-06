import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../widgets/form_bits.dart';
import 'barcode_scanner_screen.dart';
import 'catalog_repository.dart';
import 'product.dart';

const _gstRates = [0.0, 5.0, 12.0, 18.0, 28.0];

/// Add / edit a product — the web's QuickProductModal fields. Admin/analyst
/// only (the screen is never offered to other roles, and the rules would
/// reject the write anyway).
class ProductFormScreen extends ConsumerStatefulWidget {
  const ProductFormScreen({super.key, this.product, this.stockLocked = false});

  final Product? product;

  /// The product has inventory batches; its stock is their sum and is not
  /// editable here.
  final bool stockLocked;

  @override
  ConsumerState<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends ConsumerState<ProductFormScreen> {
  final _form = GlobalKey<FormState>();
  late final ProductDraft _d =
      widget.product != null ? ProductDraft.from(widget.product!) : ProductDraft();
  late final _name = TextEditingController(text: _d.name);
  late final _type = TextEditingController(text: _d.type);
  late final _sell = TextEditingController(text: editNum(_d.sellingPrice));
  late final _mrp = TextEditingController(text: editNum(_d.mrp));
  late final _purchase = TextEditingController(text: editNum(_d.purchasePrice));
  late final _stock = TextEditingController(text: editNum(_d.loosePieces));
  late final _boxes = TextEditingController(text: editNum(_d.quantity));
  late final _boxCap = TextEditingController(text: editNum(_d.boxCapacity));
  late final _unit = TextEditingController(text: _d.baseUnit);
  late final _barcode = TextEditingController(text: _d.barcode);
  late double _gst = _gstRates.contains(_d.gstPct) ? _d.gstPct : 5;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _type, _sell, _mrp, _purchase, _stock, _boxes, _boxCap, _unit, _barcode]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final repo = ref.read(catalogRepositoryProvider);
    if (repo == null) return;
    final all = ref.read(productsProvider).valueOrNull ?? const <Product>[];
    final name = _name.text.trim();

    // Same name twice splits stock and sales across two docs — and B2B rows
    // resolve products by exact name.
    final dup = all.where((p) =>
        p.id != widget.product?.id && p.name.trim().toLowerCase() == name.toLowerCase());
    if (dup.isNotEmpty) {
      showError(context, 'A product named "$name" already exists.');
      return;
    }
    final code = _barcode.text.trim();
    if (code.isNotEmpty) {
      final clash = all.where((p) => p.id != widget.product?.id && p.barcode.trim() == code);
      if (clash.isNotEmpty) {
        showError(context, 'Barcode $code is already on "${clash.first.name}".');
        return;
      }
    }

    _d
      ..name = name
      ..type = _type.text.trim()
      ..sellingPrice = parseAmount(_sell.text)
      ..mrp = parseAmount(_mrp.text)
      ..purchasePrice = parseAmount(_purchase.text)
      ..loosePieces = parseAmount(_stock.text)
      ..quantity = parseAmount(_boxes.text)
      ..boxCapacity = parseAmount(_boxCap.text) <= 0 ? 1 : parseAmount(_boxCap.text)
      ..baseUnit = _unit.text.trim().isEmpty ? 'pcs' : _unit.text.trim()
      ..gstPct = _gst
      ..barcode = code;

    setState(() => _busy = true);
    try {
      await repo.save(_d, existing: widget.product, all: all, includeStock: !widget.stockLocked);
      if (mounted) {
        showInfo(context, widget.product == null ? 'Product added' : 'Product updated');
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) showError(context, 'Could not save the product. ${e is Exception ? '' : e}');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _required(String? v) => (v ?? '').trim().isEmpty ? 'Required' : null;

  /// New products must be sellable. Existing ones may carry legacy data
  /// (0 MRP from an import); blocking every edit on that would be worse.
  String? _price(String? v) {
    if (widget.product != null) return null;
    if ((v ?? '').trim().isEmpty) return 'Required';
    return parseAmount(v!) <= 0 ? 'Must be above 0' : null;
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.product != null;
    return Scaffold(
      appBar: AppBar(title: Text(editing ? 'Edit product' : 'New product')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 30),
          children: [
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Product name *', isDense: true),
              validator: _required,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _type,
              decoration: const InputDecoration(labelText: 'Type (e.g. Fertilizer, Pesticide)', isDense: true),
            ),
            const SizedBox(height: 16),
            const FieldLabel('Prices (GST inclusive)'),
            Row(children: [
              Expanded(
                child: TextFormField(
                  controller: _mrp,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: decimalInput,
                  decoration: const InputDecoration(labelText: 'MRP *', prefixText: '₹ ', isDense: true),
                  validator: _price,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  controller: _sell,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: decimalInput,
                  decoration: const InputDecoration(labelText: 'Selling price *', prefixText: '₹ ', isDense: true),
                  validator: (v) {
                    final e = _price(v);
                    if (e != null) return e;
                    final mrp = parseAmount(_mrp.text);
                    return mrp > 0 && parseAmount(v!) > mrp ? 'Above MRP' : null;
                  },
                ),
              ),
            ]),
            const SizedBox(height: 12),
            TextFormField(
              controller: _purchase,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: decimalInput,
              decoration: const InputDecoration(labelText: 'Purchase price', prefixText: '₹ ', isDense: true),
            ),
            const SizedBox(height: 14),
            const FieldLabel('GST rate'),
            ChoiceRow(
              options: [for (final g in _gstRates) '${g.toInt()}%'],
              selected: '${_gst.toInt()}%',
              onSelected: (s) => setState(() => _gst = double.parse(s.replaceAll('%', ''))),
            ),
            const SizedBox(height: 16),
            const FieldLabel('Stock'),
            if (widget.stockLocked)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.cardHi,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'Stock comes from purchase batches (${editNum(_d.loosePieces)} ${_d.baseUnit}). '
                  'Adjust it through a supplier invoice or stock adjustment in the web ERP so the batches stay correct.',
                  style: TextStyle(fontSize: 12, color: AppColors.inkDim),
                ),
              )
            else
              Row(children: [
                Expanded(
                  child: TextFormField(
                    controller: _stock,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: decimalInput,
                    decoration: const InputDecoration(labelText: 'Loose pieces', isDense: true),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    controller: _boxes,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: decimalInput,
                    decoration: const InputDecoration(labelText: 'Boxes', isDense: true),
                  ),
                ),
              ]),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: TextFormField(
                  controller: _boxCap,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: decimalInput,
                  decoration: const InputDecoration(labelText: 'Pieces per box', isDense: true),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  controller: _unit,
                  decoration: const InputDecoration(labelText: 'Unit (pcs, kg, ltr)', isDense: true),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            TextFormField(
              controller: _barcode,
              decoration: InputDecoration(
                labelText: 'Barcode (optional)',
                isDense: true,
                suffixIcon: IconButton(
                  tooltip: 'Scan',
                  icon: const Icon(Icons.qr_code_scanner_rounded, size: 20),
                  onPressed: () async {
                    final c = await BarcodeScannerScreen.scan(context);
                    if (c != null) _barcode.text = c;
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: BottomActionBar(
        child: BusyButton(label: editing ? 'Save changes' : 'Add product', busy: _busy, onPressed: _save),
      ),
    );
  }
}
