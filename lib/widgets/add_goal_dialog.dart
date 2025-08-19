import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/goal_model.dart';

class AddGoalDialog extends StatefulWidget {
  final Function(GoalModel) onAdd;

  const AddGoalDialog({required this.onAdd, Key? key}) : super(key: key);

  @override
  State<AddGoalDialog> createState() => _AddGoalDialogState();
}

class _AddGoalDialogState extends State<AddGoalDialog> {
  final _emojiController = TextEditingController();
  final _titleController = TextEditingController();
  final _amountController = TextEditingController();
  final _notesController = TextEditingController();

  DateTime? _targetDate;
  String? _category;
  String _priority = "Medium";

  // For dependents
  List<String> _dependencies = [];
  final _depController = TextEditingController();

  List<String> _categoryOptions = [
    "Travel", "Gadget", "Emergency", "Education", "Health", "Other"
  ];

  List<String> _priorityOptions = ["Low", "Medium", "High"];

  @override
  void dispose() {
    _emojiController.dispose();
    _titleController.dispose();
    _amountController.dispose();
    _notesController.dispose();
    _depController.dispose();
    super.dispose();
  }

  void _addDependency() {
    final dep = _depController.text.trim();
    if (dep.isNotEmpty) {
      setState(() {
        _dependencies.add(dep);
        _depController.clear();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text("Add New Goal"),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _emojiController,
              decoration: const InputDecoration(
                labelText: "Emoji (e.g. 🎯)",
              ),
              maxLength: 2,
            ),
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(labelText: "Goal Title"),
            ),
            TextField(
              controller: _amountController,
              decoration: const InputDecoration(labelText: "Target Amount"),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),

            // Category dropdown
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(labelText: "Category"),
              value: _category,
              items: _categoryOptions
                  .map((cat) => DropdownMenuItem(value: cat, child: Text(cat)))
                  .toList(),
              onChanged: (val) {
                setState(() {
                  _category = val;
                });
              },
            ),
            // Priority selector
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(labelText: "Priority"),
              value: _priority,
              items: _priorityOptions
                  .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                  .toList(),
              onChanged: (val) {
                setState(() {
                  _priority = val ?? "Medium";
                });
              },
            ),
            // Notes
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(labelText: "Notes (optional)"),
              maxLines: 2,
            ),
            // Target date
            const SizedBox(height: 12),
            Row(
              children: [
                Text(
                  _targetDate == null
                      ? "Target Date"
                      : DateFormat("d MMM, yyyy").format(_targetDate!),
                ),
                const Spacer(),
                TextButton(
                  child: const Text("Pick"),
                  onPressed: () async {
                    final now = DateTime.now();
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: now,
                      firstDate: now,
                      lastDate: DateTime(now.year + 5),
                    );
                    if (picked != null) {
                      setState(() {
                        _targetDate = picked;
                      });
                    }
                  },
                )
              ],
            ),
            // Dependencies (sub-goals)
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _depController,
                    decoration: const InputDecoration(
                      labelText: "Add sub-goal",
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.add),
                  onPressed: _addDependency,
                )
              ],
            ),
            if (_dependencies.isNotEmpty)
              Wrap(
                children: _dependencies
                    .map((dep) => Chip(
                  label: Text(dep),
                  onDeleted: () {
                    setState(() => _dependencies.remove(dep));
                  },
                ))
                    .toList(),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          child: const Text("Cancel"),
          onPressed: () => Navigator.pop(context),
        ),
        ElevatedButton(
          child: const Text("Add"),
          onPressed: () {
            final emoji = _emojiController.text.isNotEmpty
                ? _emojiController.text
                : "🎯";
            final title = _titleController.text.trim();
            final amount = double.tryParse(_amountController.text) ?? 0.0;

            if (title.isEmpty || amount <= 0 || _targetDate == null) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("Fill all fields!")),
              );
              return;
            }
            final newGoal = GoalModel(
              id: '',
              title: title,
              emoji: emoji,
              targetAmount: amount,
              savedAmount: 0,
              targetDate: _targetDate!,
              category: _category ?? "Other",
              priority: _priority,
              notes: _notesController.text.trim(),
              dependencies: _dependencies,
            );
            widget.onAdd(newGoal);
            Navigator.pop(context);
          },
        )
      ],
    );
  }
}
