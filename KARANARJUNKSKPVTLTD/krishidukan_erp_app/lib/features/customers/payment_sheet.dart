import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../widgets/form_bits.dart';
import 'customer.dart';
import 'customers_repository.dart';

/// Records money received from a customer. Partners → payments subcollection
/// + retailer totals (Worklist "Record payment"); counter customers →
/// applied to their open khata bills oldest-first (Digital Khata). Pops true
/// once saved.
class PaymentSheet extends ConsumerStatefulWidget {
  const PaymentSheet({super.key, required this.customer, required this.outstanding});
  final Customer customer;
  final double outstanding;

  @override
  ConsumerState<PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends ConsumerState<PaymentSheet> {
  final _amount = TextEditingController();
  final _ref = TextEditingController();
  final _account = TextEditingController();
  final _notes = TextEditingController();
  String _method = 'Cash';
  DateTime _date = DateTime.now();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_amount, _ref, _account, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final amount = parseAmount(_amount.text);
    if (amount <= 0) {
      setState(() => _error = 'Enter an amount above zero.');
      return;
    }
    // A partner can legitimately pay ahead (it stays unallocated, as on the
    // web); a khata payment can only settle what is owed.
    if (widget.customer.isPosCustomer && amount > widget.outstanding + 0.005) {
      setState(() => _error = 'Khata due is only ${fmtInr2(widget.outstanding)}.');
      return;
    }
    if (!widget.customer.isPosCustomer && amount > widget.outstanding + 0.005) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('More than outstanding'),
          content: Text('${fmtInr2(amount)} is more than the due ${fmtInr2(widget.outstanding)}. '
              'Record it as an advance?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Change')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Record')),
          ],
        ),
      );
      if (ok != true) return;
    }
    final repo = ref.read(customersRepositoryProvider);
    if (repo == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (widget.customer.isPosCustomer) {
        final applied = await repo.collectKhataPayment(
          c: widget.customer,
          amount: amount,
          method: _method,
          date: _date,
          transactionRef: _ref.text,
          notes: _notes.text,
        );
        if (!mounted) return;
        showInfo(context, 'Collected ${fmtInr2(applied)} against khata bills');
      } else {
        final id = await repo.recordPartnerPayment(
          c: widget.customer,
          amount: amount,
          method: _method,
          date: _date,
          accountName: _account.text,
          transactionRef: _ref.text,
          notes: _notes.text,
        );
        if (!mounted) return;
        showInfo(context, 'Payment $id recorded');
      }
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().contains('unavailable')
            ? 'No internet connection — payment NOT saved.'
            : 'Could not save the payment. Nothing was recorded. ($e)');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final khata = widget.customer.isPosCustomer;
    return PopScope(
      canPop: !_busy,
      child: Padding(
        padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.viewInsetsOf(context).bottom + 18),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(khata ? 'COLLECT KHATA PAYMENT' : 'RECORD PAYMENT', style: kMicro),
            const SizedBox(height: 4),
            Text(widget.customer.name,
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.ink)),
            Text('Outstanding ${fmtInr2(widget.outstanding)}',
                style: TextStyle(fontSize: 12.5, color: AppColors.critical)),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(child: AmountField(controller: _amount, label: 'Amount received', autofocus: true)),
              const SizedBox(width: 8),
              TextButton(
                onPressed: () => _amount.text = editNum(widget.outstanding),
                child: const Text('Full'),
              ),
            ]),
            const SizedBox(height: 12),
            ChoiceRow(options: paymentMethods, selected: _method, onSelected: (m) => setState(() => _method = m)),
            const SizedBox(height: 12),
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () async {
                final d = await showDatePicker(
                  context: context,
                  initialDate: _date,
                  firstDate: DateTime(2020),
                  lastDate: DateTime.now(),
                );
                if (d != null) setState(() => _date = d);
              },
              child: InputDecorator(
                decoration: const InputDecoration(
                    labelText: 'Payment date', isDense: true, suffixIcon: Icon(Icons.event, size: 18)),
                child: Text(fmtFullDate(_date)),
              ),
            ),
            if (_method != 'Cash') ...[
              const SizedBox(height: 10),
              TextField(
                controller: _ref,
                decoration: const InputDecoration(labelText: 'UTR / cheque / reference no.', isDense: true),
              ),
              if (!khata) ...[
                const SizedBox(height: 10),
                TextField(
                  controller: _account,
                  decoration: const InputDecoration(labelText: 'Received in account (optional)', isDense: true),
                ),
              ],
            ],
            const SizedBox(height: 10),
            TextField(
              controller: _notes,
              decoration: const InputDecoration(labelText: 'Notes (optional)', isDense: true),
            ),
            if (khata) ...[
              const SizedBox(height: 8),
              Text('Applied to the oldest unpaid bills first, same as Digital Khata on the web.',
                  style: TextStyle(fontSize: 11, color: AppColors.inkMute)),
            ],
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: TextStyle(color: AppColors.critical, fontSize: 13)),
            ],
            const SizedBox(height: 16),
            BusyButton(label: 'Save payment', busy: _busy, icon: Icons.payments_rounded, onPressed: _save),
          ]),
        ),
      ),
    );
  }
}
