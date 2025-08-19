// lib/group/group_rename_dialog.dart
import 'package:flutter/material.dart';

class GroupRenameDialog extends StatefulWidget {
  final String initial;
  const GroupRenameDialog({Key? key, required this.initial}) : super(key: key);

  @override
  State<GroupRenameDialog> createState() => _GroupRenameDialogState();
}

class _GroupRenameDialogState extends State<GroupRenameDialog> {
  late final TextEditingController _c;

  @override
  void initState() {
    super.initState();
    _c = TextEditingController(text: widget.initial);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Rename group'),
      content: TextField(
        controller: _c,
        autofocus: true,
        decoration: const InputDecoration(
          labelText: 'Group name',
          border: OutlineInputBorder(),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        ElevatedButton(onPressed: () => Navigator.pop(context, _c.text.trim()), child: const Text('Save')),
      ],
    );
  }
}
