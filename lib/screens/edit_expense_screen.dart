// lib/screens/edit_expense_screen.dart
import 'dart:ui';
import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../services/expense_service.dart';
import '../services/friend_service.dart';

/// Shared palette (matches add screens)
const Color kBg = Color(0xFFF8FAF9);
const Color kPrimary = Color(0xFF09857a);
const Color kText = Color(0xFF0F1E1C);
const Color kSubtle = Color(0xFF9AA5A1);
const Color kLine = Color(0x14000000);

class EditExpenseScreen extends StatefulWidget {
  final String userPhone;
  final ExpenseItem expense;

  const EditExpenseScreen({
    required this.userPhone,
    required this.expense,
    Key? key,
  }) : super(key: key);

  @override
  State<EditExpenseScreen> createState() => _EditExpenseScreenState();
}

class _EditExpenseScreenState extends State<EditExpenseScreen> {
  final _pg = PageController();
  int _step = 0;
  bool _loading = true;
  bool _saving = false;

  // Controllers / fields
  late TextEditingController _amountCtrl;
  late TextEditingController _noteCtrl;
  late TextEditingController _labelCtrl;

  late DateTime _date;
  late String _category;
  late String? _selectedPayerPhone;
  late List<String> _selectedFriendPhones;

  // Friends
  List<FriendModel> _friends = [];

  // Categories (kept close to your original)
  final List<String> _categories = const [
    "General", "Food", "Travel", "Shopping", "Bills", "Other"
  ];

  // Labels
  List<String> _labels = ["Goa Trip", "Birthday", "Office", "Emergency", "Rent"];
  String? _selectedLabel;

  @override
  void initState() {
    super.initState();
    _amountCtrl = TextEditingController(text: widget.expense.amount.toStringAsFixed(2));
    _noteCtrl = TextEditingController(text: widget.expense.note);
    _labelCtrl = TextEditingController(text: widget.expense.label ?? "");
    _date = widget.expense.date;
    _category = widget.expense.type;
    _selectedPayerPhone = widget.expense.payerId;
    _selectedFriendPhones = List<String>.from(widget.expense.friendIds);

    // Init labels: bring existing label to dropdown list if not present
    if ((widget.expense.label ?? '').isNotEmpty &&
        !_labels.contains(widget.expense.label)) {
      _labels.insert(0, widget.expense.label!);
      _selectedLabel = widget.expense.label!;
    }

    _loadFriends();
  }

  Future<void> _loadFriends() async {
    try {
      _friends = await FriendService().streamFriends(widget.userPhone).first;
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  void dispose() {
    _pg.dispose();
    _amountCtrl.dispose();
    _noteCtrl.dispose();
    _labelCtrl.dispose();
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
      final updated = ExpenseItem(
        id: widget.expense.id,
        type: _category,
        amount: double.parse(_amountCtrl.text.trim()),
        note: _noteCtrl.text.trim(),
        date: _date,
        friendIds: _selectedFriendPhones,
        payerId: _selectedPayerPhone!,
        groupId: widget.expense.groupId,
        settledFriendIds: widget.expense.settledFriendIds,
        customSplits: widget.expense.customSplits,
        label: label,
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
              child: _StepperBar(current: _step, total: steps.length, labels: steps),
            ),
            Expanded(
              child: PageView(
                controller: _pg,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _StepBasics(
                    amountCtrl: _amountCtrl,
                    category: _categories.contains(_category) ? _category : _categories.first,
                    categories: _categories,
                    onCategory: (v) => setState(() => _category = v),
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
                    onNext: _next,
                    saving: _saving,
                  ),
                  _StepPeople(
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
                    isGroupExpense: (widget.expense.groupId ?? '').isNotEmpty,
                    labels: _labels,
                    selectedLabel: _selectedLabel,
                    onLabelSelect: (v) => setState(() {
                      _selectedLabel = v;
                      _labelCtrl.clear();
                    }),
                    labelCtrl: _labelCtrl,
                    onNext: _next,
                    onBack: _back,
                    saving: _saving,
                  ),
                  _StepReview(
                    amount: _amountCtrl.text.trim(),
                    category: _category,
                    date: _date,
                    note: _noteCtrl.text.trim(),
                    payerName: _selectedPayerPhone != null ? _nameForPhone(_selectedPayerPhone!) : '',
                    splitNames: _selectedFriendPhones.map(_nameForPhone).toList(),
                    label: _labelCtrl.text.trim().isNotEmpty ? _labelCtrl.text.trim() : (_selectedLabel ?? ''),
                    isGroupExpense: (widget.expense.groupId ?? '').isNotEmpty,
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
class _StepBasics extends StatelessWidget {
  final TextEditingController amountCtrl;
  final String category;
  final List<String> categories;
  final ValueChanged<String> onCategory;
  final DateTime date;
  final VoidCallback onPickDate;
  final TextEditingController noteCtrl;
  final VoidCallback onNext;
  final bool saving;

  const _StepBasics({
    required this.amountCtrl,
    required this.category,
    required this.categories,
    required this.onCategory,
    required this.date,
    required this.onPickDate,
    required this.noteCtrl,
    required this.onNext,
    required this.saving,
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
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: categories.map((c) {
              final sel = c == category;
              return ChoiceChip(
                selected: sel,
                onSelected: (_) => onCategory(c),
                label: Text(c),
                labelStyle: TextStyle(
                  color: sel ? Colors.white : kText.withOpacity(0.9),
                  fontWeight: FontWeight.w700,
                ),
                selectedColor: kPrimary,
                backgroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: sel ? kPrimary : kLine),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 18),
          const _H2('Date'),
          const SizedBox(height: 8),
          _Box(
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              leading: const Icon(Icons.calendar_today_rounded, color: kPrimary),
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
          const _H2('Note (optional)'),
          const SizedBox(height: 8),
          _Box(
            child: TextField(
              controller: noteCtrl,
              maxLines: 2,
              decoration: _inputDec(),
            ),
          ),
          const SizedBox(height: 28),
          _PrimaryButton(text: 'Next', onPressed: saving ? null : onNext),
        ],
      ),
    );
  }
}

/// --------------------- STEP 1: People & Label ---------------------
class _StepPeople extends StatelessWidget {
  final String userPhone;
  final String? payerPhone;
  final ValueChanged<String?> onPayer;

  final List<FriendModel> friends;
  final List<String> selectedFriends;
  final void Function(String phone, bool selected) onToggleFriend;

  final bool isGroupExpense;

  final List<String> labels;
  final String? selectedLabel;
  final ValueChanged<String?> onLabelSelect;
  final TextEditingController labelCtrl;

  final VoidCallback onNext;
  final VoidCallback onBack;
  final bool saving;

  const _StepPeople({
    required this.userPhone,
    required this.payerPhone,
    required this.onPayer,
    required this.friends,
    required this.selectedFriends,
    required this.onToggleFriend,
    required this.isGroupExpense,
    required this.labels,
    required this.selectedLabel,
    required this.onLabelSelect,
    required this.labelCtrl,
    required this.onNext,
    required this.onBack,
    required this.saving,
  });

  @override
  Widget build(BuildContext context) {
    final payers = <Map<String, String>>[
      {'phone': userPhone, 'name': 'You', 'avatar': '🧑'},
      ...friends.map((f) => {'phone': f.phone, 'name': f.name, 'avatar': f.avatar}),
    ];

    // Ensure current payer is present even if no longer in friends (edge case)
    if (payerPhone != null &&
        !payers.any((p) => p['phone'] == payerPhone)) {
      payers.add({'phone': payerPhone!, 'name': payerPhone!, 'avatar': '👤'});
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _H2('Who paid?'),
          const SizedBox(height: 8),
          _Box(
            child: DropdownButtonFormField<String>(
              value: payerPhone,
              isExpanded: true,
              decoration: _inputDec(),
              items: payers.map((p) {
                return DropdownMenuItem(
                  value: p['phone'],
                  child: Row(
                    children: [
                      Text(p['avatar'] ?? '👤', style: const TextStyle(fontSize: 18)),
                      const SizedBox(width: 8),
                      Text(p['name'] ?? ''),
                    ],
                  ),
                );
              }).toList(),
              onChanged: saving ? null : onPayer,
            ),
          ),
          const SizedBox(height: 18),

          const _H2('Split With'),
          const SizedBox(height: 8),
          if (isGroupExpense) ...[
            _GlassCard(
              child: ListTile(
                leading: const Icon(Icons.groups_2_rounded, color: kPrimary),
                title: const Text(
                  "This expense belongs to a group",
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: const Text("Edit split in the group expense screen"),
              ),
            ),
          ] else ...[
            Wrap(
              spacing: 8,
              runSpacing: -4,
              children: friends.map((f) {
                final sel = selectedFriends.contains(f.phone);
                return FilterChip(
                  label: Text(f.name),
                  avatar: Text(f.avatar, style: const TextStyle(fontSize: 18)),
                  selected: sel,
                  selectedColor: kPrimary.withOpacity(0.14),
                  backgroundColor: Colors.white,
                  onSelected: saving ? null : (v) => onToggleFriend(f.phone, v),
                  showCheckmark: false,
                  labelStyle: TextStyle(
                    color: sel ? kPrimary : kText.withOpacity(0.9),
                    fontWeight: FontWeight.w700,
                  ),
                  shape: RoundedRectangleBorder(
                    side: BorderSide(color: sel ? kPrimary : kLine),
                    borderRadius: BorderRadius.circular(12),
                  ),
                );
              }).toList(),
            ),
          ],

          const SizedBox(height: 18),
          const _H2('Label'),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _Box(
                  child: DropdownButtonFormField<String>(
                    value: selectedLabel,
                    isExpanded: true,
                    decoration: _inputDec().copyWith(
                      labelText: "Select Label",
                      prefixIcon: const Icon(Icons.label_important, color: kPrimary),
                    ),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('No label')),
                      ...labels.map((l) => DropdownMenuItem(value: l, child: Text(l))),
                    ],
                    onChanged: saving ? null : (v) {
                      onLabelSelect(v);
                    },
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Box(
                  child: TextField(
                    controller: labelCtrl,
                    decoration: _inputDec().copyWith(
                      labelText: "Or type new label",
                      hintText: "Eg: Goa Trip",
                      prefixIcon: const Icon(Icons.create, color: kPrimary),
                    ),
                    onChanged: saving
                        ? null
                        : (v) {
                      if (v.isNotEmpty) onLabelSelect(null);
                    },
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 28),
          Row(
            children: [
              _GhostButton(text: 'Back', onPressed: saving ? null : onBack),
              const SizedBox(width: 12),
              Expanded(child: _PrimaryButton(text: 'Next', onPressed: saving ? null : onNext)),
            ],
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
  final String note;
  final String payerName;
  final List<String> splitNames;
  final String label;
  final bool isGroupExpense;
  final VoidCallback onBack;
  final VoidCallback onSave;
  final bool saving;

  const _StepReview({
    required this.amount,
    required this.category,
    required this.date,
    required this.note,
    required this.payerName,
    required this.splitNames,
    required this.label,
    required this.isGroupExpense,
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
      if (note.isNotEmpty) _KV('Note', note),
      if (payerName.isNotEmpty) _KV('Payer', payerName),
      if (isGroupExpense)
        const _KV('Split', 'Managed in group')
      else
        _KV('Split With', splitNames.isNotEmpty ? splitNames.join(', ') : '—'),
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
          fontSize: 24, fontWeight: FontWeight.w800, color: kText, letterSpacing: 0.3,
        ),
        decoration: InputDecoration(
          prefixText: '₹ ',
          prefixStyle: const TextStyle(
              fontSize: 24, fontWeight: FontWeight.w800, color: kText),
          hintText: '0.00',
          hintStyle: const TextStyle(fontSize: 24, color: kSubtle, fontWeight: FontWeight.w700),
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
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
      style: const TextStyle(color: kText, fontWeight: FontWeight.w800, fontSize: 16),
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
        border: Border.all(color: kLine),
        boxShadow: const [BoxShadow(color: Color(0x0F000000), blurRadius: 10, offset: Offset(0,4))],
      ),
      child: child,
    );
    if (label == null) return box;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label!, style: const TextStyle(color: kText, fontWeight: FontWeight.w700, fontSize: 13.5)),
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
        backgroundColor: kPrimary,
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
        color: Colors.white, borderRadius: BorderRadius.circular(18),
        border: Border.all(color: kLine, width: 1),
        boxShadow: const [BoxShadow(color: Color(0x12000000), blurRadius: 16, offset: Offset(0,8))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 3, sigmaY: 3), child: child),
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
          children: rows.map((kv) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(kv.k,
                    style: const TextStyle(color: kSubtle, fontWeight: FontWeight.w700),
                  ),
                ),
                Expanded(
                  child: Text(kv.v,
                    textAlign: TextAlign.right,
                    style: const TextStyle(color: kText, fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          )).toList(),
        ),
      ),
    );
  }
}

class _KV { final String k; final String v; const _KV(this.k, this.v); }

InputDecoration _inputDec() {
  final base = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: const BorderSide(color: kLine, width: 1),
  );
  return InputDecoration(
    filled: true, fillColor: Colors.white,
    hintStyle: const TextStyle(color: kSubtle),
    contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
    enabledBorder: base,
    focusedBorder: base.copyWith(borderSide: const BorderSide(color: kPrimary, width: 1.4)),
  );
}
