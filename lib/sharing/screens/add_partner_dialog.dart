import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:characters/characters.dart';
import 'package:lifemap/utils/firebase_error_mapper.dart';
import 'package:lifemap/utils/permissions_helper.dart';

import '../../core/ads/ads_shell.dart';
import '../services/partner_service.dart';
import '../utils/sharing_permissions.dart';

class AddPartnerDialog extends StatefulWidget {
  final String currentUserId; // (phone) kept name to avoid breaking callers
  const AddPartnerDialog({Key? key, required this.currentUserId}) : super(key: key);

  @override
  State<AddPartnerDialog> createState() => _AddPartnerDialogState();
}

class _AddPartnerDialogState extends State<AddPartnerDialog> {
  final _identifierController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  String? _relation;
  bool _loadingContacts = false;

  // We now only share Transactions (tx). Everything else false.
  // Kept as a field to avoid changing PartnerService API.
  late final Map<String, bool> _permissions = {
    for (final k in SharingPermissions.allKeys())
      k: k == SharingPermissions.viewTransactions
  };

  bool _loading = false;
  String? _errorMsg;

  // 👉 Change to your preferred default if needed
  static const String _defaultCountryCode = '+91';

  final _relations = const ['Partner','Spouse', 'Brother', 'Child', 'Friend', 'Other'];

  @override
  void dispose() {
    _identifierController.dispose();
    super.dispose();
  }

  // ----------------------------
  // Add partner via PartnerService
  // ----------------------------
  Future<void> _addPartner() async {
    FocusScope.of(context).unfocus();

    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _errorMsg = null;
    });

    final idInput = _identifierController.text.trim();

    try {
      final partnerId = await PartnerService().addPartner(
        currentUserPhone: widget.currentUserId, // phone-based doc IDs
        partnerIdentifier: idInput,             // email OR phone OR referral
        relation: _relation,
        permissions: _permissions,              // only tx=true
      );

      if (!mounted) return;

      setState(() => _loading = false);

      if (partnerId == null) {
        setState(() => _errorMsg = "No matching user found for that email/phone/referral.");
        return;
      }

      Navigator.pop(context, true); // success -> signal caller to refresh
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _errorMsg = mapFirebaseError(
          e,
          fallback: 'Could not add partner. Please check your Firebase connection and try again.',
        );
      });
    }
  }

  String? _validateIdentifier(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return "Enter partner's email, phone, or referral";

    final normalized = s.replaceAll(RegExp(r'\s+'), '');
    final email = RegExp(r'^[^@]+@[^@]+\.[^@]+$').hasMatch(normalized);

    // keep digits and plus, then validate: optional + followed by 10+ digits
    final phoneCandidate = normalized.replaceAll(RegExp(r'[^\d+]'), '');
    final phone = RegExp(r'^\+?\d{10,}$').hasMatch(phoneCandidate);

    final referral = !email && !phone && normalized.length >= 5;

    if (!(email || phone || referral)) {
      return "Enter a valid email, phone (+countrycode…), or referral";
    }
    return null;
  }

  // ----------------------------
  // Contacts picker
  // ----------------------------
  Future<void> _pickFromContacts() async {
    setState(() {
      _loadingContacts = true;
      _errorMsg = null;
    });

    final result = await getContactsWithPermission();
    if (!mounted) return;

    setState(() {
      _loadingContacts = false;
    });

    if (result.permanentlyDenied) {
      await showContactsPermissionSettingsDialog(context);
      setState(() {
        _errorMsg = 'Contacts permission denied';
      });
      return;
    }

    if (!result.granted) {
      setState(() {
        _errorMsg = 'Contacts permission denied';
      });
      return;
    }

    if (result.hasError) {
      setState(() {
        _errorMsg = 'Failed to load contacts';
      });
      return;
    }

    if (result.contacts.isEmpty) {
      setState(() {
        _errorMsg = 'No contacts with phone numbers found';
      });
      return;
    }

    final contacts = result.contacts.where((c) => c.phones.isNotEmpty).toList();
    if (contacts.isEmpty) {
      setState(() {
        _errorMsg = 'No contacts with phone numbers found';
      });
      return;
    }

    final accent = Colors.black87;
    final Contact? picked = await showModalBottomSheet<Contact?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return _ContactPickerSheet(
          contacts: contacts,
          accent: accent,
        );
      },
    );

    if (picked != null) {
      final raw = picked.phones.isNotEmpty ? picked.phones.first.number : '';
      final formatted = await _formatToE164(raw);
      if (!mounted) return;
      setState(() {
        _identifierController.text = formatted;
        _errorMsg = null;
      });
    }
  }

  // Basic formatter toward E.164: strips spaces/dashes and prefixes default code if missing.
  Future<String> _formatToE164(String raw) async {
    var s = raw.replaceAll(RegExp(r'[^\d+]'), ''); // keep digits and '+'

    if (s.startsWith('+')) {
      // keep only one leading '+', drop leading zeros after it
      s = '+' + s.substring(1).replaceFirst(RegExp(r'^0+'), '');
      return s;
    }

    // no country code: remove leading zeros and prefix default
    s = s.replaceFirst(RegExp(r'^0+'), '');
    return '$_defaultCountryCode$s';
  }

  // -------------- UI helpers (shiny white card) --------------
  BoxDecoration _dialogDecoration(BuildContext context) {
    return BoxDecoration(
      borderRadius: BorderRadius.circular(20),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color(0xFFFFFFFF),
          Color(0xFFF9FBFF),
        ],
      ),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(0.08),
          blurRadius: 24,
          spreadRadius: 1,
          offset: const Offset(0, 12),
        ),
      ],
    );
  }

  InputDecoration _fieldDecoration(BuildContext context, {String? label, Widget? prefixIcon, Widget? suffixIcon, String? helper}) {
    return InputDecoration(
      labelText: label,
      helperText: helper,
      filled: true,
      fillColor: Colors.white,
      prefixIcon: prefixIcon,
      suffixIcon: suffixIcon,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Theme.of(context).colorScheme.primary, width: 1.2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Colors.red),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Colors.red),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final safeBottom = context.adsBottomPadding();
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      backgroundColor: Colors.transparent,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Stack(
          children: [
            // Shiny white card background
            Container(
              decoration: _dialogDecoration(context),
              child: CustomPaint(
                painter: _GlossPainter(),
                child: Padding(
                  padding: EdgeInsets.fromLTRB(16, 16, 16, safeBottom + 8),
                  child: SingleChildScrollView(
                    child: Form(
                      key: _formKey,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Header
                          Row(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Icon(Icons.favorite_outline, size: 22),
                              ),
                              const SizedBox(width: 12),
                              const Expanded(
                                child: Text(
                                  'Add Partner',
                                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),

                          // Top: Add from contacts
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              icon: _loadingContacts
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    )
                                  : const Icon(Icons.contacts_rounded),
                              label: Text(
                                _loadingContacts ? 'Loading contacts…' : 'Add from Contacts',
                              ),
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                side: BorderSide(color: Theme.of(context).colorScheme.primary.withOpacity(0.35)),
                                foregroundColor: Theme.of(context).colorScheme.primary,
                              ),
                              onPressed: _loading || _loadingContacts ? null : _pickFromContacts,
                            ),
                          ),

                          const SizedBox(height: 14),
                          const _InlineDivider(text: 'or add manually'),
                          const SizedBox(height: 14),

                          // Identifier field
                          TextFormField(
                            controller: _identifierController,
                            decoration: _fieldDecoration(
                              context,
                              label: "Partner's email / phone / referral",
                              prefixIcon: const Icon(Icons.alternate_email),
                              suffixIcon: _identifierController.text.isEmpty
                                  ? null
                                  : IconButton(
                                icon: const Icon(Icons.clear),
                                onPressed: () {
                                  setState(() => _identifierController.clear());
                                },
                              ),
                              helper: "Tip: only Transactions are shared (+Chat). Prefer phone: +91XXXXXXXXXX",
                            ),
                            autofocus: true,
                            keyboardType: TextInputType.text, // mixed: email / phone / referral
                            textInputAction: TextInputAction.done,
                            autocorrect: false,
                            enableSuggestions: false,
                            validator: _validateIdentifier,
                            onChanged: (_) => setState(() {}), // for clear button visibility
                          ),
                          const SizedBox(height: 12),

                          // Relation
                          DropdownButtonFormField<String>(
                            value: _relation,
                            decoration: _fieldDecoration(context, label: "Relation (optional)"),
                            items: _relations
                                .map((rel) => DropdownMenuItem(
                              value: rel,
                              child: Text(rel[0].toUpperCase() + rel.substring(1)),
                            ))
                                .toList(),
                            onChanged: (val) => setState(() => _relation = val),
                          ),
                          const SizedBox(height: 12),

                          if (_errorMsg != null) ...[
                            const SizedBox(height: 12),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                _errorMsg!,
                                style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w600),
                              ),
                            ),
                          ],

                          const SizedBox(height: 12),

                          // Actions
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: _loading ? null : () => Navigator.pop(context),
                                  style: OutlinedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                  ),
                                  child: const Text('Cancel'),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: ElevatedButton(
                                  onPressed: _loading ? null : _addPartner,
                                  style: ElevatedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                  ),
                                  child: _loading
                                      ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                      : const Text('Add'),
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

            // Subtle glossy highlight
            Positioned(
              top: -40,
              left: -20,
              child: Container(
                width: 180,
                height: 120,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(120),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Colors.white.withOpacity(0.6),
                      Colors.white.withOpacity(0.0),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// -----------------------------------------
// Inline divider widget (centered label with lines)
// -----------------------------------------
class _InlineDivider extends StatelessWidget {
  final String text;
  const _InlineDivider({Key? key, required this.text}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final color = Colors.grey.shade300;
    return Row(
      children: [
        Expanded(child: Divider(color: color, thickness: 1)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Text(
            text,
            style: TextStyle(
              color: Colors.grey.shade600,
              fontWeight: FontWeight.w600,
              fontSize: 12.5,
              letterSpacing: 0.2,
            ),
          ),
        ),
        Expanded(child: Divider(color: color, thickness: 1)),
      ],
    );
  }
}

class _ContactPickerSheet extends StatefulWidget {
  final List<Contact> contacts;
  final Color accent;

  const _ContactPickerSheet({
    required this.contacts,
    required this.accent,
  });

  @override
  State<_ContactPickerSheet> createState() => _ContactPickerSheetState();
}

class _ContactPickerSheetState extends State<_ContactPickerSheet> {
  final TextEditingController _search = TextEditingController();
  late final List<Contact> _withPhones = widget.contacts
      .where((c) => c.phones.isNotEmpty)
      .toList(growable: false);
  late List<Contact> _filtered = List<Contact>.from(_withPhones);

  @override
  void initState() {
    super.initState();
    _search.addListener(_onSearch);
  }

  @override
  void dispose() {
    _search.removeListener(_onSearch);
    _search.dispose();
    super.dispose();
  }

  void _onSearch() {
    final query = _search.text.trim().toLowerCase();
    if (query.isEmpty) {
      setState(() => _filtered = List<Contact>.from(_withPhones));
      return;
    }

    setState(() {
      _filtered = _withPhones.where((c) {
        final name = c.displayName.toLowerCase();
        final phone = c.phones.isNotEmpty
            ? c.phones.first.number.replaceAll(RegExp(r'\s+'), '')
            : '';
        return name.contains(query) || phone.contains(query.replaceAll(RegExp(r'\s+'), ''));
      }).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    final accent = widget.accent;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      minChildSize: 0.55,
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
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
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
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        Icon(Icons.contacts_rounded, color: accent),
                        const SizedBox(width: 8),
                        Text(
                          'Pick a contact',
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
                    padding: const EdgeInsets.symmetric(horizontal: 16),
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
                              controller: _search,
                              decoration: const InputDecoration(
                                hintText: 'Search contacts…',
                                border: InputBorder.none,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: _filtered.isEmpty
                        ? const Center(child: Text('No contacts found'))
                        : ListView.separated(
                            controller: scrollController,
                            itemCount: _filtered.length,
                            separatorBuilder: (_, __) => Divider(height: 1, color: Colors.grey.shade200),
                            itemBuilder: (context, index) {
                              final contact = _filtered[index];
                              final name = contact.displayName.isEmpty ? 'Unknown' : contact.displayName;
                              final phone = contact.phones.isNotEmpty ? contact.phones.first.number : '';
                              final initial = name.isNotEmpty ? name.characters.first.toUpperCase() : '👤';
                              return ListTile(
                                leading: CircleAvatar(
                                  radius: 20,
                                  backgroundColor: accent.withOpacity(0.10),
                                  child: Text(
                                    initial,
                                    style: const TextStyle(fontWeight: FontWeight.w700),
                                  ),
                                ),
                                title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
                                subtitle: Text(phone, maxLines: 1, overflow: TextOverflow.ellipsis),
                                onTap: () => Navigator.pop(context, contact),
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
  }
}

// -----------------------------------------
// Gloss painter for subtle shine
// -----------------------------------------
class _GlossPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final gloss = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.centerRight,
        colors: [
          Colors.white.withOpacity(0.22),
          Colors.white.withOpacity(0.0),
        ],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height / 3));

    final path = Path()
      ..moveTo(0, 0)
      ..quadraticBezierTo(size.width * 0.4, size.height * 0.02, size.width, 0)
      ..lineTo(size.width, size.height * 0.25)
      ..quadraticBezierTo(size.width * 0.5, size.height * 0.18, 0, size.height * 0.28)
      ..close();

    canvas.drawPath(path, gloss);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
