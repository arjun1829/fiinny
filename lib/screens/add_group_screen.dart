import 'dart:ui';
import 'package:flutter/material.dart';
import '../services/group_service.dart';
import '../models/group_model.dart';
import '../models/friend_model.dart';
import '../services/friend_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

// Mint palette
const Color tiffanyBlue = Color(0xFF81e6d9);
const Color mintGreen = Color(0xFFb9f5d8);
const Color deepTeal = Color(0xFF09857a);

class AddGroupScreen extends StatefulWidget {
  final String userId;
  const AddGroupScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<AddGroupScreen> createState() => _AddGroupScreenState();
}

class _AddGroupScreenState extends State<AddGroupScreen> {
  final _groupNameController = TextEditingController();
  List<String> _selectedMemberIds = [];
  bool _loading = false;

  @override
  void dispose() {
    _groupNameController.dispose();
    super.dispose();
  }

  void _addGroup() async {
    final groupName = _groupNameController.text.trim();
    if (groupName.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please enter group name!")),
      );
      return;
    }

    setState(() => _loading = true);
    // Always include creator in memberIds!
    final allMemberIds = {..._selectedMemberIds, widget.userId}.toList();

    // Use the updated createGroup method that can handle just a name:
    await GroupService().createGroup(widget.userId, groupName, allMemberIds);

    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(76),
        child: ClipRRect(
          borderRadius: const BorderRadius.only(
            bottomLeft: Radius.circular(18), bottomRight: Radius.circular(18),
          ),
          child: Container(
            height: 76,
            decoration: BoxDecoration(
              color: tiffanyBlue.withOpacity(0.94),
              boxShadow: [
                BoxShadow(
                  color: Colors.black12.withOpacity(0.13),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.group_add_rounded, color: deepTeal, size: 28),
                      const SizedBox(width: 12),
                      const Text(
                        "Create Group",
                        style: TextStyle(
                          fontFamily: 'Montserrat',
                          fontSize: 23,
                          fontWeight: FontWeight.bold,
                          color: deepTeal,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          const _AnimatedMintBackground(),
          ListView(
            padding: const EdgeInsets.only(top: 96, left: 16, right: 16),
            children: [
              _GlassCard(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text("Group Name", style: TextStyle(fontWeight: FontWeight.bold, color: deepTeal)),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _groupNameController,
                        decoration: const InputDecoration(
                          hintText: "Enter a name for your group",
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text('Select Members (optional):', style: TextStyle(fontWeight: FontWeight.bold, color: deepTeal)),
                      const SizedBox(height: 6),
                      StreamBuilder<List<FriendModel>>(
                        stream: FriendService().getFriendsStream(widget.userId),
                        builder: (context, snapshot) {
                          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                          final friends = snapshot.data!;
                          return FriendPicker(
                            friends: friends,
                            selectedIds: _selectedMemberIds,
                            onChanged: (ids) {
                              setState(() => _selectedMemberIds = ids);
                            },
                          );
                        },
                      ),
                      const SizedBox(height: 18),
                      _loading
                          ? const Center(child: CircularProgressIndicator())
                          : ElevatedButton.icon(
                        onPressed: _addGroup,
                        icon: const Icon(Icons.done),
                        label: const Text('Create Group'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: deepTeal,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// --- Glass Card for Glassmorphism effect ---
class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child, Key? key}) : super(key: key);
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(17),
        color: Colors.white.withOpacity(0.18),
        border: Border.all(color: tiffanyBlue.withOpacity(0.18), width: 1.1),
        boxShadow: [
          BoxShadow(
            color: mintGreen.withOpacity(0.10),
            blurRadius: 7,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(17),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: child,
        ),
      ),
    );
  }
}

// --- FriendPicker widget (for re-use) ---
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
          backgroundColor: isSelected ? mintGreen : Colors.grey[100],
          selectedColor: tiffanyBlue.withOpacity(0.45),
          checkmarkColor: deepTeal,
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

// --------- Animated Mint BG ---------
class _AnimatedMintBackground extends StatelessWidget {
  const _AnimatedMintBackground({super.key});
  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.0, end: 1.0),
      duration: const Duration(seconds: 2),
      builder: (context, value, child) => Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              tiffanyBlue,
              mintGreen,
              Colors.white.withOpacity(0.93),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            stops: [0, value, 1],
          ),
        ),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 9, sigmaY: 9),
          child: Container(color: Colors.transparent),
        ),
      ),
    );
  }
}
