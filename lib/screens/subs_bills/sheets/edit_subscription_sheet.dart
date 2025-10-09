import 'package:flutter/material.dart';
import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/ui/tokens.dart';

class EditSubscriptionSheet extends StatefulWidget {
  final SharedItem item;
  /// Called when user taps Save. You’ll persist outside this sheet.
  final Future<void> Function(String newTitle, {double? amount, String? note}) onSave;

  const EditSubscriptionSheet({
    super.key,
    required this.item,
    required this.onSave,
  });

  @override
  State<EditSubscriptionSheet> createState() => _EditSubscriptionSheetState();
}

class _EditSubscriptionSheetState extends State<EditSubscriptionSheet> {
  late final TextEditingController _title = TextEditingController(text: widget.item.title ?? '');
  late final TextEditingController _amount = TextEditingController(
    text: (widget.item.rule.amount ?? 0).toString(),
  );
  late final TextEditingController _note = TextEditingController(text: widget.item.note ?? '');

  bool _saving = false;

  @override
  void dispose() {
    _title.dispose();
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

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
              decoration: BoxDecoration(
                color: Colors.black12, borderRadius: BorderRadius.circular(999),
              ),
            ),
            Row(
              children: [
                const Icon(Icons.edit_rounded, color: AppColors.mint),
                const SizedBox(width: 8),
                Text('Edit subscription', style: TextStyle(fontWeight: FontWeight.w900, color: dark)),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Title',
                hintText: 'Ex: Netflix',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _amount,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Amount (₹)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _note,
              minLines: 1,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Note (optional)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving ? null : () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _saving ? null : () async {
                      setState(() => _saving = true);
                      final amt = double.tryParse(_amount.text.trim());
                      await widget.onSave(
                        _title.text.trim(),
                        amount: amt,
                        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
                      );
                      if (mounted) Navigator.pop(context);
                    },
                    icon: _saving
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.check_rounded),
                    label: const Text('Save'),
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
