import 'package:flutter/material.dart';

/// Wraps a form (page or bottom sheet) so leaving it with unsaved changes —
/// Back/close button, Android back, tapping outside a sheet — asks first:
/// Save, Discard or Keep editing. With nothing changed it just closes.
///
/// Sheets using this should be opened with `enableDrag: false`: Flutter's
/// swipe-down dismiss pops the sheet directly and would skip the question.
/// Close buttons inside should call `Navigator.maybePop(context)`.
class UnsavedChangesGuard extends StatelessWidget {
  final bool Function() isDirty;

  /// While true (a save is running) leaving is ignored.
  final bool busy;

  /// Saves the form. Expected to close the form itself on success, as the
  /// sheets' Save buttons already do, and to stay open on a validation error.
  final Future<void> Function() onSave;
  final Widget child;

  const UnsavedChangesGuard({
    super.key,
    required this.isDirty,
    required this.onSave,
    required this.child,
    this.busy = false,
  });

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop || busy) return;
        final nav = Navigator.of(context);
        if (!isDirty()) {
          nav.pop(result);
          return;
        }
        final choice = await showDialog<_Choice>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Save your changes?'),
            content: const Text(
              'You have changes that are not saved yet. Save them before leaving?',
            ),
            actionsOverflowButtonSpacing: 4,
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, _Choice.keepEditing),
                child: const Text('Keep editing'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx, _Choice.discard),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.red.shade700,
                ),
                child: const Text('Discard'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, _Choice.save),
                child: const Text('Save'),
              ),
            ],
          ),
        );
        if (choice == _Choice.discard) {
          if (nav.mounted) nav.pop(result);
        } else if (choice == _Choice.save) {
          await onSave();
        }
      },
      child: child,
    );
  }
}

enum _Choice { keepEditing, discard, save }
