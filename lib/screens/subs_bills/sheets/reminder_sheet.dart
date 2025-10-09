import 'package:flutter/material.dart';
import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/ui/tokens.dart';

class ReminderSheet extends StatefulWidget {
  final SharedItem item;
  /// Called with (daysBefore, timeOfDay).
  final Future<void> Function(int, TimeOfDay) onSchedule;

  const ReminderSheet({
    super.key,
    required this.item,
    required this.onSchedule,
  });

  @override
  State<ReminderSheet> createState() => _ReminderSheetState();
}

class _ReminderSheetState extends State<ReminderSheet> {
  int _daysBefore = 1;
  TimeOfDay _time = const TimeOfDay(hour: 9, minute: 0);
  bool _saving = false;

  @override
  Widget build(BuildContext context) {
    final dark = Colors.black.withOpacity(.92);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 4, width: 40,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(999)),
            ),
            Row(
              children: [
                const Icon(Icons.alarm_add_rounded, color: AppColors.mint),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Set reminder for ${widget.item.title ?? 'subscription'}',
                      style: TextStyle(fontWeight: FontWeight.w900, color: dark)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Text('Notify ', style: TextStyle(fontWeight: FontWeight.w700)),
                DropdownButton<int>(
                  value: _daysBefore,
                  items: const [
                    DropdownMenuItem(value: 0, child: Text('on due date')),
                    DropdownMenuItem(value: 1, child: Text('1 day before')),
                    DropdownMenuItem(value: 3, child: Text('3 days before')),
                    DropdownMenuItem(value: 7, child: Text('1 week before')),
                  ],
                  onChanged: (v) => setState(() => _daysBefore = v ?? 1),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Text('At ', style: TextStyle(fontWeight: FontWeight.w700)),
                TextButton.icon(
                  onPressed: () async {
                    final t = await showTimePicker(context: context, initialTime: _time);
                    if (t != null) setState(() => _time = t);
                  },
                  icon: const Icon(Icons.schedule_rounded),
                  label: Text(_time.format(context)),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving ? null : () => Navigator.pop(context),
                    child: const Text('Close'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _saving ? null : () async {
                      setState(() => _saving = true);
                      await widget.onSchedule(_daysBefore, _time);
                      if (mounted) Navigator.pop(context);
                    },
                    icon: _saving
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.check_rounded),
                    label: const Text('Schedule'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
