// lib/services/gmail_service.dart
import 'dart:convert';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:googleapis/gmail/v1.dart' as gmail;

import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/transaction_item.dart';
import '../models/expense_item.dart';
import '../models/income_item.dart';

import '../services/expense_service.dart';
import '../services/income_service.dart';

// 🔁 cross-source dedupe (same system as SMS)
import './ingest_index_service.dart';
import './tx_key.dart';

// 🧠 Fiinnny Brain
import '../brain/brain_enricher_service.dart';

class GmailService {
  // ====== Behavior toggles ===================================================
  // Recommended for reliability today: write directly here, enrich, skip services.
  // If your ExpenseService/IncomeService MUST run for side-effects, flip BOTH:
  //   USE_DIRECT_WRITES = false; USE_SERVICE_WRITES = true;
  // And make sure your services RESPECT the provided model.id (write to doc(id)).
  static const bool USE_DIRECT_WRITES = true;
  static const bool USE_SERVICE_WRITES = false; // set true only if services use provided ids

  static final _scopes = [
    gmail.GmailApi.gmailReadonlyScope,
  ];

  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: _scopes);
  GoogleSignInAccount? _currentUser;

  final ExpenseService _expenseService = ExpenseService();
  final IncomeService _incomeService = IncomeService();
  final IngestIndexService _index = IngestIndexService();

  static const Map<String, String> keywordCategoryMap = {
    "credit card": "Credit Card",
    "debit card": "Debit Card",
    // Add more as needed
  };

  String _guessCategory(String text) {
    final lower = text.toLowerCase();
    for (final entry in keywordCategoryMap.entries) {
      if (lower.contains(entry.key)) return entry.value;
    }
    return "Other";
  }

  String? _extractCardLast4(String text) {
    final regex = RegExp(r'(?:ending|xx|xxxx|XX|XXXX)\s*([0-9]{4})', caseSensitive: false);
    final match = regex.firstMatch(text);
    return match != null ? match.group(1) : null;
  }

  // --- MAIN FETCH & STORE LOGIC ---
  Future<List<TransactionItem>> fetchAndStoreTransactionsFromGmail(String userId) async {
    _currentUser = await _googleSignIn.signIn();
    if (_currentUser == null) throw Exception("Sign in failed");

    final authHeaders = await _currentUser!.authHeaders;
    final authenticateClient = _GoogleAuthClient(authHeaders);

    final gmailApi = gmail.GmailApi(authenticateClient);

    // Fetch latest 100 emails (targeting banking, cards, etc.)
    final messages = await gmailApi.users.messages.list(
      'me',
      maxResults: 100,
      q: "bank OR transaction OR credited OR debited OR purchase OR spent OR withdrawn OR payment OR UPI OR credit card OR statement OR due",
    );

    List<TransactionItem> transactions = [];
    final Set<String> seen = {}; // intra-batch dedupe (in addition to index)

    if (messages.messages != null) {
      for (var message in messages.messages!) {
        final msg = await gmailApi.users.messages.get('me', message.id!);
        final snippet = msg.snippet ?? '';
        final date = DateTime.fromMillisecondsSinceEpoch(
          int.tryParse(msg.internalDate ?? '0') ??
              DateTime.now().millisecondsSinceEpoch,
        );

        // --- Amount & type detection (quick)
        final amount = _extractAmount(snippet);
        final txType = _deduceTransactionType(snippet);

        // skip if no usable signal
        if (amount == null || txType == null) continue;

        // --- intra-batch dedupe
        final dedupKey = '${amount.toStringAsFixed(2)}|${date.millisecondsSinceEpoch}|$txType';
        if (seen.contains(dedupKey)) continue;
        seen.add(dedupKey);

        // --- cross-source dedupe (align with SMS)
        final last4 = _extractCardLast4(snippet);
        final key = buildTxKey(
          bank: null, // optional; derive later if you add a bank guesser
          amount: amount,
          time: date,
          type: txType,
          last4: last4,
        );
        final claimed = await _index.claim(userId, key, source: 'gmail');
        if (!claimed) continue; // already ingested via SMS/Gmail

        // --- special cases first (statements / spends)
        if (_isCreditCardBill(snippet)) {
          final billAmount = _extractBillAmount(snippet) ?? amount;
          final expRef = FirebaseFirestore.instance
              .collection('users').doc(userId)
              .collection('expenses').doc(); // pre-create id

          final expense = ExpenseItem(
            id: expRef.id,
            type: "Credit Card Bill",
            amount: billAmount,
            note: snippet,
            date: date,
            friendIds: const [],
            groupId: null,
            payerId: userId,
            cardType: "Credit Card",
            cardLast4: last4,
            isBill: true,
          );

          await _writeExpenseWithBrain(userId, expRef, expense);
          // keep UX list
          transactions.add(TransactionItem(
            type: TransactionType.debit,
            amount: billAmount,
            note: snippet,
            date: date,
            category: "Credit Card Bill",
          ));
          continue;
        }

        if (_isCreditCardSpend(snippet) && txType == "debit") {
          final expRef = FirebaseFirestore.instance
              .collection('users').doc(userId)
              .collection('expenses').doc();

          final expense = ExpenseItem(
            id: expRef.id,
            type: "Credit Card",
            amount: amount,
            note: snippet,
            date: date,
            friendIds: const [],
            groupId: null,
            payerId: userId,
            cardType: "Credit Card",
            cardLast4: last4,
            isBill: false,
          );

          await _writeExpenseWithBrain(userId, expRef, expense);
          transactions.add(TransactionItem(
            type: TransactionType.debit,
            amount: amount,
            note: snippet,
            date: date,
            category: "Credit Card",
          ));
          continue;
        }

        // --- generic debit/credit
        final cat = _guessCategory(snippet);

        if (txType == "debit") {
          final expRef = FirebaseFirestore.instance
              .collection('users').doc(userId)
              .collection('expenses').doc();

          final expense = ExpenseItem(
            id: expRef.id,
            type: cat,
            amount: amount,
            note: snippet,
            date: date,
            friendIds: const [],
            groupId: null,
            payerId: userId,
            cardType: cat.contains("Credit Card")
                ? "Credit Card"
                : cat.contains("Debit Card")
                ? "Debit Card"
                : null,
            cardLast4: last4,
            isBill: false,
          );

          await _writeExpenseWithBrain(userId, expRef, expense);

          transactions.add(TransactionItem(
            type: TransactionType.debit,
            amount: amount,
            note: snippet,
            date: date,
            category: cat,
          ));
        } else {
          final incRef = FirebaseFirestore.instance
              .collection('users').doc(userId)
              .collection('incomes').doc();

          final income = IncomeItem(
            id: incRef.id,
            type: cat,
            amount: amount,
            note: snippet,
            date: date,
            source: 'Email',
          );

          await _writeIncomeWithBrain(userId, incRef, income);

          transactions.add(TransactionItem(
            type: TransactionType.credit,
            amount: amount,
            note: snippet,
            date: date,
            category: cat,
          ));
        }
      }
    }
    return transactions;
  }

  // --- Writer helpers: persist + brain enrich, with toggle for services -----
  Future<void> _writeExpenseWithBrain(String userId, DocumentReference expRef, ExpenseItem e) async {
    if (USE_DIRECT_WRITES) {
      await expRef.set(e.toJson(), SetOptions(merge: true));
      final updates = BrainEnricherService().buildExpenseBrainUpdate(e);
      await expRef.set(updates, SetOptions(merge: true));
    }
    if (USE_SERVICE_WRITES) {
      // Requires: ExpenseService.addExpense must respect e.id and write to doc(e.id)
      await _expenseService.addExpense(userId, e);
      final updates = BrainEnricherService().buildExpenseBrainUpdate(e);
      await expRef.set(updates, SetOptions(merge: true));
    }
  }

  Future<void> _writeIncomeWithBrain(String userId, DocumentReference incRef, IncomeItem i) async {
    if (USE_DIRECT_WRITES) {
      await incRef.set(i.toJson(), SetOptions(merge: true));
      final updates = BrainEnricherService().buildIncomeBrainUpdate(i);
      await incRef.set(updates, SetOptions(merge: true));
    }
    if (USE_SERVICE_WRITES) {
      // Requires: IncomeService.addIncome must respect i.id and write to doc(i.id)
      await _incomeService.addIncome(userId, i);
      final updates = BrainEnricherService().buildIncomeBrainUpdate(i);
      await incRef.set(updates, SetOptions(merge: true));
    }
  }

  // --- Helper: Detect Credit Card Bill Statement ---
  bool _isCreditCardBill(String text) {
    return text.contains(RegExp(r'(statement generated|total due|bill amount)', caseSensitive: false))
        && text.contains(RegExp(r'credit card', caseSensitive: false));
  }

  // --- Helper: Detect Credit Card Spend ---
  bool _isCreditCardSpend(String text) {
    return text.contains(RegExp(r'(spent|purchase|charged|payment made|debited)', caseSensitive: false))
        && text.contains(RegExp(r'credit card', caseSensitive: false));
  }

  // --- Helper: Extract Amount for Bill ---
  double? _extractBillAmount(String text) {
    final regex = RegExp(r'(?:Total\sDue|Bill\sAmount|Amount\sDue)[:\s]*[INR|Rs\.|₹]*\s?([\d,]+(?:\.\d{1,2})?)', caseSensitive: false);
    final match = regex.firstMatch(text);
    if (match != null) {
      return double.tryParse(match.group(1)!.replaceAll(",", ""));
    }
    return null;
  }

  double? _extractAmount(String text) {
    final regex = RegExp(r'(?:INR|Rs\.?|₹|\$|USD|EUR|GBP|AED)\s?([\d,]+(?:\.\d{1,2})?)', caseSensitive: false);
    final match = regex.firstMatch(text);
    if (match != null) {
      return double.tryParse(match.group(1)!.replaceAll(",", ""));
    }
    return null;
  }

  // --- Helper: Detect and strictly label transaction type ---
  String? _deduceTransactionType(String text) {
    final isDebit = text.contains(RegExp(
        r'(debited|spent|withdrawn|purchase|paid|transferred|used for payment|deducted|ATM withdrawal)',
        caseSensitive: false));
    final isCredit = text.contains(RegExp(
        r'(credited|received|deposited|salary|refund|interest credited|cashback)',
        caseSensitive: false));

    if (isDebit && !isCredit) return "debit";
    if (isCredit && !isDebit) return "credit";
    if (isDebit && isCredit) {
      final debitIdx = text.indexOf(RegExp(
          r'(debited|spent|withdrawn|purchase|paid|transferred|used for payment|deducted|ATM withdrawal)', caseSensitive: false));
      final creditIdx = text.indexOf(RegExp(
          r'(credited|received|deposited|salary|refund|interest credited|cashback)', caseSensitive: false));
      if (debitIdx >= 0 && creditIdx >= 0) {
        return (debitIdx < creditIdx) ? "debit" : "credit";
      }
    }
    return null; // Unknown
  }

  Future<void> signOut() async {
    await _googleSignIn.signOut();
    _currentUser = null;
  }
}

class _GoogleAuthClient extends http.BaseClient {
  final Map<String, String> _headers;
  final http.Client _client = http.Client();

  _GoogleAuthClient(this._headers);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    return _client.send(request..headers.addAll(_headers));
  }
}
