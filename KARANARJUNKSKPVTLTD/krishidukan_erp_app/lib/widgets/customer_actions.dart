import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/theme.dart';
import '../features/auth/auth_repository.dart';
import '../features/notes/notes_repository.dart';

/// A "Call" pill (dials [phone] directly) and a "Note" pill (opens a composer
/// that writes into the linked retailer's notes — same place the web ERP's
/// Customer Profile Notes tab reads from). Either pill is omitted when it has
/// nothing to act on, so a walk-in bill with no phone shows neither.
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

  Future<void> _call(BuildContext context) async {
    final uri = Uri(scheme: 'tel', path: phone.trim());
    try {
      final launched = await launchUrl(uri);
      if (!launched && context.mounted) _showNoDialer(context);
    } catch (_) {
      // Desktop browsers with no phone-dialer association throw rather than
      // returning false — treat it the same as "couldn't launch".
      if (context.mounted) _showNoDialer(context);
    }
  }

  void _showNoDialer(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('No dialer app found. Number: ${phone.trim()}')),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_canCall && !_canNote) return const SizedBox.shrink();
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_canCall)
          _ActionPill(
            icon: Icons.call_rounded,
            label: compact ? null : 'Call',
            color: AppColors.good,
            onTap: () => _call(context),
          ),
        if (_canCall && _canNote) const SizedBox(width: 8),
        if (_canNote)
          _ActionPill(
            icon: Icons.edit_note_rounded,
            label: compact ? null : 'Note',
            color: AppColors.accent,
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              builder: (_) => _NoteComposerSheet(
                customerName: customerName,
                retailerId: retailerId!,
              ),
            ),
          ),
      ],
    );
  }
}

class _ActionPill extends StatelessWidget {
  const _ActionPill({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String? label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: EdgeInsets.symmetric(
              horizontal: label == null ? 8 : 10, vertical: 6),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: color),
              if (label != null) ...[
                const SizedBox(width: 5),
                Text(
                  label!,
                  style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: color),
                ),
              ],
            ],
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
          Text('NOTE FOR', style: kMicro),
          const SizedBox(height: 4),
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
                          strokeWidth: 2, color: AppColors.accentInk),
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
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.border),
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 11.5, color: AppColors.inkDim),
        ),
      ),
    );
  }
}
