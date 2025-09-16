// lib/screens/onboarding_screen.dart
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';

import 'main_nav_screen.dart';
import '../services/friend_service.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({Key? key}) : super(key: key);

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  // ✅ brand green
  static const Color kPrimaryGreen = Color(0xFF10B981);

  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();

  String? _country  = 'India';
  String? _currency = 'INR';
  String? _language = 'en';
  String? _avatarAsset;
  String? _photoUrl;
  File? _picked;

  bool _loading = false;
  String? _error;

  final List<String> _avatarAssets = const [
    "assets/avatars/avatar1.png",
    "assets/avatars/avatar2.png",
    "assets/avatars/avatar3.png",
  ];

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

    final doc = await FirebaseFirestore.instance.collection('users').doc(authPhone).get();
    if (doc.exists && (doc.data()?['onboarded'] == true)) {
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => MainNavScreen(userPhone: authPhone)));
    }
  }

  String _resolveDocIdOrError(User user) {
    final typed = _phone.text.trim();
    final auth  = (user.phoneNumber ?? '').trim();

    if (typed.isNotEmpty) return typed;
    if (auth.isNotEmpty) return auth;

    setState(() => _error = 'Please enter your phone number to continue.');
    throw StateError('Phone required');
  }

  Future<void> _pickImage() async {
    final f = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 78);
    if (f != null) {
      setState(() {
        _picked = File(f.path);
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

    final name  = _name.text.trim();
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

      if (_picked != null) {
        final ref = FirebaseStorage.instance.ref('users/$docId/profile.jpg');
        await ref.putFile(_picked!);
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
        'phone': _phone.text.trim().isNotEmpty ? _phone.text.trim() : (u.phoneNumber ?? ''),
        'created': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      final displayName = name.isNotEmpty ? name : "Fiinny User";
      await FriendService().claimPendingFor(docId, displayName);
    } catch (e) {
      setState(() {
        _error = "Could not save. Please try again.";
        _loading = false;
      });
      return;
    }

    setState(() => _loading = false);

    if (!mounted) return;
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => MainNavScreen(userPhone: docId)));
  }

  @override
  Widget build(BuildContext context) {
    final inputBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
    );

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text("Set up your profile"),
        elevation: 0.5,
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
            children: [
              // ✅ Bigger profile photo (radius 60)
              Center(
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    CircleAvatar(
                      radius: 60, // was 48
                      backgroundColor: const Color(0xFFF3F4F6),
                      backgroundImage: _picked != null
                          ? FileImage(_picked!)
                          : (_photoUrl != null
                          ? NetworkImage(_photoUrl!)
                          : (_avatarAsset != null
                          ? AssetImage(_avatarAsset!)
                          : null)) as ImageProvider<Object>?,
                      child: _picked == null && _avatarAsset == null && _photoUrl == null
                          ? const Icon(Icons.person, size: 60, color: Colors.grey)
                          : null,
                    ),
                    Positioned(
                      bottom: -2,
                      right: -2,
                      child: IconButton(
                        onPressed: _pickImage,
                        icon: const Icon(Icons.camera_alt_rounded),
                        color: Colors.black87,
                        tooltip: "Upload photo",
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),

              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_error!, style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w600)),
                ),

              TextFormField(
                controller: _name,
                decoration: InputDecoration(
                  labelText: "Name",
                  prefixIcon: const Icon(Icons.person),
                  border: inputBorder,
                  enabledBorder: inputBorder,
                  focusedBorder: inputBorder.copyWith(
                    borderSide: const BorderSide(color: _OnboardingScreenState.kPrimaryGreen),
                  ),
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? "Please enter your name" : null,
              ),
              const SizedBox(height: 12),

              if (_needsEmail)
                Column(
                  children: [
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: InputDecoration(
                        labelText: "Email",
                        prefixIcon: const Icon(Icons.email),
                        border: inputBorder,
                        enabledBorder: inputBorder,
                        focusedBorder: inputBorder.copyWith(
                          borderSide: const BorderSide(color: _OnboardingScreenState.kPrimaryGreen),
                        ),
                      ),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return "Please enter your email";
                        if (!RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(val)) return "Enter a valid email";
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                  ],
                ),

              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: "Phone (e.g., +91XXXXXXXXXX)",
                  prefixIcon: const Icon(Icons.phone),
                  border: inputBorder,
                  enabledBorder: inputBorder,
                  focusedBorder: inputBorder.copyWith(
                    borderSide: const BorderSide(color: _OnboardingScreenState.kPrimaryGreen),
                  ),
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return "Please enter your phone number";
                  if (v.trim().length < 10) return "Enter a valid phone number";
                  return null;
                },
              ),
              const SizedBox(height: 12),

              DropdownButtonFormField<String>(
                value: _country,
                items: ["India", "USA", "UK", "Other"].map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
                onChanged: (v) => setState(() => _country = v),
                decoration: InputDecoration(
                  labelText: "Country",
                  prefixIcon: const Icon(Icons.public),
                  border: inputBorder,
                  enabledBorder: inputBorder,
                  focusedBorder: inputBorder.copyWith(
                    borderSide: const BorderSide(color: _OnboardingScreenState.kPrimaryGreen),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              DropdownButtonFormField<String>(
                value: _currency,
                items: ["INR", "USD", "GBP", "Other"].map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
                onChanged: (v) => setState(() => _currency = v),
                decoration: InputDecoration(
                  labelText: "Currency",
                  prefixIcon: const Icon(Icons.currency_exchange),
                  border: inputBorder,
                  enabledBorder: inputBorder,
                  focusedBorder: inputBorder.copyWith(
                    borderSide: const BorderSide(color: _OnboardingScreenState.kPrimaryGreen),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              DropdownButtonFormField<String>(
                value: _language,
                items: const [
                  DropdownMenuItem(value: "en", child: Text("English")),
                  DropdownMenuItem(value: "hi", child: Text("Hindi")),
                ],
                onChanged: (v) => setState(() => _language = v),
                decoration: InputDecoration(
                  labelText: "Language",
                  prefixIcon: const Icon(Icons.language),
                  border: inputBorder,
                  enabledBorder: inputBorder,
                  focusedBorder: inputBorder.copyWith(
                    borderSide: const BorderSide(color: _OnboardingScreenState.kPrimaryGreen),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              const Text("Or pick an avatar", style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 16,
                runSpacing: 12,
                children: _avatarAssets.map((asset) {
                  final sel = _avatarAsset == asset;
                  return GestureDetector(
                    onTap: () => setState(() {
                      _avatarAsset = asset;
                      _picked = null;
                      _photoUrl = null;
                    }),
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: sel ? kPrimaryGreen : const Color(0xFFE5E7EB), // ✅ green highlight
                          width: sel ? 2 : 1,
                        ),
                      ),
                      child: CircleAvatar(radius: 24, backgroundImage: AssetImage(asset)),
                    ),
                  );
                }).toList(),
              ),

              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _loading
                      ? null
                      : () async {
                    if (_formKey.currentState!.validate()) {
                      await _save();
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    backgroundColor: kPrimaryGreen, // ✅ green button
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _loading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white))
                      : const Text("Save & Continue", style: TextStyle(fontSize: 16)),
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
                    MaterialPageRoute(builder: (_) => MainNavScreen(userPhone: docId)),
                  );
                },
                child: const Text("Skip for now"),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
