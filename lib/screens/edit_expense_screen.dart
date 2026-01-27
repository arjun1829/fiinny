import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../services/friend_service.dart';
import '../services/group_service.dart';
import '../services/expense_service.dart';

import '../widgets/add_friend_dialog.dart';
import '../widgets/add_group_dialog.dart';
import '../widgets/people_selector_step.dart';
import '../constants/expense_categories.dart';

const Color kBg = Color(0xFFF8FAF9);
const Color kPrimary = Color(0xFF09857a);
const Color kText = Color(0xFF0F1E1C);
const Color kSubtle = Color(0xFF9AA5A1);
const Color kLine = Color(0x14000000);

class EditExpenseScreen extends StatefulWidget {
  final String userPhone;
  final ExpenseItem expense;
  final int initialStep;

  // Maintaining compatibility with callers that might use named args or positional (though existing was named)
  const EditExpenseScreen({
    required this.userPhone,
    required this.expense,
    this.initialStep = 0,
    super.key,
  });

  @override
  State<EditExpenseScreen> createState() => _EditExpenseScreenState();
}

class _EditExpenseScreenState extends State<EditExpenseScreen> {
  // Controllers
  late TextEditingController _amountCtrl;
  late TextEditingController _counterpartyCtrl;
  late TextEditingController _noteCtrl;

  late DateTime _date;
  late String _category;
  late String? _selectedPayerPhone;
  late List<String> _selectedFriendPhones;
  String? _selectedGroupId;

  List<String> _cachedFriendSelection = [];

  // Friends
  List<FriendModel> _friends = [];
  List<GroupModel> _groups = [];

  // Shared category options used across add/edit flows
  // Shared category options used across add/edit flows
  final List<String> _categories = kExpenseSubcategories.keys.toList();
  String? _subcategory;
  List<String> _subcategories = [];

  // Labels
  final List<String> _labels = [
    "Goa Trip",
    "Birthday",
    "Office",
    "Emergency",
    "Rent"
  ];
  String? _selectedLabel;
  final List<String> steps = const ["Basics", "People", "Review"];

  // New fields for wizard
  late PageController _pg;
  int _step = 0;
  String _bankRefText = '';
  bool _showBankReference = false;
  late TextEditingController _labelCtrl;
  late TextEditingController _customCategoryCtrl;
  String _customCategory = '';
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final requestedStep = widget.initialStep;
    if (requestedStep <= 0) {
      _step = 0;
    } else if (requestedStep >= 2) {
      _step = 2;
    } else {
      _step = requestedStep;
    }
    _pg = PageController(initialPage: _step);
    _amountCtrl =
        TextEditingController(text: widget.expense.amount.toStringAsFixed(2));
    final originalNote = widget.expense.note;
    final existingComments = widget.expense.comments ?? '';
    final looksStructured = _looksLikeBankReference(originalNote);
    _bankRefText = originalNote;
    _showBankReference = looksStructured && originalNote.trim().isNotEmpty;
    final initialPersonalNote = existingComments.isNotEmpty
        ? existingComments
        : (looksStructured ? '' : originalNote);
    _noteCtrl = TextEditingController(text: initialPersonalNote);
    _counterpartyCtrl =
        TextEditingController(text: widget.expense.counterparty ?? '');
    _labelCtrl = TextEditingController(text: widget.expense.label ?? "");
    _customCategoryCtrl = TextEditingController(text: _customCategory);
    _date = widget.expense.date;
    _category = widget.expense.type;
    if (!_categories.contains(_category) && _category.trim().isNotEmpty) {
      if (_category == 'Other' && _categories.contains('Others')) {
        _category = 'Others';
      } else {
        _customCategory = _category;
        _category = 'Others';
      }
    }
    if (!_categories.contains(_category)) {
      _category = _categories.isNotEmpty ? _categories.first : 'Others';
    }
    _subcategory = (widget.expense.subcategory ?? '').isNotEmpty
        ? widget.expense.subcategory
        : widget.expense.subtype;
    if (_category.isNotEmpty && _category != 'Other') {
      _subcategories = kExpenseSubcategories[_category] ?? [];
    }
    _selectedPayerPhone = widget.expense.payerId;
    _selectedGroupId = widget.expense.groupId;

    // Logic Fix: Ensure we don't lose the friend if we swap payer to "You"
    // The previous logic only loaded `friendIds`. If the friend paid, they are the payer,
    // and might NOT be in `friendIds` (depending on how backend stores it).
    // Safest is to combine friendIds + payerId (excluding self) to get all participants.
    final allParticipants = <String>{...widget.expense.friendIds};
    if (widget.expense.payerId != widget.userPhone) {
      allParticipants.add(widget.expense.payerId);
    }
    _selectedFriendPhones = allParticipants.toList();

    _cachedFriendSelection = List<String>.from(_selectedFriendPhones);

    // Init labels: bring existing label to dropdown list if not present
    if ((widget.expense.label ?? '').isNotEmpty &&
        !_labels.contains(widget.expense.label)) {
      _labels.insert(0, widget.expense.label!);
      _selectedLabel = widget.expense.label!;
    }

    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    await Future.wait([
      _reloadFriends(),
      _reloadGroups(),
    ]);
    if (!mounted) return;
    setState(() => _loading = false);
  }

  Future<void> _reloadFriends({bool autoSelectNew = false}) async {
    final previous = _friends.map((f) => f.phone).toSet();
    List<FriendModel> friends = [];
    try {
      friends = await FriendService().streamFriends(widget.userPhone).first;
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _friends = friends;
      final available = friends.map((f) => f.phone).toSet();
      _selectedFriendPhones.retainWhere((phone) => available.contains(phone));
      if (autoSelectNew) {
        final next = friends.map((f) => f.phone).toSet();
        final newlyAdded = next.difference(previous);
        if (newlyAdded.isNotEmpty) {
          final phone =
              newlyAdded.firstWhere((p) => p.isNotEmpty, orElse: () => '');
          if (phone.isNotEmpty) {
            if ((_selectedGroupId ?? '').isNotEmpty) {
              if (!_cachedFriendSelection.contains(phone)) {
                _cachedFriendSelection =
                    List<String>.from(_cachedFriendSelection)..add(phone);
              }
            } else {
              if (!_selectedFriendPhones.contains(phone)) {
                _selectedFriendPhones.add(phone);
              }
              _cachedFriendSelection = List<String>.from(_selectedFriendPhones);
            }
          }
        }
      }
      if ((_selectedGroupId ?? '').isEmpty) {
        _cachedFriendSelection = List<String>.from(_selectedFriendPhones);
      }
    });
  }

  Future<void> _reloadGroups({bool autoSelectNew = false}) async {
    final previousIds = _groups.map((g) => g.id).toSet();
    List<GroupModel> groups = [];
    try {
      groups = await GroupService().fetchUserGroups(widget.userPhone);
    } catch (_) {}
    if (!mounted) return;

    String? newSelection;
    if (autoSelectNew) {
      final nextIds = groups.map((g) => g.id).toSet();
      final diff = nextIds.difference(previousIds);
      if (diff.isNotEmpty) {
        final candidate =
            diff.firstWhere((id) => id.isNotEmpty, orElse: () => '');
        if (candidate.isNotEmpty) {
          newSelection = candidate;
        }
      }
    }

    setState(() {
      _groups = groups;
      if (_selectedGroupId != null && _selectedGroupId!.isNotEmpty) {
        final stillExists = groups.any((g) => g.id == _selectedGroupId);
        if (!stillExists) {
          _selectedGroupId = null;
        }
      }
    });

    if (newSelection != null && mounted) {
      _onGroupChanged(newSelection);
    }
  }

  Future<void> _openAddFriend() async {
    FocusScope.of(context).unfocus();
    final base = Theme.of(context);
    final blacky = base.copyWith(
      colorScheme: base.colorScheme.copyWith(
        primary: kText,
        secondary: kText,
        surface: Colors.white,
      ),
      textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(foregroundColor: kText)),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: kText,
          foregroundColor: Colors.white,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      checkboxTheme: const CheckboxThemeData(
        fillColor: WidgetStatePropertyAll(kText),
        checkColor: WidgetStatePropertyAll(Colors.white),
      ),
      radioTheme: const RadioThemeData(
        fillColor: WidgetStatePropertyAll(kText),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((_) => kText),
        trackColor: WidgetStateProperty.resolveWith(
            (_) => kText.withValues(alpha: 0.25)),
      ),
    );

    final added = await showDialog<bool>(
      context: context,
      builder: (_) => Theme(
        data: blacky,
        child: AddFriendDialog(userPhone: widget.userPhone),
      ),
    );

    if (added == true) {
      await _reloadFriends(autoSelectNew: true);
    }
  }

  Future<void> _openCreateGroup() async {
    FocusScope.of(context).unfocus();
    final base = Theme.of(context);
    final blacky = base.copyWith(
      colorScheme: base.colorScheme.copyWith(
        primary: kText,
        secondary: kText,
        surface: Colors.white,
      ),
      textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(foregroundColor: kText)),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: kText,
          foregroundColor: Colors.white,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      checkboxTheme: const CheckboxThemeData(
        fillColor: WidgetStatePropertyAll(kText),
        checkColor: WidgetStatePropertyAll(Colors.white),
      ),
      radioTheme: const RadioThemeData(
        fillColor: WidgetStatePropertyAll(kText),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((_) => kText),
        trackColor: WidgetStateProperty.resolveWith(
            (_) => kText.withValues(alpha: 0.25)),
      ),
    );

    final created = await showDialog<bool>(
      context: context,
      builder: (_) => Theme(
        data: blacky,
        child: AddGroupDialog(
          userPhone: widget.userPhone,
          allFriends: _friends,
        ),
      ),
    );

    if (created == true) {
      await _reloadGroups(autoSelectNew: true);
    }
  }

  void _onGroupChanged(String? value) {
    setState(() {
      final normalized = (value == null || value.isEmpty) ? null : value;
      final wasGroup = (_selectedGroupId ?? '').isNotEmpty;
      _selectedGroupId = normalized;
      final nowGroup = (_selectedGroupId ?? '').isNotEmpty;
      if (nowGroup) {
        _cachedFriendSelection = List<String>.from(_selectedFriendPhones);
        _selectedFriendPhones.clear();
      } else if (wasGroup &&
          _selectedFriendPhones.isEmpty &&
          _cachedFriendSelection.isNotEmpty) {
        _selectedFriendPhones = List<String>.from(_cachedFriendSelection);
        _cachedFriendSelection = List<String>.from(_selectedFriendPhones);
      }
    });
  }

  String _groupNameForId(String? groupId) {
    if (groupId == null || groupId.isEmpty) return '';
    for (final g in _groups) {
      if (g.id == groupId) return g.name;
    }
    return '';
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _counterpartyCtrl.dispose();
    _noteCtrl.dispose();
    _labelCtrl.dispose();
    _customCategoryCtrl.dispose();
    _pg.dispose();
    super.dispose();
  }

  // ---------- Validation ----------
  bool _validStep0() {
    final amt = double.tryParse(_amountCtrl.text.trim());
    if (amt == null || amt <= 0) {
      _toast('Enter a valid amount');
      return false;
    }
    if (_category.isEmpty) {
      _toast('Please select a category');
      return false;
    }
    if (_category == 'Other' && _customCategory.trim().isEmpty) {
      _toast('Enter a category name');
      return false;
    }
    return true;
  }

  bool _validStep1() {
    if (_selectedPayerPhone == null || _selectedPayerPhone!.isEmpty) {
      _toast('Please select who paid');
      return false;
    }
    return true;
  }

  // ---------- Save ----------
  Future<void> _save() async {
    // 1. Final Validation Check with Feedback
    if (!_validStep0()) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Please check Amount and Category'),
          backgroundColor: Colors.red));
      return;
    }
    if (!_validStep1()) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Please select a Payer'), backgroundColor: Colors.red));
      return;
    }

    // 2. Logic to Prepare Data
    // Label priority: typed > selected
    final manualLabel = _labelCtrl.text.trim();
    final label = manualLabel.isNotEmpty ? manualLabel : _selectedLabel;

    // Add new label to local list if needed
    if (label != null && label.isNotEmpty && !_labels.contains(label)) {
      _labels.insert(0, label);
    }

    // 3. Start Saving (Show Loading)
    setState(() => _saving = true);

    // Capture context-dependent services before async gap
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    try {
      // Prepare Friends/Group IDs
      final normalizedFriends = _selectedFriendPhones
          .where(
              (phone) => phone.trim().isNotEmpty && phone != widget.userPhone)
          .toSet()
          .toList();

      final groupId =
          (_selectedGroupId ?? '').isNotEmpty ? _selectedGroupId : null;
      final friendIds = groupId != null ? <String>[] : normalizedFriends;

      // Preserve settled status if valid
      final settledFriends = groupId != null
          ? widget.expense.settledFriendIds
          : widget.expense.settledFriendIds
              .where((id) => normalizedFriends.contains(id))
              .toList();

      // Handle Category/Note
      final effectiveCategory =
          (_category == 'Other' && _customCategory.trim().isNotEmpty)
              ? _customCategory.trim()
              : _category;

      final personalNote = _noteCtrl.text.trim();
      final bankNote = _bankRefText.trim();
      final combinedNote = [
        if (personalNote.isNotEmpty) personalNote,
        if (bankNote.isNotEmpty) bankNote,
      ].join('\n\n');

      // Create Updated Object
      final updated = ExpenseItem(
        id: widget.expense.id,
        type: effectiveCategory,
        subtype: _subcategory,
        amount: double.parse(_amountCtrl.text.trim()),
        note: combinedNote,
        date: _date,
        friendIds: friendIds,
        payerId: _selectedPayerPhone!,
        groupId: groupId,
        counterparty: _counterpartyCtrl.text.trim().isNotEmpty
            ? _counterpartyCtrl.text.trim()
            : null,
        settledFriendIds: settledFriends,
        customSplits: widget.expense.customSplits,
        label: label,
        comments: personalNote.isNotEmpty ? personalNote : null,
        createdAt: widget.expense.createdAt,
        createdBy: widget.expense.createdBy,
        updatedAt: DateTime.now(),
        updatedBy: 'user',
      );

      // 4. Call Service
      await ExpenseService().updateExpense(widget.userPhone, updated);

      // 5. Success
      messenger.showSnackBar(const SnackBar(
          content: Text('Expense updated successfully!'),
          backgroundColor: Colors.green));
      navigator.pop(true);
    } catch (e) {
      // 6. Error Handling
      messenger.showSnackBar(SnackBar(
          content: Text('Update failed: $e'), backgroundColor: Colors.red));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toast(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  bool _looksLikeBankReference(String note) {
    final raw = note.trim();
    if (raw.isEmpty) return false;
    final lower = raw.toLowerCase();
    final hasCue = RegExp(
      r'(txn|transaction|utr|reference|ref\.? ?no|a/c|account|upi|imps|neft|card|xxxx|debited|credited|amount|rs\.?|inr)',
    ).hasMatch(lower);
    final hasDigits = RegExp(r'\d{4,}').hasMatch(lower);
    return hasCue && hasDigits;
  }

  // ---------- Navigation ----------
  void _next() {
    FocusScope.of(context).unfocus(); // Hide keyboard

    // Validate Step 0 (Basics)
    if (_step == 0) {
      if (!_validStep0()) return; // Stop if amount/category is invalid
    }

    // Validate Step 1 (People)
    if (_step == 1) {
      if (!_validStep1()) return; // Stop if payer is missing
    }

    if (_step < 2) {
      setState(() => _step++);
      _pg.animateToPage(_step,
          duration: const Duration(milliseconds: 250), curve: Curves.easeInOut);
    } else {
      // We are on the last step, try to Save
      _save();
    }
  }

  void _back() {
    FocusScope.of(context).unfocus();
    if (_step > 0) {
      setState(() => _step -= 1);
      _pg.animateToPage(_step,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic);
    } else {
      Navigator.pop(context);
    }
  }

  // ---------- Helpers ----------
  String _nameForPhone(String phone) {
    if (phone == widget.userPhone) return "You";
    final f = _friends.where((x) => x.phone == phone).toList();
    return f.isNotEmpty ? f.first.name : phone;
  }

  @override
  Widget build(BuildContext context) {
    // Theme Colors for this screen
    const kPrimary = Color(0xFF6C63FF);

    return Scaffold(
      backgroundColor: Colors.white, // White Background
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: BackButton(
            color: Colors.black,
            onPressed: () {
              if (_step > 0) {
                setState(() => _step--);
                _pg.animateToPage(_step,
                    duration: const Duration(milliseconds: 250),
                    curve: Curves.easeInOut);
              } else {
                Navigator.pop(context);
              }
            }),
        title: const Text("Edit Expense",
            style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
        centerTitle: true,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Gradient Progress Bar
                Container(
                  height: 4,
                  margin:
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(2),
                    gradient: LinearGradient(
                      colors: [Colors.purpleAccent, Colors.tealAccent.shade400],
                      stops: [(_step + 1) / 3, (_step + 1) / 3],
                    ),
                  ),
                ),

                Expanded(
                  child: PageView(
                    controller: _pg,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      // STEP 0: BASICS (Updated UI)
                      _StepBasics(
                        amountCtrl: _amountCtrl,
                        category: _category,
                        categories: _categories,
                        subcategory: _subcategory,
                        subcategories: _subcategories,
                        onCategory: (v) => setState(() {
                          _category = v;
                          _subcategories = kExpenseSubcategories[v] ?? [];
                          _subcategory = _subcategories.firstOrNull;
                          if (v != 'Other') {
                            _customCategory = '';
                            _customCategoryCtrl.clear();
                          }
                        }),
                        onSubcategory: (v) => setState(() => _subcategory = v),
                        date: _date,
                        onPickDate: () async {
                          final d = await showDatePicker(
                              context: context,
                              initialDate: _date,
                              firstDate: DateTime(2000),
                              lastDate: DateTime(2100));
                          if (d != null) setState(() => _date = d);
                        },
                        noteCtrl: _noteCtrl,
                        counterpartyCtrl: _counterpartyCtrl,
                        onNext: _next,
                        saving: _saving,
                        bankRefText: _bankRefText,
                        showBankReference: _showBankReference,
                        customCategoryCtrl: _customCategoryCtrl,
                        onCustomCategoryChanged: (v) =>
                            setState(() => _customCategory = v),
                        isActive: _step == 0,
                      ),

                      // STEP 1: PEOPLE (Existing Logic)
                      PeopleSelectorStep(
                        userPhone: widget.userPhone,
                        payerPhone: _selectedPayerPhone,
                        onPayer: (v) => setState(() => _selectedPayerPhone = v),
                        friends: _friends,
                        selectedFriends: _selectedFriendPhones,
                        onToggleFriend: (phone, isSel) {
                          setState(() {
                            if (isSel) {
                              if (!_selectedFriendPhones.contains(phone)) {
                                _selectedFriendPhones.add(phone);
                              }
                            } else {
                              _selectedFriendPhones.remove(phone);
                            }
                          });
                        },
                        groups: _groups,
                        selectedGroupId: _selectedGroupId,
                        onGroup: (value) => _onGroupChanged(value),
                        onAddFriend: _openAddFriend,
                        onCreateGroup: _openCreateGroup,
                        noteCtrl: _noteCtrl,
                        isActive: _step == 1,
                        labels: _labels,
                        selectedLabel: _selectedLabel,
                        onLabelSelect: (v) => setState(() {
                          _selectedLabel = v;
                          if (v != null) _labelCtrl.clear();
                        }),
                        labelCtrl: _labelCtrl,
                        onNext: _next,
                        onBack: _back,
                        saving: _saving,
                        showButtons: false,
                      ),

                      // STEP 2: REVIEW (Existing Logic)
                      _StepReview(
                        amount: _amountCtrl.text.trim(),
                        category: (_category == 'Other' &&
                                _customCategory.trim().isNotEmpty)
                            ? _customCategory.trim()
                            : _category,
                        date: _date,
                        personalNote: _noteCtrl.text.trim(),
                        bankRef: _showBankReference ? _bankRefText.trim() : '',
                        payerName: _selectedPayerPhone != null
                            ? _nameForPhone(_selectedPayerPhone!)
                            : '',
                        splitNames: (_selectedGroupId ?? '').isNotEmpty
                            ? const []
                            : _selectedFriendPhones.map(_nameForPhone).toList(),
                        label: _labelCtrl.text.trim().isNotEmpty
                            ? _labelCtrl.text.trim()
                            : (_selectedLabel ?? ''),
                        groupName: _groupNameForId(_selectedGroupId),
                        onBack: _back,
                        onSave: _save,
                        saving: _saving,
                      ),
                    ],
                  ),
                ),
              ],
            ),

      floatingActionButton: FloatingActionButton.extended(
        onPressed: _saving ? null : _next,
        backgroundColor: kPrimary,
        label: Text(_step == 2 ? "Save" : "Next",
            style: const TextStyle(fontWeight: FontWeight.bold)),
        icon: Icon(_step == 2 ? Icons.check : Icons.navigate_next),
      ),
    );
  }
}

/// --------------------- STEP 0: Basics ---------------------

class _StepBasics extends StatelessWidget {
  // (Keep all original final fields exactly same to match arguments)
  final TextEditingController amountCtrl;
  final String category;
  final List<String> categories;
  final String? subcategory;
  final List<String> subcategories;
  final ValueChanged<String> onCategory;
  final ValueChanged<String> onSubcategory;
  final DateTime date;
  final VoidCallback onPickDate;
  final TextEditingController noteCtrl;
  final TextEditingController counterpartyCtrl;
  final VoidCallback onNext;
  final bool saving;
  final String bankRefText;
  final bool showBankReference;
  final TextEditingController customCategoryCtrl;
  final ValueChanged<String> onCustomCategoryChanged;
  final bool isActive;

  const _StepBasics({
    required this.amountCtrl,
    required this.category,
    required this.categories,
    required this.onCategory,
    required this.date,
    required this.onPickDate,
    required this.noteCtrl,
    required this.counterpartyCtrl,
    required this.onNext,
    required this.saving,
    required this.bankRefText,
    required this.showBankReference,
    required this.customCategoryCtrl,
    required this.onCustomCategoryChanged,
    required this.isActive,
    required this.subcategory,
    required this.subcategories,
    required this.onSubcategory,
  });

  // Helper for Icons
  IconData _getIcon(String cat) {
    switch (cat) {
      case 'Food & Drink':
        return Icons.fastfood_rounded;
      case 'Shopping':
        return Icons.shopping_bag_rounded;
      case 'Housing':
        return Icons.home_rounded;
      case 'Transportation':
        return Icons.directions_bus_rounded;
      case 'Vehicle':
        return Icons.directions_car_rounded;
      case 'Entertainment':
        return Icons.movie_filter_rounded;
      case 'Health & Personal':
        return Icons.medical_services_rounded;
      case 'Education':
        return Icons.school_rounded;
      case 'Bills & Utilities':
        return Icons.receipt_long_rounded;
      case 'Investments':
        return Icons.trending_up_rounded;
      case 'Taxes & Fees':
        return Icons.account_balance_rounded;
      case 'Travel':
        return Icons.flight_takeoff_rounded;
      case 'General':
        return Icons.category_rounded;
      default:
        return Icons.category_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    const kPrimary = Color(0xFF6C63FF);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text("Edit details",
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              Text("1/3",
                  style: TextStyle(
                      color: Colors.grey[400], fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 24),

          const Text("Amount & Category",
              style: TextStyle(
                  fontWeight: FontWeight.w600, color: Colors.black87)),
          const SizedBox(height: 16),

          // 1. Outline Amount Field
          TextField(
            controller: amountCtrl,
            enabled: !saving,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.currency_rupee_rounded,
                  size: 20, color: Colors.black54),
              hintText: "Amount",
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFE0E0E0))),
              enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFE0E0E0))),
              focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: kPrimary)),
            ),
          ),
          const SizedBox(height: 16),

          // 2. Category Dropdown (Visual)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            decoration: BoxDecoration(
              border: Border.all(color: const Color(0xFFE0E0E0)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(_getIcon(category), size: 20, color: Colors.black87),
                const SizedBox(width: 12),
                Text(category,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w500)),
                const Spacer(),
                const Icon(Icons.arrow_drop_down, color: Colors.black54),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // 3. Category Chips
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: categories.map((cat) {
              final isSelected = category == cat;
              // Define the Purple color
              const kPrimary = Color(0xFF6C63FF);

              return ChoiceChip(
                showCheckmark: false,
                label: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _getIcon(cat),
                      size: 18,
                      color: isSelected ? Colors.white : Colors.black87,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      cat,
                      style: TextStyle(
                        color: isSelected ? Colors.white : Colors.black87,
                        fontWeight:
                            isSelected ? FontWeight.w600 : FontWeight.normal,
                      ),
                    ),
                  ],
                ),
                selected: isSelected,
                onSelected: saving
                    ? null
                    : (val) {
                        if (val) onCategory(cat);
                      },
                // CHANGE: Use Purple instead of Black
                selectedColor: kPrimary,
                backgroundColor: Colors.white,
                shape: StadiumBorder(
                    side: BorderSide(color: Colors.grey.shade300)),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              );
            }).toList(),
          ),

          // 4. Subcategories & Extra Fields (Preserved functionality)
          if (subcategories.isNotEmpty) ...[
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: subcategory,
              items: subcategories
                  .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                  .toList(),
              onChanged: saving
                  ? null
                  : (v) {
                      if (v != null) onSubcategory(v);
                    },
              decoration: InputDecoration(
                labelText: "Subcategory",
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],

          if (category == 'Other') ...[
            const SizedBox(height: 16),
            TextField(
              controller: customCategoryCtrl,
              enabled: !saving,
              decoration: InputDecoration(
                labelText: "Custom Category Name",
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onChanged: onCustomCategoryChanged,
            )
          ],

          const SizedBox(height: 20),
          // Date Picker Row
          InkWell(
            onTap: onPickDate,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  const Icon(Icons.calendar_today_rounded,
                      size: 20, color: kPrimary),
                  const SizedBox(width: 12),
                  Text("${date.toLocal()}".split(' ')[0],
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const Spacer(),
                  const Text("Change",
                      style: TextStyle(
                          color: kPrimary, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ),

          // Note Field
          const SizedBox(height: 16),
          TextField(
            controller: noteCtrl,
            enabled: !saving,
            decoration: InputDecoration(
              labelText: "Note (Optional)",
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ],
      ),
    );
  }
}

/// --------------------- STEP 2: Review ---------------------
class _StepReview extends StatelessWidget {
  final String amount;
  final String category;
  final DateTime date;
  final String personalNote;
  final String bankRef;
  final String payerName;
  final List<String> splitNames;
  final String label;
  final String groupName;
  final VoidCallback onBack;
  final VoidCallback onSave;
  final bool saving;

  const _StepReview({
    required this.amount,
    required this.category,
    required this.date,
    required this.personalNote,
    required this.bankRef,
    required this.payerName,
    required this.splitNames,
    required this.label,
    required this.groupName,
    required this.onBack,
    required this.onSave,
    required this.saving,
  });

  @override
  Widget build(BuildContext context) {
    final rows = <_KV>[
      _KV('Amount', '₹ $amount'),
      _KV('Category', category),
      _KV('Date', "${date.toLocal()}".split(' ')[0]),
      if (personalNote.isNotEmpty) _KV('Your note', personalNote),
      if (payerName.isNotEmpty) _KV('Payer', payerName),
      if (groupName.isNotEmpty) _KV('Group', groupName),
      if (splitNames.isNotEmpty)
        _KV('Split With', splitNames.join(', '))
      else if (groupName.isEmpty)
        const _KV('Split With', '—'),
      if (label.isNotEmpty) _KV('Label', label),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _H2('Review & Save'),
          const SizedBox(height: 12),
          _ReviewCard(rows: rows),
          if (bankRef.isNotEmpty) ...[
            const SizedBox(height: 12),
            _GlassCard(
              child: Theme(
                data: Theme.of(context)
                    .copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  title: const Text('Bank reference',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                      child: SelectableText(bankRef),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// --------------------- Shared UI ---------------------

class _H2 extends StatelessWidget {
  final String t;
  const _H2(this.t);
  @override
  Widget build(BuildContext context) {
    return Text(
      t,
      style: const TextStyle(
          color: kText, fontWeight: FontWeight.w800, fontSize: 16),
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: kLine, width: 1),
        boxShadow: const [
          BoxShadow(
              color: Color(0x12000000), blurRadius: 16, offset: Offset(0, 8))
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 3, sigmaY: 3), child: child),
      ),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  final List<_KV> rows;
  const _ReviewCard({required this.rows});

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: rows
              .map((_KV kv) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            kv.k,
                            style: const TextStyle(
                                color: kSubtle, fontWeight: FontWeight.w700),
                          ),
                        ),
                        Expanded(
                          child: Text(
                            kv.v,
                            textAlign: TextAlign.right,
                            style: const TextStyle(
                                color: kText, fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                  ))
              .toList(),
        ),
      ),
    );
  }
}

class _KV {
  final String k;
  final String v;
  const _KV(this.k, this.v);
}
