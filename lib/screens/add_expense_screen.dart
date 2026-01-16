import 'package:flutter/material.dart';

import '../constants/expense_categories.dart';
import '../core/ads/ads_shell.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../services/expense_service.dart';
import '../services/friend_service.dart';

class AddExpenseScreen extends StatefulWidget {
  final String userId;
  final String? groupId;
  final List<FriendModel>? groupMembers;
  final List<String>? preselectedFriendIds;

  const AddExpenseScreen({
    required this.userId,
    this.groupId,
    this.groupMembers,
    this.preselectedFriendIds,
    super.key,
  });

  @override
  State<AddExpenseScreen> createState() => _AddExpenseScreenState();
}

class _AddExpenseScreenState extends State<AddExpenseScreen> {
  final _amountController = TextEditingController();
  final _descController = TextEditingController();
  final _labelController = TextEditingController();

  String _selectedType = "General";
  List<FriendModel> _friends = [];
  Set<String> _selectedFriendIds = {};
  bool _loading = true;
  bool _submitting = false;

  final List<String> _categories = kExpenseSubcategories.keys.toList();
  String? _selectedSubcategory;
  List<String> _subcategories = [];

  // --- New: Local label list for this user session ---
  final List<String> _labels = [
    "Goa Trip",
    "Birthday",
    "Office",
    "Emergency",
    "Rent"
  ];
  String? _selectedLabel; // for dropdown selection

  @override
  void initState() {
    super.initState();
    _loadFriends();
  }

  Future<void> _loadFriends() async {
    setState(() => _loading = true);

    if (widget.groupId != null && widget.groupMembers != null) {
      _friends = widget.groupMembers!;
      _selectedFriendIds = _friends.map((f) => f.phone).toSet();
    } else {
      _friends = await FriendService().getAllFriendsForUser(widget.userId);
      if (widget.preselectedFriendIds != null &&
          widget.preselectedFriendIds!.isNotEmpty) {
        _selectedFriendIds = widget.preselectedFriendIds!.toSet();
      }
    }

    setState(() => _loading = false);
  }

  @override
  void dispose() {
    _amountController.dispose();
    _descController.dispose();
    _labelController.dispose();
    super.dispose();
  }

  Future<void> _addExpense() async {
    if (_amountController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Enter an amount!'), backgroundColor: Colors.red),
      );
      return;
    }
    setState(() => _submitting = true);
    final amount = double.tryParse(_amountController.text.trim()) ?? 0;
    final desc = _descController.text.trim();
    final label = _labelController.text.trim().isNotEmpty
        ? _labelController.text.trim()
        : _selectedLabel;

    // Add new label to _labels if not present
    if (label != null && !_labels.contains(label)) {
      setState(() {
        _labels.insert(0, label);
      });
    }

    List<String> friendIds;
    if (widget.groupId != null && widget.groupMembers != null) {
      friendIds = widget.groupMembers!
          .where((f) => f.phone != widget.userId)
          .map((f) => f.phone)
          .toList();
    } else {
      friendIds =
          _selectedFriendIds.where((id) => id != widget.userId).toList();
    }

    final expense = ExpenseItem(
      id: '',
      amount: amount,
      type: _selectedType,
      subtype: _selectedSubcategory,
      note: desc,
      date: DateTime.now(),
      payerId: widget.userId,
      friendIds: friendIds,
      settledFriendIds: [],
      groupId: widget.groupId,
      label: label,
      createdAt: DateTime.now(),
      createdBy: 'user',
      updatedAt: DateTime.now(),
      updatedBy: 'user',
    );

    try {
      await ExpenseService().addExpenseWithSync(widget.userId, expense);
      _amountController.clear();
      _descController.clear();
      _labelController.clear();
      _selectedLabel = null;
      _selectedFriendIds.clear();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Expense added & synced!'),
              backgroundColor: Colors.green),
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Failed to add expense.'),
              backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isGroupMode = widget.groupId != null && widget.groupMembers != null;
    final bottomPadding = context.adsBottomPadding(extra: 16);
    return Scaffold(
      appBar: AppBar(
        title: const Text("Add Expense"),
        backgroundColor: Colors.deepPurple,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(16, 16, 16, bottomPadding),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: _amountController,
                    decoration: const InputDecoration(
                      labelText: "Amount (₹)",
                      prefixIcon: Icon(Icons.currency_rupee),
                    ),
                    keyboardType:
                        TextInputType.numberWithOptions(decimal: true),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _selectedType,
                    items: _categories
                        .map((cat) => DropdownMenuItem(
                              value: cat,
                              child: Text(cat),
                            ))
                        .toList(),
                    onChanged: (val) {
                      if (val != null) {
                        setState(() {
                          _selectedType = val;
                          final subs = kExpenseSubcategories[val] ?? [];
                          _subcategories = subs;
                          _selectedSubcategory =
                              subs.isNotEmpty ? subs.first : null;
                        });
                      }
                    },
                    decoration: const InputDecoration(
                      labelText: "Category",
                      prefixIcon: Icon(Icons.category),
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (_subcategories.isNotEmpty) ...[
                    DropdownButtonFormField<String>(
                      initialValue: _selectedSubcategory,
                      items: _subcategories
                          .map((sub) => DropdownMenuItem(
                                value: sub,
                                child: Text(sub),
                              ))
                          .toList(),
                      onChanged: (val) {
                        if (val != null)
                          setState(() => _selectedSubcategory = val);
                      },
                      decoration: const InputDecoration(
                        labelText: "Subcategory",
                        prefixIcon: Icon(Icons.subdirectory_arrow_right),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  const SizedBox(height: 12),

                  // -------- LABEL DROPDOWN + ADD --------
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
                      // Manual label entry
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

                  TextField(
                    controller: _descController,
                    decoration: const InputDecoration(
                      labelText: "Description (e.g. Dinner, Uber)",
                      prefixIcon: Icon(Icons.edit),
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Text("Split With Friends:",
                      style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  ..._friends.map((friend) {
                    return CheckboxListTile(
                      title: Text(friend.name),
                      subtitle:
                          (friend.email != null && friend.email!.isNotEmpty)
                              ? Text(friend.email!)
                              : null,
                      value: _selectedFriendIds.contains(friend.phone),
                      onChanged: isGroupMode
                          ? null
                          : (v) {
                              setState(() {
                                if (v == true) {
                                  _selectedFriendIds.add(friend.phone);
                                } else {
                                  _selectedFriendIds.remove(friend.phone);
                                }
                              });
                            },
                      secondary: Text(friend.avatar,
                          style: const TextStyle(fontSize: 24)),
                      controlAffinity: ListTileControlAffinity.leading,
                    );
                  }),
                  const SizedBox(height: 20),
                  Center(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.deepPurple,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 36, vertical: 14),
                      ),
                      icon: const Icon(Icons.add),
                      label: _submitting
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white))
                          : const Text("Add Expense"),
                      onPressed: _submitting ? null : _addExpense,
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
