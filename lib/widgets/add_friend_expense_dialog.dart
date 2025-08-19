// lib/widgets/add_friend_expense_dialog.dart

import 'dart:io' show File;
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../models/friend_model.dart';
import '../models/expense_item.dart';
import '../services/expense_service.dart';
import '../utils/helpers.dart';

class AddFriendExpenseDialog extends StatefulWidget {
  final String userPhone;
  final FriendModel friend;
  final String userName;
  final String? userAvatar; // Pass image url if available
  final Map<String, double>? initialSplits;

  const AddFriendExpenseDialog({
    required this.userPhone,
    required this.friend,
    required this.userName,
    this.userAvatar,
    this.initialSplits,
    Key? key,
  }) : super(key: key);

  @override
  State<AddFriendExpenseDialog> createState() => _AddFriendExpenseDialogState();
}

class _AddFriendExpenseDialogState extends State<AddFriendExpenseDialog> {
  final _formKey = GlobalKey<FormState>();

  // Amount & meta
  double _amount = 0.0;
  String _note = '';
  String _label = '';
  String _category = '';
  DateTime _date = DateTime.now();
  String? _selectedPayerPhone;

  // Custom split
  bool _customSplit = false;
  Map<String, double> _splits = {};
  final Map<String, TextEditingController> _splitCtrls = {};

  // Loading state
  bool _saving = false;
  bool _uploading = false;

  // Current user as FriendModel for consistent UI
  late FriendModel currentUser;

  // Attachments
  final _imagePicker = ImagePicker();
  final List<_Attachment> _attachments = [];

  // Category definitions (label + icon)
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

  @override
  void initState() {
    super.initState();
    currentUser = Helpers.buildCurrentUserModel(
      userIdOrPhone: widget.userPhone,
      name: widget.userName,
      avatar: widget.userAvatar,
    );
    _selectedPayerPhone = currentUser.phone;

    _splits = widget.initialSplits ??
        {currentUser.phone: 0.0, widget.friend.phone: 0.0};

    for (final p in _participantsPhones) {
      _splitCtrls[p] = TextEditingController(
        text: _fmt2(_splits[p] ?? 0.0),
      );
      _splitCtrls[p]!.addListener(() {
        final v = double.tryParse(_splitCtrls[p]!.text) ?? 0.0;
        _splits[p] = v;
        setState(() {}); // update Sum pill
      });
    }
  }

  @override
  void dispose() {
    for (final c in _splitCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  // ---------- Helpers ----------
  List<FriendModel> get _payers => [currentUser, widget.friend];
  List<String> get _participantsPhones =>
      [currentUser.phone, widget.friend.phone];

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

  void _pickDate() async {
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

  // ---------- Avatars ----------
  Widget _avatarFriend(FriendModel f, {double r = 13}) {
    if (f.avatar.startsWith('http')) {
      return CircleAvatar(radius: r, backgroundImage: NetworkImage(f.avatar));
    }
    return CircleAvatar(
      radius: r,
      child: Text(
        (f.avatar.isNotEmpty ? f.avatar : f.name.isNotEmpty ? f.name[0] : '👤')
            .toString()
            .characters
            .first,
      ),
    );
  }

  Widget _avatarYou({double r = 13}) {
    final url = widget.userAvatar ?? '';
    if (url.startsWith('http')) {
      return CircleAvatar(radius: r, backgroundImage: NetworkImage(url));
    }
    return CircleAvatar(
      radius: r,
      child: Text(widget.userName.characters.first.toUpperCase()),
    );
  }

  // ---------- Attachments ----------
  void _showAttachmentSheet() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Wrap(
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
          ],
        ),
      ),
    );
  }

  Future<void> _pickFromCamera() async {
    try {
      final shot = await _imagePicker.pickImage(
        source: ImageSource.camera,
        imageQuality: 80, // lightweight compression
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
        imageQuality: 80, // lightweight compression
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
        await _uploadBytes(bytes, name, mime, typeHint: _isImage(mime) ? 'image' : 'file');
      } else {
        final path = f.path;
        if (path == null) return;
        await _uploadFilePath(path, name, mime, typeHint: _isImage(mime) ? 'image' : 'file');
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

  // ---------- Submit ----------
  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedPayerPhone == null) {
      Helpers.showSnackbar(context, "Select who paid");
      return;
    }
    if (_uploading) {
      Helpers.showSnackbar(context, "Please wait for uploads to finish");
      return;
    }

    if (_customSplit) {
      final total = _round2(_sumSplits);
      final amt = _round2(_amount);
      if ((total - amt).abs() > 0.01) {
        Helpers.showSnackbar(
            context, "Splits must total to ₹${_fmt2(_amount)}");
        return;
      }
    }

    // Pack attachments (non-breaking): append to note
    String noteOut = _note.trim();
    if (_attachments.isNotEmpty) {
      final parts = _attachments
          .map((a) => '${a.name} (${a.url})')
          .join(', ');
      noteOut = noteOut.isEmpty
          ? 'Attachments: $parts'
          : '$noteOut\nAttachments: $parts';
    }

    setState(() => _saving = true);
    try {
      await ExpenseService().addExpenseWithSync(
        widget.userPhone,
        ExpenseItem(
          id: '',
          type: _category.isNotEmpty ? _category : "General",
          amount: _round2(_amount),
          note: noteOut,
          date: _date,
          label: _label.trim(),
          friendIds: [widget.friend.phone],
          payerId: _selectedPayerPhone!,
          customSplits: _customSplit ? _normalizedSplits() : null,
        ),
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      Helpers.showSnackbar(context, "Failed to add: $e");
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Map<String, double> _normalizedSplits() {
    return {
      for (final p in _participantsPhones) p: _round2(_splits[p] ?? 0.0),
    };
  }

  // ---------- UI helpers ----------
  BoxDecoration _glossyCard() {
    return BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(0.08),
          blurRadius: 18,
          offset: const Offset(0, 10),
        ),
      ],
      border: Border.all(color: Colors.grey.shade200),
    );
  }

  InputDecoration _dec({
    required String label,
    IconData? icon,
    String? hint,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: icon != null ? Icon(icon, color: Colors.black87) : null,
      labelStyle: const TextStyle(color: Colors.black87),
      hintStyle: TextStyle(color: Colors.grey.shade700),
      filled: true,
      fillColor: Colors.white,
      contentPadding:
      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide:
        BorderSide(color: Colors.teal.shade700, width: 1.2),
      ),
    );
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final primary = Colors.teal.shade700;

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: AnimatedSize(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeInOut,
        child: Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom,
          ),
          child: SingleChildScrollView(
            child: Container(
              decoration: _glossyCard(),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              child: Form(
                key: _formKey,
                autovalidateMode: AutovalidateMode.onUserInteraction,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Header
                    Row(
                      children: [
                        Container(
                          height: 40,
                          width: 40,
                          decoration: BoxDecoration(
                            color: Colors.teal.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.receipt_long, size: 22),
                        ),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            "Add Expense",
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: Colors.black87,
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, color: Colors.black87),
                          onPressed: _saving ? null : () => Navigator.pop(context),
                        ),
                      ],
                    ),
                    if (_saving || _uploading) ...[
                      const SizedBox(height: 8),
                      const LinearProgressIndicator(minHeight: 2),
                    ],
                    const SizedBox(height: 12),

                    // Amount
                    TextFormField(
                      decoration: _dec(
                        label: "Amount",
                        icon: Icons.currency_rupee,
                        hint: "e.g. 1200.00",
                      ),
                      keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp(r'^\d{0,7}(\.\d{0,2})?$'),
                        ),
                      ],
                      validator: (v) {
                        final d = double.tryParse((v ?? '').trim());
                        if (d == null) return "Enter a valid amount";
                        if (d <= 0) return "Amount must be greater than 0";
                        return null;
                      },
                      onChanged: (v) {
                        _amount = double.tryParse(v) ?? 0.0;
                        if (_customSplit && _amount > 0) {
                          _recalcEqualSplit();
                        }
                        setState(() {});
                      },
                      enabled: !_saving,
                    ),
                    const SizedBox(height: 10),

                    // Paid by
                    DropdownButtonFormField<String>(
                      decoration: _dec(label: "Paid by", icon: Icons.wallet),
                      value: _selectedPayerPhone,
                      items: [
                        DropdownMenuItem(
                          value: currentUser.phone,
                          child: Row(
                            children: [
                              _avatarYou(),
                              const SizedBox(width: 8),
                              const Text("You", style: TextStyle(color: Colors.black87)),
                            ],
                          ),
                        ),
                        DropdownMenuItem(
                          value: widget.friend.phone,
                          child: Row(
                            children: [
                              _avatarFriend(widget.friend),
                              const SizedBox(width: 8),
                              Text(widget.friend.name, style: const TextStyle(color: Colors.black87)),
                            ],
                          ),
                        ),
                      ],
                      onChanged:
                      _saving ? null : (v) => setState(() => _selectedPayerPhone = v),
                    ),
                    const SizedBox(height: 10),

                    // Custom split toggle
                    SwitchListTile.adaptive(
                      title: const Text("Custom split", style: TextStyle(color: Colors.black87)),
                      value: _customSplit,
                      onChanged: _saving
                          ? null
                          : (v) {
                        setState(() {
                          _customSplit = v;
                          if (_customSplit && _amount > 0) {
                            _recalcEqualSplit();
                          }
                        });
                      },
                      contentPadding: EdgeInsets.zero,
                    ),

                    // Split editor (overflow-safe)
                    if (_customSplit) ...[
                      // Buttons + Sum in a Wrap, so Sum moves to next line if needed
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
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.teal.withOpacity(0.10),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              "Sum: ₹${_fmt2(_sumSplits)} / ₹${_fmt2(_amount)}",
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: Colors.black87,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),

                      ..._payers.map((f) {
                        final isYou = f.phone == currentUser.phone;
                        final ctrl = _splitCtrls[f.phone]!;
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            children: [
                              isYou ? _avatarYou(r: 16) : _avatarFriend(f, r: 16),
                              const SizedBox(width: 8),
                              SizedBox(
                                width: 90,
                                child: Text(
                                  isYou ? "You" : f.name,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(color: Colors.black87),
                                ),
                              ),
                              const Spacer(),
                              SizedBox(
                                width: 120,
                                child: TextField(
                                  controller: ctrl,
                                  enabled: !_saving,
                                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                  inputFormatters: [
                                    FilteringTextInputFormatter.allow(
                                      RegExp(r'^\d{0,7}(\.\d{0,2})?$'),
                                    ),
                                  ],
                                  decoration: _dec(label: "₹"),
                                  textAlign: TextAlign.right,
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                      const SizedBox(height: 6),
                      if (_amount <= 0)
                        Text(
                          "Tip: Enter amount first to enable equal split.",
                          style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
                        ),
                    ],

                    const SizedBox(height: 12),

                    // Attachments row
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          FilledButton.icon(
                            onPressed: _saving ? null : _showAttachmentSheet,
                            icon: const Icon(Icons.attach_file_rounded),
                            label: const Text("Add attachment"),
                          ),
                          ..._attachments.map((a) => InputChip(
                            label: Text(
                              a.name,
                              style: const TextStyle(color: Colors.black87),
                            ),
                            avatar: Icon(
                              _isImage(a.mime) ? Icons.image : Icons.insert_drive_file,
                              size: 18,
                            ),
                            onDeleted: _saving
                                ? null
                                : () {
                              setState(() {
                                _attachments.remove(a);
                              });
                            },
                          )),
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

                    // Category quick chips
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: _categories.map((c) {
                          final selected = c.label == _category;
                          return ChoiceChip(
                            label: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(c.icon, size: 16, color: Colors.black87),
                                const SizedBox(width: 6),
                                Text(c.label, style: const TextStyle(color: Colors.black87)),
                              ],
                            ),
                            selected: selected,
                            onSelected: _saving
                                ? null
                                : (v) => setState(() => _category = v ? c.label : ''),
                          );
                        }).toList(),
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Category dropdown (explicit)
                    DropdownButtonFormField<String>(
                      value: _category.isEmpty ? null : _category,
                      items: _categories
                          .map((c) => DropdownMenuItem(
                        value: c.label,
                        child: Row(
                          children: [
                            Icon(c.icon, size: 18, color: Colors.black87),
                            const SizedBox(width: 8),
                            Text(c.label, style: const TextStyle(color: Colors.black87)),
                          ],
                        ),
                      ))
                          .toList(),
                      onChanged:
                      _saving ? null : (v) => setState(() => _category = v ?? ''),
                      decoration: _dec(label: "Category", icon: Icons.category),
                    ),
                    const SizedBox(height: 10),

                    // Label
                    TextFormField(
                      decoration: _dec(
                        label: "Label (e.g., Dinner, Cab)",
                        icon: Icons.label_outline,
                      ),
                      onChanged: (v) => _label = v,
                      enabled: !_saving,
                    ),
                    const SizedBox(height: 10),

                    // Date row
                    Row(
                      children: [
                        const Icon(Icons.calendar_today, size: 18, color: Colors.grey),
                        const SizedBox(width: 8),
                        Text(
                          "Date: ${_date.toLocal().toString().substring(0, 10)}",
                          style: const TextStyle(color: Colors.black87),
                        ),
                        const Spacer(),
                        TextButton(
                          onPressed: _saving ? null : _pickDate,
                          child: const Text("Change"),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // Note
                    TextFormField(
                      decoration: _dec(label: "Note", icon: Icons.sticky_note_2_outlined),
                      onChanged: (v) => _note = v,
                      enabled: !_saving,
                      maxLines: 2,
                    ),
                    const SizedBox(height: 16),

                    // Actions
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _saving ? null : () => Navigator.pop(context),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12)),
                            ),
                            child: const Text("Cancel", style: TextStyle(color: Colors.black87)),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _saving ? null : _submit,
                            icon: const Icon(Icons.check_rounded),
                            label: _saving
                                ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                                : const Text("Add"),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.redAccent,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12)),
                            ),
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
}

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
