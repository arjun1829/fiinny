import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:provider/provider.dart';
import '../themes/theme_provider.dart';
import 'main_nav_screen.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'dart:io';

// ✅ NEW: to auto-claim pending friend invites after signup
import '../services/friend_service.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({Key? key}) : super(key: key);

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();

  String? _selectedCountry = 'India';
  String? _selectedCurrency = 'INR';
  String? _selectedLanguage = 'en';
  String? _selectedAvatar;
  String? _profileImageUrl;
  File? _pickedImage;
  bool _loading = false;
  String? _errorText;

  final List<String> _avatarAssets = [
    "assets/avatars/avatar1.png",
    "assets/avatars/avatar2.png",
    "assets/avatars/avatar3.png",
  ];

  @override
  void initState() {
    super.initState();
    _checkOnboarded();
    _populateFields();
  }

  void _populateFields() {
    final user = FirebaseAuth.instance.currentUser;
    if (user != null) {
      _nameController.text = user.displayName ?? "";
      final email = user.email ?? '';
      final phone = user.phoneNumber ?? '';
      if (email.isNotEmpty) {
        _emailController.text = email;
      }
      if (phone.isNotEmpty) {
        _phoneController.text = phone;
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  /// Prefer authenticated phone; else the typed phone; else uid (safe fallback).
  String _resolveDocId(User user) {
    final authPhone = (user.phoneNumber ?? '').trim();
    final typedPhone = _phoneController.text.trim();
    if (authPhone.isNotEmpty) return authPhone;
    if (typedPhone.isNotEmpty) return typedPhone;
    return user.uid;
  }

  Future<void> _saveOnboardingData() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      setState(() => _errorText = "Session expired. Please sign in again.");
      return;
    }

    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final phone = _phoneController.text.trim();
    final docId = _resolveDocId(user);

    setState(() {
      _loading = true;
      _errorText = null;
    });

    try {
      String? profileImageUrl = _profileImageUrl;

      // Upload selected image to Storage under phone-based path (or fallback docId)
      if (_pickedImage != null) {
        final ref = FirebaseStorage.instance
            .ref()
            .child('users/$docId/profile.jpg');
        await ref.putFile(_pickedImage!);
        profileImageUrl = await ref.getDownloadURL();
      }

      // Update FirebaseAuth profile (best-effort)
      if (name.isNotEmpty) {
        await user.updateDisplayName(name);
      }
      if (profileImageUrl != null) {
        await user.updatePhotoURL(profileImageUrl);
      }

      // Save to Firestore using phone-number (or fallback) doc ID
      await FirebaseFirestore.instance.collection('users').doc(docId).set({
        'name': name,
        'country': _selectedCountry,
        'currency': _selectedCurrency,
        'language': _selectedLanguage,
        'avatar': profileImageUrl ?? _selectedAvatar ?? '',
        'onboarded': true,
        'email': email,
        'phone': phone.isNotEmpty ? phone : (user.phoneNumber ?? ''),
        'created': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      // ✅ NEW: Auto-claim any pending friend invites for this phone
      // (So your name appears in your friend's list as soon as you register.)
      final displayName = name.isNotEmpty ? name : "Fiinny User";
      await FriendService().claimPendingFor(docId, displayName);

    } catch (e) {
      setState(() {
        _errorText = "Could not save. Please try again.";
        _loading = false;
      });
      return;
    }

    setState(() => _loading = false);

    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => MainNavScreen(userPhone: docId)),
      );
    }
  }

  Future<void> _checkOnboarded() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final docId = _resolveDocId(user);
    final doc = await FirebaseFirestore.instance.collection('users').doc(docId).get();

    if (doc.exists && (doc.data()?['onboarded'] == true)) {
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => MainNavScreen(userPhone: docId)),
        );
      }
    }
  }

  Future<void> _pickImage() async {
    final pickedFile = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 75,
    );
    if (pickedFile != null) {
      setState(() {
        _pickedImage = File(pickedFile.path);
        _profileImageUrl = null; // reset any old url
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    final user = FirebaseAuth.instance.currentUser;
    final needsEmail = (user?.email ?? '').isEmpty;
    final needsPhone = (user?.phoneNumber ?? '').isEmpty;

    return Scaffold(
      appBar: AppBar(
        title: const Text("Quick Setup"),
        backgroundColor: Theme.of(context).colorScheme.primary,
        elevation: 0,
        actions: [
          Row(
            children: [
              Icon(
                themeProvider.isDarkMode ? Icons.nightlight_round : Icons.wb_sunny_rounded,
                color: Colors.white,
              ),
              Switch(
                value: themeProvider.isDarkMode,
                onChanged: (_) => themeProvider.toggleTheme(),
                activeColor: Colors.yellow,
              ),
            ],
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              const SizedBox(height: 8),
              Text(
                "Let's set up your profile!",
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
              const SizedBox(height: 18),
              if (_errorText != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    _errorText!,
                    style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w600),
                  ),
                ),
              // Profile Image Picker
              Center(
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    CircleAvatar(
                      radius: 44,
                      backgroundColor: Colors.grey[200],
                      backgroundImage: _pickedImage != null
                          ? FileImage(_pickedImage!)
                          : (_profileImageUrl != null
                          ? NetworkImage(_profileImageUrl!)
                          : (_selectedAvatar != null
                          ? AssetImage(_selectedAvatar!)
                          : null)) as ImageProvider<Object>?,
                      child: _pickedImage == null && _selectedAvatar == null && _profileImageUrl == null
                          ? const Icon(Icons.person, size: 48, color: Colors.grey)
                          : null,
                    ),
                    Positioned(
                      bottom: -2,
                      right: -2,
                      child: IconButton(
                        icon: Icon(Icons.camera_alt, color: Theme.of(context).colorScheme.primary),
                        onPressed: _pickImage,
                        tooltip: "Upload Profile Photo",
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: "Your Name",
                  prefixIcon: Icon(Icons.person),
                ),
                validator: (val) => (val == null || val.trim().isEmpty) ? "Please enter your name" : null,
              ),
              const SizedBox(height: 14),
              if (needsEmail)
                TextFormField(
                  controller: _emailController,
                  decoration: const InputDecoration(
                    labelText: "Your Email",
                    prefixIcon: Icon(Icons.email),
                  ),
                  keyboardType: TextInputType.emailAddress,
                  validator: (val) {
                    if (val == null || val.trim().isEmpty) return "Please enter your email";
                    if (!RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(val)) return "Enter valid email";
                    return null;
                  },
                ),
              if (needsEmail) const SizedBox(height: 12),
              if (needsPhone)
                TextFormField(
                  controller: _phoneController,
                  decoration: const InputDecoration(
                    labelText: "Your Phone Number",
                    prefixIcon: Icon(Icons.phone),
                  ),
                  keyboardType: TextInputType.phone,
                  validator: (val) {
                    if (val == null || val.trim().isEmpty) return "Please enter your phone number";
                    if (val.trim().length < 10) return "Enter a valid phone number";
                    return null;
                  },
                ),
              if (needsPhone) const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _selectedCountry,
                decoration: const InputDecoration(
                  labelText: "Country",
                  prefixIcon: Icon(Icons.public),
                ),
                items: ["India", "USA", "UK", "Other"]
                    .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                    .toList(),
                onChanged: (val) => setState(() => _selectedCountry = val),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _selectedCurrency,
                decoration: const InputDecoration(
                  labelText: "Currency",
                  prefixIcon: Icon(Icons.currency_exchange),
                ),
                items: ["INR", "USD", "GBP", "Other"]
                    .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                    .toList(),
                onChanged: (val) => setState(() => _selectedCurrency = val),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _selectedLanguage,
                decoration: const InputDecoration(
                  labelText: "Language",
                  prefixIcon: Icon(Icons.language),
                ),
                items: const [
                  DropdownMenuItem(value: "en", child: Text("English")),
                  DropdownMenuItem(value: "hi", child: Text("Hindi")),
                ],
                onChanged: (val) => setState(() => _selectedLanguage = val),
              ),
              const SizedBox(height: 18),
              const Text(
                "Or pick an avatar:",
                style: TextStyle(fontWeight: FontWeight.w500, fontSize: 15),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 18,
                children: _avatarAssets.map((asset) {
                  final isSelected = _selectedAvatar == asset;
                  return GestureDetector(
                    onTap: () => setState(() {
                      _selectedAvatar = asset;
                      _pickedImage = null;
                      _profileImageUrl = null;
                    }),
                    child: CircleAvatar(
                      radius: isSelected ? 32 : 28,
                      backgroundColor: isSelected
                          ? Theme.of(context).colorScheme.primary
                          : Colors.grey[300],
                      child: CircleAvatar(
                        radius: 24,
                        backgroundImage: AssetImage(asset),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 36),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _loading
                      ? null
                      : () async {
                    if (_formKey.currentState!.validate()) {
                      await _saveOnboardingData();
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    backgroundColor: Colors.deepPurple,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: _loading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text(
                    "Finish & Go to Dashboard",
                    style: TextStyle(fontSize: 18),
                  ),
                ),
              ),
              TextButton(
                onPressed: _loading
                    ? null
                    : () {
                  final user = FirebaseAuth.instance.currentUser;
                  if (user != null) {
                    final docId = _resolveDocId(user);
                    Navigator.pushReplacement(
                      context,
                      MaterialPageRoute(
                        builder: (_) => MainNavScreen(userPhone: docId),
                      ),
                    );
                  }
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
