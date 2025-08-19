import 'dart:ui';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:permission_handler/permission_handler.dart';

import '../services/group_service.dart';
import '../models/friend_model.dart';

class AddGroupDialog extends StatefulWidget {
  final String userPhone; // current user's phone (E.164)
  final List<FriendModel> allFriends;

  const AddGroupDialog({
    required this.userPhone,
    required this.allFriends,
    Key? key,
  }) : super(key: key);

  @override
  State<AddGroupDialog> createState() => _AddGroupDialogState();
}

class _AddGroupDialogState extends State<AddGroupDialog> {
  final _formKey = GlobalKey<FormState>();
  final _groupNameCtrl = TextEditingController();
  final _friendSearchCtrl = TextEditingController();

  String _countryCode = '+91'; // default for contacts without +
  String? _error;
  bool _loading = false;

  File? _groupPhoto;

  // selections
  final List<FriendModel> _selectedFriends = [];
  late List<FriendModel> _filteredFriends;

  // contact picker cache
  List<Contact> _allContacts = const [];
  List<Contact> _filteredContacts = const [];
  bool _loadingContacts = false;

  final List<String> _countryCodes = const ['+91', '+1', '+44', '+84', '+81'];

  @override
  void initState() {
    super.initState();
    _filteredFriends = List.of(widget.allFriends);
  }

  @override
  void dispose() {
    _groupNameCtrl.dispose();
    _friendSearchCtrl.dispose();
    super.dispose();
  }

  // ------------------------ Helpers ------------------------

  String _digitsOnly(String s) => s.replaceAll(RegExp(r'\D'), '');

  String _normalizeContactPhone(String raw) {
    final trimmed = raw.trim();
    if (trimmed.startsWith('+')) {
      // keep + and digits
      return '+${_digitsOnly(trimmed)}';
    }
    final local = _digitsOnly(trimmed).replaceAll(RegExp(r'^0+'), '');
    return '$_countryCode$local';
  }

  /// Try to find an existing FriendModel by end-digit match.
  FriendModel? _matchFriendByPhone(String phoneE164) {
    final t = _digitsOnly(phoneE164);
    for (final f in widget.allFriends) {
      final fd = _digitsOnly(f.phone);
      if (fd.endsWith(t) || t.endsWith(fd)) return f;
    }
    return null;
  }

  bool _isSelected(FriendModel f) =>
      _selectedFriends.any((x) => x.phone == f.phone);

  void _toggleFriend(FriendModel f, bool v) {
    setState(() {
      if (v) {
        if (!_isSelected(f)) _selectedFriends.add(f);
      } else {
        _selectedFriends.removeWhere((x) => x.phone == f.phone);
      }
    });
  }

  // ------------------------ Group Photo ------------------------

  Future<void> _pickGroupPhoto() async {
    final picker = ImagePicker();
    final picked =
    await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (picked != null) {
      setState(() => _groupPhoto = File(picked.path));
    }
  }

  // ------------------------ Contacts Picker (searchable, multi-select) ------------------------

  Future<void> _openContactsPicker() async {
    setState(() => _error = null);
    final status = await Permission.contacts.request();
    if (!status.isGranted) {
      setState(() => _error = "Contacts permission denied");
      return;
    }
    try {
      if (!await FlutterContacts.requestPermission()) {
        setState(() => _error = "Contacts permission denied");
        return;
      }
      setState(() => _loadingContacts = true);
      final contacts = await FlutterContacts.getContacts(withProperties: true);
      contacts.sort((a, b) => a.displayName.compareTo(b.displayName));
      _allContacts = contacts;
      _filteredContacts = contacts;
      setState(() => _loadingContacts = false);

      final picked = await showModalBottomSheet<List<Contact>>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (ctx) {
          final searchCtrl = TextEditingController();
          final tempSelected = <Contact>{};

          return DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.85,
            maxChildSize: 0.95,
            minChildSize: 0.5,
            builder: (context, scrollController) {
              return ClipRRect(
                borderRadius:
                const BorderRadius.vertical(top: Radius.circular(24)),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Colors.white.withOpacity(0.96),
                          Colors.white.withOpacity(0.9)
                        ],
                      ),
                      border:
                      Border.all(color: Colors.white.withOpacity(0.6)),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x1F000000),
                          blurRadius: 20,
                          offset: Offset(0, -6),
                        ),
                      ],
                    ),
                    child: Column(
                      children: [
                        const SizedBox(height: 10),
                        Container(
                          width: 42,
                          height: 4,
                          decoration: BoxDecoration(
                            color: Colors.grey.shade300,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          child: Row(
                            children: const [
                              Icon(Icons.group_add_rounded,
                                  color: Color(0xFF09857a)),
                              SizedBox(width: 8),
                              Text(
                                "Select from Contacts",
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF09857a),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        // Search bar
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          child: Container(
                            decoration: BoxDecoration(
                              color: const Color(0xFF09857a).withOpacity(0.06),
                              borderRadius: BorderRadius.circular(12),
                              border:
                              Border.all(color: Colors.grey.shade200),
                            ),
                            padding:
                            const EdgeInsets.symmetric(horizontal: 10),
                            child: Row(
                              children: [
                                const Icon(Icons.search_rounded,
                                    size: 20, color: Color(0xFF09857a)),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: TextField(
                                    controller: searchCtrl,
                                    decoration: const InputDecoration(
                                      hintText: "Search contacts…",
                                      border: InputBorder.none,
                                    ),
                                    onChanged: (q) {
                                      final query =
                                      q.trim().toLowerCase();
                                      setState(() {
                                        _filteredContacts = _allContacts
                                            .where((c) {
                                          final name = c.displayName
                                              .toLowerCase();
                                          final phone = c.phones.isNotEmpty
                                              ? c.phones.first.number
                                              .toLowerCase()
                                              : '';
                                          return name.contains(query) ||
                                              phone.contains(query);
                                        }).toList();
                                      });
                                    },
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),

                        Expanded(
                          child: ListView.separated(
                            controller: scrollController,
                            itemCount: _filteredContacts.length,
                            separatorBuilder: (_, __) => Divider(
                                height: 1,
                                color: Colors.grey.shade200),
                            itemBuilder: (context, i) {
                              final c = _filteredContacts[i];
                              final phone =
                              c.phones.isNotEmpty ? c.phones.first.number : '';
                              final initial = c.displayName.isNotEmpty
                                  ? c.displayName[0].toUpperCase()
                                  : '👤';
                              final checked =
                              tempSelected.contains(c);

                              return ListTile(
                                leading: CircleAvatar(
                                  radius: 18,
                                  backgroundColor:
                                  const Color(0xFF09857a)
                                      .withOpacity(0.10),
                                  child: Text(initial,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w700)),
                                ),
                                title: Text(
                                  c.displayName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                subtitle: Text(
                                  phone,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                trailing: Checkbox(
                                  value: checked,
                                  onChanged: (v) {
                                    setState(() {
                                      if (v == true) {
                                        tempSelected.add(c);
                                      } else {
                                        tempSelected.remove(c);
                                      }
                                    });
                                  },
                                ),
                                onTap: () {
                                  setState(() {
                                    if (checked) {
                                      tempSelected.remove(c);
                                    } else {
                                      tempSelected.add(c);
                                    }
                                  });
                                },
                              );
                            },
                          ),
                        ),
                        const SizedBox(height: 6),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 10),
                          child: Row(
                            children: [
                              TextButton(
                                onPressed: () =>
                                    Navigator.pop(context, <Contact>[]),
                                child: const Text("Cancel"),
                              ),
                              const Spacer(),
                              ElevatedButton.icon(
                                onPressed: () => Navigator.pop(
                                    context, tempSelected.toList()),
                                icon: const Icon(Icons.check_rounded),
                                label: const Text("Add Selected"),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor:
                                  const Color(0xFF09857a),
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(
                                      borderRadius:
                                      BorderRadius.circular(12)),
                                  elevation: 6,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 6),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
      );

      if (picked == null) return;

      // Map selection to FriendModels, create placeholders if needed
      for (final c in picked) {
        final raw = c.phones.isNotEmpty ? c.phones.first.number : '';
        if (raw.isEmpty) continue;
        final e164 = _normalizeContactPhone(raw);
        final match = _matchFriendByPhone(e164);
        if (match != null) {
          _toggleFriend(match, true);
        } else {
          // create lightweight placeholder so we can still add their phone
          final placeholder = FriendModel(
            phone: e164,
            name: c.displayName,
            avatar: '👤',
          );
          if (!_isSelected(placeholder)) {
            _selectedFriends.add(placeholder);
          }
          setState(() {});
        }
      }
    } catch (e) {
      setState(() => _error = "Failed to import contact: $e");
    }
  }

  // ------------------------ Submit ------------------------

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate() || _selectedFriends.isEmpty) {
      setState(() => _error = "Add at least one friend to the group");
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // (OPTIONAL) Upload _groupPhoto to Storage and obtain URL
      String? avatarUrl;
      // TODO: upload and set avatarUrl

      await GroupService().addGroup(
        userPhone: widget.userPhone,
        name: _groupNameCtrl.text.trim(),
        memberPhones: _selectedFriends.map((f) => f.phone).toList(),
        createdBy: widget.userPhone,
        avatarUrl: avatarUrl,
      );

      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  // ------------------------ UI ------------------------

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 22),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Colors.white.withOpacity(0.96),
                  Colors.white.withOpacity(0.90),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              border: Border.all(color: Colors.white.withOpacity(0.6)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x1F000000),
                  blurRadius: 22,
                  offset: Offset(0, 10),
                ),
              ],
            ),
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
            child: Form(
              key: _formKey,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0xFF09857a).withOpacity(.10),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.group_add_rounded,
                              color: Color(0xFF09857a)),
                        ),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            "Create Group",
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF096A63),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // Group photo
                    Center(
                      child: Stack(
                        children: [
                          CircleAvatar(
                            radius: 40,
                            backgroundColor: const Color(0xFF09857a)
                                .withOpacity(0.08),
                            backgroundImage: _groupPhoto != null
                                ? FileImage(_groupPhoto!) as ImageProvider
                                : null,
                            child: _groupPhoto == null
                                ? const Icon(Icons.camera_alt_rounded,
                                size: 30, color: Color(0xFF09857a))
                                : null,
                          ),
                          Positioned(
                            right: 0,
                            bottom: 0,
                            child: InkWell(
                              onTap: _pickGroupPhoto,
                              child: CircleAvatar(
                                radius: 14,
                                backgroundColor: const Color(0xFF09857a),
                                child: const Icon(Icons.edit,
                                    size: 14, color: Colors.white),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Center(
                      child: TextButton(
                        onPressed: _pickGroupPhoto,
                        child: const Text("Set Group Photo"),
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Group name
                    TextFormField(
                      controller: _groupNameCtrl,
                      decoration: _pillDecoration(
                        label: "Group Name",
                        icon: Icons.group_rounded,
                      ),
                      validator: (v) =>
                      (v == null || v.trim().isEmpty)
                          ? "Enter a group name"
                          : null,
                    ),

                    const SizedBox(height: 10),

                    // Default country code for contacts (small)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 120,
                          child: DropdownButtonFormField<String>(
                            value: _countryCode,
                            decoration: _pillDecoration(label: "Country"),
                            isExpanded: true,
                            items: _countryCodes
                                .map((c) => DropdownMenuItem<String>(
                              value: c,
                              child: Text(c),
                            ))
                                .toList(),
                            onChanged: (v) => setState(
                                    () => _countryCode = v ?? '+91'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _loading ? null : _openContactsPicker,
                            icon: _loadingContacts
                                ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2),
                            )
                                : const Icon(Icons.contacts_rounded),
                            label: Text(_loadingContacts
                                ? "Loading…"
                                : "Select From Contacts"),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFF09857a),
                              side: BorderSide(
                                  color: const Color(0xFF09857a)
                                      .withOpacity(0.35)),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12)),
                              padding:
                              const EdgeInsets.symmetric(vertical: 12),
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 12),

                    // Search in-app friends
                    TextField(
                      controller: _friendSearchCtrl,
                      decoration: _pillDecoration(
                        label: "Search friends…",
                        icon: Icons.search_rounded,
                      ),
                      onChanged: (q) {
                        final query = q.trim().toLowerCase();
                        setState(() {
                          _filteredFriends = widget.allFriends.where((f) {
                            final name = f.name.toLowerCase();
                            final phone = f.phone.toLowerCase();
                            return name.contains(query) ||
                                phone.contains(query);
                          }).toList();
                        });
                      },
                    ),

                    const SizedBox(height: 10),

                    // Friend multi-select (chips)
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: _filteredFriends.map((friend) {
                        final selected = _isSelected(friend);
                        final a = friend.avatar;
                        final avatar = a.startsWith('http')
                            ? CircleAvatar(
                          radius: 10,
                          backgroundImage: NetworkImage(a),
                        )
                            : (a.startsWith('assets/')
                            ? CircleAvatar(
                          radius: 10,
                          backgroundImage: AssetImage(a),
                        )
                            : CircleAvatar(
                          radius: 10,
                          child: Text(
                            a.isNotEmpty
                                ? a.characters.first
                                : friend.name.characters.first,
                            style: const TextStyle(fontSize: 12),
                          ),
                        ));
                        return FilterChip(
                          avatar: avatar,
                          label: Text(friend.name,
                              overflow: TextOverflow.ellipsis),
                          selected: selected,
                          onSelected: (v) => _toggleFriend(friend, v),
                        );
                      }).toList(),
                    ),

                    const SizedBox(height: 10),

                    // Selected preview (removable chips)
                    if (_selectedFriends.isNotEmpty) ...[
                      const Text(
                        "Selected",
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF09857a),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: _selectedFriends.map((f) {
                          return InputChip(
                            label: Text(f.name,
                                overflow: TextOverflow.ellipsis),
                            onDeleted: () => _toggleFriend(f, false),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 6),
                    ],

                    if (_error != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        _error!,
                        style: const TextStyle(
                            color: Colors.red, fontWeight: FontWeight.w600),
                      ),
                    ],

                    const SizedBox(height: 14),

                    // Actions
                    Row(
                      children: [
                        TextButton(
                          onPressed: _loading
                              ? null
                              : () => Navigator.pop(context, false),
                          child: const Text("Cancel"),
                        ),
                        const Spacer(),
                        _loading
                            ? const SizedBox(
                          width: 26,
                          height: 26,
                          child: CircularProgressIndicator(
                              strokeWidth: 2.6),
                        )
                            : ElevatedButton.icon(
                          onPressed: _submit,
                          icon: const Icon(Icons.check_rounded),
                          label: const Text("Create"),
                          style: ElevatedButton.styleFrom(
                            backgroundColor:
                            const Color(0xFF09857a),
                            foregroundColor: Colors.white,
                            elevation: 6,
                            shape: RoundedRectangleBorder(
                                borderRadius:
                                BorderRadius.circular(14)),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 12),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // Shared pill decoration
  InputDecoration _pillDecoration({required String label, IconData? icon}) {
    return InputDecoration(
      labelText: label,
      prefixIcon: icon != null ? Icon(icon) : null,
      filled: true,
      fillColor: const Color(0xFF09857a).withOpacity(0.06),
      contentPadding:
      const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF09857a)),
      ),
    );
  }
}
