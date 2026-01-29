import 'package:flutter/material.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';
import '../../models/bank_account_model.dart';
import '../../models/credit_card_model.dart';
import '../../themes/tokens.dart';
import 'bank_card_item.dart';

class BankCardsCarousel extends StatefulWidget {
  final List<ExpenseItem> expenses;
  final List<IncomeItem> incomes;
  final String userName;
  final VoidCallback onAddCard;
  final Function(String slug)? onCardSelected;
  final String? selectedBankSlug;
  final VoidCallback? onViewAll;

  // Phase 4: Real Models
  final List<BankAccountModel>? bankAccounts;
  final List<CreditCardModel>? creditCards;

  const BankCardsCarousel({
    super.key,
    required this.expenses,
    required this.incomes,
    required this.userName,
    required this.onAddCard,
    this.onCardSelected,
    this.selectedBankSlug,
    this.onViewAll,
    this.bankAccounts,
    this.creditCards,
  });

  static String slugBankStatic(String bankName) {
    return bankName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '_');
  }

  @override
  State<BankCardsCarousel> createState() => _BankCardsCarouselState();
}

class _BankCardsCarouselState extends State<BankCardsCarousel> {
  List<_BankGroup> _groups = [];

  @override
  void initState() {
    super.initState();
    _processGroups();
  }

  @override
  void didUpdateWidget(covariant BankCardsCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.expenses != widget.expenses ||
        oldWidget.incomes != widget.incomes) {
      _processGroups();
    }
  }

  void _processGroups() {
    final map = <String, _BankGroup>{};

    void add({
      required double amount,
      required bool isDebit,
      String? bank,
      String? type,
      String? last4,
      String? network,
      double? balance,
      String? balanceLabel,
    }) {
      if (bank == null || bank.trim().isEmpty) return;
      final bankKey = _slugBank(bank);

      // Create or get group
      final group = map.putIfAbsent(
          bankKey,
          () => _BankGroup(
                bankName: bank.trim(),
                cardType: type ?? 'Card',
                last4: last4 ?? 'XXXX',
                logoAsset: _bankLogoAsset(bank, network: network),
                balance: balance,
                balanceLabel: balanceLabel,
              ));

      // Update balance info if not already set (e.g. if we encountered model first)
      if (group.balance == null && balance != null) {
        group.balance = balance;
        group.balanceLabel = balanceLabel;
      }

      if (amount > 0) {
        if (isDebit) {
          group.stats.totalDebit += amount;
          group.stats.debitCount++;
        } else {
          group.stats.totalCredit += amount;
          group.stats.creditCount++;
        }
        group.stats.totalTxCount++;
        group.stats.totalAmount += amount;
      }
    }

    // 1. Process Real Bank Accounts
    if (widget.bankAccounts != null) {
      for (var acc in widget.bankAccounts!) {
        // acc is BankAccountModel (dynamic access or cast)
        // assuming dynamic access for now to avoid extensive imports/casting issues if types missing
        add(
          amount: 0,
          isDebit: false,
          bank: acc.bankName,
          type: "Bank Account",
          last4: acc.last4Digits,
          balance: acc.currentBalance,
          balanceLabel: "Available",
        );
      }
    }

    // 2. Process Real Credit Cards
    if (widget.creditCards != null) {
      for (var card in widget.creditCards!) {
        // card is CreditCardModel
        add(
          amount: 0,
          isDebit: false,
          bank: card.bankName,
          type: "Credit Card",
          last4: card.last4Digits,
          balance: card.currentBalance, // This is usually outstanding
          balanceLabel: "Outstanding",
        );
      }
    }

    // 3. Process Transactions (for history stats)
    for (var e in widget.expenses) {
      add(
        amount: e.amount,
        isDebit: true,
        bank: e.issuerBank,
        type: e.instrument,
        last4: e.cardLast4,
        network: e.instrumentNetwork,
      );
    }

    for (var i in widget.incomes) {
      add(
        amount: i.amount,
        isDebit: false,
        bank: i.issuerBank,
        type: i.instrument,
        last4: null,
        network: i.instrumentNetwork,
      );
    }

    setState(() {
      _groups = map.values.toList();
    });
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

  String? _bankLogoAsset(String? bank, {String? network}) {
    // Reuse logic from summary card or simplify
    final candidates = <String>[];
    if (bank != null && bank.trim().isNotEmpty) {
      final slug = _slugBank(bank);
      if (slug.isNotEmpty) {
        candidates.addAll([
          'assets/banks/$slug.png',
          'lib/assets/banks/$slug.png',
        ]);
      }
    }
    return candidates.isNotEmpty ? candidates.first : null;
  }

  // Helper to expose slug logic if needed externally

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: InkWell(
                  onTap: widget.onViewAll,
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text("My Cards",
                            style: Fx.title.copyWith(fontSize: 18)),
                        if (widget.onViewAll != null) ...[
                          const SizedBox(width: 6),
                          Icon(
                            Icons.arrow_forward_ios_rounded,
                            size: 16,
                            color: Fx.mintDark,
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: widget.onAddCard,
                icon: const Icon(Icons.add, size: 16),
                label: const Text("Add Card"),
                style: TextButton.styleFrom(
                  foregroundColor: Fx.mintDark,
                  backgroundColor: Fx.mint.withValues(alpha: 0.1),
                  textStyle: const TextStyle(
                      fontWeight: FontWeight.bold, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 200, // Card height + shadow padding
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: _groups.length + 1,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            itemBuilder: (context, index) {
              if (index == _groups.length) {
                // Add Card Placeholder
                return GestureDetector(
                  onTap: widget.onAddCard,
                  child: Container(
                    width: 320,
                    height: 192,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(
                          color: Colors.grey.shade300,
                          width: 2), // Dashed border simulated
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                              color: Colors.grey.shade100,
                              shape: BoxShape.circle),
                          child: Icon(Icons.credit_card,
                              color: Colors.grey.shade400),
                        ),
                        const SizedBox(height: 12),
                        Text("Add your first card",
                            style: TextStyle(
                                color: Colors.grey.shade600,
                                fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                );
              }
              final group = _groups[index];
              final themes = ['black', 'blue'];
              final slug = _slugBank(group.bankName);
              final isSelected = widget.selectedBankSlug == slug;

              // If specific selection is active, maybe dim others?
              // For now, we just pass the tap handler.

              return Container(
                foregroundDecoration:
                    (widget.selectedBankSlug != null && !isSelected)
                        ? BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.5),
                            borderRadius: BorderRadius.circular(24),
                            backgroundBlendMode: BlendMode.saturation,
                          )
                        : null,
                child: BankCardItem(
                  bankName: group.bankName,
                  cardType: group.cardType.contains('Credit')
                      ? 'Credit Card'
                      : 'Debit Card',
                  last4: group.last4,
                  holderName: widget.userName,
                  colorTheme: themes[index % themes.length],
                  logoAsset: group.logoAsset,
                  currentBalance: group.balance,
                  balanceLabel: group.balanceLabel,
                  stats: BankStats(
                    totalDebit: group.stats.totalDebit,
                    totalCredit: group.stats.totalCredit,
                    txCount: group.stats.totalTxCount,
                  ),
                  onTap: () {
                    if (widget.onCardSelected != null) {
                      widget.onCardSelected!(slug);
                    }
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _BankGroupStats {
  double totalDebit = 0;
  double totalCredit = 0;
  double totalAmount = 0;
  int creditCount = 0;
  int debitCount = 0;
  int totalTxCount = 0;
}

class _BankGroup {
  final String bankName;
  final String cardType;
  final String last4;
  final String? logoAsset;
  final _BankGroupStats stats = _BankGroupStats();

  // Phase 4 State
  double? balance;
  String? balanceLabel;

  _BankGroup({
    required this.bankName,
    required this.cardType,
    required this.last4,
    this.logoAsset,
    this.balance,
    this.balanceLabel,
  });
}
