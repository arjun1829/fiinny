import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';

class SplitExpenseDialog extends StatefulWidget {
  final ExpenseItem expense;
  final Map<String, FriendModel> friendsById;
  final ValueChanged<List<String>> onSave;

  const SplitExpenseDialog({
    super.key,
    required this.expense,
    required this.friendsById,
    required this.onSave,
  });

  @override
  State<SplitExpenseDialog> createState() => _SplitExpenseDialogState();
}

class _SplitExpenseDialogState extends State<SplitExpenseDialog> {
  late Set<String> _selectedFriendIds;

  @override
  void initState() {
    super.initState();
    _selectedFriendIds = Set<String>.from(widget.expense.friendIds);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
          'Edit Split for "${widget.expense.note.isNotEmpty ? widget.expense.note : widget.expense.type}"'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: widget.friendsById.entries.map((entry) {
            final friend = entry.value;
            return CheckboxListTile(
              title: Text(friend.name),
              value: _selectedFriendIds.contains(friend.phone),
              onChanged: (v) {
                setState(() {
                  if (v == true) {
                    _selectedFriendIds.add(friend.phone);
                  } else {
                    _selectedFriendIds.remove(friend.phone);
                  }
                });
              },
              secondary: Text(friend.avatar, style: TextStyle(fontSize: 24)),
            );
          }).toList(),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () {
            widget.onSave(_selectedFriendIds.toList());
            Navigator.pop(context);
          },
          style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple),
          child: Text('Save'),
        ),
      ],
    );
  }
}
