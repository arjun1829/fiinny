import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../billing/bill_detail_screen.dart';
import '../billing/billing_math.dart';
import '../customers/customers_repository.dart';

/// Digital Khata's table — every counter (non-B2B) bill rolled up per
/// customer, live. Same source and grouping as DigitalKhataPage.tsx, so the
/// totals here and on the web are the same numbers.
final khataProvider = StreamProvider.autoDispose<List<KhataCustomer>>((ref) {
  final user = ref.watch(appUserProvider).valueOrNull;
  if (user == null) return Stream.value(const []);
  return tenantCollection(ref.watch(firestoreProvider), user.tenantId, 'salesOrders')
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map((s) => groupKhata(
          s.docs.map((d) => (id: d.id, data: d.data())), tsToDate));
});

enum _KhataFilter { all, pending, partial, paid }

class KhataScreen extends ConsumerStatefulWidget {
  const KhataScreen({super.key});

  @override
  ConsumerState<KhataScreen> createState() => _KhataScreenState();
}

class _KhataScreenState extends ConsumerState<KhataScreen> {
  String _q = '';
  _KhataFilter _filter = _KhataFilter.pending;

  static const _labels = {
    _KhataFilter.pending: 'Has dues',
    _KhataFilter.partial: 'Partial',
    _KhataFilter.paid: 'Paid',
    _KhataFilter.all: 'All',
  };

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(appUserProvider).valueOrNull;
    final async = ref.watch(khataProvider);
    final all = async.valueOrNull ?? const <KhataCustomer>[];
    final q = _q.trim().toLowerCase();
    final digits = phoneKey(_q);
    final list = all.where((c) {
      switch (_filter) {
        case _KhataFilter.pending:
          if (c.outstanding <= 0) return false;
        case _KhataFilter.partial:
          if (c.status != 'Partial') return false;
        case _KhataFilter.paid:
          if (c.outstanding > 0) return false;
        case _KhataFilter.all:
          break;
      }
      if (q.isEmpty) return true;
      return c.name.toLowerCase().contains(q) ||
          (digits.length >= 3 && phoneKey(c.phone).contains(digits)) ||
          c.bills.any((b) => b.number.toLowerCase().contains(q));
    }).toList();
    if (_filter == _KhataFilter.pending) {
      list.sort((a, b) => b.outstanding.compareTo(a.outstanding));
    }
    final billed = list.fold<double>(0, (s, c) => s + c.total);
    final paid = list.fold<double>(0, (s, c) => s + c.paid);
    final due = list.fold<double>(0, (s, c) => s + c.outstanding);
    final bills = list.fold<int>(0, (s, c) => s + c.bills.length);
    final canWrite = user?.can.canCollectKhata ?? false;

    return Scaffold(
      appBar: AppBar(title: const Text('Khata (Udhari)')),
      floatingActionButton: canWrite
          ? FloatingActionButton.extended(
              heroTag: 'add-udhari',
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                showDragHandle: true,
                enableDrag: false,
                builder: (_) => const AddUdhariSheet(),
              ),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add Udhari'),
            )
          : null,
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: KpiCard(label: 'Outstanding', value: fmtInrCompact(due), accent: AppColors.critical, sub: '${list.length} customers')),
              const SizedBox(width: 10),
              Expanded(child: KpiCard(label: 'Billed', value: fmtInrCompact(billed), sub: '$bills bills · paid ${fmtInrCompact(paid)}')),
            ]),
            const SizedBox(height: 10),
            TextField(
              style: TextStyle(fontSize: 14, color: AppColors.ink),
              decoration: const InputDecoration(
                hintText: 'Search customer, phone or bill no.',
                prefixIcon: Icon(Icons.search, size: 19),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _q = v),
            ),
            const SizedBox(height: 10),
            ChoiceRow(
              options: _labels.values.toList(),
              selected: _labels[_filter]!,
              onSelected: (s) => setState(
                  () => _filter = _labels.entries.firstWhere((e) => e.value == s).key),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        Expanded(
          child: async.isLoading
              ? const Center(child: CircularProgressIndicator())
              : async.hasError
                  ? Center(child: Text('Could not load the khata.', style: TextStyle(color: AppColors.inkMute)))
                  : list.isEmpty
                      ? Center(child: Text('Nothing here', style: TextStyle(color: AppColors.inkMute)))
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(14, 0, 14, 100),
                          itemCount: list.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (_, i) => _KhataRow(c: list[i]),
                        ),
        ),
      ]),
    );
  }
}

Color _statusColor(String s) => switch (s) {
      'Paid' => AppColors.good,
      'Partial' => AppColors.warning,
      _ => AppColors.critical,
    };

class _KhataRow extends StatelessWidget {
  const _KhataRow({required this.c});
  final KhataCustomer c;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (_) => FractionallySizedBox(heightFactor: 0.88, child: _KhataCustomerSheet(customerKey: c.key)),
        ),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: AppColors.ink)),
                const SizedBox(height: 3),
                Text(
                  [if (c.phone.isNotEmpty) c.phone, '${c.bills.length} bills', 'last ${fmtDayMonth(c.lastActivity)}']
                      .join('  ·  '),
                  style: TextStyle(fontSize: 11.5, color: AppColors.inkMute),
                ),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(c.outstanding > 0 ? fmtInr(c.outstanding) : fmtInr(c.total),
                  style: kTabular.copyWith(fontSize: 13.5, color: c.outstanding > 0 ? AppColors.critical : AppColors.ink)),
              Text(c.status.toUpperCase(), style: kMicro.copyWith(color: _statusColor(c.status))),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _KhataCustomerSheet extends ConsumerWidget {
  const _KhataCustomerSheet({required this.customerKey});
  final String customerKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(appUserProvider).valueOrNull;
    final c = (ref.watch(khataProvider).valueOrNull ?? const <KhataCustomer>[])
        .where((x) => x.key == customerKey)
        .firstOrNull;
    if (c == null) return const Center(child: Text('Customer not found'));
    final canWrite = user?.can.canCollectKhata ?? false;

    void remind() {
      final p = phoneKey(c.phone);
      final text = 'Namaste ${c.name}, your khata balance with ${user?.businessName ?? ''} '
          'is ${fmtInr2(c.outstanding)}. Kindly arrange payment.';
      launchUrl(Uri.parse('https://wa.me/${p.length == 10 ? '91$p' : p}?text=${Uri.encodeComponent(text)}'),
          mode: LaunchMode.externalApplication);
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(c.name, style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.ink)),
        if (c.phone.isNotEmpty || c.address.isNotEmpty)
          Text([c.phone, c.address].where((s) => s.isNotEmpty).join('  ·  '),
              style: TextStyle(fontSize: 12.5, color: AppColors.inkDim)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: KpiCard(label: 'Outstanding', value: fmtInr(c.outstanding),
              accent: c.outstanding > 0 ? AppColors.critical : AppColors.good)),
          const SizedBox(width: 10),
          Expanded(child: KpiCard(label: 'Billed', value: fmtInr(c.total), sub: 'paid ${fmtInr(c.paid)}')),
        ]),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, children: [
          if (canWrite && c.outstanding > 0)
            FilledButton.icon(
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                showDragHandle: true,
                enableDrag: false,
                builder: (_) => _CollectSheet(c: c),
              ),
              icon: const Icon(Icons.payments_rounded, size: 18),
              label: const Text('Collect'),
            ),
          if (c.phone.isNotEmpty && c.outstanding > 0)
            OutlinedButton.icon(
              onPressed: remind,
              icon: const Icon(Icons.chat_rounded, size: 18),
              label: const Text('Remind'),
            ),
          if (c.phone.isNotEmpty)
            OutlinedButton.icon(
              onPressed: () => launchUrl(Uri(scheme: 'tel', path: c.phone)),
              icon: const Icon(Icons.call_rounded, size: 18),
              label: const Text('Call'),
            ),
          if (canWrite)
            OutlinedButton.icon(
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                showDragHandle: true,
                enableDrag: false,
                builder: (_) => AddUdhariSheet(name: c.name, phone: c.phone, address: c.address, pin: c.pin),
              ),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Udhari'),
            ),
        ]),
        const SectionTitle('Bills'),
        Expanded(
          child: ListView.separated(
            itemCount: c.bills.length,
            separatorBuilder: (_, __) => const SizedBox(height: 6),
            itemBuilder: (_, i) {
              final b = c.bills[i];
              return Material(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(12),
                child: ListTile(
                  dense: true,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12), side: BorderSide(color: AppColors.border)),
                  title: Text('${b.number}${b.isManual ? '  · udhari' : ''}',
                      style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
                  subtitle: Text(fmtFullDate(b.date), style: TextStyle(fontSize: 11.5, color: AppColors.inkMute)),
                  trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(fmtInr2(b.total), style: kTabular.copyWith(fontSize: 13)),
                    Text(b.outstanding > 0 ? 'DUE ${fmtInr(b.outstanding)}' : 'PAID',
                        style: kMicro.copyWith(color: b.outstanding > 0 ? AppColors.critical : AppColors.good)),
                  ]),
                  onTap: () => Navigator.of(context)
                      .push(MaterialPageRoute(builder: (_) => BillDetailScreen(orderId: b.id))),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}

class _CollectSheet extends ConsumerStatefulWidget {
  const _CollectSheet({required this.c});
  final KhataCustomer c;

  @override
  ConsumerState<_CollectSheet> createState() => _CollectSheetState();
}

class _CollectSheetState extends ConsumerState<_CollectSheet> {
  final _amount = TextEditingController();
  final _ref = TextEditingController();
  final _notes = TextEditingController();
  String _method = 'Cash';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _ref.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final amt = parseAmount(_amount.text);
    if (amt <= 0) return setState(() => _error = 'Enter an amount above zero.');
    if (amt > widget.c.outstanding + 0.005) {
      return setState(() => _error = 'Khata due is only ${fmtInr2(widget.c.outstanding)}.');
    }
    final repo = ref.read(customersRepositoryProvider);
    if (repo == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final applied = await repo.collectKhataOnBills(
        billIds: [for (final b in widget.c.bills) if (b.outstanding > 0) b.id],
        customerName: widget.c.name,
        entityId: widget.c.key,
        amount: amt,
        method: _method,
        date: DateTime.now(),
        transactionRef: _ref.text,
        notes: _notes.text,
      );
      if (!mounted) return;
      showInfo(context, 'Collected ${fmtInr2(applied)}');
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) setState(() => _error = 'Payment NOT saved. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_busy,
      child: Padding(
        padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.viewInsetsOf(context).bottom + 18),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('COLLECT KHATA', style: kMicro),
            Text(widget.c.name, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.ink)),
            Text('Due ${fmtInr2(widget.c.outstanding)}', style: TextStyle(color: AppColors.critical, fontSize: 12.5)),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: AmountField(controller: _amount, label: 'Amount received', autofocus: true)),
              TextButton(onPressed: () => _amount.text = editNum(round2(widget.c.outstanding)), child: const Text('Full')),
            ]),
            const SizedBox(height: 12),
            ChoiceRow(options: paymentMethods, selected: _method, onSelected: (m) => setState(() => _method = m)),
            if (_method != 'Cash') ...[
              const SizedBox(height: 10),
              TextField(controller: _ref, decoration: const InputDecoration(labelText: 'UTR / reference no.', isDense: true)),
            ],
            const SizedBox(height: 10),
            TextField(controller: _notes, decoration: const InputDecoration(labelText: 'Notes (optional)', isDense: true)),
            const SizedBox(height: 6),
            Text('Applied to the oldest unpaid bills first, same as Digital Khata on the web.',
                style: TextStyle(fontSize: 11, color: AppColors.inkMute)),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: TextStyle(color: AppColors.critical, fontSize: 13)),
            ],
            const SizedBox(height: 14),
            BusyButton(label: 'Save payment', busy: _busy, icon: Icons.payments_rounded, onPressed: _save),
          ]),
        ),
      ),
    );
  }
}

/// "Add Udhari" — a manual credit entry (old paper khata, a sale made
/// elsewhere). Pre-filled when opened from a customer.
class AddUdhariSheet extends ConsumerStatefulWidget {
  const AddUdhariSheet({super.key, this.name = '', this.phone = '', this.address = '', this.pin = ''});
  final String name;
  final String phone;
  final String address;
  final String pin;

  @override
  ConsumerState<AddUdhariSheet> createState() => _AddUdhariSheetState();
}

class _AddUdhariSheetState extends ConsumerState<AddUdhariSheet> {
  late final _name = TextEditingController(text: widget.name);
  late final _phone = TextEditingController(text: phoneKey(widget.phone));
  late final _address = TextEditingController(text: widget.address);
  late final _pin = TextEditingController(text: widget.pin);
  final _bill = TextEditingController();
  final _paid = TextEditingController();
  final _note = TextEditingController();
  DateTime _date = DateTime.now();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _phone, _address, _pin, _bill, _paid, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final bill = parseAmount(_bill.text);
    if (_name.text.trim().isEmpty) return setState(() => _error = 'Customer name is required.');
    if (bill <= 0) return setState(() => _error = 'Bill amount must be greater than 0.');
    final ph = _phone.text.trim();
    if (ph.isNotEmpty && contactNumberError(ph) != null) {
      return setState(() => _error = 'Enter a valid 10-digit mobile number (or leave it blank).');
    }
    final repo = ref.read(customersRepositoryProvider);
    if (repo == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await repo.addUdhari(
        name: _name.text,
        phone: ph,
        address: _address.text,
        pin: _pin.text,
        billAmount: bill,
        paidAmount: parseAmount(_paid.text),
        date: _date,
        note: _note.text,
      );
      if (!mounted) return;
      showInfo(context, 'Udhari saved');
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) setState(() => _error = 'Not saved. ${e is ArgumentError ? e.message : 'Check your connection and try again.'}');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locked = widget.name.isNotEmpty;
    return PopScope(
      canPop: !_busy,
      child: Padding(
        padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.viewInsetsOf(context).bottom + 18),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('ADD UDHARI', style: kMicro),
            const SizedBox(height: 10),
            TextField(
              controller: _name,
              enabled: !locked,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Customer name *', isDense: true),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _phone,
              enabled: !locked || widget.phone.isEmpty,
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
              decoration: const InputDecoration(labelText: 'Mobile (optional)', isDense: true),
            ),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(flex: 3, child: TextField(controller: _address, decoration: const InputDecoration(labelText: 'Village / address', isDense: true))),
              const SizedBox(width: 10),
              Expanded(flex: 2, child: TextField(controller: _pin, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'PIN', isDense: true))),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: AmountField(controller: _bill, label: 'Bill amount *')),
              const SizedBox(width: 10),
              Expanded(child: AmountField(controller: _paid, label: 'Paid now')),
            ]),
            const SizedBox(height: 10),
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () async {
                final d = await showDatePicker(
                    context: context, initialDate: _date, firstDate: DateTime(2018), lastDate: DateTime.now());
                if (d != null) setState(() => _date = d);
              },
              child: InputDecorator(
                decoration: const InputDecoration(labelText: 'Bill date', isDense: true, suffixIcon: Icon(Icons.event, size: 18)),
                child: Text(fmtFullDate(_date)),
              ),
            ),
            const SizedBox(height: 10),
            TextField(controller: _note, decoration: const InputDecoration(labelText: 'Note (optional)', isDense: true)),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: TextStyle(color: AppColors.critical, fontSize: 13)),
            ],
            const SizedBox(height: 14),
            BusyButton(label: 'Save udhari', busy: _busy, icon: Icons.menu_book_rounded, onPressed: _save),
            const SizedBox(height: 6),
            Text('Records credit only — stock is not changed. Use POS bill for goods sold today.',
                style: TextStyle(fontSize: 11, color: AppColors.inkMute)),
          ]),
        ),
      ),
    );
  }
}
