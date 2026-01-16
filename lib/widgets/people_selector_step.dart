import 'dart:ui';
import 'package:flutter/material.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';

/// Shared palette matching original screen
const Color kBg = Color(0xFFF8FAF9);
const Color kPrimary = Color(0xFF09857a);
const Color kText = Color(0xFF0F1E1C);
const Color kSubtle = Color(0xFF9AA5A1);
const Color kLine = Color(0x14000000);

class PeopleSelectorStep extends StatelessWidget {
  final String userPhone;
  final String? payerPhone;
  final ValueChanged<String?> onPayer;

  final List<FriendModel> friends;
  final List<String> selectedFriends;
  final void Function(String phone, bool selected) onToggleFriend;
  final List<GroupModel> groups;
  final String? selectedGroupId;
  final ValueChanged<String?> onGroup;
  final VoidCallback onAddFriend;
  final VoidCallback onCreateGroup;

  final TextEditingController noteCtrl;
  final bool isActive;

  final List<String> labels;
  final String? selectedLabel;
  final ValueChanged<String?> onLabelSelect;
  final TextEditingController labelCtrl;

  final VoidCallback onNext;
  final VoidCallback onBack;
  final bool saving;

  const PeopleSelectorStep({
    super.key,
    required this.userPhone,
    required this.payerPhone,
    required this.onPayer,
    required this.friends,
    required this.selectedFriends,
    required this.onToggleFriend,
    required this.groups,
    required this.selectedGroupId,
    required this.onGroup,
    required this.onAddFriend,
    required this.onCreateGroup,
    required this.noteCtrl,
    required this.isActive,
    required this.labels,
    required this.selectedLabel,
    required this.onLabelSelect,
    required this.labelCtrl,
    required this.onNext,
    required this.onBack,
    required this.saving,
  });

  @override
  Widget build(BuildContext context) {
    final payers = <Map<String, String>>[
      {'phone': userPhone, 'name': 'You', 'avatar': '🧑'},
      ...friends
          .map((f) => {'phone': f.phone, 'name': f.name, 'avatar': f.avatar}),
    ];

    // Ensure current payer is present even if no longer in friends (edge case)
    if (payerPhone != null && !payers.any((p) => p['phone'] == payerPhone)) {
      payers.add({'phone': payerPhone!, 'name': payerPhone!, 'avatar': '👤'});
    }

    final hasGroup = selectedGroupId != null && selectedGroupId!.isNotEmpty;
    final dropdownValue = hasGroup && groups.any((g) => g.id == selectedGroupId)
        ? selectedGroupId
        : null;
    final groupSelected = dropdownValue != null;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _H2('Who paid?'),
          const SizedBox(height: 8),
          _Box(
            child: DropdownButtonFormField<String>(
              initialValue: payerPhone,
              isExpanded: true,
              decoration: _inputDec(),
              items: payers.map((p) {
                return DropdownMenuItem(
                  value: p['phone'],
                  child: Row(
                    children: [
                      Text(p['avatar'] ?? '👤',
                          style: const TextStyle(fontSize: 18)),
                      const SizedBox(width: 8),
                      Text(p['name'] ?? ''),
                    ],
                  ),
                );
              }).toList(),
              onChanged: saving ? null : onPayer,
            ),
          ),
          const SizedBox(height: 18),
          const _H2('Group (optional)'),
          const SizedBox(height: 8),
          _Box(
            child: DropdownButtonFormField<String?>(
              initialValue: dropdownValue,
              isExpanded: true,
              decoration: _inputDec(),
              items: <DropdownMenuItem<String?>>[
                const DropdownMenuItem<String?>(
                    value: null, child: Text('No group')),
                ...groups.map(
                  (g) => DropdownMenuItem<String?>(
                      value: g.id, child: Text(g.name)),
                ),
              ],
              onChanged: saving ? null : onGroup,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: saving ? null : onAddFriend,
                icon:
                    const Icon(Icons.person_add_alt_1_rounded, color: kPrimary),
                label: const Text('Add Friend'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: kPrimary,
                  side: const BorderSide(color: kPrimary),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
              OutlinedButton.icon(
                onPressed: saving ? null : onCreateGroup,
                icon: const Icon(Icons.group_add_rounded, color: kPrimary),
                label: const Text('Create Group'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: kPrimary,
                  side: const BorderSide(color: kPrimary),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          const _H2('Split With'),
          const SizedBox(height: 8),
          if (groupSelected) ...[
            _GlassCard(
              child: ListTile(
                leading: const Icon(Icons.groups_2_rounded, color: kPrimary),
                title: const Text(
                  "This expense is linked to a group",
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: const Text(
                    "Pick 'No group' above to manage friends manually."),
              ),
            ),
          ] else if (friends.isEmpty) ...[
            _GlassCard(
              child: ListTile(
                leading: const Icon(Icons.info_outline, color: kPrimary),
                title: const Text('No friends found'),
                subtitle: const Text(
                    'Add friends or pick a group to split this expense.'),
              ),
            ),
          ] else ...[
            _Box(
              child: DropdownButtonFormField<String?>(
                initialValue: null,
                isExpanded: true,
                decoration: _inputDec().copyWith(
                  hintText: 'Add person…',
                  prefixIcon: const Icon(Icons.person_add_alt_1_rounded,
                      color: kPrimary),
                ),
                items: [
                  ...friends.take(5).map(
                        (f) => DropdownMenuItem<String?>(
                          value: f.phone,
                          child: Row(
                            children: [
                              CircleAvatar(
                                  radius: 10,
                                  child: Text(f.avatar,
                                      style: const TextStyle(fontSize: 12))),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  f.name,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  const DropdownMenuItem<String?>(
                      value: '__MORE__', child: Text('See all…')),
                ],
                onChanged: saving
                    ? null
                    : (v) async {
                        if (v == null) return;
                        if (v == '__MORE__') {
                          FocusScope.of(context).unfocus();
                          final picked =
                              await showModalBottomSheet<List<String>>(
                            context: context,
                            isScrollControlled: true,
                            builder: (ctx) {
                              final temp = Set<String>.from(selectedFriends);
                              return StatefulBuilder(
                                builder: (ctx, setModalState) {
                                  return DraggableScrollableSheet(
                                    initialChildSize: 0.85,
                                    maxChildSize: 0.95,
                                    minChildSize: 0.5,
                                    builder: (ctx, sc) {
                                      return Material(
                                        color: Colors.white,
                                        borderRadius:
                                            const BorderRadius.vertical(
                                                top: Radius.circular(16)),
                                        child: Column(
                                          children: [
                                            const SizedBox(height: 8),
                                            Container(
                                              width: 44,
                                              height: 4,
                                              decoration: BoxDecoration(
                                                color: Colors.grey.shade300,
                                                borderRadius:
                                                    BorderRadius.circular(2),
                                              ),
                                            ),
                                            const SizedBox(height: 8),
                                            const Text('Select people',
                                                style: TextStyle(
                                                    fontWeight:
                                                        FontWeight.w800)),
                                            Expanded(
                                              child: ListView.builder(
                                                controller: sc,
                                                itemCount: friends.length,
                                                itemBuilder: (_, i) {
                                                  final f = friends[i];
                                                  final checked =
                                                      temp.contains(f.phone);
                                                  return CheckboxListTile(
                                                    value: checked,
                                                    onChanged: (on) {
                                                      setModalState(() {
                                                        if (on == true) {
                                                          temp.add(f.phone);
                                                        } else {
                                                          temp.remove(f.phone);
                                                        }
                                                      });
                                                    },
                                                    activeColor: kPrimary,
                                                    title: Text(f.name,
                                                        overflow: TextOverflow
                                                            .ellipsis),
                                                    subtitle: Text(f.phone),
                                                    secondary: CircleAvatar(
                                                      radius: 12,
                                                      child: Text(f.avatar,
                                                          style:
                                                              const TextStyle(
                                                                  fontSize:
                                                                      12)),
                                                    ),
                                                  );
                                                },
                                              ),
                                            ),
                                            Padding(
                                              padding:
                                                  const EdgeInsets.fromLTRB(
                                                      16, 8, 16, 16),
                                              child: Row(
                                                children: [
                                                  TextButton(
                                                    onPressed: () =>
                                                        Navigator.pop(ctx),
                                                    child: const Text('Cancel'),
                                                  ),
                                                  const Spacer(),
                                                  ElevatedButton(
                                                    onPressed: () =>
                                                        Navigator.pop(
                                                            ctx, temp.toList()),
                                                    style: ElevatedButton
                                                        .styleFrom(
                                                      backgroundColor: kPrimary,
                                                      foregroundColor:
                                                          Colors.white,
                                                      shape:
                                                          RoundedRectangleBorder(
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(12),
                                                      ),
                                                    ),
                                                    child: const Text(
                                                        'Add Selected'),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      );
                                    },
                                  );
                                },
                              );
                            },
                          );
                          if (picked != null) {
                            final newSet = picked.toSet();
                            final previous = List<String>.from(selectedFriends);
                            for (final phone in previous) {
                              if (!newSet.contains(phone)) {
                                onToggleFriend(phone, false);
                              }
                            }
                            for (final phone in newSet) {
                              if (!previous.contains(phone)) {
                                onToggleFriend(phone, true);
                              }
                            }
                          }
                        } else {
                          onToggleFriend(v, true);
                        }
                      },
              ),
            ),
            const SizedBox(height: 10),
            if (selectedFriends.isNotEmpty)
              Wrap(
                spacing: 8,
                runSpacing: -4,
                children: selectedFriends.map((phone) {
                  FriendModel friend;
                  try {
                    friend = friends.firstWhere((f) => f.phone == phone);
                  } catch (_) {
                    friend = FriendModel(phone: phone, name: phone);
                  }
                  return InputChip(
                    avatar: Text(friend.avatar,
                        style: const TextStyle(fontSize: 16)),
                    label: Text(friend.name, overflow: TextOverflow.ellipsis),
                    onDeleted: saving
                        ? null
                        : () => onToggleFriend(friend.phone, false),
                  );
                }).toList(),
              )
            else
              const Text('No friends selected yet.',
                  style:
                      TextStyle(color: kSubtle, fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: 18),
          const _H2('Note for you (optional)'),
          const SizedBox(height: 8),
          if (isActive)
            _Box(
              child: TextField(
                controller: noteCtrl,
                maxLines: 2,
                enabled: !saving,
                decoration: _inputDec().copyWith(
                  hintText: 'Add a note about people/splits…',
                  prefixIcon:
                      const Icon(Icons.sticky_note_2_outlined, color: kPrimary),
                ),
              ),
            )
          else
            _Box(
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  noteCtrl.text.isNotEmpty ? noteCtrl.text : '—',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: noteCtrl.text.isNotEmpty ? kText : kSubtle),
                ),
              ),
            ),
          const SizedBox(height: 18),
          const _H2('Label'),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _Box(
                  child: DropdownButtonFormField<String?>(
                    initialValue: selectedLabel,
                    isExpanded: true,
                    decoration: _inputDec().copyWith(
                      labelText: "Select Label",
                      prefixIcon:
                          const Icon(Icons.label_important, color: kPrimary),
                    ),
                    items: [
                      const DropdownMenuItem<String?>(
                          value: null, child: Text('No label')),
                      ...labels.map(
                        (l) =>
                            DropdownMenuItem<String?>(value: l, child: Text(l)),
                      ),
                    ],
                    onChanged: saving
                        ? null
                        : (v) {
                            onLabelSelect(v);
                          },
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Box(
                  child: TextField(
                    controller: labelCtrl,
                    decoration: _inputDec().copyWith(
                      labelText: "Or type new label",
                      hintText: "Eg: Goa Trip",
                      prefixIcon: const Icon(Icons.create, color: kPrimary),
                    ),
                    onChanged: saving
                        ? null
                        : (v) {
                            if (v.isNotEmpty) onLabelSelect(null);
                          },
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 28),
          Row(
            children: [
              _GhostButton(text: 'Back', onPressed: saving ? null : onBack),
              const SizedBox(width: 12),
              Expanded(
                  child: _PrimaryButton(
                      text: 'Next', onPressed: saving ? null : onNext)),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------- Helper Widgets ----------------

class _H2 extends StatelessWidget {
  final String t;
  const _H2(this.t);
  @override
  Widget build(BuildContext context) {
    return Text(
      t,
      style: const TextStyle(
          color: kText, fontWeight: FontWeight.w800, fontSize: 16),
    );
  }
}

class _Box extends StatelessWidget {
  final Widget child;
  const _Box({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kLine),
        boxShadow: const [
          BoxShadow(
              color: Color(0x0F000000), blurRadius: 10, offset: Offset(0, 4))
        ],
      ),
      child: child,
    );
  }
}

class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: kLine, width: 1),
        boxShadow: const [
          BoxShadow(
              color: Color(0x12000000), blurRadius: 16, offset: Offset(0, 8))
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 3, sigmaY: 3), child: child),
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  const _PrimaryButton({required this.text, required this.onPressed});
  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: kPrimary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        elevation: 2,
      ),
      child: Text(text,
          style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800)),
    );
  }
}

class _GhostButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  const _GhostButton({required this.text, required this.onPressed});
  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        side: const BorderSide(color: kLine),
        foregroundColor: kText,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 18),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      child: Text(text, style: const TextStyle(fontWeight: FontWeight.w800)),
    );
  }
}

InputDecoration _inputDec() {
  final base = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: const BorderSide(color: kLine, width: 1),
  );
  return InputDecoration(
    filled: true,
    fillColor: Colors.white,
    hintStyle: const TextStyle(color: kSubtle),
    contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
    enabledBorder: base,
    focusedBorder: base.copyWith(
        borderSide: const BorderSide(color: kPrimary, width: 1.4)),
  );
}
