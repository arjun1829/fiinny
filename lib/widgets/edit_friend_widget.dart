import 'package:flutter/material.dart';
import '../models/friend_model.dart';
import '../services/friend_service.dart';

class EditFriendWidget extends StatefulWidget {
  final String userId;
  final FriendModel friend;
  final VoidCallback? onSave; // Optional: Callback after save

  const EditFriendWidget({
    required this.userId,
    required this.friend,
    this.onSave,
    super.key,
  });

  @override
  State<EditFriendWidget> createState() => _EditFriendWidgetState();
}

class _EditFriendWidgetState extends State<EditFriendWidget> {
  late TextEditingController _nameController;
  late TextEditingController _emailController;
  late TextEditingController _avatarController;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.friend.name);
    _emailController = TextEditingController(text: widget.friend.email);
    _avatarController = TextEditingController(text: widget.friend.avatar);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _avatarController.dispose();
    super.dispose();
  }

  Future<void> _saveEdit() async {
    setState(() => _isSaving = true);
    final updated = FriendModel(
      phone: widget.friend.phone,
      name: _nameController.text.trim(),
      email: _emailController.text.trim(),
      avatar: _avatarController.text.trim(),
    );
    await FriendService()
        .updateFriend(widget.userId, widget.friend.phone, updated.toJson());
    if (!mounted) return;
    if (widget.onSave != null) widget.onSave!();
    if (Navigator.canPop(context)) Navigator.of(context).pop(); // For dialog
    if (mounted) setState(() => _isSaving = false);
  }

  @override
  Widget build(BuildContext context) {
    return AbsorbPointer(
      absorbing: _isSaving,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _nameController,
            decoration: InputDecoration(labelText: "Name"),
            textCapitalization: TextCapitalization.words,
          ),
          TextField(
            controller: _emailController,
            decoration: InputDecoration(labelText: "Email"),
            keyboardType: TextInputType.emailAddress,
          ),
          TextField(
            controller: _avatarController,
            decoration: InputDecoration(labelText: "Avatar (emoji)"),
          ),
          SizedBox(height: 16),
          if (_isSaving) CircularProgressIndicator(),
          if (!_isSaving)
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () {
                    if (Navigator.canPop(context)) Navigator.pop(context);
                  },
                  child: Text("Cancel"),
                ),
                SizedBox(width: 12),
                ElevatedButton(
                  onPressed: _saveEdit,
                  child: Text("Save"),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
