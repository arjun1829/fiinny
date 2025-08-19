// lib/group/group_add_members_sheet.dart
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/group_model.dart';
import '../models/friend_model.dart';
import '../services/friend_service.dart';

class GroupAddMembersSheet extends StatefulWidget {
  final String currentUserPhone;
  final GroupModel group;

  const GroupAddMembersSheet({
    Key? key,
    required this.currentUserPhone,
    required this.group,
  }) : super(key: key);

  @override
  State<GroupAddMembersSheet> createState() => _GroupAddMembersSheetState();
}

class _GroupAddMembersSheetState extends State<GroupAddMembersSheet> {
  final _selected = <String>{};
  late final Set<String> _existing;

  @override
  void initState() {
    super.initState();
    _existing = Set<String>.from(widget.group.memberPhones);
  }

  Future<void> _add() async {
    if (_selected.isEmpty) {
      Navigator.pop(context, false);
      return;
    }
    await FirebaseFirestore.instance.collection('groups').doc(widget.group.id).update({
      'memberPhones': FieldValue.arrayUnion(_selected.toList()),
    });
    if (!mounted) return;
    Navigator.pop(context, true);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Added ${_selected.length} member(s).')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.9,
        minChildSize: 0.5,
        builder: (context, scroll) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
            child: Column(
              children: [
                const Text('Add members', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                Expanded(
                  child: StreamBuilder<List<FriendModel>>(
                    stream: FriendService().streamFriends(widget.currentUserPhone),
                    builder: (context, snap) {
                      final friends = (snap.data ?? [])
                          .where((f) => !_existing.contains(f.phone))
                          .toList();
                      if (friends.isEmpty) {
                        return const Center(child: Text('No more friends to add.'));
                      }
                      return ListView.separated(
                        controller: scroll,
                        itemCount: friends.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (_, i) {
                          final f = friends[i];
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
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _add,
                    icon: const Icon(Icons.person_add_alt_1_rounded),
                    label: const Text('Add selected'),
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
