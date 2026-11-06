import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../core/parse.dart';
import '../../widgets/form_bits.dart';
import '../../widgets/kpi_card.dart';
import '../auth/auth_repository.dart';
import '../catalog/barcode_scanner_screen.dart';
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

/// Counter (B2C) bill — the mobile POSPage. Saves through
/// BillingRepository.createPosBill, which writes the same salesOrders shape
/// the web POS does, in one transaction with the stock deduction.
class PosScreen extends ConsumerStatefulWidget {
  const PosScreen({super.key, this.customer});

  /// Pre-selected buyer (from a customer's profile → "New bill").
  final Customer? customer;

  @override
  ConsumerState<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends ConsumerState<PosScreen> {
  final _lines = <PosLine>[];
  final _batchLoaded = <String>{};

  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _village = TextEditingController();
  final _pin = TextEditingController();
  final _transport = TextEditingController();
  final _labour = TextEditingController();
  final _discount = TextEditingController();
  final _billNote = TextEditingController();

  String? _retailerId;
  String? _autoMatchedPhone;
  String _taluka = '';
  String _district = '';
  double _outstanding = 0;
  bool _outstandingLoading = false;
  bool _showExtras = false;
  String? _nextNumber;

  @override
  void initState() {
    super.initState();
    if (widget.customer != null) _applyCustomer(widget.customer!);
    _phone.addListener(_onPhoneChanged);
    _loadNextNumber();
  }

  @override
  void dispose() {
    for (final c in [
      _name, _phone, _village, _pin, _transport, _labour, _discount, _billNote
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadNextNumber() async {
    try {
      final n = await ref.read(billingRepositoryProvider)?.nextPosNumber();
      if (mounted) setState(() => _nextNumber = n);
    } catch (_) {/* preview only — the real number is assigned on save */}
  }

  bool get _dirty =>
      _lines.isNotEmpty || _name.text.trim().isNotEmpty || _phone.text.trim().isNotEmpty;

  // ── Buyer ────────────────────────────────────────────────────────────────

  void _applyCustomer(Customer c) {
    _retailerId = c.id;
    _autoMatchedPhone = c.phone;
    _name.text = c.name;
    _phone.text = c.phone;
    _village.text = c.atPost;
    _pin.text = c.pin;
    _taluka = c.taluka;
    _district = c.district;
    _refreshOutstanding();
  }

  void _clearBuyer() {
    setState(() {
      _retailerId = null;
      _autoMatchedPhone = null;
      _taluka = '';
      _district = '';
      _outstanding = 0;
      for (final c in [_name, _phone, _village, _pin]) {
        c.clear();
      }
    });
  }

  /// handlePhoneLookup: one unambiguous match auto-fills and links the
  /// customer; several matches are left for the picker; editing a number
  /// that produced an auto-fill reverts to a clean walk-in.
  void _onPhoneChanged() {
    final key = phoneKey(_phone.text);
    if (_autoMatchedPhone != null && !samePhone(_autoMatchedPhone, _phone.text)) {
      setState(() {
        _retailerId = null;
        _autoMatchedPhone = null;
        _outstanding = 0;
      });
    }
    if (key.length < 10 || _retailerId != null) return;
    final all = ref.read(customersProvider).valueOrNull ?? const <Customer>[];
    final matches = all.where((c) => samePhone(c.phone, key)).toList();
    if (matches.length == 1) {
      setState(() => _applyCustomer(matches.single));
    }
  }

  Future<void> _refreshOutstanding() async {
    final repo = ref.read(billingRepositoryProvider);
    if (repo == null) return;
    setState(() => _outstandingLoading = true);
    try {
      final v = await repo.khataOutstanding(_name.text, _phone.text);
      if (mounted) setState(() => _outstanding = v);
    } catch (_) {
      if (mounted) setState(() => _outstanding = 0);
    } finally {
      if (mounted) setState(() => _outstandingLoading = false);
    }
  }

  Future<void> _pickBuyer() async {
    final c = await pickCustomer(context);
    if (c != null && mounted) setState(() => _applyCustomer(c));
  }

  // ── Items ────────────────────────────────────────────────────────────────

  void _addProduct(Product p) {
    setState(() {
      final existing = _lines.where((l) => l.productId == p.id);
      if (existing.isNotEmpty) {
        existing.first.qty += 1;
      } else {
        _lines.add(PosLine(
          productId: p.id,
          name: p.name,
          rate: p.posRate,
          qty: 1,
          gstPct: p.gstPct,
          unit: p.baseUnit,
          mfgCompany: p.mfgCompany,
          batchNo: p.batchNumber,
          expDate: p.expiryDate,
        ));
      }
    });
    if (p.posRate <= 0) {
      showInfo(context, '${p.name} has no selling price — set the rate on the line.');
    }
    _fillBatch(p.id);
  }

  /// Same FEFO pre-fill as the web: the earliest-expiring batch with stock.
  Future<void> _fillBatch(String productId) async {
    final user = ref.read(appUserProvider).valueOrNull;
    if (user == null || !user.can.canViewBatches || !_batchLoaded.add(productId)) return;
    try {
      final batches = await ref.read(catalogRepositoryProvider)!.batchesFor(productId);
      final live = batches.where((b) => b.quantity > 0).toList()
        ..sort((a, b) {
          if (a.expiryDate.isEmpty && b.expiryDate.isEmpty) return 0;
          if (a.expiryDate.isEmpty) return 1;
          if (b.expiryDate.isEmpty) return -1;
          return a.expiryDate.compareTo(b.expiryDate);
        });
      if (live.isEmpty || !mounted) return;
      setState(() {
        for (final l in _lines.where((l) => l.productId == productId)) {
          l.batchNo = live.first.batchNumber;
          l.expDate = live.first.expiryDate;
        }
      });
    } catch (_) {/* pre-fill only; deduction re-reads batches on save */}
  }

  Future<void> _scan() async {
    final code = await BarcodeScannerScreen.scan(context);
    if (code == null || !mounted) return;
    final all = ref.read(productsProvider).valueOrNull ?? const <Product>[];
    final p = findByCode(all, code);
    if (p == null) {
      showError(context, 'No product has barcode $code');
    } else {
      _addProduct(p);
    }
  }

  Future<void> _pick() async {
    final p = await pickProduct(context, PriceMode.pos);
    if (p != null && mounted) _addProduct(p);
  }

  Future<void> _editRate(PosLine l) async {
    final ctl = TextEditingController(text: editNum(l.rate));
    final v = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.name, maxLines: 2, overflow: TextOverflow.ellipsis),
        content: AmountField(controller: ctl, label: 'Rate per ${l.unit}', autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, parseAmount(ctl.text)),
              child: const Text('Set rate')),
        ],
      ),
    );
    if (v != null && mounted) setState(() => l.rate = v);
  }

  Future<void> _editQty(PosLine l) async {
    final ctl = TextEditingController(text: editNum(l.qty));
    final v = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.name, maxLines: 2, overflow: TextOverflow.ellipsis),
        content: AmountField(
            controller: ctl, label: 'Quantity (${l.unit})', prefix: null, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, parseAmount(ctl.text)),
              child: const Text('Set')),
        ],
      ),
    );
    if (v == null || !mounted) return;
    setState(() {
      if (v <= 0) {
        _lines.remove(l);
      } else {
        l.qty = v;
      }
    });
  }

  PosTotals get _totals => posTotals(_lines,
      transport: parseAmount(_transport.text),
      labour: parseAmount(_labour.text),
      discount: parseAmount(_discount.text));

  // ── Checkout ─────────────────────────────────────────────────────────────

  Future<void> _checkout() async {
    if (_lines.isEmpty) {
      showError(context, 'Add at least one item.');
      return;
    }
    final unpriced = _lines.where((l) => l.rate <= 0).map((l) => l.name).toList();
    if (unpriced.isNotEmpty) {
      final go = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Items with ₹0 rate'),
          content: Text('${unpriced.join(', ')} will be billed at ₹0. Continue?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Fix rates')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Bill at ₹0')),
          ],
        ),
      );
      if (go != true || !mounted) return;
    }

    final result = await showModalBottomSheet<SaleResult>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      // No swipe-away mid-save: a dismissed sheet hides the result and
      // invites a second tap that would bill twice.
      enableDrag: false,
      builder: (_) => _CheckoutSheet(
        totals: _totals,
        hasBuyer: _name.text.trim().isNotEmpty || phoneKey(_phone.text).length >= 5,
        buildDraft: (method, paidNow, khataNote) => PosDraft(
          lines: _lines,
          buyer: PosBuyer(
            name: _name.text,
            phone: _phone.text,
            address: _village.text,
            pin: _pin.text,
            taluka: _taluka,
            district: _district,
            retailerId: _retailerId,
          ),
          method: method,
          paidNow: paidNow,
          transport: parseAmount(_transport.text),
          labour: parseAmount(_labour.text),
          discount: parseAmount(_discount.text),
          khataNote: khataNote,
          billNote: _billNote.text,
          previousBalance: _outstanding,
        ),
      ),
    );
    if (result == null || !mounted) return;

    final next = await showSaleResult(context, result);
    if (!mounted) return;
    if (next == SaleNext.view) {
      Navigator.of(context).pushReplacement(MaterialPageRoute(
          builder: (_) => BillDetailScreen(orderId: result.orderId)));
    } else if (next == SaleNext.newBill) {
      _reset();
    } else {
      Navigator.of(context).pop();
    }
  }

  void _reset() {
    setState(() {
      _lines.clear();
      _batchLoaded.clear();
      for (final c in [_transport, _labour, _discount, _billNote]) {
        c.clear();
      }
      _showExtras = false;
    });
    _clearBuyer();
    _loadNextNumber();
  }

  @override
  Widget build(BuildContext context) {
    final t = _totals;
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await confirmDiscard(context) && context.mounted) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('POS bill', style: TextStyle(fontWeight: FontWeight.w700)),
              Text(_nextNumber == null ? 'Counter sale' : 'Next no. $_nextNumber',
                  style: TextStyle(fontSize: 11.5, color: AppColors.inkMute)),
            ],
          ),
          actions: [
            IconButton(
                tooltip: 'Scan barcode',
                onPressed: _scan,
                icon: const Icon(Icons.qr_code_scanner_rounded)),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 24),
          children: [
            _buyerPanel(),
            SectionTitle('Items (${_lines.length})',
                trailing: TextButton.icon(
                  onPressed: _pick,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Add item'),
                )),
            if (_lines.isEmpty)
              _EmptyCart(onAdd: _pick, onScan: _scan)
            else
              for (final l in _lines) ...[
                _CartLine(
                  line: l,
                  onMinus: () => setState(() {
                    if (l.qty <= 1) {
                      _lines.remove(l);
                    } else {
                      l.qty -= 1;
                    }
                  }),
                  onPlus: () => setState(() => l.qty += 1),
                  onQty: () => _editQty(l),
                  onRate: () => _editRate(l),
                  onRemove: () => setState(() => _lines.remove(l)),
                ),
                const SizedBox(height: 8),
              ],
            const SizedBox(height: 6),
            _extrasPanel(),
            const SizedBox(height: 12),
            Panel(
              child: Column(children: [
                KvRow('Items · qty', '${_lines.length} · ${fmtQty(t.totalQty)}'),
                KvRow('Taxable value', fmtInr2(t.taxable)),
                KvRow('CGST + SGST', fmtInr2(t.totalTax)),
                KvRow('Bill total (incl. GST)', fmtInr2(t.subtotal)),
                if (parseAmount(_transport.text) > 0)
                  KvRow('Transport', fmtInr2(parseAmount(_transport.text))),
                if (parseAmount(_labour.text) > 0)
                  KvRow('Labour', fmtInr2(parseAmount(_labour.text))),
                if (parseAmount(_discount.text) > 0)
                  KvRow('Discount', '− ${fmtInr2(parseAmount(_discount.text))}'),
                const Divider(height: 18),
                KvRow('Net amount', fmtInr2(t.grandTotal), bold: true, size: 15),
                if (_outstanding > 0) ...[
                  KvRow('Previous outstanding', fmtInr2(_outstanding),
                      color: AppColors.critical),
                  KvRow('Total payable', fmtInr2(t.grandTotal + _outstanding), bold: true),
                ],
              ]),
            ),
          ],
        ),
        bottomNavigationBar: BottomActionBar(
          child: BusyButton(
            label: _lines.isEmpty ? 'Add items to bill' : 'Checkout · ${fmtInr2(t.grandTotal)}',
            icon: Icons.point_of_sale_rounded,
            busy: false,
            onPressed: _lines.isEmpty ? null : _checkout,
          ),
        ),
      ),
    );
  }

  Widget _buyerPanel() {
    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('BUYER', style: kMicro),
              const SizedBox(width: 8),
              if (_retailerId != null) Pill('Linked', color: AppColors.good),
              const Spacer(),
              if (_retailerId != null || _name.text.isNotEmpty)
                TextButton(onPressed: _clearBuyer, child: const Text('Clear')),
              TextButton.icon(
                onPressed: _pickBuyer,
                icon: const Icon(Icons.person_search_rounded, size: 18),
                label: const Text('Find'),
              ),
            ],
          ),
          const SizedBox(height: 6),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
                labelText: 'Phone', isDense: true, prefixIcon: Icon(Icons.call_outlined, size: 18)),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
                labelText: 'Name (blank = Walk-in Customer)', isDense: true),
            onEditingComplete: () {
              FocusScope.of(context).nextFocus();
              if (_retailerId == null && _name.text.trim().isNotEmpty) _refreshOutstanding();
            },
          ),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              flex: 3,
              child: TextField(
                controller: _village,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Village / At post', isDense: true),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: TextField(
                controller: _pin,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'PIN', isDense: true),
              ),
            ),
          ]),
          if (_outstandingLoading || _outstanding > 0) ...[
            const SizedBox(height: 10),
            Row(children: [
              Icon(Icons.account_balance_wallet_outlined, size: 16, color: AppColors.critical),
              const SizedBox(width: 6),
              Text(
                _outstandingLoading
                    ? 'Checking khata balance…'
                    : 'Khata due ${fmtInr(_outstanding)} — added to "Total payable"',
                style: TextStyle(fontSize: 12, color: AppColors.critical),
              ),
            ]),
          ],
        ],
      ),
    );
  }

  Widget _extrasPanel() {
    return Panel(
      padding: const EdgeInsets.fromLTRB(14, 4, 8, 4),
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _showExtras = !_showExtras),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(children: [
                Text('CHARGES, DISCOUNT & NOTE', style: kMicro),
                const Spacer(),
                Icon(_showExtras ? Icons.expand_less : Icons.expand_more,
                    color: AppColors.inkMute),
              ]),
            ),
          ),
          if (_showExtras)
            Padding(
              padding: const EdgeInsets.only(right: 6, bottom: 12),
              child: Column(children: [
                Row(children: [
                  Expanded(
                      child: AmountField(
                          controller: _transport,
                          label: 'Transport',
                          onChanged: (_) => setState(() {}))),
                  const SizedBox(width: 10),
                  Expanded(
                      child: AmountField(
                          controller: _labour,
                          label: 'Labour',
                          onChanged: (_) => setState(() {}))),
                ]),
                const SizedBox(height: 10),
                AmountField(
                    controller: _discount,
                    label: 'Discount',
                    onChanged: (_) => setState(() {})),
                const SizedBox(height: 10),
                TextField(
                  controller: _billNote,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'Bill note (optional)', isDense: true),
                ),
              ]),
            ),
        ],
      ),
    );
  }
}

class _EmptyCart extends StatelessWidget {
  const _EmptyCart({required this.onAdd, required this.onScan});
  final VoidCallback onAdd;
  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    return Panel(
      padding: const EdgeInsets.all(18),
      child: Column(children: [
        Icon(Icons.shopping_basket_outlined, size: 34, color: AppColors.inkMute),
        const SizedBox(height: 10),
        Text('No items yet', style: TextStyle(color: AppColors.inkDim)),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(
                onPressed: onScan,
                icon: const Icon(Icons.qr_code_scanner_rounded, size: 18),
                label: const Text('Scan')),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: FilledButton.icon(
                onPressed: onAdd,
                icon: const Icon(Icons.search_rounded, size: 18),
                label: const Text('Search')),
          ),
        ]),
      ]),
    );
  }
}

class _CartLine extends StatelessWidget {
  const _CartLine({
    required this.line,
    required this.onMinus,
    required this.onPlus,
    required this.onQty,
    required this.onRate,
    required this.onRemove,
  });

  final PosLine line;
  final VoidCallback onMinus;
  final VoidCallback onPlus;
  final VoidCallback onQty;
  final VoidCallback onRate;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final l = line;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: l.rate <= 0 ? AppColors.critical : AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(l.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
            ),
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: 'Remove',
              onPressed: onRemove,
              icon: Icon(Icons.close_rounded, size: 18, color: AppColors.inkMute),
            ),
          ]),
          if (l.batchNo.isNotEmpty || l.expDate.isNotEmpty)
            Text(
              [if (l.batchNo.isNotEmpty) 'Batch ${l.batchNo}', if (l.expDate.isNotEmpty) 'Exp ${l.expDate}']
                  .join('  ·  '),
              style: TextStyle(fontSize: 11, color: AppColors.inkMute),
            ),
          const SizedBox(height: 6),
          Row(children: [
            InkWell(
              onTap: onRate,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
                child: Row(children: [
                  Text('${fmtInr2(l.rate)} / ${l.unit}',
                      style: TextStyle(
                          fontSize: 12.5,
                          color: l.rate <= 0 ? AppColors.critical : AppColors.inkDim,
                          decoration: TextDecoration.underline,
                          decorationStyle: TextDecorationStyle.dotted)),
                  const SizedBox(width: 4),
                  Icon(Icons.edit_outlined, size: 13, color: AppColors.inkMute),
                ]),
              ),
            ),
            const Spacer(),
            _Stepper(qty: l.qty, onMinus: onMinus, onPlus: onPlus, onTap: onQty),
            const SizedBox(width: 10),
            SizedBox(
              width: 86,
              child: Text(fmtInr2(l.amount),
                  textAlign: TextAlign.right,
                  style: kTabular.copyWith(fontSize: 13.5, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(width: 8),
          ]),
        ],
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.qty, required this.onMinus, required this.onPlus, required this.onTap});
  final double qty;
  final VoidCallback onMinus;
  final VoidCallback onPlus;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    Widget btn(IconData i, VoidCallback f) => InkWell(
          onTap: f,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Icon(i, size: 17, color: AppColors.ink),
          ),
        );
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        btn(Icons.remove_rounded, onMinus),
        InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 30),
            child: Text(fmtQty(qty),
                textAlign: TextAlign.center,
                style: kTabular.copyWith(fontSize: 14, fontWeight: FontWeight.w700)),
          ),
        ),
        btn(Icons.add_rounded, onPlus),
      ]),
    );
  }
}

typedef _DraftBuilder = PosDraft Function(String method, double paidNow, String khataNote);

class _CheckoutSheet extends ConsumerStatefulWidget {
  const _CheckoutSheet({required this.totals, required this.hasBuyer, required this.buildDraft});
  final PosTotals totals;
  final bool hasBuyer;
  final _DraftBuilder buildDraft;

  @override
  ConsumerState<_CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends ConsumerState<_CheckoutSheet> {
  String _method = 'Cash';
  final _paidNow = TextEditingController();
  final _note = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _paidNow.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    // A credit sale with nobody to chase is a loss, not a sale on credit —
    // the web Khata needs a name or phone to track it.
    if (_method == 'Khata' && !widget.hasBuyer) {
      setState(() => _error = 'Khata (credit) needs the buyer\'s name or phone.');
      return;
    }
    final repo = ref.read(billingRepositoryProvider);
    if (repo == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await repo.createPosBill(
          widget.buildDraft(_method, parseAmount(_paidNow.text), _note.text));
      ref.invalidate(customersProvider);
      if (mounted) Navigator.of(context).pop(r);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final grand = widget.totals.grandTotal;
    final s = posSettlement(_method, grand, parseAmount(_paidNow.text));
    return PopScope(
      canPop: !_busy,
      child: Padding(
      padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.viewInsetsOf(context).bottom + 18),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('PAYMENT', style: kMicro),
            const SizedBox(height: 6),
            Text(fmtInr2(grand), style: kFigure),
            const SizedBox(height: 14),
            ChoiceRow(
              options: posPaymentMethods,
              selected: _method,
              onSelected: (m) => setState(() => _method = m),
            ),
            if (_method == 'Khata') ...[
              const SizedBox(height: 14),
              AmountField(
                controller: _paidNow,
                label: 'Paid now (rest goes on khata)',
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _note,
                decoration: const InputDecoration(labelText: 'Khata note (optional)', isDense: true),
              ),
              const SizedBox(height: 10),
              KvRow('Paid now', fmtInr2(s.amountPaid)),
              KvRow('On credit', fmtInr2(s.creditAmount), color: AppColors.critical),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: AppColors.critical, fontSize: 13)),
            ],
            const SizedBox(height: 18),
            BusyButton(
              label: 'Save bill',
              busy: _busy,
              icon: Icons.receipt_long_rounded,
              onPressed: _save,
            ),
          ],
        ),
      ),
      ),
    );
  }
}
