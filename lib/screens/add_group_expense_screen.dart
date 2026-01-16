import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';
import '../services/friend_service.dart';

class AddGroupExpenseScreen extends StatefulWidget {
  final String userPhone;
  final GroupModel group;

  const AddGroupExpenseScreen({
    required this.userPhone,
    required this.group,
    super.key,
  });

  @override
  State<AddGroupExpenseScreen> createState() => _AddGroupExpenseScreenState();
}

class _AddGroupExpenseScreenState extends State<AddGroupExpenseScreen> {
  final _typeController = TextEditingController();
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();
  final _labelController = TextEditingController();

  DateTime _selectedDate = DateTime.now();

  String? _selectedPayerPhone;
  late List<String> _selectedMemberPhones;
  late Future<List<FriendModel>> _membersFuture;
  Map<String, double>? _customSplits;

  // -- New: label support --
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
    _membersFuture = FriendService()
        .getFriendsByIds(widget.userPhone, widget.group.memberPhones);
    _selectedMemberPhones = List.from(widget.group.memberPhones)
      ..remove(widget.userPhone);
    _selectedPayerPhone = widget.userPhone;
  }

  void _addGroupExpense(List<FriendModel> members) async {
    if (_typeController.text.isEmpty ||
        _amountController.text.isEmpty ||
        double.tryParse(_amountController.text) == null ||
        _selectedPayerPhone == null ||
        _selectedMemberPhones.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill all fields!')),
      );
      return;
    }

    // Never include payer in splitWith list!
    final List<String> splitWith = List.from(_selectedMemberPhones)
      ..remove(_selectedPayerPhone);

    final totalAmount = double.parse(_amountController.text);

    Map<String, double>? splitsToSave;
    if (_customSplits != null) {
      splitsToSave = {
        for (final entry in _customSplits!.entries)
          if (_selectedMemberPhones.contains(entry.key) ||
              entry.key == _selectedPayerPhone)
            entry.key: entry.value
      };
      final splitSum = splitsToSave.values.fold(0.0, (a, b) => a + b);
      if ((splitSum - totalAmount).abs() > 0.5) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content:
                  Text('Custom split total must equal the expense amount!')),
        );
        return;
      }
    }

    // Label logic
    final manualLabel = _labelController.text.trim();
    final label = manualLabel.isNotEmpty ? manualLabel : _selectedLabel;
    if (label != null && !_labels.contains(label)) {
      setState(() => _labels.insert(0, label));
    }

    final newExpense = ExpenseItem(
      id: '',
      type: _typeController.text.trim(),
      amount: totalAmount,
      note: _noteController.text.trim(),
      date: _selectedDate,
      friendIds: splitWith,
      groupId: widget.group.id,
      payerId: _selectedPayerPhone!,
      customSplits: splitsToSave,
      label: label, // -- pass label here!
    );

    await ExpenseService().addExpense(widget.userPhone, newExpense);
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  void _showCustomSplitDialog(List<FriendModel> members) async {
    final List<FriendModel> selected = [
      ...members.where((m) => _selectedMemberPhones.contains(m.phone)),
      if (!members.any((m) => m.phone == _selectedPayerPhone))
        FriendModel(
            phone: _selectedPayerPhone!, name: "You", email: "", avatar: "👤"),
    ];

    // Always include payer for custom split
    if (!selected.any((m) => m.phone == _selectedPayerPhone)) {
      final payerModel = members.firstWhere(
        (m) => m.phone == _selectedPayerPhone,
        orElse: () => FriendModel(
            phone: _selectedPayerPhone!, name: "You", email: "", avatar: "👤"),
      );
      selected.add(payerModel);
    }

    final totalAmount = double.tryParse(_amountController.text) ?? 0;
    final n = selected.length;
    final perHead = n > 0 ? (totalAmount / n) : 0;

    final Map<String, TextEditingController> controllers = {
      for (final m in selected)
        m.phone: TextEditingController(
          text: (_customSplits != null && _customSplits![m.phone] != null)
              ? _customSplits![m.phone]!.toStringAsFixed(2)
              : perHead.toStringAsFixed(2),
        ),
    };

    final result = await showDialog<Map<String, double>>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setState) {
            return AlertDialog(
              title: const Text("Custom Split"),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text("Total: ₹${totalAmount.toStringAsFixed(2)}"),
                    const SizedBox(height: 10),
                    ...selected.map((m) => Row(
                          children: [
                            Text("${m.avatar} ${m.name}: "),
                            SizedBox(
                              width: 70,
                              child: TextField(
                                controller: controllers[m.phone],
                                keyboardType: TextInputType.numberWithOptions(
                                    decimal: true),
                                decoration:
                                    const InputDecoration(suffixText: "₹"),
                              ),
                            ),
                          ],
                        )),
                    const SizedBox(height: 10),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.equalizer),
                      label: const Text("Split Equally"),
                      onPressed: () {
                        for (final m in selected) {
                          controllers[m.phone]!.text =
                              perHead.toStringAsFixed(2);
                        }
                        setState(() {});
                      },
                    )
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, null),
                  child: const Text("Cancel"),
                ),
                ElevatedButton(
                  onPressed: () {
                    final splits = <String, double>{};
                    double sum = 0.0;
                    for (final m in selected) {
                      final val =
                          double.tryParse(controllers[m.phone]!.text) ?? 0;
                      splits[m.phone] = val;
                      sum += val;
                    }
                    if ((sum - totalAmount).abs() > 0.5) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        SnackBar(
                            content: Text(
                                "Sum must be ₹${totalAmount.toStringAsFixed(2)}")),
                      );
                      return;
                    }
                    Navigator.pop(ctx, splits);
                  },
                  child: const Text("Done"),
                ),
              ],
            );
          },
        );
      },
    );

    if (!mounted) return;
    if (result != null) {
      setState(() {
        _customSplits = result;
      });
    }
  }

  @override
  void dispose() {
    _typeController.dispose();
    _amountController.dispose();
    _noteController.dispose();
    _labelController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add Group Expense')),
      body: FutureBuilder<List<FriendModel>>(
        future: _membersFuture,
        builder: (context, snapshot) {
          if (!snapshot.hasData)
            return const Center(child: CircularProgressIndicator());
          var members = snapshot.data!;

          // Defensive: Ensure current user always present (for payer)
          if (!members.any((m) => m.phone == widget.userPhone)) {
            members = [
              FriendModel(
                  phone: widget.userPhone,
                  name: 'You',
                  email: '',
                  avatar: '👤'),
              ...members
            ];
          }

          return ListView(
            padding: const EdgeInsets.all(18),
            children: [
              TextField(
                controller: _typeController,
                decoration: const InputDecoration(labelText: "Type/Category"),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _amountController,
                decoration: const InputDecoration(labelText: "Amount"),
                keyboardType: TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) => setState(() => _customSplits = null),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _noteController,
                decoration: const InputDecoration(labelText: "Note"),
              ),
              const SizedBox(height: 12),
              // --- Label selection (Dropdown + manual entry) ---
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _selectedLabel,
                      items: [
                        const DropdownMenuItem(
                          value: null,
                          child: Text("No label"),
                        ),
                        ..._labels.map((label) => DropdownMenuItem(
                              value: label,
                              child: Text(label),
                            )),
                      ],
                      onChanged: (val) {
                        setState(() {
                          _selectedLabel = val;
                          _labelController.text = '';
                        });
                      },
                      decoration: InputDecoration(
                        labelText: "Select Label",
                        prefixIcon: Icon(Icons.label_important,
                            color: Colors.amber[700]),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _labelController,
                      decoration: InputDecoration(
                        labelText: "Or type new label",
                        prefixIcon:
                            Icon(Icons.create, color: Colors.amber[800]),
                        hintText: "Eg: Goa Trip",
                      ),
                      onChanged: (val) {
                        if (val.isNotEmpty) {
                          setState(() {
                            _selectedLabel = null;
                          });
                        }
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Text(
                      "Date: ${_selectedDate.toLocal().toString().split(' ')[0]}"),
                  IconButton(
                    icon: const Icon(Icons.calendar_today),
                    onPressed: () async {
                      final DateTime? picked = await showDatePicker(
                        context: context,
                        initialDate: _selectedDate,
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null)
                        setState(() => _selectedDate = picked);
                    },
                  ),
                ],
              ),
              const Divider(height: 28),
              const Text("Who paid?",
                  style: TextStyle(fontWeight: FontWeight.bold)),
              Wrap(
                spacing: 10,
                children: members
                    .map((m) => ChoiceChip(
                          label: Text('${m.avatar} ${m.name}'),
                          selected: _selectedPayerPhone == m.phone,
                          onSelected: (_) {
                            setState(() {
                              _selectedPayerPhone = m.phone;
                              // By default, split with everyone except payer
                              _selectedMemberPhones = members
                                  .where((f) => f.phone != m.phone)
                                  .map((f) => f.phone)
                                  .toList();
                              _customSplits = null;
                            });
                          },
                        ))
                    .toList(),
              ),
              const SizedBox(height: 18),
              const Text("Split with:",
                  style: TextStyle(fontWeight: FontWeight.bold)),
              Wrap(
                spacing: 8,
                children: members
                    .where((m) => m.phone != _selectedPayerPhone)
                    .map((m) {
                  final isSelected = _selectedMemberPhones.contains(m.phone);
                  return FilterChip(
                    label: Text('${m.avatar} ${m.name}'),
                    selected: isSelected,
                    onSelected: (selected) {
                      setState(() {
                        if (selected) {
                          _selectedMemberPhones.add(m.phone);
                        } else {
                          _selectedMemberPhones.remove(m.phone);
                        }
                        _customSplits = null;
                      });
                    },
                  );
                }).toList(),
              ),
              const SizedBox(height: 18),
              if (_selectedMemberPhones.length > 1 &&
                  (_amountController.text.isNotEmpty &&
                      double.tryParse(_amountController.text) != null))
                OutlinedButton.icon(
                  icon: const Icon(Icons.tune),
                  label: const Text("Edit Split"),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.deepPurple,
                    side: const BorderSide(color: Colors.deepPurple),
                  ),
                  onPressed: () => _showCustomSplitDialog(members),
                ),
              if (_customSplits != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text("Custom Split:",
                          style: TextStyle(fontWeight: FontWeight.bold)),
                      ..._customSplits!.entries.map((e) {
                        final friend = members.firstWhere(
                            (m) => m.phone == e.key,
                            orElse: () => FriendModel(
                                phone: e.key,
                                name: e.key,
                                email: "",
                                avatar: "👤"));
                        return Text(
                            "${friend.avatar} ${friend.name}: ₹${e.value.toStringAsFixed(2)}");
                      }).toList(),
                    ],
                  ),
                ),
              const SizedBox(height: 28),
              ElevatedButton.icon(
                onPressed: () => _addGroupExpense(members),
                icon: const Icon(Icons.done),
                label: const Text('Add Expense'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.deepPurple,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
