import 'package:flutter/material.dart';

import '../app_state.dart';
import '../core/models.dart';
import '../core/status_engine.dart';
import 'common.dart';

/// One number: who it is, its colour, and every call with it from all phones.
class NumberDetailScreen extends StatelessWidget {
  const NumberDetailScreen({super.key, required this.state, required this.numberKey});
  final AppState state;
  final String numberKey;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) {
        final summary = state.byNumber[numberKey];
        final calls = state.calls.where((c) => c.numberKey == numberKey).toList();
        final contact = state.contacts[numberKey];
        final displayNumber =
            summary?.displayNumber ?? contact?.displayNumber ?? (calls.isEmpty ? numberKey : calls.first.rawNumber);
        final name = summary?.name ?? contact?.name;

        return Scaffold(
          appBar: AppBar(
            title: Text(name ?? displayNumber),
            actions: [
              IconButton(
                tooltip: 'Edit name and notes',
                icon: const Icon(Icons.edit),
                onPressed: () => showEditContactSheet(context, state,
                    existingKey: numberKey,
                    displayNumber: displayNumber,
                    name: name,
                    notes: contact?.notes),
              ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(displayNumber, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  if (summary != null) StatusChip(summary.status),
                  if (summary != null && summary.status.needsCallback) ...[
                    const SizedBox(height: 8),
                    Text(
                      '${summary.openMissed} missed since ${whenText(summary.openSince!)}'
                      '${summary.attempts > 0 ? ' · tried ${summary.attempts}×' : ''}',
                      style: TextStyle(color: statusColor(summary.status)),
                    ),
                  ],
                  if (summary?.resolvedAt != null && !summary!.status.needsCallback) ...[
                    const SizedBox(height: 8),
                    Text('${statusLabel(summary.status)} ${whenText(summary.resolvedAt!)}'
                        '${summary.resolvedBy != null ? ' by ${summary.resolvedBy}' : ''}'),
                  ],
                  if (contact?.notes?.isNotEmpty ?? false) ...[
                    const SizedBox(height: 12),
                    Card(
                      margin: EdgeInsets.zero,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(children: [
                          const Icon(Icons.sticky_note_2_outlined, size: 18),
                          const SizedBox(width: 8),
                          Expanded(child: Text(contact!.notes!)),
                        ]),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: kGreen),
                      onPressed: () => state.callBack(displayNumber),
                      icon: const Icon(Icons.call),
                      label: const Text('Call back'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => state.whatsApp(displayNumber),
                      icon: const Icon(Icons.chat),
                      label: const Text('WhatsApp'),
                    ),
                    if (summary != null && summary.status.needsCallback)
                      OutlinedButton.icon(
                        onPressed: () => state.markNotNeeded(numberKey, displayNumber),
                        icon: const Icon(Icons.do_not_disturb_on_outlined),
                        label: const Text('Not needed'),
                      ),
                    if (summary?.status == CallStatus.dismissed)
                      OutlinedButton.icon(
                        onPressed: () => state.undoNotNeeded(numberKey),
                        icon: const Icon(Icons.undo),
                        label: const Text('Back to pending'),
                      ),
                  ]),
                ]),
              ),
              if (summary != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(children: [
                    _stat('Total', summary.totalCalls, kBlue),
                    _stat('In', summary.incoming, kGreen),
                    _stat('Out', summary.outgoing, kBlue),
                    _stat('Missed', summary.missedTotal, kRed),
                  ]),
                ),
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 20, 16, 4),
                child: Text('All calls', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
              if (calls.isEmpty)
                const Padding(padding: EdgeInsets.all(16), child: Text('No calls with this number yet')),
              for (final c in calls) _CallRow(call: c),
            ],
          ),
        );
      },
    );
  }

  Widget _stat(String label, int value, Color color) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Column(children: [
              Text('$value',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
              Text(label, style: const TextStyle(fontSize: 12)),
            ]),
          ),
        ),
      );
}

class _CallRow extends StatelessWidget {
  const _CallRow({required this.call});
  final CallRecord call;

  @override
  Widget build(BuildContext context) => ListTile(
        dense: true,
        leading: Icon(kindIcon(call.kind), color: kindColor(call.kind)),
        title: Text('${call.kind.label}  ${durationText(call.duration)}'),
        subtitle: Text([call.deviceName, if (call.sim != null) call.sim].join(' · ')),
        trailing: Text(whenText(call.timestamp)),
      );
}

/// Name and notes for a number. Saving stores it for the team and adds it
/// to this phone's contacts when the phone does not have the number.
Future<void> showEditContactSheet(
  BuildContext context,
  AppState state, {
  String? existingKey,
  String? displayNumber,
  String? name,
  String? notes,
}) {
  final numberCtl = TextEditingController(text: displayNumber ?? '');
  final nameCtl = TextEditingController(text: name ?? '');
  final notesCtl = TextEditingController(text: notes ?? '');
  final isNew = existingKey == null;

  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(isNew ? 'Add contact' : 'Edit contact', style: Theme.of(ctx).textTheme.titleLarge),
        const SizedBox(height: 12),
        TextField(
          controller: numberCtl,
          enabled: isNew,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(labelText: 'Phone number', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: nameCtl,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: notesCtl,
          maxLines: 3,
          decoration: const InputDecoration(
              labelText: 'Notes (village, crop, what they asked…)', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 8),
        const Text('Saved for the whole team and into this phone\'s contacts.',
            style: TextStyle(fontSize: 12, color: kGrey)),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: () async {
            final number = numberCtl.text.trim();
            final key = existingKey ?? numberKey(number);
            if (key.isEmpty || nameCtl.text.trim().isEmpty) {
              ScaffoldMessenger.of(ctx).showSnackBar(
                  const SnackBar(content: Text('Enter a phone number and a name')));
              return;
            }
            final phoneOk = await state.saveContact(key, number,
                name: nameCtl.text, notes: notesCtl.text);
            if (ctx.mounted) Navigator.pop(ctx);
            if (!phoneOk && context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                  content: Text('Saved in the app. Allow Contacts permission to also save it to the phone.')));
            }
          },
          child: const Text('Save'),
        ),
      ]),
    ),
  );
}
