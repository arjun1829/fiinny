import 'package:flutter/material.dart';
import '../models/friend_model.dart';

class FriendPicker extends StatelessWidget {
  final List<FriendModel> friends;
  final List<String> selectedIds;
  final Function(List<String>) onChanged;

  const FriendPicker({
    Key? key,
    required this.friends,
    required this.selectedIds,
    required this.onChanged,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      children: friends.map((f) {
        final isSelected = selectedIds.contains(f.phone);
        return FilterChip(
          label: Text('${f.avatar} ${f.name}'),
          selected: isSelected,
          onSelected: (selected) {
            final updated = List<String>.from(selectedIds);
            if (selected) {
              if (!updated.contains(f.phone)) updated.add(f.phone);
            } else {
              updated.remove(f.phone);
            }
            onChanged(updated);
          },
        );
      }).toList(),
    );
  }
}
