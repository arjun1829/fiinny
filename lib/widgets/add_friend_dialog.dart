// lib/widgets/add_friend_dialog.dart
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';

import '../core/ads/ads_shell.dart';
import 'ads/sleek_ad_card.dart';
import '../services/friend_service.dart';
import '../ui/theme/small_typography_overlay.dart';
import '../utils/firebase_error_mapper.dart';
import '../utils/permissions_helper.dart';
import '../utils/phone_number_utils.dart';

class AddFriendDialog extends StatefulWidget {
  final String userPhone; // current user's phone (E.164, e.g. +91xxx)
  final void Function(String phone)? onFriendCreated;
  final bool autoOpenContacts;

  const AddFriendDialog({
    required this.userPhone,
    this.onFriendCreated,
    this.autoOpenContacts = false,
    Key? key,
  }) : super(key: key);

  @override
  State<AddFriendDialog> createState() => _AddFriendDialogState();
}

class _AddFriendDialogState extends State<AddFriendDialog> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();

  String _countryCode = kDefaultCountryCode;
  String? _error;
  bool _loading = false;

  // contact picker state
  List<Contact> _allContacts = const [];
  List<Contact> _filtered = const [];
  bool _loadingContacts = false;

  final List<String> countryCodes = kSupportedCountryCodes;

  @override
  void initState() {
    super.initState();
    if (widget.autoOpenContacts) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _importFromContacts();
      });
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  // ------------------------ Contacts picker (searchable) ------------------------
  Future<void> _importFromContacts() async {
    final accent = Colors.black87;
    setState(() => _error = null);
    setState(() {
      _loadingContacts = true;
    });

    final result = await getContactsWithPermission();
    if (!mounted) return;

    setState(() {
      _loadingContacts = false;
    });

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
    _filtered = result.contacts;

    try {
      final picked = await showModalBottomSheet<Contact?>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (ctx) {
          final searchCtrl = TextEditingController();
          return DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.85,
            minChildSize: 0.5,
            maxChildSize: 0.95,
            builder: (context, scrollController) {
              return ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Colors.white.withOpacity(0.95),
                          Colors.white.withOpacity(0.88),
                        ],
                      ),
                      border: Border.all(color: Colors.white.withOpacity(0.6)),
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
                              Icon(Icons.contacts_rounded, color: accent),
                              const SizedBox(width: 8),
                              Text(
                                "Pick a contact",
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
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          child: Container(
                            decoration: BoxDecoration(
                              color: accent.withOpacity(0.06),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.grey.shade200),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            child: Row(
                              children: [
                                Icon(Icons.search_rounded, size: 20, color: accent),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: TextField(
                                    controller: searchCtrl,
                                    decoration: const InputDecoration(
                                      hintText: "Search contacts…",
                                      border: InputBorder.none,
                                    ),
                                    onChanged: (q) {
                                      final query = q.trim().toLowerCase();
                                      setState(() {
                                        _filtered = _allContacts.where((c) {
                                          final name = c.displayName.toLowerCase();
                                          final phone = c.phones.isNotEmpty ? c.phones.first.number.toLowerCase() : '';
                                          return name.contains(query) || phone.contains(query);
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
                            itemCount: _filtered.length,
                            separatorBuilder: (_, __) => Divider(height: 1, color: Colors.grey.shade200),
                            itemBuilder: (context, i) {
                              final c = _filtered[i];
                              final display = c.displayName;
                              final phone = c.phones.isNotEmpty ? c.phones.first.number : '';
                              final initial = display.isNotEmpty ? display[0].toUpperCase() : '👤';
                              return ListTile(
                                leading: CircleAvatar(
                                  radius: 20,
                                  backgroundColor: accent.withOpacity(0.10),
                                  child: Text(initial, style: const TextStyle(fontWeight: FontWeight.w700)),
                                ),
                                title: Text(display, maxLines: 1, overflow: TextOverflow.ellipsis),
                                subtitle: Text(phone, maxLines: 1, overflow: TextOverflow.ellipsis),
                                onTap: () => Navigator.pop(context, c),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
      );

      if (picked != null) {
        final contactName = picked.displayName;
        final raw = picked.phones.isNotEmpty ? picked.phones.first.number : '';
        final parsed = splitPhone(raw, fallbackCountryCode: _countryCode);
        setState(() {
          _nameCtrl.text = contactName;
          _countryCode = parsed.countryCode;
          _phoneCtrl.text = parsed.localDigits;
        });
      }
    } catch (e) {
      setState(() => _error = "Failed to import contact: $e");
    }
  }

  // ------------------------ Phone helpers / normalization ------------------------
  String get _fullE164 {
    return normalizeToE164('${_countryCode}${_phoneCtrl.text}',
        fallbackCountryCode: _countryCode);
  }

  // ------------------------ Submit ------------------------
  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await FriendService().addFriendByPhone(
        userPhone: widget.userPhone,
        friendName: _nameCtrl.text.trim(),
        friendPhone: _fullE164,
      );
      widget.onFriendCreated?.call(_fullE164);
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      setState(() {
        _loading = false;
        _error = mapFirebaseError(
          e,
          fallback: 'Could not add friend. Please check your Firebase connection and try again.',
        );
      });
    }
  }

  // ------------------------ UI ------------------------
  @override
  Widget build(BuildContext context) {
    final safeBottom = context.adsBottomPadding();
    final accent = Colors.black87;
    // Glassy dialog body
    return Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
            child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Colors.white.withOpacity(0.96),
                  Colors.white.withOpacity(0.90),
                ],
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
            padding: EdgeInsets.fromLTRB(20, 18, 20, safeBottom + 14),
            child: Form(
              key: _formKey,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Header
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: accent.withOpacity(.10),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(Icons.person_add_alt_1_rounded,
                              color: accent),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            "Add Friend",
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

                    // Import from contacts
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        icon: _loadingContacts
                            ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                            : const Icon(Icons.contacts_rounded),
                        label: Text(_loadingContacts ? "Loading contacts…" : "Add from Contacts"),
                        onPressed: _loading || _loadingContacts ? null : _importFromContacts,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: accent,
                          side: BorderSide(color: accent.withOpacity(0.35)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),

                    const SizedBox(height: 16),

                    // Name
                    _GlassField(
                      controller: _nameCtrl,
                      label: "Name",
                      icon: Icons.person,
                      validator: (v) => (v == null || v.trim().isEmpty) ? "Enter a name" : null,
                    ),

                    const SizedBox(height: 12),

                    // Country code + phone row
                    Row(
                      children: [
                        SizedBox(
                          width: 92,
                          child: DropdownButtonFormField<String>(
                            value: _countryCode,
                            isExpanded: true,
                            decoration: _pillDecoration(label: "Code"),
                            items: countryCodes
                                .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                                .toList(),
                            onChanged: _loading ? null : (v) => setState(() => _countryCode = v ?? '+91'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextFormField(
                            controller: _phoneCtrl,
                            decoration: _pillDecoration(
                              label: "Phone Number",
                              icon: Icons.phone,
                            ),
                            keyboardType: TextInputType.phone,
                            validator: (v) {
                              final s = (v ?? '').trim();
                              if (s.isEmpty) return "Enter phone";
                              if (!RegExp(r'^[0-9]{8,15}$').hasMatch(s)) return "Enter valid phone";
                              return null;
                            },
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 8),

                    // Preview of final E.164
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        "Will be saved as  $_fullE164",
                        style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700, fontWeight: FontWeight.w600),
                      ),
                    ),

                    if (_error != null) ...[
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          _error!,
                          style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],

                    const SizedBox(height: 16),

                    const SleekAdCard(
                      margin: EdgeInsets.only(top: 6),
                      radius: 12,
                    ),

                    // Actions
                    Row(
                      children: [
                        TextButton(
                          onPressed: _loading ? null : () => Navigator.pop(context, false),
                          child: const Text("Cancel"),
                        ),
                        const Spacer(),
                        _loading
                            ? const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 6),
                          child: SizedBox(
                            width: 26,
                            height: 26,
                            child: CircularProgressIndicator(strokeWidth: 2.6),
                          ),
                        )
                            : ElevatedButton.icon(
                          onPressed: _submit,
                          icon: const Icon(Icons.check_rounded),
                          label: const Text("Add"),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: accent,
                            foregroundColor: Colors.white,
                            elevation: 6,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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

  // shared decoration
  InputDecoration _pillDecoration({required String label, IconData? icon}) {
    return InputDecoration(
      labelText: label,
      prefixIcon: icon != null ? Icon(icon) : null,
      filled: true,
      fillColor: Colors.black87.withOpacity(0.06),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Colors.grey.shade300)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Colors.grey.shade300)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Colors.black87)),
    );
  }
}

class _GlassField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final String? Function(String?)? validator;

  const _GlassField({
    Key? key,
    required this.controller,
    required this.label,
    required this.icon,
    this.validator,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        filled: true,
        fillColor: Colors.black87.withOpacity(0.06),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Colors.grey.shade300)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Colors.grey.shade300)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Colors.black87)),
      ),
      validator: validator,
    );
  }
}

