// lib/widgets/review_draft_editor_sheet.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/review_queue_service.dart';
import '../models/ingest_draft_model.dart';

class ReviewDraftEditorSheet extends StatefulWidget {
  final String userId;
  final IngestDraft draft;
  const ReviewDraftEditorSheet(
      {super.key, required this.userId, required this.draft});

  @override
  State<ReviewDraftEditorSheet> createState() => _ReviewDraftEditorSheetState();
}

class _ReviewDraftEditorSheetState extends State<ReviewDraftEditorSheet> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _amount;
  late TextEditingController _note;
  late TextEditingController _category;
  late DateTime _date;
  late String _direction;

  @override
  void initState() {
    super.initState();
    _amount = TextEditingController(
      text: widget.draft.amount == null
          ? ''
          : widget.draft.amount!.toStringAsFixed(2),
    );
    _note = TextEditingController(text: widget.draft.note);
    _category =
        TextEditingController(text: widget.draft.brain?['category'] ?? '');
    _date = widget.draft.date;
    _direction = widget.draft.direction;
  }

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    _category.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.draft;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.82,
      maxChildSize: 0.92,
      minChildSize: 0.5,
      builder: (_, controller) {
        return Material(
          color: Theme.of(context).canvasColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              child: Form(
                key: _formKey,
                child: ListView(
                  controller: controller,
                  children: [
                    Center(
                      child: Container(
                        width: 38,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.black26,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text('Edit Draft',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        SegmentedButton<String>(
                          segments: const [
                            ButtonSegment(
                                value: 'debit',
                                label: Text('Debit'),
                                icon: Icon(Icons.call_made_rounded)),
                            ButtonSegment(
                                value: 'credit',
                                label: Text('Credit'),
                                icon: Icon(Icons.call_received_rounded)),
                          ],
                          selected: {_direction},
                          onSelectionChanged: (s) =>
                              setState(() => _direction = s.first),
                        ),
                        const Spacer(),
                        FilledButton.tonal(
                          onPressed: () async {
                            final picked = await showDatePicker(
                              context: context,
                              firstDate: DateTime(2019),
                              lastDate:
                                  DateTime.now().add(const Duration(days: 2)),
                              initialDate: _date,
                            );
                            if (picked != null) {
                              if (!context.mounted) {
                                return;
                              }
                              final time = await showTimePicker(
                                context: context,
                                initialTime: TimeOfDay.fromDateTime(_date),
                              );
                              if (time != null) {
                                setState(() => _date = DateTime(
                                      picked.year,
                                      picked.month,
                                      picked.day,
                                      time.hour,
                                      time.minute,
                                    ));
                              } else {
                                setState(() => _date = DateTime(
                                    picked.year,
                                    picked.month,
                                    picked.day,
                                    _date.hour,
                                    _date.minute));
                              }
                            }
                          },
                          child: Text(
                              DateFormat('d MMM yyyy, h:mm a').format(_date)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _amount,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Amount (INR)',
                        prefixText: '₹ ',
                      ),
                      validator: (v) {
                        if (_direction == 'debit' &&
                            (v == null || v.trim().isEmpty)) {
                          return 'Amount is required for debit.';
                        }
                        if (v != null && v.trim().isNotEmpty) {
                          final x = double.tryParse(v.replaceAll(',', ''));
                          if (x == null) {
                            return 'Enter a valid number';
                          }
                          if (x < 0) {
                            return 'Amount cannot be negative';
                          }
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    if (d.fxOriginal != null)
                      Text(
                          'FX detected: ${d.fxOriginal!['currency']} ${d.fxOriginal!['amount']}',
                          style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 8),
                    TextFormField(
                      controller: _category,
                      decoration: const InputDecoration(
                        labelText: 'Category (optional)',
                        helperText:
                            'Saved into brain.category to pre-fill the final entry',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _note,
                      maxLines: 5,
                      decoration: const InputDecoration(
                        labelText: 'Note',
                        alignLabelWithHint: true,
                      ),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        TextButton.icon(
                          icon: const Icon(Icons.delete_outline_rounded),
                          label: const Text('Reject'),
                          onPressed: () async {
                            await ReviewQueueService.instance
                                .reject(widget.userId, d.key);
                            if (context.mounted) Navigator.pop(context, true);
                          },
                        ),
                        const Spacer(),
                        FilledButton.icon(
                          icon: const Icon(Icons.save_rounded),
                          label: const Text('Save'),
                          onPressed: () async {
                            if (!_formKey.currentState!.validate()) {
                              return;
                            }
                            final amtStr = _amount.text.trim();
                            final amt =
                                amtStr.isEmpty ? null : double.parse(amtStr);
                            await ReviewQueueService.instance.updateDraft(
                              widget.userId,
                              d.key,
                              amount: amt,
                              date: _date,
                              direction: _direction,
                              note: _note.text,
                              category: _category.text.isEmpty
                                  ? null
                                  : _category.text,
                            );
                            if (context.mounted) Navigator.pop(context, true);
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      icon: const Icon(Icons.check_circle_rounded),
                      label: const Text('Approve & Post'),
                      onPressed: () async {
                        if (!_formKey.currentState!.validate()) {
                          return;
                        }
                        // Persist edits then approve
                        final amtStr = _amount.text.trim();
                        final amt =
                            amtStr.isEmpty ? null : double.parse(amtStr);
                        await ReviewQueueService.instance.updateDraft(
                          widget.userId,
                          d.key,
                          amount: amt,
                          date: _date,
                          direction: _direction,
                          note: _note.text,
                          category:
                              _category.text.isEmpty ? null : _category.text,
                        );
                        await ReviewQueueService.instance
                            .approve(widget.userId, d.key);
                        if (context.mounted) Navigator.pop(context, true);
                      },
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
