// lib/group/group_reminder_dialog.dart
import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import 'reminder_service.dart';

class GroupReminderDialog extends StatefulWidget {
  final String groupId;
  final String currentUserPhone;
  final List<String> participantPhones;
  final List<ExpenseItem> groupExpenses;

  const GroupReminderDialog({
    super.key,
    required this.groupId,
    required this.currentUserPhone,
    required this.participantPhones,
    required this.groupExpenses,
  });

  @override
  State<GroupReminderDialog> createState() => _GroupReminderDialogState();
}

class _GroupReminderDialogState extends State<GroupReminderDialog> {
  final _c = TextEditingController();
  bool _alsoDM = false;
  late final ReminderService _svc;

  @override
  void initState() {
    super.initState();
    _svc = ReminderService();
    _c.text = "Friendly reminder to settle pending balances. Thanks! 🙏";
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final net = _svc.computeNetByMember(widget.groupExpenses);
    final debtors = net.entries
        .where((e) => e.key != widget.currentUserPhone && e.value < -0.01)
        .toList();

    return AlertDialog(
      title: const Text('Send reminder'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (debtors.isEmpty)
            const Text("No one currently owes you in this group.")
          else
            Align(
              alignment: Alignment.centerLeft,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("Will notify:",
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  ...debtors.map((d) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Text(
                            "• ${d.key} (₹${d.value.abs().toStringAsFixed(2)})"),
                      )),
                ],
              ),
            ),
          const SizedBox(height: 10),
          TextField(
            controller: _c,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Message',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: _alsoDM,
            onChanged: (v) => setState(() => _alsoDM = v ?? false),
            title: const Text('Also DM each debtor'),
          ),
        ],
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel')),
        ElevatedButton.icon(
          onPressed: () async {
            await _svc.sendGroupReminder(
              groupId: widget.groupId,
              currentUserPhone: widget.currentUserPhone,
              participantPhones: widget.participantPhones,
              groupExpenses: widget.groupExpenses,
              customMessage: _c.text.trim().isEmpty ? null : _c.text.trim(),
              alsoSendDMs: _alsoDM,
            );
            if (!mounted) {
              return;
            }
            Navigator.pop(context, true);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Reminder sent')),
            );
          },
          icon: const Icon(Icons.send_rounded),
          label: const Text('Send'),
        ),
      ],
    );
  }
}
