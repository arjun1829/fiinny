// lib/screens/add_expense_screen.dart
import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';
import '../core/ads/ads_banner_card.dart';

/// Palette (aligned with your app look)
const Color _kBg = Color(0xFFF8FAF9);
const Color _kPrimary = Color(0xFF09857a);
const Color _kText = Color(0xFF0F1E1C);
const Color _kSubtle = Color(0xFF9AA5A1);
const Color _kLine = Color(0x14000000);

class AddExpenseScreen extends StatefulWidget {
  final String userPhone;
  final List<FriendModel> friends;
  final List<GroupModel> groups;

  final ExpenseItem? existingExpense;
  final Map<String, double>? initialSplits;
  final FriendModel? contextFriend; // when opened from a friend detail
  final GroupModel? contextGroup;   // when opened from a group detail

  const AddExpenseScreen({
    required this.userPhone,
    required this.friends,
    required this.groups,
    this.existingExpense,
    this.initialSplits,
    this.contextFriend,
    this.contextGroup,
    Key? key,
  }) : super(key: key);

  @override
  State<AddExpenseScreen> createState() => _AddExpenseScreenState();
}

class _AddExpenseScreenState extends State<AddExpenseScreen> with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _pg = PageController();
  int _step = 0;

  // ---------------------- State ----------------------
  double _amount = 0.0;
  String _note = '';
  DateTime _date = DateTime.now();
  String _label = '';
  String _type = 'General';
  bool _isBill = false;

  FriendModel? _selectedPayer;
  List<FriendModel> _selectedFriends = [];
  GroupModel? _selectedGroup;

  bool _customSplitMode = false;
  Map<String, double> _customSplits = {};

  // UI helpers
  final _friendSearchCtrl = TextEditingController();
  List<FriendModel> _filteredFriendOptions = [];

  // for animated header progress
  late final AnimationController _ac = AnimationController(vsync: this, duration: const Duration(milliseconds: 350));

  @override
  void initState() {
    super.initState();

    final baseFriends = _friendOptionsByContext();
    _filteredFriendOptions = List.of(baseFriends);

    // Context defaults
    if (widget.contextFriend != null) {
      _selectedFriends = [widget.contextFriend!];
      _selectedPayer = widget.contextFriend!;
    }
    if (widget.contextGroup != null) {
      _selectedGroup = widget.contextGroup;
      _selectedFriends = widget.friends
          .where((f) => widget.contextGroup!.memberPhones.contains(f.phone))
          .toList();

      final payers = _payerChoices(baseFriends);
      final youHit = payers.where((p) => p.phone == widget.userPhone);
      _selectedPayer = youHit.isNotEmpty
          ? youHit.first
          : (payers.isNotEmpty ? payers.first : null);
    }

    // Editing existing
    if (widget.existingExpense != null) {
      final e = widget.existingExpense!;
      _amount = e.amount;
      _note = e.note;
      _date = e.date;
      _label = e.label ?? '';
      _type = e.type;
      _isBill = e.isBill;
      _customSplits = Map<String, double>.from(e.customSplits ?? {});
      _customSplitMode = _customSplits.isNotEmpty;

      if (e.groupId != null) {
        _selectedGroup = widget.groups
            .where((g) => g.id == e.groupId)
            .cast<GroupModel?>()
            .firstWhere((g) => g != null, orElse: () => null);
        _selectedFriends = widget.friends
            .where((f) => e.friendIds.contains(f.phone))
            .toList();
      } else {
        _selectedFriends = widget.friends
            .where((f) => e.friendIds.contains(f.phone))
            .toList();
      }

      final payers2 = _payerChoices(baseFriends);
      final match = payers2.where((p) => p.phone == e.payerId);
      _selectedPayer = match.isNotEmpty ? match.first : null;
    }

    // initial splits from caller
    if (widget.initialSplits != null && widget.initialSplits!.isNotEmpty) {
      _customSplitMode = true;
      _customSplits = Map<String, double>.from(widget.initialSplits!);
    }

    _friendSearchCtrl.addListener(_onFriendSearch);
    _ac.forward();
  }

  @override
  void dispose() {
    _friendSearchCtrl.removeListener(_onFriendSearch);
    _friendSearchCtrl.dispose();
    _ac.dispose();
    _pg.dispose();
    super.dispose();
  }

  // ---------------------- Helpers ----------------------
  List<FriendModel> _friendOptionsByContext() {
    if (widget.contextGroup != null) {
      return widget.friends
          .where((f) => widget.contextGroup!.memberPhones.contains(f.phone))
          .toList();
    }
    return widget.friends;
  }

  List<FriendModel> _payerChoices(List<FriendModel> baseFriends) {
    final you = FriendModel(phone: widget.userPhone, name: 'You', avatar: '👤');
    final all = [you, ...baseFriends];
    final seen = <String>{};
    final deduped = <FriendModel>[];
    for (final f in all) {
      if (!seen.contains(f.phone)) {
        seen.add(f.phone);
        deduped.add(f);
      }
    }
    return deduped;
  }

  void _onFriendSearch() {
    final q = _friendSearchCtrl.text.trim().toLowerCase();
    final base = _friendOptionsByContext();
    if (q.isEmpty) {
      setState(() => _filteredFriendOptions = base);
      return;
    }
    setState(() {
      _filteredFriendOptions = base.where((f) {
        final name = f.name.toLowerCase();
        final phone = f.phone.toLowerCase();
        return name.contains(q) || phone.contains(q);
      }).toList();
    });
  }

  void _toggleCustomSplit() {
    setState(() {
      _customSplitMode = !_customSplitMode;
      if (!_customSplitMode) _customSplits.clear();
    });
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  InputDecoration _pillDec({required String label, IconData? icon}) {
    return InputDecoration(
      labelText: label,
      prefixIcon: icon != null ? Icon(icon) : null,
      filled: true,
      fillColor: _kPrimary.withOpacity(.06),
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
        borderSide: const BorderSide(color: _kPrimary),
      ),
    );
  }

  Widget _friendAvatar(FriendModel f, {double r = 10}) {
    final a = f.avatar;
    if (a.startsWith('http')) {
      return CircleAvatar(radius: r, backgroundImage: NetworkImage(a));
    }
    if (a.startsWith('assets/')) {
      return CircleAvatar(radius: r, backgroundImage: AssetImage(a));
    }
    final ch = (a.isNotEmpty ? a.characters.first : f.name.characters.first).toUpperCase();
    return CircleAvatar(radius: r, child: Text(ch, style: const TextStyle(fontSize: 12)));
  }

  // ---------------------- Navigation ----------------------
  void _goNext() {
    if (_step == 0) {
      // validate amount on step 0
      if (_amount <= 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Enter a valid amount")),
        );
        return;
      }
    }
    if (_step == 1) {
      if (_selectedPayer == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Select a payer")),
        );
        return;
      }
      if (_selectedGroup == null && _selectedFriends.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Select at least one participant or a group")),
        );
        return;
      }
    }
    if (_step < 3) {
      setState(() => _step++);
      _pg.animateToPage(_step, duration: const Duration(milliseconds: 280), curve: Curves.easeOut);
    }
  }

  void _goBack() {
    if (_step > 0) {
      setState(() => _step--);
      _pg.animateToPage(_step, duration: const Duration(milliseconds: 240), curve: Curves.easeOut);
    } else {
      Navigator.pop(context, false);
    }
  }

  // ---------------------- Submit ----------------------
  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_selectedPayer == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Select a payer")));
      return;
    }

    final payerPhone = _selectedPayer!.phone;

    final participantSet = <String>{};
    if (_selectedGroup != null) {
      participantSet.addAll(_selectedGroup!.memberPhones);
    } else {
      participantSet.add(widget.userPhone);
      participantSet.addAll(_selectedFriends.map((f) => f.phone));
    }
    participantSet.removeWhere((id) => id.trim().isEmpty);
    participantSet.add(payerPhone);

    final others = <String>{...participantSet}..remove(payerPhone);
    if (others.isEmpty && _selectedGroup == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Select at least one participant")),
      );
      return;
    }

    Map<String, double> splits;
    if (_customSplitMode) {
      splits = Map<String, double>.from(_customSplits);
      if (!splits.containsKey(payerPhone)) {
        final distributed =
            splits.values.fold<double>(0.0, (acc, value) => acc + value);
        final remaining = _amount - distributed;
        splits[payerPhone] = remaining > 0
            ? double.parse(remaining.toStringAsFixed(2))
            : 0.0;
      }
      splits.removeWhere((key, value) => key.trim().isEmpty);
    } else {
      final equalParticipants = <String>{...others, payerPhone};
      final count = equalParticipants.length;
      final share = (count == 0 || _amount <= 0) ? 0.0 : _amount / count;
      splits = {for (final phone in equalParticipants) phone: share};
    }

    final friendSet = _customSplitMode
        ? (
            () {
              final nonZero = splits.entries
                  .where((entry) => entry.value.abs() >= 0.005)
                  .map((entry) => entry.key)
                  .toSet();
              nonZero.add(payerPhone);
              return nonZero;
            }()
          )
        : others;
    friendSet.removeWhere((phone) => phone.trim().isEmpty);
    final friendPhones = friendSet.toList();

    if (kDebugMode) {
      final previewFriends = friendPhones.join(', ');
      debugPrint(
          "[AddExpenseScreen] submitting expense group=${_selectedGroup?.id} payer=$payerPhone friends=$previewFriends custom=$_customSplitMode");
    }

    final expense = ExpenseItem(
      id: widget.existingExpense?.id ?? '',
      type: _type,
      amount: _amount,
      note: _note,
      date: _date,
      friendIds: friendPhones,
      groupId: _selectedGroup?.id,
      payerId: _selectedPayer!.phone,
      customSplits: splits,
      isBill: _isBill,
      label: _label,
    );

    if (widget.existingExpense == null) {
      await ExpenseService().addExpenseWithSync(widget.userPhone, expense);
    } else {
      await ExpenseService().updateExpense(widget.userPhone, expense);
    }
    if (mounted) Navigator.pop(context, true);
  }

  // ---------------------- UI Sections ----------------------
  Widget _stepHeader() {
    const titles = ["Amount & Category", "People", "Split", "Details"];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // progress bar
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: (_step + 1) / 4,
            minHeight: 8,
            backgroundColor: _kPrimary.withOpacity(0.1),
            valueColor: const AlwaysStoppedAnimation<Color>(_kPrimary),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: _kPrimary.withOpacity(.10),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.attach_money_rounded, color: _kPrimary),
            ),
            const SizedBox(width: 10),
            Text(
              widget.existingExpense == null ? "Add Expense" : "Edit Expense",
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF096A63)),
            ),
            const Spacer(),
            Text("${_step + 1} / 4", style: TextStyle(color: _kSubtle)),
          ],
        ),
        const SizedBox(height: 8),
        Text(titles[_step], style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _kText)),
      ],
    );
  }

  Widget _step0AmountCategory() {
    return Column(
      children: [
        const SizedBox(height: 16),
        TextFormField(
          initialValue: _amount > 0 ? _amount.toString() : '',
          decoration: _pillDec(label: "Amount", icon: Icons.currency_rupee),
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          validator: (v) {
            if (_step != 3) return null; // full form validate only on submit
            if (v == null || v.trim().isEmpty) return "Enter amount";
            final d = double.tryParse(v.trim());
            if (d == null || d <= 0) return "Invalid amount";
            return null;
          },
          onChanged: (v) => setState(() => _amount = double.tryParse(v) ?? 0.0),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _type,
          items: const [
            'General', 'Food', 'Travel', 'Rent', 'Shopping', 'Utilities', 'Other',
          ].map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
          onChanged: (v) => setState(() => _type = v ?? 'General'),
          decoration: _pillDec(label: "Type", icon: Icons.category_rounded),
        ),
      ],
    );
  }

  Widget _step1People() {
    final payerChoices = _payerChoices(_friendOptionsByContext());

    // Ensure current payer is valid
    if (_selectedPayer != null && !payerChoices.any((p) => p.phone == _selectedPayer!.phone)) {
      FriendModel? fallback;
      if (payerChoices.any((p) => p.phone == widget.userPhone)) {
        fallback = payerChoices.firstWhere((p) => p.phone == widget.userPhone);
      } else if (payerChoices.isNotEmpty) {
        fallback = payerChoices.first;
      }
      _selectedPayer = fallback;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _selectedPayer?.phone,
          items: payerChoices.map((f) {
            return DropdownMenuItem<String>(
              value: f.phone,
              child: Row(children: [
                _friendAvatar(f),
                const SizedBox(width: 8),
                Text(f.name),
              ]),
            );
          }).toList(),
          onChanged: (phone) {
            setState(() {
              _selectedPayer = payerChoices.firstWhere((f) => f.phone == phone);
            });
          },
          decoration: _pillDec(label: "Paid by", icon: Icons.account_circle),
        ),
        const SizedBox(height: 16),

        // Group (hidden if invoked from friend/group context)
        if (widget.contextFriend == null && widget.contextGroup == null)
          DropdownButtonFormField<GroupModel?>(
            value: _selectedGroup,
            items: <DropdownMenuItem<GroupModel?>>[
              const DropdownMenuItem<GroupModel?>(value: null, child: Text("-- No Group --")),
              ...widget.groups.map((g) => DropdownMenuItem<GroupModel?>(value: g, child: Text(g.name))),
            ],
            onChanged: (g) {
              setState(() {
                _selectedGroup = g;
                _selectedFriends = [];
                _filteredFriendOptions = _friendOptionsByContext();
                _friendSearchCtrl.clear();
              });
            },
            decoration: _pillDec(label: "Group (optional)", icon: Icons.groups),
          ),

        // Participants (hidden if group selected or group-context)
        if (widget.contextGroup == null && _selectedGroup == null) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _friendSearchCtrl,
            decoration: _pillDec(
              label: "Search and select participants (excluding payer)",
              icon: Icons.search_rounded,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: _filteredFriendOptions.map((f) {
              final selected = _selectedFriends.any((x) => x.phone == f.phone);
              return FilterChip(
                avatar: _friendAvatar(f),
                label: Text(f.name, overflow: TextOverflow.ellipsis),
                selected: selected,
                onSelected: (sel) {
                  setState(() {
                    if (sel) {
                      if (!_selectedFriends.any((x) => x.phone == f.phone)) {
                        _selectedFriends.add(f);
                      }
                    } else {
                      _selectedFriends.removeWhere((x) => x.phone == f.phone);
                    }
                  });
                },
              );
            }).toList(),
          ),
        ],
      ],
    );
  }

  Widget _step2Split() {
    // participants set (payer + friends or group members)
    final Map<String, FriendModel> participants = {
      if (_selectedPayer != null) _selectedPayer!.phone: _selectedPayer!,
      for (final f in _selectedGroup != null
          ? widget.friends.where((ff) => _selectedGroup!.memberPhones.contains(ff.phone))
          : _selectedFriends)
        f.phone: f,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: _customSplitMode,
          onChanged: (_) => _toggleCustomSplit(),
          title: const Text("Custom Split", style: TextStyle(fontWeight: FontWeight.w700)),
          subtitle: const Text("Turn off for equal split"),
          activeColor: _kPrimary,
        ),
        if (_customSplitMode) ...[
          const SizedBox(height: 4),
          ...participants.entries.map((entry) {
            final phone = entry.key;
            final f = entry.value;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 6.0),
              child: Row(
                children: [
                  _friendAvatar(f, r: 12),
                  const SizedBox(width: 8),
                  Expanded(child: Text(f.name, maxLines: 1, overflow: TextOverflow.ellipsis)),
                  const SizedBox(width: 10),
                  SizedBox(
                    width: 120,
                    child: TextFormField(
                      initialValue: _customSplits[phone]?.toStringAsFixed(2),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: _pillDec(label: "Amount"),
                      onChanged: (v) {
                        final d = double.tryParse(v) ?? 0.0;
                        setState(() => _customSplits[phone] = d);
                      },
                    ),
                  ),
                ],
              ),
            );
          }),
          const SizedBox(height: 6),
          Builder(builder: (_) {
            final total = _customSplits.values.fold<double>(0.0, (a, b) => a + b);
            final diff = (_amount - total);
            final ok = (_amount > 0) && (diff.abs() < 0.01 || total == _amount);
            return Align(
              alignment: Alignment.centerRight,
              child: Text(
                "Total: ₹${total.toStringAsFixed(2)}"
                    "${_amount > 0 ? " / ₹${_amount.toStringAsFixed(2)}" : ""}"
                    "${!ok && _amount > 0 ? "  (diff ₹${diff.abs().toStringAsFixed(2)})" : ""}",
                style: TextStyle(fontWeight: FontWeight.w700, color: ok ? Colors.green[700] : Colors.red[700]),
              ),
            );
          }),
        ],
        if (!_customSplitMode) Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(
            children: [
              const Icon(Icons.info_outline, size: 18, color: _kSubtle),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  "Equal split between payer and participants.",
                  style: TextStyle(color: _kSubtle),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _step3Details() {
    return Column(
      children: [
        const SizedBox(height: 12),
        TextFormField(
          initialValue: _note,
          decoration: _pillDec(label: "Note", icon: Icons.sticky_note_2),
          onChanged: (v) => setState(() => _note = v),
        ),
        const SizedBox(height: 12),
        TextFormField(
          initialValue: _label,
          decoration: _pillDec(label: "Label (e.g., Dinner, Rent)", icon: Icons.label_outline),
          onChanged: (v) => setState(() => _label = v),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: Text("Date: ${_date.toLocal().toString().substring(0, 10)}")),
            TextButton(onPressed: _pickDate, child: const Text("Change")),
          ],
        ),
        Row(
          children: [
            Switch.adaptive(
              value: _isBill,
              activeColor: _kPrimary,
              onChanged: (v) => setState(() => _isBill = v),
            ),
            const SizedBox(width: 6),
            const Text("Mark as Bill/Settleup"),
          ],
        ),
      ],
    );
  }

  // ---------------------- Build ----------------------
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _kBg,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: _kBg,
        surfaceTintColor: _kBg,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: _kText),
          onPressed: _goBack,
        ),
        title: Text(
          widget.existingExpense == null ? "Add Expense" : "Edit Expense",
          style: const TextStyle(color: _kText, fontWeight: FontWeight.w800),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text("Cancel"),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Form(
                key: _formKey,
                child: Column(
                  children: [
                    _stepHeader(),
                    const SizedBox(height: 10),

                    // Glassy container
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: BackdropFilter(
                          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                          child: Container(
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [Colors.white.withOpacity(0.96), Colors.white.withOpacity(0.90)],
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                              ),
                              border: Border.all(color: Colors.white.withOpacity(0.6)),
                              boxShadow: const [
                                BoxShadow(color: Color(0x1F000000), blurRadius: 20, offset: Offset(0, 8)),
                              ],
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: PageView(
                              controller: _pg,
                              physics: const NeverScrollableScrollPhysics(),
                              children: [
                                SingleChildScrollView(child: _step0AmountCategory()),
                                SingleChildScrollView(child: _step1People()),
                                SingleChildScrollView(child: _step2Split()),
                                SingleChildScrollView(child: _step3Details()),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),

                    // Footer controls
                    const SizedBox(height: 12),
                    AdsBannerCard(
                      placement: 'add_expense_inline_banner',
                      inline: true,
                      inlineMaxHeight: 100,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      minHeight: 70,
                      boxShadow: const [
                        BoxShadow(color: Color(0x12000000), blurRadius: 12, offset: Offset(0, 6)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        if (_step > 0)
                          OutlinedButton.icon(
                            onPressed: _goBack,
                            icon: const Icon(Icons.chevron_left_rounded),
                            label: const Text("Back"),
                            style: OutlinedButton.styleFrom(
                              side: BorderSide(color: _kPrimary.withOpacity(.4)),
                              foregroundColor: _kPrimary,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            ),
                          ),
                        if (_step == 0) const SizedBox.shrink(),
                        const Spacer(),
                        if (_step < 3)
                          ElevatedButton.icon(
                            onPressed: _goNext,
                            icon: const Icon(Icons.chevron_right_rounded),
                            label: const Text("Next"),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _kPrimary,
                              foregroundColor: Colors.white,
                              elevation: 6,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            ),
                          ),
                        if (_step == 3)
                          ElevatedButton.icon(
                            onPressed: _submit,
                            icon: const Icon(Icons.check_rounded),
                            label: Text(widget.existingExpense == null ? "Add Expense" : "Update Expense"),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _kPrimary,
                              foregroundColor: Colors.white,
                              elevation: 6,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
