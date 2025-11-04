// lib/widgets/settleup_dialog.dart

import 'dart:async';
import 'dart:typed_data';
import 'dart:io' show File;

import 'package:file_picker/file_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';

class SettleUpDialog extends StatefulWidget {
  final String userPhone;
  final List<FriendModel> friends;
  final List<GroupModel> groups;
  final FriendModel? initialFriend;
  final GroupModel? initialGroup;

  const SettleUpDialog({
    Key? key,
    required this.userPhone,
    required this.friends,
    required this.groups,
    this.initialFriend,
    this.initialGroup,
  }) : super(key: key);

  @override
  State<SettleUpDialog> createState() => _SettleUpDialogState();
}

class _SettleUpDialogState extends State<SettleUpDialog> {
  // Selection
  FriendModel? _selectedFriend;
  GroupModel? _selectedGroup;

  // Amount & direction
  final _amountCtrl = TextEditingController();
  double _maxAmount = 0.0;   // absolute outstanding for this pair (and group if chosen)
  double _direction = 0.0;   // + => they owe you, - => you owe them
  bool _payerIsMe = true;    // who pays for THIS settlement action

  // Meta
  String _note = '';
  DateTime _date = DateTime.now();

  // Live streams
  StreamSubscription<List<ExpenseItem>>? _groupExpSub;
  StreamSubscription<List<ExpenseItem>>? _allExpSub;

  // Attachments
  final ImagePicker _imagePicker = ImagePicker();
  Uint8List? _attachBytes;
  String? _attachName;
  String? _attachMime;
  String? _uploadedUrl;

  bool _submitting = false;
  String? _error;
  bool _showSuccess = false;

  final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
  String _fmt(num v) => _inr.format(v);

  double get _enteredAmt => double.tryParse(_amountCtrl.text.trim()) ?? 0.0;
  bool get _isValidAmount =>
      _enteredAmt > 0 &&
      (_maxAmount == 0 || _enteredAmt <= _maxAmount + 0.005) &&
      _selectedFriend != null;

  String _ctaLabelFull() =>
      _payerIsMe ? "MARK ${_fmt(_enteredAmt)} AS PAID" : "MARK ${_fmt(_enteredAmt)} AS RECEIVED";

  String _ctaLabelCompact() =>
      _payerIsMe ? "PAID ${_fmt(_enteredAmt)}" : "RECEIVED ${_fmt(_enteredAmt)}";

  Color get _mint => Colors.teal.shade700;

  // ---- Helpers to exclude "me" from friend choices ----
  String _normalizePhone(String? raw) =>
      (raw ?? '').replaceAll(RegExp(r'[^0-9]'), '');
  bool _isMeFriend(FriendModel f) =>
      _normalizePhone(f.phone) == _normalizePhone(widget.userPhone);
  List<FriendModel> get _friendChoices =>
      widget.friends.where((f) => !_isMeFriend(f)).toList();

  @override
  void initState() {
    super.initState();

    // Initial selections, but never choose "me" as friend
    final initFriend = widget.initialFriend;
    if (initFriend != null && !_isMeFriend(initFriend)) {
      _selectedFriend = initFriend;
    } else {
      final choices = _friendChoices;
      _selectedFriend = (choices.length == 1) ? choices.first : null;
    }
    _selectedGroup  = widget.initialGroup  ?? (widget.groups.length == 1 ? widget.groups.first : null);

    _relistenAndRecompute();
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _cancelSubs();
    super.dispose();
  }

  void _cancelSubs() {
    _groupExpSub?.cancel();
    _allExpSub?.cancel();
    _groupExpSub = null;
    _allExpSub = null;
  }

  void _relistenAndRecompute() {
    _cancelSubs();
    if (!mounted) return;
    setState(() {
      _maxAmount = 0.0;
      _direction = 0.0;
      _error = null;
      _amountCtrl.text = '';
    });

    if (_selectedFriend == null) return;

    // Source of truth: expenses stream(s)
    if (_selectedGroup != null) {
      _groupExpSub = ExpenseService()
          .getGroupExpensesStream(widget.userPhone, _selectedGroup!.id)
          .listen((list) => _recomputeOutstanding(list));
    } else {
      _allExpSub = ExpenseService()
          .getExpensesStream(widget.userPhone)
          .listen((list) => _recomputeOutstanding(list));
    }
  }

  void _recomputeOutstanding(List<ExpenseItem> all) {
    if (!mounted) return;

    final current = widget.userPhone;
    final friend  = _selectedFriend?.phone;
    if (friend == null) return;

    // Filter by scope (whole pair or group pair)
    final scoped = all.where((e) {
      if (_selectedGroup != null && e.groupId != _selectedGroup!.id) return false;
      final participants = <String>{e.payerId, ...e.friendIds};
      return participants.contains(current) && participants.contains(friend);
    }).toList();

    // Pairwise net with settlements & custom splits handled
    final net = _pairwiseNet(scoped, current, friend);

    final abs = double.parse(net.abs().toStringAsFixed(2));
    if (!mounted) return;
    setState(() {
      _direction = net;       // + they owe you, - you owe them
      _maxAmount = abs;
      _amountCtrl.text = abs > 0 ? abs.toStringAsFixed(2) : '';
      // Default who pays matches direction (but user can toggle)
      _payerIsMe = _direction < 0; // if you owe, default to you paying
    });
  }

  double _pairwiseNet(List<ExpenseItem> items, String currentUser, String friendPhone) {
    double net = 0.0; // + => they owe you, - => you owe them

    for (final e in items) {
      final isSettlement = _looksLikeSettlement(e);

      if (isSettlement) {
        // Settlement: if you paid, they now owe you less => add positive
        net += (e.payerId == currentUser) ? e.amount : -e.amount;
        continue;
      }

      final participants = <String>{e.payerId, ...e.friendIds};
      if (!participants.contains(currentUser) || !participants.contains(friendPhone)) continue;

      final shares = (e.customSplits != null && e.customSplits!.isNotEmpty)
          ? e.customSplits!
          : { for (final id in participants) id: e.amount / participants.length };

      final yourShare   = shares[currentUser] ?? 0.0;
      final friendShare = shares[friendPhone] ?? 0.0;

      if (e.payerId == currentUser) net += friendShare; // they owe you their share
      else if (e.payerId == friendPhone) net -= yourShare; // you owe them your share
    }
    return net;
  }

  // STRICT: do not piggyback on isBill; match actual settlement label/type.
  bool _looksLikeSettlement(ExpenseItem e) {
    final t = (e.type ?? '').trim().toLowerCase();
    final lbl = (e.label ?? '').trim().toLowerCase();
    return t == 'settlement' || lbl == 'settlement';
  }

  // ======= Submit (explicit "Settlement" expense with payer you choose) =======
  Future<void> _submit() async {
    if (_submitting) return;

    final raw = _amountCtrl.text.trim();
    final amt = double.tryParse(raw);
    if (amt == null || amt <= 0) {
      setState(() => _error = "Enter a valid amount");
      return;
    }
    if (_maxAmount > 0 && amt > _maxAmount + 0.005) {
      setState(() => _error = "Amount exceeds outstanding: ₹${_maxAmount.toStringAsFixed(2)}");
      return;
    }
    if (_selectedFriend == null) {
      setState(() => _error = "Select a friend");
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
      _showSuccess = false;
    });

    try {
      // Optional attachment upload
      _uploadedUrl = null;
      if (_attachBytes != null && _attachName != null) {
        _uploadedUrl = await _uploadAttachment(
          bytes: _attachBytes!,
          name: _attachName!,
          mime: _attachMime ?? _guessMimeByName(_attachName!),
        );
      }
      final finalNote = _composeNote();

      final payerId = _payerIsMe ? widget.userPhone : _selectedFriend!.phone;
      final otherId = _payerIsMe ? _selectedFriend!.phone : widget.userPhone;

      final settlementItem = ExpenseItem(
        id: '',
        type: 'Settlement',
        label: 'Settlement',
        amount: double.parse(amt.toStringAsFixed(2)),
        note: finalNote,
        date: _date,
        payerId: payerId,
        friendIds: [otherId],
        customSplits: null,
        groupId: _selectedGroup?.id, // nullable for non-group
        isBill: false, // settlements are not bills
      );

      await ExpenseService().addExpenseWithSync(widget.userPhone, settlementItem);

      if (!mounted) return;
      setState(() {
        _submitting = false;
        _showSuccess = true;
      });
      await Future.delayed(const Duration(milliseconds: 900));
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = "Failed: $e";
        _showSuccess = false;
      });
    }
  }

  String _composeNote() {
    final parts = <String>[];
    if (_note.trim().isNotEmpty) parts.add(_note.trim());
    if (_uploadedUrl != null && _uploadedUrl!.isNotEmpty) parts.add("Attachment: $_uploadedUrl");
    return parts.join(" • ");
  }

  // ======= Attachment helpers =======
  Future<void> _pickFromCamera() async {
    if (kIsWeb) return; // not supported on web
    try {
      final shot = await _imagePicker.pickImage(source: ImageSource.camera, imageQuality: 88);
      if (shot == null) return;
      final bytes = await shot.readAsBytes();
      if (!mounted) return;
      setState(() {
        _attachBytes = bytes;
        _attachName  = shot.name;
        _attachMime  = _guessMimeByName(shot.name);
      });
    } catch (_) {
      _toast('Camera unavailable');
    }
  }

  Future<void> _pickFromGallery() async {
    if (kIsWeb) return; // not supported on web
    try {
      final img = await _imagePicker.pickImage(source: ImageSource.gallery, imageQuality: 85);
      if (img == null) return;
      final bytes = await img.readAsBytes();
      if (!mounted) return;
      setState(() {
        _attachBytes = bytes;
        _attachName  = img.name;
        _attachMime  = _guessMimeByName(img.name);
      });
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
      if (kIsWeb) {
        if (f.bytes == null) return;
        if (!mounted) return;
        setState(() {
          _attachBytes = f.bytes!;
          _attachName  = f.name;
          _attachMime  = _guessMimeByName(f.name);
        });
      } else {
        if (f.path == null) return;
        final file  = File(f.path!);
        final bytes = await file.readAsBytes();
        if (!mounted) return;
        setState(() {
          _attachBytes = bytes;
          _attachName  = f.name;
          _attachMime  = _guessMimeByName(f.name);
        });
      }
    } catch (_) {
      _toast('File picker error');
    }
  }

  Future<String> _uploadAttachment({
    required Uint8List bytes,
    required String name,
    required String mime,
  }) async {
    final ref = FirebaseStorage.instance
        .ref()
        .child('settlement_attachments')
        .child(widget.userPhone)
        .child('${DateTime.now().millisecondsSinceEpoch}_$name');

    final metadata = SettableMetadata(contentType: mime);
    final task = await ref.putData(bytes, metadata);
    return await task.ref.getDownloadURL();
  }

  String _guessMimeByName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.csv')) return 'text/csv';
    if (lower.endsWith('.txt')) return 'text/plain';
    if (lower.endsWith('.doc')) return 'application/msword';
    if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
    if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return 'application/octet-stream';
  }

  // ======= UI helpers =======
  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  BoxDecoration _cardDecoration() {
    return BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(0.08),
          blurRadius: 14,
          offset: const Offset(0, 6),
        ),
      ],
      border: Border.all(color: Colors.grey.shade200),
    );
  }

  Widget _sectionCard({required Widget child, EdgeInsets? padding}) {
    return Container(
      decoration: _cardDecoration(),
      child: Padding(padding: padding ?? const EdgeInsets.all(14), child: child),
    );
  }

  String _directionText() {
    if (_selectedFriend == null) return "Select a friend";
    final name = _selectedFriend!.name;
    if (_direction < 0) return "You owe $name";
    if (_direction > 0) return "$name owes you";
    return "Nothing outstanding";
  }

  Color _directionColor() {
    if (_direction < 0) return Colors.red.shade600;
    if (_direction > 0) return _mint;
    return Colors.grey.shade700;
  }

  String _amountHelperText() {
    if (_maxAmount <= 0) {
      return "If this looks wrong, choose friend/group above.";
    }
    return _direction < 0
        ? "Outstanding (you owe): ₹${_maxAmount.toStringAsFixed(2)}"
        : "Outstanding (they owe you): ₹${_maxAmount.toStringAsFixed(2)}";
  }

  // Quick chips
  Widget _chip(String label, VoidCallback onTap) {
    final color = _mint;
    return Padding(
      padding: const EdgeInsets.only(right: 8, bottom: 6),
      child: ActionChip(
        label: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        onPressed: _submitting ? null : onTap,
        backgroundColor: color.withOpacity(0.12),
        side: BorderSide(color: color.withOpacity(0.4)),
      ),
    );
  }

  List<Widget> _chips() {
    final max = _maxAmount;
    return [
      if (max > 0) _chip('Full', () { _amountCtrl.text = max.toStringAsFixed(2); setState(() {}); }),
      if (max > 0) _chip('75%', () { _amountCtrl.text = (max * .75).toStringAsFixed(2); setState(() {}); }),
      if (max > 0) _chip('50%', () { _amountCtrl.text = (max * .50).toStringAsFixed(2); setState(() {}); }),
      if (max > 0) _chip('25%', () { _amountCtrl.text = (max * .25).toStringAsFixed(2); setState(() {}); }),
      _chip('₹500', () {
        final v = max == 0 ? 500.0 : (500.0 > max ? max : 500.0);
        _amountCtrl.text = v.toStringAsFixed(2); setState(() {});
      }),
      _chip('₹200', () {
        final v = max == 0 ? 200.0 : (200.0 > max ? max : 200.0);
        _amountCtrl.text = v.toStringAsFixed(2); setState(() {});
      }),
      _chip('₹100', () {
        final v = max == 0 ? 100.0 : (100.0 > max ? max : 100.0);
        _amountCtrl.text = v.toStringAsFixed(2); setState(() {});
      }),
      _chip('Clear', () { _amountCtrl.clear(); setState(() {}); }),
    ];
  }

  Widget _summaryBadge(String label, double amount, {required Color color}) {
    final display = "₹${amount.toStringAsFixed(2)}";
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
          const SizedBox(width: 6),
          Text(display, style: TextStyle(fontWeight: FontWeight.w800, color: color)),
        ],
      ),
    );
  }

  // ======= Build =======
  @override
  Widget build(BuildContext context) {
    final primary = _mint;
    final faint = primary.withOpacity(0.10);

    // Use filtered friend list (exclude me)
    final friendChoices = _friendChoices;
    final singleFriend = friendChoices.length == 1;
    final singleGroup = widget.groups.length == 1;
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;

    final outstanding = _maxAmount;
    final netSubtitle = (_direction == 0)
        ? 'All settled'
        : (_direction < 0)
            ? "You'll pay ${_fmt(outstanding)}"
            : "You'll receive ${_fmt(outstanding)}";

    final fullLabel = (_direction == 0) ? 'SETTLED' : _ctaLabelFull();
    final compactLabel = (_direction == 0) ? 'SETTLED' : _ctaLabelCompact();

    Widget friendSummaryCard() {
      final friend = _selectedFriend;
      final name = friend?.name ?? 'Select a friend';
      final phone = friend?.phone ?? '';
      final youGet = _direction > 0 ? outstanding : 0.0;
      final youOwe = _direction < 0 ? outstanding : 0.0;
      final trimmed = name.trim();
      final avatarInitial = trimmed.isNotEmpty ? trimmed[0].toUpperCase() : '?';

      // UX: Glass-style header summarizing counterpart, balances, and helper affordances.
      return _sectionCard(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: faint,
                  child: Text(
                    avatarInitial,
                    style: TextStyle(color: primary, fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 150),
                        transitionBuilder: (child, anim) => FadeTransition(opacity: anim, child: child),
                        child: Text(
                          name,
                          key: ValueKey(name),
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        phone.isNotEmpty ? phone : 'Tap to choose who you are settling with',
                        style: TextStyle(color: Colors.grey.shade600, fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 10,
                        runSpacing: 8,
                        children: [
                          _summaryBadge('You get back', youGet, color: youGet > 0 ? primary : Colors.grey.shade500),
                          _summaryBadge('You owe', youOwe, color: youOwe > 0 ? Colors.orange.shade600 : Colors.grey.shade500),
                        ],
                      ),
                    ],
                  ),
                ),
                if (widget.groups.isNotEmpty) ...[
                  Column(
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Checkbox(
                            value: _selectedGroup == null,
                            onChanged: (value) {
                              setState(() {
                                if (value == true) {
                                  _selectedGroup = null;
                                } else if (widget.groups.isNotEmpty) {
                                  _selectedGroup = widget.groups.first;
                                }
                              });
                              _relistenAndRecompute();
                            },
                            visualDensity: VisualDensity.compact,
                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          const SizedBox(width: 4),
                          const Text('Select all', style: TextStyle(fontWeight: FontWeight.w600)),
                        ],
                      ),
                      IconButton(
                        tooltip: 'Help',
                        visualDensity: VisualDensity.compact,
                        onPressed: () {
                          showDialog<void>(
                            context: context,
                            builder: (ctx) => AlertDialog(
                              title: const Text('How Settle Up works'),
                              content: const Text(
                                'Mark settle ups when money moves outside Fiinny. Selecting all groups keeps every shared expense in scope.',
                              ),
                              actions: [
                                TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('GOT IT')),
                              ],
                            ),
                          );
                        },
                        icon: const Icon(Icons.help_outline_rounded),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ],
        ),
      );
    }

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: SafeArea(
        top: false,
        bottom: false,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 520),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: AbsorbPointer(
            absorbing: _submitting || _showSuccess,
            child: Stack(
              children: [
                Padding(
                  padding: EdgeInsets.only(bottom: 90 + viewInsets),
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Header
                        Row(
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: faint,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(Icons.handshake_rounded, size: 22, color: primary),
                            ),
                            const SizedBox(width: 10),
                            const Expanded(
                              child: Text('Settle Up', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                            ),
                            if (_submitting)
                              const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                          ],
                        ),
                        const SizedBox(height: 14),

                        friendSummaryCard(),
                        const SizedBox(height: 14),

                        // Error banner (if any)
                        if (_error != null) ...[
                          Container(
                            width: double.infinity,
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            decoration: BoxDecoration(
                              color: Colors.red.withOpacity(0.08),
                              border: Border.all(color: Colors.red.shade200),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.error_outline, color: Colors.red, size: 18),
                                const SizedBox(width: 8),
                                Expanded(child: Text(_error!, style: const TextStyle(color: Colors.red))),
                                IconButton(
                                  tooltip: 'Dismiss',
                                  icon: const Icon(Icons.close, size: 16, color: Colors.red),
                                  onPressed: () => setState(() => _error = null),
                                ),
                              ],
                            ),
                          ),
                        ],

                        // Selection + direction
                        // UX: Card keeps data-entry controls grounded with friend/group context.
                        _sectionCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Group (optional)
                              if (!singleGroup && widget.groups.isNotEmpty) ...[
                                DropdownButtonFormField<GroupModel?>(
                                  value: _selectedGroup,
                                  items: <DropdownMenuItem<GroupModel?>>[
                                    const DropdownMenuItem<GroupModel?>(value: null, child: Text('-- No Group --')),
                                    ...widget.groups.map((g) => DropdownMenuItem<GroupModel?>(value: g, child: Text(g.name))),
                                  ],
                                  onChanged: (g) {
                                    setState(() => _selectedGroup = g);
                                    _relistenAndRecompute();
                                  },
                                  decoration: const InputDecoration(
                                    labelText: 'Group (optional)',
                                    prefixIcon: Icon(Icons.groups_rounded),
                                  ),
                                ),
                                const SizedBox(height: 10),
                              ],

                              // Friend (exclude "me")
                              if (friendChoices.isEmpty)
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.amber.withOpacity(.12),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: Colors.amber.shade300),
                                  ),
                                  child: const Text(
                                    "No eligible friends found (you can’t settle with yourself).",
                                    style: TextStyle(fontWeight: FontWeight.w600),
                                  ),
                                )
                              else if (!singleFriend) ...[
                                DropdownButtonFormField<FriendModel?>(
                                  value: _selectedFriend != null && !_isMeFriend(_selectedFriend!) ? _selectedFriend : null,
                                  items: <DropdownMenuItem<FriendModel?>>[
                                    const DropdownMenuItem<FriendModel?>(value: null, child: Text('-- Select Friend --')),
                                    ...friendChoices.map(
                                          (f) => DropdownMenuItem<FriendModel?>(value: f, child: Text(f.name)),
                                    ),
                                  ],
                                  onChanged: (f) {
                                    setState(() => _selectedFriend = f);
                                    _relistenAndRecompute();
                                  },
                                  decoration: const InputDecoration(
                                    labelText: 'With (Friend)',
                                    prefixIcon: Icon(Icons.person_rounded),
                                  ),
                                ),
                                const SizedBox(height: 10),
                              ],

                              // Direction badge
                              AnimatedContainer(
                                duration: const Duration(milliseconds: 180),
                                curve: Curves.easeOut,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                decoration: BoxDecoration(
                                  color: _directionColor().withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: _directionColor().withOpacity(0.5)),
                                ),
                                child: AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 150),
                                  transitionBuilder: (child, anim) => FadeTransition(
                                    opacity: anim,
                                    child: ScaleTransition(scale: anim, child: child),
                                  ),
                                  child: Row(
                                    key: ValueKey<String>(_directionText()),
                                    children: [
                                      Icon(
                                        _direction < 0
                                            ? Icons.call_made_rounded
                                            : _direction > 0
                                                ? Icons.call_received_rounded
                                                : Icons.info_outline,
                                        size: 18,
                                        color: _directionColor(),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          _directionText(),
                                          style: TextStyle(
                                            color: _directionColor(),
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(height: 10),

                              // Who paid toggle
                              Row(
                                children: [
                                  ChoiceChip(
                                    label: const Text('They paid me'),
                                    selected: !_payerIsMe,
                                    onSelected: (v) => setState(() => _payerIsMe = false),
                                    selectedColor: primary.withOpacity(0.15),
                                    labelStyle: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: !_payerIsMe ? primary : Colors.grey.shade700,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  ChoiceChip(
                                    label: const Text('I paid them'),
                                    selected: _payerIsMe,
                                    onSelected: (v) => setState(() => _payerIsMe = true),
                                    selectedColor: primary.withOpacity(0.15),
                                    labelStyle: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: _payerIsMe ? primary : Colors.grey.shade700,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 12),

                        // Amount + chips
                        // UX: Amount card with helper microcopy + quick chips for fast fills.
                        _sectionCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Amount', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.teal.shade900)),
                              const SizedBox(height: 10),
                              TextFormField(
                                controller: _amountCtrl,
                                inputFormatters: [
                                  FilteringTextInputFormatter.allow(RegExp(r'^\d{0,9}(\.\d{0,2})?$')),
                                ],
                                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                decoration: const InputDecoration(
                                  prefixIcon: Icon(Icons.currency_rupee),
                                  labelText: 'Settle amount',
                                ),
                                onChanged: (_) {
                                  setState(() {
                                    if (_error != null) _error = null;
                                  });
                                },
                              ),
                              const SizedBox(height: 6),
                              AnimatedSwitcher(
                                duration: const Duration(milliseconds: 150),
                                child: Text(
                                  _amountHelperText(),
                                  key: ValueKey<String>(_amountHelperText()),
                                  style: TextStyle(color: Colors.grey.shade600, fontWeight: FontWeight.w500),
                                ),
                              ),
                              const SizedBox(height: 10),
                              Wrap(children: _chips()),
                            ],
                          ),
                        ),

                        const SizedBox(height: 12),

                        // Note + date + attachment
                        // UX: Keep optional context (notes/date/receipt) grouped for clarity.
                        _sectionCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              TextFormField(
                                decoration: const InputDecoration(
                                  labelText: 'Note (optional)',
                                  prefixIcon: Icon(Icons.sticky_note_2_outlined),
                                ),
                                onChanged: (v) => _note = v,
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  const Icon(Icons.calendar_today, size: 18, color: Colors.grey),
                                  const SizedBox(width: 8),
                                  Text(
                                    'Date: ${_date.toLocal().toString().substring(0, 10)}',
                                    style: const TextStyle(fontWeight: FontWeight.w600),
                                  ),
                                  const Spacer(),
                                  TextButton(
                                    onPressed: () async {
                                      final picked = await showDatePicker(
                                        context: context,
                                        initialDate: _date,
                                        firstDate: DateTime(2000),
                                        lastDate: DateTime.now(),
                                      );
                                      if (picked != null) setState(() => _date = picked);
                                    },
                                    child: const Text('Change'),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  const Icon(Icons.attachment_rounded, size: 18, color: Colors.grey),
                                  const SizedBox(width: 8),
                                  const Text('Receipt (optional)', style: TextStyle(fontWeight: FontWeight.w600)),
                                  const Spacer(),
                                  if (!kIsWeb) ...[
                                    IconButton(
                                      tooltip: 'Camera',
                                      onPressed: _pickFromCamera,
                                      icon: Icon(Icons.photo_camera_outlined, color: primary),
                                    ),
                                    IconButton(
                                      tooltip: 'Gallery',
                                      onPressed: _pickFromGallery,
                                      icon: Icon(Icons.photo_library_outlined, color: primary),
                                    ),
                                  ],
                                  IconButton(
                                    tooltip: 'File / PDF',
                                    onPressed: _pickAnyFile,
                                    icon: Icon(Icons.attach_file_rounded, color: primary),
                                  ),
                                ],
                              ),
                              if (_attachName != null) ...[
                                const SizedBox(height: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                  decoration: BoxDecoration(
                                    color: primary.withOpacity(0.08),
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(color: primary.withOpacity(0.3)),
                                  ),
                                  child: Row(
                                    children: [
                                      Icon(Icons.insert_drive_file, size: 18, color: primary),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          _attachName!,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontWeight: FontWeight.w600),
                                        ),
                                      ),
                                      const Icon(Icons.check_circle_rounded, size: 16, color: Colors.green),
                                      const SizedBox(width: 6),
                                      IconButton(
                                        tooltip: 'Remove',
                                        onPressed: () => setState(() {
                                          _attachBytes = null;
                                          _attachName = null;
                                          _attachMime = null;
                                          _uploadedUrl = null;
                                        }),
                                        icon: const Icon(Icons.close, size: 18),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ),
                // UX: Sticky summary keeps CTA + disclaimer visible over keyboard scroll.
                Align(
                  alignment: Alignment.bottomCenter,
                  child: _SummaryBar(
                    enabled: _isValidAmount && !_submitting,
                    busy: _submitting,
                    label: fullLabel,
                    compactLabel: compactLabel,
                    subtitle: netSubtitle,
                    accent: primary,
                    onPressed: () async {
                      FocusScope.of(context).unfocus();
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (_) => AlertDialog(
                          title: Text(
                            _payerIsMe
                                ? 'Are you sure you PAID ${_fmt(_enteredAmt)}?'
                                : 'Are you sure you RECEIVED ${_fmt(_enteredAmt)}?'
                          ),
                          content: const Text(
                            'If this happened outside Fiinny, you can mark it here.\nNo transfer will happen due to this action.',
                          ),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('CANCEL')),
                            TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('CONFIRM')),
                          ],
                        ),
                      );
                      if (ok == true) _submit();
                    },
                  ),
                ),
                if (_showSuccess)
                  // UX: Mint success toast reassures the manual action without leaving dialog instantly.
                  Positioned.fill(
                    child: Container(
                      color: Colors.black.withOpacity(.35),
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.all(24),
                          decoration: BoxDecoration(
                            color: Theme.of(context).cardColor.withOpacity(0.95),
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.12),
                                blurRadius: 24,
                                offset: const Offset(0, 12),
                              ),
                            ],
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.check_circle_rounded, size: 56, color: primary),
                              const SizedBox(height: 10),
                              const Text(
                                'Success!',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryBar extends StatelessWidget {
  final bool enabled;
  final bool busy;
  final String label;
  final String subtitle;
  final Color accent;
  final VoidCallback onPressed;
  final String? compactLabel;

  const _SummaryBar({
    required this.enabled,
    required this.busy,
    required this.label,
    required this.subtitle,
    required this.accent,
    required this.onPressed,
    this.compactLabel,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: LayoutBuilder(
        builder: (ctx, c) {
          final textScale = MediaQuery.of(ctx).textScaleFactor;
          final isCompact = c.maxWidth < 360 || label.length > 26 || textScale > 1.15;

          Widget buildCopy() => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    subtitle,
                    maxLines: 1,
                    softWrap: false,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'No money will be transferred',
                    maxLines: 1,
                    softWrap: false,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
                ],
              );

          Widget buildButton(String text, {bool fullWidth = false}) => SizedBox(
                width: fullWidth ? double.infinity : null,
                child: ElevatedButton(
                  onPressed: enabled ? onPressed : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: enabled ? accent : accent.withOpacity(0.4),
                    foregroundColor: Colors.white,
                    minimumSize: const Size(0, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: busy
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
              );

          return Container(
            margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            padding: const RangeValues(12, 10).toString().isEmpty
                ? const EdgeInsets.symmetric(horizontal: 12, vertical: 10)
                : const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(.08), blurRadius: 10)],
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: isCompact
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      buildCopy(),
                      const SizedBox(height: 8),
                      buildButton(compactLabel ?? label, fullWidth: true),
                    ],
                  )
                : Row(
                    children: [
                      Expanded(child: buildCopy()),
                      const SizedBox(width: 12),
                      Flexible(
                        fit: FlexFit.loose,
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(minWidth: 140, maxWidth: 260),
                          child: buildButton(label),
                        ),
                      ),
                    ],
                  ),
          );
        },
      ),
    );
  }
}
