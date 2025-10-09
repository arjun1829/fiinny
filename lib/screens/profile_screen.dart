// lib/screens/profile_screen.dart
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData, SystemUiOverlayStyle;

import 'package:lifemap/themes/theme_provider.dart';
import '../services/backup_service.dart';

// 👇 Notifications & Reviews imports (kept)
import '../services/notif_prefs_service.dart';
import '../services/review_queue_service.dart';
import '../models/ingest_draft_model.dart';

// 👇 Ads: your current infra
import 'package:lifemap/core/ads/adaptive_banner.dart';
import 'package:lifemap/core/ads/ad_ids.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({Key? key}) : super(key: key);

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  // Accent agreed
  static const Color _accent = Color(0xFF159E8A);

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

  // Theme persistence (Firestore write guard)
  bool _persistingTheme = false;

  // Expand/collapse states — start CLOSED by default
  bool _expandAvatar = false;
  bool _expandNotifications = false;
  bool _expandPrivacy = false;
  bool _expandHelp = false;
  bool _expandTheme = false;

  // 👇 replace the whole avatarOptions list with this:
  final List<String> avatarOptions = [
    'assets/avatars/avatar1.png',
    'assets/avatars/avatar2.png',
    'assets/avatars/avatar3.png',
    'assets/avatars/avatar4.png',
    'assets/avatars/avatar5.png',
    'assets/avatars/avatar6.png',
    'assets/avatars/avatar7.png',
    'assets/avatars/avatar8.png',
    'assets/avatars/avatar9.png',
    'assets/avatars/avatar10.png',
    // keep fallback separate (not in the picker):
    // 'assets/images/profile_default.png',
  ];


  final Map<FiinnyTheme, Map<String, dynamic>> themeOptions = {
    FiinnyTheme.classic: {"name": "Classic", "color": Colors.deepPurple},
    FiinnyTheme.fresh: {"name": "Fresh Mint", "color": Color(0xFF81e6d9)},
    FiinnyTheme.royal: {"name": "Royal Gold", "color": Color(0xFF2E3192)},
    FiinnyTheme.sunny: {"name": "Sunny Coral", "color": Color(0xFFFFF475)},
    FiinnyTheme.midnight: {"name": "Midnight", "color": Color(0xFF131E2A)},
    FiinnyTheme.lightMinimal: {"name": "Minimal Light", "color": Colors.white},
    FiinnyTheme.pureDark: {"name": "Pure Dark", "color": Colors.black},
  };

  String _getUserPhone(User user) => user.phoneNumber ?? '';

  // --- Theme key helpers (persist/read) ---
  String _themeKey(FiinnyTheme t) {
    switch (t) {
      case FiinnyTheme.classic: return 'classic';
      case FiinnyTheme.fresh: return 'fresh';
      case FiinnyTheme.royal: return 'royal';
      case FiinnyTheme.sunny: return 'sunny';
      case FiinnyTheme.midnight: return 'midnight';
      case FiinnyTheme.lightMinimal: return 'lightMinimal';
      case FiinnyTheme.pureDark: return 'pureDark';
    }
  }

  FiinnyTheme _themeFromKey(String? key) {
    switch (key) {
      case 'fresh': return FiinnyTheme.fresh;
      case 'royal': return FiinnyTheme.royal;
      case 'sunny': return FiinnyTheme.sunny;
      case 'midnight': return FiinnyTheme.midnight;
      case 'lightMinimal': return FiinnyTheme.lightMinimal;
      case 'pureDark': return FiinnyTheme.pureDark;
      case 'classic':
      default:
        return FiinnyTheme.classic;
    }
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

        // Load & apply theme if present
        final savedThemeKey = data['theme_key'] as String?;
        final savedDark = data['dark_mode'] as bool?;
        if (mounted) {
          final tp = Provider.of<ThemeProvider>(context, listen: false);
          if (savedThemeKey != null) {
            final ft = _themeFromKey(savedThemeKey);
            if (tp.theme != ft) {
              tp.setTheme(ft);
            }
          }
          // Your ThemeProvider has toggleTheme(), not setDarkMode()
          if (savedDark != null && tp.isDarkMode != savedDark) {
            tp.toggleTheme();
          }
        }
      } else {
        userPhone = phoneId; // show phone even if doc missing
      }
    }
    setState(() => _loading = false);
  }

  Future<void> _updateProfile({
    String? name,
    String? avatar,
    String? email,
    String? phone,
  }) async {
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

  Future<void> _persistThemeChange(FiinnyTheme theme, bool dark) async {
    if (userPhone.isEmpty) return;
    if (_persistingTheme) return;
    _persistingTheme = true;
    try {
      await FirebaseFirestore.instance.collection('users').doc(userPhone).set({
        'theme_key': _themeKey(theme),
        'dark_mode': dark,
        'theme_updated_at': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } finally {
      _persistingTheme = false;
    }
  }

  Future<void> _setPrivacyFlag({bool? analyticsOptIn, bool? personalizeTips}) async {
    if (userPhone.isEmpty) return;
    final analytics = analyticsOptIn ?? _analyticsOptIn;
    final tips = personalizeTips ?? _personalizeTips;

    await FirebaseFirestore.instance.collection('users').doc(userPhone).set({
      if (analyticsOptIn != null) 'analytics_opt_in': analyticsOptIn,
      if (personalizeTips != null) 'personalize_tips': personalizeTips,
      'privacy_updated_at': FieldValue.serverTimestamp(),
      'consent_version': 'v1',
      'consent_vector': {'analytics': analytics, 'tips': tips},
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
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
          await FirebaseFirestore.instance.collection('users').doc(_getUserPhone(user)).set({
            'email': newEmail,
            'email_linked_at': FieldValue.serverTimestamp(),
          }, SetOptions(merge: true));
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

    setState(() => _saving = true);
    try {
      await BackupService.shareUserData(userId: phoneId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Export started — check your share targets.")),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Failed to export data: $e")),
      );
    }
    setState(() => _saving = false);
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
      builder: (ctx) {
        final txt = TextEditingController();
        return AlertDialog(
          title: const Text("Delete Account?"),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "This will permanently delete your account and all your data. This cannot be undone.",
                style: TextStyle(color: Colors.black87),
              ),
              const SizedBox(height: 12),
              const Text("Type DELETE to confirm:", style: TextStyle(fontWeight: FontWeight.w600, color: Colors.black87)),
              const SizedBox(height: 6),
              TextField(
                controller: txt,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'DELETE',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text("Cancel"),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () => Navigator.of(ctx).pop(txt.text.trim().toUpperCase() == 'DELETE'),
              child: const Text("Delete", style: TextStyle(color: Colors.white)),
            ),
          ],
        );
      },
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
    // Kept for any small headings
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 10),
      child: Text(
        text,
        style: const TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: 15,
          color: Colors.black87,
        ),
      ),
    );
  }

  Widget _cardContainer({required Widget child}) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.98),
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 14, offset: Offset(0, 6)),
        ],
        border: Border.all(color: Colors.black12.withOpacity(0.06)),
      ),
      child: child,
    );
  }

  double _computeProfileCompleteness() {
    // Simple 0–100: name, email, phone, avatar, email linked
    int score = 0;
    if (userName.trim().isNotEmpty) score++;
    if (userEmail.trim().isNotEmpty) score++;
    if (userPhone.trim().isNotEmpty) score++;
    if ((profileImageUrl?.isNotEmpty ?? false) || (avatarAsset?.isNotEmpty ?? false)) score++;
    if (userEmail.trim().isNotEmpty) score++;
    const total = 5;
    return (score / total) * 100.0;
  }

  // ---------- Expandable Sections ----------

  Widget _avatarSection(BuildContext context) {
    // Inline avatar options + actions
    return _cardContainer(
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.black12),
        child: ExpansionTile(
          initiallyExpanded: _expandAvatar,
          onExpansionChanged: (v) => setState(() => _expandAvatar = v),
          leading: Icon(Icons.emoji_emotions, color: _accent),
          title: const Text(
            "Profile Photo & Avatar",
            style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black87),
          ),
          iconColor: _accent,
          collapsedIconColor: _accent,
          childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          children: [
            const Divider(height: 1),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.image),
                    label: const Text("Upload Photo"),
                    onPressed: _pickProfileImage,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.black87,
                      side: BorderSide(color: _accent.withOpacity(0.35)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.emoji_emotions),
                    label: const Text("Choose Avatar"),
                    onPressed: _pickAvatar,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.black87,
                      side: BorderSide(color: _accent.withOpacity(0.35)),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // ↑ Prevent overflow by giving the row a bit more height and tightening spacing.
            SizedBox(
              height: 90, // was 76 → extra headroom for avatar + label
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                itemCount: avatarOptions.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (ctx, i) {
                  final asset = avatarOptions[i];
                  final isSelected = avatarAsset == asset && profileImageUrl == null;
                  return GestureDetector(
                    onTap: () async {
                      setState(() {
                        avatarAsset = asset;
                        profileImageUrl = null;
                      });
                      await _updateProfile(avatar: asset);
                    },
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircleAvatar(
                          backgroundImage: AssetImage(asset),
                          radius: 26, // keep your visual; height bump handles layout
                          backgroundColor: Colors.grey[200],
                        ),
                        const SizedBox(height: 4), // was 6
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1.5), // slightly tighter
                          decoration: BoxDecoration(
                            color: isSelected ? _accent.withOpacity(0.15) : Colors.transparent,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: isSelected ? _accent : Colors.black12,
                              width: isSelected ? 1.2 : 1,
                            ),
                          ),
                          child: Text(
                            isSelected ? "Selected" : "Use",
                            style: TextStyle(
                              fontSize: 11, // was 12
                              color: isSelected ? Colors.black : Colors.black87,
                              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),

          ],
        ),
      ),
    );
  }

  Widget _notificationsReviewsSection(BuildContext context) {
    return _cardContainer(
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.black12),
        child: ExpansionTile(
          initiallyExpanded: _expandNotifications,
          onExpansionChanged: (v) => setState(() => _expandNotifications = v),
          leading: Icon(Icons.notifications_active_rounded, color: _accent),
          title: const Text(
            "Notifications & Reviews",
            style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black87),
          ),
          iconColor: _accent,
          collapsedIconColor: _accent,
          childrenPadding: const EdgeInsets.only(bottom: 8),
          children: [
            const Divider(height: 1),
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: _accent.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.tune_rounded, color: Colors.black87),
              ),
              title: const Text("Notification Preferences", style: TextStyle(fontWeight: FontWeight.w600, color: Colors.black87)),
              subtitle: const Text("Control daily/weekly/monthly nudges, overspend alerts & more", style: TextStyle(color: Colors.black87)),
              trailing: const Icon(Icons.chevron_right_rounded, color: Colors.black87),
              onTap: () async {
                await NotifPrefsService.ensureDefaultPrefs();
                if (!mounted) return;
                Navigator.pushNamed(context, '/settings/notifications');
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _privacyDataSection(BuildContext context) {
    final isAndroid = Platform.isAndroid;

    return _cardContainer(
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.black12),
        child: ExpansionTile(
          initiallyExpanded: _expandPrivacy,
          onExpansionChanged: (v) => setState(() => _expandPrivacy = v),
          leading: Icon(Icons.privacy_tip_rounded, color: _accent),
          title: const Text(
            "Privacy & Data Controls",
            style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black87),
          ),
          iconColor: _accent,
          collapsedIconColor: _accent,
          children: [
            const Divider(height: 1),
            SwitchListTile.adaptive(
              activeColor: _accent,
              value: _analyticsOptIn,
              title: const Text("Share anonymous analytics", style: TextStyle(color: Colors.black87)),
              subtitle: const Text("Helps us improve features and reliability", style: TextStyle(color: Colors.black87)),
              onChanged: (v) async {
                setState(() => _analyticsOptIn = v);
                await _setPrivacyFlag(analyticsOptIn: v);
              },
            ),
            const Divider(height: 1),
            SwitchListTile.adaptive(
              activeColor: _accent,
              value: _personalizeTips,
              title: const Text("Personalized tips & insights", style: TextStyle(color: Colors.black87)),
              subtitle: const Text("Use your data locally to tailor advice", style: TextStyle(color: Colors.black87)),
              onChanged: (v) async {
                setState(() => _personalizeTips = v);
                await _setPrivacyFlag(personalizeTips: v);
              },
            ),
            const Divider(height: 1),

            // SMS Permissions (Android only)
            ListTile(
              leading: Icon(Icons.sms, color: isAndroid ? _accent : Colors.grey),
              title: const Text("SMS Permissions", style: TextStyle(color: Colors.black87)),
              subtitle: Text(
                isAndroid
                    ? "Read-only for bank/UPI alerts to auto-track — never shared without consent"
                    : "Not required on iOS",
                style: TextStyle(color: isAndroid ? Colors.black87 : Colors.grey),
              ),
              trailing: const Icon(Icons.chevron_right_rounded, color: Colors.black87),
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
                          Text("SMS Access", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.black87)),
                          SizedBox(height: 8),
                          Text(
                            "Fiinny only reads bank/UPI alert SMS on your device to auto-add transactions. "
                                "Nothing is uploaded unless you enable cloud backup.",
                            style: TextStyle(color: Colors.black87),
                          ),
                          SizedBox(height: 12),
                          Text("To enable/disable:", style: TextStyle(fontWeight: FontWeight.w700, color: Colors.black87)),
                          SizedBox(height: 4),
                          Text("Settings ▸ Apps ▸ Fiinny ▸ Permissions ▸ SMS", style: TextStyle(color: Colors.black87)),
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
              leading: Icon(Icons.mail_rounded, color: _accent),
              title: const Text("Email (bank statements)", style: TextStyle(color: Colors.black87)),
              subtitle: Text(
                userEmail.isNotEmpty ? "Linked: $userEmail" : "Link your email to parse statement emails",
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.black87),
              ),
              trailing: const Icon(Icons.chevron_right_rounded, color: Colors.black87),
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
                          const Text("Email Linking", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.black87)),
                          const SizedBox(height: 8),
                          Text(
                            userEmail.isNotEmpty
                                ? "Currently linked to $userEmail.\nWe parse transaction notifications to auto-add items."
                                : "Link your Gmail in the app’s login/auth flow.\nAfter linking, use Dashboard ▸ Sync to fetch data.",
                            style: const TextStyle(color: Colors.black87),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              ElevatedButton.icon(
                                icon: const Icon(Icons.sync),
                                label: const Text("How to fetch"),
                                style: ElevatedButton.styleFrom(backgroundColor: _accent, foregroundColor: Colors.white),
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

            // Export/Share data
            ListTile(
              leading: Icon(Icons.archive_rounded, color: _accent),
              title: const Text("Export / Share my data", style: TextStyle(color: Colors.black87)),
              subtitle: const Text("Download a copy of your transactions", style: TextStyle(color: Colors.black87)),
              trailing: const Icon(Icons.chevron_right_rounded, color: Colors.black87),
              onTap: _exportData,
            ),
          ],
        ),
      ),
    );
  }

  Widget _helpSection(BuildContext context) {
    return _cardContainer(
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.black12),
        child: ExpansionTile(
          initiallyExpanded: _expandHelp,
          onExpansionChanged: (v) => setState(() => _expandHelp = v),
          leading: Icon(Icons.help_center_rounded, color: _accent),
          title: const Text(
            "Help & Support",
            style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black87),
          ),
          iconColor: _accent,
          collapsedIconColor: _accent,
          childrenPadding: const EdgeInsets.only(bottom: 10),
          children: [
            const Divider(height: 1),
            _qa(
              icon: Icons.sms,
              q: "How does Fiinny auto-track my transactions?",
              a: "On Android, we read only bank & UPI alert SMS locally. If you link Gmail, we read your "
                  "bank notification emails. Nothing gets uploaded unless you enable backup. You can always review or edit drafts.",
            ),
            _qa(
              icon: Icons.speed_rounded,
              q: "How do I set spending limits & alerts?",
              a: "On Dashboard, tap the small pencil icon on the ring card to set period limits. We warn you at 80% and 100%. "
                  "You can customize push alerts from Notification Preferences.",
              cta: () => Navigator.pushNamed(context, '/settings/notifications'),
              ctaLabel: "Notification Preferences",
            ),
            _qa(
              icon: Icons.archive_rounded,
              q: "How do I back up or export my data?",
              a: "Use Export/Share to download a copy anytime. Cloud backup & restore is coming soon.",
              cta: _exportData,
              ctaLabel: "Export now",
            ),
            _qa(
              icon: Icons.support_agent_rounded,
              q: "Need more help or want to report a bug?",
              a: "Email us at support@fiinny.app with screenshots and steps. We’ll get back quickly.",
              cta: () async {
                await Clipboard.setData(const ClipboardData(text: "support@fiinny.app"));
                if (!mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text("Support email copied to clipboard")),
                );
              },
              ctaLabel: "Copy support email",
            ),
          ],
        ),
      ),
    );
  }

  Widget _qa({
    required String q,
    required String a,
    IconData? icon,
    VoidCallback? cta,
    String? ctaLabel,
  }) {
    return ExpansionTile(
      tilePadding: const EdgeInsets.symmetric(horizontal: 14),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      leading: Icon(icon ?? Icons.help_outline_rounded, color: _accent),
      title: Text(q, style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.black87)),
      iconColor: _accent,
      collapsedIconColor: _accent,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: Text(a, style: const TextStyle(color: Colors.black87)),
        ),
        if (cta != null) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: ElevatedButton(
              onPressed: cta,
              style: ElevatedButton.styleFrom(backgroundColor: _accent, foregroundColor: Colors.white),
              child: Text(ctaLabel ?? "Open"),
            ),
          ),
        ],
      ],
    );
  }

  // --- Header (avatar + name/email/phone + completeness) ---
  Widget _headerSection(BuildContext context) {
    final percent = _computeProfileCompleteness();
    return _cardContainer(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
        child: Column(
          children: [
            GestureDetector(
              onTap: () async {
                final action = await showModalBottomSheet<String>(
                  context: context,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
              child: Stack(
                alignment: Alignment.center,
                children: [
                  SizedBox(
                    width: 108, height: 108,
                    child: CircularProgressIndicator(
                      value: percent.clamp(0, 100) / 100.0,
                      strokeWidth: 6,
                      backgroundColor: Colors.black12,
                      valueColor: const AlwaysStoppedAnimation<Color>(_accent),
                    ),
                  ),
                  CircleAvatar(
                    radius: 44,
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
                          color: Colors.white, shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.edit, color: Colors.black87, size: 20),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Text(userName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.black)),
            const SizedBox(height: 6),
            if (userEmail.isNotEmpty)
              Text(userEmail, style: TextStyle(fontSize: 15, color: Colors.grey[800])),
            if (userPhone.isNotEmpty)
              Text(userPhone, style: TextStyle(fontSize: 15, color: Colors.grey[700])),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: _accent.withOpacity(0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.verified_user_rounded, size: 18, color: Colors.black54),
                  const SizedBox(width: 8),
                  Text("Profile completeness: ${percent.toStringAsFixed(0)}%",
                      style: const TextStyle(color: Colors.black87)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    final currentTheme = themeProvider.theme;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: _accent,
        elevation: 0,
        // 👇 set title style to white
        title: const Text(
          "My Profile",
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        centerTitle: true,
        // 👇 ensure leading/back & action icons are white
        iconTheme: const IconThemeData(color: Colors.white),
        actionsIconTheme: const IconThemeData(color: Colors.white),
        foregroundColor: Colors.white,
        // 👇 make status bar icons light for contrast
        systemOverlayStyle: SystemUiOverlayStyle.light,
        actions: [
          if (_loading || _saving)
            const Padding(
              padding: EdgeInsets.only(right: 20),
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                ),
              ),
            ),
        ],
      ),

      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
        padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
        children: [
          // --- Header with completeness ---
          _headerSection(context),

          const SizedBox(height: 12),

          // Basics — KEEPING your original edit tiles
          _cardContainer(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.person, color: Colors.black87),
                  title: const Text("Edit Name", style: TextStyle(color: Colors.black87)),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.black87),
                  onTap: _editName,
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.email_rounded, color: Colors.black87),
                  title: const Text("Edit Email", style: TextStyle(color: Colors.black87)),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.black87),
                  onTap: _editEmail,
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.phone, color: Colors.black87),
                  title: const Text("Edit Phone Number", style: TextStyle(color: Colors.black87)),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.black87),
                  onTap: _editPhone,
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // NEW: Profile Photo & Avatar (expandable)
          _avatarSection(context),

          const SizedBox(height: 12),

          // 👇 Banner ad moved UP here (above Notifications & Reviews)
          SafeArea(
            top: false,
            child: AdaptiveBanner(
              adUnitId: AdIds.banner,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            ),
          ),

          const SizedBox(height: 12),

          // Notifications & Reviews (expandable)
          _notificationsReviewsSection(context),

          const SizedBox(height: 12),

          // Privacy & Data Controls (expandable)
          _privacyDataSection(context),

          const SizedBox(height: 12),

          // Help & Support (expandable with inner QAs also expandable)
          _helpSection(context),

          const SizedBox(height: 12),

          // App Theme (expandable)
          _cardContainer(
            child: Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.black12),
              child: ExpansionTile(
                initiallyExpanded: _expandTheme,
                onExpansionChanged: (v) => setState(() => _expandTheme = v),
                leading: Icon(Icons.color_lens_rounded, color: _accent),
                title: const Text(
                  "App Theme",
                  style: TextStyle(fontWeight: FontWeight.w800, color: Colors.black87),
                ),
                iconColor: _accent,
                collapsedIconColor: _accent,
                children: [
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.dark_mode_rounded, color: Colors.black87),
                    title: const Text("Dark Mode", style: TextStyle(color: Colors.black87)),
                    trailing: Switch(
                      value: themeProvider.isDarkMode,
                      onChanged: (val) async {
                        if (val != themeProvider.isDarkMode) {
                          themeProvider.toggleTheme(); // match your API
                          await _persistThemeChange(themeProvider.theme, themeProvider.isDarkMode);
                        }
                      },
                      activeColor: _accent,
                    ),
                    onTap: () async {
                      themeProvider.toggleTheme();
                      await _persistThemeChange(themeProvider.theme, themeProvider.isDarkMode);
                    },
                  ),
                  const Divider(height: 1),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 16),
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
                              onSelected: (_) async {
                                if (themeProvider.theme != key) {
                                  themeProvider.setTheme(key);
                                  await _persistThemeChange(themeProvider.theme, themeProvider.isDarkMode);
                                }
                              },
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ),
                ],
              ),
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
