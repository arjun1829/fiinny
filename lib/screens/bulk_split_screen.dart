import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../services/friend_service.dart';
import '../services/group_service.dart';
import '../widgets/add_friend_dialog.dart';
import '../widgets/add_group_dialog.dart';
import '../widgets/people_selector_step.dart';

// Use same palette
const Color kBg = Color(0xFFF8FAF9);
const Color kText = Color(0xFF0F1E1C);

class BulkSplitScreen extends StatefulWidget {
  final String userPhone;
  final List<ExpenseItem> expenses;

  const BulkSplitScreen({
    Key? key,
    required this.userPhone,
    required this.expenses,
  }) : super(key: key);

  @override
  State<BulkSplitScreen> createState() => _BulkSplitScreenState();
}

class _BulkSplitScreenState extends State<BulkSplitScreen> {
  // Payer
  String? _selectedPayerPhone;

  // Friends/Group
  final List<String> _selectedFriendPhones = [];
  String? _selectedGroupId;
  List<String> _cachedFriendSelection = [];

  // Controllers
  final _noteCtrl = TextEditingController();
  final _labelCtrl = TextEditingController();
  String? _selectedLabel;

  // Data
  List<FriendModel> _friends = [];
  List<GroupModel> _groups = [];
  List<String> _labels = ['Trip', 'Food', 'Weekend', 'Office', 'Home'];

  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadData();
    // Default payer to user (You) for bulk splits to resolve ambiguity
    _selectedPayerPhone = widget.userPhone;
  }

  Future<void> _loadData() async {
    final fs = context.read<FriendService>();
    final gs = context.read<GroupService>();
    
    // Asynchronous fetch
    final friends = await fs.getAllFriendsForUser(widget.userPhone);
    final groups = await gs.fetchUserGroups(widget.userPhone);

    // Labels mock - normally fetched from existing expenses or prefs
    // For now use static list + unique labels from passed expenses?
    final exist = widget.expenses.map((e) => e.label ?? '').where((l) => l.isNotEmpty).toSet();
    if (exist.isNotEmpty) {
      _labels = {..._labels, ...exist}.toList();
    }

    if (mounted) {
      setState(() {
        _friends = friends;
        _groups = groups;
        _loading = false;
      });
    }
  }

  void _onGroupChanged(String? gId) {
    setState(() {
      _selectedGroupId = gId;
      if (gId != null && gId.isNotEmpty) {
        // Find group members
        final g = _groups.firstWhere((grp) => grp.id == gId, orElse: () => GroupModel(id: '', name: '', memberPhones: [], createdBy: '', createdAt: DateTime.now()));
        _selectedFriendPhones.clear();
        _selectedFriendPhones.addAll(g.memberPhones.where((m) => m != widget.userPhone));
      } else {
        // Restore manual selection
        _selectedFriendPhones.clear();
        _selectedFriendPhones.addAll(_cachedFriendSelection);
      }
    });
  }

  void _openAddFriend() async {
    await showDialog(context: context, builder: (_) => AddFriendDialog(userPhone: widget.userPhone));
    // Refresh check handled by stream/provider usually, or reload
    _loadData(); // simple reload
  }

  void _openCreateGroup() async {
    await showDialog(
      context: context,
      builder: (_) => AddGroupDialog(
        userPhone: widget.userPhone,
        allFriends: _friends,
      ),
    );
    _loadData();
  }

  void _onSave() {
    // Validate?
    // At least one split person/group? Or allows resetting to private?
    // If resetting to private: friends empty, group null.
    
    final result = BulkSplitResult(
      friendIds: _selectedFriendPhones,
      groupId: _selectedGroupId,
      payerPhone: _selectedPayerPhone,
      note: _noteCtrl.text.trim().isEmpty ? null : _noteCtrl.text.trim(),
      label: _labelCtrl.text.trim().isNotEmpty ? _labelCtrl.text.trim() : _selectedLabel,
    );
    Navigator.pop(context, result);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: kBg,
        leading: IconButton(
          icon: const Icon(Icons.close, color: kText),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Bulk Split (${widget.expenses.length})',
            style: const TextStyle(color: kText, fontWeight: FontWeight.w700)),
        actions: [
          TextButton(
            onPressed: _loading || _saving ? null : _onSave,
            child: const Text('Apply', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          )
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              child: PeopleSelectorStep(
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
                    if ((_selectedGroupId ?? '').isEmpty) {
                      _cachedFriendSelection = List<String>.from(_selectedFriendPhones);
                    }
                  });
                },
                groups: _groups,
                selectedGroupId: _selectedGroupId,
                onGroup: _onGroupChanged,
                onAddFriend: _openAddFriend,
                onCreateGroup: _openCreateGroup,
                noteCtrl: _noteCtrl,
                isActive: true,
                labels: _labels,
                selectedLabel: _selectedLabel,
                onLabelSelect: (v) => setState(() {
                  _selectedLabel = v;
                  if (v != null) _labelCtrl.clear();
                }),
                labelCtrl: _labelCtrl,
                onNext: _onSave,
                onBack: () => Navigator.pop(context),
                saving: _saving,
              ),
            ),
    );
  }
}

class BulkSplitResult {
  final List<String> friendIds;
  final String? groupId;
  final String? payerPhone;
  final String? note; // Only set if user typed something
  final String? label;

  BulkSplitResult({
    required this.friendIds,
    this.groupId,
    this.payerPhone,
    this.note,
    this.label,
  });
}
