// lib/widget/add_group_expense_dialog.dart
import 'dart:io' show File;

import 'package:firebase_storage/firebase_storage.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';
import '../utils/helpers.dart';
import 'ads/sleek_ad_card.dart';

/// Palette — indigo + teal accents (not just green)
const Color _kBg = Color(0xFFF6F7FB);
const Color _kText = Color(0xFF0F1E1C);
const Color _kTeal = Color(0xFF0BAE8E);
const Color _kIndigo = Color(0xFF6C63FF);

class AddGroupExpenseScreen extends StatefulWidget {
  final String userPhone;
  final String userName;
  final String? userAvatar;
  final GroupModel group;
  final List<FriendModel> allFriends; // For names/avatars resolution

  const AddGroupExpenseScreen({
    super.key,
    required this.userPhone,
    required this.userName,
    this.userAvatar,
    required this.group,
    required this.allFriends,
  });

  @override
  State<AddGroupExpenseScreen> createState() => _AddGroupExpenseScreenState();
}

class _AddGroupExpenseScreenState extends State<AddGroupExpenseScreen> {
  final _formKey = GlobalKey<FormState>();
  final _pg = PageController();
  int _step = 0;

  // Amount & meta
  double _amount = 0.0;
  String _note = '';
  String _label = '';
  String _category = '';
  DateTime _date = DateTime.now();
  String? _selectedPayerPhone;
  String _counterparty = '';

  // Custom split
  bool _customSplit = false;
  Map<String, double> _splits = {}; // phone -> split amount
  final Map<String, TextEditingController> _splitCtrls = {};

  // Loading state
  bool _saving = false;
  bool _uploading = false;

  // Attachments
  final _imagePicker = ImagePicker();
  final List<_Attachment> _attachments = [];

  // Members
  late List<FriendModel> groupMembers; // only phones in group
  late FriendModel currentUser;

  // Categories
  final List<_CategoryDef> _categories = const [
    _CategoryDef('Food', Icons.restaurant),
    _CategoryDef('Travel', Icons.flight_takeoff),
    _CategoryDef('Shopping', Icons.shopping_bag),
    _CategoryDef('Entertainment', Icons.sports_esports),
    _CategoryDef('Groceries', Icons.local_grocery_store),
    _CategoryDef('Rent', Icons.home_filled),
    _CategoryDef('Utilities', Icons.lightbulb),
    _CategoryDef('Other', Icons.category),
  ];

  // ---------------- lifecycle ----------------
  @override
  void initState() {
    super.initState();

    // "You"
    currentUser = Helpers.buildCurrentUserModel(
      userIdOrPhone: widget.userPhone,
      name: widget.userName,
      avatar: widget.userAvatar,
    );

    // Resolve group members from phones
    groupMembers = widget.group.memberPhones.map((phone) {
      if (phone == widget.userPhone) return currentUser;
      return widget.allFriends.firstWhere(
        (f) => f.phone == phone,
        orElse: () => FriendModel(phone: phone, name: "Unknown", avatar: "👤"),
      );
    }).toList();

    // Default payer
    _selectedPayerPhone = currentUser.phone;

    // Init splits & controllers
    for (final p in _participantsPhones) {
      _splits[p] = 0.0;
      _splitCtrls[p] = TextEditingController(text: _fmt2(0.0));
      _splitCtrls[p]!.addListener(() {
        final v = double.tryParse(_splitCtrls[p]!.text) ?? 0.0;
        _splits[p] = v;
        setState(() {}); // update sum pill
      });
    }
  }

  @override
  void dispose() {
    _pg.dispose();
    for (final c in _splitCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  // ---------------- helpers ----------------
  List<String> get _participantsPhones =>
      groupMembers.map((m) => m.phone).toList();

  String _fmt2(double v) => v.toStringAsFixed(2);
  double _round2(double v) => (v * 100).roundToDouble() / 100.0;
  double get _sumSplits =>
      _splits.values.fold<double>(0.0, (a, b) => a + (b.isNaN ? 0.0 : b));

  void _recalcEqualSplit() {
    final n = _participantsPhones.length;
    if (n == 0) return;
    final each = _round2(_amount / n);
    for (final p in _participantsPhones) {
      _splits[p] = each;
      _splitCtrls[p]?.text = _fmt2(each);
    }
    setState(() {});
  }

  void _clearSplits() {
    for (final p in _participantsPhones) {
      _splits[p] = 0.0;
      _splitCtrls[p]?.text = _fmt2(0.0);
    }
    setState(() {});
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2015),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => _date = DateTime(picked.year, picked.month, picked.day));
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // --------------- attachments ---------------
  void _showAttachmentSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_rounded),
              title: const Text('Camera (compressed)'),
              onTap: () {
                Navigator.pop(ctx);
                _pickFromCamera();
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_rounded),
              title: const Text('Photo from gallery (compressed)'),
              onTap: () {
                Navigator.pop(ctx);
                _pickFromGallery();
              },
            ),
            ListTile(
              leading: const Icon(Icons.attach_file_rounded),
              title: const Text('File / PDF'),
              onTap: () {
                Navigator.pop(ctx);
                _pickAnyFile();
              },
            ),
            const SizedBox(height: 6),
          ],
        ),
      ),
    );
  }

  Future<void> _pickFromCamera() async {
    try {
      final shot = await _imagePicker.pickImage(
        source: ImageSource.camera,
        imageQuality: 80,
      );
      if (shot == null) return;
      await _uploadXFile(shot, typeHint: 'image');
    } catch (_) {
      _toast('Camera unavailable');
    }
  }

  Future<void> _pickFromGallery() async {
    try {
      final img = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 80,
      );
      if (img == null) return;
      await _uploadXFile(img, typeHint: 'image');
    } catch (_) {
      _toast('Gallery unavailable');
    }
  }

  Future<void> _pickAnyFile() async {
    try {
      final res = await FilePicker.platform.pickFiles(
        allowMultiple: false,
        withData: kIsWeb,
        type: FileType.any,
      );
      if (res == null || res.files.isEmpty) return;
      final f = res.files.first;
      final name = f.name;
      final mime = _guessMime(name);

      if (kIsWeb) {
        final bytes = f.bytes;
        if (bytes == null) return;
        await _uploadBytes(bytes, name, mime,
            typeHint: _isImage(mime) ? 'image' : 'file');
      } else {
        final path = f.path;
        if (path == null) return;
        await _uploadFilePath(path, name, mime,
            typeHint: _isImage(mime) ? 'image' : 'file');
      }
    } catch (_) {
      _toast('File picker error');
    }
  }

  String _guessMime(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  }

  bool _isImage(String mime) => mime.startsWith('image/');

  Future<void> _uploadXFile(XFile xf, {required String typeHint}) async {
    final name = xf.name;
    final mime = _guessMime(name);
    setState(() => _uploading = true);
    try {
      if (kIsWeb) {
        final bytes = await xf.readAsBytes();
        await _uploadBytes(bytes, name, mime, typeHint: 'image');
      } else {
        await _uploadFilePath(xf.path, name, mime, typeHint: 'image');
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _uploadBytes(
    Uint8List bytes,
    String name,
    String mime, {
    required String typeHint,
  }) async {
    try {
      final ref = FirebaseStorage.instance
          .ref()
          .child('expense_uploads')
          .child(widget.userPhone)
          .child('${DateTime.now().millisecondsSinceEpoch}_$name');

      final metadata = SettableMetadata(contentType: mime);
      final task = await ref.putData(bytes, metadata);
      final url = await task.ref.getDownloadURL();

      _attachments.add(_Attachment(
        name: name,
        url: url,
        mime: mime,
        size: bytes.length,
        kind: typeHint,
      ));
      setState(() {});
    } catch (_) {
      _toast('Upload failed');
    }
  }

  Future<void> _uploadFilePath(
    String path,
    String name,
    String mime, {
    required String typeHint,
  }) async {
    try {
      final ref = FirebaseStorage.instance
          .ref()
          .child('expense_uploads')
          .child(widget.userPhone)
          .child('${DateTime.now().millisecondsSinceEpoch}_$name');

      final metadata = SettableMetadata(contentType: mime);
      final task = await ref.putFile(File(path), metadata);
      final url = await task.ref.getDownloadURL();
      final fileSize = await File(path).length();

      _attachments.add(_Attachment(
        name: name,
        url: url,
        mime: mime,
        size: fileSize,
        kind: typeHint,
      ));
      setState(() {});
    } catch (_) {
      _toast('Upload failed');
    }
  }

  // --------------- nav / submit ---------------
  void _goNext() {
    if (_step == 0) {
      if (_amount <= 0) {
        _toast("Enter a valid amount");
        return;
      }
    }
    if (_step == 2 && _customSplit) {
      final total = _round2(_sumSplits);
      final amt = _round2(_amount);
      if ((total - amt).abs() > 0.01) {
        _toast("Splits must total ₹${_fmt2(_amount)}");
        return;
      }
    }
    if (_step < 3) {
      setState(() => _step++);
      _pg.animateToPage(_step,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOutCubic);
    }
  }

  void _goBack() {
    if (_step > 0) {
      setState(() => _step--);
      _pg.animateToPage(_step,
          duration: const Duration(milliseconds: 260), curve: Curves.easeOut);
    } else {
      Navigator.pop(context, false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedPayerPhone == null) {
      _toast("Select who paid");
      return;
    }
    if (_uploading) {
      _toast("Please wait for uploads to finish");
      return;
    }

    // Attachments → append to note (non-breaking)
    String noteOut = _note.trim();
    if (_attachments.isNotEmpty) {
      final parts = _attachments.map((a) => '${a.name} (${a.url})').join(', ');
      noteOut = noteOut.isEmpty
          ? 'Attachments: $parts'
          : '$noteOut\nAttachments: $parts';
    }

    setState(() => _saving = true);
    try {
      // participants
      final allMemberPhones = groupMembers.map((m) => m.phone).toList();
      final Set<String> participants = {
        if (_customSplit)
          ..._splits.entries.where((e) => (e.value) > 0.0).map((e) => e.key),
        if (!_customSplit) ...allMemberPhones,
        _selectedPayerPhone!,
      };

      // normalize custom splits (ensure payer key, scale if needed)
      Map<String, double>? custom;
      if (_customSplit) {
        _splits.putIfAbsent(_selectedPayerPhone!, () => 0.0);

        final raw = {for (final p in participants) p: (_splits[p] ?? 0.0)};
        final sum = raw.values.fold(0.0, (a, b) => a + b);
        if ((sum - _amount).abs() > 0.01) {
          final scaled = {
            for (final e in raw.entries)
              e.key: _amount == 0
                  ? 0.0
                  : (e.value * _amount / (sum == 0 ? 1 : sum))
          };
          final scaledSum = scaled.values.fold(0.0, (a, b) => a + b);
          final delta = _amount - scaledSum;
          scaled[_selectedPayerPhone!] =
              (scaled[_selectedPayerPhone!] ?? 0) + delta;

          custom = {
            for (final e in scaled.entries)
              e.key: double.parse(e.value.toStringAsFixed(2))
          };
        } else {
          custom = {
            for (final e in raw.entries)
              e.key: double.parse(e.value.toStringAsFixed(2))
          };
        }
      }

      // friendIds = participants minus payer
      final friendIds =
          participants.where((p) => p != _selectedPayerPhone!).toList();

      final expense = ExpenseItem(
        id: '',
        type: _category.isNotEmpty ? _category : 'Group',
        amount: _round2(_amount),
        note: noteOut,
        date: _date,
        label: _label.trim(),
        friendIds: friendIds,
        groupId: widget.group.id,
        payerId: _selectedPayerPhone!,
        customSplits: custom, // null = equal split downstream
        counterparty:
            _counterparty.trim().isNotEmpty ? _counterparty.trim() : null,
      );

      await ExpenseService().addExpenseWithSync(widget.userPhone, expense);
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      _toast("Failed to add: $e");
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // --------------- UI pieces ---------------
  InputDecoration _pillDec(
      {required String label, IconData? icon, String? hint}) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: icon != null ? Icon(icon) : null,
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
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
        borderSide: const BorderSide(color: _kIndigo, width: 1.2),
      ),
    );
  }

  Widget _avatarOf(FriendModel f, {double r = 14}) {
    final url = f.avatar.trim();
    ImageProvider? prov;
    if (url.startsWith('http')) prov = NetworkImage(url);
    if (url.startsWith('assets/')) prov = AssetImage(url);
    return CircleAvatar(
      radius: r,
      backgroundColor: _kTeal.withValues(alpha: .12),
      foregroundImage: prov,
      child: prov == null
          ? Text((f.name.isNotEmpty ? f.name[0] : '👤').toUpperCase(),
              style: const TextStyle(fontSize: 12))
          : null,
    );
  }

  Widget _avatarYou({double r = 14}) {
    final url = widget.userAvatar ?? '';
    ImageProvider? prov;
    if (url.startsWith('http')) prov = NetworkImage(url);
    return CircleAvatar(
      radius: r,
      backgroundColor: _kIndigo.withValues(alpha: .12),
      foregroundImage: prov,
      child: prov == null
          ? Text(widget.userName.characters.first.toUpperCase())
          : null,
    );
  }

  Widget _header() {
    const titles = ["Amount & Category", "Payer", "Split", "Details"];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // progress
        LayoutBuilder(builder: (ctx, c) {
          final w = c.maxWidth;
          final v = (_step + 1) / 4;
          return Container(
            height: 8,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.white.withValues(alpha: .6)),
            ),
            child: Stack(children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 380),
                curve: Curves.easeOutCubic,
                width: w * v,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [_kIndigo, _kTeal]),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ]),
          );
        }),
        const SizedBox(height: 12),

        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFEDF0FF), Color(0xFFE6FFF7)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.groups_2_rounded, color: _kIndigo),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                child: Text(
                  widget.group.name,
                  key: ValueKey("${widget.group.id}.$_step"),
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w900, color: _kText),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
            Text("${_step + 1}/4",
                style: const TextStyle(color: Colors.black54)),
          ],
        ),
        const SizedBox(height: 6),

        // members row
        Row(
          children: [
            if ((widget.group.avatarUrl ?? '').isNotEmpty)
              CircleAvatar(
                  radius: 14,
                  backgroundImage: NetworkImage(widget.group.avatarUrl!)),
            const SizedBox(width: 8),
            Expanded(
              child: SizedBox(
                height: 28,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: groupMembers.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 4),
                  itemBuilder: (_, i) {
                    final m = groupMembers[i];
                    final url = m.avatar;
                    return CircleAvatar(
                      radius: 12,
                      child: url.startsWith('http')
                          ? ClipOval(
                              child: Image.network(url,
                                  width: 24, height: 24, fit: BoxFit.cover))
                          : Text(
                              (m.name.isNotEmpty ? m.name[0] : '👤')
                                  .toUpperCase(),
                              style: const TextStyle(fontSize: 11)),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text("Members: ${groupMembers.length}",
                style: TextStyle(color: Colors.grey.shade700)),
          ],
        ),
        const SizedBox(height: 8),
        Text(titles[_step],
            style: const TextStyle(
                fontSize: 15, fontWeight: FontWeight.w700, color: _kText)),
      ],
    );
  }

  // ---- Step 0: Amount & Category ----
  Widget _step0() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 12),
        _SlideFade(
          delayMs: 0,
          child: TextFormField(
            decoration: _pillDec(
                label: "Amount",
                icon: Icons.currency_rupee,
                hint: "e.g. 2400.00"),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(
                  RegExp(r'^\d{0,7}(\.\d{0,2})?$'))
            ],
            validator: (v) {
              if (_step != 3) return null;
              final d = double.tryParse((v ?? '').trim());
              if (d == null) return "Enter a valid amount";
              if (d <= 0) return "Amount must be greater than 0";
              return null;
            },
            onChanged: (v) {
              _amount = double.tryParse(v) ?? 0.0;
              if (_customSplit && _amount > 0) _recalcEqualSplit();
              setState(() {});
            },
            enabled: !_saving,
          ),
        ),
        const SizedBox(height: 12),
        _SlideFade(
          delayMs: 60,
          child: DropdownButtonFormField<String>(
            initialValue: _category.isEmpty ? null : _category,
            items: _categories
                .map((c) => DropdownMenuItem(
                      value: c.label,
                      child: Row(children: [
                        Icon(c.icon, size: 18),
                        const SizedBox(width: 8),
                        Text(c.label)
                      ]),
                    ))
                .toList(),
            onChanged:
                _saving ? null : (v) => setState(() => _category = v ?? ''),
            decoration: _pillDec(label: "Category", icon: Icons.category),
          ),
        ),
        const SizedBox(height: 8),
        _SlideFade(
          delayMs: 110,
          child: Wrap(
            spacing: 8,
            runSpacing: 6,
            children: _categories.map((c) {
              final selected = c.label == _category;
              return ChoiceChip(
                label: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(c.icon, size: 16),
                  const SizedBox(width: 6),
                  Text(c.label),
                ]),
                selected: selected,
                onSelected: _saving
                    ? null
                    : (v) => setState(() => _category = v ? c.label : ''),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }

  // ---- Step 1: Payer ----
  Widget _step1() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 12),
        _SlideFade(
          delayMs: 0,
          child: DropdownButtonFormField<String>(
            initialValue: _selectedPayerPhone,
            decoration: _pillDec(label: "Paid by", icon: Icons.wallet),
            items: groupMembers.map((m) {
              return DropdownMenuItem(
                value: m.phone,
                child: Row(
                  children: [
                    m.phone == currentUser.phone ? _avatarYou() : _avatarOf(m),
                    const SizedBox(width: 8),
                    Text(m.phone == currentUser.phone ? "You" : m.name),
                  ],
                ),
              );
            }).toList(),
            onChanged:
                _saving ? null : (v) => setState(() => _selectedPayerPhone = v),
          ),
        ),
      ],
    );
  }

  // ---- Step 2: Split ----
  Widget _step2() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: _customSplit,
          onChanged: _saving
              ? null
              : (v) {
                  setState(() {
                    _customSplit = v;
                    if (_customSplit && _amount > 0) _recalcEqualSplit();
                  });
                },
          title: const Text("Custom split",
              style: TextStyle(fontWeight: FontWeight.w700)),
          subtitle: const Text("Turn off for equal split"),
          activeTrackColor: _kIndigo,
        ),
        if (_customSplit) ...[
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ActionChip(
                label: const Text("Equal split"),
                avatar: const Icon(Icons.balance, size: 18),
                onPressed: (_saving || _amount <= 0) ? null : _recalcEqualSplit,
              ),
              ActionChip(
                label: const Text("Clear"),
                avatar: const Icon(Icons.clear, size: 18),
                onPressed: _saving ? null : _clearSplits,
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [_kIndigo, _kTeal]),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  "Sum: ₹${_fmt2(_sumSplits)} / ₹${_fmt2(_amount)}",
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, color: Colors.white),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // All participants
          ..._participantsPhones.map((phone) {
            final f = groupMembers.firstWhere((m) => m.phone == phone,
                orElse: () => currentUser);
            final isYou = phone == currentUser.phone;
            final ctrl = _splitCtrls[phone]!;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  isYou ? _avatarYou(r: 16) : _avatarOf(f, r: 16),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 140,
                    child: Text(isYou ? "You" : f.name,
                        overflow: TextOverflow.ellipsis),
                  ),
                  const Spacer(),
                  SizedBox(
                    width: 140,
                    child: TextField(
                      controller: ctrl,
                      enabled: !_saving,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                            RegExp(r'^\d{0,7}(\.\d{0,2})?$')),
                      ],
                      decoration: _pillDec(label: "₹"),
                      textAlign: TextAlign.right,
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
          if (_amount <= 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text("Tip: Enter amount first to enable equal split.",
                  style: TextStyle(color: Colors.grey.shade700, fontSize: 12)),
            ),
        ],
        if (!_customSplit)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              children: [
                const Icon(Icons.info_outline, size: 18, color: Colors.black45),
                const SizedBox(width: 6),
                Expanded(
                  child: Text("Equal split between all group members.",
                      style: TextStyle(color: Colors.grey.shade700)),
                ),
              ],
            ),
          ),
      ],
    );
  }

  // ---- Step 3: Details & Attachments ----
  Widget _step3() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextFormField(
          decoration: _pillDec(
              label: "Label (e.g., Dinner, Cab)", icon: Icons.label_outline),
          onChanged: (v) => _label = v,
          enabled: !_saving,
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            const Icon(Icons.calendar_today, size: 18, color: Colors.black54),
            const SizedBox(width: 8),
            Expanded(
                child: Text(
                    "Date: ${_date.toLocal().toString().substring(0, 10)}")),
            TextButton(
                onPressed: _saving ? null : _pickDate,
                child: const Text("Change")),
          ],
        ),
        const SizedBox(height: 10),
        TextFormField(
          decoration:
              _pillDec(label: "Note", icon: Icons.sticky_note_2_outlined),
          onChanged: (v) => _note = v,
          enabled: !_saving,
          maxLines: 2,
        ),
        const SizedBox(height: 10),
        TextFormField(
          decoration: _pillDec(
              label: "Paid to (optional)", icon: Icons.storefront_rounded),
          onChanged: (v) => _counterparty = v,
          enabled: !_saving,
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.icon(
              onPressed: _saving ? null : _showAttachmentSheet,
              icon: const Icon(Icons.attach_file_rounded),
              label: const Text("Add attachment"),
              style: FilledButton.styleFrom(
                  backgroundColor: _kIndigo, foregroundColor: Colors.white),
            ),
            ..._attachments.map((a) => InputChip(
                  label: Text(a.name),
                  avatar: Icon(
                      _isImage(a.mime) ? Icons.image : Icons.insert_drive_file,
                      size: 18),
                  onDeleted: _saving
                      ? null
                      : () => setState(() => _attachments.remove(a)),
                )),
          ],
        ),
        if (_saving || _uploading) ...[
          const SizedBox(height: 12),
          const LinearProgressIndicator(minHeight: 2),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _kBg,
      appBar: AppBar(
        elevation: 0,
        centerTitle: false,
        foregroundColor: _kText,
        title: const Text("Add Group Expense"),
        flexibleSpace: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFFFFFFFF), Color(0xFFF0F3FF)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: _saving ? null : () => Navigator.pop(context, false),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 820),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Form(
                key: _formKey,
                child: Column(
                  children: [
                    _header(),
                    const SizedBox(height: 10),

                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                Colors.white.withValues(alpha: .98),
                                Colors.white.withValues(alpha: .94)
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            border: Border.all(
                                color: Colors.white.withValues(alpha: .65)),
                            boxShadow: const [
                              BoxShadow(
                                  color: Color(0x1F000000),
                                  blurRadius: 22,
                                  offset: Offset(0, 10))
                            ],
                            borderRadius: BorderRadius.circular(20),
                          ),
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                          child: PageView(
                            controller: _pg,
                            physics: const NeverScrollableScrollPhysics(),
                            children: [
                              SingleChildScrollView(child: _step0()),
                              SingleChildScrollView(child: _step1()),
                              SingleChildScrollView(child: _step2()),
                              SingleChildScrollView(child: _step3()),
                            ],
                          ),
                        ),
                      ),
                    ),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      switchInCurve: Curves.easeInOut,
                      switchOutCurve: Curves.easeInOut,
                      child: _step >= 2
                          ? const SleekAdCard(
                              margin: EdgeInsets.fromLTRB(12, 6, 12, 6),
                              radius: 14,
                            )
                          : const SizedBox.shrink(),
                    ),

                    // Footer controls
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        if (_step > 0)
                          _Bouncy(
                            onTap: _goBack,
                            child: OutlinedButton.icon(
                              onPressed: _goBack,
                              icon: const Icon(Icons.chevron_left_rounded),
                              label: const Text("Back"),
                              style: OutlinedButton.styleFrom(
                                side: BorderSide(
                                    color: _kIndigo.withValues(alpha: .35)),
                                foregroundColor: _kIndigo,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14)),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 12),
                              ),
                            ),
                          )
                        else
                          const SizedBox.shrink(),
                        const Spacer(),
                        if (_step < 3)
                          _Bouncy(
                            onTap: _goNext,
                            child: ElevatedButton.icon(
                              onPressed: _goNext,
                              icon: const Icon(Icons.chevron_right_rounded),
                              label: const Text("Next"),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: _kIndigo,
                                foregroundColor: Colors.white,
                                elevation: 6,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14)),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 16, vertical: 12),
                              ),
                            ),
                          ),
                        if (_step == 3)
                          _Bouncy(
                            onTap: _submit,
                            child: ElevatedButton.icon(
                              onPressed: _saving ? null : _submit,
                              icon: const Icon(Icons.check_rounded),
                              label: _saving
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2, color: Colors.white))
                                  : const Text("Add Expense"),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: _kTeal,
                                foregroundColor: Colors.white,
                                elevation: 6,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14)),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 16, vertical: 12),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// -------- small models / animations --------
class _CategoryDef {
  final String label;
  final IconData icon;
  const _CategoryDef(this.label, this.icon);
}

class _Attachment {
  final String name;
  final String url;
  final String mime;
  final int size;
  final String kind; // 'image' | 'file'
  _Attachment({
    required this.name,
    required this.url,
    required this.mime,
    required this.size,
    required this.kind,
  });
}

/// Bouncy press effect
class _Bouncy extends StatefulWidget {
  final Widget child;
  final VoidCallback onTap;
  const _Bouncy({required this.child, required this.onTap});
  @override
  State<_Bouncy> createState() => _BouncyState();
}

class _BouncyState extends State<_Bouncy> {
  double _scale = 1;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _scale = .96),
      onTapCancel: () => setState(() => _scale = 1),
      onTapUp: (_) => setState(() => _scale = 1),
      onTap: widget.onTap,
      child: AnimatedScale(
        duration: const Duration(milliseconds: 120),
        scale: _scale,
        child: widget.child,
      ),
    );
  }
}

/// Slide up + fade in with delay (int ms)
class _SlideFade extends StatefulWidget {
  final Widget child;
  final int delayMs;
  const _SlideFade({required this.child, this.delayMs = 0});
  @override
  State<_SlideFade> createState() => _SlideFadeState();
}

class _SlideFadeState extends State<_SlideFade> {
  double _t = 0;
  @override
  void initState() {
    super.initState();
    Future.delayed(Duration(milliseconds: widget.delayMs), () {
      if (!mounted) return;
      setState(() => _t = 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeOutCubic,
      tween: Tween(begin: 0, end: _t),
      builder: (context, t, _) {
        final dy = 16 * (1 - t);
        return Opacity(
          opacity: t,
          child:
              Transform.translate(offset: Offset(0, dy), child: widget.child),
        );
      },
    );
  }
}
