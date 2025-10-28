// lib/details/subs_bills/add_subs_custom_reminder_sheet.dart
import 'package:flutter/material.dart';

class ReminderSelection {
  final int? daysBefore;
  final TimeOfDay? timeOfDay;

  const ReminderSelection({this.daysBefore, this.timeOfDay});

  ReminderSelection copyWith({int? daysBefore, TimeOfDay? timeOfDay}) {
    return ReminderSelection(
      daysBefore: daysBefore ?? this.daysBefore,
      timeOfDay: timeOfDay ?? this.timeOfDay,
    );
  }
}

class AddSubsCustomReminderSheet extends StatefulWidget {
  final ReminderSelection? initial;

  const AddSubsCustomReminderSheet({super.key, this.initial});

  @override
  State<AddSubsCustomReminderSheet> createState() =>
      _AddSubsCustomReminderSheetState();
}

class _AddSubsCustomReminderSheetState
    extends State<AddSubsCustomReminderSheet> {
  late ReminderSelection _selection;

  final List<int> _presets = const [0, 1, 2, 3, 7];

  @override
  void initState() {
    super.initState();
    _selection = widget.initial ?? const ReminderSelection(daysBefore: 1);
  }

  Future<void> _pickTime() async {
    final now = TimeOfDay.now();
    final picked = await showTimePicker(
      context: context,
      initialTime: _selection.timeOfDay ?? now,
    );
    if (picked != null) {
      setState(() => _selection = _selection.copyWith(timeOfDay: picked));
    }
  }

  void _submit() {
    Navigator.pop(context, _selection);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 20,
          bottom: MediaQuery.of(context).viewInsets.bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'Reminder',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Text(
              'Notify me before the due date',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final day in _presets)
                  ChoiceChip(
                    label: Text(day == 0
                        ? 'Same day'
                        : '$day day${day == 1 ? '' : 's'} before'),
                    selected: _selection.daysBefore == day,
                    onSelected: (selected) {
                      if (!selected) return;
                      setState(() =>
                          _selection = _selection.copyWith(daysBefore: day));
                    },
                  ),
                ChoiceChip(
                  label: const Text('Custom'),
                  selected: !_presets.contains(_selection.daysBefore ?? -1),
                  onSelected: (selected) async {
                    if (!selected) return;
                    final value = await showDialog<int>(
                      context: context,
                      builder: (_) => _CustomDaysDialog(
                        initial: _selection.daysBefore ?? 3,
                      ),
                    );
                    if (value != null) {
                      setState(() => _selection =
                          _selection.copyWith(daysBefore: value));
                    }
                  },
                ),
              ],
            ),
            const SizedBox(height: 24),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Reminder time'),
              subtitle: Text(_selection.timeOfDay == null
                  ? 'Default (9:00 AM)'
                  : _selection.timeOfDay!.format(context)),
              trailing: const Icon(Icons.schedule_rounded),
              onTap: _pickTime,
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () => setState(
                () => _selection = const ReminderSelection(),
              ),
              child: const Text('Clear reminder'),
            ),
            const SizedBox(height: 4),
            FilledButton(
              onPressed: _submit,
              child: const Text('Save reminder'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CustomDaysDialog extends StatefulWidget {
  final int initial;
  const _CustomDaysDialog({required this.initial});

  @override
  State<_CustomDaysDialog> createState() => _CustomDaysDialogState();
}

class _CustomDaysDialogState extends State<_CustomDaysDialog> {
  late int _value;

  @override
  void initState() {
    super.initState();
    _value = widget.initial.clamp(0, 90);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Custom reminder'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Remind me $_value day${_value == 1 ? '' : 's'} before the due date'),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Slider(
                  min: 0,
                  max: 30,
                  divisions: 30,
                  value: _value.toDouble(),
                  label: '$_value days',
                  onChanged: (v) => setState(() => _value = v.round()),
                ),
              ),
              SizedBox(
                width: 60,
                child: TextFormField(
                  initialValue: '$_value',
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: false),
                  decoration: const InputDecoration(
                    labelText: 'Days',
                  ),
                  onChanged: (value) {
                    final parsed = int.tryParse(value);
                    if (parsed != null) {
                      setState(() => _value = parsed.clamp(0, 90));
                    }
                  },
                ),
              ),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, _value),
          child: const Text('Save'),
        ),
      ],
    );
  }
}
