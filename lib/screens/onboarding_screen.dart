// import 'dart:io'; // Removed for Web compatibility
import 'dart:typed_data'; // For Uint8List
import 'dart:ui' show ImageFilter;
// Explicit import if needed, or use existing

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';

import 'main_nav_screen.dart';
import '../services/friend_service.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  // ✅ brand green
  static const Color kPrimaryGreen = Color(0xFF10B981);
  static const Color kMintBgTop = Color(0xFFEFFFFA);
  static const Color kMintBgBot = Color(0xFFFFFFFF);

  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();

  String? _country = 'India';
  String? _currency = 'INR';
  String? _language = 'en';
  String? _avatarAsset;
  String? _photoUrl;
  XFile? _picked;
  Uint8List? _pickedBytes;

  bool _loading = false;
  String? _error;

  // 🔟 Avatar support (avatar1.png … avatar10.png)
  static const int kAvatarCount = 10;
  late final List<String> _avatarAssets = List<String>.unmodifiable(
    List.generate(kAvatarCount, (i) => 'assets/avatars/avatar${i + 1}.png'),
  );

  bool get _needsEmail {
    final u = FirebaseAuth.instance.currentUser;
    return (u?.email ?? '').isEmpty;
  }

  @override
  void initState() {
    super.initState();
    _prefill();
    _checkOnboarded();
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _prefill() {
    final u = FirebaseAuth.instance.currentUser;
    if (u != null) {
      _name.text = u.displayName ?? '';
      if ((u.email ?? '').isNotEmpty) _email.text = u.email!;
      if ((u.phoneNumber ?? '').isNotEmpty) _phone.text = u.phoneNumber!;
    }
  }

  Future<void> _checkOnboarded() async {
    final u = FirebaseAuth.instance.currentUser;
    if (u == null) return;

    final authPhone = (u.phoneNumber ?? '').trim();
    if (authPhone.isEmpty) return;

    final doc = await FirebaseFirestore.instance
        .collection('users')
        .doc(authPhone)
        .get();
    if (doc.exists && (doc.data()?['onboarded'] == true)) {
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => MainNavScreen(userPhone: authPhone)),
      );
    }
  }

  String _resolveDocIdOrError(User user) {
    final typed = _phone.text.trim();
    final auth = (user.phoneNumber ?? '').trim();

    if (typed.isNotEmpty) return typed;
    if (auth.isNotEmpty) return auth;

    setState(() => _error = 'Please enter your phone number to continue.');
    throw StateError('Phone required');
  }

  Future<void> _pickImage() async {
    final f = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 78);
    if (f != null) {
      final bytes = await f.readAsBytes();
      if (!mounted) return;
      setState(() {
        _picked = f;
        _pickedBytes = bytes;
        _photoUrl = null;
        _avatarAsset = null;
      });
    }
  }

  Future<void> _save() async {
    final u = FirebaseAuth.instance.currentUser;
    if (u == null) {
      setState(() => _error = "Session expired. Please sign in again.");
      return;
    }

    final name = _name.text.trim();
    final email = _email.text.trim();

    late final String docId;
    try {
      docId = _resolveDocIdOrError(u);
    } catch (_) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      String? photo = _photoUrl;

      if (_picked != null && _pickedBytes != null) {
        final ref = FirebaseStorage.instance.ref('users/$docId/profile.jpg');
        await ref.putData(
            _pickedBytes!, SettableMetadata(contentType: 'image/jpeg'));
        photo = await ref.getDownloadURL();
      }

      if (name.isNotEmpty) await u.updateDisplayName(name);
      if (photo != null) await u.updatePhotoURL(photo);

      await FirebaseFirestore.instance.collection('users').doc(docId).set({
        'name': name,
        'country': _country,
        'currency': _currency,
        'language': _language,
        'avatar': photo ?? _avatarAsset ?? '',
        'onboarded': true,
        'email': email,
        'phone': _phone.text.trim().isNotEmpty
            ? _phone.text.trim()
            : (u.phoneNumber ?? ''),
        'created': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      final displayName = name.isNotEmpty ? name : "Fiinny User";
      await FriendService().claimPendingFor(docId, displayName);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = "Could not save. Please try again.";
          _loading = false;
        });
      }
      return;
    }

    setState(() => _loading = false);

    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => MainNavScreen(userPhone: docId)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filledField = OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide.none,
    );

    return Scaffold(
      extendBodyBehindAppBar: true,
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text("Set up your profile"),
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.black,
      ),
      body: Stack(
        children: [
          // ✨ Premium gradient background + soft blobs
          Positioned.fill(
            child: DecoratedBox(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [kMintBgTop, kMintBgBot],
                ),
              ),
            ),
          ),
          Positioned(top: -60, right: -40, child: _mintBlob(220)),
          Positioned(top: 120, left: -50, child: _mintBlob(160, opacity: .20)),
          Positioned(
              bottom: -70, right: -30, child: _mintBlob(180, opacity: .16)),

          // ✨ Frosted sheet inside a real Form
          Positioned.fill(
            child: Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 110, 20, 28),
                children: [
                  _Glass(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
                    radius: 22,
                    child: Column(
                      children: [
                        // Header avatar with glossy ring
                        Center(
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: [
                              Container(
                                width: 136,
                                height: 136,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: const SweepGradient(
                                    colors: [
                                      Color(0x3310B981),
                                      Color(0x1110B981),
                                      Color(0x3310B981),
                                      Color(0x1110B981),
                                    ],
                                  ),
                                  boxShadow: const [
                                    BoxShadow(
                                      blurRadius: 24,
                                      spreadRadius: 2,
                                      offset: Offset(0, 8),
                                      color: Color(0x2210B981),
                                    ),
                                  ],
                                ),
                                child: Center(
                                  child: CircleAvatar(
                                    radius: 60,
                                    backgroundColor: const Color(0xFFF6FAF8),
                                    // ✅ Graceful fallback rendering
                                    child: _buildAvatarContent(),
                                  ),
                                ),
                              ),
                              Positioned(
                                bottom: -2,
                                right: -2,
                                child: _glassIconButton(
                                  icon: Icons.camera_alt_rounded,
                                  onTap: _pickImage,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 18),

                        if (_error != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Text(
                              _error!,
                              style: const TextStyle(
                                  color: Colors.red,
                                  fontWeight: FontWeight.w600),
                            ),
                          ),

                        // Fields — glossy (filled, blurred backdrop)
                        TextFormField(
                          controller: _name,
                          decoration: _glassFieldDecoration(
                            label: "Name",
                            icon: Icons.person,
                            filledBorder: filledField,
                          ),
                          validator: (v) => (v == null || v.trim().isEmpty)
                              ? "Please enter your name"
                              : null,
                        ),
                        const SizedBox(height: 12),

                        if (_needsEmail)
                          Column(
                            children: [
                              TextFormField(
                                controller: _email,
                                keyboardType: TextInputType.emailAddress,
                                decoration: _glassFieldDecoration(
                                  label: "Email",
                                  icon: Icons.email,
                                  filledBorder: filledField,
                                ),
                                validator: (val) {
                                  if (val == null || val.trim().isEmpty) {
                                    return "Please enter your email";
                                  }
                                  if (!RegExp(r'^[^@]+@[^@]+\.[^@]+')
                                      .hasMatch(val)) {
                                    return "Enter a valid email";
                                  }
                                  return null;
                                },
                              ),
                              const SizedBox(height: 12),
                            ],
                          ),

                        TextFormField(
                          controller: _phone,
                          keyboardType: TextInputType.phone,
                          decoration: _glassFieldDecoration(
                            label: "Phone (e.g., +91XXXXXXXXXX)",
                            icon: Icons.phone,
                            filledBorder: filledField,
                          ),
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) {
                              return "Please enter your phone number";
                            }
                            if (v.trim().length < 10) {
                              return "Enter a valid phone number";
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 12),

                        DropdownButtonFormField<String>(
                          initialValue: _country,
                          items: ["India", "USA", "UK", "Other"]
                              .map((e) =>
                                  DropdownMenuItem(value: e, child: Text(e)))
                              .toList(),
                          onChanged: (v) => setState(() => _country = v),
                          decoration: _glassFieldDecoration(
                            label: "Country",
                            icon: Icons.public,
                            filledBorder: filledField,
                          ),
                        ),
                        const SizedBox(height: 12),

                        DropdownButtonFormField<String>(
                          initialValue: _currency,
                          items: ["INR", "USD", "GBP", "Other"]
                              .map((e) =>
                                  DropdownMenuItem(value: e, child: Text(e)))
                              .toList(),
                          onChanged: (v) => setState(() => _currency = v),
                          decoration: _glassFieldDecoration(
                            label: "Currency",
                            icon: Icons.currency_exchange,
                            filledBorder: filledField,
                          ),
                        ),
                        const SizedBox(height: 12),

                        DropdownButtonFormField<String>(
                          initialValue: _language,
                          items: const [
                            DropdownMenuItem(
                                value: "en", child: Text("English")),
                            DropdownMenuItem(value: "hi", child: Text("Hindi")),
                          ],
                          onChanged: (v) => setState(() => _language = v),
                          decoration: _glassFieldDecoration(
                            label: "Language",
                            icon: Icons.language,
                            filledBorder: filledField,
                          ),
                        ),
                        const SizedBox(height: 16),

                        const Align(
                          alignment: Alignment.centerLeft,
                          child: Text("Or pick an avatar",
                              style: TextStyle(fontWeight: FontWeight.w700)),
                        ),
                        const SizedBox(height: 10),

                        // 🔟 Renders 10 avatars gracefully (wraps into rows) + safe fallback
                        Wrap(
                          spacing: 16,
                          runSpacing: 12,
                          children: _avatarAssets.map((asset) {
                            final sel = _avatarAsset == asset;
                            return GestureDetector(
                              onTap: () => setState(() {
                                _avatarAsset = asset;
                                _picked = null;
                                _pickedBytes = null;
                                _photoUrl = null;
                              }),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 180),
                                padding: const EdgeInsets.all(5),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: sel
                                        ? kPrimaryGreen
                                        : const Color(0xFFE5E7EB),
                                    width: sel ? 2 : 1,
                                  ),
                                  boxShadow: sel
                                      ? const [
                                          BoxShadow(
                                              color: Color(0x2210B981),
                                              blurRadius: 14,
                                              offset: Offset(0, 6))
                                        ]
                                      : const [],
                                ),
                                child: CircleAvatar(
                                  radius: 24,
                                  backgroundColor: Colors.white,
                                  child: ClipOval(
                                    child: Image.asset(
                                      asset,
                                      width: 48,
                                      height: 48,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => const Icon(
                                          Icons.person,
                                          size: 24,
                                          color: Colors.grey),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),

                        const SizedBox(height: 22),

                        // CTA — glossy button
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _loading
                                ? null
                                : () async {
                                    final isValid =
                                        _formKey.currentState?.validate() ??
                                            false;
                                    if (isValid) {
                                      await _save();
                                    }
                                  },
                            style: ElevatedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              backgroundColor: kPrimaryGreen,
                              elevation: 6,
                              shadowColor: const Color(0x4410B981),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14)),
                            ),
                            child: _loading
                                ? const SizedBox(
                                    height: 22,
                                    width: 22,
                                    child: CircularProgressIndicator(
                                        color: Colors.white, strokeWidth: 3),
                                  )
                                : const Text("Save & Continue",
                                    style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w700)),
                          ),
                        ),

                        TextButton(
                          onPressed: _loading
                              ? null
                              : () async {
                                  final u = FirebaseAuth.instance.currentUser;
                                  if (u == null) return;
                                  late final String docId;
                                  try {
                                    docId = _resolveDocIdOrError(u);
                                  } catch (_) {
                                    return;
                                  }
                                  if (!mounted) return;
                                  Navigator.pushReplacement(
                                    context,
                                    MaterialPageRoute(
                                        builder: (_) =>
                                            MainNavScreen(userPhone: docId)),
                                  );
                                },
                          child: const Text("Skip for now"),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // Build the big avatar content with safe fallbacks
  Widget _buildAvatarContent() {
    if (_pickedBytes != null) {
      return ClipOval(
        child: Image.memory(
          _pickedBytes!,
          width: 120,
          height: 120,
          fit: BoxFit.cover,
        ),
      );
    }
    if (_photoUrl != null) {
      return ClipOval(
        child: Image.network(
          _photoUrl!,
          width: 120,
          height: 120,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) =>
              const Icon(Icons.person, size: 60, color: Colors.grey),
        ),
      );
    }
    if (_avatarAsset != null) {
      return ClipOval(
        child: Image.asset(
          _avatarAsset!,
          width: 120,
          height: 120,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) =>
              const Icon(Icons.person, size: 60, color: Colors.grey),
        ),
      );
    }
    return const Icon(Icons.person, size: 60, color: Colors.grey);
  }

  // ---------- helpers (UI only)

  static Widget _mintBlob(double size, {double opacity = .26}) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF10B981).withValues(alpha: opacity),
      ),
    );
  }

  static Widget _glassIconButton(
      {required IconData icon, required VoidCallback onTap}) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Material(
          color: Colors.white.withValues(alpha: 0.6),
          child: InkWell(
            onTap: onTap,
            child: Padding(
              // keep non-const (icon is variable)
              padding: const EdgeInsets.all(8.0),
              child: Icon(icon, size: 20),
            ),
          ),
        ),
      ),
    );
  }

  static InputDecoration _glassFieldDecoration({
    required String label,
    required IconData icon,
    required OutlineInputBorder filledBorder,
  }) {
    return InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon),
      filled: true,
      fillColor: Colors.white.withValues(alpha: 0.7),
      border: filledBorder,
      enabledBorder: filledBorder,
      focusedBorder: filledBorder.copyWith(
        borderSide: const BorderSide(color: kPrimaryGreen, width: 1.2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
    );
  }
}

// Simple frosted glass container
class _Glass extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;

  const _Glass({
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.radius = 20,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.65),
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: const Color(0xFFE7F6EF)),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x14000000),
                  blurRadius: 18,
                  offset: Offset(0, 10)),
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}
