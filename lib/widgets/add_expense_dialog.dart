import 'dart:ui';
import 'package:flutter/material.dart';

import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';

class AddExpenseDialog extends StatefulWidget {
  final String userPhone;
  final List<FriendModel> friends;
  final List<GroupModel> groups;

  final ExpenseItem? existingExpense;
  final Map<String, double>? initialSplits;
  final FriendModel? contextFriend; // when opened from a friend detail
  final GroupModel? contextGroup;   // when opened from a group detail

  const AddExpenseDialog({
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
  State<AddExpenseDialog> createState() => _AddExpenseDialogState();
}

class _AddExpenseDialogState extends State<AddExpenseDialog> {
  final _formKey = GlobalKey<FormState>();

  // fields
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

  @override
  void initState() {
    super.initState();

    // base friend options (filtered further below)
    final baseFriends = _friendOptionsByContext();
    _filteredFriendOptions = List.of(baseFriends);

    // context defaults
    if (widget.contextFriend != null) {
      _selectedFriends = [widget.contextFriend!];
      _selectedPayer = widget.contextFriend!;
    }

    if (widget.contextGroup != null) {
      _selectedGroup = widget.contextGroup;
      _selectedFriends = widget.friends
          .where((f) => widget.contextGroup!.memberPhones.contains(f.phone))
          .toList();

      // --- SAFE payer fallback (no nullable return from orElse)
      final payers = _payerChoices(baseFriends);
      final youHit = payers.where((p) => p.phone == widget.userPhone);
      _selectedPayer = youHit.isNotEmpty
          ? youHit.first
          : (payers.isNotEmpty ? payers.first : null);
    }

    // editing existing
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

    _friendSearchCtrl.addListener(_onFriendSearch);
  }

  @override
  void dispose() {
    _friendSearchCtrl.removeListener(_onFriendSearch);
    _friendSearchCtrl.dispose();
    super.dispose();
  }

  // ---------------------- Options (respecting context) ----------------------

  List<FriendModel> _friendOptionsByContext() {
    if (widget.contextGroup != null) {
      return widget.friends
          .where((f) => widget.contextGroup!.memberPhones.contains(f.phone))
          .toList();
    }
    return widget.friends;
  }

  /// Payer choices include "You" + friend options (dedup by phone).
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

  // ---------------------- UI helpers ----------------------

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

  // ---------------------- Submit ----------------------

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_selectedPayer == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text("Select a payer")));
      return;
    }

    // Participants:
    // - if a group is chosen, use its members EXCEPT current user (kept to match existing logic)
    // - else use the selected friends
    final friendPhones = _selectedGroup != null
        ? _selectedGroup!.memberPhones
        .where((p) => p != widget.userPhone)
        .toList()
        : _selectedFriends.map((f) => f.phone).toList();

    if (friendPhones.isEmpty && _selectedGroup == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Select at least one participant")),
      );
      return;
    }

    // Splits
    final Map<String, double> splits = _customSplitMode
        ? Map<String, double>.from(_customSplits)
        : {
      for (final phone in <String>{_selectedPayer!.phone, ...friendPhones})
        phone: (_amount <= 0 || (friendPhones.length + 1) == 0)
            ? 0.0
            : _amount / (friendPhones.length + 1),
    };

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

  // ---------------------- Widgets ----------------------

  InputDecoration _pillDec({required String label, IconData? icon}) {
    return InputDecoration(
      labelText: label,
      prefixIcon: icon != null ? Icon(icon) : null,
      filled: true,
      fillColor: const Color(0xFF09857a).withOpacity(.06),
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
        borderSide: const BorderSide(color: Color(0xFF09857a)),
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
    final ch = (a.isNotEmpty ? a.characters.first : f.name.characters.first)
        .toUpperCase();
    return CircleAvatar(radius: r, child: Text(ch, style: const TextStyle(fontSize: 12)));
  }

  @override
  Widget build(BuildContext context) {
    final payerChoices = _payerChoices(_friendOptionsByContext());

    // Ensure current _selectedPayer is present in dropdown items; if not, pick a safe fallback
    if (_selectedPayer != null &&
        !payerChoices.any((p) => p.phone == _selectedPayer!.phone)) {
      FriendModel? fallback;
      if (payerChoices.any((p) => p.phone == widget.userPhone)) {
        fallback =
            payerChoices.firstWhere((p) => p.phone == widget.userPhone);
      } else if (payerChoices.isNotEmpty) {
        fallback = payerChoices.first;
      } else {
        fallback = null;
      }
      _selectedPayer = fallback;
    }

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 22),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 520),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Colors.white.withOpacity(0.96),
                  Colors.white.withOpacity(0.90),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              border: Border.all(color: Colors.white.withOpacity(0.6)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x1F000000),
                  blurRadius: 22,
                  offset: Offset(0, 10),
                ),
              ],
            ),
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
            child: Form(
              key: _formKey,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0xFF09857a).withOpacity(.10),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.attach_money_rounded,
                              color: Color(0xFF09857a)),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          widget.existingExpense == null
                              ? "Add Expense"
                              : "Edit Expense",
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF096A63),
                          ),
                        ),
                        const Spacer(),
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text("Cancel"),
                        )
                      ],
                    ),
                    const SizedBox(height: 14),

                    // Amount
                    TextFormField(
                      initialValue: _amount > 0 ? _amount.toString() : '',
                      decoration:
                      _pillDec(label: "Amount", icon: Icons.currency_rupee),
                      keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return "Enter amount";
                        }
                        final d = double.tryParse(v.trim());
                        if (d == null || d <= 0) return "Invalid amount";
                        return null;
                      },
                      onChanged: (v) =>
                          setState(() => _amount = double.tryParse(v) ?? 0.0),
                    ),
                    const SizedBox(height: 10),

                    // Payer
                    DropdownButtonFormField<String>(
                      value: _selectedPayer?.phone,
                      items: payerChoices
                          .map(
                            (f) => DropdownMenuItem<String>(
                          value: f.phone,
                          child: Row(
                            children: [
                              _friendAvatar(f),
                              const SizedBox(width: 8),
                              Text(f.name),
                            ],
                          ),
                        ),
                      )
                          .toList(),
                      onChanged: (phone) {
                        setState(() {
                          _selectedPayer = payerChoices
                              .firstWhere((f) => f.phone == phone);
                        });
                      },
                      decoration:
                      _pillDec(label: "Paid by", icon: Icons.account_circle),
                      validator: (phone) => phone == null ? "Select payer" : null,
                    ),
                    const SizedBox(height: 10),

                    // Group (optional) — hide in friend/group context
                    if (widget.contextFriend == null &&
                        widget.contextGroup == null)
                      DropdownButtonFormField<GroupModel?>(
                        value: _selectedGroup,
                        items: <DropdownMenuItem<GroupModel?>>[
                          const DropdownMenuItem<GroupModel?>(
                            value: null,
                            child: Text("-- No Group --"),
                          ),
                          ...widget.groups.map(
                                (g) => DropdownMenuItem<GroupModel?>(
                              value: g,
                              child: Text(g.name),
                            ),
                          ),
                        ],
                        onChanged: (g) {
                          setState(() {
                            _selectedGroup = g;
                            _selectedFriends = [];
                            _filteredFriendOptions = _friendOptionsByContext();
                            _friendSearchCtrl.clear();
                          });
                        },
                        decoration: _pillDec(
                            label: "Group (optional)", icon: Icons.groups),
                      ),

                    // Participants (hide if group context or group selected)
                    if (widget.contextGroup == null && _selectedGroup == null)
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 10),
                          TextField(
                            controller: _friendSearchCtrl,
                            decoration: _pillDec(
                              label:
                              "Search and select participants (excluding payer)",
                              icon: Icons.search_rounded,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 6,
                            children: _filteredFriendOptions.map((f) {
                              final selected = _selectedFriends
                                  .any((x) => x.phone == f.phone);
                              return FilterChip(
                                avatar: _friendAvatar(f),
                                label: Text(f.name,
                                    overflow: TextOverflow.ellipsis),
                                selected: selected,
                                onSelected: (sel) {
                                  setState(() {
                                    if (sel) {
                                      if (!_selectedFriends
                                          .any((x) => x.phone == f.phone)) {
                                        _selectedFriends.add(f);
                                      }
                                    } else {
                                      _selectedFriends
                                          .removeWhere((x) => x.phone == f.phone);
                                    }
                                  });
                                },
                              );
                            }).toList(),
                          ),
                        ],
                      ),

                    const SizedBox(height: 10),

                    // Split mode
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      value: _customSplitMode,
                      onChanged: (_) => _toggleCustomSplit(),
                      title: const Text(
                        "Custom Split",
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: const Text("Turn off for equal split"),
                      activeColor: const Color(0xFF09857a),
                    ),

                    if (_customSplitMode)
                      Column(
                        children: [
                          const SizedBox(height: 6),
                          ...({
                            if (_selectedPayer != null) _selectedPayer!.phone: _selectedPayer!,
                            for (final f in _selectedFriends) f.phone: f
                          }.entries.map((entry) {
                            final phone = entry.key;
                            final f = entry.value!;
                            return Padding(
                              padding:
                              const EdgeInsets.symmetric(vertical: 6.0),
                              child: Row(
                                children: [
                                  _friendAvatar(f, r: 12),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      f.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  SizedBox(
                                    width: 100,
                                    child: TextFormField(
                                      initialValue: _customSplits[phone]
                                          ?.toStringAsFixed(2),
                                      keyboardType:
                                      const TextInputType.numberWithOptions(
                                          decimal: true),
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
                          })),
                          const SizedBox(height: 6),
                          Builder(builder: (_) {
                            final total = _customSplits.values
                                .fold<double>(0.0, (a, b) => a + b);
                            final diff = (_amount - total);
                            final ok = (_amount > 0) &&
                                (diff.abs() < 0.01 || total == _amount);
                            return Align(
                              alignment: Alignment.centerRight,
                              child: Text(
                                "Total: ₹${total.toStringAsFixed(2)}"
                                    "${_amount > 0 ? " / ₹${_amount.toStringAsFixed(2)}" : ""}"
                                    "${!ok && _amount > 0 ? "  (diff ₹${diff.abs().toStringAsFixed(2)})" : ""}",
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: ok ? Colors.green[700] : Colors.red[700],
                                ),
                              ),
                            );
                          }),
                        ],
                      ),

                    const SizedBox(height: 10),

                    // Note / Label / Type / Date / Bill
                    TextFormField(
                      initialValue: _note,
                      decoration: _pillDec(label: "Note", icon: Icons.sticky_note_2),
                      onChanged: (v) => setState(() => _note = v),
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      initialValue: _label,
                      decoration: _pillDec(
                          label: "Label (e.g., Dinner, Rent)",
                          icon: Icons.label_outline),
                      onChanged: (v) => setState(() => _label = v),
                    ),
                    const SizedBox(height: 10),

                    DropdownButtonFormField<String>(
                      value: _type,
                      items: const [
                        'General',
                        'Food',
                        'Travel',
                        'Rent',
                        'Shopping',
                        'Utilities',
                        'Other',
                      ].map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                      onChanged: (v) => setState(() => _type = v ?? 'General'),
                      decoration: _pillDec(label: "Type", icon: Icons.category_rounded),
                    ),
                    const SizedBox(height: 10),

                    Row(
                      children: [
                        Text("Date: ${_date.toLocal().toString().substring(0, 10)}"),
                        const Spacer(),
                        TextButton(onPressed: _pickDate, child: const Text("Change")),
                      ],
                    ),
                    Row(
                      children: [
                        Switch.adaptive(
                          value: _isBill,
                          activeColor: const Color(0xFF09857a),
                          onChanged: (v) => setState(() => _isBill = v),
                        ),
                        const SizedBox(width: 6),
                        const Text("Mark as Bill/Settleup"),
                      ],
                    ),

                    const SizedBox(height: 14),

                    // Submit
                    Align(
                      alignment: Alignment.centerRight,
                      child: ElevatedButton.icon(
                        onPressed: _submit,
                        icon: const Icon(Icons.check_rounded),
                        label: Text(widget.existingExpense == null
                            ? "Add Expense"
                            : "Update Expense"),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF09857a),
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
              ),
            ),
          ),
        ),
      ),
    );
  }
}
