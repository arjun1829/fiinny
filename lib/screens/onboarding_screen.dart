// lib/screens/onboarding_screen.dart
import 'dart:io';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';

import '../themes/theme_provider.dart';
import 'main_nav_screen.dart';
import '../services/friend_service.dart';

// Optional pretty animated background you already use elsewhere
import '../widgets/animated_mint_background.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({Key? key}) : super(key: key);

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  // --- State & controllers ---
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _nameController  = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();

  String? _selectedCountry  = 'India';
  String? _selectedCurrency = 'INR';
  String? _selectedLanguage = 'en';
  String? _selectedAvatar;
  String? _profileImageUrl;
  File? _pickedImage;

  bool _loading = false;
  String? _errorText;

  // Step management
  final _pg = PageController();
  int _step = 0; // 0..4
  final int _lastStep = 4;

  final List<String> _avatarAssets = [
    "assets/avatars/avatar1.png",
    "assets/avatars/avatar2.png",
    "assets/avatars/avatar3.png",
  ];

  bool get _needsEmail {
    final user = FirebaseAuth.instance.currentUser;
    return (user?.email ?? '').isEmpty;
  }

  @override
  void initState() {
    super.initState();
    _checkOnboarded();
    _populateFields();
  }

  @override
  void dispose() {
    _pg.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _populateFields() {
    final user = FirebaseAuth.instance.currentUser;
    if (user != null) {
      _nameController.text  = user.displayName ?? "";
      final email = user.email ?? '';
      final phone = user.phoneNumber ?? '';
      if (email.isNotEmpty) _emailController.text = email;
      if (phone.isNotEmpty) _phoneController.text = phone;
    }
  }

  // ---- Core rules (unchanged) ----
  String _resolveDocIdOrError(User user) {
    final typedPhone = _phoneController.text.trim();
    final authPhone  = (user.phoneNumber ?? '').trim();

    if (typedPhone.isNotEmpty) return typedPhone;
    if (authPhone.isNotEmpty) return authPhone;

    setState(() => _errorText = 'Please enter your phone number to continue.');
    throw StateError('Phone number required to continue.');
  }

  Future<void> _saveOnboardingData() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      setState(() => _errorText = "Session expired. Please sign in again.");
      return;
    }

    final name  = _nameController.text.trim();
    final email = _emailController.text.trim();

    late final String docId;
    try {
      docId = _resolveDocIdOrError(user);
    } catch (_) {
      return;
    }

    setState(() {
      _loading = true;
      _errorText = null;
    });

    try {
      String? profileImageUrl = _profileImageUrl;

      // Upload selected image to Storage under phone-based path
      if (_pickedImage != null) {
        final ref = FirebaseStorage.instance.ref().child('users/$docId/profile.jpg');
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

      // Save to Firestore using phone-number doc ID (unchanged keys)
      await FirebaseFirestore.instance.collection('users').doc(docId).set({
        'name': name,
        'country': _selectedCountry,
        'currency': _selectedCurrency,
        'language': _selectedLanguage,
        'avatar': profileImageUrl ?? _selectedAvatar ?? '',
        'onboarded': true,
        'email': email,
        'phone': _phoneController.text.trim().isNotEmpty
            ? _phoneController.text.trim()
            : (user.phoneNumber ?? ''),
        'created': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      // Auto-claim any pending friend invites for this phone
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

    final authPhone = (user.phoneNumber ?? '').trim();
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

  // --- Step navigation & validation ---
  Future<void> _next() async {
    if (_step == 1) {
      // validate profile step
      final ok = _validateProfile();
      if (!ok) return;
    }
    if (_step < _lastStep) {
      setState(() => _step++);
      _pg.animateToPage(_step, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    } else {
      // finish
      await _saveOnboardingData();
    }
  }

  void _back() {
    if (_step > 0) {
      setState(() => _step--);
      _pg.animateToPage(_step, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    }
  }

  bool _validateProfile() {
    final nameOk = _nameController.text.trim().isNotEmpty;
    final phone = _phoneController.text.trim();
    final phoneOk = phone.isNotEmpty && phone.length >= 10;
    final emailOk = !_needsEmail ||
        (_emailController.text.trim().isNotEmpty &&
            RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(_emailController.text.trim()));

    if (!nameOk || !phoneOk || !emailOk) {
      setState(() {
        _errorText = !nameOk
            ? "Please enter your name"
            : !emailOk
            ? "Enter a valid email"
            : "Enter a valid phone number";
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_errorText!), behavior: SnackBarBehavior.floating),
      );
      return false;
    }
    setState(() => _errorText = null);
    return true;
  }

  // --- UI helpers ---
  Widget _glass({required Widget child, EdgeInsetsGeometry padding = const EdgeInsets.all(16)}) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface.withOpacity(0.25),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: Colors.white.withOpacity(0.18),
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                blurRadius: 30,
                spreadRadius: 0,
                offset: const Offset(0, 12),
                color: Colors.black.withOpacity(0.15),
              )
            ],
          ),
          child: child,
        ),
      ),
    );
  }

  Widget _progressDots() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(_lastStep + 1, (i) {
        final active = i == _step;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          margin: const EdgeInsets.symmetric(horizontal: 6),
          height: 8,
          width: active ? 28 : 8,
          decoration: BoxDecoration(
            color: active
                ? Theme.of(context).colorScheme.primary
                : Theme.of(context).colorScheme.primary.withOpacity(0.35),
            borderRadius: BorderRadius.circular(12),
          ),
        );
      }),
    );
  }

  // --- Step content ---
  Widget _stepWelcome() {
    return _glass(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.savings_rounded, size: 40, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 12),
          Text("Welcome to Fiinny 👋",
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(
            "Your money, organized beautifully.\nTrack, split, and reach goals — with smart insights.",
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: const [
              _FeatureChip(icon: Icons.auto_graph_rounded, label: "Smart Insights"),
              _FeatureChip(icon: Icons.group_rounded, label: "Splits & Partners"),
              _FeatureChip(icon: Icons.lock_rounded, label: "Private & Secure"),
            ],
          ),
          const SizedBox(height: 20),
          Text("Let’s set up your profile in under a minute.",
              style: Theme.of(context).textTheme.labelLarge),
        ],
      ),
    );
  }

  Widget _stepProfile() {
    return _glass(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Your Profile", style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          if (_errorText != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_errorText!, style: const TextStyle(color: Colors.red, fontWeight: FontWeight.w600)),
            ),
          TextFormField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: "Name", prefixIcon: Icon(Icons.person)),
          ),
          const SizedBox(height: 12),
          if (_needsEmail)
            Column(
              children: [
                TextFormField(
                  controller: _emailController,
                  decoration: const InputDecoration(labelText: "Email", prefixIcon: Icon(Icons.email)),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 12),
              ],
            ),
          TextFormField(
            controller: _phoneController,
            decoration: const InputDecoration(
              labelText: "Phone (e.g., +91XXXXXXXXXX)",
              prefixIcon: Icon(Icons.phone),
            ),
            keyboardType: TextInputType.phone,
          ),
        ],
      ),
    );
  }

  Widget _stepPrefs() {
    return _glass(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Preferences", style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _selectedCountry,
            decoration: const InputDecoration(labelText: "Country", prefixIcon: Icon(Icons.public)),
            items: ["India", "USA", "UK", "Other"].map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
            onChanged: (val) => setState(() => _selectedCountry = val),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _selectedCurrency,
            decoration: const InputDecoration(labelText: "Currency", prefixIcon: Icon(Icons.currency_exchange)),
            items: ["INR", "USD", "GBP", "Other"].map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
            onChanged: (val) => setState(() => _selectedCurrency = val),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _selectedLanguage,
            decoration: const InputDecoration(labelText: "Language", prefixIcon: Icon(Icons.language)),
            items: const [
              DropdownMenuItem(value: "en", child: Text("English")),
              DropdownMenuItem(value: "hi", child: Text("Hindi")),
            ],
            onChanged: (val) => setState(() => _selectedLanguage = val),
          ),
        ],
      ),
    );
  }

  Widget _stepAvatar() {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    return _glass(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Profile Photo", style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Center(
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircleAvatar(
                  radius: 56,
                  backgroundColor: Colors.grey[200],
                  backgroundImage: _pickedImage != null
                      ? FileImage(_pickedImage!)
                      : (_profileImageUrl != null
                      ? NetworkImage(_profileImageUrl!)
                      : (_selectedAvatar != null
                      ? AssetImage(_selectedAvatar!)
                      : null)) as ImageProvider<Object>?,
                  child: _pickedImage == null && _selectedAvatar == null && _profileImageUrl == null
                      ? const Icon(Icons.person, size: 56, color: Colors.grey)
                      : null,
                ),
                Positioned(
                  bottom: -4,
                  right: -4,
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: _pickImage,
                      borderRadius: BorderRadius.circular(24),
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: primary,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: primary.withOpacity(0.35),
                              blurRadius: 18,
                              offset: const Offset(0, 8),
                            )
                          ],
                        ),
                        child: const Icon(Icons.camera_alt_rounded, color: Colors.white),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text("Or pick an avatar", style: theme.textTheme.labelLarge),
          const SizedBox(height: 10),
          Wrap(
            spacing: 16,
            runSpacing: 12,
            children: _avatarAssets.map((asset) {
              final isSelected = _selectedAvatar == asset;
              return GestureDetector(
                onTap: () => setState(() {
                  _selectedAvatar = asset;
                  _pickedImage = null;
                  _profileImageUrl = null;
                }),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isSelected ? primary : Colors.white.withOpacity(0.25),
                      width: isSelected ? 2 : 1,
                    ),
                  ),
                  child: CircleAvatar(radius: 28, backgroundImage: AssetImage(asset)),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _stepReview() {
    final userPhone = _phoneController.text.trim();
    final name = _nameController.text.trim().isEmpty ? "Fiinny User" : _nameController.text.trim();
    final email = _needsEmail ? _emailController.text.trim() : (FirebaseAuth.instance.currentUser?.email ?? '');
    return _glass(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Review", style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          _reviewTile("Name", name, Icons.person),
          _reviewTile("Phone", userPhone.isEmpty ? "—" : userPhone, Icons.phone),
          _reviewTile("Email", (email.isEmpty) ? "—" : email, Icons.email),
          _reviewTile("Country", _selectedCountry ?? "—", Icons.public),
          _reviewTile("Currency", _selectedCurrency ?? "—", Icons.currency_exchange),
          _reviewTile("Language", _selectedLanguage == "hi" ? "Hindi" : "English", Icons.language),
          const SizedBox(height: 8),
          const Text("Looks good? Tap Finish to continue."),
        ],
      ),
    );
  }

  Widget _reviewTile(String label, String value, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: 10),
          Text("$label: ", style: const TextStyle(fontWeight: FontWeight.w600)),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }

  // --- Build ---
  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text("Quick Setup"),
        elevation: 0,
        backgroundColor: Colors.transparent,
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
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Pretty animated background
          const AnimatedMintBackground(),
          // Gradient overlay for better contrast
          IgnorePointer(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.black.withOpacity(0.25),
                    Colors.black.withOpacity(0.35),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),
          // Content
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: Column(
                children: [
                  const SizedBox(height: 6),
                  _progressDots(),
                  const SizedBox(height: 16),
                  Expanded(
                    child: Form(
                      key: _formKey,
                      child: PageView(
                        controller: _pg,
                        physics: const NeverScrollableScrollPhysics(),
                        children: [
                          _stepWelcome(),
                          _stepProfile(),
                          _stepPrefs(),
                          _stepAvatar(),
                          _stepReview(),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),

                  // CTA row
                  Row(
                    children: [
                      if (_step > 0)
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _loading ? null : _back,
                            icon: const Icon(Icons.chevron_left_rounded),
                            label: const Text("Back"),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              side: BorderSide(color: Colors.white.withOpacity(0.35)),
                              foregroundColor: Colors.white,
                            ),
                          ),
                        ),
                      if (_step > 0) const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _loading ? null : _next,
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            backgroundColor: Colors.deepPurple,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                            elevation: 2,
                          ),
                          child: _loading
                              ? const SizedBox(
                              height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white))
                              : Text(_step == _lastStep ? "Finish" : "Next"),
                        ),
                      ),
                    ],
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
        ],
      ),
    );
  }
}

// --- Tiny UI helpers ---
class _FeatureChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _FeatureChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: Icon(icon, size: 16),
      label: Text(label),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      visualDensity: VisualDensity.compact,
    );
  }
}
