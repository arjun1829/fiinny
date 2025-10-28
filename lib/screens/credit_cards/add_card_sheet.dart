import 'package:flutter/material.dart';

import '../../models/credit_card_model.dart';
import '../../services/credit_card_service.dart';

class AddCardSheet extends StatefulWidget {
  const AddCardSheet({super.key, required this.userId});

  final String userId;

  @override
  State<AddCardSheet> createState() => _AddCardSheetState();
}

class _AddCardSheetState extends State<AddCardSheet> {
  final _form = GlobalKey<FormState>();
  final _svc = CreditCardService();

  final _bankCtrl = TextEditingController();
  final _last4Ctrl = TextEditingController();
  final _aliasCtrl = TextEditingController();
  final _issuerEmailsCtrl = TextEditingController();

  String _cardType = 'Visa';
  PdfPassFormat _passFmt = PdfPassFormat.none;
  bool _setDueNow = false;
  DateTime _dueDate = DateTime.now().add(const Duration(days: 20));

  @override
  void dispose() {
    _bankCtrl.dispose();
    _last4Ctrl.dispose();
    _aliasCtrl.dispose();
    _issuerEmailsCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDue() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _dueDate,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (d != null) setState(() => _dueDate = d);
  }

  @override
  Widget build(BuildContext context) {
    final banks = <String>[
      'HDFC Bank',
      'ICICI Bank',
      'Axis Bank',
      'SBI Card',
      'Kotak',
      'IDFC FIRST Bank',
      'IndusInd Bank',
      'OneCard',
      'Standard Chartered',
      'HSBC',
    ];

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Add Credit Card',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: banks.first,
                  items: banks
                      .map((b) => DropdownMenuItem(value: b, child: Text(b)))
                      .toList(),
                  decoration: const InputDecoration(labelText: 'Bank'),
                  onChanged: (v) {
                    _bankCtrl.text = v ?? '';
                  },
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _bankCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Bank (or custom issuer)',
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: _cardType,
                  items: const [
                    DropdownMenuItem(value: 'Visa', child: Text('Visa')),
                    DropdownMenuItem(
                        value: 'Mastercard', child: Text('Mastercard')),
                    DropdownMenuItem(value: 'RuPay', child: Text('RuPay')),
                    DropdownMenuItem(value: 'Amex', child: Text('Amex')),
                  ],
                  decoration: const InputDecoration(labelText: 'Network'),
                  onChanged: (v) => setState(() => _cardType = v ?? 'Visa'),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _last4Ctrl,
                  decoration:
                      const InputDecoration(labelText: 'Last 4 digits'),
                  keyboardType: TextInputType.number,
                  maxLength: 4,
                  validator: (v) {
                    if (v == null || v.length != 4) return 'Enter 4 digits';
                    if (int.tryParse(v) == null) return 'Digits only';
                    return null;
                  },
                ),
                const SizedBox(height: 4),
                TextFormField(
                  controller: _aliasCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Alias (optional)'),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<PdfPassFormat>(
                  value: _passFmt,
                  items: const [
                    DropdownMenuItem(
                      value: PdfPassFormat.none,
                      child: Text('PDF password: None/Unknown'),
                    ),
                    DropdownMenuItem(
                      value: PdfPassFormat.first4name_ddmm,
                      child: Text('first4 name + DDMM'),
                    ),
                    DropdownMenuItem(
                      value: PdfPassFormat.first4name_ddmmyyyy,
                      child: Text('first4 name + DDMMYYYY'),
                    ),
                    DropdownMenuItem(
                      value: PdfPassFormat.dob_ddmm,
                      child: Text('DOB DDMM'),
                    ),
                    DropdownMenuItem(
                      value: PdfPassFormat.dob_ddmmyyyy,
                      child: Text('DOB DDMMYYYY'),
                    ),
                    DropdownMenuItem(
                      value: PdfPassFormat.issuer_last4,
                      child: Text('Issuer + last4 / last4'),
                    ),
                    DropdownMenuItem(
                      value: PdfPassFormat.custom,
                      child: Text('Custom (set server-side)'),
                    ),
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Statement PDF password format',
                  ),
                  onChanged: (v) => setState(() => _passFmt = v ?? PdfPassFormat.none),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _issuerEmailsCtrl,
                  decoration: const InputDecoration(
                    labelText:
                        'Issuer email senders (comma-separated, optional)',
                    hintText:
                        'e.g., statements@sbicard.com, cc.statements@axisbank.com',
                  ),
                ),
                const SizedBox(height: 10),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  value: _setDueNow,
                  title: const Text('Set due date now'),
                  onChanged: (v) => setState(() => _setDueNow = v),
                ),
                if (_setDueNow) ...[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Due date'),
                    subtitle: Text(
                      '${_dueDate.day}/${_dueDate.month}/${_dueDate.year}',
                    ),
                    trailing: const Icon(Icons.event),
                    onTap: _pickDue,
                  ),
                ],
                const SizedBox(height: 14),
                FilledButton.icon(
                  icon: const Icon(Icons.save),
                  label: const Text('Save Card'),
                  onPressed: () async {
                    if (!_form.currentState!.validate()) return;
                    final bank = _bankCtrl.text.trim();
                    final l4 = _last4Ctrl.text.trim();
                    final id = '${bank.replaceAll(' ', '').toLowerCase()}-$l4';

                    final card = CreditCardModel(
                      id: id,
                      bankName: bank,
                      cardType: _cardType,
                      last4Digits: l4,
                      cardholderName: 'You',
                      statementDate: null,
                      dueDate: _setDueNow
                          ? _dueDate
                          : DateTime.now().add(const Duration(days: 20)),
                      totalDue: 0,
                      minDue: 0,
                      isPaid: false,
                      cardAlias: _aliasCtrl.text.trim().isEmpty
                          ? null
                          : _aliasCtrl.text.trim(),
                      issuerEmails: _issuerEmailsCtrl.text
                          .split(',')
                          .map((e) => e.trim())
                          .where((e) => e.isNotEmpty)
                          .toList(),
                      pdfPassFormat: _passFmt,
                    );
                    await _svc.saveCard(widget.userId, card);
                    if (context.mounted) {
                      Navigator.pop(context, true);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Card added')),
                      );
                    }
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
