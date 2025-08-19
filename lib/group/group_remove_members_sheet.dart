// lib/group/group_remove_members_sheet.dart
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/group_model.dart';
import '../models/friend_model.dart';

class GroupRemoveMembersSheet extends StatefulWidget {
  final String currentUserPhone;
  final GroupModel group;
  final List<FriendModel> members;

  const GroupRemoveMembersSheet({
    Key? key,
    required this.currentUserPhone,
    required this.group,
    required this.members,
  }) : super(key: key);

  @override
  State<GroupRemoveMembersSheet> createState() => _GroupRemoveMembersSheetState();
}

class _GroupRemoveMembersSheetState extends State<GroupRemoveMembersSheet> {
  final _selected = <String>{};

  bool _canRemove(String phone) {
    if (phone == widget.group.createdBy) return false; // don't remove creator
    if (phone == widget.currentUserPhone) return false; // don't remove yourself here
    return true;
  }

  Future<void> _remove() async {
    if (_selected.isEmpty) {
      Navigator.pop(context, false);
      return;
    }
    await FirebaseFirestore.instance.collection('groups').doc(widget.group.id).update({
      'memberPhones': FieldValue.arrayRemove(_selected.toList()),
    });
    if (!mounted) return;
    Navigator.pop(context, true);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Removed ${_selected.length} member(s).')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final candidates = widget.members.where((m) => _canRemove(m.phone)).toList();

    return SafeArea(
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.8,
        minChildSize: 0.5,
        builder: (context, scroll) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
            child: Column(
              children: [
                const Text('Remove members', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                Expanded(
                  child: candidates.isEmpty
                      ? const Center(child: Text('No removable members.'))
                      : ListView.separated(
                    controller: scroll,
                    itemCount: candidates.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final f = candidates[i];
                      final checked = _selected.contains(f.phone);
                      return CheckboxListTile(
                        value: checked,
                        onChanged: (v) {
                          setState(() {
                            if (v == true) _selected.add(f.phone);
                            else _selected.remove(f.phone);
                          });
                        },
                        title: Text(f.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: f.phone.isNotEmpty ? Text(f.phone) : null,
                        secondary: f.avatar.startsWith('http')
                            ? CircleAvatar(backgroundImage: NetworkImage(f.avatar))
                            : CircleAvatar(child: Text((f.name.isNotEmpty ? f.name[0] : '?').toUpperCase())),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _remove,
                    icon: const Icon(Icons.person_remove_alt_1_rounded),
                    label: const Text('Remove selected'),
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
