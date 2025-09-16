import 'dart:math';
import '../../models/parsed_transaction.dart';
import '../../models/expense_item.dart';
import '../../models/income_item.dart';
import '../ingest_index_service.dart';
import '../expense_service.dart';
import '../income_service.dart';

class GmailMapper {
  static bool isExpense(ParsedTransaction p) => p.direction == TxDirection.debit;

  static ExpenseItem toExpense(ParsedTransaction p, {required String userPhone}) {
    final amount = p.amountPaise / 100.0;
    final note = p.merchantName.isNotEmpty ? p.merchantName : (p.meta['subject'] ?? 'Transaction');
    final cat  = p.categoryHint.isNotEmpty ? p.categoryHint : 'Other';

    String? cardType;
    String? cardLast4;
    if (p.channel == TxChannel.card && p.instrumentHint.startsWith('CARD:')) {
      cardType = 'Credit Card'; // heuristic; debit vs credit card can be improved by patterns
      cardLast4 = p.instrumentHint.split(':').last;
    }

    return ExpenseItem(
      id: '',
      type: cat,
      amount: amount,
      note: note,
      date: p.occurredAt,
      friendIds: const [],
      payerId: userPhone,
      cardType: cardType,
      cardLast4: cardLast4,
      isBill: false,
      label: 'gmail',                        // provenance
      category: cat,
      bankLogo: p.meta['bankLogo'],          // normalized logo if available
    );
  }

  static IncomeItem toIncome(ParsedTransaction p) {
    final amount = p.amountPaise / 100.0;
    final note = p.merchantName.isNotEmpty ? p.merchantName : (p.meta['subject'] ?? 'Income');
    final cat  = p.categoryHint.isNotEmpty ? p.categoryHint : 'Income';
    return IncomeItem(
      id: '',
      type: cat,
      amount: amount,
      note: note,
      date: p.occurredAt,
      source: 'Email',
      label: 'gmail',
      bankLogo: p.meta['bankLogo'],
    );
  }
}

class FiinnyTransactionWriter {
  final ExpenseService expenseService;
  final IncomeService incomeService;
  final IngestIndexService index;

  FiinnyTransactionWriter({
    required this.expenseService,
    required this.incomeService,
    required this.index,
  });

  /// Idempotent upsert using ingestIndex (no schema change needed)
  Future<void> upsertParsed(String userPhone, ParsedTransaction p) async {
    final key = p.idempotencyKey;

    if (await index.exists(userPhone, key)) return; // duplicate → skip

    if (GmailMapper.isExpense(p)) {
      final e = GmailMapper.toExpense(p, userPhone: userPhone);
      final id = await expenseService.addExpense(userPhone, e);
      await index.record(userPhone, key, type: 'expense', docId: id);
    } else {
      final inc = GmailMapper.toIncome(p);
      final id = await incomeService.addIncome(userPhone, inc);
      await index.record(userPhone, key, type: 'income', docId: id);
    }
  }
}
