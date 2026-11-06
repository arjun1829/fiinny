import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/theme.dart';
import '../features/auth/auth_repository.dart';
import '../features/notes/notes_repository.dart';

/// Dials [phone]; shows the number in a snackbar when no dialer exists.
Future<void> callCustomer(BuildContext context, String phone) async {
  final number = phone.trim();
  final uri = Uri(scheme: 'tel', path: number);
  var launched = false;
  try {
    launched = await launchUrl(uri);
  } catch (_) {
    // Desktop browsers with no dialer throw rather than returning false.
  }
  if (!launched && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('No dialer app found. Number: $number')),
    );
  }
}

/// Opens the note composer for a retailer-linked customer.
Future<void> addCustomerNote(
  BuildContext context, {
  required String customerName,
  required String retailerId,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _NoteComposerSheet(
      customerName: customerName,
      retailerId: retailerId,
    ),
  );
}

/// "Call" and "Note" buttons. A button is omitted when it has nothing to act
/// on, so a walk-in bill with no phone shows neither. [compact] renders round
/// icon-only buttons for dense list rows.
class CustomerActions extends StatelessWidget {
  const CustomerActions({
    super.key,
    required this.customerName,
    required this.phone,
    this.retailerId,
    this.compact = false,
  });

  final String customerName;
  final String phone;
  final String? retailerId;
  final bool compact;

  bool get _canCall => phone.trim().isNotEmpty;
  bool get _canNote => (retailerId ?? '').isNotEmpty;

  @override
  Widget build(BuildContext context) {
    if (!_canCall && !_canNote) return const SizedBox.shrink();
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_canCall)
          _ActionButton(
            icon: Icons.call_outlined,
            label: compact ? null : 'Call',
            tooltip: 'Call $customerName',
            color: AppColors.good,
            onTap: () => callCustomer(context, phone),
          ),
        if (_canCall && _canNote) const SizedBox(width: 8),
        if (_canNote)
          _ActionButton(
            icon: Icons.edit_note_rounded,
            label: compact ? null : 'Add note',
            tooltip: 'Add note for $customerName',
            color: AppColors.primary,
            onTap: () => addCustomerNote(
              context,
              customerName: customerName,
              retailerId: retailerId!,
            ),
          ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.tooltip,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String? label;
  final String tooltip;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final round = label == null;
    final bg = color.withValues(alpha: AppColors.isDark ? 0.18 : 0.09);
    return Tooltip(
      message: tooltip,
      child: Material(
        color: bg,
        shape: round
            ? const CircleBorder()
            : RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        child: InkWell(
          onTap: onTap,
          customBorder: round
              ? const CircleBorder()
              : RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          child: Padding(
            padding: round
                ? const EdgeInsets.all(9)
                : const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 18, color: color),
                if (!round) ...[
                  const SizedBox(width: 6),
                  Text(
                    label!,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: color,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NoteComposerSheet extends ConsumerStatefulWidget {
  const _NoteComposerSheet({
    required this.customerName,
    required this.retailerId,
  });

  final String customerName;
  final String retailerId;

  @override
  ConsumerState<_NoteComposerSheet> createState() => _NoteComposerSheetState();
}

class _NoteComposerSheetState extends ConsumerState<_NoteComposerSheet> {
  final _controller = TextEditingController();
  bool _saving = false;
  String? _error;

  static const _quickNotes = [
    'Will pay tomorrow',
    'Asked for 3 more days',
    'Not reachable',
    'Promised to pay by month end',
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final content = _controller.text.trim();
    if (content.isEmpty) return;
    final repo = ref.read(notesRepositoryProvider);
    final user = ref.read(appUserProvider).valueOrNull;
    if (repo == null) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await repo.addNote(
        retailerId: widget.retailerId,
        content: content,
        addedBy: user?.name ?? user?.email ?? 'App user',
      );
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not save the note. Try again.');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 4,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Add note for', style: AppText.label),
          const SizedBox(height: 2),
          Text(
            widget.customerName,
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            autofocus: true,
            maxLines: 3,
            style: TextStyle(color: AppColors.ink, fontSize: 14),
            decoration: const InputDecoration(
              hintText: 'e.g. Said he will pay by Friday',
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final q in _quickNotes)
                _QuickChip(label: q, onTap: () => _controller.text = q),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!,
                style: TextStyle(color: AppColors.critical, fontSize: 12)),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppColors.onPrimary),
                    )
                  : const Text('Save note'),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Saved to this customer\'s ledger — visible in the web ERP too.',
            style: TextStyle(fontSize: 11, color: AppColors.inkMute),
          ),
        ],
      ),
    );
  }
}

class _QuickChip extends StatelessWidget {
  const _QuickChip({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.tile,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.border),
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 12.5, color: AppColors.inkDim),
        ),
      ),
    );
  }
}
