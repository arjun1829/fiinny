// lib/screens/edit_expense_screen.dart
import 'dart:ui';

import 'package:flutter/material.dart';

import '../constants/expense_categories.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';
import '../services/friend_service.dart';
import '../services/group_service.dart';
import '../widgets/add_friend_dialog.dart';
import '../widgets/add_group_dialog.dart';
import '../widgets/people_selector_step.dart';

/// Shared palette (matches add screens)
const Color kBg = Color(0xFFF8FAF9);
const Color kPrimary = Color(0xFF09857a);
const Color kText = Color(0xFF0F1E1C);
const Color kSubtle = Color(0xFF9AA5A1);
const Color kLine = Color(0x14000000);

class EditExpenseScreen extends StatefulWidget {
  final String userPhone;
  final ExpenseItem expense;
  final int initialStep;

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
  late final PageController _pg;
  int _step = 0;
  bool _loading = true;
  bool _saving = false;

  // Controllers / fields
  late TextEditingController _amountCtrl;
  late TextEditingController _noteCtrl; // personal note (maps to comments)
  late TextEditingController _counterpartyCtrl;
  late TextEditingController _labelCtrl;
  late TextEditingController _customCategoryCtrl;
  String _bankRefText = '';
  bool _showBankReference = false;
  String _customCategory = '';

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
    _pg.dispose();
    _amountCtrl.dispose();
    _noteCtrl.dispose();
    _counterpartyCtrl.dispose();
    _labelCtrl.dispose();
    _customCategoryCtrl.dispose();
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
    if (!_validStep0() || !_validStep1()) return;

    // Label priority: typed > selected
    final manualLabel = _labelCtrl.text.trim();
    final label = manualLabel.isNotEmpty ? manualLabel : _selectedLabel;

    if (label != null && !_labels.contains(label)) {
      _labels.insert(0, label);
    }

    setState(() => _saving = true);
    try {
      final normalizedFriends = _selectedFriendPhones
          .where(
              (phone) => phone.trim().isNotEmpty && phone != widget.userPhone)
          .toSet()
          .toList();
      final groupId =
          (_selectedGroupId ?? '').isNotEmpty ? _selectedGroupId : null;
      final friendIds = groupId != null ? <String>[] : normalizedFriends;
      final settledFriends = groupId != null
          ? widget.expense.settledFriendIds
          : widget.expense.settledFriendIds
              .where((id) => normalizedFriends.contains(id))
              .toList();

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

      final updated = ExpenseItem(
        id: widget.expense.id,
        type: effectiveCategory,
        subtype: _subcategory, // Add subtype
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
        // Audit preservation & update
        createdAt: widget.expense.createdAt,
        createdBy: widget.expense.createdBy,
        updatedAt: DateTime.now(),
        updatedBy: 'user',
      );
      await ExpenseService().updateExpense(widget.userPhone, updated);
      if (!mounted) return;
      _toast('Expense updated');
      Navigator.of(context).pop(true);
    } catch (e) {
      _toast('Update failed: $e');
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
    FocusScope.of(context).unfocus();
    if (_step == 0 && !_validStep0()) return;
    if (_step == 1 && !_validStep1()) return;
    if (_step < 2) {
      setState(() => _step += 1);
      _pg.animateToPage(_step,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic);
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
    final steps = ['Basics', 'People', 'Review'];
    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: kBg,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: kText),
          onPressed: _back,
        ),
        centerTitle: true,
        title: const Text('Edit Expense',
            style: TextStyle(color: kText, fontWeight: FontWeight.w700)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
                    child: _StepperBar(
                        current: _step, total: steps.length, labels: steps),
                  ),
                  Expanded(
                    child: PageView(
                      controller: _pg,
                      physics: const NeverScrollableScrollPhysics(),
                      children: [
                        _StepBasics(
                          amountCtrl: _amountCtrl,
                          category: _category,
                          categories: _categories,
                          subcategory: _subcategory,
                          subcategories: _subcategories,
                          onSubcategory: (v) =>
                              setState(() => _subcategory = v),
                          onCategory: (v) => setState(() {
                            _category = v;
                            _subcategories = kExpenseSubcategories[v] ?? [];
                            _subcategory = _subcategories.isNotEmpty
                                ? _subcategories.first
                                : null;
                            if (v != 'Other') {
                              _customCategory = '';
                              _customCategoryCtrl.clear();
                            }
                          }),
                          date: _date,
                          onPickDate: () async {
                            final d = await showDatePicker(
                              context: context,
                              initialDate: _date,
                              firstDate: DateTime(2000),
                              lastDate: DateTime(2100),
                            );
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
                        PeopleSelectorStep(
                          userPhone: widget.userPhone,
                          payerPhone: _selectedPayerPhone,
                          onPayer: (v) =>
                              setState(() => _selectedPayerPhone = v),
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
                              if ((_selectedGroupId ?? '').isEmpty) {
                                _cachedFriendSelection =
                                    List<String>.from(_selectedFriendPhones);
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
                            if (v != null) {
                              _labelCtrl.clear();
                            }
                          }),
                          labelCtrl: _labelCtrl,
                          onNext: _next,
                          onBack: _back,
                          saving: _saving,
                        ),
                        _StepReview(
                          amount: _amountCtrl.text.trim(),
                          category: (_category == 'Other' &&
                                  _customCategory.trim().isNotEmpty)
                              ? _customCategory.trim()
                              : _category,
                          date: _date,
                          personalNote: _noteCtrl.text.trim(),
                          bankRef:
                              _showBankReference ? _bankRefText.trim() : '',
                          payerName: _selectedPayerPhone != null
                              ? _nameForPhone(_selectedPayerPhone!)
                              : '',
                          splitNames: (_selectedGroupId ?? '').isNotEmpty
                              ? const []
                              : _selectedFriendPhones
                                  .map(_nameForPhone)
                                  .toList(),
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
            ),
    );
  }
}

/// --------------------- STEP 0: Basics ---------------------
class _CatMeta {
  final IconData icon;
  final Color color;
  const _CatMeta(this.icon, this.color);
}

const Map<String, _CatMeta> _kCatMeta = {
  'General': _CatMeta(Icons.category_rounded, Color(0xFF0F766E)),
  'Food': _CatMeta(Icons.restaurant_rounded, Color(0xFFEA580C)),
  'Groceries': _CatMeta(Icons.local_grocery_store_rounded, Color(0xFF16A34A)),
  'Travel': _CatMeta(Icons.flight_takeoff_rounded, Color(0xFF2563EB)),
  'Shopping': _CatMeta(Icons.shopping_bag_rounded, Color(0xFF7C3AED)),
  'Bills': _CatMeta(Icons.receipt_long_rounded, Color(0xFF374151)),
  'Entertainment': _CatMeta(Icons.movie_filter_rounded, Color(0xFFDB2777)),
  'Health': _CatMeta(Icons.medical_services_rounded, Color(0xFF059669)),
  'Fuel': _CatMeta(Icons.local_gas_station_rounded, Color(0xFFCA8A04)),
  'Subscriptions': _CatMeta(Icons.subscriptions_rounded, Color(0xFF0EA5E9)),
  'Education': _CatMeta(Icons.school_rounded, Color(0xFF0369A1)),
  'Recharge': _CatMeta(Icons.bolt_rounded, Color(0xFFEAB308)),
  'Loan EMI': _CatMeta(Icons.payments_rounded, Color(0xFF4F46E5)),
  'Fees/Charges': _CatMeta(Icons.receipt_rounded, Color(0xFF6B7280)),
  'Rent': _CatMeta(Icons.home_work_rounded, Color(0xFF6D28D9)),
  'Utilities': _CatMeta(Icons.lightbulb_outline, Color(0xFF0891B2)),
  'Other': _CatMeta(Icons.more_horiz_rounded, Color(0xFF64748B)),
};

class _StepBasics extends StatelessWidget {
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

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _H2('Amount'),
          const SizedBox(height: 8),
          _AmountField(controller: amountCtrl, enabled: !saving),
          const SizedBox(height: 18),
          const _H2('Category'),
          const SizedBox(height: 8),
          _Box(
            child: DropdownButtonFormField<String>(
              initialValue: categories.contains(category)
                  ? category
                  : (categories.contains('Others')
                      ? 'Others'
                      : categories.firstOrNull),
              isExpanded: true,
              decoration: _inputDec(),
              items: categories.map((c) {
                final meta =
                    _kCatMeta[c] ?? _kCatMeta['Other'] ?? _kCatMeta['Others']!;
                return DropdownMenuItem<String>(
                  value: c,
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 10,
                        backgroundColor: meta.color,
                        child: Icon(meta.icon, size: 14, color: Colors.white),
                      ),
                      const SizedBox(width: 8),
                      Text(c,
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                    ],
                  ),
                );
              }).toList(),
              onChanged: saving
                  ? null
                  : (value) {
                      if (value != null) {
                        onCategory(value);
                      }
                    },
            ),
          ),
          if (subcategories.isNotEmpty) ...[
            const SizedBox(height: 12),
            _Box(
              child: DropdownButtonFormField<String>(
                initialValue: subcategory,
                isExpanded: true,
                decoration: _inputDec().copyWith(labelText: 'Subcategory'),
                items: () {
                  final unique = <String>{};
                  if (subcategory != null && subcategory!.isNotEmpty) {
                    unique.add(subcategory!);
                  }
                  unique.addAll(subcategories);
                  return unique.map((s) {
                    return DropdownMenuItem<String>(
                      value: s,
                      child: Text(s,
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                    );
                  }).toList();
                }(),
                onChanged: saving
                    ? null
                    : (value) {
                        if (value != null) {
                          onSubcategory(value);
                        }
                      },
              ),
            ),
          ],
          if (category == 'Other') ...[
            const SizedBox(height: 10),
            _Box(
              child: TextField(
                controller: customCategoryCtrl,
                enabled: !saving,
                decoration: _inputDec().copyWith(
                  hintText: 'Custom category (optional)…',
                  prefixIcon: const Icon(Icons.edit_rounded, color: kPrimary),
                ),
                onChanged: saving ? null : onCustomCategoryChanged,
              ),
            ),
          ],
          const SizedBox(height: 18),
          const _H2('Date'),
          const SizedBox(height: 8),
          _Box(
            child: ListTile(
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              leading:
                  const Icon(Icons.calendar_today_rounded, color: kPrimary),
              title: Text(
                "${date.toLocal()}".split(' ')[0],
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              trailing: TextButton(
                onPressed: onPickDate,
                child: const Text('Change'),
              ),
            ),
          ),
          const SizedBox(height: 18),
          const _H2('Details'),
          const SizedBox(height: 8),
          _Box(
            child: TextField(
              controller: counterpartyCtrl,
              enabled: !saving,
              decoration: _inputDec().copyWith(
                labelText: 'Paid to (opt)',
                hintText: 'Merchant/Person name…',
                prefixIcon:
                    const Icon(Icons.storefront_rounded, color: kPrimary),
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (isActive)
            _Box(
              child: TextField(
                controller: noteCtrl,
                maxLines: 2,
                enabled: !saving,
                decoration: _inputDec().copyWith(
                  labelText: 'Note (opt)',
                  hintText: 'For yourself…',
                ),
              ),
            )
          else
            _Box(
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  noteCtrl.text.isNotEmpty ? noteCtrl.text : '—',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: noteCtrl.text.isNotEmpty ? kText : kSubtle),
                ),
              ),
            ),
          if (showBankReference && bankRefText.trim().isNotEmpty) ...[
            const SizedBox(height: 14),
            const _H2('Bank reference'),
            const SizedBox(height: 6),
            _Box(
              child: Theme(
                data: Theme.of(context)
                    .copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  tilePadding: const EdgeInsets.symmetric(horizontal: 12),
                  title: const Text(
                    'Show bank reference',
                    style:
                        TextStyle(fontWeight: FontWeight.w700, color: kSubtle),
                  ),
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                      child: SelectableText(
                        bankRefText.trim(),
                        style: const TextStyle(color: kText),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 28),
          _PrimaryButton(text: 'Next', onPressed: saving ? null : onNext),
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
          const SizedBox(height: 28),
          Row(
            children: [
              _GhostButton(text: 'Back', onPressed: saving ? null : onBack),
              const SizedBox(width: 12),
              Expanded(
                child: _PrimaryButton(
                  text: 'Save Changes',
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
}

/// --------------------- Shared UI ---------------------
class _StepperBar extends StatelessWidget {
  final int current;
  final int total;
  final List<String> labels;
  const _StepperBar(
      {required this.current, required this.total, required this.labels});

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
                  color: active ? kPrimary : const Color(0x22000000),
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
                  color: active ? kPrimary : kSubtle,
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
        style: const TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w800,
          color: kText,
          letterSpacing: 0.3,
        ),
        decoration: InputDecoration(
          prefixText: '₹ ',
          prefixStyle: const TextStyle(
              fontSize: 24, fontWeight: FontWeight.w800, color: kText),
          hintText: '0.00',
          hintStyle: const TextStyle(
              fontSize: 24, color: kSubtle, fontWeight: FontWeight.w700),
          filled: true,
          fillColor: Colors.white,
          contentPadding:
              const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: kLine),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: kPrimary, width: 1.6),
          ),
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
      style: const TextStyle(
          color: kText, fontWeight: FontWeight.w800, fontSize: 16),
    );
  }
}

class _Box extends StatelessWidget {
  final Widget child;
  const _Box({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kLine),
        boxShadow: const [
          BoxShadow(
              color: Color(0x0F000000), blurRadius: 10, offset: Offset(0, 4))
        ],
      ),
      child: child,
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool loading;
  const _PrimaryButton(
      {required this.text, required this.onPressed, this.loading = false});
  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: kPrimary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        elevation: 2,
      ),
      child: loading
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            )
          : Text(text,
              style:
                  const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800)),
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
        side: const BorderSide(color: kLine),
        foregroundColor: kText,
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
              .map((kv) => Padding(
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

InputDecoration _inputDec() {
  final base = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: const BorderSide(color: kLine, width: 1),
  );
  return InputDecoration(
    filled: true,
    fillColor: Colors.white,
    hintStyle: const TextStyle(color: kSubtle),
    contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
    enabledBorder: base,
    focusedBorder: base.copyWith(
        borderSide: const BorderSide(color: kPrimary, width: 1.4)),
  );
}
