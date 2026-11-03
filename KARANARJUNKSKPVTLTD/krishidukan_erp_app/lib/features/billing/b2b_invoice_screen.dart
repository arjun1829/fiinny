import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../core/parse.dart';
import '../../widgets/form_bits.dart';
import '../../widgets/kpi_card.dart';
import '../auth/auth_repository.dart';
import '../catalog/catalog_repository.dart';
import '../catalog/product.dart';
import '../catalog/product_picker_sheet.dart';
import '../customers/customer.dart';
import '../customers/customer_picker_sheet.dart';
import '../customers/customers_repository.dart';
import 'bill_detail_screen.dart';
import 'billing_math.dart';
import 'billing_repository.dart';
import 'sale_result_sheet.dart';

final _salesPeopleProvider = FutureProvider.autoDispose<List<SalesPerson>>((ref) async {
  final repo = ref.watch(billingRepositoryProvider);
  if (repo == null) return const [];
  try {
    return await repo.salesPeople();
  } catch (_) {
    return const [];
  }
});

final _transportersProvider = FutureProvider.autoDispose<List<Transporter>>((ref) async {
  final repo = ref.watch(billingRepositoryProvider);
  if (repo == null) return const [];
  try {
    return await repo.transporters();
  } catch (_) {
    return const [];
  }
});

/// Wholesale GST invoice — the mobile B2BInvoicePage. Creates new invoices
/// only; editing a saved invoice stays on the web, which owns the
/// reverse-and-reapply logic for balances.
class B2bInvoiceScreen extends ConsumerStatefulWidget {
  const B2bInvoiceScreen({super.key, this.customer});
  final Customer? customer;

  @override
  ConsumerState<B2bInvoiceScreen> createState() => _B2bInvoiceScreenState();
}

class _B2bInvoiceScreenState extends ConsumerState<B2bInvoiceScreen> {
  final _h = B2bHeader();
  final _rows = <B2bLine>[];
  final _buyerName = TextEditingController();
  final _buyerContact = TextEditingController();
  final _buyerAddress = TextEditingController();
  final _buyerGstin = TextEditingController();
  final _terms = TextEditingController();
  final _salesman = TextEditingController();
  final _discount = TextEditingController();
  final _prevBalance = TextEditingController();
  bool _balanceLoading = false;
  bool _busy = false;
  String? _nextNumber;
  final _batchFilled = <B2bLine>{};

  @override
  void initState() {
    super.initState();
    if (widget.customer != null) _applyBuyer(widget.customer!);
    _loadNext();
  }

  @override
  void dispose() {
    for (final c in [
      _buyerName, _buyerContact, _buyerAddress, _buyerGstin, _terms, _salesman, _discount, _prevBalance
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadNext() async {
    try {
      final n = await ref.read(billingRepositoryProvider)?.nextB2bNumber();
      if (mounted) setState(() => _nextNumber = n);
    } catch (_) {}
  }

  bool get _dirty => _rows.isNotEmpty || _buyerName.text.trim().isNotEmpty;

  void _applyBuyer(Customer c) {
    _h.retailerId = c.id;
    _buyerName.text = c.name;
    _buyerContact.text = c.phone;
    _buyerAddress.text = c.b2bAddress;
    _buyerGstin.text = c.gstin;
    _loadBalance(c);
  }

  Future<void> _loadBalance(Customer c) async {
    final repo = ref.read(billingRepositoryProvider);
    if (repo == null) return;
    setState(() => _balanceLoading = true);
    try {
      final v = await repo.partnerOutstanding(c.id);
      if (mounted) _prevBalance.text = editNum(round2(v));
    } catch (_) {
      // Same fallback as the web: the cached counter on the retailer doc.
      if (mounted) _prevBalance.text = editNum(round2(c.outstandingAmount));
    } finally {
      if (mounted) setState(() => _balanceLoading = false);
    }
  }

  Future<void> _pickBuyer() async {
    final c = await pickCustomer(context);
    if (c != null && mounted) setState(() => _applyBuyer(c));
  }

  void _unlinkBuyer() {
    setState(() {
      _h.retailerId = '';
      for (final c in [_buyerName, _buyerContact, _buyerAddress, _buyerGstin, _prevBalance]) {
        c.clear();
      }
    });
  }

  Future<void> _addProduct() async {
    final p = await pickProduct(context, PriceMode.b2b);
    if (p == null || !mounted) return;
    final row = B2bLine(
      productId: p.id,
      description: p.name,
      mfgCompany: p.mfgCompany,
      rate: p.b2bRate,
      gstPct: (p.gstPct == null || p.gstPct == 0) ? 5 : p.gstPct!,
      per: p.baseUnit.isEmpty ? 'Nos' : p.baseUnit,
      qty: 1,
      batchNo: p.batchNumber,
      expDate: p.expiryDate,
    );
    setState(() => _rows.add(row));
    _fillBatch(row);
    await _editRow(row);
  }

  Future<void> _fillBatch(B2bLine row) async {
    final user = ref.read(appUserProvider).valueOrNull;
    if (user == null || !user.can.canViewBatches || row.productId.isEmpty || !_batchFilled.add(row)) return;
    try {
      final batches = await ref.read(catalogRepositoryProvider)!.batchesFor(row.productId);
      final live = batches.where((b) => b.quantity > 0).toList()
        ..sort((a, b) {
          if (a.expiryDate.isEmpty && b.expiryDate.isEmpty) return 0;
          if (a.expiryDate.isEmpty) return 1;
          if (b.expiryDate.isEmpty) return -1;
          return a.expiryDate.compareTo(b.expiryDate);
        });
      if (live.isEmpty || !mounted) return;
      setState(() {
        row.batchNo = live.first.batchNumber;
        row.expDate = live.first.expiryDate;
      });
    } catch (_) {}
  }

  Future<void> _addCustomRow() async {
    final row = B2bLine();
    final ok = await _editRow(row, isNew: true);
    if (ok && mounted && row.isActive) setState(() => _rows.add(row));
  }

  Future<bool> _editRow(B2bLine row, {bool isNew = false}) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _RowEditor(row: row, isNew: isNew),
    );
    if (mounted) setState(() {});
    return ok ?? false;
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _h.invoiceDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (d != null && mounted) setState(() => _h.invoiceDate = d);
  }

  Future<void> _save() async {
    final repo = ref.read(billingRepositoryProvider);
    if (repo == null) return;
    _h
      ..buyerName = _buyerName.text
      ..buyerContact = _buyerContact.text
      ..buyerAddress = _buyerAddress.text
      ..buyerGstin = _buyerGstin.text
      ..termsOfDelivery = _terms.text
      ..salesmanName = _salesman.text;

    final products = ref.read(productsProvider).valueOrNull ?? const <Product>[];
    final byName = {for (final p in products) p.name.trim().toLowerCase(): p.id};

    setState(() => _busy = true);
    try {
      final r = await repo.createB2bInvoice(
        _h,
        _rows,
        discount: parseAmount(_discount.text),
        previousBalance: parseAmount(_prevBalance.text),
        productIdByName: byName,
      );
      ref.invalidate(customersProvider);
      if (!mounted) return;
      setState(() => _busy = false);
      final next = await showSaleResult(context, r);
      if (!mounted) return;
      if (next == SaleNext.view) {
        Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => BillDetailScreen(orderId: r.orderId)));
      } else if (next == SaleNext.newBill) {
        Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const B2bInvoiceScreen()));
      } else {
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showError(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = b2bTotals(_rows.where((r) => r.isActive).toList(),
        discount: parseAmount(_discount.text));
    final prev = parseAmount(_prevBalance.text);
    final salesPeople = ref.watch(_salesPeopleProvider).valueOrNull ?? const <SalesPerson>[];
    final transporters = ref.watch(_transportersProvider).valueOrNull ?? const <Transporter>[];

    return PopScope(
      canPop: !_dirty && !_busy,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || _busy) return;
        if (await confirmDiscard(context) && context.mounted) Navigator.of(context).pop();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('B2B GST invoice', style: TextStyle(fontWeight: FontWeight.w700)),
            Text(_nextNumber == null ? 'Wholesale' : 'Next no. $_nextNumber',
                style: TextStyle(fontSize: 11.5, color: AppColors.inkMute)),
          ]),
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 24),
          children: [
            Panel(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text('BUYER', style: kMicro),
                  const SizedBox(width: 8),
                  if (_h.retailerId.isNotEmpty) Pill('Linked partner', color: AppColors.good),
                  const Spacer(),
                  if (_h.retailerId.isNotEmpty)
                    TextButton(onPressed: _unlinkBuyer, child: const Text('Clear')),
                  TextButton.icon(
                    onPressed: _pickBuyer,
                    icon: const Icon(Icons.person_search_rounded, size: 18),
                    label: const Text('Find'),
                  ),
                ]),
                TextField(
                  controller: _buyerName,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Buyer / firm name *', isDense: true),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _buyerContact,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Contact', isDense: true),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _buyerAddress,
                  decoration: const InputDecoration(labelText: 'Address', isDense: true),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _buyerGstin,
                  textCapitalization: TextCapitalization.characters,
                  decoration: InputDecoration(
                    labelText: 'GSTIN (optional)',
                    isDense: true,
                    errorText: gstinError(_buyerGstin.text),
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                if (_h.retailerId.isEmpty && _buyerName.text.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Not linked to a saved partner — this invoice won\'t appear in any partner\'s ledger. Use "Find" to link one.',
                    style: TextStyle(fontSize: 11.5, color: AppColors.warning),
                  ),
                ],
              ]),
            ),
            const SizedBox(height: 12),
            Panel(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('INVOICE', style: kMicro),
                const SizedBox(height: 8),
                InkWell(
                  onTap: _pickDate,
                  borderRadius: BorderRadius.circular(12),
                  child: InputDecorator(
                    decoration: const InputDecoration(
                        labelText: 'Invoice date', isDense: true, suffixIcon: Icon(Icons.event, size: 18)),
                    child: Text(fmtFullDate(_h.invoiceDate)),
                  ),
                ),
                const SizedBox(height: 12),
                const FieldLabel('Mode of payment'),
                ChoiceRow(
                  options: b2bPaymentModes,
                  selected: _h.modeOfPayment,
                  onSelected: (m) => setState(() => _h.modeOfPayment = m),
                ),
                const SizedBox(height: 14),
                Autocomplete<SalesPerson>(
                  displayStringForOption: (s) => s.name,
                  optionsBuilder: (v) {
                    final q = v.text.trim().toLowerCase();
                    return salesPeople.where((s) => q.isEmpty || s.name.toLowerCase().contains(q));
                  },
                  onSelected: (s) {
                    _salesman.text = s.name;
                    _h.salesmanId = s.id;
                  },
                  fieldViewBuilder: (ctx, ctl, focus, onSubmit) {
                    if (ctl.text.isEmpty && _salesman.text.isNotEmpty) ctl.text = _salesman.text;
                    return TextField(
                      controller: ctl,
                      focusNode: focus,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(labelText: 'Salesperson *', isDense: true),
                      onChanged: (v) {
                        _salesman.text = v;
                        // Typed name that isn't the picked user — drop the id
                        // so the invoice is never attributed to someone else.
                        if (!salesPeople.any((s) => s.id == _h.salesmanId && s.name == v)) {
                          _h.salesmanId = '';
                        }
                      },
                    );
                  },
                ),
                if (transporters.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _h.transporterId.isEmpty ? null : _h.transporterId,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Transporter (optional)', isDense: true),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('None')),
                      for (final t in transporters)
                        DropdownMenuItem(value: t.id, child: Text(t.name.isEmpty ? t.id : t.name)),
                    ],
                    onChanged: (id) {
                      final t = transporters.where((x) => x.id == id).firstOrNull;
                      setState(() {
                        _h.transporterId = t?.id ?? '';
                        _h.transporterName = t?.name ?? '';
                        _h.transporterContact = t?.mobile ?? '';
                      });
                    },
                  ),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: _terms,
                  decoration: const InputDecoration(labelText: 'Terms of delivery (optional)', isDense: true),
                ),
              ]),
            ),
            SectionTitle('Items (${_rows.length})',
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  TextButton(onPressed: _addCustomRow, child: const Text('Custom')),
                  TextButton.icon(
                    onPressed: _addProduct,
                    icon: const Icon(Icons.add_rounded, size: 18),
                    label: const Text('Add'),
                  ),
                ])),
            if (_rows.isEmpty)
              const EmptyNote('No items yet. Tap "Add" to pick a product.')
            else
              for (final r in _rows) ...[
                _RowCard(
                  row: r,
                  onTap: () => _editRow(r),
                  onRemove: () => setState(() => _rows.remove(r)),
                ),
                const SizedBox(height: 8),
              ],
            const SizedBox(height: 6),
            Panel(
              child: Column(children: [
                Row(children: [
                  Expanded(
                    child: AmountField(
                        controller: _discount, label: 'Discount', onChanged: (_) => setState(() {})),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AmountField(
                      controller: _prevBalance,
                      label: 'Previous balance',
                      helper: _balanceLoading ? 'Calculating…' : 'Live from ledger',
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                ]),
                const SizedBox(height: 10),
                KvRow('Taxable value', fmtInr2(t.taxable)),
                KvRow('CGST', fmtInr2(t.cgst)),
                KvRow('SGST', fmtInr2(t.sgst)),
                if (t.discount > 0) KvRow('Discount', '− ${fmtInr2(t.discount)}'),
                KvRow('Round off', fmtInr2(t.roundOff)),
                const Divider(height: 16),
                KvRow('Net amount', fmtInr2(t.netAmount), bold: true, size: 15),
                if (prev > 0) KvRow('Net balance (incl. previous)', fmtInr2(t.netAmount + prev), bold: true),
              ]),
            ),
          ],
        ),
        bottomNavigationBar: BottomActionBar(
          child: BusyButton(
            label: 'Save invoice · ${fmtInr(t.netAmount)}',
            icon: Icons.receipt_long_rounded,
            busy: _busy,
            onPressed: _rows.isEmpty ? null : _save,
          ),
        ),
      ),
    );
  }
}

class _RowCard extends StatelessWidget {
  const _RowCard({required this.row, required this.onTap, required this.onRemove});
  final B2bLine row;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final r = row;
    final bad = !(r.qty > 0);
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: bad ? AppColors.critical : AppColors.border),
          ),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(r.description.isEmpty ? '(no description)' : r.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
                const SizedBox(height: 3),
                Text(
                  '${fmtQty(r.qty)} ${r.per} × ${fmtInr2(r.rate)}  ·  GST ${fmtQty(r.gstPct)}%'
                  '${r.batchNo.isNotEmpty ? '  ·  B ${r.batchNo}' : ''}'
                  '${r.productId.isEmpty ? '  ·  not in stock list' : ''}',
                  style: TextStyle(fontSize: 11.5, color: bad ? AppColors.critical : AppColors.inkMute),
                ),
              ]),
            ),
            Text(fmtInr2(r.gross), style: kTabular.copyWith(fontSize: 13.5, fontWeight: FontWeight.w700)),
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: 'Remove',
              onPressed: onRemove,
              icon: Icon(Icons.close_rounded, size: 18, color: AppColors.inkMute),
            ),
          ]),
        ),
      ),
    );
  }
}

class _RowEditor extends StatefulWidget {
  const _RowEditor({required this.row, required this.isNew});
  final B2bLine row;
  final bool isNew;

  @override
  State<_RowEditor> createState() => _RowEditorState();
}

class _RowEditorState extends State<_RowEditor> {
  late final _desc = TextEditingController(text: widget.row.description);
  late final _qty = TextEditingController(text: editNum(widget.row.qty));
  late final _rate = TextEditingController(text: editNum(widget.row.rate));
  late final _gst = TextEditingController(text: editNum(widget.row.gstPct));
  late final _per = TextEditingController(text: widget.row.per);
  late final _batch = TextEditingController(text: widget.row.batchNo);
  late final _exp = TextEditingController(text: widget.row.expDate);

  @override
  void dispose() {
    for (final c in [_desc, _qty, _rate, _gst, _per, _batch, _exp]) {
      c.dispose();
    }
    super.dispose();
  }

  void _apply() {
    final r = widget.row;
    if (r.productId.isEmpty) r.description = _desc.text.trim();
    r
      ..qty = parseAmount(_qty.text)
      ..rate = parseAmount(_rate.text)
      ..gstPct = parseAmount(_gst.text)
      ..per = _per.text.trim().isEmpty ? 'Nos' : _per.text.trim()
      ..batchNo = _batch.text.trim()
      ..expDate = _exp.text.trim();
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final linked = widget.row.productId.isNotEmpty;
    final gross = parseAmount(_qty.text) * parseAmount(_rate.text);
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.viewInsetsOf(context).bottom + 18),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (linked)
            Text(widget.row.description,
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink))
          else
            TextField(
              controller: _desc,
              autofocus: widget.isNew,
              decoration: const InputDecoration(
                  labelText: 'Item description',
                  helperText: 'Custom lines do not reduce stock unless the name matches a product exactly.',
                  isDense: true),
            ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
                child: AmountField(
                    controller: _qty, label: 'Quantity', prefix: null, autofocus: linked,
                    onChanged: (_) => setState(() {}))),
            const SizedBox(width: 10),
            SizedBox(
              width: 90,
              child: TextField(controller: _per, decoration: const InputDecoration(labelText: 'Per', isDense: true)),
            ),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: AmountField(controller: _rate, label: 'Rate (incl. GST)', onChanged: (_) => setState(() {}))),
            const SizedBox(width: 10),
            SizedBox(width: 90, child: AmountField(controller: _gst, label: 'GST %', prefix: null)),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: _batch, decoration: const InputDecoration(labelText: 'Batch no.', isDense: true))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _exp, decoration: const InputDecoration(labelText: 'Expiry (YYYY-MM)', isDense: true))),
          ]),
          const SizedBox(height: 12),
          KvRow('Gross amount', fmtInr2(gross), bold: true),
          const SizedBox(height: 12),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: _apply,
            child: Text(widget.isNew ? 'Add line' : 'Done'),
          ),
        ]),
      ),
    );
  }
}
