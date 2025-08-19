import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:lifemap/themes/theme_provider.dart';
import '../services/backup_service.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'dart:io';

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
    // Always prefer Firestore 'phone' field if available
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Failed to export data: $e")),
      );
    }
  }

  Future<void> _logout() async {
    await FirebaseAuth.instance.signOut();
    if (mounted) {
      Navigator.of(context).pushNamedAndRemoveUntil('/', (route) => false);
    }
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Failed to delete account: $e")),
      );
      return;
    }

    setState(() => _saving = false);

    if (mounted) {
      Navigator.of(context).pushNamedAndRemoveUntil('/', (route) => false);
    }
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
          ListTile(
            leading: const Icon(Icons.person),
            title: const Text("Edit Name"),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            onTap: _editName,
          ),
          ListTile(
            leading: const Icon(Icons.email_rounded),
            title: const Text("Edit Email"),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            onTap: _editEmail,
          ),
          ListTile(
            leading: const Icon(Icons.phone),
            title: const Text("Edit Phone Number"),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            onTap: _editPhone,
          ),
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
          const SizedBox(height: 18),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 10),
            child: Text(
              "App Theme",
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.primary,
                fontSize: 15,
              ),
            ),
          ),
          SizedBox(
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
          const SizedBox(height: 22),
          ListTile(
            leading: const Icon(Icons.share_rounded),
            title: const Text("Export/Share Data"),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            onTap: _exportData,
          ),
          ListTile(
            leading: const Icon(Icons.privacy_tip_outlined),
            title: const Text("Privacy & Data Controls"),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("Privacy settings coming soon!")),
              );
            },
          ),
          const Divider(height: 36),
          ListTile(
            leading: const Icon(Icons.logout_rounded, color: Colors.redAccent),
            title: const Text(
              "Logout",
              style: TextStyle(color: Colors.redAccent),
            ),
            onTap: _logout,
          ),
          ListTile(
            leading: const Icon(Icons.delete_forever_rounded, color: Colors.red),
            title: const Text(
              "Delete Account",
              style: TextStyle(color: Colors.red),
            ),
            onTap: _deleteAccount,
          ),
        ],
      ),
    );
  }
}
