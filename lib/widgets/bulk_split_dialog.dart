import 'package:flutter/material.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../themes/tokens.dart';

class BulkSplitDialog extends StatefulWidget {
  final List<FriendModel> allFriends;
  final List<GroupModel> allGroups;

  const BulkSplitDialog({
    Key? key,
    required this.allFriends,
    required this.allGroups,
  }) : super(key: key);

  @override
  State<BulkSplitDialog> createState() => _BulkSplitDialogState();
}

class _BulkSplitDialogState extends State<BulkSplitDialog> {
  final Set<String> _selectedFriendPhones = {};
  String? _selectedGroupId;

  // Toggle friend selection
  void _toggleFriend(String phone) {
    if (_selectedGroupId != null) {
      // If a group was selected, clear it first
      setState(() {
        _selectedGroupId = null;
        _selectedFriendPhones.clear();
        _selectedFriendPhones.add(phone);
      });
    } else {
      setState(() {
        if (_selectedFriendPhones.contains(phone)) {
          _selectedFriendPhones.remove(phone);
        } else {
          _selectedFriendPhones.add(phone);
        }
      });
    }
  }

  // Select group (mutually exclusive with individual friends for now, or clears friends)
  void _selectGroup(String groupId) {
    setState(() {
      if (_selectedGroupId == groupId) {
        _selectedGroupId = null;
      } else {
        _selectedGroupId = groupId;
        _selectedFriendPhones.clear(); // Clear individual friends when group is selected
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
       shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
       insetPadding: const EdgeInsets.all(16),
       child: Column(
         mainAxisSize: MainAxisSize.min,
         crossAxisAlignment: CrossAxisAlignment.stretch,
         children: [
           Padding(
             padding: const EdgeInsets.all(16.0),
             child: Text(
               'Bulk Split',
               style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
               textAlign: TextAlign.center,
             ),
           ),
           const Divider(height: 1),
           
           Flexible(
             child: SingleChildScrollView(
               padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
               child: Column(
                 crossAxisAlignment: CrossAxisAlignment.start,
                 children: [
                   if (widget.allGroups.isNotEmpty) ...[
                     const Padding(
                       padding: EdgeInsets.symmetric(vertical: 8.0),
                       child: Text("Groups", style: TextStyle(fontWeight: FontWeight.w600, color: Colors.grey)),
                     ),
                     Wrap(
                       spacing: 8,
                       runSpacing: 8,
                       children: widget.allGroups.map((g) {
                         final isSelected = _selectedGroupId == g.id;
                         return ChoiceChip(
                           label: Text(g.name),
                           selected: isSelected,
                           onSelected: (val) => _selectGroup(g.id),
                           selectedColor: Fx.mintDark,
                           labelStyle: TextStyle(
                             color: isSelected ? Colors.white : Colors.black,
                           ),
                         );
                       }).toList(),
                     ),
                     const SizedBox(height: 16),
                   ],

                   const Padding(
                     padding: EdgeInsets.symmetric(vertical: 8.0),
                     child: Text("Friends", style: TextStyle(fontWeight: FontWeight.w600, color: Colors.grey)),
                   ),
                    if (widget.allFriends.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(8.0),
                        child: Text("No friends added yet."),
                      )
                   else
                     Wrap(
                       spacing: 8,
                       runSpacing: 8,
                       children: widget.allFriends.map((f) {
                         final isSelected = _selectedFriendPhones.contains(f.phone);
                         return FilterChip(
                           label: Text(f.name),
                           selected: isSelected,
                           onSelected: (val) => _toggleFriend(f.phone),
                           selectedColor: Fx.mintDark,
                           checkmarkColor: Colors.white,
                           labelStyle: TextStyle(
                             color: isSelected ? Colors.white : Colors.black,
                           ),
                         );
                       }).toList(),
                     ),
                 ],
               ),
             ),
           ),
           
           const Divider(height: 1),
           Padding(
             padding: const EdgeInsets.all(16.0),
             child: Row(
               mainAxisAlignment: MainAxisAlignment.end,
               children: [
                 TextButton(
                   onPressed: () => Navigator.pop(context),
                   child: const Text('Cancel', style: TextStyle(color: Colors.grey)),
                 ),
                 const SizedBox(width: 8),
                 ElevatedButton(
                   style: ElevatedButton.styleFrom(
                     backgroundColor: Fx.mintDark,
                     foregroundColor: Colors.white,
                     shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                   ),
                   onPressed: (_selectedFriendPhones.isEmpty && _selectedGroupId == null)
                       ? null
                       : () {
                           Navigator.pop(context, {
                             'friendIds': _selectedFriendPhones.toList(),
                             'groupId': _selectedGroupId,
                           });
                         },
                   child: const Text('Split Selected'),
                 ),
               ],
             ),
           ),
         ],
       ),
    );
  }
}
