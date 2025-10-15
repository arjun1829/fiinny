// lib/group/group_settings_sheet.dart
import 'dart:io' show File;
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:lifemap/services/group_service.dart';
import 'package:lifemap/utils/firebase_error_mapper.dart';
import 'package:lifemap/utils/permissions_helper.dart';
import 'package:lifemap/utils/phone_number_utils.dart';

import '../models/group_model.dart';
import '../models/friend_model.dart';
import 'group_rename_dialog.dart';
import 'group_remove_members_sheet.dart';

class GroupSettingsSheet extends StatelessWidget {
  final String currentUserPhone;
  final GroupModel group;
  final List<FriendModel> members; // resolved
  final VoidCallback? onChanged;   // call to refresh parent

  const GroupSettingsSheet({
    Key? key,
    required this.currentUserPhone,
    required this.group,
    required this.members,
    this.onChanged,
  }) : super(key: key);

  static Future<void> show(
      BuildContext context, {
        required String currentUserPhone,
        required GroupModel group,
        required List<FriendModel> members,
        VoidCallback? onChanged,
      }) {
    return showModalBottomSheet(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => FractionallySizedBox(
        heightFactor: 0.96,
        child: GroupSettingsSheet(
          currentUserPhone: currentUserPhone,
          group: group,
          members: members,
          onChanged: onChanged,
        ),
      ),
    );
  }

  bool get _isCreator => group.createdBy == currentUserPhone;

  // ---------------- UI ----------------
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 18, 12, 24),
        children: [
          _GlassHeaderCard(
            name: group.name,
            memberCount: members.length,
            avatarUrl: group.avatarUrl,
            onRename: () => _rename(context),
            onChangePhoto: () => _changePhoto(context),
          ),

          const SizedBox(height: 18),
          _SectionLabel('Members'),

          _GlassActionButton(
            icon: Icons.group_add_rounded,
            title: 'Add members',
            subtitle: 'Review list, then add from contacts',
            onTap: () => _openAddMembersFlow(context),
          ),
          _GlassActionButton(
            icon: Icons.person_remove_alt_1_rounded,
            title: 'Remove members',
            onTap: () => _removeMembers(context),
          ),

          const SizedBox(height: 18),
          _SectionLabel('Danger zone'),

          _GlassActionButton(
            icon: Icons.exit_to_app_rounded,
            title: 'Leave group',
            danger: true,
            onTap: () => _leaveGroup(context),
          ),
          if (_isCreator)
            _GlassActionButton(
              icon: Icons.delete_forever_rounded,
              title: 'Delete group',
              danger: true,
              onTap: () => _deleteGroup(context),
            ),
        ],
      ),
    );
  }

  // ---------------- ADD MEMBERS FLOW ----------------
  Future<void> _openAddMembersFlow(BuildContext context) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _AddMembersReviewSheet(
        groupId: group.id,
        members: members,
        currentUserPhone: currentUserPhone,
      ),
    );
    if (changed == true) onChanged?.call();
  }

  // ---------------- EXISTING ACTIONS (kept API) ----------------
  Future<void> _rename(BuildContext context) async {
    final newName = await showDialog<String>(
      context: context,
      builder: (_) => GroupRenameDialog(initial: group.name),
    );
    if (newName == null || newName.trim().isEmpty) return;
    await FirebaseFirestore.instance.collection('groups').doc(group.id).update({
      'name': newName.trim(),
    });
    onChanged?.call();
  }

  Future<void> _removeMembers(BuildContext context) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => GroupRemoveMembersSheet(
        currentUserPhone: currentUserPhone,
        group: group,
        members: members,
      ),
    );
    if (changed == true) onChanged?.call();
  }

  Future<void> _leaveGroup(BuildContext context) async {
    if (_isCreator) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Creators can't leave. Transfer ownership first.")),
      );
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave group?'),
        content: const Text('You will be removed from this group.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Leave')),
        ],
      ),
    );
    if (ok != true) return;
    await FirebaseFirestore.instance.collection('groups').doc(group.id).update({
      'memberPhones': FieldValue.arrayRemove([currentUserPhone]),
    });
    onChanged?.call();
    if (context.mounted) Navigator.pop(context); // close settings
  }

  Future<void> _deleteGroup(BuildContext context) async {
    if (!_isCreator) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete group?'),
        content: const Text('This cannot be undone and removes history for everyone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await FirebaseFirestore.instance.collection('groups').doc(group.id).delete();
    if (context.mounted) Navigator.pop(context); // close settings
    Navigator.of(context).maybePop(); // pop detail screen
  }

  // ---------------- PHOTO HELPERS (unchanged core) ----------------
  Future<void> _changePhoto(BuildContext context) async {
    final picker = ImagePicker();

    Future<void> uploadBytes(Uint8List bytes, String contentType) async {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (_) => const Center(child: CircularProgressIndicator()),
      );
      try {
        final prev = (group.avatarUrl ?? '').trim();
        if (prev.isNotEmpty) {
          try {
            await FirebaseStorage.instance.refFromURL(prev).delete();
          } catch (_) {}
        }

        final ref = FirebaseStorage.instance
            .ref()
            .child('group_avatars')
            .child('${group.id}_${DateTime.now().millisecondsSinceEpoch}.jpg');

        final meta = SettableMetadata(contentType: contentType);
        await ref.putData(bytes, meta);
        final url = await ref.getDownloadURL();

        await FirebaseFirestore.instance
            .collection('groups')
            .doc(group.id)
            .update({'avatarUrl': url});

        onChanged?.call();
        if (context.mounted) {
          Navigator.of(context, rootNavigator: true).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Group photo updated')),
          );
        }
      } catch (e) {
        if (context.mounted) {
          Navigator.of(context, rootNavigator: true).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to update photo: $e')),
          );
        }
      }
    }

    Future<void> uploadFilePath(String path, String contentType) async {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (_) => const Center(child: CircularProgressIndicator()),
      );
      try {
        final prev = (group.avatarUrl ?? '').trim();
        if (prev.isNotEmpty) {
          try {
            await FirebaseStorage.instance.refFromURL(prev).delete();
          } catch (_) {}
        }

        final ref = FirebaseStorage.instance
            .ref()
            .child('group_avatars')
            .child('${group.id}_${DateTime.now().millisecondsSinceEpoch}.jpg');

        final meta = SettableMetadata(contentType: contentType);
        await ref.putFile(File(path), meta);
        final url = await ref.getDownloadURL();

        await FirebaseFirestore.instance
            .collection('groups')
            .doc(group.id)
            .update({'avatarUrl': url});

        onChanged?.call();
        if (context.mounted) {
          Navigator.of(context, rootNavigator: true).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Group photo updated')),
          );
        }
      } catch (e) {
        if (context.mounted) {
          Navigator.of(context, rootNavigator: true).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to update photo: $e')),
          );
        }
      }
    }

    void showPickSheet() {
      showModalBottomSheet(
        context: context,
        useSafeArea: true,
        backgroundColor: Theme.of(context).cardColor,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        builder: (ctx) => SafeArea(
          child: Wrap(
            children: [
              if (!kIsWeb)
                ListTile(
                  leading: const Icon(Icons.camera_alt_rounded),
                  title: const Text('Take photo'),
                  onTap: () async {
                    Navigator.pop(ctx);
                    try {
                      final x = await picker.pickImage(
                        source: ImageSource.camera,
                        imageQuality: 82,
                      );
                      if (x == null) return;
                      final bytes = await x.readAsBytes();
                      await uploadBytes(bytes, 'image/jpeg');
                    } catch (_) {}
                  },
                ),
              if (!kIsWeb)
                ListTile(
                  leading: const Icon(Icons.photo_library_rounded),
                  title: const Text('Choose from gallery'),
                  onTap: () async {
                    Navigator.pop(ctx);
                    try {
                      final x = await picker.pickImage(
                        source: ImageSource.gallery,
                        imageQuality: 82,
                      );
                      if (x == null) return;
                      final bytes = await x.readAsBytes();
                      await uploadBytes(bytes, 'image/jpeg');
                    } catch (_) {}
                  },
                ),
              ListTile(
                leading: const Icon(Icons.upload_file_rounded),
                title: const Text('Upload image'),
                onTap: () async {
                  Navigator.pop(ctx);
                  try {
                    final res = await FilePicker.platform.pickFiles(
                      allowMultiple: false,
                      withData: kIsWeb,
                      type: FileType.image,
                    );
                    if (res == null || res.files.isEmpty) return;
                    final f = res.files.first;
                    final mime = _guessImageMime(f.name);
                    if (kIsWeb) {
                      final bytes = f.bytes;
                      if (bytes == null) return;
                      await uploadBytes(bytes, mime);
                    } else {
                      final path = f.path;
                      if (path == null) return;
                      await uploadFilePath(path, mime);
                    }
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Pick failed: $e')),
                      );
                    }
                  }
                },
              ),
              if ((group.avatarUrl ?? '').isNotEmpty)
                ListTile(
                  leading: const Icon(Icons.delete_outline, color: Colors.redAccent),
                  title: const Text('Remove photo', style: TextStyle(color: Colors.redAccent)),
                  onTap: () async {
                    Navigator.pop(ctx);
                    showDialog(
                      context: context,
                      barrierDismissible: false,
                      builder: (_) => const Center(child: CircularProgressIndicator()),
                    );
                    try {
                      final prev = (group.avatarUrl ?? '').trim();
                      if (prev.isNotEmpty) {
                        try {
                          await FirebaseStorage.instance.refFromURL(prev).delete();
                        } catch (_) {}
                      }
                      await FirebaseFirestore.instance
                          .collection('groups')
                          .doc(group.id)
                          .update({'avatarUrl': FieldValue.delete()});
                      onChanged?.call();
                      if (context.mounted) {
                        Navigator.of(context, rootNavigator: true).pop();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Group photo removed')),
                        );
                      }
                    } catch (e) {
                      if (context.mounted) {
                        Navigator.of(context, rootNavigator: true).pop();
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Failed to remove: $e')),
                        );
                      }
                    }
                  },
                ),
            ],
          ),
        ),
      );
    }

    showPickSheet();
  }

  String _guessImageMime(String name) {
    final n = name.toLowerCase();
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.webp')) return 'image/webp';
    if (n.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }
}

// ---------------- Glass UI Pieces ----------------

class _GlassHeaderCard extends StatelessWidget {
  final String name;
  final int memberCount;
  final String? avatarUrl;
  final VoidCallback onRename;
  final VoidCallback onChangePhoto;

  const _GlassHeaderCard({
    required this.name,
    required this.memberCount,
    required this.avatarUrl,
    required this.onRename,
    required this.onChangePhoto,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _glassDecoration(context),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Stack(
            children: [
              CircleAvatar(
                radius: 34,
                backgroundImage: (avatarUrl != null && avatarUrl!.isNotEmpty)
                    ? NetworkImage(avatarUrl!)
                    : null,
                child: (avatarUrl == null || avatarUrl!.isEmpty)
                    ? Text(
                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
                )
                    : null,
              ),
              Positioned(
                bottom: -2,
                right: -2,
                child: Material(
                  color: const Color(0xFF10B981), // mint badge
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: onChangePhoto,
                    child: const Padding(
                      padding: EdgeInsets.all(6),
                      child: Icon(Icons.photo_camera_rounded, size: 16, color: Colors.white),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: onRename,
                      icon: const Icon(Icons.edit_rounded),
                      tooltip: 'Rename',
                    )
                  ],
                ),
                Text(
                  '$memberCount member${memberCount == 1 ? '' : 's'}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.7),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _GlassActionButton extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final bool danger;
  final VoidCallback? onTap;

  const _GlassActionButton({
    required this.icon,
    required this.title,
    this.subtitle,
    this.danger = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final textColor = danger ? const Color(0xFFFF6B6B) : Theme.of(context).textTheme.bodyLarge?.color;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: _glassDecoration(context),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Icon(icon, size: 22, color: danger ? const Color(0xFFFF6B6B) : const Color(0xFF10B981)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: textColor,
                          fontWeight: FontWeight.w600,
                        )),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ]
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

BoxDecoration _glassDecoration(BuildContext context) {
  // Mint-glass look: subtle gradient, light border, soft shadow.
  return BoxDecoration(
    gradient: const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        Color(0x66ECFDF5), // mint glass
        Color(0x33D1FAE5),
      ],
    ),
    borderRadius: BorderRadius.circular(16),
    border: Border.all(color: const Color(0x55B7F7E7)),
    boxShadow: const [
      BoxShadow(
        blurRadius: 16,
        offset: Offset(0, 6),
        color: Color(0x1A000000),
      ),
    ],
  );
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 6),
      child: Text(
        text,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

// ---------------- Add Members: review then contacts picker ----------------

class _AddMembersReviewSheet extends StatefulWidget {
  final String groupId;
  final List<FriendModel> members;
  final String currentUserPhone;

  const _AddMembersReviewSheet({
    Key? key,
    required this.groupId,
    required this.members,
    required this.currentUserPhone,
  }) : super(key: key);

  @override
  State<_AddMembersReviewSheet> createState() => _AddMembersReviewSheetState();
}

class _AddMembersReviewSheetState extends State<_AddMembersReviewSheet> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Scaffold(
        appBar: AppBar(title: const Text('Add members')),
        body: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                children: [
                  _SectionLabel('Existing members'),
                  if (widget.members.isEmpty)
                    _EmptyState(
                      title: 'No members yet',
                      subtitle: 'Start by adding people from your contacts.',
                    )
                  else
                    ...widget.members.map((m) => ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                      leading: CircleAvatar(child: Text(_initials(m.name))),
                      title: Text(m.name),
                      subtitle: Row(
                        children: [
                          if ((m.phone ?? '').isNotEmpty) Text(m.phone!),
                          if ((m.phone ?? '').isEmpty && (m.email ?? '').isNotEmpty)
                            Text(m.email!),
                        ],
                      ),
                    )),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _busy
                        ? null
                        : () async {
                      setState(() => _busy = true);
                      final changed = await showModalBottomSheet<bool>(
                        context: context,
                        isScrollControlled: true,
                        useSafeArea: true,
                        showDragHandle: true,
                        shape: const RoundedRectangleBorder(
                          borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
                        ),
                        builder: (_) => _ContactsPickerSheet(
                          groupId: widget.groupId,
                          defaultCountryCode: inferCountryCode(
                            widget.currentUserPhone,
                            fallback: kDefaultCountryCode,
                          ),
                        ),
                      );
                      if (!mounted) return;
                      setState(() => _busy = false);
                      Navigator.pop(context, changed == true);
                    },
                    icon: const Icon(Icons.contacts_rounded),
                    label: Text(_busy ? 'Opening…' : 'Add from contacts'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}

class _ContactsPickerSheet extends StatefulWidget {
  final String groupId;
  final String defaultCountryCode;
  const _ContactsPickerSheet({
    Key? key,
    required this.groupId,
    required this.defaultCountryCode,
  }) : super(key: key);

  @override
  State<_ContactsPickerSheet> createState() => _ContactsPickerSheetState();
}

class _ContactsPickerSheetState extends State<_ContactsPickerSheet> {
  final TextEditingController _search = TextEditingController();
  List<Contact> _contacts = [];
  final Set<String> _selectedPhones = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future.delayed(const Duration(milliseconds: 250));
      if (!mounted) return;
      await _loadContacts();
    });
  }

  Future<void> _loadContacts() async {
    final result = await getContactsWithPermission();
    if (!mounted) return;

    if (result.permanentlyDenied) {
      await showContactsPermissionSettingsDialog(context);
      setState(() {
        _loading = false;
        _contacts = [];
      });
      return;
    }

    if (!result.granted || result.hasError) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.hasError
                  ? 'Failed to load contacts'
                  : 'Contacts permission denied',
            ),
          ),
        );
      }
      setState(() {
        _loading = false;
        _contacts = [];
      });
      return;
    }

    setState(() {
      _contacts = result.contacts;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filter(_contacts, _search.text);

    return SafeArea(
      child: Scaffold(
        appBar: AppBar(title: const Text('Pick contacts')),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
              child: TextField(
                controller: _search,
                decoration: InputDecoration(
                  hintText: 'Search name or phone',
                  prefixIcon: const Icon(Icons.search),
                  filled: true,
                  fillColor: Theme.of(context).cardColor.withOpacity(0.6),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(color: Theme.of(context).dividerColor),
                  ),
                ),
                onChanged: (_) => setState(() {}),
              ),
            ),
            if (_loading)
              const Expanded(child: Center(child: CircularProgressIndicator()))
            else if (filtered.isEmpty)
              const Expanded(child: Center(child: Text('No contacts found')))
            else
              Expanded(
                child: ListView.builder(
                  itemCount: filtered.length,
                  itemBuilder: (_, i) {
                    final c = filtered[i];
                    final phone = _firstPhone(c);
                    final normalized = _normalizePhone(phone ?? '');
                    final isSel = _selectedPhones.contains(normalized);
                    return ListTile(
                      leading: CircleAvatar(
                        child: Text(
                          (c.displayName.isNotEmpty ? c.displayName[0] : '?').toUpperCase(),
                        ),
                      ),
                      title: Text(c.displayName),
                      subtitle: Text(phone ?? ''),
                      trailing: Checkbox(
                        value: isSel,
                        onChanged: (v) {
                          setState(() {
                            if (v == true) {
                              if (normalized.isNotEmpty) _selectedPhones.add(normalized);
                            } else {
                              _selectedPhones.remove(normalized);
                            }
                          });
                        },
                      ),
                      onTap: () {
                        setState(() {
                          if (isSel) {
                            _selectedPhones.remove(normalized);
                          } else {
                            if (normalized.isNotEmpty) _selectedPhones.add(normalized);
                          }
                        });
                      },
                    );
                  },
                ),
              ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.person_add_alt_1_rounded),
                    label: Text(_selectedPhones.isEmpty
                        ? 'Add selected'
                        : 'Add ${_selectedPhones.length} selected'),
                    onPressed: _selectedPhones.isEmpty ? null : _commitAdd,
                    style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Contact> _filter(List<Contact> list, String q) {
    final qq = q.trim().toLowerCase();
    if (qq.isEmpty) return list;
    return list.where((c) {
      final name = c.displayName.toLowerCase();
      final phones = c.phones.map((p) => p.number).join(' ').toLowerCase();
      return name.contains(qq) || phones.contains(qq);
    }).toList();
  }

  String? _firstPhone(Contact c) =>
      c.phones.isNotEmpty ? c.phones.first.number : null;

  String _normalizePhone(String raw) => normalizeToE164(
        raw,
        fallbackCountryCode: widget.defaultCountryCode,
      );

  Future<void> _commitAdd() async {
    // Write to group's memberPhones array
    final phones = _selectedPhones.where((p) => p.isNotEmpty).toList();
    if (phones.isEmpty) return;
    try {
      await GroupService().addMembers(widget.groupId, phones);
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            mapFirebaseError(
              e,
              fallback: 'Failed to add members. Please check your Firebase connection and try again.',
            ),
          ),
        ),
      );
    }
  }
}

// ---------------- Small helpers ----------------

class _EmptyState extends StatelessWidget {
  final String title;
  final String subtitle;
  const _EmptyState({required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 6, bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: _glassDecoration(context),
      child: Row(
        children: [
          const Icon(Icons.info_outline_rounded),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.7),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
