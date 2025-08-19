import 'dart:io';
import 'dart:ui';
import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

const Color tiffanyBlue = Color(0xFF81e6d9);
const Color mintGreen = Color(0xFFb9f5d8);
const Color deepTeal = Color(0xFF09857a);

class AddTransactionScreen extends StatefulWidget {
  final String userId;
  const AddTransactionScreen({required this.userId, Key? key}) : super(key: key);

  @override
  State<AddTransactionScreen> createState() => _AddTransactionScreenState();
}

class _AddTransactionScreenState extends State<AddTransactionScreen> {
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();
  final _labelController = TextEditingController();

  String _type = 'debit';
  String _category = 'General';
  String? _cardLast4;
  bool _saving = false;

  // New fields for split
  List<Map<String, dynamic>> _friends = [];
  List<Map<String, dynamic>> _groups = [];
  String? _selectedFriendId;
  String? _selectedGroupId;

  // For bill image
  File? _billImage;
  String? _billImageUrl;

  // Categories
  final List<String> _expenseCategories = [
    'General', 'Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'
  ];
  final List<String> _incomeCategories = [
    'General', 'Salary', 'Freelance', 'Gift', 'Investment', 'Other'
  ];

  final List<DropdownMenuItem<String>> _typeOptions = const [
    DropdownMenuItem(value: 'debit', child: Text("Expense")),
    DropdownMenuItem(value: 'credit', child: Text("Income")),
    DropdownMenuItem(value: 'cc_spend', child: Text("Credit Card Spend")),
    DropdownMenuItem(value: 'cc_bill', child: Text("Credit Card Bill")),
  ];

  // --- New: Local label list (shared for both) ---
  List<String> _labels = [
    "Goa Trip", "Birthday", "Office", "Emergency", "Rent"
  ];
  String? _selectedLabel;

  @override
  void initState() {
    super.initState();
    _loadFriendsGroups();
  }

  Future<void> _loadFriendsGroups() async {
    final friendsSnap = await FirebaseFirestore.instance
        .collection('users').doc(widget.userId).collection('friends').get();
    final groupsSnap = await FirebaseFirestore.instance
        .collection('users').doc(widget.userId).collection('groups').get();

    setState(() {
      _friends = friendsSnap.docs.map((d) => {
        "id": d.id,
        "name": d.data()['name'] ?? '',
      }).toList();
      _groups = groupsSnap.docs.map((d) => {
        "id": d.id,
        "name": d.data()['name'] ?? '',
      }).toList();
    });
  }

  Future<void> _pickBillImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
    if (picked == null) return;
    setState(() {
      _billImage = File(picked.path);
    });
  }

  Future<String?> _uploadBillImage() async {
    if (_billImage == null) return null;
    setState(() => _saving = true);
    try {
      final ref = FirebaseStorage.instance
          .ref('users/${widget.userId}/tx_images/${DateTime.now().millisecondsSinceEpoch}.jpg');
      await ref.putFile(_billImage!);
      final url = await ref.getDownloadURL();
      setState(() => _billImageUrl = url);
      return url;
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Failed to upload bill image: $e")));
      return null;
    } finally {
      setState(() => _saving = false);
    }
  }

  Future<void> _saveTransaction() async {
    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please enter a valid amount!")),
      );
      return;
    }
    setState(() => _saving = true);

    // 1. Upload image if needed
    String? billUrl;
    if (_billImage != null) {
      billUrl = await _uploadBillImage();
    }

    // ---- LABEL LOGIC ----
    final manualLabel = _labelController.text.trim();
    final label = manualLabel.isNotEmpty ? manualLabel : _selectedLabel;

    // Add label to list if new and not null/empty
    if (label != null && !_labels.contains(label)) {
      setState(() => _labels.insert(0, label));
    }

    // 2. Add to models/services
    if (_type == 'credit') {
      final income = IncomeItem(
        id: '',
        type: _category,
        amount: amount,
        note: _noteController.text.trim(),
        date: DateTime.now(),
        source: "Manual",
        imageUrl: billUrl,
        label: label,
      );
      await IncomeService().addIncome(widget.userId, income);
    } else {
      bool isBill = _type == 'cc_bill';
      String type = _type == 'cc_spend'
          ? "Credit Card"
          : _type == 'cc_bill'
          ? "Credit Card Bill"
          : _category;

      List<String> friendIds = [];
      String? groupId;
      if (_selectedFriendId != null && _selectedFriendId!.isNotEmpty) {
        friendIds = [_selectedFriendId!];
      }
      if (_selectedGroupId != null && _selectedGroupId!.isNotEmpty && friendIds.isEmpty) {
        groupId = _selectedGroupId;
      }

      final expense = ExpenseItem(
        id: '',
        amount: amount,
        type: type,
        note: _noteController.text.trim(),
        date: DateTime.now(),
        payerId: widget.userId,
        friendIds: friendIds,
        settledFriendIds: [],
        cardType: _type == 'cc_spend' || _type == 'cc_bill' ? "Credit Card" : null,
        cardLast4: (_type == 'cc_spend' || _type == 'cc_bill') ? (_cardLast4 ?? '') : null,
        isBill: isBill,
        groupId: groupId,
        imageUrl: billUrl,
        label: label,
      );
      await ExpenseService().addExpense(widget.userId, expense);
    }

    setState(() => _saving = false);
    FocusScope.of(context).unfocus();
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(68),
        child: ClipRRect(
          borderRadius: const BorderRadius.only(
            bottomLeft: Radius.circular(18), bottomRight: Radius.circular(18),
          ),
          child: Container(
            height: 68,
            decoration: BoxDecoration(
              color: tiffanyBlue.withOpacity(0.94),
              boxShadow: [
                BoxShadow(
                  color: Colors.black12.withOpacity(0.13),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: SafeArea(
              child: Center(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: const [
                    Icon(Icons.add_card, color: deepTeal, size: 24),
                    SizedBox(width: 8),
                    Text(
                      "Add Transaction",
                      style: TextStyle(
                        fontFamily: 'Montserrat',
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: deepTeal,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          const _AnimatedMintBackground(),
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: _GlassCard(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TextField(
                        controller: _amountController,
                        keyboardType: TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(
                          labelText: "Amount",
                          prefixText: "₹ ",
                          border: OutlineInputBorder(),
                        ),
                        onSubmitted: (_) => _saveTransaction(),
                        enabled: !_saving,
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        value: _type,
                        items: _typeOptions,
                        onChanged: (v) => setState(() {
                          _type = v!;
                          _category = 'General';
                          _selectedFriendId = null;
                          _selectedGroupId = null;
                        }),
                        decoration: const InputDecoration(labelText: "Type"),
                        isExpanded: true,
                      ),
                      const SizedBox(height: 14),
                      if (_type == 'debit')
                        DropdownButtonFormField<String>(
                          value: _category,
                          items: _expenseCategories
                              .map((cat) => DropdownMenuItem(value: cat, child: Text(cat)))
                              .toList(),
                          onChanged: (v) => setState(() => _category = v ?? 'General'),
                          decoration: const InputDecoration(labelText: "Category"),
                          isExpanded: true,
                        ),
                      if (_type == 'credit')
                        DropdownButtonFormField<String>(
                          value: _category,
                          items: _incomeCategories
                              .map((cat) => DropdownMenuItem(value: cat, child: Text(cat)))
                              .toList(),
                          onChanged: (v) => setState(() => _category = v ?? 'General'),
                          decoration: const InputDecoration(labelText: "Category"),
                          isExpanded: true,
                        ),
                      if (_type == 'cc_spend' || _type == 'cc_bill') ...[
                        TextField(
                          decoration: const InputDecoration(
                            labelText: "Card Last 4 Digits (optional)",
                            border: OutlineInputBorder(),
                          ),
                          onChanged: (v) => _cardLast4 = v.trim(),
                          enabled: !_saving,
                          maxLength: 4,
                        ),
                        const SizedBox(height: 10),
                      ],
                      if (_type == 'debit') ...[
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          value: _selectedFriendId,
                          items: [
                            const DropdownMenuItem(value: null, child: Text("Split with Friend (optional)")),
                            ..._friends.map((f) => DropdownMenuItem(
                              value: f['id'],
                              child: Text(f['name']),
                            )),
                          ],
                          onChanged: (v) => setState(() {
                            _selectedFriendId = v;
                            _selectedGroupId = null;
                          }),
                          decoration: const InputDecoration(
                            labelText: "Split with Friend",
                            border: OutlineInputBorder(),
                          ),
                          isExpanded: true,
                        ),
                        const SizedBox(height: 10),
                        DropdownButtonFormField<String>(
                          value: _selectedGroupId,
                          items: [
                            const DropdownMenuItem(value: null, child: Text("Split with Group (optional)")),
                            ..._groups.map((g) => DropdownMenuItem(
                              value: g['id'],
                              child: Text(g['name']),
                            )),
                          ],
                          onChanged: (v) => setState(() {
                            _selectedGroupId = v;
                            _selectedFriendId = null;
                          }),
                          decoration: const InputDecoration(
                            labelText: "Split with Group",
                            border: OutlineInputBorder(),
                          ),
                          isExpanded: true,
                        ),
                        const SizedBox(height: 10),
                      ],

                      // --- LABEL selection section (for both credit & debit) ---
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

                      TextField(
                        controller: _noteController,
                        decoration: const InputDecoration(
                          labelText: "Note (optional)",
                          border: OutlineInputBorder(),
                        ),
                        enabled: !_saving,
                        maxLines: 2,
                      ),
                      const SizedBox(height: 14),
                      // BILL IMAGE PICKER
                      Row(
                        children: [
                          ElevatedButton.icon(
                            icon: const Icon(Icons.attach_file_rounded),
                            label: const Text("Attach Bill"),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: tiffanyBlue,
                              foregroundColor: deepTeal,
                              padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: _saving ? null : _pickBillImage,
                          ),
                          if (_billImage != null)
                            Padding(
                              padding: const EdgeInsets.only(left: 14),
                              child: Stack(
                                alignment: Alignment.topRight,
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: Image.file(_billImage!, width: 56, height: 56, fit: BoxFit.cover),
                                  ),
                                  GestureDetector(
                                    onTap: () => setState(() => _billImage = null),
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        shape: BoxShape.circle,
                                        boxShadow: [
                                          BoxShadow(color: Colors.black26, blurRadius: 4)
                                        ],
                                      ),
                                      child: const Icon(Icons.close_rounded, size: 19, color: Colors.red),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 22),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _saving ? null : _saveTransaction,
                          child: _saving
                              ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white)),
                          )
                              : const Text("Save Transaction", style: TextStyle(fontSize: 18)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: deepTeal,
                            padding: const EdgeInsets.symmetric(vertical: 15),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// --- Glass Card for the floating glassmorphic look ---
class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child, Key? key}) : super(key: key);
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: Colors.white.withOpacity(0.17),
        border: Border.all(color: tiffanyBlue.withOpacity(0.19), width: 1.1),
        boxShadow: [
          BoxShadow(
            color: mintGreen.withOpacity(0.13),
            blurRadius: 7,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 7, sigmaY: 7),
          child: child,
        ),
      ),
    );
  }
}

// --- Animated Mint BG ---
class _AnimatedMintBackground extends StatelessWidget {
  const _AnimatedMintBackground({super.key});
  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.0, end: 1.0),
      duration: const Duration(seconds: 2),
      builder: (context, value, child) => Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              tiffanyBlue,
              mintGreen,
              Colors.white.withOpacity(0.93),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            stops: [0, value, 1],
          ),
        ),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 9, sigmaY: 9),
          child: Container(color: Colors.transparent),
        ),
      ),
    );
  }
}
