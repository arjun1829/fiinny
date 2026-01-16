// lib/details/recurring/add_recurring_sheet.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class AddRecurringDraft {
  final String title;
  final String type; // 'subscription' | 'emi' | 'reminder'
  final double amount;
  final String cycle; // 'monthly' | 'weekly' | 'yearly'
  final int? dayOfMonth; // for monthly cycles
  final DateTime startDate;
  final DateTime? endDate;
  final DateTime nextDue;
  final String? note;

  AddRecurringDraft({
    required this.title,
    required this.type,
    required this.amount,
    required this.cycle,
    required this.startDate,
    required this.nextDue,
    this.dayOfMonth,
    this.endDate,
    this.note,
  });
}

class AddRecurringSheet extends StatefulWidget {
  final String userPhone;
  final String friendId;

  const AddRecurringSheet({
    super.key,
    required this.userPhone,
    required this.friendId,
  });

  @override
  State<AddRecurringSheet> createState() => _AddRecurringSheetState();
}

class _AddRecurringSheetState extends State<AddRecurringSheet> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _amount = TextEditingController();
  final _note = TextEditingController();

  String _type = 'subscription';
  String _cycle = 'monthly';
  int? _dayOfMonth = DateTime.now().day;
  DateTime _start = DateTime.now();
  DateTime? _end;

  DateTime _computeNextDue() {
    if (_cycle == 'monthly') {
      final day = (_dayOfMonth ?? _start.day).clamp(1, 28);
      final base = DateTime(_start.year, _start.month, day);
      return base.isAfter(DateTime.now())
          ? base
          : DateTime(base.year, base.month + 1, day);
    } else if (_cycle == 'weekly') {
      final base = DateTime(_start.year, _start.month, _start.day);
      return base.isAfter(DateTime.now())
          ? base
          : base.add(const Duration(days: 7));
    } else {
      // yearly
      final base = DateTime(_start.year, _start.month, _start.day);
      return base.isAfter(DateTime.now())
          ? base
          : DateTime(base.year + 1, base.month, base.day);
    }
  }

  Future<void> _pickDate({
    required DateTime initial,
    required ValueChanged<DateTime> onPicked,
  }) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) onPicked(picked);
  }

  void _submit() {
    if (!_form.currentState!.validate()) return;

    final amt = double.tryParse(_amount.text.trim()) ?? 0.0;
    final draft = AddRecurringDraft(
      title: _title.text.trim(),
      type: _type,
      amount: amt,
      cycle: _cycle,
      startDate: _start,
      endDate: _end,
      dayOfMonth: _cycle == 'monthly' ? _dayOfMonth : null,
      nextDue: _computeNextDue(),
      note: _note.text.trim().isEmpty ? null : _note.text.trim(),
    );

    Navigator.pop(context, draft);
  }

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('dd MMM yyyy');

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        top: 12,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  height: 4,
                  width: 44,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              const Text('Add Recurring',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              const SizedBox(height: 12),
              TextFormField(
                controller: _title,
                decoration: const InputDecoration(labelText: 'Title'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Amount'),
                validator: (v) =>
                    (v == null || double.tryParse(v.trim()) == null)
                        ? 'Enter a number'
                        : null,
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _type,
                decoration: const InputDecoration(labelText: 'Type'),
                items: const [
                  DropdownMenuItem(
                      value: 'subscription', child: Text('Subscription')),
                  DropdownMenuItem(value: 'emi', child: Text('EMI / Loan')),
                  DropdownMenuItem(
                      value: 'reminder', child: Text('Reminder / Other')),
                ],
                onChanged: (v) => setState(() => _type = v ?? 'subscription'),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _cycle,
                decoration: const InputDecoration(labelText: 'Cycle'),
                items: const [
                  DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
                  DropdownMenuItem(value: 'weekly', child: Text('Weekly')),
                  DropdownMenuItem(value: 'yearly', child: Text('Yearly')),
                ],
                onChanged: (v) => setState(() => _cycle = v ?? 'monthly'),
              ),
              if (_cycle == 'monthly')
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: TextFormField(
                    initialValue:
                        (_dayOfMonth ?? DateTime.now().day).toString(),
                    decoration:
                        const InputDecoration(labelText: 'Billing day (1–28)'),
                    keyboardType: TextInputType.number,
                    onChanged: (v) =>
                        _dayOfMonth = int.tryParse(v)?.clamp(1, 28),
                  ),
                ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Start date'),
                      subtitle: Text(df.format(_start)),
                      trailing: const Icon(Icons.calendar_month),
                      onTap: () => _pickDate(
                        initial: _start,
                        onPicked: (d) => setState(() => _start = d),
                      ),
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  Expanded(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('End date (optional)'),
                      subtitle: Text(_end == null ? '—' : df.format(_end!)),
                      trailing: const Icon(Icons.event_busy),
                      onTap: () => _pickDate(
                        initial: _end ?? _start,
                        onPicked: (d) => setState(() => _end = d),
                      ),
                      onLongPress: () => setState(() => _end = null),
                    ),
                  ),
                ],
              ),
              TextFormField(
                controller: _note,
                decoration: const InputDecoration(labelText: 'Note (optional)'),
                maxLines: 2,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _submit,
                      icon: const Icon(Icons.check),
                      label: const Text('Save'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
