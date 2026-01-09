import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';
import '../services/expense_service.dart';
import '../services/income_service.dart';
import '../services/credit_card_service.dart';
import '../models/credit_card_model.dart';
import '../themes/tokens.dart';
import '../widgets/dashboard/bank_card_item.dart';
import '../widgets/dashboard/bank_overview_dialog.dart';
import 'credit_cards/add_card_sheet.dart';
import 'credit_cards/card_detail_screen.dart';
import 'package:provider/provider.dart'; // Provider
import '../../services/subscription_service.dart'; // SubscriptionService

class CardsManagementScreen extends StatefulWidget {
  final String userId;

  const CardsManagementScreen({Key? key, required this.userId}) : super(key: key);

  @override
  State<CardsManagementScreen> createState() => _CardsManagementScreenState();
}

class _CardsManagementScreenState extends State<CardsManagementScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  // ...
  
  void _openUpgrade() {
    Navigator.of(context).pushNamed('/premium');
  }
  bool _loading = true;
  List<ExpenseItem> _expenses = [];
  List<IncomeItem> _incomes = [];
  List<CreditCardModel> _creditCards = [];
  
  // Filter state
  String _filterPeriod = 'Month'; // Default to current month
  DateTimeRange? _customDateRange;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    try {
      final expenses = await ExpenseService().getExpenses(widget.userId);
      final incomes = await IncomeService().getIncomes(widget.userId);
      final cards = await CreditCardService().getUserCards(widget.userId);

      if (!mounted) return;
      setState(() {
        _expenses = expenses;
        _incomes = incomes;
        _creditCards = cards;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error loading data: $e')),
      );
    }
  }

  void _showBankOverview(String bankSlug, String bankName) {
    // Filter expenses/incomes passed to dialog based on current filter?
    // User probably expects to see transactions matching the dashboard filter.
    final range = _getFilterRange();
    
    final filteredEx = _expenses.where((e) {
      if (e.issuerBank?.toLowerCase() != bankSlug.toLowerCase() && 
          e.issuerBank?.toLowerCase() != bankName.toLowerCase()) return false;
      return e.date.isAfter(range.start.subtract(const Duration(seconds: 1))) && 
             e.date.isBefore(range.end.add(const Duration(seconds: 1)));
    }).toList();

    final filteredIn = _incomes.where((i) {
      if (i.issuerBank?.toLowerCase() != bankSlug.toLowerCase() && 
          i.issuerBank?.toLowerCase() != bankName.toLowerCase()) return false;
      return i.date.isAfter(range.start.subtract(const Duration(seconds: 1))) && 
             i.date.isBefore(range.end.add(const Duration(seconds: 1)));
    }).toList();

    showDialog(
      context: context,
      builder: (_) => BankOverviewDialog(
        bankSlug: bankSlug,
        bankName: bankName,
        allExpenses: filteredEx,
        allIncomes: filteredIn,
        userPhone: widget.userId,
        userName: 'User',
      ),
    );
  }

  DateTimeRange _getFilterRange() {
    final now = DateTime.now();
    if (_customDateRange != null) {
      return _customDateRange!;
    }
    switch (_filterPeriod) {
      case 'Day':
        final d = DateTime(now.year, now.month, now.day);
        return DateTimeRange(start: d, end: d.add(const Duration(days: 1)).subtract(const Duration(milliseconds: 1)));
      case 'Week':
         final start = now.subtract(Duration(days: now.weekday - 1));
         final end = start.add(const Duration(days: 6));
         return DateTimeRange(start: DateTime(start.year, start.month, start.day), end: DateTime(end.year, end.month, end.day, 23, 59, 59));
      case 'Month':
        final start = DateTime(now.year, now.month, 1);
        final end = DateTime(now.year, now.month + 1, 0, 23, 59, 59);
        return DateTimeRange(start: start, end: end);
      case 'Year':
        final start = DateTime(now.year, 1, 1);
        final end = DateTime(now.year, 12, 31, 23, 59, 59);
        return DateTimeRange(start: start, end: end);
      case 'All':
      default:
        return DateTimeRange(start: DateTime(2000), end: DateTime(2100));
    }
  }

  List<ExpenseItem> _getFilteredExpenses() {
    final range = _getFilterRange();
    return _expenses.where((e) => 
      e.date.isAfter(range.start.subtract(const Duration(seconds: 1))) && 
      e.date.isBefore(range.end.add(const Duration(seconds: 1)))
    ).toList();
  }

  List<IncomeItem> _getFilteredIncomes() {
    final range = _getFilterRange();
    return _incomes.where((i) => 
      i.date.isAfter(range.start.subtract(const Duration(seconds: 1))) && 
      i.date.isBefore(range.end.add(const Duration(seconds: 1)))
    ).toList();
  }

  Future<void> _showFilterSheet() async {
    await showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Container(height: 4, width: 40, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 12),
            const Text('Select Period', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 12),
            ...['Day', 'Week', 'Month', 'Year', 'All'].map((p) => ListTile(
              title: Text(p),
              trailing: _filterPeriod == p ? const Icon(Icons.check, color: Fx.mintDark) : null,
              onTap: () {
                setState(() {
                  _filterPeriod = p;
                  _customDateRange = null;
                });
                Navigator.pop(context);
              },
            )),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredExpenses = _getFilteredExpenses();
    final filteredIncomes = _getFilteredIncomes();

    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        title: const Text('My Cards', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        elevation: 0,
        actions: [
          TextButton.icon(
            onPressed: _showFilterSheet,
            icon: const Icon(Icons.calendar_today, size: 16),
            label: Text(_filterPeriod),
            style: TextButton.styleFrom(foregroundColor: Colors.black87),
          ),
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Add Card', 
            onPressed: () async {
              final sub = Provider.of<SubscriptionService>(context, listen: false);
              // Free limit: 1 card
              if (!sub.isPremium && _creditCards.isNotEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: const Text("Free plan limit reached (1 card). Upgrade to add more."),
                    action: SnackBarAction(label: "Upgrade", onPressed: _openUpgrade),
                  ),
                );
                return;
              }

              // Simple add card sheet for credit cards
              final added = await showModalBottomSheet<bool>(
                context: context,
                isScrollControlled: true,
                useSafeArea: true,
                builder: (_) => AddCardSheet(userId: widget.userId),
              );
              if (added == true) _loadData();
            },
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          labelColor: Fx.mintDark,
          unselectedLabelColor: Colors.grey,
          indicatorColor: Fx.mintDark,
          indicatorWeight: 3,
          tabs: const [
            Tab(text: 'All'),
            Tab(text: 'Credit Cards'),
            Tab(text: 'Debit Cards'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _AllCardsTab(
                  expenses: filteredExpenses,
                  incomes: filteredIncomes,
                  onCardTap: _showBankOverview,
                ),
                _CreditCardsTab(
                  cards: _creditCards,
                  expenses: filteredExpenses, // Pass filtered expenses
                  userId: widget.userId,
                  onRefresh: _loadData,
                  onCardTap: (card) {
                     // Filter transactions for this card
                     final cardTxs = filteredExpenses.where((e) => 
                        e.issuerBank?.toLowerCase() == card.bankName.toLowerCase() &&
                        (e.cardLast4 == card.last4Digits)
                     ).toList();

                     // Navigate to detail screen 
                     Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => CardDetailScreen(
                          userId: widget.userId,
                          card: card,
                          recentTransactions: cardTxs,
                        ),
                      ),
                    ).then((_) => _loadData());
                  },
                ),
                _DebitCardsTab(
                  expenses: filteredExpenses,
                  incomes: filteredIncomes,
                  onCardTap: _showBankOverview,
                ),
              ],
            ),
    );
  }
}

// All Cards Tab
class _AllCardsTab extends StatelessWidget {
  final List<ExpenseItem> expenses;
  final List<IncomeItem> incomes;
  final Function(String slug, String name) onCardTap;

  const _AllCardsTab({
    required this.expenses,
    required this.incomes,
    required this.onCardTap,
  });

  @override
  Widget build(BuildContext context) {
    final allCards = _groupByCard();

    if (allCards.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
             Icon(Icons.credit_card_off_outlined, size: 64, color: Colors.grey[300]),
             const SizedBox(height: 16),
             const Text("No active cards found from transactions", style: TextStyle(color: Colors.grey)),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: allCards.length,
      separatorBuilder: (_, __) => const SizedBox(height: 16),
      itemBuilder: (context, index) {
        final card = allCards[index];
        return Center( // Center to handle width within list
          child: BankCardItem(
            bankName: card.bank,
            cardType: card.type,
            last4: card.last4,
            holderName: 'USER', // Placeholder until profile data is linked
            colorTheme: _getColorForBank(card.bank),
            stats: BankStats(
              totalDebit: card.debit,
              totalCredit: card.credit,
              txCount: card.txCount,
            ),
            onTap: () => onCardTap(card.bank, card.bank),
          ),
        );
      },
    );
  }

  String _getColorForBank(String bankName) {
    final b = bankName.toLowerCase();
    if (b.contains('hdfc')) return 'blue';
    if (b.contains('icici')) return 'red';
    if (b.contains('sbi')) return 'blue';
    if (b.contains('axis')) return 'purple';
    if (b.contains('kotak')) return 'red';
    if (b.contains('amex')) return 'blue';
    return 'black'; // default
  }

  List<_CardGroup> _groupByCard() {
    final map = <String, _CardGroup>{};

    for (var e in expenses) {
      if (e.issuerBank == null) continue;
      final key = '${e.issuerBank}_${e.cardLast4 ?? "XXXX"}';
      final group = map.putIfAbsent(
        key,
        () => _CardGroup(
          bank: e.issuerBank!,
          last4: e.cardLast4 ?? 'XXXX',
          type: e.instrument ?? 'Card',
        ),
      );
      group.debit += e.amount;
      group.txCount++;
    }

    // Incomes usually don't have card last4, but we group by bank
    for (var i in incomes) {
      if (i.issuerBank == null) continue;
      // We try to match existing group for this bank if possible, 
      // otherwise make a generic one. 
      // Simplification: match generic bank group if specific card not mapped? 
      // For now, let's just make a generic 'XXXX' entry if not exists
      final key = '${i.issuerBank}_XXXX';
      /* 
       * Logic Adjustment: 
       * If we have multiple cards for HDFC, income just says "HDFC".
       * We can't easily attribute income to a specific card unless parsed.
       * So we might create a separate "HDFC Generic" card view or just list it.
       */
      final group = map.putIfAbsent(
        key,
        () => _CardGroup(
          bank: i.issuerBank!,
          last4: 'XXXX',
          type: i.instrument ?? 'Bank Account',
        ),
      );
      group.credit += i.amount;
      group.txCount++;
    }

    return map.values.toList()..sort((a, b) => b.txCount.compareTo(a.txCount));
  }
}

// Credit Cards Tab
class _CreditCardsTab extends StatelessWidget {
  final List<CreditCardModel> cards;
  final List<ExpenseItem> expenses;
  final String userId;
  final VoidCallback onRefresh;
  final Function(CreditCardModel) onCardTap;

  const _CreditCardsTab({
    required this.cards,
    required this.expenses,
    required this.userId,
    required this.onRefresh,
    required this.onCardTap,
  });

  @override
  Widget build(BuildContext context) {
    // 1. Get manually added cards
    final manualCards = cards;

    // 2. Derive inferred cards from expenses
    final inferredCards = _deriveInferredCards();

    // 3. Merge: prefer manual card if last4 matches
    final mergedCards = <CreditCardModel>[...manualCards];
    
    for (var inferred in inferredCards) {
      final exists = mergedCards.any((m) => 
        m.last4Digits == inferred.last4Digits && 
        m.bankName.toLowerCase() == inferred.bankName.toLowerCase()
      );
      if (!exists) {
        mergedCards.add(inferred);
      }
    }

    if (mergedCards.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.credit_card_outlined, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            const Text('No credit cards found'),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () async {
                final added = await showModalBottomSheet<bool>(
                  context: context,
                  isScrollControlled: true,
                  useSafeArea: true,
                  builder: (_) => AddCardSheet(userId: userId),
                );
                if (added == true) onRefresh();
              },
              icon: const Icon(Icons.add),
              label: const Text('Add Credit Card'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Fx.mintDark,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: mergedCards.length,
      separatorBuilder: (_, __) => const SizedBox(height: 16),
      itemBuilder: (context, index) {
        final card = mergedCards[index];
        final stats = _calcStats(card);

        // Check if it's a "real" manual card (has ID) or inferred (ID starts with 'inferred_')
        // We can show a badge or "Add" button for inferred ones if we want, but for now just show them.
        
        return Center(
          child: BankCardItem(
            bankName: card.bankName,
            cardType: card.cardType.isNotEmpty ? card.cardType : 'Credit Card',
            last4: card.last4Digits,
            holderName: card.cardholderName.isNotEmpty ? card.cardholderName : 'USER',
            expiry: '12/28', 
            colorTheme: _getColorForBank(card.bankName),
            stats: stats,
            onTap: () => onCardTap(card),
          ),
        );
      },
    );
  }

  List<CreditCardModel> _deriveInferredCards() {
    final Map<String, CreditCardModel> map = {};

    for (var e in expenses) {
      if (e.issuerBank == null) continue;
      // Must be credit
      final isCredit = e.instrument?.toLowerCase().contains('credit') ?? false;
      if (!isCredit) continue;

      final last4 = e.cardLast4 ?? 'XXXX';
      final bank = e.issuerBank!;
      final key = '${bank}_$last4';

      if (!map.containsKey(key)) {
        map[key] = CreditCardModel(
          id: 'inferred_$key',
          bankName: bank,
          cardType: 'Credit Card',
          last4Digits: last4,
          cardholderName: 'USER',
          dueDate: DateTime.now().add(const Duration(days: 30)), // Placeholder
          totalDue: 0,
          minDue: 0,
        );
      }
    }
    return map.values.toList();
  }

  BankStats _calcStats(CreditCardModel card) {
    double debit = 0;
    int count = 0;
    for (var e in expenses) {
      // Loose matching
      if (e.issuerBank?.toLowerCase() == card.bankName.toLowerCase() &&
          e.cardLast4 == card.last4Digits) {
        debit += e.amount;
        count++;
      }
    }
    return BankStats(totalDebit: debit, totalCredit: 0, txCount: count);
  }

  String _getColorForBank(String bankName) {
    final b = bankName.toLowerCase();
    if (b.contains('axis')) return 'purple';
    if (b.contains('hdfc')) return 'blue';
    if (b.contains('icici')) return 'red';
    if (b.contains('sbi')) return 'blue';
    if (b.contains('kotak')) return 'red';
    return 'black';
  }
}

// Debit Cards Tab
class _DebitCardsTab extends StatelessWidget {
  final List<ExpenseItem> expenses;
  final List<IncomeItem> incomes;
  final Function(String slug, String name) onCardTap;

  const _DebitCardsTab({
    required this.expenses,
    required this.incomes,
    required this.onCardTap,
  });

  @override
  Widget build(BuildContext context) {
    final debitCards = _groupByDebitCard();

    if (debitCards.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
             Icon(Icons.credit_card_off_outlined, size: 64, color: Colors.grey[300]),
             const SizedBox(height: 16),
             const Text("No debit card transactions found", style: TextStyle(color: Colors.grey)),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: debitCards.length,
      separatorBuilder: (_, __) => const SizedBox(height: 16),
      itemBuilder: (context, index) {
        final card = debitCards[index];
        return Center(
          child: BankCardItem(
            bankName: card.bank,
            cardType: 'Debit Card',
            last4: card.last4,
            holderName: 'USER',
            colorTheme: _getColorForBank(card.bank),
            stats: BankStats(
              totalDebit: card.debit,
              totalCredit: 0,
              txCount: card.txCount,
            ),
             onTap: () => onCardTap(card.bank, card.bank),
          ),
        );
      },
    );
  }

  String _getColorForBank(String bankName) {
    final b = bankName.toLowerCase();
    if (b.contains('sbi')) return 'blue';
    if (b.contains('kotak')) return 'red';
    if (b.contains('icici')) return 'red';
    return 'green';
  }

  List<_CardGroup> _groupByDebitCard() {
    final map = <String, _CardGroup>{};

    for (var e in expenses) {
      // Must have bank
      if (e.issuerBank == null) continue;
      // Skip if explicitly Credit Card
      if (e.instrument?.toLowerCase().contains('credit') ?? false) continue;
      
      final key = '${e.issuerBank}_${e.cardLast4 ?? "XXXX"}';
      
      /*
       * Heuristic: If we don't know it's credit, and it has a bank, 
       * we treat it as debit/account for now or just generic.
       * The filter says "Debit Cards", so ideally we check for "Debit".
       * If instrument is null, we might include it or exclude it. 
       * Let's include for visibility but maybe label generic.
       */

      final group = map.putIfAbsent(
        key,
        () => _CardGroup(
          bank: e.issuerBank!,
          last4: e.cardLast4 ?? 'XXXX',
          type: e.instrument ?? 'Debit Card',
        ),
      );
      group.debit += e.amount;
      group.txCount++;
    }

    return map.values.toList()..sort((a, b) => b.txCount.compareTo(a.txCount));
  }
}

class _CardGroup {
  final String bank;
  final String last4;
  final String type;
  double debit = 0;
  double credit = 0;
  int txCount = 0;

  _CardGroup({
    required this.bank,
    required this.last4,
    required this.type,
  });
}
