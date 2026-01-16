import 'dart:io';
import 'dart:ui';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:image_picker/image_picker.dart';

import '../utils/firebase_error_mapper.dart';
import '../utils/permissions_helper.dart';
import '../utils/phone_number_utils.dart';
import 'ads/sleek_ad_card.dart';
import 'add_friend_dialog.dart';

import '../services/group_service.dart';
import '../models/friend_model.dart';
import '../services/friend_service.dart';

class AddGroupDialog extends StatefulWidget {
  final String userPhone; // current user's phone (E.164)
  final List<FriendModel> allFriends;
  final void Function(String groupId)? onGroupCreated;

  const AddGroupDialog({
    required this.userPhone,
    required this.allFriends,
    this.onGroupCreated,
    Key? key,
  }) : super(key: key);

  @override
  State<AddGroupDialog> createState() => _AddGroupDialogState();
}

class _AddGroupDialogState extends State<AddGroupDialog> {
  final _formKey = GlobalKey<FormState>();
  final _groupNameCtrl = TextEditingController();
  final _friendSearchCtrl = TextEditingController();
  final _labelCtrl = TextEditingController();

  String _countryCode = kDefaultCountryCode; // default for contacts without +
  String? _error;
  bool _loading = false;

  File? _groupPhoto;

  String? _selectedType;
  final List<String> _groupTypes = const [
    'Trip',
    'Home',
    'Roommates',
    'Office',
    'Event',
    'Couple',
    'Other',
  ];

  // selections
  final List<FriendModel> _selectedFriends = [];
  late List<FriendModel> _filteredFriends;

  // contact picker cache
  List<Contact> _allContacts = const [];
  List<Contact> _filteredContacts = const [];
  bool _loadingContacts = false;

  final List<String> _countryCodes = kSupportedCountryCodes;

  @override
  void initState() {
    super.initState();
    _filteredFriends = List.of(widget.allFriends);
  }

  @override
  void dispose() {
    _groupNameCtrl.dispose();
    _friendSearchCtrl.dispose();
    _labelCtrl.dispose();
    super.dispose();
  }

  // ------------------------ Helpers ------------------------

  String _normalizeContactPhone(String raw) =>
      normalizeToE164(raw, fallbackCountryCode: _countryCode);

  /// Try to find an existing FriendModel by end-digit match.
  FriendModel? _matchFriendByPhone(String phoneE164) {
    final t = digitsOnly(phoneE164);
    for (final f in widget.allFriends) {
      final fd = digitsOnly(f.phone);
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
    final accent = Colors.black87;
    setState(() => _error = null);
    setState(() => _loadingContacts = true);

    final result = await getContactsWithPermission();
    if (!mounted) return;

    setState(() => _loadingContacts = false);

    if (result.permanentlyDenied) {
      await showContactsPermissionSettingsDialog(context);
      setState(() => _error = "Contacts permission denied");
      return;
    }

    if (!result.granted) {
      setState(() => _error = "Contacts permission denied");
      return;
    }

    if (result.hasError) {
      setState(() => _error = "Failed to load contacts");
      return;
    }

    if (result.contacts.isEmpty) {
      setState(() => _error = "No contacts with phone numbers found");
      return;
    }

    _allContacts = result.contacts;
    _filteredContacts = result.contacts;

    try {
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
                          Colors.white.withValues(alpha: 0.96),
                          Colors.white.withValues(alpha: 0.9)
                        ],
                      ),
                      border:
                      Border.all(color: Colors.white.withValues(alpha: 0.6)),
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
                            children: [
                              Icon(Icons.group_add_rounded, color: accent),
                              const SizedBox(width: 8),
                              Text(
                                "Select from Contacts",
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: accent,
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
                              color: accent.withValues(alpha: 0.06),
                              borderRadius: BorderRadius.circular(12),
                              border:
                              Border.all(color: Colors.grey.shade200),
                            ),
                            padding:
                            const EdgeInsets.symmetric(horizontal: 10),
                            child: Row(
                              children: [
                                Icon(Icons.search_rounded,
                                    size: 20, color: accent),
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
                                      accent.withValues(alpha: 0.10),
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
                                      accent,
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

  Future<void> _addFriendManualInline() async {
    String? createdPhone;
    final before = widget.allFriends.map((f) => f.phone).toSet();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AddFriendDialog(
        userPhone: widget.userPhone,
        onFriendCreated: (phone) => createdPhone = phone,
      ),
    );
    if (ok == true) {
      final friend = await _resolveFriend(createdPhone, before);
      if (friend != null && mounted) {
        setState(() {
          if (!_isSelected(friend)) {
            _selectedFriends.add(friend);
          }
          if (!widget.allFriends.any((f) => f.phone == friend.phone)) {
            widget.allFriends.add(friend);
          }
          if (!_filteredFriends.any((f) => f.phone == friend.phone)) {
            _filteredFriends = [..._filteredFriends, friend];
          }
        });
      }
    }
  }

  Future<FriendModel?> _resolveFriend(String? phone, Set<String> before) async {
    if (phone != null) {
      final byPhone = await FriendService().getFriendByPhone(widget.userPhone, phone);
      if (byPhone != null) return byPhone;
    }
    final snapshot = await FriendService().streamFriends(widget.userPhone).first;
    for (final friend in snapshot.reversed) {
      if (!before.contains(friend.phone)) {
        return friend;
      }
    }
    return null;
  }

  Future<void> _persistMeta(String groupId) async {
    final type = _selectedType?.trim();
    final label = _labelCtrl.text.trim();
    if ((type == null || type.isEmpty) && label.isEmpty) {
      return;
    }
    try {
      await FirebaseFirestore.instance
          .collection('groups')
          .doc(groupId)
          .collection('meta')
          .doc('info')
          .set({
        if (type != null && type.isNotEmpty) 'type': type,
        if (label.isNotEmpty) 'label': label,
        'createdAt': FieldValue.serverTimestamp(),
        'createdBy': widget.userPhone,
      }, SetOptions(merge: true));
    } catch (e, stack) {
      debugPrint('Group meta save failed: $e\n$stack');
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

      final displayNames = <String, String>{
        for (final f in _selectedFriends)
          if (f.name.trim().isNotEmpty) f.phone: f.name.trim(),
      };

      final groupId = await GroupService().addGroup(
        userPhone: widget.userPhone,
        name: _groupNameCtrl.text.trim(),
        memberPhones: _selectedFriends.map((f) => f.phone).toList(),
        createdBy: widget.userPhone,
        avatarUrl: avatarUrl,
        memberDisplayNames: displayNames.isEmpty ? null : displayNames,
      );

      await _persistMeta(groupId);
      widget.onGroupCreated?.call(groupId);

      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      setState(() {
        _loading = false;
        _error = mapFirebaseError(
          e,
          fallback: 'Could not create group. Please check your Firebase connection and try again.',
        );
      });
    }
  }

  // ------------------------ UI ------------------------

  @override
  Widget build(BuildContext context) {
    final accent = Colors.black87;
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
                  Colors.white.withValues(alpha: 0.96),
                  Colors.white.withValues(alpha: 0.90),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
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
                            color: accent.withValues(alpha: .10),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(Icons.group_add_rounded, color: accent),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            "Create Group",
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: accent,
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
                            backgroundColor: accent.withValues(alpha: 0.08),
                            backgroundImage: _groupPhoto != null
                                ? FileImage(_groupPhoto!) as ImageProvider
                                : null,
                            child: _groupPhoto == null
                                ? Icon(Icons.camera_alt_rounded,
                                    size: 30, color: accent)
                                : null,
                          ),
                          Positioned(
                            right: 0,
                            bottom: 0,
                            child: InkWell(
                              onTap: _pickGroupPhoto,
                              child: CircleAvatar(
                                radius: 14,
                                backgroundColor: accent,
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

                    DropdownButtonFormField<String>(
                      initialValue: _selectedType,
                      decoration: _pillDecoration(
                        label: "Group Type (optional)",
                        icon: Icons.style_rounded,
                      ),
                      isExpanded: true,
                      items: _groupTypes
                          .map((type) => DropdownMenuItem<String>(
                                value: type,
                                child: Text(type),
                              ))
                          .toList(),
                      onChanged: (value) => setState(() => _selectedType = value),
                    ),

                    const SizedBox(height: 10),

                    TextFormField(
                      controller: _labelCtrl,
                      decoration: _pillDecoration(
                        label: "Label / emoji (optional)",
                        icon: Icons.short_text_rounded,
                      ),
                      textInputAction: TextInputAction.next,
                    ),

                    const SizedBox(height: 10),

                    // Default country code for contacts (small)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 120,
                          child: DropdownButtonFormField<String>(
                            initialValue: _countryCode,
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
                              foregroundColor: accent,
                              side: BorderSide(color: accent.withValues(alpha: 0.35)),
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

                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        TextButton.icon(
                          onPressed: _loading ? null : _openContactsPicker,
                          icon: const Icon(Icons.contact_phone_rounded),
                          label: const Text('Add from Contacts'),
                        ),
                        TextButton.icon(
                          onPressed: _addFriendManualInline,
                          icon: const Icon(Icons.person_add_alt_1_rounded),
                          label: const Text('Add friend manually'),
                        ),
                      ],
                    ),

                    const SizedBox(height: 10),

                    // Friend multi-select (chips)
                    SizedBox(
                      height: 260,
                      child: ListView.builder(
                        itemCount: _filteredFriends.length,
                        itemBuilder: (_, i) {
                          final friend = _filteredFriends[i];
                          final selected = _isSelected(friend);
                          Widget leading;
                          if (friend.avatar.startsWith('http')) {
                            leading = CircleAvatar(
                              radius: 16,
                              backgroundImage: NetworkImage(friend.avatar),
                            );
                          } else if (friend.avatar.startsWith('assets/')) {
                            leading = CircleAvatar(
                              radius: 16,
                              backgroundImage: AssetImage(friend.avatar),
                            );
                          } else {
                            final initial = friend.avatar.isNotEmpty
                                ? friend.avatar.characters.first
                                : (friend.name.isNotEmpty
                                    ? friend.name.characters.first
                                    : '👤');
                            leading = CircleAvatar(
                              radius: 16,
                              child: Text(initial, style: const TextStyle(fontSize: 14)),
                            );
                          }
                          return CheckboxListTile(
                            value: selected,
                            onChanged: (v) => _toggleFriend(friend, v ?? false),
                            title: Text(friend.name, overflow: TextOverflow.ellipsis),
                            subtitle: Text(friend.phone),
                            secondary: leading,
                          );
                        },
                      ),
                    ),

                    const SizedBox(height: 10),

                    // Selected preview (removable chips)
                    if (_selectedFriends.isNotEmpty) ...[
                      Text(
                        "Selected",
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: accent,
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

                    const SleekAdCard(
                      margin: EdgeInsets.only(top: 6),
                      radius: 12,
                    ),

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
                            backgroundColor: accent,
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
      fillColor: Colors.black87.withValues(alpha: 0.06),
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
        borderSide: const BorderSide(color: Colors.black87),
      ),
    );
  }
}
