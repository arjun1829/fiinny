import 'package:flutter/material.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';
import '../../models/friend_model.dart';
import '../../themes/tokens.dart';
import '../widgets/dashboard/bank_cards_carousel.dart';
import '../widgets/unified_transaction_list.dart';
import '../widgets/dashboard/transaction_modal.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../services/expense_service.dart';

class BankDetailsScreen extends StatefulWidget {
  final List<ExpenseItem> allExpenses;
  final List<IncomeItem> allIncomes;
  final String userPhone;
  final String userName;
  final String? initialBankSlug;

  const BankDetailsScreen({
    Key? key,
    required this.allExpenses,
    required this.allIncomes,
    required this.userPhone,
    required this.userName,
    this.initialBankSlug,
  }) : super(key: key);

  @override
  State<BankDetailsScreen> createState() => _BankDetailsScreenState();
}

class _BankDetailsScreenState extends State<BankDetailsScreen> {
  String? _selectedSlug;
  Map<String, FriendModel> _friendsMap = {};

  @override
  void initState() {
    super.initState();
    _selectedSlug = widget.initialBankSlug;
    _fetchFriends();
  }

  Future<void> _fetchFriends() async {
    // Basic friend fetching if needed for UnifiedTransactionList
    // Ideally this should be passed in or handled by a provider
    try {
      final snap = await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userPhone)
          .collection('friends')
          .get();
      final map = <String, FriendModel>{};
      for (var doc in snap.docs) {
        final f = FriendModel.fromMap(doc.data());
        map[doc.id] = f;
      }
      if (mounted) setState(() => _friendsMap = map);
    } catch (_) {}
  }

  void _onCardSelected(String slug) {
    setState(() {
      if (_selectedSlug == slug) {
        _selectedSlug = null; // toggle off
      } else {
        _selectedSlug = slug;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    // Filter transactions
    final filteredExpenses = widget.allExpenses.where((e) {
      if (_selectedSlug == null) return true;
      if (e.issuerBank == null) return false;
      return BankCardsCarousel.slugBankStatic(e.issuerBank!) == _selectedSlug;
    }).toList();

    final filteredIncomes = widget.allIncomes.where((i) {
      if (_selectedSlug == null) return true;
      if (i.issuerBank == null) return false;
      return BankCardsCarousel.slugBankStatic(i.issuerBank!) == _selectedSlug;
    }).toList();

    return Scaffold(
      backgroundColor: Colors.grey[50], // Light background
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: const BackButton(color: Colors.black),
        title: Text("My Wallet", style: Fx.title.copyWith(fontSize: 20)),
        centerTitle: true,
      ),
      body: Column(
        children: [
          // Carousel
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: BankCardsCarousel(
              expenses: widget.allExpenses, // Pass ALL to render cards
              incomes: widget.allIncomes,
              userName: widget.userName,
              onAddCard: () {}, // TODO
              selectedBankSlug: _selectedSlug,
              onCardSelected: _onCardSelected,
            ),
          ),

          Expanded(
            child: Container(
              color: Colors.white,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: Text(
                      _selectedSlug == null
                          ? "All Transactions"
                          : "Transactions • ${_selectedSlug?.toUpperCase()}",
                      style: Fx.h6.copyWith(fontWeight: FontWeight.bold),
                    ),
                  ),
                  Expanded(
                    child: UnifiedTransactionList(
                      expenses: filteredExpenses,
                      incomes: filteredIncomes,
                      friendsById: _friendsMap,
                      userPhone: widget.userPhone,
                      previewCount: 100, // Show more in details
                      enableScrolling:
                          true, // Allow internal scroll since we are in a Column (expanded)
                      // Add edit handlers
                      onEdit: (tx) async {
                        // Open edit modal
                        if (tx is ExpenseItem) {
                          await showModalBottomSheet(
                            context: context,
                            isScrollControlled: true,
                            builder: (_) => TransactionModal(
                              expense: tx,
                              userPhone: widget.userPhone,
                              onSave: (updated) => ExpenseService()
                                  .updateExpense(widget.userPhone, updated),
                              onDelete: (id) => ExpenseService()
                                  .deleteExpense(widget.userPhone, id),
                            ),
                          );
                          setState(
                              () {}); // Refresh local if possible, but simpler to rely on parent rebuild or stream
                          // For minimal changes, we might need to handle state updates.
                          // However, UnifiedTransactionList is stateless regarding *data*, it takes list.
                          // If we update data in backend, this screen won't auto-refresh unless we re-fetch or use a Stream.
                          // For now, assume parent rebuilds or we trigger a refresh callback if needed.
                        }
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
