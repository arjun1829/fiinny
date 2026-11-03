import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/parse.dart';
import '../../widgets/form_bits.dart';
import 'customer.dart';
import 'customers_repository.dart';

/// Add / edit a partner — the fields of the web's B2B onboarding form
/// (OnboardingPage.tsx), with the same mobile-number rule. Editing changes
/// profile fields only; balances belong to billing and payments.
class CustomerFormScreen extends ConsumerStatefulWidget {
  const CustomerFormScreen({super.key, this.customer});
  final Customer? customer;

  @override
  ConsumerState<CustomerFormScreen> createState() => _CustomerFormScreenState();
}

class _CustomerFormScreenState extends ConsumerState<CustomerFormScreen> {
  final _form = GlobalKey<FormState>();
  late final CustomerDraft _d =
      widget.customer != null ? CustomerDraft.from(widget.customer!) : CustomerDraft();
  late final _name = TextEditingController(text: _d.name);
  late final _number = TextEditingController(text: _d.number);
  late final _email = TextEditingController(text: _d.email);
  late final _state = TextEditingController(text: _d.state);
  late final _district = TextEditingController(text: _d.district);
  late final _taluka = TextEditingController(text: _d.taluka);
  late final _atPost = TextEditingController(text: _d.atPost);
  late final _pin = TextEditingController(text: _d.pin);
  late final _address = TextEditingController(text: _d.fullAddress);
  late final _gstin = TextEditingController(text: _d.gstin);
  late final _license = TextEditingController(text: _d.licenseNumber);
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _number, _email, _state, _district, _taluka, _atPost, _pin, _address, _gstin, _license]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final repo = ref.read(customersRepositoryProvider);
    if (repo == null) return;
    setState(() => _busy = true);
    try {
      final dup = await repo.findByPhone(_number.text, exceptId: widget.customer?.id);
      if (dup != null && mounted) {
        final go = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Phone already used'),
            content: Text('${dup.name} already has this number. Two records for one person split '
                'their balance. Save anyway?'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
              TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save anyway')),
            ],
          ),
        );
        if (go != true) return;
      }
      _d
        ..name = _name.text
        ..number = _number.text
        ..email = _email.text
        ..state = _state.text
        ..district = _district.text
        ..taluka = _taluka.text
        ..atPost = _atPost.text
        ..pin = _pin.text
        ..fullAddress = _address.text
        ..gstin = _gstin.text
        ..licenseNumber = _license.text;
      await repo.save(_d, existing: widget.customer);
      if (mounted) {
        showInfo(context, widget.customer == null ? 'Customer added' : 'Customer updated');
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) showError(context, 'Could not save. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(TextEditingController c, String label,
      {String? Function(String?)? validator,
      TextInputType? keyboard,
      TextCapitalization caps = TextCapitalization.words}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: c,
        keyboardType: keyboard,
        textCapitalization: caps,
        decoration: InputDecoration(labelText: label, isDense: true),
        validator: validator,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.customer != null;
    return Scaffold(
      appBar: AppBar(title: Text(editing ? 'Edit customer' : 'New customer')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 30),
          children: [
            _field(_name, 'Business / customer name *',
                validator: (v) => (v ?? '').trim().isEmpty ? 'Required' : null),
            // Counter customers are often saved name-only by the POS; only
            // a B2B partner must carry a valid mobile (web onboarding rule).
            _field(_number, widget.customer?.isPosCustomer == true ? 'Contact number' : 'Contact number *',
                keyboard: TextInputType.phone,
                validator: (v) => widget.customer?.isPosCustomer == true && (v ?? '').trim().isEmpty
                    ? null
                    : contactNumberError(v ?? '')),
            _field(_email, 'Email', keyboard: TextInputType.emailAddress, caps: TextCapitalization.none),
            const FieldLabel('Address'),
            _field(_atPost, 'Village / At post'),
            Row(children: [
              Expanded(child: _field(_taluka, 'Taluka')),
              const SizedBox(width: 10),
              Expanded(child: _field(_district, 'District')),
            ]),
            Row(children: [
              Expanded(child: _field(_state, 'State')),
              const SizedBox(width: 10),
              Expanded(child: _field(_pin, 'PIN', keyboard: TextInputType.number)),
            ]),
            _field(_address, 'Full address (optional)', caps: TextCapitalization.sentences),
            const FieldLabel('Business details'),
            _field(_gstin, 'GSTIN (optional)',
                caps: TextCapitalization.characters, validator: (v) => gstinError(v ?? '')),
            _field(_license, 'Licence number (optional)', caps: TextCapitalization.characters),
          ],
        ),
      ),
      bottomNavigationBar: BottomActionBar(
        child: BusyButton(label: editing ? 'Save changes' : 'Add customer', busy: _busy, onPressed: _save),
      ),
    );
  }
}
