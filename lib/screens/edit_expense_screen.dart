import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../services/expense_service.dart';
import '../services/friend_service.dart';

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
  late TextEditingController _typeController;
  late TextEditingController _amountController;
  late TextEditingController _noteController;
  late TextEditingController _labelController;
  late DateTime _selectedDate;
  List<String> _selectedFriendPhones = [];
  String? _selectedPayerPhone;

  List<FriendModel> _friends = [];
  bool _loading = true;

  final _categories = [
    "General", "Food", "Travel", "Shopping", "Bills", "Other"
  ];

  // -- Label support --
  List<String> _labels = ["Goa Trip", "Birthday", "Office", "Emergency", "Rent"];
  String? _selectedLabel;

  @override
  void initState() {
    super.initState();
    _typeController = TextEditingController(text: widget.expense.type);
    _amountController = TextEditingController(text: widget.expense.amount.toStringAsFixed(2));
    _noteController = TextEditingController(text: widget.expense.note);
    _labelController = TextEditingController(text: widget.expense.label ?? "");
    _selectedDate = widget.expense.date;
    _selectedFriendPhones = List.from(widget.expense.friendIds);
    _selectedPayerPhone = widget.expense.payerId;

    // --- Label init ---
    if (widget.expense.label != null && widget.expense.label!.isNotEmpty && !_labels.contains(widget.expense.label)) {
      _labels.insert(0, widget.expense.label!);
      _selectedLabel = widget.expense.label!;
    }

    _loadFriends();
  }

  Future<void> _loadFriends() async {
    _friends = await FriendService().streamFriends(widget.userPhone).first;
    setState(() => _loading = false);
  }

  @override
  void dispose() {
    _typeController.dispose();
    _amountController.dispose();
    _noteController.dispose();
    _labelController.dispose();
    super.dispose();
  }

  Future<void> _saveEdit() async {
    if (_typeController.text.trim().isEmpty ||
        _amountController.text.trim().isEmpty ||
        double.tryParse(_amountController.text.trim()) == null ||
        _selectedPayerPhone == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Please fill all fields!'), backgroundColor: Colors.red),
      );
      return;
    }

    // Label logic: take manual entry or selected dropdown
    final manualLabel = _labelController.text.trim();
    final label = manualLabel.isNotEmpty ? manualLabel : _selectedLabel;
    if (label != null && !_labels.contains(label)) {
      setState(() => _labels.insert(0, label));
    }

    final updatedExpense = ExpenseItem(
      id: widget.expense.id,
      type: _typeController.text.trim(),
      amount: double.parse(_amountController.text.trim()),
      note: _noteController.text.trim(),
      date: _selectedDate,
      friendIds: _selectedFriendPhones,
      payerId: _selectedPayerPhone!,
      groupId: widget.expense.groupId,
      settledFriendIds: widget.expense.settledFriendIds,
      customSplits: widget.expense.customSplits,
      label: label, // <-- Save label!
    );

    await ExpenseService().updateExpense(widget.userPhone, updatedExpense);
    if (mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Add yourself as an option
    final allPayers = [
      {'phone': widget.userPhone, 'name': 'You', 'avatar': '🧑‍💻'},
      ..._friends.map((f) => {'phone': f.phone, 'name': f.name, 'avatar': f.avatar}),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text('Edit Expense'),
        backgroundColor: theme.colorScheme.primary,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
        padding: const EdgeInsets.all(16.0),
        child: ListView(
          children: [
            DropdownButtonFormField<String>(
              value: _typeController.text.isNotEmpty && _categories.contains(_typeController.text)
                  ? _typeController.text
                  : _categories.first,
              items: _categories
                  .map((cat) => DropdownMenuItem(value: cat, child: Text(cat)))
                  .toList(),
              onChanged: (val) {
                if (val != null) {
                  setState(() => _typeController.text = val);
                }
              },
              decoration: InputDecoration(
                labelText: "Category",
                prefixIcon: Icon(Icons.category, color: theme.colorScheme.primary),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _amountController,
              decoration: InputDecoration(
                labelText: "Amount",
                prefixIcon: Icon(Icons.currency_rupee, color: theme.colorScheme.primary),
              ),
              keyboardType: TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _noteController,
              decoration: InputDecoration(
                labelText: "Note",
                prefixIcon: Icon(Icons.edit, color: theme.colorScheme.primary),
              ),
            ),
            const SizedBox(height: 12),

            // ----- Label Selection Row -----
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _selectedLabel,
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
                      prefixIcon: Icon(Icons.label_important, color: Colors.amber[700]),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _labelController,
                    decoration: InputDecoration(
                      labelText: "Or type new label",
                      prefixIcon: Icon(Icons.create, color: Colors.amber[800]),
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
                Text("Date: ${_selectedDate.toLocal().toString().split(' ')[0]}"),
                IconButton(
                  icon: Icon(Icons.calendar_today, color: theme.colorScheme.primary),
                  onPressed: () async {
                    DateTime? picked = await showDatePicker(
                      context: context,
                      initialDate: _selectedDate,
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) setState(() => _selectedDate = picked);
                  },
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text("Who paid?", style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            DropdownButtonFormField<String>(
              value: _selectedPayerPhone,
              items: allPayers
                  .map((p) => DropdownMenuItem(
                value: p['phone'] as String,
                child: Row(
                  children: [
                    Text(p['avatar'] ?? '👤', style: TextStyle(fontSize: 20)),
                    const SizedBox(width: 8),
                    Text(p['name'] ?? ''),
                  ],
                ),
              ))
                  .toList(),
              onChanged: (val) {
                setState(() => _selectedPayerPhone = val);
              },
              decoration: InputDecoration(
                prefixIcon: Icon(Icons.account_circle, color: theme.colorScheme.primary),
              ),
              isExpanded: true,
              hint: Text("Select payer"),
            ),
            const SizedBox(height: 10),
            Text("Split With:", style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 5),
            Wrap(
              spacing: 8,
              children: _friends.map((f) {
                final isSelected = _selectedFriendPhones.contains(f.phone);
                return FilterChip(
                  label: Text(f.name),
                  avatar: Text(f.avatar, style: const TextStyle(fontSize: 18)),
                  selected: isSelected,
                  selectedColor: theme.colorScheme.primary.withOpacity(0.18),
                  onSelected: (selected) {
                    setState(() {
                      if (selected) {
                        _selectedFriendPhones.add(f.phone);
                      } else {
                        _selectedFriendPhones.remove(f.phone);
                      }
                    });
                  },
                  backgroundColor: theme.chipTheme.backgroundColor,
                  labelStyle: TextStyle(
                      color: isSelected
                          ? theme.colorScheme.primary
                          : theme.textTheme.bodyMedium?.color),
                  showCheckmark: false,
                );
              }).toList(),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: Icon(Icons.save, color: Colors.white),
                label: Text('Save', style: TextStyle(fontSize: 18, color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: theme.colorScheme.primary,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: _saveEdit,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
