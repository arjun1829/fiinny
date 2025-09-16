// lib/screens/profile_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;

import 'package:lifemap/themes/theme_provider.dart';
import '../services/backup_service.dart';

// 👇 Notifications & Reviews imports
import '../services/notif_prefs_service.dart';
import '../services/review_queue_service.dart';
import '../models/ingest_draft_model.dart';

// (Optional) If you later expose a dedicated Gmail link flow, navigate there.
// For now, we'll just show a sheet and (if email exists) allow fetch via Dashboard entry points.

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({Key? key}) : super(key: key);

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  String? profileImageUrl;
  String? avatarAsset;
  String userName = "Fiinny User";
  String userEmail = "user@email.com";
  String userPhone = "";
  bool _loading = true;
  bool _saving = false;

  // 🔒 Privacy toggles
  bool _analyticsOptIn = true;
  bool _personalizeTips = true;

  final List<String> avatarOptions = [
    'assets/avatars/avatar1.png',
    'assets/avatars/avatar2.png',
    'assets/avatars/avatar3.png',
    'assets/images/profile_default.png',
  ];

  final Map<FiinnyTheme, Map<String, dynamic>> themeOptions = {
    FiinnyTheme.classic: {"name": "Classic", "color": Colors.deepPurple},
    FiinnyTheme.fresh: {"name": "Fresh Mint", "color": const Color(0xFF81e6d9)},
    FiinnyTheme.royal: {"name": "Royal Gold", "color": const Color(0xFF2E3192)},
    FiinnyTheme.sunny: {"name": "Sunny Coral", "color": const Color(0xFFFFF475)},
    FiinnyTheme.midnight: {"name": "Midnight", "color": const Color(0xFF131E2A)},
    FiinnyTheme.lightMinimal: {"name": "Minimal Light", "color": Colors.white},
    FiinnyTheme.pureDark: {"name": "Pure Dark", "color": Colors.black},
  };

  String _getUserPhone(User user) {
    return user.phoneNumber ?? '';
  }

  @override
  void initState() {
    super.initState();
    _fetchProfile();
  }

  Future<void> _fetchProfile() async {
    setState(() => _loading = true);
    final user = FirebaseAuth.instance.currentUser;
    if (user != null) {
      userEmail = user.email ?? "";
      final phoneId = _getUserPhone(user);
      if (phoneId.isEmpty) {
        setState(() => _loading = false);
        return;
      }
      final doc = await FirebaseFirestore.instance.collection('users').doc(phoneId).get();
      if (doc.exists) {
        final data = doc.data()!;
        userName = data['name'] ?? userName;
        userPhone = data['phone'] ?? phoneId;
        final avatar = data['avatar'] as String?;
        if (avatar != null && avatar.isNotEmpty) {
          if (avatar.startsWith('http')) {
            profileImageUrl = avatar;
            avatarAsset = null;
          } else {
            profileImageUrl = null;
            avatarAsset = avatar;
          }
        }
        // Load privacy prefs if present
        _analyticsOptIn = (data['analytics_opt_in'] as bool?) ?? true;
        _personalizeTips = (data['personalize_tips'] as bool?) ?? true;
      }
    }
    setState(() => _loading = false);
  }

  Future<void> _updateProfile({String? name, String? avatar, String? email, String? phone}) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final phoneId = phone ?? _getUserPhone(user);
    if (phoneId.isEmpty) return;

    setState(() => _saving = true);
    await FirebaseFirestore.instance.collection('users').doc(phoneId).set({
      if (name != null) 'name': name,
      if (avatar != null) 'avatar': avatar,
      if (email != null) 'email': email,
      if (phone != null) 'phone': phone,
    }, SetOptions(merge: true));
    setState(() => _saving = false);
  }

  Future<void> _setPrivacyFlag({bool? analyticsOptIn, bool? personalizeTips}) async {
    if (userPhone.isEmpty) return;
    await FirebaseFirestore.instance.collection('users').doc(userPhone).set({
      if (analyticsOptIn != null) 'analytics_opt_in': analyticsOptIn,
      if (personalizeTips != null) 'personalize_tips': personalizeTips,
      'privacy_updated_at': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<void> _pickProfileImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
    if (picked == null) return;
    final file = File(picked.path);

    setState(() => _saving = true);
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;
      final phoneId = _getUserPhone(user);
      if (phoneId.isEmpty) return;

      final ref = FirebaseStorage.instance.ref().child('users/$phoneId/profile.jpg');
      await ref.putFile(file);
      final url = await ref.getDownloadURL();
      setState(() {
        profileImageUrl = url;
        avatarAsset = null;
      });
      await _updateProfile(avatar: url);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Image upload failed: $e")));
    }
    setState(() => _saving = false);
  }

  void _pickAvatar() async {
    String? picked = await showModalBottomSheet<String>(
      context: context,
      builder: (_) => SafeArea(
        child: GridView.builder(
          shrinkWrap: true,
          padding: const EdgeInsets.all(18),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            mainAxisSpacing: 18,
            crossAxisSpacing: 18,
          ),
          itemCount: avatarOptions.length,
          itemBuilder: (ctx, i) => GestureDetector(
            onTap: () => Navigator.pop(context, avatarOptions[i]),
            child: CircleAvatar(
              backgroundImage: AssetImage(avatarOptions[i]),
              radius: 36,
              backgroundColor: Colors.grey[200],
            ),
          ),
        ),
      ),
    );
    if (picked != null) {
      setState(() {
        avatarAsset = picked;
        profileImageUrl = null;
      });
      await _updateProfile(avatar: picked);
    }
  }

  void _editName() async {
    final controller = TextEditingController(text: userName);
    String? newName = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Edit Name"),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: "Your Name",
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            child: const Text("Cancel"),
            onPressed: () => Navigator.pop(context),
          ),
          ElevatedButton(
            child: const Text("Save"),
            onPressed: () => Navigator.pop(context, controller.text.trim()),
          ),
        ],
      ),
    );
    if (newName != null && newName.isNotEmpty) {
      setState(() => userName = newName);
      await _updateProfile(name: newName);
    }
  }

  void _editEmail() async {
    final controller = TextEditingController(text: userEmail);
    String? newEmail = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Edit Email"),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(
            labelText: "Email",
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            child: const Text("Cancel"),
            onPressed: () => Navigator.pop(context),
          ),
          ElevatedButton(
            child: const Text("Save"),
            onPressed: () => Navigator.pop(context, controller.text.trim()),
          ),
        ],
      ),
    );
    if (newEmail != null && newEmail.isNotEmpty && newEmail != userEmail) {
      setState(() => _saving = true);
      try {
        final user = FirebaseAuth.instance.currentUser;
        if (user != null) {
          await user.updateEmail(newEmail);
          await _updateProfile(email: newEmail);
        }
        setState(() => userEmail = newEmail);
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Failed to update email: $e")),
        );
      }
      setState(() => _saving = false);
    }
  }

  void _editPhone() async {
    final controller = TextEditingController(text: userPhone);
    String? newPhone = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Edit Phone Number"),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: "Phone Number",
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            child: const Text("Cancel"),
            onPressed: () => Navigator.pop(context),
          ),
          ElevatedButton(
            child: const Text("Save"),
            onPressed: () => Navigator.pop(context, controller.text.trim()),
          ),
        ],
      ),
    );
    if (newPhone != null && newPhone.isNotEmpty) {
      setState(() => userPhone = newPhone);
      await _updateProfile(phone: newPhone);
    }
  }

  Future<void> _exportData() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final phoneId = _getUserPhone(user);
    if (phoneId.isEmpty) return;

    try {
      await BackupService.shareUserData(userId: phoneId);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Failed to export data: $e")),
      );
    }
  }

  Future<void> _logout() async {
    await FirebaseAuth.instance.signOut();
    if (!mounted) return;
    Navigator.of(context).pushNamedAndRemoveUntil('/', (route) => false);
  }

  Future<void> _deleteAccount() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final phoneId = _getUserPhone(user);
    if (phoneId.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Delete Account?"),
        content: const Text(
          "This will permanently delete your account and all your data. This cannot be undone.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text("Cancel"),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text("Delete", style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _saving = true);

    try {
      await FirebaseFirestore.instance.collection('users').doc(phoneId).delete();
      await user.delete();
    } catch (e) {
      setState(() => _saving = false);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Failed to delete account: $e")),
      );
      return;
    }

    setState(() => _saving = false);
    if (!mounted) return;
    Navigator.of(context).pushNamedAndRemoveUntil('/', (route) => false);
  }

  // ---------- UI helpers ----------

  Widget _sectionTitle(BuildContext context, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 10),
      child: Text(
        text,
        style: TextStyle(
          fontWeight: FontWeight.bold,
          color: Theme.of(context).colorScheme.primary,
          fontSize: 15,
        ),
      ),
    );
  }

  Widget _cardContainer({required Widget child}) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.95),
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 14, offset: Offset(0, 6)),
        ],
        border: Border.all(color: Colors.black12.withOpacity(0.05)),
      ),
      child: child,
    );
  }

  Widget _notificationsReviewsSection(BuildContext context) {
    final accent = const Color(0xFF09857a);
    final canStreamReviews = userPhone.isNotEmpty;

    return _cardContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            alignment: Alignment.centerLeft,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: const Text(
              "Notifications & Reviews",
              style: TextStyle(
                color: Color(0xFF09857a),
                fontWeight: FontWeight.w800,
                fontSize: 16,
              ),
            ),
          ),
          const Divider(height: 1),
          ListTile(
            leading: Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: accent.withOpacity(0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.notifications_active_rounded, color: Color(0xFF09857a)),
            ),
            title: const Text("Notification Preferences", style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: const Text("Control daily/weekly/monthly nudges, overspend alerts & more"),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () async {
              await NotifPrefsService.ensureDefaultPrefs();
              if (!mounted) return;
              Navigator.pushNamed(context, '/settings/notifications');
            },
          ),

        ],
      ),
    );
  }

  Widget _privacyDataSection(BuildContext context) {
    final accent = const Color(0xFF09857a);
    final isAndroid = Platform.isAndroid;

    return _cardContainer(
      child: Column(
        children: [
          Container(
            alignment: Alignment.centerLeft,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: const Text(
              "Privacy & Data Controls",
              style: TextStyle(
                color: Color(0xFF09857a),
                fontWeight: FontWeight.w800,
                fontSize: 16,
              ),
            ),
          ),
          const Divider(height: 1),
          SwitchListTile.adaptive(
            activeColor: accent,
            value: _analyticsOptIn,
            title: const Text("Share anonymous analytics"),
            subtitle: const Text("Helps us improve features and reliability"),
            onChanged: (v) async {
              setState(() => _analyticsOptIn = v);
              await _setPrivacyFlag(analyticsOptIn: v);
            },
          ),
          const Divider(height: 1),
          SwitchListTile.adaptive(
            activeColor: accent,
            value: _personalizeTips,
            title: const Text("Personalized tips & insights"),
            subtitle: const Text("Use your data locally to tailor advice"),
            onChanged: (v) async {
              setState(() => _personalizeTips = v);
              await _setPrivacyFlag(personalizeTips: v);
            },
          ),
          const Divider(height: 1),

          // SMS Permissions (Android only)
          ListTile(
            leading: Icon(Icons.sms, color: isAndroid ? accent : Colors.grey),
            title: const Text("SMS Permissions"),
            subtitle: Text(
              isAndroid
                  ? "Read-only for bank/UPI alerts to auto-track — never shared without consent"
                  : "Not required on iOS",
              style: TextStyle(color: isAndroid ? null : Colors.grey),
            ),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: isAndroid
                ? () {
              showModalBottomSheet(
                context: context,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                builder: (ctx) => SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text("SMS Access", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                        SizedBox(height: 8),
                        Text(
                          "Fiinny only reads bank/UPI alert SMS on your device to auto-add transactions. "
                              "Nothing is uploaded unless you enable cloud backup.",
                        ),
                        SizedBox(height: 12),
                        Text("To enable/disable:", style: TextStyle(fontWeight: FontWeight.w700)),
                        SizedBox(height: 4),
                        Text("Settings ▸ Apps ▸ Fiinny ▸ Permissions ▸ SMS"),
                        SizedBox(height: 8),
                      ],
                    ),
                  ),
                ),
              );
            }
                : null,
          ),
          const Divider(height: 1),

          // Gmail link / fetch
          ListTile(
            leading: Icon(Icons.mail_rounded, color: accent),
            title: const Text("Email (bank statements)"),
            subtitle: Text(
              userEmail.isNotEmpty
                  ? "Linked: $userEmail"
                  : "Link your email to parse statement emails",
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () {
              showModalBottomSheet(
                context: context,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                builder: (ctx) => SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text("Email Linking", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 8),
                        Text(
                          userEmail.isNotEmpty
                              ? "Currently linked to $userEmail.\nWe parse transaction notifications to auto-add items."
                              : "Link your Gmail in the app’s login/auth flow.\nAfter linking, use Dashboard ▸ Sync to fetch data.",
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            ElevatedButton.icon(
                              icon: const Icon(Icons.sync),
                              label: const Text("How to fetch"),
                              onPressed: () {
                                Navigator.pop(ctx);
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text("On Dashboard, tap the Sync icon to fetch Gmail transactions."),
                                  ),
                                );
                              },
                            ),
                            const SizedBox(width: 10),
                            TextButton(
                              child: const Text("Close"),
                              onPressed: () => Navigator.pop(ctx),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
          const Divider(height: 1),

          // Export/Share data (reusing existing method)
          ListTile(
            leading: Icon(Icons.archive_rounded, color: accent),
            title: const Text("Export / Share my data"),
            subtitle: const Text("Download a copy of your transactions"),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: _exportData,
          ),
        ],
      ),
    );
  }

  Widget _helpSection(BuildContext context) {
    final accent = const Color(0xFF09857a);

    Widget qa(String q, String a, {VoidCallback? cta, String? ctaLabel, IconData? icon}) {
      return ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 14),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        leading: Icon(icon ?? Icons.help_outline_rounded, color: accent),
        title: Text(q, style: const TextStyle(fontWeight: FontWeight.w600)),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Text(a, style: const TextStyle(color: Colors.black87)),
          ),
          if (cta != null) ...[
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: ElevatedButton(onPressed: cta, child: Text(ctaLabel ?? "Open")),
            ),
          ],
        ],
      );
    }

    return _cardContainer(
      child: Column(
        children: [
          Container(
            alignment: Alignment.centerLeft,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: const Text(
              "Help & Support",
              style: TextStyle(
                color: Color(0xFF09857a),
                fontWeight: FontWeight.w800,
                fontSize: 16,
              ),
            ),
          ),
          const Divider(height: 1),
          qa(
            "How does Fiinny auto-track my transactions?",
            "On Android, we read only bank & UPI alert SMS locally. If you link Gmail, we read your "
                "bank notification emails. Nothing gets uploaded unless you enable backup. You can always review or edit drafts.",
            icon: Icons.sms,
          ),
          qa(
            "How do I set spending limits & alerts?",
            "On Dashboard, tap the small pencil icon on the ring card to set period limits. We warn you at 80% and 100%. "
                "You can customize push alerts from Notification Preferences.",
            icon: Icons.speed_rounded,
            cta: () => Navigator.pushNamed(context, '/settings/notifications'),
            ctaLabel: "Notification Preferences",
          ),
          qa(
            "How do I back up or export my data?",
            "Use Export/Share to download a copy anytime. Cloud backup & restore is coming soon.",
            icon: Icons.archive_rounded,
            cta: _exportData,
            ctaLabel: "Export now",
          ),
          qa(
            "Need more help or want to report a bug?",
            "Email us at support@fiinny.app with screenshots and steps. We’ll get back quickly.",
            icon: Icons.support_agent_rounded,
            cta: () async {
              await Clipboard.setData(const ClipboardData(text: "support@fiinny.app"));
              // ignore: use_build_context_synchronously
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("Support email copied to clipboard")),
              );
            },
            ctaLabel: "Copy support email",
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    final currentTheme = themeProvider.theme;

    return Scaffold(
      appBar: AppBar(
        title: const Text("My Profile"),
        backgroundColor: Theme.of(context).colorScheme.primary,
        actions: [
          if (_loading || _saving)
            const Padding(
              padding: EdgeInsets.only(right: 20),
              child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
        padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
        children: [
          // Avatar
          Center(
            child: GestureDetector(
              onTap: () async {
                final action = await showModalBottomSheet<String>(
                  context: context,
                  builder: (ctx) => Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ListTile(
                        leading: const Icon(Icons.image),
                        title: const Text("Upload Photo"),
                        onTap: () => Navigator.pop(ctx, "photo"),
                      ),
                      ListTile(
                        leading: const Icon(Icons.emoji_emotions),
                        title: const Text("Pick Avatar"),
                        onTap: () => Navigator.pop(ctx, "avatar"),
                      ),
                    ],
                  ),
                );
                if (action == "photo") {
                  await _pickProfileImage();
                } else if (action == "avatar") {
                  _pickAvatar();
                }
              },
              child: CircleAvatar(
                radius: 48,
                backgroundImage: profileImageUrl != null
                    ? NetworkImage(profileImageUrl!)
                    : (avatarAsset != null
                    ? AssetImage(avatarAsset!)
                    : const AssetImage('assets/images/profile_default.png')) as ImageProvider<Object>,
                child: Align(
                  alignment: Alignment.bottomRight,
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.edit, color: Colors.deepPurple, size: 22),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),
          Center(
            child: Text(
              userName,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(height: 6),
          if (userEmail.isNotEmpty)
            Center(
              child: Text(
                userEmail,
                style: TextStyle(fontSize: 15, color: Colors.grey[700]),
              ),
            ),
          if (userPhone.isNotEmpty)
            Center(
              child: Text(
                userPhone,
                style: TextStyle(fontSize: 15, color: Colors.grey[600]),
              ),
            ),

          const SizedBox(height: 22),

          // Basics
          _cardContainer(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.person),
                  title: const Text("Edit Name"),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                  onTap: _editName,
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.email_rounded),
                  title: const Text("Edit Email"),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                  onTap: _editEmail,
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.phone),
                  title: const Text("Edit Phone Number"),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                  onTap: _editPhone,
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // NEW: Notifications & Reviews
          _notificationsReviewsSection(context),

          const SizedBox(height: 12),

          // NEW: Privacy & Data Controls
          _privacyDataSection(context),

          const SizedBox(height: 12),

          // NEW: Help & Support (FAQs)
          _helpSection(context),

          const SizedBox(height: 12),

          // Theme / Appearance
          _sectionTitle(context, "App Theme"),
          _cardContainer(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.color_lens_rounded),
                  title: const Text("Dark Mode"),
                  trailing: Switch(
                    value: themeProvider.isDarkMode,
                    onChanged: (val) => themeProvider.toggleTheme(),
                    activeColor: Colors.deepPurple,
                  ),
                  onTap: () => themeProvider.toggleTheme(),
                ),
                const Divider(height: 1),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: SizedBox(
                    height: 56,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: themeOptions.entries.map((entry) {
                        final key = entry.key;
                        final themeName = entry.value['name'];
                        final themeColor = entry.value['color'] as Color;
                        final isSelected = currentTheme == key;
                        return Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 5),
                          child: ChoiceChip(
                            label: Text(
                              themeName,
                              style: TextStyle(color: isSelected ? Colors.white : Colors.black),
                            ),
                            selected: isSelected,
                            backgroundColor: themeColor.withOpacity(0.22),
                            selectedColor: themeColor,
                            avatar: CircleAvatar(backgroundColor: themeColor, radius: 8),
                            onSelected: (_) => themeProvider.setTheme(key),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ),
              ],
            ),
          ),

          const Divider(height: 36),

          // Danger zone
          _cardContainer(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.logout_rounded, color: Colors.redAccent),
                  title: const Text("Logout", style: TextStyle(color: Colors.redAccent)),
                  onTap: _logout,
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.delete_forever_rounded, color: Colors.red),
                  title: const Text("Delete Account", style: TextStyle(color: Colors.red)),
                  onTap: _deleteAccount,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
