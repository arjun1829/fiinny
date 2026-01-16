import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart'; // For Timestamp type (safe even if unused)

class SharedNotesWidget extends StatefulWidget {
  /// Each note can be:
  /// {
  ///   'author': String,
  ///   'text': String,
  ///   'timestamp': String | DateTime | Timestamp
  /// }
  final List<Map<String, String>>
      notes; // keeping your original type for compatibility
  final Function(String text) onAddNote;

  const SharedNotesWidget({
    super.key,
    required this.notes,
    required this.onAddNote,
  });

  @override
  State<SharedNotesWidget> createState() => _SharedNotesWidgetState();
}

class _SharedNotesWidgetState extends State<SharedNotesWidget> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focus = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _submitNote() {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      return;
    }
    widget.onAddNote(text);
    _controller.clear();
    _focus.requestFocus();
  }

  String _initialOf(String? s) {
    final t = (s ?? '').trim();
    if (t.isEmpty) {
      return '?';
    }
    return t.characters.first.toUpperCase();
  }

  String _formatTime(dynamic ts) {
    if (ts == null) {
      return '';
    }
    DateTime? d;
    if (ts is String) {
      d = DateTime.tryParse(ts);
      if (d == null) {
        return ts; // fallback to raw string
      }
    } else if (ts is DateTime) {
      d = ts;
    } else if (ts is Timestamp) {
      d = ts.toDate();
    }
    if (d == null) {
      return '';
    }
    final now = DateTime.now();
    final isToday =
        d.year == now.year && d.month == now.month && d.day == now.day;
    final hh = d.hour.toString().padLeft(2, '0');
    final mm = d.minute.toString().padLeft(2, '0');
    if (isToday) {
      return 'Today $hh:$mm';
    }
    final dd = d.day.toString().padLeft(2, '0');
    final mo = d.month.toString().padLeft(2, '0');
    final yy = (d.year % 100).toString().padLeft(2, '0');
    return '$dd/$mo/$yy $hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.notes.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              children: [
                Icon(Icons.sticky_note_2_rounded,
                    size: 40,
                    color: theme.colorScheme.primary.withValues(alpha: 0.7)),
                const SizedBox(height: 8),
                Text(
                  'No notes yet — add one below!',
                  style: TextStyle(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),

        // Notes list (non-scrollable so it plays nice inside parent scroll views)
        ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: widget.notes.length,
          itemBuilder: (context, i) {
            final n = widget.notes[i];
            final author = n['author'] ?? '';
            final text = n['text'] ?? '';
            final ts = n[
                'timestamp']; // may be String (per original type), DateTime, or Timestamp (if supplied)

            return Card(
              elevation: 1,
              margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor:
                      theme.colorScheme.primary.withValues(alpha: 0.12),
                  child: Text(
                    _initialOf(author),
                    style: TextStyle(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                title: Text(
                  text,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  _formatTime(ts),
                  style: TextStyle(color: Colors.grey[700]),
                ),
              ),
            );
          },
        ),

        const SizedBox(height: 8),

        // Input row
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  focusNode: _focus,
                  minLines: 1,
                  maxLines: 3,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _submitNote(),
                  decoration: InputDecoration(
                    hintText: 'Add a note…',
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 12),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: _controller.text.trim().isEmpty ? null : _submitNote,
                icon: const Icon(Icons.send_rounded),
                color: theme.colorScheme.primary,
                tooltip: 'Send note',
              ),
            ],
          ),
        ),
      ],
    );
  }
}
