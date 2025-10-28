// lib/details/subs_bills/add_subscription_basic_screen.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:lifemap/details/services/subscriptions_service.dart';
import 'package:lifemap/models/subscription_item.dart';

import 'add_subs_custom_reminder_sheet.dart';

class AddSubscriptionBasicScreen extends StatefulWidget {
  final String userPhone;
  final UserSubscriptionsService service;

  const AddSubscriptionBasicScreen({
    super.key,
    required this.userPhone,
    required this.service,
  });

  @override
  State<AddSubscriptionBasicScreen> createState() =>
      _AddSubscriptionBasicScreenState();
}

class _AddSubscriptionBasicScreenState
    extends State<AddSubscriptionBasicScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _provider = TextEditingController();
  final _plan = TextEditingController();
  final _note = TextEditingController();
  final _amount = TextEditingController();

  String _frequency = 'monthly';
  int? _customInterval;
  DateTime _firstDue = DateTime.now();
  bool _autopay = false;

  int? _reminderDaysBefore;
  TimeOfDay? _reminderTime;

  bool _saving = false;

  String? get _reminderTimeValue =>
      _reminderTime == null ? null : _formatTimeOfDay(_reminderTime!);

  String _formatTimeOfDay(TimeOfDay time) {
    final h = time.hour.toString().padLeft(2, '0');
    final m = time.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  @override
  void dispose() {
    _title.dispose();
    _provider.dispose();
    _plan.dispose();
    _note.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _firstDue,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 5),
    );
    if (picked != null) {
      setState(() => _firstDue = picked);
    }
  }

  Future<void> _pickReminder() async {
    final result = await showModalBottomSheet<ReminderSelection>(
      context: context,
      isScrollControlled: true,
      builder: (_) => AddSubsCustomReminderSheet(
        initial: ReminderSelection(
          daysBefore: _reminderDaysBefore,
          timeOfDay: _reminderTime,
        ),
      ),
    );
    if (result != null) {
      setState(() {
        _reminderDaysBefore = result.daysBefore;
        _reminderTime = result.timeOfDay;
      });
    }
  }

  String get _formattedDate => DateFormat('EEE, d MMM').format(_firstDue);

  String get _reminderLabel {
    if (_reminderDaysBefore == null && _reminderTime == null) {
      return 'No reminder';
    }
    final buffer = StringBuffer();
    if (_reminderDaysBefore != null) {
      final days = _reminderDaysBefore!;
      if (days == 0) {
        buffer.write('On the day');
      } else {
        buffer.write('$days day${days == 1 ? '' : 's'} before');
      }
    }
    if (_reminderTime != null) {
      if (buffer.isNotEmpty) buffer.write(', ');
      buffer.write(_reminderTime!.format(context));
    }
    return buffer.toString();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final amount = double.tryParse(_amount.text.replaceAll(',', '')) ?? 0;
      final item = SubscriptionItem(
        title: _title.text.trim(),
        amount: amount,
        type: 'subscription',
        frequency: _frequency,
        intervalDays: _frequency == 'custom' ? _customInterval : null,
        anchorDate: DateTime(_firstDue.year, _firstDue.month, _firstDue.day),
        nextDueAt: DateTime(_firstDue.year, _firstDue.month, _firstDue.day),
        autopay: _autopay,
        provider: _provider.text.trim().isEmpty ? null : _provider.text.trim(),
        plan: _plan.text.trim().isEmpty ? null : _plan.text.trim(),
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
        reminderDaysBefore: _reminderDaysBefore,
        reminderTime: _reminderTimeValue,
      );

      await widget.service.addSubscription(
        userPhone: widget.userPhone,
        item: item,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (err) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save subscription: $err')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
    return Scaffold(
      appBar: AppBar(
        title: const Text('New Subscription'),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              TextFormField(
                controller: _title,
                decoration: const InputDecoration(
                  labelText: 'Subscription name',
                  hintText: 'Netflix, Spotify…',
                ),
                textCapitalization: TextCapitalization.words,
                validator: (value) =>
                    value == null || value.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _provider,
                decoration: const InputDecoration(
                  labelText: 'Provider (optional)',
                ),
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _plan,
                decoration: const InputDecoration(
                  labelText: 'Plan / Variant (optional)',
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _amount,
                decoration: InputDecoration(
                  labelText: 'Amount per cycle',
                  prefixText: '${currency.currencySymbol} ',
                ),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                validator: (value) {
                  final parsed = double.tryParse((value ?? '').replaceAll(',', ''));
                  if (parsed == null || parsed <= 0) {
                    return 'Enter a valid amount';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 24),
              Text(
                'Billing frequency',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final freq in ['monthly', 'yearly', 'weekly', 'daily', 'custom'])
                    ChoiceChip(
                      label: Text(freq[0].toUpperCase() + freq.substring(1)),
                      selected: _frequency == freq,
                      onSelected: (selected) {
                        if (!selected) return;
                        setState(() {
                          _frequency = freq;
                          if (freq != 'custom') _customInterval = null;
                        });
                      },
                    ),
                ],
              ),
              if (_frequency == 'custom') ...[
                const SizedBox(height: 12),
                TextFormField(
                  decoration: const InputDecoration(
                    labelText: 'Every N days',
                  ),
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: false),
                  onChanged: (value) {
                    final parsed = int.tryParse(value);
                    setState(() => _customInterval = parsed);
                  },
                  validator: (value) {
                    if (_frequency != 'custom') return null;
                    final parsed = int.tryParse(value ?? '');
                    if (parsed == null || parsed <= 0) {
                      return 'Enter a valid interval';
                    }
                    return null;
                  },
                ),
              ],
              const SizedBox(height: 24),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('First due date'),
                subtitle: Text(_formattedDate),
                trailing: const Icon(Icons.calendar_today_rounded),
                onTap: _pickDate,
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Auto-pay enabled'),
                value: _autopay,
                onChanged: (value) => setState(() => _autopay = value),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Reminder'),
                subtitle: Text(_reminderLabel),
                trailing: const Icon(Icons.notifications_active_rounded),
                onTap: _pickReminder,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _note,
                decoration: const InputDecoration(
                  labelText: 'Notes (optional)',
                ),
                maxLines: 3,
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.check_rounded),
                label: Text(_saving ? 'Saving…' : 'Save subscription'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
