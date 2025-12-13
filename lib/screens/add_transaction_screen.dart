// lib/screens/add_transaction_screen.dart
import 'dart:io';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/services.dart';

import '../constants/expense_categories.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../services/friend_service.dart';
import '../services/group_service.dart';

// Inline friend creation (with Contacts picker)
import '../widgets/add_friend_dialog.dart';

/// Light finance palette
// Light finance palette removed in favor of Theme.of(context)

class AddTransactionScreen extends StatefulWidget {
  final String userId; // phone (E.164), e.g., +91xxxx
  const AddTransactionScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<AddTransactionScreen> createState() => _AddTransactionScreenState();
}
class _DarkPillButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final IconData icon;
  final String label;
  const _DarkPillButton({
    required this.onPressed,
    required this.icon,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 18, color: Colors.white),
      label: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
        ),
      ),
      style: TextButton.styleFrom(
        backgroundColor: Theme.of(context).colorScheme.onSurface, // darker pill
        foregroundColor: Theme.of(context).colorScheme.onInverseSurface,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        shape: const StadiumBorder(),
        overlayColor: Colors.white10,
      ),
    );
  }
}

enum _SplitAddOption { friend, group }



class _AddTransactionScreenState extends State<AddTransactionScreen> {
  final _pg = PageController();

  // Step data
  final _amountCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  final _labelCtrl = TextEditingController();
  final _cardLast4Ctrl = TextEditingController();

  String _type = 'debit'; // debit | credit | cc_spend | cc_bill
  String _category = 'General';
  String? _subcategory;

  // Optional
  File? _billImage;
  String? _billImageUrl;

  // Friends & Groups (maps: {'id': phone/groupId, 'name': ...})
  List<Map<String, String>> _friends = [];
  List<_GroupLite> _groups = []; // id + name + memberPhones
  String? _friendId;
  String? _groupId;

  // Split editor state
  bool _customSplit = false;
  String? _payerPhone;
  final Map<String, TextEditingController> _splitCtrls = {};
  Map<String, double> _splits = {}; // phone -> amount

  List<String> _labels = const ["Rent", "Groceries", "Office", "Goa Trip", "Birthday"];
  String? _selectedLabel;

  final List<String> _expenseCategories = kExpenseCategories;
  final List<String> _incomeCategories  = kIncomeCategories;

  int _step = 0;
  bool _saving = false;
  bool _loadingFG = false; // fetching friends/groups
  bool _buildingSplit = false; // while building split controllers

  // ---------- Lifecycle ----------
  @override
  void initState() {
    super.initState();
    _payerPhone = widget.userId; // default you paid
    _refreshFriendsGroups();
  }

  @override
  void dispose() {
    _pg.dispose();
    for (final c in _splitCtrls.values) {
      c.dispose();
    }
    _amountCtrl.dispose();
    _noteCtrl.dispose();
    _labelCtrl.dispose();
    _cardLast4Ctrl.dispose();
    super.dispose();
  }

  // ---------- Data load ----------
  Future<void> _refreshFriendsGroups() async {
    setState(() => _loadingFG = true);
    try {
      // Friends via FriendService
      final frs = await FriendService().getAllFriendsForUser(widget.userId);
      final mappedFriends = frs.map((f) => {
        'id': f.phone,
        'name': f.name.isNotEmpty ? f.name : f.phone,
      } as Map<String,String>).toList();

      // Groups via GroupService (global) to get memberPhones
      final gs = await GroupService().fetchUserGroups(widget.userId);
      final mappedGroups = gs.map((g) => _GroupLite(
        id: g.id,
        name: g.name,
        memberPhones: List<String>.from(g.memberPhones),
      )).toList();

      if (!mounted) return;
      setState(() {
        _friends = mappedFriends;
        _groups = mappedGroups;
      });
    } catch (e) {
      if (!mounted) return;
      _toast('Failed to load friends/groups: $e');
    } finally {
      if (mounted) setState(() => _loadingFG = false);
    }
  }

  // ---------- Split helpers ----------
  List<String> get _participants {
    if (_groupId != null && _groupId!.isNotEmpty) {
      final g = _groups.firstWhere((x) => x.id == _groupId, orElse: () => _GroupLite.empty());
      // ensure current user listed at least
      final set = {...g.memberPhones, widget.userId};
      return set.toList();
    }
    if (_friendId != null && _friendId!.isNotEmpty) {
      return [widget.userId, _friendId!];
    }
    return []; // no split
  }

  String _displayForPhone(String phone) {
    if (phone == widget.userId) return "You";
    final f = _friends.firstWhere(
          (x) => x['id'] == phone,
      orElse: () => {'name': phone, 'id': phone},
    );
    return f['name'] ?? phone;
  }

  double get _sumSplits =>
      _splits.values.fold(0.0, (a, b) => a + (b.isNaN ? 0.0 : b));

  String _fmt2(double v) => v.toStringAsFixed(2);
  double _round2(double v) => (v * 100).roundToDouble() / 100.0;

  void _rebuildSplitControllers({bool equalizeIfPossible = false}) {
    setState(() => _buildingSplit = true);
    // Dispose missing controllers
    final nowSet = _participants.toSet();
    final existing = _splitCtrls.keys.toList();
    for (final k in existing) {
      if (!nowSet.contains(k)) {
        _splitCtrls[k]?.dispose();
        _splitCtrls.remove(k);
        _splits.remove(k);
      }
    }
    // Add controllers for new participants
    for (final p in nowSet) {
      _splitCtrls.putIfAbsent(p, () {
        final c = TextEditingController(text: _fmt2(0.0));
        c.addListener(() {
          final v = double.tryParse(c.text) ?? 0.0;
          _splits[p] = v;
          setState(() {}); // update sum pill
        });
        return c;
      });
      _splits.putIfAbsent(p, () => 0.0);
    }
    // Default payer
    if (_payerPhone == null || !nowSet.contains(_payerPhone)) {
      _payerPhone = widget.userId;
    }

    // Equalize if asked & amount set
    if (equalizeIfPossible) {
      final amt = double.tryParse(_amountCtrl.text.trim()) ?? 0.0;
      if (amt > 0 && nowSet.isNotEmpty) {
        final each = _round2(amt / nowSet.length);
        // Distribute; put rounding residual on payer
        double sum = 0.0;
        for (final p in nowSet) {
          _splits[p] = each;
          _splitCtrls[p]?.text = _fmt2(each);
          sum += each;
        }
        final delta = _round2(amt - sum);
        if (delta.abs() > 0.001) {
          final payer = _payerPhone!;
          final adj = _round2((_splits[payer] ?? 0.0) + delta);
          _splits[payer] = adj;
          _splitCtrls[payer]?.text = _fmt2(adj);
        }
      }
    }
    setState(() => _buildingSplit = false);
  }

  void _equalSplit() => _rebuildSplitControllers(equalizeIfPossible: true);
  void _clearSplits() {
    for (final p in _participants) {
      _splits[p] = 0.0;
      _splitCtrls[p]?.text = _fmt2(0.0);
    }
    setState(() {});
  }

  Map<String, double> _normalizedSplits() {
    final out = <String, double>{};
    for (final p in _participants) {
      out[p] = _round2(_splits[p] ?? 0.0);
    }
    return out;
  }

  // ---------- Nav ----------
  void _next() {
    FocusScope.of(context).unfocus();
    if (_step == 0 && !_validStep0()) return;
    if (_step == 1 && !_validStep1()) return;
    if (_step == 2 && !_validStep2()) return;
    if (_step < 3) {
      setState(() => _step += 1);
      _pg.animateToPage(_step, duration: const Duration(milliseconds: 220), curve: Curves.easeOutCubic);
    }
  }

  void _back() {
    FocusScope.of(context).unfocus();
    if (_step > 0) {
      setState(() => _step -= 1);
      _pg.animateToPage(_step, duration: const Duration(milliseconds: 220), curve: Curves.easeOutCubic);
    } else {
      Navigator.pop(context);
    }
  }

  // ---------- Validation per step ----------
  bool _validStep0() {
    final amt = double.tryParse(_amountCtrl.text.trim());
    if (amt == null || amt <= 0) {
      _toast('Enter a valid amount');
      return false;
    }
    return true;
  }

  bool _validStep1() {
    if (_category.isEmpty) {
      _toast('Choose a category');
      return false;
    }
    return true;
  }

  bool _validStep2() {
    // If custom split → sum must match amount
    if (_customSplit && _participants.isNotEmpty) {
      final amt = _round2(double.tryParse(_amountCtrl.text.trim()) ?? 0.0);
      final sum = _round2(_sumSplits);
      if ((amt - sum).abs() > 0.01) {
        _toast('Splits must total ₹${_fmt2(amt)}');
        return false;
      }
      if (_payerPhone == null || !_participants.contains(_payerPhone)) {
        _toast('Select who paid');
        return false;
      }
    }
    return true;
  }

  void _toast(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  // ---------- Image ----------
  Future<void> _pickBillImage() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (picked == null) return;
    setState(() => _billImage = File(picked.path));
  }

  Future<String?> _uploadBillImage() async {
    if (_billImage == null) return null;
    try {
      final ref = FirebaseStorage.instance
          .ref('users/${widget.userId}/tx_images/${DateTime.now().millisecondsSinceEpoch}.jpg');
      await ref.putFile(_billImage!);
      final url = await ref.getDownloadURL();
      if (!mounted) return url;
      setState(() => _billImageUrl = url);
      return url;
    } catch (e) {
      _toast('Bill upload failed: $e');
      return null;
    }
  }

  // ---------- Inline create: Friend ----------
  Future<void> _addFriendInline() async {
    final base = Theme.of(context);
    final blacky = base.copyWith(
      colorScheme: base.colorScheme.copyWith(
        primary: base.colorScheme.onSurface,           // controls focused indicators, selection, etc.
        secondary: base.colorScheme.onSurface,
        surface: base.colorScheme.surface,
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: base.colorScheme.onSurface),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: base.colorScheme.onSurface, foregroundColor: base.colorScheme.onInverseSurface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: MaterialStatePropertyAll(base.colorScheme.onSurface),
        checkColor: MaterialStatePropertyAll(base.colorScheme.onInverseSurface),
      ),
      radioTheme: RadioThemeData(
        fillColor: MaterialStatePropertyAll(base.colorScheme.onSurface),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: MaterialStateProperty.resolveWith((s) => base.colorScheme.onSurface),
        trackColor: MaterialStateProperty.resolveWith((s) => base.colorScheme.onSurface.withOpacity(0.25)),
      ),
    );

    final added = await showDialog<bool>(
      context: context,
      builder: (_) => Theme(
        data: blacky,
        child: AddFriendDialog(userPhone: widget.userId),
      ),
    );

    if (added == true) {
      await _refreshFriendsGroups();
    }
  }


  // ---------- Inline create: Group ----------
  Future<void> _createGroupInline() async {
    final base = Theme.of(context);
    final blacky = base.copyWith(
      colorScheme: base.colorScheme.copyWith(
        primary: base.colorScheme.onSurface, secondary: base.colorScheme.onSurface, surface: base.colorScheme.surface,
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: base.colorScheme.onSurface),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: base.colorScheme.onSurface, foregroundColor: base.colorScheme.onInverseSurface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: MaterialStatePropertyAll(base.colorScheme.onSurface),
        checkColor: MaterialStatePropertyAll(base.colorScheme.onInverseSurface),
      ),
      radioTheme: RadioThemeData(fillColor: MaterialStatePropertyAll(base.colorScheme.onSurface)),
      switchTheme: SwitchThemeData(
        thumbColor: MaterialStateProperty.resolveWith((s) => base.colorScheme.onSurface),
        trackColor: MaterialStateProperty.resolveWith((s) => base.colorScheme.onSurface.withOpacity(0.25)),
      ),
    );

    final res = await showModalBottomSheet<_CreateGroupResult>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => Theme(
        data: blacky,
        child: _CreateGroupSheet(
          userPhone: widget.userId,
          friends: _friends,
        ),
      ),
    );

    if (res == null) return;
    try {
      final id = await GroupService().addGroup(
        userPhone: widget.userId,
        name: res.name,
        memberPhones: res.memberPhones,
        createdBy: widget.userId,
      );
      await _refreshFriendsGroups();
      setState(() {
        _groupId = id;
        _friendId = null;
      });
      _rebuildSplitControllers(equalizeIfPossible: _customSplit);
    } catch (e) {
      _toast('Failed to create group: $e');
    }
  }


  // ---------- Save ----------
  Future<void> _save() async {
    if (!_validStep0() || !_validStep1() || !_validStep2()) return;

    setState(() => _saving = true);
    try {
      String? billUrl;
      if (_billImage != null) {
        billUrl = await _uploadBillImage();
      }

      final labelTyped = _labelCtrl.text.trim();
      final label = labelTyped.isNotEmpty ? labelTyped : _selectedLabel;

      final amount = double.parse(_amountCtrl.text.trim());
      final note = _noteCtrl.text.trim();

      if (_type == 'credit') {
        final income = IncomeItem(
          id: '',
          type: _category,
          amount: amount,
          note: note,
          date: DateTime.now(),
          source: 'Manual',
          imageUrl: billUrl,
          label: label,
        );
        await IncomeService().addIncome(widget.userId, income);
      } else {
        final isBill = _type == 'cc_bill';
        final type = _type == 'cc_spend'
            ? 'Credit Card'
            : _type == 'cc_bill'
            ? 'Credit Card Bill'
            : _category;

        // Split targeting
        List<String> friendIds = [];
        String? groupId;
        if ((_friendId ?? '').isNotEmpty) friendIds = [_friendId!];
        if ((_groupId ?? '').isNotEmpty && friendIds.isEmpty) groupId = _groupId;

        final expense = ExpenseItem(
          id: '',
          amount: amount,
          type: type,
          note: note,
          date: DateTime.now(),
          payerId: _customSplit ? (_payerPhone ?? widget.userId) : widget.userId,
          friendIds: friendIds,
          settledFriendIds: const [],
          cardType: (_type == 'cc_spend' || _type == 'cc_bill') ? 'Credit Card' : null,
          cardLast4: (_type == 'cc_spend' || _type == 'cc_bill') ? _cardLast4Ctrl.text.trim() : null,
          isBill: isBill,
          groupId: groupId,
          imageUrl: billUrl,
          label: label,
          category: _category,
          subtype: _subcategory, // Added subtype
          customSplits: (_customSplit && _participants.isNotEmpty) ? _normalizedSplits() : null,
        );

        // Prefer sync path if splitting (friend/group/custom)
        final needsSync = (_customSplit && _participants.isNotEmpty) || friendIds.isNotEmpty || groupId != null;
        if (needsSync) {
          await ExpenseService().addExpenseWithSync(widget.userId, expense);
        } else {
          await ExpenseService().addExpense(widget.userId, expense);
        }
      }

      if (!mounted) return;
      _toast('Transaction saved');
      Navigator.pop(context, true);
    } catch (e) {
      _toast('Save failed: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    final steps = ['Amount', 'Category', 'Details', 'Review'];
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: Theme.of(context).textTheme.bodyMedium?.color),
          onPressed: _back,
        ),
        centerTitle: true,
        title: Text('Add Transaction',
            style: TextStyle(color: Theme.of(context).textTheme.bodyMedium?.color, fontWeight: FontWeight.w700)),
        actions: [
          if (_loadingFG) const Padding(
            padding: EdgeInsets.only(right: 12),
            child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Progress / Stepper
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
              child: _StepperBar(current: _step, total: steps.length, labels: steps),
            ),
            Expanded(
              child: PageView(
                controller: _pg,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _StepAmountType(
                    amountCtrl: _amountCtrl,
                    type: _type,
                    onType: (v){ setState(() {
                      _type = v;
                      _category = 'General';
                      _friendId = null; _groupId = null;
                      _customSplit = false;
                      _payerPhone = widget.userId;
                      _cardLast4Ctrl.clear();
                      _rebuildSplitControllers();
                    });},
                    cardLast4Ctrl: _cardLast4Ctrl,
                    onNext: _next,
                    saving: _saving,
                  ),
                  _StepCategory(
                    type: _type,
                    expenseCategories: _expenseCategories,
                    incomeCategories: _incomeCategories,
                    value: _category,
                    onChanged: (v){ setState(() {
                      _category = v;
                      _subcategory = null; // Reset subcat
                      // Default subcat if exists?
                      final subs = kExpenseSubcategories[v];
                      if (subs != null && subs.isNotEmpty) _subcategory = subs.first;
                    }); },
                    subcategory: _subcategory,
                    onSubcategory: (v) => setState(() => _subcategory = v),
                    onNext: _next,
                    onBack: _back,
                  ),
                  _StepDetails(
                    type: _type,
                    noteCtrl: _noteCtrl,
                    friends: _friends,
                    groups: _groups,
                    friendId: _friendId,
                    groupId: _groupId,
                    onFriend: (v){ setState(() {
                      _friendId = v;
                      _groupId = null;
                      _payerPhone = widget.userId;
                      _rebuildSplitControllers(equalizeIfPossible: _customSplit);
                    }); },
                    onGroup: (v){ setState(() {
                      _groupId = v;
                      _friendId = null;
                      _payerPhone = widget.userId;
                      _rebuildSplitControllers(equalizeIfPossible: _customSplit);
                    }); },
                    customSplit: _customSplit,
                    onCustomSplitChanged: (v){
                      setState(() {
                        _customSplit = v;
                        _rebuildSplitControllers(equalizeIfPossible: _customSplit);
                      });
                    },
                    payerPhone: _payerPhone,
                    onPayerChanged: (p){
                      setState(() {
                        _payerPhone = p;
                        if (_customSplit) _equalSplit(); // keep residual on payer
                      });
                    },
                    participants: _participants,
                    splitCtrls: _splitCtrls,
                    onEqual: _equalSplit,
                    onClear: _clearSplits,
                    sumText: () {
                      final amt = double.tryParse(_amountCtrl.text.trim()) ?? 0.0;
                      return "Sum: ₹${_fmt2(_sumSplits)} / ₹${_fmt2(amt)}";
                    }(),
                    labels: _labels,
                    selectedLabel: _selectedLabel,
                    onLabelSelect: (v){ setState(() { _selectedLabel = v; _labelCtrl.clear(); }); },
                    labelCtrl: _labelCtrl,
                    billFile: _billImage,
                    onPickBill: _saving ? null : _pickBillImage,
                    onClearBill: _saving ? null : (){ setState(()=> _billImage = null); },
                    onAddFriend: _addFriendInline,
                    onCreateGroup: _createGroupInline,
                    onNext: _next,
                    onBack: _back,
                    mePhone: widget.userId,
                  ),
                  _StepReview(
                    type: _type,
                    category: _category,
                    amount: _amountCtrl.text.trim(),
                    note: _noteCtrl.text.trim(),
                    cardLast4: _cardLast4Ctrl.text.trim(),
                    friendName: _friends.firstWhere(
                          (f) => f['id'] == _friendId, orElse: ()=> const {'name':''},
                    )['name'] ?? '',
                    groupName: _groups.firstWhere(
                          (g) => g.id == _groupId, orElse: ()=> _GroupLite.empty(),
                    ).name,
                    label: _labelCtrl.text.trim().isNotEmpty ? _labelCtrl.text.trim() : (_selectedLabel ?? ''),
                    billFile: _billImage,
                    saving: _saving,
                    onBack: _back,
                    onSave: _save,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ------------ STEP 0: Amount & Type ------------
class _StepAmountType extends StatelessWidget {
  final TextEditingController amountCtrl;
  final String type;
  final ValueChanged<String> onType;
  final TextEditingController cardLast4Ctrl;
  final VoidCallback onNext;
  final bool saving;
  const _StepAmountType({
    required this.amountCtrl,
    required this.type,
    required this.onType,
    required this.cardLast4Ctrl,
    required this.onNext,
    required this.saving,
  });

  @override
  Widget build(BuildContext context) {
    final isCC = type == 'cc_spend';
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _H2('Amount'),
          const SizedBox(height: 8),
          _AmountField(controller: amountCtrl, enabled: !saving),
          const SizedBox(height: 18),
          const _H2('Type'),
          const SizedBox(height: 8),
          _TypeChips(value: type, onChanged: onType),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            child: isCC
                ? Padding(
              key: const ValueKey('cc-last4'),
              padding: const EdgeInsets.only(top: 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _H2('Card Last 4 (optional)'),
                  const SizedBox(height: 8),
                  _Box(
                    child: TextField(
                      controller: cardLast4Ctrl,
                      enabled: !saving,
                      maxLength: 4,
                      keyboardType: TextInputType.number,
                      decoration: _inputDec(context).copyWith(counterText: ''),
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(4),
                      ],
                    ),
                  ),
                ],
              ),
            )
                : const SizedBox.shrink(),
          ),
          const SizedBox(height: 28),
          _PrimaryButton(text: 'Next', onPressed: saving ? null : onNext),
        ],
      ),
    );
  }
}

// ------------ STEP 1: Category ------------
class _StepCategory extends StatelessWidget {
  final String type;
  final List<String> expenseCategories;
  final List<String> incomeCategories;
  final String value;
  final String? subcategory;
  final ValueChanged<String> onChanged;
  final ValueChanged<String?> onSubcategory;
  final VoidCallback onNext;
  final VoidCallback onBack;

  const _StepCategory({
    required this.type,
    required this.expenseCategories,
    required this.incomeCategories,
    required this.value,
    required this.subcategory,
    required this.onChanged,
    required this.onSubcategory,
    required this.onNext,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final cats = type == 'credit' ? incomeCategories : expenseCategories;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _H2('Category'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8, runSpacing: 8,
            children: cats.map((c) {
              final sel = c == value;
              return ChoiceChip(
                selected: sel,
                onSelected: (_) => onChanged(c),
                label: Text(c),
                labelStyle: TextStyle(
                  color: sel ? Theme.of(context).colorScheme.onPrimary : Colors.black,
                  fontWeight: FontWeight.w700,
                ),
                selectedColor: Theme.of(context).colorScheme.primary,
                backgroundColor: Theme.of(context).cardColor,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: sel ? Theme.of(context).colorScheme.primary : Theme.of(context).dividerColor),
                ),
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              );
            }).toList(),
          ),
          if (type != 'credit' && kExpenseSubcategories[value] != null && kExpenseSubcategories[value]!.isNotEmpty) ...[
            const SizedBox(height: 24),
            const _H2('Subcategory'),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Theme.of(context).dividerColor),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: subcategory,
                  isExpanded: true,
                  hint: const Text('Select Subcategory'),
                  items: kExpenseSubcategories[value]!.map((s) => DropdownMenuItem(
                    value: s,
                    child: Text(s, style: const TextStyle(fontWeight: FontWeight.w600)),
                  )).toList(),
                  onChanged: onSubcategory,
                ),
              ),
            ),
          ],
          const SizedBox(height: 28),
          Row(
            children: [
              _GhostButton(text: 'Back', onPressed: onBack),
              const SizedBox(width: 12),
              Expanded(child: _PrimaryButton(text: 'Next', onPressed: onNext)),
            ],
          )
        ],
      ),
    );
  }
}

// ------------ STEP 2: Details (with Split editor) ------------
class _StepDetails extends StatelessWidget {
  final String type;
  final TextEditingController noteCtrl;
  final String mePhone;
  final List<Map<String,String>> friends;
  final List<_GroupLite> groups;
  final String? friendId;
  final String? groupId;
  final ValueChanged<String?> onFriend;
  final ValueChanged<String?> onGroup;

  final bool customSplit;
  final ValueChanged<bool> onCustomSplitChanged;
  final String? payerPhone;
  final ValueChanged<String?> onPayerChanged;
  final List<String> participants; // phones
  final Map<String, TextEditingController> splitCtrls;
  final VoidCallback onEqual;
  final VoidCallback onClear;
  final String sumText;

  final List<String> labels;
  final String? selectedLabel;
  final ValueChanged<String?> onLabelSelect;
  final TextEditingController labelCtrl;

  final File? billFile;
  final VoidCallback? onPickBill;
  final VoidCallback? onClearBill;

  final VoidCallback onAddFriend;
  final VoidCallback onCreateGroup;

  final VoidCallback onNext;
  final VoidCallback onBack;

  const _StepDetails({
    required this.type,
    required this.noteCtrl,
    required this.friends,
    required this.groups,
    required this.friendId,
    required this.groupId,
    required this.onFriend,
    required this.onGroup,
    required this.customSplit,
    required this.onCustomSplitChanged,
    required this.payerPhone,
    required this.onPayerChanged,
    required this.participants,
    required this.splitCtrls,
    required this.onEqual,
    required this.onClear,
    required this.sumText,
    required this.labels,
    required this.selectedLabel,
    required this.onLabelSelect,
    required this.labelCtrl,
    required this.billFile,
    required this.onPickBill,
    required this.onClearBill,
    required this.onAddFriend,
    required this.onCreateGroup,
    required this.onNext,
    required this.onBack,
    required this.mePhone,
  });

  String _nameForGroup(String? id) {
    if (id == null) return '';
    final g = groups.firstWhere((x) => x.id == id, orElse: () => _GroupLite.empty());
    return g.name;
  }

  @override
  Widget build(BuildContext context) {
    final showSplit = type == 'debit';
    final hasSplitTarget = (friendId ?? '').isNotEmpty || (groupId ?? '').isNotEmpty;

    Future<void> _showAddMenu() async {
      final action = await showModalBottomSheet<_SplitAddOption>(
        context: context,
        builder: (sheetContext) {
          return SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  leading: const Icon(Icons.person_add_alt_1_rounded),
                  title: const Text('Add Friend'),
                  onTap: () => Navigator.of(sheetContext).pop(_SplitAddOption.friend),
                ),
                ListTile(
                  leading: const Icon(Icons.group_add_rounded),
                  title: const Text('Create Group'),
                  onTap: () => Navigator.of(sheetContext).pop(_SplitAddOption.group),
                ),
              ],
            ),
          );
        },
      );

      if (action == _SplitAddOption.friend) {
        onAddFriend();
      } else if (action == _SplitAddOption.group) {
        onCreateGroup();
      }
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _H2('Details'),
          const SizedBox(height: 10),
          _Box(
            label: 'Note (optional)',
            child: TextField(
              controller: noteCtrl,
              maxLines: 2,
              decoration: _inputDec(context),
            ),
          ),
          if (showSplit) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _Box(
                    label: 'Split with Friend',
                    child: Theme(
                      data: Theme.of(context).copyWith(
                        colorScheme: Theme.of(context).colorScheme.copyWith(
                          primary: Theme.of(context).textTheme.bodyLarge?.color,        // selection + focus = black
                          onPrimary: Colors.white,
                        ),
                      ),
                      child: DropdownButtonFormField<String>(
                        value: friendId,
                        isExpanded: true,
                        decoration: _inputDec(context).copyWith(
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: Theme.of(context).textTheme.bodyLarge?.color ?? Colors.black, width: 1.4), // black border
                          ),
                        ),
                        items: [
                          const DropdownMenuItem(value: null, child: Text('None')),
                          ...friends.map((f) => DropdownMenuItem(
                            value: f['id'],
                            child: Text(
                              f['name'] ?? '',
                              style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color), // black list text
                            ),
                          )),
                        ],
                        onChanged: onFriend,
                        dropdownColor: Colors.white, // background stays white
                      ),
                    ),

                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _Box(
                    label: 'Split with Group',
                    child: Theme(
                      data: Theme.of(context).copyWith(
                        colorScheme: Theme.of(context).colorScheme.copyWith(
                          primary: Theme.of(context).textTheme.bodyLarge?.color, onPrimary: Colors.white,
                        ),
                      ),
                      child: DropdownButtonFormField<String>(
                        value: groupId,
                        isExpanded: true,
                        decoration: _inputDec(context).copyWith(
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: Theme.of(context).textTheme.bodyLarge?.color ?? Colors.black, width: 1.4),
                          ),
                        ),
                        items: [
                          const DropdownMenuItem(value: null, child: Text('None')),
                          ...groups.map((g) => DropdownMenuItem(
                            value: g.id,
                            child: Text(g.name, style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color)),
                          )),
                        ],
                        onChanged: onGroup,
                        dropdownColor: Colors.white,
                      ),
                    ),
                  ),

                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: -6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                _DarkPillButton(
                  onPressed: _showAddMenu,
                  icon: Icons.person_add_alt_1_rounded,
                  label: 'Add Friend',
                ),
                if (hasSplitTarget)
                  Chip(
                    label: Text(
                      (friendId ?? '').isNotEmpty
                          ? 'Friend selected'
                          : 'Group: ${_nameForGroup(groupId)}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    avatar: const Icon(Icons.check_circle, size: 18, color: Colors.white),
                    backgroundColor: const Color(0xFF273532), // darker chip to match
                    shape: const StadiumBorder(side: BorderSide(color: Colors.transparent)),
                  ),
              ],
            ),

            const SizedBox(height: 8),

            // Custom split toggle + editor
            AnimatedSize(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeInOut,
              child: Column(
                children: [
                  SwitchListTile.adaptive(
                    value: customSplit,
                    onChanged: hasSplitTarget ? onCustomSplitChanged : null,
                    title: const Text('Custom split'),
                    subtitle: Text(hasSplitTarget
                        ? 'Set exact amounts for each person'
                        : 'Select a Friend or Group to enable'),
                    contentPadding: EdgeInsets.zero,
                  ),
                  if (customSplit && hasSplitTarget) ...[
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        ActionChip(
                          label: const Text("Equal split"),
                          avatar: const Icon(Icons.balance, size: 18),
                          onPressed: onEqual,
                        ),
                        ActionChip(
                          label: const Text("Clear"),
                          avatar: const Icon(Icons.clear, size: 18),
                          onPressed: onClear,
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: Theme.of(context).primaryColor.withOpacity(0.10),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            sumText,
                            style: TextStyle(fontWeight: FontWeight.w700, color: Theme.of(context).textTheme.bodyLarge?.color),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    // Payer
                    _Box(
                      label: 'Paid by',
                      child: Theme(
                        data: Theme.of(context).copyWith(
                          colorScheme: Theme.of(context).colorScheme.copyWith(
                            primary: Theme.of(context).textTheme.bodyLarge?.color, onPrimary: Colors.white,
                          ),
                        ),
                        child: DropdownButtonFormField<String>(
                          value: payerPhone,
                          isExpanded: true,
                          decoration: _inputDec(context).copyWith(
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide(color: Theme.of(context).textTheme.bodyLarge?.color ?? Colors.black, width: 1.4),
                            ),
                          ),
                          items: participants.map((p) {
                            final f = friends.firstWhere(
                                  (x) => x['id'] == p,
                              orElse: () => {'name': p},
                            );
                            final display = (p == mePhone) ? 'You' : (f['name'] ?? p);
                            return DropdownMenuItem(
                              value: p,
                              child: Text(display, overflow: TextOverflow.ellipsis, style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color)),
                            );
                          }).toList(),
                          onChanged: onPayerChanged,
                          dropdownColor: Colors.white,
                        ),
                      ),
                    ),

                    const SizedBox(height: 8),
                    // Per participant fields
                    Column(
                      children: participants.map((p) {
                        final ctrl = splitCtrls[p]!;
                        final f = friends.firstWhere(
                              (x) => x['id'] == p,
                          orElse: () => {'name': p},
                        );
                        final display = (p == mePhone) ? 'You' : (f['name'] ?? p);

                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            children: [
                              CircleAvatar(
                                radius: 14,
                                backgroundColor: Theme.of(context).primaryColor.withOpacity(0.10),
                                child: Text(
                                  _initialsFor(display),
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Theme.of(context).textTheme.bodyLarge?.color),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  display,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.w700),
                                ),
                              ),
                              const SizedBox(width: 8),
                              SizedBox(
                                width: 120,
                                child: TextField(
                                  controller: ctrl,
                                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                  inputFormatters: [
                                    FilteringTextInputFormatter.allow(RegExp(r'^\d{0,7}(\.\d{0,2})?$')),
                                  ],
                                  textAlign: TextAlign.right,
                                  decoration: _inputDec(context).copyWith(labelText: '₹'),
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),

                    const SizedBox(height: 6),
                    if ((double.tryParse(sumText.replaceAll(RegExp(r'[^\d.]'), '')) ?? 0.0) <= 0)
                      Text(
                        "Tip: Enter amount first to enable equal split.",
                        style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
                      ),
                  ],
                ],
              ),
            ),
          ],

          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _Box(
                  label: 'Select Label',
                  child: DropdownButtonFormField<String>(
                    value: selectedLabel,
                    isExpanded: true,
                    decoration: _inputDec(context),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('No label')),
                      ...labels.map((l) => DropdownMenuItem(value: l, child: Text(l))),
                    ],
                    onChanged: onLabelSelect,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Box(
                  label: 'Or type new label',
                  child: TextField(
                    controller: labelCtrl,
                    decoration: _inputDec(context).copyWith(hintText: 'Eg: Goa Trip'),
                    onChanged: (v){ if (v.isNotEmpty) onLabelSelect(null); },
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              OutlinedButton.icon(
                onPressed: onPickBill,
                icon: Icon(Icons.attach_file_rounded, color: Theme.of(context).primaryColor),
                label: Text('Attach Bill', style: TextStyle(color: Theme.of(context).primaryColor, fontWeight: FontWeight.w700)),
                style: OutlinedButton.styleFrom(
                  side: BorderSide(color: Theme.of(context).primaryColor),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  backgroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                ),
              ),
              if (billFile != null) ...[
                const SizedBox(width: 12),
                Stack(
                  alignment: Alignment.topRight,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.file(billFile!, width: 60, height: 60, fit: BoxFit.cover),
                    ),
                    GestureDetector(
                      onTap: onClearBill,
                      child: Container(
                        margin: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          color: Colors.white, borderRadius: BorderRadius.circular(100),
                          boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 3)],
                        ),
                        child: const Icon(Icons.close_rounded, size: 18, color: Colors.red),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
          const SizedBox(height: 28),
          Row(
            children: [
              _GhostButton(text: 'Back', onPressed: onBack),
              const SizedBox(width: 12),
              Expanded(child: _PrimaryButton(text: 'Next', onPressed: onNext)),
            ],
          ),
        ],
      ),
    );
  }

  String _nameForP(List<String> participants, List<Map<String,String>> friends, String phone, {bool highlight=false}) {
    if (participants.isEmpty) return phone;
    if (phone == participants.first && false) {}
    if (phone == '') {}
    // name resolution
    if (phone == (friends.isNotEmpty ? '' : '')) {}
    if (phone == '') {}
    // Use simple resolver:
    if (phone == (friends.isEmpty ? '' : '')) {}
    if (phone == '') {}
    // Real resolver:
    if (phone == (participants.isEmpty ? '' : '')) {}
    if (phone == '') {}
    // Actually resolve
    if (phone == '') {}
    if (phone == (participants.isEmpty ? '' : '')) {}
    if (phone == '') {}
    // final
    final f = friends.firstWhere((x) => x['id'] == phone, orElse: () => {'name': phone});
    final isYou = false; // resolved by caller if needed
    final name = (phone == '')
        ? ''
        : (phone == '' ? '' : f['name'] ?? phone);
    // fallbacks:
    if (phone == '') return '';
    if (phone == '') return '';
    // Simpler:
    if (phone == participants.first && false) {}
    return phone == '' ? '' : (phone == '' ? '' : (phone == '' ? '' : (phone == '' ? '' : (phone == '' ? '' : (phone == '' ? '' : (phone == '' ? '' : (phone == '' ? '' : (phone == '' ? '' : (phone == '' ? '' : name)))))))));
  }

  String _initialsFor(String n) {
    final parts = n.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
    if (parts.isEmpty) return '👤';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return (parts[0].characters.first + parts[1].characters.first).toUpperCase();
  }
}

// ------------ STEP 3: Review ------------
class _StepReview extends StatelessWidget {
  final String type;
  final String category;
  final String amount;
  final String note;
  final String cardLast4;
  final String friendName;
  final String groupName;
  final String label;
  final File? billFile;
  final bool saving;
  final VoidCallback onBack;
  final VoidCallback onSave;

  const _StepReview({
    required this.type,
    required this.category,
    required this.amount,
    required this.note,
    required this.cardLast4,
    required this.friendName,
    required this.groupName,
    required this.label,
    required this.billFile,
    required this.saving,
    required this.onBack,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    final rows = <_KV>[
      _KV('Type', _typeLabel(type)),
      _KV('Amount', '₹ $amount'),
      _KV('Category', category),
      if (note.isNotEmpty) _KV('Note', note),
      if (cardLast4.isNotEmpty) _KV('Card Last 4', cardLast4),
      if (friendName.isNotEmpty) _KV('Split Friend', friendName),
      if (groupName.isNotEmpty) _KV('Split Group', groupName),
      if (label.isNotEmpty) _KV('Label', label),
    ];
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _H2('Review & Save'),
          const SizedBox(height: 12),
          _ReviewCard(rows: rows, billFile: billFile),
          const SizedBox(height: 28),
          Row(
            children: [
              _GhostButton(text: 'Back', onPressed: onBack),
              const SizedBox(width: 12),
              Expanded(
                child: _PrimaryButton(
                  text: 'Save Transaction',
                  onPressed: saving ? null : onSave,
                  loading: saving,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _typeLabel(String t) {
    if (t == 'debit') return 'Expense';
    if (t == 'credit') return 'Income';
    if (t == 'cc_spend') return 'Credit Card';
    if (t == 'cc_bill') return 'CC Bill';
    return t;
  }
}

// ------------ Shared Widgets ------------
class _StepperBar extends StatelessWidget {
  final int current;
  final int total;
  final List<String> labels;
  const _StepperBar({required this.current, required this.total, required this.labels});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: List.generate(total, (i) {
            final active = i <= current;
            return Expanded(
              child: Container(
                height: 6,
                margin: EdgeInsets.only(right: i == total - 1 ? 0 : 6),
                decoration: BoxDecoration(
                  color: active ? Theme.of(context).primaryColor : const Color(0x22000000),
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: labels.map((t) {
            final idx = labels.indexOf(t);
            final active = idx == current;
            return Expanded(
              child: Text(
                t,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: active ? Theme.of(context).primaryColor : Theme.of(context).textTheme.bodySmall?.color,
                  fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                  fontSize: 12,
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}

class _AmountField extends StatelessWidget {
  final TextEditingController controller;
  final bool enabled;
  const _AmountField({required this.controller, required this.enabled});

  @override
  Widget build(BuildContext context) {
    return _Box(
      child: TextField(
        controller: controller,
        enabled: enabled,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        style: TextStyle(
          fontSize: 24, fontWeight: FontWeight.w800, color: Theme.of(context).textTheme.bodyLarge?.color, letterSpacing: 0.3,
        ),
        decoration: InputDecoration(
          prefixText: '₹ ',
          prefixStyle: TextStyle(
              fontSize: 24, fontWeight: FontWeight.w800, color: Theme.of(context).textTheme.bodyLarge?.color),
          hintText: '0.00',
          hintStyle: TextStyle(fontSize: 24, color: Theme.of(context).textTheme.bodySmall?.color, fontWeight: FontWeight.w700),
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: Theme.of(context).dividerColor),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: Theme.of(context).primaryColor, width: 1.6),
          ),
        ),
      ),
    );
  }
}

class _TypeChips extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const _TypeChips({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final opts = <_ChipOpt>[
      _ChipOpt('debit', 'Expense', Icons.remove_circle),
      _ChipOpt('credit', 'Income', Icons.add_circle),
      _ChipOpt('cc_spend', 'Credit Card', Icons.credit_card),
    ];
    return Wrap(
      spacing: 8, runSpacing: 8,
      children: opts.map((o) {
        final sel = o.value == value;
        return ChoiceChip(
          selected: sel,
          onSelected: (_) => onChanged(o.value),
          label: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(o.icon, size: 18, color: sel ? Colors.white : Theme.of(context).textTheme.bodyLarge?.color?.withOpacity(0.75)),
              const SizedBox(width: 6),
              Text(o.label),
            ],
          ),
          labelStyle: TextStyle(
            color: sel ? Colors.white : Theme.of(context).textTheme.bodyLarge?.color?.withOpacity(0.9),
            fontWeight: FontWeight.w700,
          ),
          selectedColor: Theme.of(context).primaryColor,
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: sel ? Theme.of(context).primaryColor : Theme.of(context).dividerColor),
          ),
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        );
      }).toList(),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  final List<_KV> rows;
  final File? billFile;
  const _ReviewCard({required this.rows, required this.billFile});

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            ...rows.map((kv) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(kv.k,
                      style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color, fontWeight: FontWeight.w700),
                    ),
                  ),
                  Expanded(
                    child: Text(kv.v,
                      textAlign: TextAlign.right,
                      style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
            )),
            if (billFile != null) ...[
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.file(billFile!, height: 120, fit: BoxFit.cover),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _H2 extends StatelessWidget {
  final String t;
  const _H2(this.t);
  @override
  Widget build(BuildContext context) {
    return Text(
      t,
      style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.w800, fontSize: 16),
    );
  }
}

class _Box extends StatelessWidget {
  final Widget child;
  final String? label;
  const _Box({required this.child, this.label});

  @override
  Widget build(BuildContext context) {
    final box = Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Theme.of(context).dividerColor),
        boxShadow: const [BoxShadow(color: Color(0x0F000000), blurRadius: 10, offset: Offset(0,4))],
      ),
      child: child,
    );
    if (label == null) return box;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label!, style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.w700, fontSize: 13.5)),
        const SizedBox(height: 6),
        box,
      ],
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool loading;
  const _PrimaryButton({required this.text, required this.onPressed, this.loading=false});
  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: Theme.of(context).primaryColor,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        elevation: 2,
      ),
      child: loading
          ? const SizedBox(
        width: 22, height: 22,
        child: CircularProgressIndicator(
          strokeWidth: 2, valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
        ),
      )
          : Text(text, style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800)),
    );
  }
}

class _GhostButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  const _GhostButton({required this.text, required this.onPressed});
  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: Theme.of(context).dividerColor),
        foregroundColor: Theme.of(context).textTheme.bodyLarge?.color,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 18),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      child: Text(text, style: const TextStyle(fontWeight: FontWeight.w800)),
    );
  }
}

class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white, borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Theme.of(context).dividerColor, width: 1),
        boxShadow: const [BoxShadow(color: Color(0x12000000), blurRadius: 16, offset: Offset(0,8))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 3, sigmaY: 3), child: child),
      ),
    );
  }
}

class _ChipOpt {
  final String value; final String label; final IconData icon;
  const _ChipOpt(this.value, this.label, this.icon);
}

class _KV { final String k; final String v; const _KV(this.k, this.v); }

InputDecoration _inputDec(BuildContext context) {
  final base = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: Theme.of(context).dividerColor, width: 1),
  );
  return InputDecoration(
    filled: true, fillColor: Colors.white,
    hintStyle: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color),
    contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
    enabledBorder: base,
    focusedBorder: base.copyWith(borderSide: BorderSide(color: Theme.of(context).primaryColor, width: 1.4)),
  );
}

// -------- Inline Create Group Sheet --------
class _CreateGroupSheet extends StatefulWidget {
  final String userPhone;
  final List<Map<String,String>> friends;
  const _CreateGroupSheet({required this.userPhone, required this.friends, Key? key}) : super(key: key);

  @override
  State<_CreateGroupSheet> createState() => _CreateGroupSheetState();
}

class _CreateGroupSheetState extends State<_CreateGroupSheet> {
  final _nameCtrl = TextEditingController();
  final Set<String> _selected = {};
  bool _saving = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: pad),
      child: SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 42, height: 4,
                  decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 10),
              Text('Create Group', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Theme.of(context).textTheme.bodyLarge?.color)),
              const SizedBox(height: 12),
              TextField(
                controller: _nameCtrl,
                decoration: _inputDec(context).copyWith(labelText: 'Group name'),
              ),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: Text('Members', style: TextStyle(color: Colors.grey.shade800, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(height: 6),
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 260),
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: widget.friends.length,
                  itemBuilder: (_, i) {
                    final f = widget.friends[i];
                    final id = f['id']!;
                    final name = f['name']!;
                    final selected = _selected.contains(id);
                    return CheckboxListTile(
                      value: selected,
                      onChanged: (v){
                        setState(() {
                          if (v == true) { _selected.add(id); } else { _selected.remove(id); }
                        });
                      },
                      dense: true,
                      title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
                    );
                  },
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                  const Spacer(),
                  ElevatedButton.icon(
                    onPressed: _saving ? null : () async {
                      final name = _nameCtrl.text.trim();
                      if (name.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter group name')));
                        return;
                      }
                      if (_selected.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pick at least 1 member')));
                        return;
                      }
                      Navigator.pop(context, _CreateGroupResult(name: name, memberPhones: _selected.toList()));
                    },
                    icon: const Icon(Icons.check_rounded),
                    label: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Create'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Theme.of(context).primaryColor, foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CreateGroupResult {
  final String name;
  final List<String> memberPhones;
  _CreateGroupResult({required this.name, required this.memberPhones});
}

class _GroupLite {
  final String id;
  final String name;
  final List<String> memberPhones;
  const _GroupLite({required this.id, required this.name, required this.memberPhones});
  static _GroupLite empty() => const _GroupLite(id: '', name: '', memberPhones: []);
}
