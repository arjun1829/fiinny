import 'package:flutter/material.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';
import '../../themes/tokens.dart';
import '../dashboard/bank_card_item.dart';
import '../unified_transaction_list.dart';
import '../dashboard/transaction_modal.dart';
import '../../services/expense_service.dart';

class BankOverviewDialog extends StatefulWidget {
  final String bankSlug;
  final String bankName;
  final List<ExpenseItem> allExpenses;
  final List<IncomeItem> allIncomes;
  final String userPhone;
  final String userName;

  const BankOverviewDialog({
    Key? key,
    required this.bankSlug,
    required this.bankName,
    required this.allExpenses,
    required this.allIncomes,
    required this.userPhone,
    required this.userName,
  }) : super(key: key);

  @override
  State<BankOverviewDialog> createState() => _BankOverviewDialogState();
}

class _BankOverviewDialogState extends State<BankOverviewDialog> {
  // Unique cards found for this bank
  List<_UniqueCard> _cards = [];
  String? _selectedCardLast4; // If null, show all for this bank

  @override
  void initState() {
    super.initState();
    _processCards();
  }

  void _processCards() {
    // 1. Filter all tx for this bank
    final bankTx = <dynamic>[...widget.allExpenses, ...widget.allIncomes];
    final relevant = bankTx.where((tx) {
      final b = (tx is ExpenseItem) ? tx.issuerBank : (tx as IncomeItem).issuerBank;
      if (b == null) return false;
      return _slugBank(b) == widget.bankSlug;
    }).toList();

    // 2. Group by Last4 + Type to find unique cards
    final Map<String, _UniqueCard> map = {};

    for (var tx in relevant) {
      String? last4;
      String? type;
      String? network;
      double amount = 0;
      bool isDebit = true;

      if (tx is ExpenseItem) {
        last4 = tx.cardLast4;
        type = tx.instrument;
        network = tx.instrumentNetwork;
        amount = tx.amount;
        isDebit = true;
      } else if (tx is IncomeItem) {
        // Incomes might not have cardLast4 populated often, but if they do:
        last4 = null; // Usually we don't track card last4 on income unless parsed
        type = tx.instrument;
        network = tx.instrumentNetwork;
        amount = tx.amount;
        isDebit = false;
      }

      if (last4 == null || last4.isEmpty) continue; // Skip if no card info? Or group into "Unknown"?
      // The screenshot showed specific cards. Let's assume we have last4.

      final key = "$last4-${type ?? 'Unknown'}";
      
      if (!map.containsKey(key)) {
        map[key] = _UniqueCard(
          last4: last4,
          type: type ?? 'Card',
          network: network,
          bankName: widget.bankName,
        );
      }
      
      final c = map[key]!;
      if (isDebit) {
        c.stats.totalDebit += amount;
        c.stats.debitCount++;
      } else {
        c.stats.totalCredit += amount;
        c.stats.creditCount++;
      }
      c.stats.txCount++;
    }

    setState(() {
      _cards = map.values.toList();
      // Sort? Maybe by commonly used?
      _cards.sort((a, b) => b.stats.txCount.compareTo(a.stats.txCount));
    });
  }

  @override
  Widget build(BuildContext context) {
    // Filter for List
    final relevantExpenses = widget.allExpenses.where((e) {
      if (e.issuerBank == null) return false;
      if (_slugBank(e.issuerBank!) != widget.bankSlug) return false;
      if (_selectedCardLast4 != null && e.cardLast4 != _selectedCardLast4) return false;
      return true;
    }).toList();

    final relevantIncomes = widget.allIncomes.where((i) {
      if (i.issuerBank == null) return false;
      if (_slugBank(i.issuerBank!) != widget.bankSlug) return false;
      // Incomes might not have last4, so strict filtering might hide them?
      // For now assume strict filtering if selected.
      if (_selectedCardLast4 != null) return false; 
      return true;
    }).toList();

    final totalTxCount = relevantExpenses.length + relevantIncomes.length;

    return Center(
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: 900, // Max width for web modal feel
          height: MediaQuery.of(context).size.height * 0.85,
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
          decoration: BoxDecoration(
            color: const Color(0xFFF3F4F6), // Gray-100/50ish
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.2),
                blurRadius: 40,
                offset: const Offset(0, 20),
              )
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
                color: Colors.white,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "${widget.bankName.toUpperCase()} Overview",
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            color: Colors.black87,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          "Found ${_cards.length} cards • $totalTxCount transactions",
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[500],
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
              
              const Divider(height: 1),

              // Scrollable Content
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  physics: const BouncingScrollPhysics(),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Grid of Cards
                      if (_cards.isNotEmpty)
                        Wrap(
                          spacing: 24,
                          runSpacing: 24,
                          children: _cards.map((c) {
                             final isSelected = _selectedCardLast4 == c.last4;
                             return GestureDetector(
                               onTap: () {
                                 setState(() {
                                   if (isSelected) _selectedCardLast4 = null;
                                   else _selectedCardLast4 = c.last4;
                                 });
                               },
                               child: AnimatedContainer(
                                  duration: const Duration(milliseconds: 200),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(24),
                                    border: isSelected 
                                      ? Border.all(color: Fx.mint, width: 3)
                                      : Border.all(color: Colors.transparent, width: 3),
                                    boxShadow: isSelected 
                                      ? [BoxShadow(color: Fx.mint.withValues(alpha: 0.3), blurRadius: 12)] 
                                      : [],
                                  ),
                                  child: BankCardItem(
                                    bankName: widget.bankName,
                                    cardType: c.type,
                                    last4: c.last4,
                                    holderName: widget.userName,
                                    // Cycle colors based on index or type?
                                    colorTheme: _getColorForCard(c), 
                                    logoAsset: _getLogoAsset(widget.bankSlug),
                                    stats: BankStats(
                                      totalDebit: c.stats.totalDebit,
                                      totalCredit: c.stats.totalCredit,
                                      txCount: c.stats.txCount,
                                    ),
                                    onTap: () {
                                       setState(() {
                                         if (isSelected) _selectedCardLast4 = null;
                                         else _selectedCardLast4 = c.last4;
                                       });
                                    },
                                  ),
                               ),
                             );
                          }).toList(),
                        ),

                      const SizedBox(height: 40),

                      // Filter Header
                      Text(
                         _selectedCardLast4 == null 
                           ? "All Bank Transactions"
                           : "Transactions • XX${_selectedCardLast4}",
                         style: const TextStyle(
                           fontSize: 18, 
                           fontWeight: FontWeight.bold, 
                           color: Colors.black87
                         ),
                      ),
                      const SizedBox(height: 16),
                      
                      // List
                      Container(
                        decoration: BoxDecoration(
                           color: Colors.white,
                           borderRadius: BorderRadius.circular(16),
                           border: Border.all(color: Colors.grey.shade200),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: UnifiedTransactionList(
                            expenses: relevantExpenses,
                            incomes: relevantIncomes,
                            friendsById: {}, // Pass empty for now or fetch
                            userPhone: widget.userPhone,
                            previewCount: 20,
                            enableScrolling: false, // Let parent scroll
                             onEdit: (tx) async {
                                 if (tx is ExpenseItem) {
                                    await showModalBottomSheet(
                                      context: context,
                                      isScrollControlled: true,
                                      builder: (_) => TransactionModal(
                                        expense: tx,
                                        userPhone: widget.userPhone,
                                        onSave: (updated) => ExpenseService().updateExpense(widget.userPhone, updated),
                                        onDelete: (id) => ExpenseService().deleteExpense(widget.userPhone, id),
                                      ),
                                    );
                                    setState(() {}); 
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
        ),
      ),
    );
  }

  String _slugBank(String s) {
    final x = s.toLowerCase();
    if (x.contains('axis')) return 'axis';
    if (x.contains('hdfc')) return 'hdfc';
    if (x.contains('icici')) return 'icici';
    if (x.contains('kotak')) return 'kotak';
    if (x.contains('sbi') || x.contains('state bank')) return 'sbi';
    if (x.contains('american express') || x.contains('amex')) return 'amex';
    return x.replaceAll(RegExp(r'[^a-z]'), '');
  }

  String? _getLogoAsset(String slug) {
     return 'assets/banks/$slug.png'; // Basic path assumption
  }

  String _getColorForCard(_UniqueCard c) {
    // Just a simple deterministic color picker
    final hash = c.last4.hashCode;
    const themes = ['black', 'blue', 'purple', 'black'];
    return themes[hash % themes.length];
  }
}

class _UniqueCard {
  final String last4;
  final String type;
  final String? network;
  final String bankName;
  final _MutableBankStats stats = _MutableBankStats();

  _UniqueCard({
    required this.last4,
    required this.type,
    this.network,
    required this.bankName,
  });
}

class _MutableBankStats {
  double totalDebit = 0;
  double totalCredit = 0;
  int txCount = 0;
  int debitCount = 0;
  int creditCount = 0;
}
